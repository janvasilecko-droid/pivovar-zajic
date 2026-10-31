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
    """Odstavec delší než MAX_ZNAKU rozdělí po větách (nouzově natvrdo)."""
    if len(text) <= MAX_ZNAKU:
        return [text]
    casti: list[str] = []
    aktualni = ''
    for veta in _VETA.split(text):
        while len(veta) > MAX_ZNAKU:
            casti.append(veta[:MAX_ZNAKU])
            veta = veta[MAX_ZNAKU:]
        if len(aktualni) + len(veta) + 1 > CIL_ZNAKU and aktualni:
            casti.append(aktualni)
            aktualni = veta
        else:
            aktualni = f'{aktualni} {veta}'.strip()
    if aktualni:
        casti.append(aktualni)
    return casti


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
                pridej_samostatnou('tabulka', obsah, pdf_index, kap)
                continue
            if druh == 'popisek':
                pridej_samostatnou('popisek', obsah, pdf_index, kap)
            elif druh == 'vzorec':
                pridej_samostatnou('vzorec', obsah, pdf_index, kap)
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
