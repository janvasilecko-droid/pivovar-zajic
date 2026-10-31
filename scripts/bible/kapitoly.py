"""Kapitoly knihy: strom z osnovy PDF (záložek), nebo z číslovaných nadpisů.

Čisté funkce (testy: tests/test_kapitoly.py). Rozsah kapitoly je v listech
souboru (pdf_index od 1), ne v tištěných stranách.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

MAX_UROVEN = 9


@dataclass
class Kapitola:
    poradi: int
    uroven: int
    nazev: str
    cislo: str | None
    strana_od: int | None
    strana_do: int | None
    zdroj: str  # 'osnova' | 'nadpis'
    rodic: int | None = None  # index rodiče v seznamu
    deti: list[int] = field(default_factory=list)


_CISLO_NA_ZACATKU = re.compile(r'^(\d{1,3}(?:\.\d{1,3}){0,4})\.?\s+(\S.*)$')


def rozdel_cislo(titulek: str) -> tuple[str | None, str]:
    """„3.4.2 Rmutování" → ("3.4.2", "Rmutování")."""
    t = ' '.join((titulek or '').split())
    m = _CISLO_NA_ZACATKU.match(t)
    if m:
        return m.group(1), m.group(2)
    return None, t


def _doplnit_strom_a_rozsahy(kapitoly: list[Kapitola], pocet_stran: int) -> list[Kapitola]:
    zasobnik: list[int] = []
    for i, k in enumerate(kapitoly):
        while zasobnik and kapitoly[zasobnik[-1]].uroven >= k.uroven:
            zasobnik.pop()
        k.rodic = zasobnik[-1] if zasobnik else None
        if k.rodic is not None:
            kapitoly[k.rodic].deti.append(i)
        zasobnik.append(i)
    for i, k in enumerate(kapitoly):
        if k.strana_od is None:
            continue
        konec = pocet_stran
        for dalsi in kapitoly[i + 1:]:
            if dalsi.uroven <= k.uroven and dalsi.strana_od is not None:
                # Další kapitola začíná na stejné straně → tahle končí tam, kde začala.
                konec = max(k.strana_od, dalsi.strana_od - 1) if dalsi.strana_od > k.strana_od else k.strana_od
                break
        k.strana_do = konec
    return kapitoly


def z_osnovy(polozky: list[tuple[int, str, int | None]], pocet_stran: int) -> list[Kapitola]:
    """Osnova PDF: (úroveň od 0, titulek, index listu od 0 nebo None)."""
    kapitoly: list[Kapitola] = []
    for uroven, titulek, index in polozky:
        cislo, nazev = rozdel_cislo(titulek)
        if not nazev:
            continue
        strana = index + 1 if index is not None and 0 <= index < pocet_stran else None
        kapitoly.append(Kapitola(
            poradi=len(kapitoly) + 1,
            uroven=min(MAX_UROVEN, uroven + 1),
            nazev=nazev[:300],
            cislo=cislo,
            strana_od=strana,
            strana_do=None,
            zdroj='osnova',
        ))
    return _doplnit_strom_a_rozsahy(kapitoly, pocet_stran)


# „3.2 Rmutování", „3.2.1 Infuzní postup" — číslo s tečkou a nadpis s velkým písmenem.
_NADPIS_CISLO = re.compile(r'^(\d{1,2}(?:\.\d{1,2}){1,3})\.?\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽÄÖÜ][^\n]{2,90})$')
# „Kapitola 3", „Kapitel 3: Maischen", „Chapter 3 Mashing"
_NADPIS_SLOVEM = re.compile(r'^(?:kapitola|kapitel|chapter)\s+(\d{1,3})\b[\s.:—–-]*(.{0,90})$', re.IGNORECASE)
# Markdown nadpis z OCR nebo z DOCX/EPUB („# Rmutování", „## 3.2 Rmutování").
_NADPIS_MD = re.compile(r'^(#{1,6})\s+(.{1,150})$')


def _vypada_jako_nadpis(nazev: str) -> bool:
    # Věta s tečkou na konci nebo s čísly a jednotkami je spíš řádek seznamu.
    return not nazev.rstrip().endswith(('.', ',', ';')) and len(nazev.split()) <= 14


def z_nadpisu(strany: list[tuple[int, str]], pocet_stran: int, max_radku: int = 12) -> list[Kapitola]:
    """Kapitoly z nadpisů na začátku stran (když PDF osnovu nemá)."""
    kapitoly: list[Kapitola] = []
    for pdf_index, text in strany:
        radky = [r.strip() for r in (text or '').splitlines() if r.strip()][:max_radku]
        for radek in radky:
            uroven = None
            cislo: str | None = None
            nazev = ''
            m = _NADPIS_MD.match(radek)
            if m:
                uroven = len(m.group(1))
                cislo, nazev = rozdel_cislo(m.group(2))
            elif (m := _NADPIS_SLOVEM.match(radek)):
                uroven, cislo, nazev = 1, m.group(1), (m.group(2).strip() or radek)
            elif (m := _NADPIS_CISLO.match(radek)):
                cislo, nazev = m.group(1), m.group(2).strip()
                uroven = cislo.count('.') + 1
            if uroven is None or not nazev or not _vypada_jako_nadpis(nazev):
                continue
            # Stejný nadpis hned znovu (živé záhlaví na každé straně) se nebere.
            if kapitoly and kapitoly[-1].nazev == nazev[:300] and kapitoly[-1].cislo == cislo:
                continue
            kapitoly.append(Kapitola(
                poradi=len(kapitoly) + 1,
                uroven=min(MAX_UROVEN, uroven),
                nazev=nazev[:300],
                cislo=cislo,
                strana_od=pdf_index,
                strana_do=None,
                zdroj='nadpis',
            ))
    return _doplnit_strom_a_rozsahy(kapitoly, pocet_stran)


def kapitola_strany(kapitoly: list[Kapitola], pdf_index: int) -> int | None:
    """Index nejhlubší kapitoly, do které list patří (None = mimo kapitoly)."""
    nejlepsi: int | None = None
    for i, k in enumerate(kapitoly):
        if k.strana_od is None or k.strana_do is None:
            continue
        if k.strana_od <= pdf_index <= k.strana_do:
            if nejlepsi is None or k.uroven >= kapitoly[nejlepsi].uroven:
                nejlepsi = i
    return nejlepsi
