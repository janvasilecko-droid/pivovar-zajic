"""Přepis přes Claude Code s předplatným (claude_cli.py) a výběr zdroje přepisu."""
from __future__ import annotations

import json
import os
import stat
import sys
from types import SimpleNamespace

import pytest

import claude_cli
import naklady
import ocr
import zpracuj

SCHEMA_ODPOVED = {'zahlavi': '', 'zapati': '', 'tistena_strana': '12', 'text': 'Slad 12 %', 'necitelne': False}


def _falesny_claude(tmp_path, vystup: str, kod: int = 0, stderr: str = '') -> str:
    """Skript `claude`, který uloží argumenty, prostředí a vstup a vypíše `vystup`."""
    skript = tmp_path / 'claude'
    zaznam = tmp_path / 'zaznam.json'
    skript.write_text(
        '#!/usr/bin/env python3\nimport json, os, sys\n'
        f'json.dump({{"argv": sys.argv[1:], "env": dict(os.environ), "stdin": sys.stdin.read(), "cwd": os.getcwd()}}, open({str(zaznam)!r}, "w"))\n'
        f'sys.stdout.write({vystup!r})\nsys.stderr.write({stderr!r})\nsys.exit({kod})\n')
    skript.chmod(skript.stat().st_mode | stat.S_IEXEC)
    return str(skript)


def _vysledek(**kw) -> str:
    data = {'type': 'result', 'subtype': 'success', 'is_error': False, 'result': '',
            'structured_output': SCHEMA_ODPOVED,
            'usage': {'input_tokens': 1500, 'output_tokens': 400, 'cache_read_input_tokens': 0, 'cache_creation_input_tokens': 0}}
    data.update(kw)
    return json.dumps({'type': 'system', 'subtype': 'init'}) + '\n' + json.dumps(data, ensure_ascii=False) + '\n'


def test_prepis_jde_pres_claude_code_bez_nastroju_a_bez_api_klice(tmp_path, monkeypatch):
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-ant-tajny')
    monkeypatch.setenv('BIBLE_KLIC', 'tajny-klic-bible')
    klient = claude_cli.KlientClaudeCode('oauth-token', prikaz=_falesny_claude(tmp_path, _vysledek()))
    try:
        p = ocr.prepis_stranky(klient, b'\xff\xd8jpeg', 'claude-haiku-5-5')
    finally:
        klient.zavri()
    assert (p.text, p.tistena_strana, p.ke_kontrole) == ('Slad 12 %', '12', False)
    assert p.usage['input_tokens'] == 1500 and p.usage['output_tokens'] == 400
    z = json.loads((tmp_path / 'zaznam.json').read_text())
    argv = z['argv']
    assert '-p' in argv and argv[argv.index('--model') + 1] == 'claude-haiku-5-5'
    assert argv[argv.index('--tools') + 1] == ''
    assert '--no-session-persistence' in argv and argv[argv.index('--input-format') + 1] == 'stream-json'
    assert json.loads(argv[argv.index('--json-schema') + 1]) == ocr.SCHEMA
    assert argv[argv.index('--system-prompt') + 1] == ocr.PROMPT
    zprava = json.loads(z['stdin'])
    assert zprava['type'] == 'user'
    bloky = zprava['message']['content']
    assert bloky[0]['type'] == 'image' and bloky[0]['source']['media_type'] == 'image/jpeg' and bloky[1]['type'] == 'text'
    assert z['env']['CLAUDE_CODE_OAUTH_TOKEN'] == 'oauth-token'
    assert 'ANTHROPIC_API_KEY' not in z['env'] and 'BIBLE_KLIC' not in z['env']
    assert z['cwd'] == z['env']['HOME'] != os.getcwd()
    assert not os.path.exists(z['env']['HOME'])   # zavri() složku smazalo


@pytest.mark.parametrize('text,druh', [
    ("You've hit your session limit · resets 3:45pm", 'subscription_limit'),
    ('Weekly limit reached', 'subscription_limit'),
    ('Invalid API key · Please run /login', 'authentication_error'),
    ('OAuth token has expired', 'authentication_error'),
    ('API Error: 529 overloaded_error', 'overloaded_error'),
    ('API Error: 500 Internal server error', 'api_error'),
])
def test_chyba_vysledku_se_prevede_na_druh_a_text_stranky_do_zpravy_nejde(tmp_path, text, druh):
    vystup = _vysledek(is_error=True, subtype='error_during_execution', result=text + ' TAJNY-OBSAH-KNIHY', structured_output=None)
    klient = claude_cli.KlientClaudeCode('t', prikaz=_falesny_claude(tmp_path, vystup, kod=1))
    try:
        with pytest.raises(claude_cli.ChybaClaudeCode) as e:
            ocr.prepis_stranky(klient, b'x', 'claude-haiku-5-5')
    finally:
        klient.zavri()
    assert e.value.type == druh and 'TAJNY-OBSAH' not in str(e.value) and e.value.message == str(e.value)


def test_bez_vysledku_a_chybejici_prikaz(tmp_path):
    klient = claude_cli.KlientClaudeCode('t', prikaz=_falesny_claude(tmp_path, '', kod=1, stderr='Please run /login'))
    with pytest.raises(claude_cli.ChybaClaudeCode) as e:
        ocr.prepis_stranky(klient, b'x', 'm')
    assert e.value.type == 'authentication_error'
    klient.zavri()
    k2 = claude_cli.KlientClaudeCode('t', prikaz=str(tmp_path / 'neni'))
    with pytest.raises(claude_cli.ChybaClaudeCode) as e2:
        ocr.prepis_stranky(k2, b'x', 'm')
    k2.zavri()
    assert e2.value.type == 'not_installed'
    with pytest.raises(ValueError):
        claude_cli.KlientClaudeCode('')


def test_vystup_mimo_schema_jde_ke_kontrole_a_timeout_je_prechodna_chyba(tmp_path):
    vystup = _vysledek(is_error=True, subtype='error_max_structured_output_retries', result='', structured_output=None)
    klient = claude_cli.KlientClaudeCode('t', prikaz=_falesny_claude(tmp_path, vystup, kod=1))
    p = ocr.prepis_stranky(klient, b'x', 'm')
    klient.zavri()
    assert p.ke_kontrole and p.duvod == 'přepis nemá očekávaný tvar'
    skript = tmp_path / 'pomaly'
    skript.write_text('#!/usr/bin/env python3\nimport time; time.sleep(5)\n')
    skript.chmod(0o755)
    pomaly = claude_cli.KlientClaudeCode('t', prikaz=str(skript), timeout=0.3)
    with pytest.raises(claude_cli.ChybaClaudeCode) as e:
        ocr.prepis_stranky(pomaly, b'x', 'm')
    pomaly.zavri()
    assert isinstance(zpracuj.chyba_api(e.value), zpracuj.PrechodnaChyba)


@pytest.mark.parametrize('druh,trida', [
    ('subscription_limit', zpracuj.ZastavitBeh), ('authentication_error', zpracuj.ZastavitBeh),
    ('not_installed', zpracuj.ZastavitBeh), ('not_found_error', zpracuj.ZastavitBeh),
    ('overloaded_error', zpracuj.PrechodnaChyba), ('api_error', zpracuj.PrechodnaChyba),
])
def test_chyby_predplatneho_v_workeru(druh, trida):
    v = zpracuj.chyba_api(claude_cli.ChybaClaudeCode(druh, 'x', None))
    assert isinstance(v, trida)
    if druh == 'subscription_limit':
        assert 'limit předplatného' in str(v)


def test_ucet_predplatneho_eviduje_tokeny_bez_ceny_a_bez_cenniku():
    u = naklady.Ucet(cenik={}, strop_usd=1.0, zdroj='predplatne')
    assert u.pridej('claude-haiku-5-5', {'input_tokens': 1000, 'output_tokens': 500}, zdarma=True) == 0.0
    assert u.utraceno == 0 and u.polozky['claude-haiku-5-5'].vstup == 1000 and not u.prekroceno()
    with pytest.raises(naklady.ChybiCenik):
        u.pridej('claude-haiku-5-5', {'input_tokens': 1})


def test_limit_stran_za_beh_prerusi_davku_a_prepisovac_pocita_zdarma():
    klient = SimpleNamespace(messages=SimpleNamespace(create=lambda **kw: SimpleNamespace(
        content=[SimpleNamespace(type='text', text=json.dumps(SCHEMA_ODPOVED))], stop_reason='end_turn',
        usage=SimpleNamespace(input_tokens=10, output_tokens=5, cache_read_input_tokens=0, cache_creation_input_tokens=0))))
    ucet = naklady.Ucet(cenik={}, strop_usd=5.0, zdroj='predplatne')
    pr = zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet, zdroj='predplatne', limit_stran=2)
    pr.tesseract = False
    pr.prepis(b'a'); pr.prepis(b'b')
    with pytest.raises(zpracuj.PrerusenoDavkou):
        pr.prepis(b'c')
    assert ucet.utraceno == 0 and ucet.polozky['claude-haiku-5-5'].volani == 2


def _volby(**kw):
    """(Prepisovac nebo None, účet) podle zadaných klíčů."""
    ucet = naklady.Ucet(cenik={'claude-haiku-5-5': {'vstup': 1, 'vystup': 5}}, strop_usd=5.0)
    pr, _klient = zpracuj.vyber_prepisovac(
        kw.get('klic'), kw.get('token'), 'claude-haiku-5-5', kw.get('nastaveni', {}), ucet, None,
        klient_api=lambda k: kw.get('api', SimpleNamespace()), klient_predplatne=lambda t: SimpleNamespace(zavri=lambda: None))
    return pr, ucet


def test_vyber_zdroje_prepisu(monkeypatch):
    monkeypatch.setattr(zpracuj.ocr, 'tesseract_k_dispozici', lambda: False)
    assert _volby()[0] is None
    assert _volby(klic='k')[0].zdroj == 'api'
    pr, ucet = _volby(token='t')
    assert pr.zdroj == 'predplatne' and pr.limit_stran == zpracuj.MAX_STRAN_PREDPLATNE and ucet.zdroj == 'predplatne'
    assert _volby(token='t', nastaveni={'max_stran_predplatne': 40})[0].limit_stran == 40
    assert _volby(token='t', nastaveni={'max_stran_predplatne': 0})[0] is None
    # API klíč i token: API má přednost, když jde (levné ověření účtu projde).
    api_ok = SimpleNamespace(messages=SimpleNamespace(create=lambda **kw: SimpleNamespace(
        usage=SimpleNamespace(input_tokens=5, output_tokens=1, cache_read_input_tokens=0, cache_creation_input_tokens=0))))
    assert _volby(klic='k', token='t', api=api_ok)[0].zdroj == 'api'

    class Kredit(Exception):
        status_code, type, message = 402, 'billing_error', 'Your credit balance is too low'

    def selze(**kw):
        raise Kredit()
    api_bez_kreditu = SimpleNamespace(messages=SimpleNamespace(create=selze))
    pr2, ucet2 = _volby(klic='k', token='t', api=api_bez_kreditu)
    assert pr2.zdroj == 'predplatne' and ucet2.zdroj == 'predplatne'
    # Bez tokenu kredit nechá běh čekat jako dřív (výjimka až při over_ucet dokumentu).
    assert _volby(klic='k', api=api_bez_kreditu)[0].zdroj == 'api'


def test_token_se_zbavi_bilych_znaku_a_popis_neprozradi_cely(tmp_path):
    klient = claude_cli.KlientClaudeCode('sk-ant-oat01-abc\n def\r\n', prikaz=_falesny_claude(tmp_path, _vysledek()))
    try:
        ocr.prepis_stranky(klient, b'x', 'm')
        popis = klient.popis_tokenu()
    finally:
        klient.zavri()
    z = json.loads((tmp_path / 'zaznam.json').read_text())
    assert z['env']['CLAUDE_CODE_OAUTH_TOKEN'] == 'sk-ant-oat01-abcdef'
    assert popis.startswith('token 19 znaků, má předponu') and 'abcdef' not in popis and 'sk-ant-oat01' not in popis


def test_popis_tokenu_upozorni_na_cizi_hodnotu_bez_vypsani_znaku():
    klient = claude_cli.KlientClaudeCode('OfqO1uOPJQSjlTajneZnaky')
    try:
        popis = klient.popis_tokenu()
    finally:
        klient.zavri()
    assert 'NEMÁ předponu' in popis and 'OfqO' not in popis
