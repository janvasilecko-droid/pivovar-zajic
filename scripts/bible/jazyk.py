"""Hrubý odhad jazyka pasáže (čeština, němčina, angličtina) pro filtr hledání.

Jen nápověda: když jazyk určil uživatel u dokumentu, má přednost. Krátký nebo
nejasný text → None (nehádat).
"""
from __future__ import annotations

import re

_SLOVA = {
    'cs': {'a', 'je', 'se', 'na', 'v', 've', 'z', 'ze', 'do', 'pro', 'jako', 'které', 'který', 'při', 'nebo', 'také', 'piva', 'pivo'},
    'de': {'und', 'der', 'die', 'das', 'ist', 'mit', 'von', 'zu', 'bei', 'nicht', 'eine', 'ein', 'wird', 'werden', 'bier', 'auf'},
    'en': {'the', 'and', 'of', 'is', 'to', 'in', 'with', 'for', 'are', 'by', 'be', 'that', 'this', 'beer', 'from', 'as'},
}
# Písmena, která jinde než v daném jazyce skoro nejsou.
_ZNAKY = {'cs': set('ěščřžůťďň'), 'de': set('äöüß')}


def odhad_jazyka(text: str) -> str | None:
    slova = re.findall(r'[a-záčďéěíňóřšťúůýžäöüß]+', (text or '').lower())
    if len(slova) < 15:
        return None
    body = {j: sum(1 for s in slova if s in mnozina) for j, mnozina in _SLOVA.items()}
    for j, znaky in _ZNAKY.items():
        body[j] += min(10, sum(1 for s in slova for z in s if z in znaky))
    poradi = sorted(body.items(), key=lambda x: x[1], reverse=True)
    (prvni, b1), (_, b2) = poradi[0], poradi[1]
    if b1 < 3 or b2 * 1.5 > b1:
        return None
    return prvni
