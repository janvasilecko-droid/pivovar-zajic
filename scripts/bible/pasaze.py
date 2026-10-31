"""Rozdělení textu knihy na pasáže pro hledání (testy: tests/test_pasaze.py).

Pasáž je kus textu uvnitř jedné kapitoly, nejvýš přes dvě strany, aby šla
citovat přesně (kniha, kapitola, strana). Tabulky a vzorce jsou navíc
samostatné pasáže — zadání chce hledat i „konkrétní vzorce, tabulky a pojmy".
Vzorec zůstává i v textu, aby neztratil souvislost.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

CIL_ZNAKU = 2400   # ≈ 600 tokenů
MAX_ZNAKU = 3600
MAX_STRAN = 2

_POPISEK = re.compile(r'^(?:obr\.|obrázek|fig\.|figure|abb\.|abbildung|tab\.|tabulka|table|tabelle)\s*\d', re.IGNORECASE)
_VETA = re.compile(r'(?<=[.!?…])\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽÄÖÜ0-9„"(])')


@dataclass
class Pasaz:
    poradi: int
    strana_od: int
    strana_do: int
    druh: str  # 'text' | 'tabulka' | 'vzorec' | 'popisek'
    text: str
    kapitola: int | None


def bloky(text: str) -> list[tuple[str, str]]:
    """Text strany → bloky (druh, text): odstavce, tabulky, vzorce, popisky."""
    vysledek: list[tuple[str, str]] = []
    radky = (text or '').splitlines()
    i = 0
    odstavec: list[str] = []

    def uzavri_odstavec() -> None:
        if odstavec:
            t = '\n'.join(odstavec).strip()
            if t:
                vysledek.append(('popisek' if _POPISEK.match(t) else 'text', t))
            odstavec.clear()

    while i < len(radky):
        radek = radky[i]
        holy = radek.strip()
        if holy.startswith('|'):
            uzavri_odstavec()
            tabulka = []
            while i < len(radky) and radky[i].strip().startswith('|'):
                tabulka.append(radky[i].rstrip())
                i += 1
            vysledek.append(('tabulka', '\n'.join(tabulka)))
            continue
        if holy.startswith('$$'):
            uzavri_odstavec()
            vzorec = [holy]
            # Jednořádkový „$$ … $$", jinak až po uzavírací „$$".
            if not (len(holy) > 2 and holy.endswith('$$') and holy != '$$'):
                i += 1
                while i < len(radky):
                    vzorec.append(radky[i].strip())
                    if radky[i].strip().endswith('$$'):
                        break
                    i += 1
            vysledek.append(('vzorec', '\n'.join(vzorec)))
            i += 1
            continue
        if not holy:
            uzavri_odstavec()
        else:
            odstavec.append(holy)
        i += 1
    uzavri_odstavec()
    return vysledek


def _rozdel_dlouhy(text: str) -> list[str]:
    """Odstavec delší než MAX_ZNAKU rozdělí po řádcích, pak po větách (nouzově natvrdo)."""
    if len(text) <= MAX_ZNAKU:
        return [text]
    kusy: list[tuple[str, str]] = []  # (oddělovač před kusem, kus)
    for radek in text.split('\n'):
        for j, veta in enumerate(_VETA.split(radek) if len(radek) > MAX_ZNAKU else [radek]):
            while len(veta) > MAX_ZNAKU:
                kusy.append((' ' if j else '\n', veta[:MAX_ZNAKU]))
                veta = veta[MAX_ZNAKU:]
                j = 1
            kusy.append((' ' if j else '\n', veta))
    casti: list[str] = []
    aktualni = ''
    for oddelovac, kus in kusy:
        if aktualni and len(aktualni) + len(kus) + 1 > CIL_ZNAKU:
            casti.append(aktualni)
            aktualni = kus
        else:
            aktualni = f'{aktualni}{oddelovac}{kus}' if aktualni else kus
    if aktualni.strip():
        casti.append(aktualni)
    return [c for c in casti if c.strip()]


_ODDELOVAC_TABULKY = re.compile(r'^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$')


def _rozdel_tabulku(tabulka: str) -> list[str]:
    """Velkou tabulku rozdělí po řádcích na kusy do MAX_ZNAKU; každý kus
    zopakuje hlavičku (tabulka o tisících řádků z přílohy DOCX nebo XLSX)."""
    if len(tabulka) <= MAX_ZNAKU:
        return [tabulka]
    radky = tabulka.split('\n')
    hlavicka = radky[:2] if len(radky) > 1 and _ODDELOVAC_TABULKY.match(radky[1].strip()) else radky[:1]
    zahlavi = '\n'.join(hlavicka)
    if len(zahlavi) > MAX_ZNAKU // 2:
        zahlavi = ''  # obří hlavička by kusy jen nafoukla
    casti: list[str] = []
    aktualni: list[str] = []
    delka = len(zahlavi)
    for radek in radky[len(hlavicka):]:
        for kus in ([radek] if len(radek) <= MAX_ZNAKU - len(zahlavi) - 1 else _rozdel_dlouhy(radek)):
            if aktualni and delka + len(kus) + 1 > MAX_ZNAKU:
                casti.append('\n'.join(([zahlavi] if zahlavi else []) + aktualni))
                aktualni, delka = [], len(zahlavi)
            aktualni.append(kus)
            delka += len(kus) + 1
    if aktualni:
        casti.append('\n'.join(([zahlavi] if zahlavi else []) + aktualni))
    return casti or [tabulka[:MAX_ZNAKU]]


def rozdel_na_pasaze(strany: list[tuple[int, str, int | None]]) -> list[Pasaz]:
    """Strany (pdf_index, text, index kapitoly) → pasáže v pořadí knihy."""
    pasaze: list[Pasaz] = []
    text: list[str] = []
    od = do = 0
    kapitola: int | None = None

    def vyprazdni() -> None:
        nonlocal text
        obsah = '\n\n'.join(text).strip()
        if obsah:
            pasaze.append(Pasaz(len(pasaze) + 1, od, do, 'text', obsah, kapitola))
        text = []

    def pridej_samostatnou(druh: str, obsah: str, strana: int, kap: int | None) -> None:
        pasaze.append(Pasaz(len(pasaze) + 1, strana, strana, druh, obsah, kap))

    for pdf_index, text_strany, kap in strany:
        for druh, obsah in bloky(text_strany):
            if druh == 'tabulka':
                for kus in _rozdel_tabulku(obsah):
                    pridej_samostatnou('tabulka', kus, pdf_index, kap)
                continue
            if druh in ('popisek', 'vzorec'):
                for kus in _rozdel_dlouhy(obsah):
                    pridej_samostatnou(druh, kus, pdf_index, kap)
            for kus in _rozdel_dlouhy(obsah):
                delka = sum(len(t) for t in text)
                if text and (
                    kap != kapitola
                    or delka + len(kus) > MAX_ZNAKU
                    or delka >= CIL_ZNAKU
                    or pdf_index - od + 1 > MAX_STRAN
                ):
                    vyprazdni()
                if not text:
                    od = pdf_index
                    kapitola = kap
                text.append(kus)
                do = pdf_index
    vyprazdni()
    return pasaze
