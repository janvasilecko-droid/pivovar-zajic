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
# Vodítka a oddělovače (obsah „Ječmen ........ 7"), které o kvalitě vrstvy nic neříkají.
_NEUTRALNI = set('.…·_-–—')

# Mojibake: čeština z ISO-8859-2/cp1250 přečtená jako Latin-1/cp1252 („Pøi rmutování
# se ¹krob ¹tìpí … a¾") — písmena š ž ť ř ě vyjdou jako ¹ ¾ » ø ì u písmen; nebo
# UTF-8 přečtené jako Latin-1 („RmutovÃ¡nÃ­", „pÅ™i").
_MOJIBAKE_ZNAK = re.compile(r'(?<=[^\W\d_])[¹¾»øì]|[¹¾»øì](?=[^\W\d_])')
_MOJIBAKE_UTF8 = re.compile('[ÃÄÅ][\u0080-¿ŒœŠšŸŽž'
                            'ˆ˜–-›€™]')


def znaku_bez_mezer(text: str) -> int:
    return sum(1 for z in text if not z.isspace())


def je_mojibake(text: str | None) -> bool:
    """Text s rozbitým kódováním (fulltext by v něm nenašel slova s diakritikou)."""
    t = text or ''
    pismen = sum(1 for z in t if z.isalpha())
    if pismen < 40:
        return False
    podezrelych = len(_MOJIBAKE_ZNAK.findall(t)) + len(_MOJIBAKE_UTF8.findall(t))
    return podezrelych >= 3 and podezrelych / pismen > 0.005


def vada_vrstvy(text: str | None) -> str | None:
    """Proč textová vrstva nejde použít jako přesný text (None = jde).

    Vadná vrstva = rozbité fonty bez mapy znaků („(cid:123)", náhradní znak
    U+FFFD, řídicí znaky, soukromá oblast Unicode), rozbité kódování
    (mojibake) nebo text, který skoro nemá písmena ani číslice. Číselná
    tabulka (Platóva tabulka, rozbor vody) je v pořádku — číslice se počítají.
    Krátký text vadou není (titul, prázdná strana).
    """
    t = text or ''
    n = znaku_bez_mezer(t)
    if n == 0:
        return None
    divnych = sum(1 for z in t if z == '�' or (ord(z) < 32 and z not in '\n\r\t') or 0xE000 <= ord(z) <= 0xF8FF)
    if divnych / n > 0.02 or len(re.findall(r'\(cid:\d+\)', t)) > 5:
        return 'rozbité fonty'
    if je_mojibake(t):
        return 'rozbité kódování'
    posuzovanych = sum(1 for z in t if not z.isspace() and z not in _NEUTRALNI)
    platnych = sum(1 for z in t if z.isalnum())
    if n >= 40 and (not posuzovanych or platnych / posuzovanych < 0.5):
        return 'skoro bez písmen a číslic'
    return None


def je_digitalni(text: str | None) -> bool:
    """Má strana dost použitelného textu ve vrstvě? (Krátkou stranu rozhodne obsah strany.)"""
    return znaku_bez_mezer(text or '') >= MIN_ZNAKU_VRSTVY and vada_vrstvy(text) is None


# Číslo strany v záhlaví nebo zápatí: „124", „– 124 –", „S. 124", „str. 124",
# „Seite 124", „page 124", „124 | Kapitola 3", „Kapitola 3 · 124".
_VZORY_CISLA = [
    re.compile(r'^[\-–—\s]*(\d{1,4})[\-–—\s]*$'),
    re.compile(r'^(?:s\.|str\.|strana|seite|page|p\.)\s*(\d{1,4})$', re.IGNORECASE),
    re.compile(r'^(\d{1,4})\s*[|·•]\s*\S.*$'),
    re.compile(r'^\S.*?\s*[|·•]\s*(\d{1,4})$'),
]
# Číslo na kraji řádku živého záhlaví („124 Kapitola 3 Rmutování", „3.2 Infuzní
# postup 125" — pdfium i OCR je spojí jedinou mezerou). Slabší doklad: mezi
# kandidáty se tak dostane i číslo kapitoly („Kapitola 3"), jeho posun proti
# pořadí listu ale nedrží, takže ho hlasování v tistena_cisla vyřadí.
_CISLO_NA_ZACATKU = re.compile(r'^(\d{1,4})\s+[^\d\s.,:/].*$')
_CISLO_NA_KONCI = re.compile(r'^.*[^\d\s.,:/]\s+(\d{1,4})$')


def _je_cislo_strany(cislo: int, pocet_stran: int | None) -> bool:
    # Letopočet v záhlaví („© 2019") není číslo strany — kromě obřích knih.
    je_rok = 1800 <= cislo <= 2100 and (pocet_stran is None or pocet_stran < 1800)
    return 0 < cislo < 5000 and not je_rok


def kandidati_cisla(okraje: str, pocet_stran: int | None = None) -> list[int]:
    """Čísla, která v záhlaví nebo zápatí strany vypadají jako číslo strany."""
    vysledek: list[int] = []
    for radek in (r.strip() for r in (okraje or '').splitlines()):
        if not radek:
            continue
        nalezena: list[int] = []
        for vzor in _VZORY_CISLA:
            m = vzor.match(radek)
            if m:
                nalezena = [int(m.group(1))]
                break
        else:
            for vzor in (_CISLO_NA_ZACATKU, _CISLO_NA_KONCI):
                m = vzor.match(radek)
                if m:
                    nalezena.append(int(m.group(1)))
        vysledek.extend(c for c in nalezena if _je_cislo_strany(c, pocet_stran))
    return vysledek


def _stitky_k_necemu(stitky: list[str | None]) -> bool:
    """Štítky PDF jsou k něčemu, jen když nejsou prázdné ani obyčejné pořadí listů.

    Posuzují se jen číselné štítky: „Obálka, 2, 3, 4…" je pořád jen pořadí
    listů, i když první štítek je jiný.
    """
    vyplnene = [(i, s) for i, s in enumerate(stitky) if s]
    if not vyplnene:
        return False
    ciselne = [(i, s) for i, s in vyplnene if s.isdigit()]
    if ciselne and all(int(s) == i + 1 for i, s in ciselne):
        return False
    return True


def _z_okraju(kandidati: list[list[int]], okno: int, min_hlasu: int) -> list[tuple[str | None, str | None]]:
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


def tistena_cisla(
    kandidati: list[list[int]],
    stitky: list[str | None] | None = None,
    okno: int = 9,
    min_hlasu: int = 3,
) -> list[tuple[str | None, str | None]]:
    """Tištěné číslo strany pro každý list: (číslo, zdroj) nebo (None, None).

    1. Číslo v záhlaví/zápatí, potvrzené posunem (číslo − pořadí listu), který
       má v okně kolem listu aspoň `min_hlasu` stran → 'zahlavi'.
       List bez čísla (začátek kapitoly, prázdná strana) jen UVNITŘ úseku se
       stejným posunem — sousedé před i za ním → 'dopocet'.
       Shoda dvou posunů (třeba číslo kapitoly v záhlaví) = nejisté → nic.
    2. Štítky stran z PDF (/PageLabels) mají přednost, jen když nejsou obyčejné
       pořadí listů a nikde neodporují číslu vytištěnému na straně (štítky
       „Obálka, 1, 2…" posunuté proti tisku se tak nepoužijí) → 'stitek_pdf'.
    """
    z_okraju = _z_okraju(kandidati, okno, min_hlasu)
    if stitky and len(stitky) == len(kandidati) and _stitky_k_necemu(stitky):
        rozpor = any(
            zdroj == 'zahlavi' and s is not None and s.isdigit() and s != cislo
            for (cislo, zdroj), s in zip(z_okraju, stitky)
        )
        if not rozpor:
            return [((s, 'stitek_pdf') if s else z) for s, z in zip(stitky, z_okraju)]
    return z_okraju
