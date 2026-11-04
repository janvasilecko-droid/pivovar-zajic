"""Zařazení knih do tematických oblastí A–T (Claude podle názvu a kapitol).

Majitel 4. 11. 2026 poslal Správu znalostí, kde u všech oblastí svítí 0 —
knihy při nahrání oblasti nedostaly. Worker je doplní: Claude dostane název,
autora a seznam kapitol (žádný text knihy) a vybere oblasti, kterými se kniha
podstatně zabývá. Zapíše se jen ke knize, která oblasti NEMÁ — ruční zařazení
má vždy přednost; v postup se poznamená, že jde o automatické zařazení.
"""
from __future__ import annotations

import json

import ocr

OBLASTI = {
    'A': 'Sladařství a suroviny', 'B': 'Chemie a úprava vody', 'C': 'Šrotování a příprava sladu',
    'D': 'Rmutování a enzymatické procesy', 'E': 'Scezování a vyslazování', 'F': 'Chmelovar',
    'G': 'Chlazení mladiny', 'H': 'Kvašení a kvasinky', 'I': 'Zrání a ležení', 'J': 'Filtrace a stabilizace',
    'K': 'Stáčení a balení', 'L': 'CIP, sanitace a hygiena', 'M': 'Mikrobiologie', 'N': 'Laboratorní analýzy',
    'O': 'Pivovarská zařízení a konstrukce', 'P': 'Čerpadla, potrubí a hydraulika', 'Q': 'Automatizace a řízení',
    'R': 'Energetika a tepelná technika', 'S': 'Ekonomika pivovaru', 'T': 'Řešení technologických problémů',
}
MAX_ZNAKU = 15000

PROMPT = """Zařazuješ odborné pivovarské knihy do tematických oblastí knihovny.
Dostaneš název, autora a seznam kapitol knihy. Vyber oblasti, kterými se kniha PODSTATNĚ zabývá
(má k nim aspoň jednu kapitolu nebo několik podkapitol). Okrajové zmínky nepočítej. Vrať kódy oblastí
(písmena A–T) seřazené od nejdůležitější. Když je kniha obecná učebnice pivovarství, vyber všechny oblasti,
které její kapitoly pokrývají."""

SCHEMA = {
    'type': 'object',
    'properties': {'oblasti': {'type': 'array', 'items': {'type': 'string', 'enum': list(OBLASTI)}}},
    'required': ['oblasti'],
    'additionalProperties': False,
}


def zadani(nazev: str, autor: str | None, kapitoly: list[str]) -> str:
    seznam = '\n'.join(f'- {k}' for k in kapitoly)
    if len(seznam) > MAX_ZNAKU:
        seznam = seznam[:MAX_ZNAKU] + '\n- …'
    oblasti = '\n'.join(f'{k}: {n}' for k, n in OBLASTI.items())
    return (f'Oblasti knihovny:\n{oblasti}\n\nKniha: {nazev}' + (f' ({autor})' if autor else '')
            + f'\n\nKapitoly:\n{seznam or "(kniha nemá rozpoznané kapitoly)"}\n\nKteré oblasti kniha pokrývá?')


def urci(klient, nazev: str, autor: str | None, kapitoly: list[str], model: str) -> tuple[list[str] | None, dict]:
    """(kódy oblastí nebo None, když se to nepovedlo; usage). Výjimky API nechává projít."""
    parametry = {
        'model': model, 'max_tokens': 1000, 'system': PROMPT,
        'output_config': {'effort': 'low', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text': zadani(nazev, autor, kapitoly)}]}],
    }
    mysleni = ocr.mysleni_pro_model(model)
    if mysleni is not None:
        parametry['thinking'] = mysleni
    odpoved = klient.messages.create(**parametry)
    usage = ocr.usage_jako_dict(odpoved.usage)
    if odpoved.stop_reason in ('refusal', 'max_tokens'):
        return None, usage
    blok = next((b.text for b in odpoved.content if getattr(b, 'type', '') == 'text'), '')
    try:
        data = json.loads(blok)
    except (json.JSONDecodeError, TypeError):
        return None, usage
    kody = data.get('oblasti') if isinstance(data, dict) else None
    if not isinstance(kody, list):
        return None, usage
    vysledek: list[str] = []
    for k in kody:
        if isinstance(k, str) and k in OBLASTI and k not in vysledek:
            vysledek.append(k)
    return (vysledek or None), usage
