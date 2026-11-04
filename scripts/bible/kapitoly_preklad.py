"""Český překlad názvů kapitol (obsah knihy).

Majitel 3. 11. 2026: „je to anglicky, musí tam být i překlad do češtiny" a 4. 11.
„ať je to funkční jak má". Strany se překládají v preklad.py; tady jen názvy
kapitol po dávkách. Claude vrací seznam stejné délky ve stejném pořadí — když
délka nesedí, dávka se neuloží (zkusí se příštím během), nic se nehádá.
"""
from __future__ import annotations

import json

import ocr

DAVKA = 120
VERZE = 'kapitoly-1'

PROMPT = """Překládáš názvy kapitol a podkapitol odborné pivovarské knihy do spisovné češtiny.
- Přelož každý název zvlášť, ve stejném pořadí; vrať přesně tolik názvů, kolik jich přišlo.
- Čísla kapitol (např. „3.2"), čísla, jednotky a značky ponech přesně.
- Používej české pivovarské názvosloví (malt = slad, mashing = rmutování, wort = mladina/sladina,
  lautering = scezování, wort boiling = chmelovar, fermentation = kvašení, maturation = zrání…).
- Vlastní jména a latinské názvy ponech. Český název vrať beze změny."""

SCHEMA = {
    'type': 'object',
    'properties': {'nazvy': {'type': 'array', 'items': {'type': 'string'}}},
    'required': ['nazvy'],
    'additionalProperties': False,
}

JAZYKY = {'en': 'angličtiny', 'de': 'němčiny', 'sk': 'slovenštiny'}


def preloz_nazvy(klient, nazvy: list[str], model: str, jazyk: str | None) -> tuple[list[str] | None, dict]:
    """Jedna dávka názvů → (překlady stejné délky, nebo None; usage). Výjimky API nechává projít."""
    odkud = JAZYKY.get(jazyk or '', 'původního jazyka')
    seznam = '\n'.join(f'{i + 1}. {n}' for i, n in enumerate(nazvy))
    parametry = {
        'model': model, 'max_tokens': 8000, 'system': PROMPT,
        'output_config': {'effort': 'low', 'format': {'type': 'json_schema', 'schema': SCHEMA}},
        'messages': [{'role': 'user', 'content': [{'type': 'text', 'text':
            f'Přelož z {odkud} do češtiny těchto {len(nazvy)} názvů (vrať pole „nazvy" se {len(nazvy)} položkami, bez čísel pořadí):\n\n{seznam}'}]}],
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
    vysledek = data.get('nazvy') if isinstance(data, dict) else None
    if not isinstance(vysledek, list) or len(vysledek) != len(nazvy) or not all(isinstance(x, str) for x in vysledek):
        return None, usage
    return [x.strip() or puvodni for x, puvodni in zip(vysledek, nazvy)], usage
