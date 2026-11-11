"""📖 Dodatek k PDF knihy — vyvážený strom stran, aby appka otevřela stranu hned.

Čtečka bible ukazuje stranu tak, jak vypadá v originále (src/lib/biblePdf.ts):
pdf.js stahuje z úložiště jen kousky souboru, které potřebuje. Jenže při
otevření si pdf.js ověřuje poslední stranu, a když má kniha „plochý" strom
stran (všechny strany jako děti jednoho uzlu — tak PDF ukládá spousta
programů, hlavně skenery), musí přečíst slovník KAŽDÉ strany. Ty leží
rozházené mezi obrázky po celém souboru: na 40MB knize to bylo 22–26 MB
a stovky dotazů, než se ukázala první strana (měřeno 4. a 11. 11. 2026).

Originál se neupravuje (zásada knihovny). Dodatek je přírůstková aktualizace
PDF (norma PDF, kap. 7.5.6), kterou si appka přilepí za originál jen u sebe
v paměti:

  • nové uzly stromu stran s /Count — vyvážený strom, každá strana pod
    vlastním obalem; pdf.js podle /Count přeskočí, co nehledá, a z originálu
    přečte jen slovník hledané strany;
  • katalog pod stejným číslem objektu, jen s /Pages na nový kořen;
  • objektový proud a proud křížových odkazů (komprimované, pár kB) s /Prev
    na poslední tabulku originálu.

Strany, obsah, písma a obrázky zůstávají v originále beze změny. Strany se
dál odkazují /Parent na původní uzly, takže zděděné vlastnosti (/Resources,
/MediaBox, /Rotate…) najde pdf.js i pdfium stejně jako dřív. V dodatku je
jen struktura — žádný text ani obrázek knihy.

Dodatek vznikne jen z čistého PDF (pypdf ve striktním režimu) bez šifrování,
s jednoznačným stromem stran, a jen když opravdu ušetří. Než se uloží, ověří
se: pořadí stran v novém stromu je stejné jako v originále; pdf.js (simulace
jeho hledání strany, Catalog.getPageDict) najde každou stranu a z originálu
přitom čte jen její slovník; pdfium (nezávislá knihovna) přečte z originálu
s dodatkem stejný počet stran se stejnými rozměry jako z holého originálu.

Starší knihy se doplňují bez stažení celého souboru: RozsahovySoubor čte
z úložiště jen kousky (HTTP Range), které pypdf a pdfium opravdu potřebují.
"""
from __future__ import annotations

import io
import threading
import zlib
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import BinaryIO, Callable, Iterable

import pypdfium2 as pdfium
from pypdf import PdfReader
from pypdf.generic import ArrayObject, DictionaryObject, IndirectObject, NameObject, PdfObject

# Verze tvaru dodatku. Zvýšit, když se změní stavba — starší řádky v
# bible_dodatky se pak postaví znovu (bible_bez_dodatku bere verzi).
VERZE = 1
# Dětí jednoho uzlu nad obaly stran. Uzly leží v dodatku (v paměti appky), na
# počtu čtení z úložiště nezáleží — jen na velikosti dodatku a hloubce stromu.
VETVENI = 8
# Nejvýš tolik uzlů v jednom objektovém proudu: pdf.js rozbalí celý proud,
# když z něj potřebuje jediný objekt.
V_PROUDU = 500
# Velikost kousku, po kterém pdf.js v appce čte soubor (rangeChunkSize v
# src/lib/biblePdf.ts) — jednotka „ceny" otevření strany.
KUS = 64 * 1024
# Dodatek se vyplatí, když ušetří aspoň tolik kousků (jinak „strom_staci").
PRAH_USPORY = 4
# Strop velikosti dodatku (CHECK v bible_dodatky je o něco vyšší).
MAX_DODATKU = 1_500_000
MAX_HLOUBKA = 64

# Proč dodatek není (sloupec bible_dodatky.duvod; CHECK v migraci se musí shodovat).
DUVODY = ('strom_staci', 'sifrovane', 'struktura', 'kontrola', 'velky', 'rozsah', 'chyba')

Ref = tuple[int, int]


class BezDodatku(Exception):
    """Dodatek se nepostaví — `duvod` je jeden z DUVODY (žádný text z knihy)."""

    def __init__(self, duvod: str):
        if duvod not in DUVODY:
            raise ValueError(duvod)
        super().__init__(duvod)
        self.duvod = duvod


class ChybaCteni(Exception):
    """Soubor se nepodařilo přečíst (síť, úložiště) — zkusí se dalším během."""


class PrilisDat(Exception):
    """Čtení po kouscích by stáhlo víc, než je rozpočet — dodatek se nedělá."""


@dataclass
class Dodatek:
    data: bytes
    delka_originalu: int
    stran: int
    # Kolik 64kB kousků z originálu pdf.js načte při otevření (poslední strana
    # + strana uprostřed) — bez dodatku a s ním (simulace).
    kusu_pred: int
    kusu_po: int


# --- soubory: po kouscích z úložiště a originál s dodatkem -----------------------

class RozsahovySoubor(io.RawIOBase):
    """Soubor v úložišti čtený po kouscích (HTTP Range) — kniha se nestahuje celá.

    `cti(od, do_)` vrátí bajty od `od` do `do_` (bez něj). Přečtené bloky se
    pamatují; `predem` načte víc úseků souběžně (slovníky stran rozházené po
    souboru by jinak šly dotaz po dotazu). Překročení `rozpocet` bajtů = PrilisDat.
    """

    def __init__(self, cti: Callable[[int, int], bytes], delka: int, blok: int = 4096,
                 rozpocet: int | None = None, soubezne: int = 6):
        super().__init__()
        self._cti = cti
        self._delka = int(delka)
        self._blok = blok
        self._rozpocet = rozpocet
        self._soubezne = soubezne
        self._pozice = 0
        self._bloky: dict[int, bytes] = {}
        self._zamek = threading.Lock()
        self.stazeno = 0
        self.dotazu = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self._pozice

    def seek(self, pozice: int, odkud: int = io.SEEK_SET) -> int:
        if odkud == io.SEEK_SET:
            nova = pozice
        elif odkud == io.SEEK_CUR:
            nova = self._pozice + pozice
        elif odkud == io.SEEK_END:
            nova = self._delka + pozice
        else:
            raise ValueError(odkud)
        if nova < 0:
            raise ValueError('záporná pozice')
        self._pozice = nova
        return nova

    def readinto(self, b) -> int:
        n = min(len(b), max(0, self._delka - self._pozice))
        if n <= 0:
            return 0
        b[:n] = self._precti(self._pozice, self._pozice + n)
        self._pozice += n
        return n

    def _behy(self, od: int, do_: int) -> list[tuple[int, int]]:
        """Chybějící bloky mezi `od` a `do_` jako souvislé úseky bloků (nejvýš 64 kB)."""
        behy: list[tuple[int, int]] = []
        prvni = od // self._blok
        posledni = (min(do_, self._delka) - 1) // self._blok
        zacatek = None
        for i in range(prvni, posledni + 1):
            chybi = i not in self._bloky
            if chybi and zacatek is None:
                zacatek = i
            if zacatek is not None and (not chybi or (i - zacatek) * self._blok >= KUS):
                behy.append((zacatek, i))
                zacatek = i if chybi else None
        if zacatek is not None:
            behy.append((zacatek, posledni + 1))
        return behy

    def _stahni(self, beh: tuple[int, int]) -> None:
        od, do_ = beh[0] * self._blok, min(beh[1] * self._blok, self._delka)
        with self._zamek:
            if self._rozpocet is not None and self.stazeno + (do_ - od) > self._rozpocet:
                raise PrilisDat('rozpočet čtení po kouscích překročen')
            self.stazeno += do_ - od
            self.dotazu += 1
        try:
            data = self._cti(od, do_)
        except Exception as e:  # noqa: BLE001 — chyba sítě či úložiště: jen typ, bez adresy
            raise ChybaCteni(type(e).__name__) from e
        if len(data) != do_ - od:
            raise ChybaCteni('úložiště vrátilo kousek jiné délky')
        with self._zamek:
            for i in range(beh[0], beh[1]):
                self._bloky[i] = data[(i - beh[0]) * self._blok:(i - beh[0] + 1) * self._blok]

    def _precti(self, od: int, do_: int) -> bytes:
        for beh in self._behy(od, do_):
            self._stahni(beh)
        prvni, posledni = od // self._blok, (do_ - 1) // self._blok
        spojene = b''.join(self._bloky[i] for i in range(prvni, posledni + 1))
        return spojene[od - prvni * self._blok:do_ - prvni * self._blok]

    def predem(self, useky: Iterable[tuple[int, int]]) -> None:
        """Souběžně načte úseky (od, do_), které bude čtení brzy potřebovat."""
        # Nejdřív všechny chybějící bloky, pak souvislé běhy — překrývající se
        # úseky (objekty blízko sebe) nesmí stáhnout stejný blok dvakrát.
        chybi: set[int] = set()
        for od, do_ in useky:
            od, do_ = max(0, od), min(do_, self._delka)
            if od < do_:
                chybi.update(i for i in range(od // self._blok, (do_ - 1) // self._blok + 1) if i not in self._bloky)
        behy: list[tuple[int, int]] = []
        for i in sorted(chybi):
            if behy and behy[-1][1] == i and (i - behy[-1][0]) * self._blok < KUS:
                behy[-1] = (behy[-1][0], i + 1)
            else:
                behy.append((i, i + 1))
        if not behy:
            return
        with ThreadPoolExecutor(max_workers=self._soubezne) as prace:
            for _ in prace.map(self._stahni, behy):
                pass


class SpojenySoubor(io.RawIOBase):
    """Originál a za ním dodatek — tak, jak ho uvidí pdf.js v appce."""

    def __init__(self, original: BinaryIO, delka: int, dodatek: bytes):
        super().__init__()
        self._original = original
        self._delka = int(delka)
        self._dodatek = dodatek
        self._pozice = 0

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self._pozice

    def seek(self, pozice: int, odkud: int = io.SEEK_SET) -> int:
        celkem = self._delka + len(self._dodatek)
        nova = {io.SEEK_SET: pozice, io.SEEK_CUR: self._pozice + pozice, io.SEEK_END: celkem + pozice}[odkud]
        if nova < 0:
            raise ValueError('záporná pozice')
        self._pozice = nova
        return nova

    def readinto(self, b) -> int:
        celkem = self._delka + len(self._dodatek)
        n = min(len(b), max(0, celkem - self._pozice))
        hotovo = 0
        while hotovo < n:
            p = self._pozice + hotovo
            if p < self._delka:
                kolik = min(n - hotovo, self._delka - p)
                self._original.seek(p)
                kus = self._original.read(kolik)
                if len(kus) != kolik:
                    raise ChybaCteni('originál je kratší, než má být')
            else:
                kus = self._dodatek[p - self._delka:p - self._delka + (n - hotovo)]
            b[hotovo:hotovo + len(kus)] = kus
            hotovo += len(kus)
        self._pozice += n
        return n


class _Tichy(io.RawIOBase):
    """Pro pdfium: chyba čtení se nesmí vyhodit z volání z C (ctypes by ji jen
    vypsal) — zapamatuje se a pdfium dostane „nepřečteno"."""

    def __init__(self, soubor: BinaryIO):
        super().__init__()
        self._soubor = soubor
        self.chyba: BaseException | None = None

    def readable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def tell(self) -> int:
        return self._soubor.tell()

    def seek(self, pozice: int, odkud: int = io.SEEK_SET) -> int:
        return self._soubor.seek(pozice, odkud)

    def readinto(self, b) -> int:
        if self.chyba is not None:
            return 0
        try:
            return self._soubor.readinto(b)
        except Exception as e:  # noqa: BLE001 — vyhodnotí se po návratu z pdfium
            self.chyba = e
            return 0


# --- strom stran originálu --------------------------------------------------------

def _ref(o: IndirectObject) -> Ref:
    return (int(o.idnum), int(o.generation))


def _je_cislo(v: object) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _hodnota(d: DictionaryObject, klic: str) -> PdfObject | None:
    """Hodnota klíče; nepřímý odkaz se dočte (jako pdf.js getRaw + fetch)."""
    if klic not in d:
        return None
    v = d.raw_get(klic)
    return v.get_object() if isinstance(v, IndirectObject) else v


def _umisteni(reader: PdfReader, ref: IndirectObject | Ref) -> int | None:
    """Kde objekt v souboru začíná (u objektu v objektovém proudu: začátek proudu)."""
    num, gen = _ref(ref) if isinstance(ref, IndirectObject) else ref
    xref = getattr(reader, 'xref', {}) or {}
    objstm = getattr(reader, 'xref_objStm', {}) or {}
    if gen == 0 and num in objstm:
        return xref.get(0, {}).get(objstm[num][0])
    return xref.get(gen, {}).get(num)


def _predem(reader: PdfReader, soubor: object, refy: list[IndirectObject]) -> None:
    """Rozsahovému souboru řekne, které objekty se budou číst (souběžné stažení)."""
    predem = getattr(soubor, 'predem', None)
    if predem is None:
        return
    useky = set()
    for r in refy:
        zacatek = _umisteni(reader, r)
        if zacatek is not None:
            useky.add((zacatek, zacatek + 2048))
    predem(useky)


def precti_strom(reader: PdfReader, soubor: object = None) -> list[Ref]:
    """Slovníky stran v pořadí, jak je čtou pdf.js i pdfium.

    Jen jednoznačný strom: uzel je buď /Type /Pages s /Kids, nebo /Type /Page
    bez /Kids; každé dítě je nepřímý odkaz, nic se neopakuje (ani cyklus)
    a /Count každého uzlu sedí na počet stran pod ním. Čtečky se v ostatních
    případech rozcházejí — takové PDF dodatek nedostane.
    """
    trailer = reader.trailer
    koren_kat = trailer.raw_get('/Root') if '/Root' in trailer else None
    if not isinstance(koren_kat, IndirectObject):
        raise BezDodatku('struktura')
    katalog = koren_kat.get_object()
    if not isinstance(katalog, DictionaryObject):
        raise BezDodatku('struktura')
    pages = katalog.raw_get('/Pages') if '/Pages' in katalog else None
    if not isinstance(pages, IndirectObject):
        raise BezDodatku('struktura')
    koren = _ref(pages)
    deti: dict[Ref, list[Ref]] = {}
    pocty: dict[Ref, int] = {}
    videne: set[Ref] = {koren}
    vrstva = [pages]
    for _ in range(MAX_HLOUBKA):
        if not vrstva:
            break
        _predem(reader, soubor, vrstva)
        dalsi: list[IndirectObject] = []
        for ref in vrstva:
            uzel = ref.get_object()
            if not isinstance(uzel, DictionaryObject):
                raise BezDodatku('struktura')
            typ = _hodnota(uzel, '/Type')
            ma_deti = '/Kids' in uzel
            if typ == '/Page' and not ma_deti:
                continue
            if typ != '/Pages' or not ma_deti:
                raise BezDodatku('struktura')
            kids, pocet = _hodnota(uzel, '/Kids'), _hodnota(uzel, '/Count')
            if not isinstance(kids, ArrayObject) or not _je_cislo(pocet) or pocet < 0:
                raise BezDodatku('struktura')
            seznam: list[Ref] = []
            for k in kids:
                if not isinstance(k, IndirectObject):
                    raise BezDodatku('struktura')
                kk = _ref(k)
                if kk in videne:
                    raise BezDodatku('struktura')
                videne.add(kk)
                seznam.append(kk)
                dalsi.append(k)
            deti[_ref(ref)] = seznam
            pocty[_ref(ref)] = int(pocet)
        vrstva = dalsi
    else:
        if vrstva:
            raise BezDodatku('struktura')
    if koren not in deti:
        raise BezDodatku('struktura')

    listy: list[Ref] = []
    spocteno: dict[Ref, int] = {}
    zasobnik: list[tuple[Ref, bool]] = [(koren, False)]
    while zasobnik:
        klic, zpet = zasobnik.pop()
        if klic not in deti:
            listy.append(klic)
            continue
        if zpet:
            n = sum(spocteno[k] if k in deti else 1 for k in deti[klic])
            if n != pocty[klic]:
                raise BezDodatku('struktura')
            spocteno[klic] = n
            continue
        zasobnik.append((klic, True))
        zasobnik.extend((k, False) for k in reversed(deti[klic]))
    if not listy:
        raise BezDodatku('struktura')
    return listy


# --- simulace pdf.js --------------------------------------------------------------

class Simulace:
    """Hledání strany tak, jak ho dělá pdf.js (Catalog.getPageDict, pdf.js 6.4).

    Zapisuje, ze kterých 64kB kousků originálu by pdf.js četl (`mista`).
    Objekty z dodatku (od `delka_originalu` dál) má appka v paměti — nepočítají
    se. Mezipaměti (počty pod uzly, načtené děti kořene) přetrvávají mezi
    voláními `strana` stejně jako v pdf.js.
    """

    def __init__(self, reader: PdfReader, delka_originalu: int, kus: int = KUS):
        self._reader = reader
        self._delka = delka_originalu
        self._kus = kus
        self.mista: set[int] = set()
        self._pocty: dict[Ref, int] = {}
        self._nactene_deti: set[Ref] = set()
        self._objid: dict[int, Ref] = {}
        katalog = self._nacti(reader.trailer.raw_get('/Root'))
        if not isinstance(katalog, DictionaryObject) or '/Pages' not in katalog:
            raise BezDodatku('kontrola')
        self._pages = katalog.raw_get('/Pages')
        self._koren = self._nacti(self._pages) if isinstance(self._pages, IndirectObject) else self._pages
        if not isinstance(self._koren, DictionaryObject):
            raise BezDodatku('kontrola')
        if isinstance(self._pages, IndirectObject):
            self._objid[id(self._koren)] = _ref(self._pages)
        pocet = self._hodnota(self._koren, '/Count')
        self.stran = int(pocet) if _je_cislo(pocet) else 0

    def misto(self, ref: IndirectObject | Ref) -> int | None:
        zacatek = _umisteni(self._reader, ref)
        if zacatek is None or zacatek >= self._delka:
            return None
        return zacatek // self._kus

    def _nacti(self, ref: IndirectObject) -> PdfObject:
        m = self.misto(ref)
        if m is not None:
            self.mista.add(m)
        return ref.get_object()

    def _hodnota(self, d: DictionaryObject, klic: str) -> PdfObject | None:
        if klic not in d:
            return None
        v = d.raw_get(klic)
        return self._nacti(v) if isinstance(v, IndirectObject) else v

    def strana(self, index: int) -> Ref:
        uzly: list[object] = [self._koren]
        navstivene: set[Ref] = {_ref(self._pages)} if isinstance(self._pages, IndirectObject) else set()
        aktualni = 0
        while uzly:
            uzel = uzly.pop()
            if isinstance(uzel, IndirectObject):
                klic = _ref(uzel)
                pocet = self._pocty.get(klic)
                if pocet is not None and aktualni + pocet <= index:
                    aktualni += pocet
                    continue
                if klic in navstivene:
                    raise BezDodatku('kontrola')
                navstivene.add(klic)
                obj = self._nacti(uzel)
                if isinstance(obj, DictionaryObject):
                    typ = self._hodnota(obj, '/Type')
                    if typ == '/Page' or '/Kids' not in obj:
                        self._pocty.setdefault(klic, 1)
                        if aktualni == index:
                            return klic
                        aktualni += 1
                        continue
                    self._objid[id(obj)] = klic
                uzly.append(obj)
                continue
            if not isinstance(uzel, DictionaryObject):
                raise BezDodatku('kontrola')
            klic_uzlu = self._objid.get(id(uzel))
            pocet = self._hodnota(uzel, '/Count')
            if _je_cislo(pocet) and pocet >= 0:
                if klic_uzlu is not None:
                    self._pocty.setdefault(klic_uzlu, int(pocet))
                if aktualni + pocet <= index:
                    aktualni += int(pocet)
                    continue
            kids = self._hodnota(uzel, '/Kids')
            if not isinstance(kids, ArrayObject):
                raise BezDodatku('kontrola')
            for k in reversed(kids):
                uzly.append(k)
                # pdf.js stahuje děti kořene předem a souběžně (pageDictCache).
                if uzel is self._koren and isinstance(k, IndirectObject) and _ref(k) not in self._nactene_deti:
                    self._nactene_deti.add(_ref(k))
                    self._nacti(k)
        raise BezDodatku('kontrola')


def kusu_pri_otevreni(reader: PdfReader, delka_originalu: int, kus: int = KUS) -> int:
    """Kolik kousků originálu pdf.js načte: kontrola poslední strany a strana uprostřed."""
    sim = Simulace(reader, delka_originalu, kus)
    if sim.stran < 1:
        raise BezDodatku('struktura')
    sim.strana(sim.stran - 1)
    sim.strana(sim.stran // 2)
    return len(sim.mista)


# --- stavba dodatku ---------------------------------------------------------------

def posledni_startxref(soubor: BinaryIO, delka: int) -> int:
    """Hodnota posledního `startxref` — jak ho hledá pdf.js (odzadu)."""
    for okno in (2048, 65536):
        od = max(0, delka - okno)
        soubor.seek(od)
        konec = soubor.read(delka - od)
        i = konec.rfind(b'startxref')
        if i >= 0:
            j = i + len(b'startxref')
            while j < len(konec) and konec[j:j + 1] in b' \t\r\n\x0c\x00':
                j += 1
            k = j
            while k < len(konec) and konec[k:k + 1].isdigit():
                k += 1
            if k > j:
                return int(konec[j:k])
            break
        if od == 0:
            break
    raise BezDodatku('struktura')


def _bajty(obj: PdfObject) -> bytes:
    b = io.BytesIO()
    obj.write_to_stream(b)
    return b.getvalue()


def _sestav(reader: PdfReader, listy: list[Ref], delka: int, startxref: int) -> bytes:
    trailer = reader.trailer
    velikost = trailer['/Size']
    if not _je_cislo(velikost) or velikost < 1:
        raise BezDodatku('struktura')
    velikost = int(velikost)
    # Nová čísla objektů začínají na /Size; v originále nesmí být žádné vyšší
    # (nový objekt by ho pro čtečky zakryl).
    nejvyssi = max([n for g in (reader.xref or {}).values() for n in g] + list((reader.xref_objStm or {}).keys()) + [0])
    if nejvyssi >= velikost:
        raise BezDodatku('struktura')
    kat_ref = trailer.raw_get('/Root')
    katalog = kat_ref.get_object()

    # Strom: obal každé strany (Count 1) → uzly po VETVENI → kořen.
    dalsi = velikost
    uroven: list[tuple[int, list[Ref], int]] = []
    for list_ in listy:
        uroven.append((dalsi, [list_], 1))
        dalsi += 1
    vsechny = list(uroven)
    rodic: dict[int, int] = {}
    while len(uroven) > 1:
        nova: list[tuple[int, list[Ref], int]] = []
        for i in range(0, len(uroven), VETVENI):
            skupina = uroven[i:i + VETVENI]
            for cislo, _, _ in skupina:
                rodic[cislo] = dalsi
            nova.append((dalsi, [(c, 0) for c, _, _ in skupina], sum(p for _, _, p in skupina)))
            dalsi += 1
        vsechny.extend(nova)
        uroven = nova
    koren = uroven[0][0]

    def uzel(cislo: int, deti: list[Ref], pocet: int) -> bytes:
        rodic_txt = f' /Parent {rodic[cislo]} 0 R' if cislo in rodic else ''
        kids = ' '.join(f'{n} {g} R' for n, g in deti)
        return f'<< /Type /Pages{rodic_txt} /Kids [{kids}] /Count {pocet} >>'.encode('ascii')

    # Uzly do objektových proudů (komprimované; generace 0).
    proudy: list[tuple[int, int, int, bytes]] = []
    v_proudu: dict[int, tuple[int, int]] = {}
    for k in range(0, len(vsechny), V_PROUDU):
        cast = vsechny[k:k + V_PROUDU]
        cislo_proudu = dalsi
        dalsi += 1
        hlavicka: list[str] = []
        telo = bytearray()
        for poradi, (cislo, deti, pocet) in enumerate(cast):
            hlavicka.append(f'{cislo} {len(telo)}')
            telo += uzel(cislo, deti, pocet) + b'\n'
            v_proudu[cislo] = (cislo_proudu, poradi)
        h = (' '.join(hlavicka) + '\n').encode('ascii')
        proudy.append((cislo_proudu, len(cast), len(h), zlib.compress(h + bytes(telo), 9)))
    cislo_xref = dalsi

    out = bytearray(b'\n')
    pozice: dict[int, int] = {}
    for cislo_proudu, n, prvni, data in proudy:
        pozice[cislo_proudu] = delka + len(out)
        out += (f'{cislo_proudu} 0 obj\n<< /Type /ObjStm /N {n} /First {prvni} /Filter /FlateDecode'
                f' /Length {len(data)} >>\nstream\n').encode('ascii') + data + b'\nendstream\nendobj\n'

    # Katalog pod stejným číslem a generací, jen /Pages ukazuje na nový kořen.
    novy = DictionaryObject()
    for klic in katalog.keys():
        novy[NameObject(klic)] = katalog.raw_get(klic)
    novy[NameObject('/Pages')] = IndirectObject(koren, 0, reader)
    kat_num, kat_gen = _ref(kat_ref)
    pozice_kat = delka + len(out)
    out += f'{kat_num} {kat_gen} obj\n'.encode('ascii') + _bajty(novy) + b'\nendobj\n'

    # Proud křížových odkazů: katalog + nové objekty (velikost..cislo_xref).
    pozice[cislo_xref] = delka + len(out)
    radky: list[tuple[int, int, int]] = [(1, pozice_kat, kat_gen)]
    for cislo in range(velikost, cislo_xref + 1):
        if cislo in v_proudu:
            radky.append((2, v_proudu[cislo][0], v_proudu[cislo][1]))
        else:
            radky.append((1, pozice[cislo], 0))
    sirka = max(1, (max(r[1] for r in radky).bit_length() + 7) // 8)
    if max(r[2] for r in radky) > 0xFFFF:
        raise BezDodatku('struktura')
    surove = b''.join(bytes([t]) + a.to_bytes(sirka, 'big') + b.to_bytes(2, 'big') for t, a, b in radky)
    xref_data = zlib.compress(surove, 9)
    dalsi_klice = b''
    for klic in ('/Info', '/ID'):
        if klic in trailer:
            dalsi_klice += f' {klic} '.encode('ascii') + _bajty(trailer.raw_get(klic))
    out += (f'{cislo_xref} 0 obj\n<< /Type /XRef /Size {cislo_xref + 1} /W [1 {sirka} 2]'
            f' /Index [{kat_num} 1 {velikost} {cislo_xref - velikost + 1}]'
            f' /Root {kat_num} {kat_gen} R /Prev {startxref}').encode('ascii') + dalsi_klice + (
            f' /Filter /FlateDecode /Length {len(xref_data)} >>\nstream\n').encode('ascii') + xref_data + (
            f'\nendstream\nendobj\nstartxref\n{pozice[cislo_xref]}\n%%EOF\n').encode('ascii')
    return bytes(out)


# --- kontrola a celý postup -------------------------------------------------------

def _over_pdfium(original: BinaryIO, delka: int, data: bytes, stran: int) -> None:
    """Nezávislá knihovna: stejný počet stran a rozměry s dodatkem i bez něj."""
    a, b = _Tichy(original), _Tichy(SpojenySoubor(original, delka, data))
    dok_a = dok_b = None
    try:
        try:
            dok_a, dok_b = pdfium.PdfDocument(a), pdfium.PdfDocument(b)
            if len(dok_a) != stran or len(dok_b) != stran:
                raise BezDodatku('kontrola')
            for i in range(stran):
                if dok_a.get_page_size(i) != dok_b.get_page_size(i):
                    raise BezDodatku('kontrola')
        except pdfium.PdfiumError:
            raise BezDodatku('kontrola') from None
    finally:
        for d in (dok_b, dok_a):
            if d is not None:
                d.close()
        for t in (a, b):
            if t.chyba is not None:
                raise t.chyba


def postav(soubor: BinaryIO, delka: int, *, kontrola_pdfium: bool = True, kus: int = KUS) -> Dodatek:
    """Postaví a ověří dodatek k PDF v `soubor` (délka `delka` bajtů).

    BezDodatku = dodatek nebude (důvod jde do databáze, zkoušet znovu nemá
    smysl). ChybaCteni = soubor nešlo přečíst (zkusí se příště). PrilisDat
    se převede na BezDodatku('rozsah'). `kus` jen pro testy s malými soubory.
    """
    try:
        return _postav(soubor, delka, kontrola_pdfium, kus)
    except PrilisDat:
        raise BezDodatku('rozsah') from None


def _postav(soubor: BinaryIO, delka: int, kontrola_pdfium: bool, kus: int) -> Dodatek:
    try:
        reader = PdfReader(soubor, strict=True)
        if '/Encrypt' in reader.trailer:
            raise BezDodatku('sifrovane')
        listy = precti_strom(reader, soubor)
        kusu_pred = kusu_pri_otevreni(reader, delka, kus)
        startxref = posledni_startxref(soubor, delka)
    except (BezDodatku, ChybaCteni, PrilisDat):
        raise
    except Exception:  # noqa: BLE001 — pypdf ve striktním režimu: nečisté PDF
        raise BezDodatku('struktura') from None
    # pypdf a pdf.js musí začínat od stejné tabulky (u divných konců souboru se liší).
    od_pypdf = getattr(reader, '_startxref', None)
    if _je_cislo(od_pypdf) and od_pypdf != startxref:
        raise BezDodatku('struktura')
    # Malý strom nebo strom, ve kterém pdf.js už skoro nic nehledá: není co zrychlit.
    if kusu_pred < PRAH_USPORY + 2:
        raise BezDodatku('strom_staci')

    try:
        data = _sestav(reader, listy, delka, startxref)
    except BezDodatku:
        raise
    except Exception:  # noqa: BLE001 — nečekaný tvar slovníku katalogu apod.
        raise BezDodatku('struktura') from None
    if len(data) > MAX_DODATKU:
        raise BezDodatku('velky')

    # Kontrola 1 a 2: originál s dodatkem přečte pypdf (striktně), strom dává
    # stejné pořadí stran a pdf.js najde každou stranu jen z jejího slovníku.
    try:
        spojeny = PdfReader(SpojenySoubor(soubor, delka, data), strict=True)
        if '/Encrypt' in spojeny.trailer or precti_strom(spojeny) != listy:
            raise BezDodatku('kontrola')
        for i, ocekavany in enumerate(listy):
            sim = Simulace(spojeny, delka, kus)
            if sim.stran != len(listy) or sim.strana(i) != ocekavany:
                raise BezDodatku('kontrola')
            vlastni = sim.misto(ocekavany)
            if sim.mista - ({vlastni} if vlastni is not None else set()):
                raise BezDodatku('kontrola')
        kusu_po = kusu_pri_otevreni(spojeny, delka, kus)
    except (BezDodatku, ChybaCteni, PrilisDat):
        raise
    except Exception:  # noqa: BLE001 — cokoli jiného v kontrole = dodatek se neuloží
        raise BezDodatku('kontrola') from None
    if kusu_pred - kusu_po < PRAH_USPORY:
        raise BezDodatku('strom_staci')

    # Kontrola 3: pdfium.
    if kontrola_pdfium:
        _over_pdfium(soubor, delka, data, len(listy))
    return Dodatek(data=data, delka_originalu=delka, stran=len(listy), kusu_pred=kusu_pred, kusu_po=kusu_po)
