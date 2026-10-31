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
import os
import subprocess
import tempfile
from collections import Counter
from dataclasses import dataclass

# Verze promptu a schématu přepisu. Hotové přepisy se stejnou verzí a modelem se
# při dalším zpracování použijí znovu (neplatí se dvakrát); změna promptu = nová verze.
OCR_VERZE = 'prepis-1'

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



# Nativní nástroje (Tesseract, djvulibre) čtou nahrané soubory, kterým nejde
# věřit — dostanou jen tohle prostředí, žádné klíče workeru (BIBLE_KLIC,
# ANTHROPIC_API_KEY…). Chyba v nástroji je tak nevynese.
_PROMENNE_NASTROJU = ('PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TMPDIR', 'TESSDATA_PREFIX', 'OMP_THREAD_LIMIT')


def prostredi_nastroju() -> dict[str, str]:
    return {k: v for k in _PROMENNE_NASTROJU if (v := os.environ.get(k)) is not None}

def usage_jako_dict(usage) -> dict:
    return {
        'input_tokens': getattr(usage, 'input_tokens', 0) or 0,
        'output_tokens': getattr(usage, 'output_tokens', 0) or 0,
        'cache_read_input_tokens': getattr(usage, 'cache_read_input_tokens', 0) or 0,
        'cache_creation_input_tokens': getattr(usage, 'cache_creation_input_tokens', 0) or 0,
    }


def mysleni_pro_model(model: str) -> dict | None:
    """Nejnižší myšlení, které model přijme (přepis je doslovný, přemýšlení netřeba).

    Haiku 5.5 bere {'type': 'disabled'} (při effort nejvýš high); Sonnet 5.5
    ho odmítne s 400 a chce {'type': 'between_tools'}; Opus 5.5 (a Fable)
    myšlení vypnout nedovolí — parametr se vynechá a hloubku řídí effort.
    """
    if model.startswith(('claude-opus-5-5', 'claude-fable')):
        return None
    if model.startswith('claude-sonnet-5-5'):
        return {'type': 'between_tools'}
    return {'type': 'disabled'}


def _zavolej(klient, obrazek_jpeg: bytes, model: str, max_tokens: int):
    parametry = {
        'model': model,
        'max_tokens': max_tokens,
        'system': PROMPT,
        'output_config': {'effort': 'low', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
        'messages': [{
            'role': 'user',
            'content': [
                {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/jpeg',
                                             'data': base64.standard_b64encode(obrazek_jpeg).decode('ascii')}},
                {'type': 'text', 'text': 'Přepiš tuto stránku.'},
            ],
        }],
    }
    mysleni = mysleni_pro_model(model)
    if mysleni is not None:
        parametry['thinking'] = mysleni
    return klient.messages.create(**parametry)


def over_ucet(klient, model: str):
    """Nejlevnější požadavek se stejným modelem a nastavením jako přepis, jen text.

    Projde, když klíč, kredit a model fungují — worker tak pozná problém s účtem
    dřív, než kvůli skenům stáhne celou knihu. Stojí desítky tokenů.
    """
    parametry = {
        'model': model,
        'max_tokens': 16,
        'output_config': {'effort': 'low'},
        'messages': [{'role': 'user', 'content': 'Odpověz jedním slovem: OK'}],
    }
    mysleni = mysleni_pro_model(model)
    if mysleni is not None:
        parametry['thinking'] = mysleni
    return klient.messages.create(**parametry)


def _secti(a: dict, b: dict) -> dict:
    return {k: int(a.get(k) or 0) + int(b.get(k) or 0) for k in set(a) | set(b)}


def prepis_stranky(klient, obrazek_jpeg: bytes, model: str, max_tokens: int = 8000) -> Prepis:
    """Jedna strana → přepis. Výjimky API (síť, limit) nechává projít — řeší je volající.

    Useknutá odpověď (hustá tabulka) se zkusí jednou s dvojnásobným limitem;
    useknutý JSON se nikdy nepoužije jako přepis.
    """
    odpoved = _zavolej(klient, obrazek_jpeg, model, max_tokens)
    usage = usage_jako_dict(odpoved.usage)
    if odpoved.stop_reason == 'max_tokens':
        odpoved = _zavolej(klient, obrazek_jpeg, model, max_tokens * 2)
        usage = _secti(usage, usage_jako_dict(odpoved.usage))
    if odpoved.stop_reason == 'refusal':
        return Prepis('', '', '', None, True, 'model přepis odmítl', usage)
    if odpoved.stop_reason == 'max_tokens':
        return Prepis('', '', '', None, True, 'přepis se nevešel do limitu', usage)
    text_bloku = next((b.text for b in odpoved.content if getattr(b, 'type', '') == 'text'), '')
    try:
        data = json.loads(text_bloku)
    except (json.JSONDecodeError, TypeError):
        return Prepis('', '', '', None, True, 'přepis nemá očekávaný tvar', usage)
    if not isinstance(data, dict):
        return Prepis('', '', '', None, True, 'přepis nemá očekávaný tvar', usage)
    necitelne = bool(data.get('necitelne'))
    return Prepis(
        text=str(data.get('text') or ''),
        zahlavi=str(data.get('zahlavi') or ''),
        zapati=str(data.get('zapati') or ''),
        tistena_strana=(str(data.get('tistena_strana')).strip() or None) if data.get('tistena_strana') else None,
        ke_kontrole=necitelne,
        duvod='část stránky je nečitelná' if necitelne else None,
        usage=usage,
    )


# --- kontrola čísel nezávislým čtením ---------------------------------------

_CISLO = re.compile(r'\d+(?:[.,]\d+)?')


def cisla(text: str) -> Counter:
    """Čísla v textu, desetinná čárka = tečka („1,5" i „1.5" je totéž)."""
    return Counter(m.group(0).replace(',', '.') for m in _CISLO.finditer(text or ''))


def kontrola_cisel(prepis: str, *nezavisle: str) -> tuple[bool, str | None]:
    """Najdou nezávislá čtení (Tesseract, OCR vrstva souboru) čísla z přepisu? (sedí, důvod)

    Číslo je potvrzené, když ho najde aspoň jedno nezávislé čtení. Každé samo
    čísla občas zkomolí, proto se hlásí až výraznější neshoda: aspoň 3 různá
    čísla a víc než čtvrtina všech. Čtení, které skoro nic nepřečetlo, se
    nepočítá; když žádné nezbude, porovnat nejde — to není důvod ke kontrole.
    """
    c = cisla(prepis)
    pouzitelna = [n for n in nezavisle if len((n or '').strip()) >= 50]
    if not c or not pouzitelna:
        return True, None
    t: Counter = Counter()
    for n in pouzitelna:
        t.update(cisla(n))
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
                capture_output=True, timeout=180, check=False, env=prostredi_nastroju(),
            )
        except subprocess.TimeoutExpired:
            return ''
        return vystup.stdout.decode('utf-8', errors='ignore') if vystup.returncode == 0 else ''
