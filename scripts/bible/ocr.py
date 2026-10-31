"""Přepis naskenované strany přes Claude (Anthropic API) a kontrola Tesseractem.

Rozhodnutí R6 (docs/pivovarska-bible/ROZHODNUTI.md): sken přepíše Claude
Haiku doslova do markdownu; čísla v přepisu se porovnají s nezávislým
čtením Tesseractu. Když nesedí, strana dostane „ke kontrole" — nikdy se
nic tiše nepřepisuje ani nedomýšlí.

Do logu odsud nejde nic z textu stránky (repo i logy Actions jsou veřejné).
"""
from __future__ import annotations

import base64
import json
import re
import shutil
import subprocess
import tempfile
from collections import Counter
from dataclasses import dataclass

PROMPT = """Jsi pečlivý přepisovač stránek odborných pivovarských knih (čeština, němčina, angličtina).
Přepiš stránku z obrázku DOSLOVA, v původním jazyce. Nic nepřekládej, neshrnuj, nedoplňuj ani neopravuj.
- Zachovej odstavce. Nadpis kapitoly napiš jako řádek „# nadpis", podkapitolu „## nadpis" (i s číslem, např. „## 3.2 Rmutování").
- Tabulku přepiš jako Markdown tabulku se všemi řádky a sloupci; čísla a jednotky přesně tak, jak jsou.
- Vzorec přepiš v LaTeXu na samostatný řádek mezi $$ a $$; vzorec uvnitř věty mezi $ a $.
- Popisek obrázku nebo grafu dej na samostatný řádek přesně jako v knize (např. „Obr. 3.2 …"); co je na obrázku, nepopisuj.
- Řecká písmena, indexy, jednotky a značky (°P, °C, %, mg/l, EBC, β) zachovej přesně.
- Nečitelné místo označ [nečitelné] — nikdy ho nehádej.
- Živé záhlaví a zápatí (název knihy či kapitoly nahoře, číslo strany) do textu nepiš; vrať je zvlášť v polích zahlavi a zapati.
- tistena_strana: číslo strany vytištěné na stránce (arabské nebo římské). Když tam žádné není, vrať prázdný řetězec — nehádej."""

SCHEMA = {
    'type': 'object',
    'properties': {
        'zahlavi': {'type': 'string'},
        'zapati': {'type': 'string'},
        'tistena_strana': {'type': 'string'},
        'text': {'type': 'string'},
        'necitelne': {'type': 'boolean'},
    },
    'required': ['zahlavi', 'zapati', 'tistena_strana', 'text', 'necitelne'],
    'additionalProperties': False,
}


@dataclass
class Prepis:
    text: str
    zahlavi: str
    zapati: str
    tistena_strana: str | None
    ke_kontrole: bool
    duvod: str | None
    usage: dict


def usage_jako_dict(usage) -> dict:
    return {
        'input_tokens': getattr(usage, 'input_tokens', 0) or 0,
        'output_tokens': getattr(usage, 'output_tokens', 0) or 0,
        'cache_read_input_tokens': getattr(usage, 'cache_read_input_tokens', 0) or 0,
        'cache_creation_input_tokens': getattr(usage, 'cache_creation_input_tokens', 0) or 0,
    }


def prepis_stranky(klient, obrazek_jpeg: bytes, model: str) -> Prepis:
    """Jedna strana → přepis. Výjimky API (síť, limit) nechává projít — řeší je volající."""
    odpoved = klient.messages.create(
        model=model,
        max_tokens=8000,
        system=PROMPT,
        thinking={'type': 'disabled'},
        output_config={'effort': 'low', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
        messages=[{
            'role': 'user',
            'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg',
                                             'data': base64.standard_b64encode(obrazek_jpeg).decode('ascii')}},
                {'type': 'text', 'text': 'Přepiš tuto stránku.'},
            ],
        }],
    )
    usage = usage_jako_dict(odpoved.usage)
    if odpoved.stop_reason == 'refusal':
        return Prepis('', '', '', None, True, 'model přepis odmítl', usage)
    text_bloku = next((b.text for b in odpoved.content if getattr(b, 'type', '') == 'text'), '')
    try:
        data = json.loads(text_bloku)
    except (json.JSONDecodeError, TypeError):
        return Prepis('', '', '', None, True, 'přepis nemá očekávaný tvar', usage)
    nedokonceny = odpoved.stop_reason == 'max_tokens'
    necitelne = bool(data.get('necitelne'))
    duvod = 'přepis se nevešel do limitu' if nedokonceny else ('část stránky je nečitelná' if necitelne else None)
    return Prepis(
        text=str(data.get('text') or ''),
        zahlavi=str(data.get('zahlavi') or ''),
        zapati=str(data.get('zapati') or ''),
        tistena_strana=(str(data.get('tistena_strana')).strip() or None) if data.get('tistena_strana') else None,
        ke_kontrole=nedokonceny or necitelne,
        duvod=duvod,
        usage=usage,
    )


# --- kontrola čísel nezávislým čtením ---------------------------------------

_CISLO = re.compile(r'\d+(?:[.,]\d+)?')


def cisla(text: str) -> Counter:
    """Čísla v textu, desetinná čárka = tečka („1,5" i „1.5" je totéž)."""
    return Counter(m.group(0).replace(',', '.') for m in _CISLO.finditer(text or ''))


def kontrola_cisel(prepis: str, nezavisle: str) -> tuple[bool, str | None]:
    """Najde nezávislé čtení (Tesseract) čísla z přepisu? (sedí, důvod)

    Tesseract sám čísla občas zkomolí, proto se hlásí až výraznější neshoda:
    aspoň 3 různá čísla a víc než čtvrtina všech. Když Tesseract skoro nic
    nepřečetl, porovnat nejde — to není důvod ke kontrole.
    """
    c = cisla(prepis)
    if not c or len((nezavisle or '').strip()) < 50:
        return True, None
    t = cisla(nezavisle)
    chybi = [x for x in c if x not in t]
    if len(chybi) >= 3 and len(chybi) / len(c) > 0.25:
        return False, f'{len(chybi)} z {len(c)} čísel přepisu nepotvrdilo nezávislé čtení'
    return True, None


def tesseract_k_dispozici() -> bool:
    return shutil.which('tesseract') is not None


def precti_tesseractem(obrazek: bytes, jazyky: str = 'ces+deu+eng') -> str:
    """Nezávislé čtení strany (zdarma, lokálně). Prázdné, když Tesseract chybí nebo selže."""
    if not tesseract_k_dispozici():
        return ''
    with tempfile.NamedTemporaryFile(suffix='.jpg') as soubor:
        soubor.write(obrazek)
        soubor.flush()
        try:
            vystup = subprocess.run(
                ['tesseract', soubor.name, 'stdout', '-l', jazyky, '--psm', '3'],
                capture_output=True, timeout=180, check=False,
            )
        except subprocess.TimeoutExpired:
            return ''
        return vystup.stdout.decode('utf-8', errors='ignore') if vystup.returncode == 0 else ''
