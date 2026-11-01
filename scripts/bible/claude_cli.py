"""Přepis přes Claude Code s předplatným Claude (Max) místo API kreditu.

1. 11. 2026, majitel: „nechci to dělat přes kredit, mám Claude předplacený"
a „udělej to jinak" (API kredit, který k Maxu patří, jde propojit až po
7 dnech). Claude Code v GitHub Actions s tokenem z `claude setup-token`
(secret CLAUDE_CODE_OAUTH_TOKEN) jede na předplatné — Anthropic to tak pro
Actions popisuje: „If you authenticate with an OAuth token, runs use your
Claude subscription instead of API billing"
(https://code.claude.com/docs/en/github-actions).

KlientClaudeCode napodobuje tu část anthropic.Anthropic, kterou volá ocr.py
(`messages.create` → `content`, `stop_reason`, `usage`), takže přepis,
kontrola čísel i evidence tokenů zůstávají stejné. Jedno volání = jeden
proces `claude -p`:
- bez nástrojů (`--tools ""`) — obsah stránky nemůže nic spustit ani číst;
- vlastní systémový prompt (`--system-prompt`), obrázek jako blok zprávy
  (`--input-format stream-json`), výstup podle schématu (`--json-schema`);
- nic se neukládá na disk (`--no-session-persistence`), proces běží
  v prázdné dočasné složce s vlastním HOME (žádný CLAUDE.md ani nastavení);
- dostane jen nezbytné proměnné prostředí a token — ne ANTHROPIC_API_KEY
  (ten by měl přednost před předplatným) ani klíče workeru.

Text stránky nikdy nejde do logu ani do chybové zprávy: stdout čte jen
program a z chybového výsledku se bere jen druh chyby (repo i logy Actions
jsou veřejné).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
from types import SimpleNamespace

# Proměnné, které proces Claude Code smí vidět (vedle tokenu a HOME/TMPDIR).
_PROMENNE = ('PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS',
             'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy')

# Bez aktualizací, telemetrie a hlášení chyb — v Actions jen přepis.
_TICHO = {
    'DISABLE_AUTOUPDATER': '1',
    'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC': '1',
    'DISABLE_TELEMETRY': '1',
    'DISABLE_ERROR_REPORTING': '1',
}


class ChybaClaudeCode(RuntimeError):
    """Chyba volání Claude Code — tvar jako výjimky anthropic (status_code, type, message).

    `zdroj = 'predplatne'` pozná zpracuj.chyba_api a dá česky zprávu o tokenu
    a limitech předplatného místo zprávy o klíči API.
    """
    zdroj = 'predplatne'

    def __init__(self, druh: str, zprava: str, status: int | None = None):
        super().__init__(zprava)
        self.type = druh
        self.message = zprava
        self.status_code = status


# Druh chyby podle hlášky Claude Code. Do výjimky jde jen druh a pevná věta,
# nikdy text z výsledku (u chyby výstupu by v něm mohl být obsah stránky).
_DRUHY = (
    ('subscription_limit', None, re.compile(
        r"hit your (session |weekly |opus |sonnet |usage )?limit|usage limit|limit reached|session limit|weekly limit|limit will reset|resets? (at|in)",
        re.I)),
    ('authentication_error', 401, re.compile(
        r'invalid api key|please run /login|/login|oauth token|token (has )?expired|not logged in|authenticat|unauthori[sz]ed|\b401\b|\b403\b',
        re.I)),
    ('not_found_error', 404, re.compile(r'model .{0,60}(not found|does not exist|not available)|invalid model|\b404\b', re.I)),
    ('rate_limit_error', 429, re.compile(r'\b429\b|rate.?limit', re.I)),
    ('overloaded_error', 529, re.compile(r'\b529\b|overloaded', re.I)),
    ('api_error', 500, re.compile(r'\b5\d\d\b|api error|internal server error|connection|timed? ?out|network', re.I)),
)

_VETY = {
    'subscription_limit': 'došel limit předplatného Claude',
    'authentication_error': 'Claude Code odmítl přihlášení tokenem',
    'not_found_error': 'Claude Code model nezná',
    'rate_limit_error': 'Claude omezil počet požadavků',
    'overloaded_error': 'Claude je přetížený',
    'api_error': 'Claude je dočasně nedostupný',
}


def druh_chyby(text: str) -> tuple[str, int | None]:
    for druh, status, vzor in _DRUHY:
        if vzor.search(text or ''):
            return druh, status
    return 'api_error', None


def _usage(data: dict | None) -> SimpleNamespace:
    data = data if isinstance(data, dict) else {}
    return SimpleNamespace(**{k: int(data.get(k) or 0) for k in (
        'input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens')})


def _obsah_zpravy(messages: list) -> list:
    """Obsah poslední zprávy uživatele jako bloky (text, obrázek base64) pro stream-json."""
    zprava = next((m for m in reversed(messages or []) if m.get('role') == 'user'), None)
    if zprava is None:
        raise ValueError('chybí zpráva uživatele')
    obsah = zprava.get('content')
    if isinstance(obsah, str):
        return [{'type': 'text', 'text': obsah}]
    bloky = []
    for b in obsah or []:
        if b.get('type') == 'text':
            bloky.append({'type': 'text', 'text': str(b.get('text') or '')})
        elif b.get('type') == 'image' and (b.get('source') or {}).get('type') == 'base64':
            zdroj = b['source']
            bloky.append({'type': 'image', 'source': {
                'type': 'base64', 'media_type': zdroj.get('media_type') or 'image/jpeg', 'data': zdroj.get('data') or ''}})
        else:
            raise ValueError(f'nepodporovaný blok zprávy: {b.get("type")}')
    return bloky


class _Zpravy:
    def __init__(self, klient: 'KlientClaudeCode'):
        self._klient = klient

    def create(self, *, model: str, messages: list, system: str | None = None, max_tokens: int | None = None,
               output_config: dict | None = None, thinking: dict | None = None, **_ignorovat) -> SimpleNamespace:
        return self._klient.zavolej(model=model, messages=messages, system=system, output_config=output_config)


class KlientClaudeCode:
    """Stejné rozhraní jako anthropic.Anthropic pro ocr.py — přes `claude -p` s předplatným."""

    def __init__(self, token: str, prikaz: str | None = None, timeout: float = 300.0, soubezne: int = 2):
        # Token z terminálu se rád zkopíruje s zalomením řádku nebo mezerou — ty do něj nepatří.
        token = re.sub(r'\s+', '', token or '')
        if not token:
            raise ValueError('chybí CLAUDE_CODE_OAUTH_TOKEN')
        self._token = token
        self._prikaz = prikaz or shutil.which('claude') or 'claude'
        self._timeout = timeout
        # Předplatné má vlastní limity — souběžně jen pár procesů (worker pouští víc vláken).
        self._soubeh = threading.BoundedSemaphore(max(1, soubezne))
        self._domov = tempfile.mkdtemp(prefix='bible-claude-')
        os.chmod(self._domov, 0o700)
        self.messages = _Zpravy(self)

    def popis_tokenu(self) -> str:
        """Délka a tvar začátku tokenu pro log (celý token nikdy; začátek `sk-ant-oat01-` tajný není)."""
        return f'token {len(self._token)} znaků, začíná „{self._token[:13]}“'

    def zavri(self) -> None:
        shutil.rmtree(self._domov, ignore_errors=True)

    def _prostredi(self) -> dict[str, str]:
        env = {k: v for k in _PROMENNE if (v := os.environ.get(k)) is not None}
        env.update(_TICHO)
        env['HOME'] = self._domov
        env['TMPDIR'] = self._domov
        env['CLAUDE_CODE_OAUTH_TOKEN'] = self._token
        return env

    def argumenty(self, model: str, system: str | None, schema: dict | None, effort: str | None) -> list[str]:
        args = [self._prikaz, '-p', '--model', model,
                '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
                '--no-session-persistence', '--tools', '',
                '--system-prompt', system or 'Odpovídej stručně.']
        if schema is not None:
            args += ['--json-schema', json.dumps(schema, ensure_ascii=False)]
        if effort:
            args += ['--effort', effort]
        return args

    def zavolej(self, *, model: str, messages: list, system: str | None, output_config: dict | None) -> SimpleNamespace:
        oc = output_config or {}
        fmt = oc.get('format') or {}
        schema = fmt.get('schema') if fmt.get('type') == 'json_schema' else None
        vstup = json.dumps({'type': 'user', 'message': {'role': 'user', 'content': _obsah_zpravy(messages)}},
                           ensure_ascii=False) + '\n'
        args = self.argumenty(model, system, schema, oc.get('effort'))
        with self._soubeh:
            try:
                proces = subprocess.run(args, input=vstup, capture_output=True, text=True, timeout=self._timeout,
                                        env=self._prostredi(), cwd=self._domov, check=False)
            except subprocess.TimeoutExpired:
                raise ChybaClaudeCode('api_error', f'Claude Code neodpověděl do {int(self._timeout)} s', 500) from None
            except FileNotFoundError:
                raise ChybaClaudeCode('not_installed', 'Claude Code není nainstalovaný (příkaz claude chybí)') from None
        return self._vysledek(proces.stdout, proces.stderr, proces.returncode, schema is not None)

    def _vysledek(self, stdout: str, stderr: str, kod: int, se_schematem: bool) -> SimpleNamespace:
        vysledek = None
        for radek in (stdout or '').splitlines():
            radek = radek.strip()
            if not radek.startswith('{'):
                continue
            try:
                zprava = json.loads(radek)
            except json.JSONDecodeError:
                continue
            if isinstance(zprava, dict) and zprava.get('type') == 'result':
                vysledek = zprava
        if vysledek is None:
            druh, status = druh_chyby(stderr or '')
            raise ChybaClaudeCode(druh, f'{_VETY.get(druh, "Claude Code selhal")} (kód {kod}, bez výsledku)', status)
        if vysledek.get('is_error') or str(vysledek.get('subtype') or 'success') != 'success':
            podtyp = str(vysledek.get('subtype') or '')
            if se_schematem and 'structured_output' in podtyp:
                # Výstup neprošel schématem — přepis půjde „ke kontrole" (ocr.py), obsah se nikam nepíše.
                return SimpleNamespace(content=[SimpleNamespace(type='text', text='')], stop_reason='end_turn',
                                       usage=_usage(vysledek.get('usage')))
            text = ' '.join(str(x) for x in (vysledek.get('result'), vysledek.get('error'), stderr) if x)
            druh, status = druh_chyby(text)
            raise ChybaClaudeCode(druh, f'{_VETY.get(druh, "Claude Code selhal")} ({podtyp or "chyba"})', status)
        if se_schematem:
            data = vysledek.get('structured_output')
            text = json.dumps(data, ensure_ascii=False) if isinstance(data, dict) else str(vysledek.get('result') or '')
        else:
            text = str(vysledek.get('result') or '')
        return SimpleNamespace(content=[SimpleNamespace(type='text', text=text)], stop_reason='end_turn',
                               usage=_usage(vysledek.get('usage')))
