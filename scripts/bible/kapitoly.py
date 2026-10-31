"""Kapitoly knihy: strom z osnovy PDF (záložek), nebo z nadpisů v textu.

Čisté funkce (testy: tests/test_kapitoly.py). Rozsah kapitoly je v listech
souboru (pdf_index od 1), ne v tištěných stranách. Kapitola začíná na listu
a řádku (index v text.splitlines()), takže strana, kde jedna kapitola končí
a další začíná, se v tom místě rozdělí (useky) a každá pasáž dostane svou
kapitolu (zásada „pasáž uvnitř jedné kapitoly").

Zásada ze zadání: nic nehádat. Řádek obsahu, odkaz „viz kapitola 5" nebo živé
záhlaví nadpis není; číslovaný nadpis v holém textu se bere, jen když číslo
navazuje na ostatní nadpisy.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

MAX_UROVEN = 9
# Před začátkem kapitoly na listu je méně textu (záhlaví) → předchozí kapitola na ten list nezasahuje.
MALO_ZNAKU = 40


@dataclass
class Kapitola:
    poradi: int
    uroven: int
    nazev: str
    cislo: str | None
    strana_od: int | None
    strana_do: int | None
    zdroj: str  # 'osnova' | 'nadpis'
    radek: int = 0  # řádek listu, kde kapitola začíná
    rodic: int | None = None  # index rodiče v seznamu
    deti: list[int] = field(default_factory=list)


_CISLO_NA_ZACATKU = re.compile(r'^(\d{1,3}(?:\.\d{1,3}){0,4})\.?\s+(\S.*)$')


def rozdel_cislo(titulek: str) -> tuple[str | None, str]:
    """„3.4.2 Rmutování" → ("3.4.2", "Rmutování").

    Číslovka v názvu („10 pravidel sanitace", „100 let pivovaru") číslo
    kapitoly není: za číslem kapitoly nestojí slovo celé malými písmeny
    („3.2 pH-Wert" ale ano).
    """
    t = ' '.join((titulek or '').split())
    m = _CISLO_NA_ZACATKU.match(t)
    if m:
        prvni_slovo = m.group(2).split()[0]
        if prvni_slovo.isalpha() and prvni_slovo.islower():
            return None, t
        return m.group(1), m.group(2)
    return None, t


def _cislo_jako_ntice(cislo: str | None) -> tuple[int, ...] | None:
    if not cislo:
        return None
    try:
        return tuple(int(x) for x in cislo.split('.'))
    except ValueError:
        return None


def _normalizuj(s: str) -> str:
    """Pro porovnání titulků: bez diakritiky, malá písmena, jen písmena a číslice."""
    s = unicodedata.normalize('NFKD', (s or '').casefold())
    s = ''.join(z for z in s if not unicodedata.combining(z))
    return ' '.join(re.sub(r'[^\w]+', ' ', s).split())


# --- okraje strany (živé záhlaví a zápatí) ------------------------------------

def okrajove_radky(radky: list[str], okraje: str | None, kolik: int = 3) -> set[int]:
    """Řádky na začátku a konci listu složené jen z úseků pásu záhlaví/zápatí.

    pdfium dá do textu strany „3.2 Infuzní postup 125" jako jeden řádek, okraje
    ho mají jako dva úseky — řádek je okrajový, když po odebrání všech úseků
    pásu nic nezbude.
    """
    zbyva: dict[str, int] = {}
    for u in (_normalizuj(u) for u in (okraje or '').splitlines()):
        if u:
            zbyva[u] = zbyva.get(u, 0) + 1
    if not zbyva:
        return set()
    neprazdne = [i for i, r in enumerate(radky) if r.strip()]
    # Shora první řádky, zdola poslední; každý úsek pásu „spotřebuje" jen jeden
    # řádek (nadpis kapitoly se stejným textem jako záhlaví pod ním zůstane).
    poradi = neprazdne[:kolik] + [i for i in reversed(neprazdne[-kolik:]) if i not in neprazdne[:kolik]]
    vysledek: set[int] = set()
    for i in poradi:
        zbytek = f' {_normalizuj(radky[i])} '
        pouzite: list[str] = []
        for u in sorted(zbyva, key=len, reverse=True):
            while zbyva[u] - pouzite.count(u) > 0 and f' {u} ' in zbytek:
                zbytek = zbytek.replace(f' {u} ', ' ', 1)
                pouzite.append(u)
        if not zbytek.strip() and pouzite:
            vysledek.add(i)
            for u in pouzite:
                zbyva[u] -= 1
    return vysledek


# --- kapitoly z osnovy ---------------------------------------------------------

def z_osnovy(polozky: list[tuple[int, str, int | None]], pocet_stran: int,
             strany: list[tuple[int, str]] | None = None, okraje: dict[int, str] | None = None) -> list[Kapitola]:
    """Osnova PDF: (úroveň od 0, titulek, index listu od 0 nebo None).

    Se `strany` (pdf_index, text) se na listu najde i řádek nadpisu, aby se
    strana dala rozdělit tam, kde kapitola opravdu začíná.
    """
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
    # Záložka bez cíle (skupina „Část I") začíná tam, kde její první podkapitola.
    for i, k in enumerate(kapitoly):
        if k.strana_od is None:
            for dalsi in kapitoly[i + 1:]:
                if dalsi.uroven <= k.uroven:
                    break
                if dalsi.strana_od is not None:
                    k.strana_od = dalsi.strana_od
                    break
    kapitoly = [k for k in kapitoly if k.strana_od is not None]
    if strany:
        _najdi_radky_nadpisu(kapitoly, dict(strany), okraje or {})
    return dopln_rozsahy(kapitoly, pocet_stran, dict(strany) if strany else None)


def osnova_pouzitelna(kapitoly: list[Kapitola], pocet_stran: int) -> bool:
    """Osnova s jedinou záložkou („Titulní strana") nebo jen přes úvod knihy text
    nepokrývá — pak se kapitoly hledají v nadpisech."""
    cile = {k.strana_od for k in kapitoly if k.strana_od is not None}
    if len(cile) < 2:
        return False
    return pocet_stran < 10 or (max(cile) - min(cile) + 1) >= 0.3 * pocet_stran


def _najdi_radky_nadpisu(kapitoly: list[Kapitola], texty: dict[int, str], okraje: dict[int, str]) -> None:
    """Řádek, na kterém je nadpis kapitoly z osnovy. Nenajde-li se, zůstane 0
    (kapitola začíná na začátku listu)."""
    od_radku: dict[int, int] = {}
    for k in sorted(kapitoly, key=lambda x: x.strana_od or 0):
        radky = (texty.get(k.strana_od) or '').splitlines()
        okrajove = okrajove_radky(radky, okraje.get(k.strana_od))
        cele = _normalizuj(f'{k.cislo} {k.nazev}' if k.cislo else k.nazev)
        nazev = _normalizuj(k.nazev)
        zacatek = od_radku.get(k.strana_od, 0)
        for i in range(zacatek, len(radky)):
            if i in okrajove:
                continue
            r = _normalizuj(radky[i])
            if not r:
                continue
            shoda = r in (cele, nazev)
            # Nadpis zalomený do víc řádků: řádek je začátek titulku.
            shoda = shoda or (len(r) >= 8 and (cele.startswith(r) or nazev.startswith(r)))
            # Číslo jen v textu („3.2 Infuzní postup"), titulek záložky bez něj.
            shoda = shoda or (r.endswith(' ' + nazev) and re.fullmatch(r'[\d ]{1,12}', r[:-len(nazev)].strip() + ' ') is not None)
            if shoda:
                k.radek = i
                od_radku[k.strana_od] = i
                break
        else:
            k.radek = zacatek


# --- kapitoly z nadpisů v textu --------------------------------------------------

# „3.2 Rmutování", „3.2.1 Infuzní postup" — číslo s tečkou a nadpis s velkým písmenem.
_NADPIS_CISLO = re.compile(r'^(\d{1,2}(?:\.\d{1,2}){1,3})\.?\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽÄÖÜ][^\n]{2,90})$')
# „Kapitola 3", „Kapitel 3: Maischen", „Chapter 3 Mashing"
_NADPIS_SLOVEM = re.compile(r'^(?:kapitola|kapitel|chapter)\s+(\d{1,3})\b[\s.:—–-]*(.{0,90})$', re.IGNORECASE)
# Markdown nadpis z OCR nebo z DOCX/EPUB („# Rmutování", „## 3.2 Rmutování").
_NADPIS_MD = re.compile(r'^(#{1,6})\s+(.{1,150})$')
# Řádek obsahu: vodítka („Ječmen ....... 7") nebo číslo strany na konci.
_VODITKA = re.compile(r'(?:\.\s?){3,}|…|_{3,}')
_CISLO_NA_KONCI = re.compile(r'\s\d{1,4}$')
_OBSAH = re.compile(r'^(?:#+\s*)?(?:obsah|inhalt|inhaltsverzeichnis|contents|table of contents)\s*$', re.IGNORECASE)


@dataclass
class _Kandidat:
    pdf_index: int
    radek: int
    uroven: int
    cislo: str | None
    nazev: str
    druh: str  # 'md' | 'cislo' | 'slovem'


def _vypada_jako_nadpis(nazev: str) -> bool:
    # Věta s tečkou na konci nebo dlouhý řádek je spíš text nebo seznam.
    return not nazev.rstrip().endswith(('.', ',', ';')) and len(nazev.split()) <= 14


def _kandidat(pdf_index: int, i: int, radek: str) -> _Kandidat | None:
    m = _NADPIS_MD.match(radek)
    if m:
        cislo, nazev = rozdel_cislo(m.group(2).strip().rstrip('#').strip())
        if not nazev or _VODITKA.search(nazev):
            return None
        uroven = len(m.group(1))
        ntice = _cislo_jako_ntice(cislo)
        if ntice and len(ntice) >= 2:
            uroven = len(ntice)  # „# 3.2 Rmutování" je podkapitola, ať je „#" kolik chce
        return _Kandidat(pdf_index, i, uroven, cislo, nazev, 'md')
    m = _NADPIS_SLOVEM.match(radek)
    if m:
        zbytek = m.group(2).strip()
        if zbytek and (zbytek[0].islower() or _CISLO_NA_KONCI.search(zbytek) or _VODITKA.search(zbytek)):
            return None  # „Kapitola 5 popisuje…" (odkaz ve větě) nebo řádek obsahu
        if zbytek and not _vypada_jako_nadpis(zbytek):
            return None
        return _Kandidat(pdf_index, i, 1, m.group(1), zbytek or radek, 'slovem')
    m = _NADPIS_CISLO.match(radek)
    if m:
        nazev = m.group(2).strip()
        if _VODITKA.search(nazev) or _CISLO_NA_KONCI.search(nazev) or not _vypada_jako_nadpis(nazev):
            return None
        cislo = m.group(1)
        return _Kandidat(pdf_index, i, cislo.count('.') + 1, cislo, nazev, 'cislo')
    return None


def _je_obsah(radky: list[str], kandidatu: int) -> bool:
    """Strana obsahu: nadpis „Obsah" nebo hodně řádků zakončených číslem strany."""
    neprazdne = [r.strip() for r in radky if r.strip()]
    if any(_OBSAH.match(r) for r in neprazdne[:5]):
        return True
    obsahovych = sum(1 for r in neprazdne if len(r) > 4 and (_VODITKA.search(r) or _CISLO_NA_KONCI.search(r)))
    return obsahovych >= 5 and obsahovych >= 0.3 * len(neprazdne) and kandidatu + obsahovych >= 5


def _navazuje(a: tuple[int, ...], b: tuple[int, ...]) -> bool:
    """Může nadpis b v knize přímo následovat po nadpisu a?

    Další sourozenec na kterékoli úrovni (3.2 → 3.3, 3.2 → 4, 3.2 → 4.1),
    i s jedním vynechaným (nadpis se nepodařilo přečíst), nebo první
    podkapitola (3.2 → 3.2.1).
    """
    if len(b) > len(a) and b[:len(a)] == a and all(x == 1 for x in b[len(a):]):
        return True
    for j in range(1, len(a) + 1):
        if b[:j - 1] == a[:j - 1] and len(b) >= j and b[j - 1] - a[j - 1] in (1, 2) and all(x == 1 for x in b[j:]):
            return True
    return False


def _nejdelsi_rada(cislovane: list[_Kandidat], okno: int = 60) -> set[int]:
    """Indexy kandidátů v nejdelší řadě navazujících čísel (v pořadí čtení).

    Falešné „nadpisy" (řádek seznamu „2.5 EBC…", číslo v textu) do řady
    nezapadnou; skutečné nadpisy knihy tvoří nejdelší navazující řadu.
    """
    n = len(cislovane)
    ntice = [_cislo_jako_ntice(k.cislo) or () for k in cislovane]
    delka = [1] * n
    predchozi: list[int | None] = [None] * n
    for j in range(n):
        for i in range(max(0, j - okno), j):
            if delka[i] + 1 > delka[j] and _navazuje(ntice[i], ntice[j]):
                delka[j], predchozi[j] = delka[i] + 1, i
    if not n:
        return set()
    konec = max(range(n), key=lambda x: (delka[x], -x))
    rada: set[int] = set()
    k: int | None = konec
    while k is not None:
        rada.add(k)
        k = predchozi[k]
    # Osamělý číslovaný řádek bez návaznosti (kniha s jediným nadpisem?) se nebere.
    return rada if len(rada) >= 2 else set()


def z_nadpisu(strany: list[tuple[int, str]], pocet_stran: int, okraje: dict[int, str] | None = None) -> list[Kapitola]:
    """Kapitoly z nadpisů v textu (když osnova není nebo nepokrývá knihu).

    Markdown nadpisy (z OCR, DOCX, EPUB) se berou na všech řádcích. Číslované
    nadpisy v holém textu („3.2 Rmutování", „Kapitola 4") jen tehdy, když
    zapadají do nejdelší navazující řady čísel. Strany obsahu a řádky živého
    záhlaví (`okraje`: pdf_index → úseky pásu záhlaví/zápatí) se přeskočí.
    """
    kandidati: list[_Kandidat] = []
    for pdf_index, text in strany:
        radky = (text or '').splitlines()
        okrajove = okrajove_radky(radky, (okraje or {}).get(pdf_index))
        na_strane = [k for i, r in enumerate(radky)
                     if i not in okrajove and r.strip() and (k := _kandidat(pdf_index, i, r.strip()))]
        if na_strane and _je_obsah(radky, len(na_strane)):
            continue
        kandidati.extend(na_strane)

    cislovane = [k for k in kandidati if k.druh != 'md']
    v_rade = _nejdelsi_rada(cislovane)
    prijate = {id(k) for i, k in enumerate(cislovane) if i in v_rade}
    kapitoly: list[Kapitola] = []
    videna_cisla: set[str] = set()
    for k in kandidati:
        if k.druh != 'md' and id(k) not in prijate:
            continue
        if k.cislo:
            # Stejné číslo podruhé (opakované záhlaví) = pořád tatáž kapitola.
            if k.cislo in videna_cisla:
                continue
            videna_cisla.add(k.cislo)
        elif kapitoly and kapitoly[-1].nazev == k.nazev[:300] and kapitoly[-1].cislo is None:
            continue
        kapitoly.append(Kapitola(
            poradi=len(kapitoly) + 1,
            uroven=min(MAX_UROVEN, k.uroven),
            nazev=k.nazev[:300],
            cislo=k.cislo,
            strana_od=k.pdf_index,
            strana_do=None,
            zdroj='nadpis',
            radek=k.radek,
        ))
    return dopln_rozsahy(kapitoly, pocet_stran, dict(strany))


# --- rozsahy, strom a úseky textu -------------------------------------------------

def _malo_textu_pred(texty: dict[int, str] | None, pdf_index: int, radek: int) -> bool:
    if not texty or radek <= 0:
        return True
    pred = (texty.get(pdf_index) or '').splitlines()[:radek]
    return sum(1 for r in pred for z in r if not z.isspace()) < MALO_ZNAKU


def dopln_rozsahy(kapitoly: list[Kapitola], pocet_stran: int, texty: dict[int, str] | None = None) -> list[Kapitola]:
    """Seřadí kapitoly podle místa v knize, doplní strom a rozsahy listů.

    Konec kapitoly = začátek další kapitoly (podle pořadí v knize, ne v osnově)
    se stejnou nebo vyšší úrovní; když jí na tom listu předchází jen záhlaví,
    končí kapitola o list dřív.
    """
    serazene = sorted((k for k in kapitoly if k.strana_od is not None), key=lambda k: (k.strana_od, k.radek))
    zasobnik: list[int] = []
    for i, k in enumerate(serazene):
        k.poradi = i + 1
        k.deti = []
        while zasobnik and serazene[zasobnik[-1]].uroven >= k.uroven:
            zasobnik.pop()
        k.rodic = zasobnik[-1] if zasobnik else None
        if k.rodic is not None:
            serazene[k.rodic].deti.append(i)
        zasobnik.append(i)
    for i, k in enumerate(serazene):
        konec = pocet_stran
        for dalsi in serazene[i + 1:]:
            if dalsi.uroven <= k.uroven:
                konec = dalsi.strana_od - 1 if _malo_textu_pred(texty, dalsi.strana_od, dalsi.radek) else dalsi.strana_od
                break
        k.strana_do = max(k.strana_od, min(konec, pocet_stran))
    return serazene


def useky(kapitoly: list[Kapitola], strany: list[tuple[int, str]]) -> list[tuple[int, str, int | None]]:
    """Text listů rozdělený v místech, kde začíná kapitola: (pdf_index, text, index kapitoly).

    `kapitoly` musí být z dopln_rozsahy (seřazené podle místa v knize).
    """
    zacatky: dict[int, list[tuple[int, int]]] = {}
    for i, k in enumerate(kapitoly):
        if k.strana_od is not None:
            zacatky.setdefault(k.strana_od, []).append((k.radek, i))
    vysledek: list[tuple[int, str, int | None]] = []
    aktualni: int | None = None
    posledni_list = 0
    for pdf_index, text in strany:
        # Kapitoly začínající na listech, které mezi stranami chybí (prázdné listy).
        for list_ in sorted(x for x in zacatky if posledni_list < x < pdf_index):
            aktualni = max(zacatky[list_])[1]
        posledni_list = pdf_index
        radky = (text or '').splitlines()
        hranice = sorted(zacatky.get(pdf_index, []))
        od = 0
        for radek, index in hranice:
            radek = min(max(radek, 0), len(radky))
            if radek > od:
                kus = '\n'.join(radky[od:radek])
                if kus.strip():
                    vysledek.append((pdf_index, kus, aktualni))
                od = radek
            aktualni = index
        kus = '\n'.join(radky[od:])
        if kus.strip() or not radky:
            vysledek.append((pdf_index, kus, aktualni))
    return vysledek


def kapitola_listu(kapitoly: list[Kapitola], strany: list[tuple[int, str]]) -> dict[int, int | None]:
    """Kapitola, ve které list začíná (pro procházení po stranách)."""
    vysledek: dict[int, int | None] = {}
    for pdf_index, _text, kap in useky(kapitoly, strany):
        vysledek.setdefault(pdf_index, kap)
    return vysledek
