"""Strany knihy: je textová vrstva použitelná, a jaké číslo strany je v knize vytištěné.

Čisté funkce bez sítě a bez PDF knihoven (testy: tests/test_stranky.py).

Zásada ze zadání (bod 11): nic nehádat. Tištěné číslo strany se uloží jen
s jistotou; jinak zůstane prázdné a citace řekne „list PDF č. X".
"""
from __future__ import annotations

import re
from collections import Counter

# Pod tímhle počtem znaků (bez mezer) je strana spíš sken, obrázek nebo prázdná.
MIN_ZNAKU_VRSTVY = 120


def znaku_bez_mezer(text: str) -> int:
    return sum(1 for z in text if not z.isspace())


def je_digitalni(text: str | None) -> bool:
    """Má strana použitelnou textovou vrstvu? Když ne, přepíše se přes OCR.

    Vadná vrstva = rozbité fonty bez mapy znaků („(cid:123)", náhradní znak
    U+FFFD, řídicí znaky) nebo text, který skoro nemá písmena.
    """
    t = text or ''
    n = znaku_bez_mezer(t)
    if n < MIN_ZNAKU_VRSTVY:
        return False
    divnych = sum(1 for z in t if z == '�' or (ord(z) < 32 and z not in '\n\r\t'))
    if divnych / n > 0.02 or len(re.findall(r'\(cid:\d+\)', t)) > 5:
        return False
    pismen = sum(1 for z in t if z.isalpha())
    return pismen / n >= 0.5


# Číslo strany v záhlaví nebo zápatí: „124", „– 124 –", „S. 124", „str. 124",
# „Seite 124", „page 124", živé záhlaví „124   Kapitola 3" nebo „Kapitola 3   124".
_VZORY_CISLA = [
    re.compile(r'^[\-–—\s]*(\d{1,4})[\-–—\s]*$'),
    re.compile(r'^(?:s\.|str\.|strana|seite|page|p\.)\s*(\d{1,4})$', re.IGNORECASE),
    re.compile(r'^(\d{1,4})\s{2,}\S.*$'),
    re.compile(r'^\S.*?\s{2,}(\d{1,4})$'),
    re.compile(r'^(\d{1,4})\s*[|·•]\s*\S.*$'),
    re.compile(r'^\S.*?\s*[|·•]\s*(\d{1,4})$'),
]


def kandidati_cisla(okraje: str, pocet_stran: int | None = None) -> list[int]:
    """Čísla, která v záhlaví nebo zápatí strany vypadají jako číslo strany."""
    vysledek: list[int] = []
    for radek in (r.strip() for r in (okraje or '').splitlines()):
        if not radek:
            continue
        for vzor in _VZORY_CISLA:
            m = vzor.match(radek)
            if not m:
                continue
            cislo = int(m.group(1))
            # Letopočet v záhlaví („© 2019") není číslo strany — kromě obřích knih.
            je_rok = 1800 <= cislo <= 2100 and (pocet_stran is None or pocet_stran < 1800)
            if 0 < cislo < 5000 and not je_rok:
                vysledek.append(cislo)
            break
    return vysledek


def _jsou_stitky_uzitecne(stitky: list[str | None]) -> bool:
    """Štítky PDF jsou k něčemu, jen když nejsou prázdné ani obyčejné 1, 2, 3…"""
    vyplnene = [(i, s) for i, s in enumerate(stitky) if s]
    if not vyplnene:
        return False
    return any(s != str(i + 1) for i, s in vyplnene)


def tistena_cisla(
    kandidati: list[list[int]],
    stitky: list[str | None] | None = None,
    okno: int = 9,
    min_hlasu: int = 3,
) -> list[tuple[str | None, str | None]]:
    """Tištěné číslo strany pro každý list: (číslo, zdroj) nebo (None, None).

    Pořadí zdrojů:
      1. štítky stran z PDF (/PageLabels), pokud nejsou jen 1..n → 'stitek_pdf'
      2. číslo v záhlaví/zápatí, potvrzené posunem (číslo − pořadí listu),
         který má v okně kolem listu aspoň `min_hlasu` stran → 'zahlavi'
      3. list bez čísla (začátek kapitoly, prázdná strana) jen UVNITŘ úseku
         se stejným posunem — sousedé před i za ním → 'dopocet'
    Shoda dvou posunů (třeba číslo kapitoly v záhlaví) = nejisté → nic.
    """
    if stitky and len(stitky) == len(kandidati) and _jsou_stitky_uzitecne(stitky):
        return [((s, 'stitek_pdf') if s else (None, None)) for s in stitky]

    n = len(kandidati)
    posuny = [{c - (i + 1) for c in kk} for i, kk in enumerate(kandidati)]
    pul = okno // 2
    vysledek: list[tuple[str | None, str | None]] = []
    for i in range(n):
        od, do = max(0, i - pul), min(n, i + pul + 1)
        hlasy = Counter(p for j in range(od, do) for p in posuny[j])
        nejcastejsi = hlasy.most_common(2)
        if not nejcastejsi:
            vysledek.append((None, None))
            continue
        posun, pocet = nejcastejsi[0]
        nerozhodne = len(nejcastejsi) > 1 and nejcastejsi[1][1] == pocet
        cislo = i + 1 + posun
        if pocet < min_hlasu or nerozhodne or cislo < 1:
            vysledek.append((None, None))
            continue
        if posun in posuny[i]:
            vysledek.append((str(cislo), 'zahlavi'))
            continue
        pred = any(posun in posuny[j] for j in range(od, i))
        za = any(posun in posuny[j] for j in range(i + 1, do))
        vysledek.append((str(cislo), 'dopocet') if pred and za else (None, None))
    return vysledek
