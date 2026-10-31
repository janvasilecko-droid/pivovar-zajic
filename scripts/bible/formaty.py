"""Dokumenty bez pevných stran (TXT, MD, DOCX, EPUB, CSV, XLSX) → části textu.

Tyhle formáty tištěná čísla stran nemají. Text se proto rozdělí na části
(≈ 3 000 znaků) a citace pak řekne „část č. X" (zadání: nevymýšlet čísla
stran). Nadpisy se převedou na markdown („# …"), ze kterých vzniknou
kapitoly stejně jako u přepsaných skenů.

Zásada: nic tiše neztratit. Co převést nejde (obrázky v DOCX/EPUB, chybějící
kapitola EPUBu, list širší než MAX_SLOUPCU), se spočítá a ohlásí — dokument
pak skončí „ke kontrole", ne „hotovo".
"""
from __future__ import annotations

import codecs
import csv
import io
import posixpath
import re
import zipfile
from dataclasses import dataclass, field
from datetime import date, datetime, time
from html.parser import HTMLParser
from urllib.parse import unquote
from xml.etree import ElementTree

CAST_ZNAKU = 3000
MAX_SLOUPCU = 512


@dataclass
class Text:
    """Text dokumentu a co se z něj převést nepodařilo."""
    text: str
    obrazku: int = 0
    varovani: list[str] = field(default_factory=list)


# --- dělení na části ----------------------------------------------------------

_ODDELOVAC_TABULKY = re.compile(r'^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$')


def _rozdel_radek(radek: str, cil: int) -> list[str]:
    """Řádek delší než cíl → kusy po slovech (nouzově natvrdo)."""
    kusy: list[str] = []
    aktualni = ''
    for slovo in radek.split(' '):
        while len(slovo) > cil:
            if aktualni:
                kusy.append(aktualni)
                aktualni = ''
            kusy.append(slovo[:cil])
            slovo = slovo[cil:]
        if aktualni and len(aktualni) + 1 + len(slovo) > cil:
            kusy.append(aktualni)
            aktualni = slovo
        else:
            aktualni = f'{aktualni} {slovo}' if aktualni else slovo
    if aktualni:
        kusy.append(aktualni)
    return kusy


def _kusy_odstavce(odstavec: str, cil: int) -> list[str]:
    """Odstavec delší než cíl (TXT bez prázdných řádků, velká tabulka) → kusy po
    řádcích; tabulka zopakuje v každém kusu hlavičku, nadpis začne nový kus."""
    if len(odstavec) <= cil:
        return [odstavec]
    radky = odstavec.split('\n')
    hlavicka: list[str] = []
    if radky[0].lstrip().startswith('|') and len(radky) > 1 and _ODDELOVAC_TABULKY.match(radky[1].strip()):
        hlavicka, radky = radky[:2], radky[2:]
    zaklad = sum(len(r) + 1 for r in hlavicka)
    kusy: list[str] = []
    aktualni: list[str] = []
    delka = zaklad
    for radek in radky:
        for kus in (_rozdel_radek(radek, max(200, cil - zaklad)) if len(radek) > cil - zaklad else [radek]):
            if aktualni and (delka + len(kus) > cil or kus.startswith('#')):
                kusy.append('\n'.join(hlavicka + aktualni))
                aktualni, delka = [], zaklad
            aktualni.append(kus)
            delka += len(kus) + 1
    if aktualni:
        kusy.append('\n'.join(hlavicka + aktualni))
    return kusy


def na_casti(text: str, cil: int = CAST_ZNAKU) -> list[str]:
    """Text → části po odstavcích; nadpis začíná novou část, když je ta stará dost dlouhá."""
    casti: list[str] = []
    aktualni: list[str] = []
    delka = 0
    for odstavec in re.split(r'\n\s*\n', (text or '').replace('\r\n', '\n').replace('\r', '\n')):
        odstavec = odstavec.strip()
        if not odstavec:
            continue
        for kus in _kusy_odstavce(odstavec, cil):
            nadpis = kus.startswith('#')
            if aktualni and (delka + len(kus) > cil or (nadpis and delka > cil // 3)):
                casti.append('\n\n'.join(aktualni))
                aktualni, delka = [], 0
            aktualni.append(kus)
            delka += len(kus) + 2
    if aktualni:
        casti.append('\n\n'.join(aktualni))
    return casti


# --- kódování textu ------------------------------------------------------------

def dekoduj_text(data: bytes) -> str:
    """Bajty textového souboru → text.

    Podle BOM UTF-32/16/8; UTF-16 bez BOM poznat podle nul; UTF-8 s pár vadnými
    bajty (pomlčka vložená z jiného kódování) zůstane UTF-8 s náhradním znakem
    — jinak by se celý text přečetl jako cp1250 a rozbily by se všechny háčky.
    """
    if data.startswith((codecs.BOM_UTF32_LE, codecs.BOM_UTF32_BE)):
        return data.decode('utf-32', errors='replace')
    if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return data.decode('utf-16', errors='replace')
    if data.startswith(codecs.BOM_UTF8):
        return data[len(codecs.BOM_UTF8):].decode('utf-8', errors='replace')
    vzorek = data[:4000]
    pul = len(vzorek) // 2
    if pul >= 2:
        nul_sude, nul_liche = vzorek[0::2].count(0), vzorek[1::2].count(0)
        if nul_liche > 0.3 * pul and nul_sude < 0.05 * pul:
            return data.decode('utf-16-le', errors='replace')
        if nul_sude > 0.3 * pul and nul_liche < 0.05 * pul:
            return data.decode('utf-16-be', errors='replace')
    try:
        return data.decode('utf-8')
    except UnicodeDecodeError:
        pass
    nahradni = data.decode('utf-8', errors='replace')
    if nahradni.count('�') <= max(3, len(data) // 1000):
        return nahradni
    try:
        return data.decode('cp1250')
    except UnicodeDecodeError:
        return data.decode('latin-1')


# --- DOCX ---------------------------------------------------------------------

_W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
_M = '{http://schemas.openxmlformats.org/officeDocument/2006/math}'
_MC = '{http://schemas.openxmlformats.org/markup-compatibility/2006}'
_A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
_V = '{urn:schemas-microsoft-com:vml}'
# Smazaný text sledovaných změn, kód pole, náhradní obsah (duplikát) — do textu nepatří.
_DOCX_VYNECHAT = {f'{_W}del', f'{_W}delText', f'{_W}instrText', f'{_W}fldData', f'{_MC}Fallback',
                  f'{_W}moveFrom', f'{_W}pPr', f'{_W}rPr', f'{_W}tblPr', f'{_W}sectPr'}


def _omml(e) -> str:
    """Vzorec z editoru rovnic (OMML) → lineární zápis se závorkami: (E·V)/(S)."""
    znacka = e.tag
    deti = {d.tag: d for d in e}

    def cast(jmeno: str) -> str:
        d = deti.get(f'{_M}{jmeno}')
        return _omml(d) if d is not None else ''

    if znacka == f'{_M}t':
        return e.text or ''
    if znacka == f'{_M}f':
        return f'({cast("num")})/({cast("den")})'
    if znacka == f'{_M}sSup':
        return f'{cast("e")}^({cast("sup")})'
    if znacka == f'{_M}sSub':
        return f'{cast("e")}_({cast("sub")})'
    if znacka == f'{_M}sSubSup':
        return f'{cast("e")}_({cast("sub")})^({cast("sup")})'
    if znacka == f'{_M}rad':
        stupen = cast('deg')
        return f'({cast("e")})^(1/{stupen})' if stupen.strip() else f'√({cast("e")})'
    if znacka == f'{_M}d':
        pr = deti.get(f'{_M}dPr')
        zac = kon = None
        if pr is not None:
            for p in pr:
                if p.tag == f'{_M}begChr':
                    zac = p.get(f'{_M}val')
                elif p.tag == f'{_M}endChr':
                    kon = p.get(f'{_M}val')
        vnitrek = ', '.join(_omml(d) for d in e if d.tag == f'{_M}e')
        return f'{zac if zac is not None else "("}{vnitrek}{kon if kon is not None else ")"}'
    if znacka == f'{_M}nary':
        pr = deti.get(f'{_M}naryPr')
        znak = '∫'
        if pr is not None:
            for p in pr:
                if p.tag == f'{_M}chr' and p.get(f'{_M}val'):
                    znak = p.get(f'{_M}val')
        meze = ''.join(x for x in (f'_({cast("sub")})' if cast('sub') else '', f'^({cast("sup")})' if cast('sup') else ''))
        return f'{znak}{meze} {cast("e")}'
    if znacka == f'{_M}func':
        return f'{cast("fName")}({cast("e")})'
    if znacka.endswith('Pr'):
        return ''
    return ''.join(_omml(d) for d in e)


def _docx_text(uzel) -> str:
    """Text prvku DOCX v pořadí dokumentu: běhy, pole (výsledek), vložené revize,
    ovládací prvky obsahu, hypertextové odkazy, textová pole i vzorce."""
    casti: list[str] = []

    def projdi(e) -> None:
        znacka = e.tag
        if not isinstance(znacka, str) or znacka in _DOCX_VYNECHAT:
            return
        if znacka == f'{_M}oMath':
            casti.append(f' ${_omml(e).strip()}$ ')
            return
        if znacka == f'{_W}t':
            casti.append(e.text or '')
        elif znacka == f'{_W}tab':
            casti.append('\t')
        elif znacka in (f'{_W}br', f'{_W}cr'):
            casti.append('\n')
        elif znacka == f'{_W}noBreakHyphen':
            casti.append('-')
        elif znacka == f'{_W}p' and casti and not casti[-1].endswith('\n'):
            casti.append('\n')  # odstavec v textovém poli nebo buňce
            for d in e:
                projdi(d)
        else:
            for d in e:
                projdi(d)

    projdi(uzel)
    return ''.join(casti)


def _docx_bloky(rodic):
    """Odstavce a tabulky těla v pořadí, i uvnitř ovládacích prvků obsahu (w:sdt)."""
    for e in rodic:
        if e.tag in (f'{_W}p', f'{_W}tbl'):
            yield e
        elif e.tag in (f'{_W}sdt', f'{_W}sdtContent', f'{_W}customXml', f'{_W}ins', f'{_W}moveTo'):
            yield from _docx_bloky(e)


def _uroven_nadpisu(odstavec, e) -> int | None:
    pr = e.find(f'{_W}pPr')
    if pr is not None:
        osnova = pr.find(f'{_W}outlineLvl')
        if osnova is not None and (osnova.get(f'{_W}val') or '').isdigit() and int(osnova.get(f'{_W}val')) < 9:
            return int(osnova.get(f'{_W}val')) + 1
    try:
        styl = (odstavec.style.name if odstavec.style is not None else '') or ''
    except Exception:  # noqa: BLE001 — chybějící styl = obyčejný odstavec
        styl = ''
    m = re.match(r'(?:heading|nadpis|überschrift)\s*(\d)', styl, re.IGNORECASE)
    if m:
        return int(m.group(1))
    if styl.lower() in ('title', 'název', 'titel'):
        return 1
    return None


def docx_na_text(data: bytes) -> Text:
    """DOCX → markdown: odstavce, nadpisy podle stylů a úrovně osnovy, tabulky, vzorce."""
    import docx  # python-docx

    dokument = docx.Document(io.BytesIO(data))
    telo = dokument.element.body
    radky: list[str] = []
    for blok in _docx_bloky(telo):
        if blok.tag == f'{_W}p':
            surovy = _docx_text(blok)
            if not surovy.strip():
                continue
            uroven = _uroven_nadpisu(docx.text.paragraph.Paragraph(blok, dokument), blok)
            if uroven:
                radky.append(f"{'#' * uroven} {' '.join(surovy.split())}")
            else:
                # Zalomení řádku (w:br) uvnitř odstavce zůstane, mezery se srovnají.
                radky.append('\n'.join(' '.join(r.split()) for r in surovy.split('\n') if r.strip()))
        else:
            tabulka = docx.table.Table(blok, dokument)
            bunky = [[' '.join(_docx_text(c._tc).split()) for c in r.cells] for r in tabulka.rows]
            if any(any(b for b in r) for r in bunky):
                radky.append(_markdown_tabulka(bunky))
    obrazku = sum(1 for _ in telo.iter(f'{_A}blip')) + sum(1 for _ in telo.iter(f'{_V}imagedata'))
    return Text('\n\n'.join(radky), obrazku=obrazku)


# --- EPUB ---------------------------------------------------------------------

def _serializuj_mathml(uzel: dict) -> str:
    """Strom MathML (slovníky) → lineární zápis: mfrac → (a)/(b), msup → a^(b)…"""
    znacka, deti = uzel['znacka'], uzel['deti']

    def s(i: int) -> str:
        prvky = [d for d in deti if isinstance(d, dict)]
        return _serializuj_mathml(prvky[i]) if i < len(prvky) else ''

    if znacka == 'annotation':
        return ''
    if znacka == 'mfrac':
        return f'({s(0)})/({s(1)})'
    if znacka == 'msup':
        return f'{s(0)}^({s(1)})'
    if znacka == 'msub':
        return f'{s(0)}_({s(1)})'
    if znacka == 'msubsup':
        return f'{s(0)}_({s(1)})^({s(2)})'
    if znacka == 'msqrt':
        return f'√({"".join(_serializuj_mathml(d) if isinstance(d, dict) else d for d in deti)})'
    if znacka == 'mroot':
        return f'({s(0)})^(1/{s(1)})'
    return ''.join(_serializuj_mathml(d) if isinstance(d, dict) else d for d in deti)


class _HtmlNaText(HTMLParser):
    """XHTML kapitoly EPUBu → markdown (nadpisy h1–h4, odstavce, tabulky, vzorce)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.casti: list[str] = []
        self.aktualni: list[str] = []
        self.nadpis = 0
        self.preskoc = 0
        self.tabulka: list[list[str]] | None = None
        self.bunka: list[str] | None = None
        self.obrazku = 0
        self.matematika: list[dict] | None = None  # zásobník uzlů MathML
        self.tex: str | None = None
        self.v_tex = False

    def _uzavri(self) -> None:
        text = ' '.join(''.join(self.aktualni).split())
        if text:
            self.casti.append(f"{'#' * self.nadpis} {text}" if self.nadpis else text)
        self.aktualni = []

    def _pridej_text(self, text: str) -> None:
        if self.bunka is not None:
            self.bunka.append(text)
        elif self.tabulka is None:
            self.aktualni.append(text)

    def handle_starttag(self, tag: str, attrs) -> None:
        atributy = dict(attrs)
        if self.matematika is not None:
            uzel = {'znacka': tag, 'deti': []}
            self.matematika[-1]['deti'].append(uzel)
            self.matematika.append(uzel)
            if tag == 'annotation' and 'tex' in (atributy.get('encoding') or '').lower():
                self.v_tex, self.tex = True, ''
            return
        if tag in ('script', 'style', 'head'):
            self.preskoc += 1
        elif tag == 'math':
            self.matematika = [{'znacka': 'math', 'deti': [], 'alttext': atributy.get('alttext')}]
            self.tex = None
        elif tag in ('img', 'image'):
            self.obrazku += 1
        elif tag in ('h1', 'h2', 'h3', 'h4'):
            self._uzavri()
            self.nadpis = int(tag[1])
        elif tag in ('p', 'div', 'li', 'br', 'section', 'blockquote', 'dd', 'dt'):
            self._uzavri()
        elif tag == 'table':
            self._uzavri()
            self.tabulka = []
        elif tag == 'tr' and self.tabulka is not None:
            self.tabulka.append([])
        elif tag in ('td', 'th') and self.tabulka is not None:
            self.bunka = []

    def handle_endtag(self, tag: str) -> None:
        if self.matematika is not None:
            if tag == 'annotation':
                self.v_tex = False
            if tag == 'math' or len(self.matematika) == 1:
                koren = self.matematika[0]
                self.matematika = None
                zapis = (koren.get('alttext') or self.tex or _serializuj_mathml(koren)).strip()
                if zapis:
                    self._pridej_text(f' ${" ".join(zapis.split())}$ ')
                return
            if self.matematika[-1]['znacka'] == tag:
                self.matematika.pop()
            return
        if tag in ('script', 'style', 'head'):
            self.preskoc = max(0, self.preskoc - 1)
        elif tag in ('h1', 'h2', 'h3', 'h4'):
            self._uzavri()
            self.nadpis = 0
        elif tag in ('td', 'th') and self.tabulka is not None and self.bunka is not None:
            if not self.tabulka:
                self.tabulka.append([])
            self.tabulka[-1].append(' '.join(''.join(self.bunka).split()))
            self.bunka = None
        elif tag == 'table' and self.tabulka is not None:
            radky = [r for r in self.tabulka if r]
            if radky:
                self.casti.append(_markdown_tabulka(radky))
            self.tabulka = None
        elif tag in ('p', 'div', 'li', 'section', 'blockquote', 'dd', 'dt'):
            self._uzavri()

    def handle_data(self, data: str) -> None:
        if self.preskoc:
            return
        if self.matematika is not None:
            if self.v_tex:
                self.tex = (self.tex or '') + data
            else:
                self.matematika[-1]['deti'].append(data)
            return
        self._pridej_text(data)

    def text(self) -> str:
        self._uzavri()
        return '\n\n'.join(self.casti)


def _dekoduj_xhtml(obsah: bytes) -> str:
    """Kódování XHTML z BOM, deklarace XML nebo <meta charset>; jinak UTF-8."""
    if obsah.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE, codecs.BOM_UTF8)):
        return dekoduj_text(obsah)
    hlava = obsah[:1024].decode('ascii', errors='ignore')
    m = (re.search(r'<\?xml[^>]*encoding=["\']([\w.:-]+)["\']', hlava, re.IGNORECASE)
         or re.search(r'<meta[^>]*charset=["\']?([\w.:-]+)', hlava, re.IGNORECASE))
    kodovani = m.group(1) if m else 'utf-8'
    try:
        return obsah.decode(kodovani, errors='replace')
    except LookupError:
        return obsah.decode('utf-8', errors='replace')


def _epub_drm(z: zipfile.ZipFile) -> bool:
    """Šifrovaný obsah (DRM) — ne jen zamaskované fonty, které EPUB běžně má."""
    try:
        sifrovani = ElementTree.fromstring(z.read('META-INF/encryption.xml'))
    except KeyError:
        return False
    for e in sifrovani.iter():
        if e.tag.endswith('CipherReference'):
            cesta = unquote(e.attrib.get('URI', '')).lower()
            if cesta.endswith(('.xhtml', '.html', '.htm', '.xml', '.opf', '.ncx')):
                return True
    return False


class ChybaFormatu(ValueError):
    """Soubor nejde převést (DRM, poškozený) — zpráva je pro uživatele, bez obsahu knihy."""


def epub_na_text(data: bytes) -> Text:
    """EPUB → markdown v pořadí čtení (spine z OPF)."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        if _epub_drm(z):
            raise ChybaFormatu('EPUB je chráněný DRM (šifrovaný obsah) — zpracovat ho nejde.')
        kontejner = ElementTree.fromstring(z.read('META-INF/container.xml'))
        opf_cesta = next(e.attrib['full-path'] for e in kontejner.iter() if e.tag.endswith('rootfile'))
        opf = ElementTree.fromstring(z.read(opf_cesta))
        zaklad = posixpath.dirname(opf_cesta)
        polozky = {e.attrib['id']: e.attrib['href'] for e in opf.iter() if e.tag.endswith('item') and 'id' in e.attrib}
        poradi = [e.attrib['idref'] for e in opf.iter() if e.tag.endswith('itemref')]
        casti: list[str] = []
        chybi = 0
        obrazku = 0
        for idref in poradi:
            href = polozky.get(idref)
            if not href:
                chybi += 1
                continue
            cesta = posixpath.normpath(posixpath.join(zaklad, unquote(href.split('#')[0])))
            try:
                html = _dekoduj_xhtml(z.read(cesta))
            except KeyError:
                chybi += 1
                continue
            prevodnik = _HtmlNaText()
            prevodnik.feed(html)
            obrazku += prevodnik.obrazku
            text = prevodnik.text()
            if text:
                casti.append(text)
    varovani = [f'{chybi} z {len(poradi)} částí EPUBu v souboru chybí.'] if chybi else []
    return Text('\n\n'.join(casti), obrazku=obrazku, varovani=varovani)


# --- tabulky (CSV, XLSX) ---------------------------------------------------------

def _markdown_tabulka(radky: list[list[str]]) -> str:
    sirka = max(len(r) for r in radky)
    plne = [[(c or '').replace('|', '/').replace('\n', ' ') for c in r] + [''] * (sirka - len(r)) for r in radky]
    hlavicka = '| ' + ' | '.join(plne[0]) + ' |'
    oddelovac = '|' + '---|' * sirka
    telo = ['| ' + ' | '.join(r) + ' |' for r in plne[1:]]
    return '\n'.join([hlavicka, oddelovac, *telo])


def oddelovac_csv(text: str) -> str:
    """Oddělovač CSV. Středník na skoro každém řádku = český Excel (desetinná
    čárka v číslech); csv.Sniffer sám by u „Extrakt, %" nebo „81,2;14,2" volil čárku."""
    radky = [r for r in text.splitlines()[:300] if r.strip()][:200]
    if not radky:
        return ','
    for kandidat in (';', '\t'):
        if sum(1 for r in radky if kandidat in r) >= 0.8 * len(radky):
            return kandidat
    sniffer = csv.Sniffer()
    sniffer.preferred = [';', '\t', ',']
    try:
        return sniffer.sniff('\n'.join(radky), delimiters=';\t,').delimiter
    except csv.Error:
        return ','


def _obecne_cislo(v: float | int) -> str:
    if isinstance(v, float):
        return f'{v:.10g}'
    return str(v)


def formatuj_cislo(v: float | int, formát: str | None) -> str:
    """Číslo buňky tak, jak ho ukazuje Excel: 0,08 ve formátu 0 % → „8%",
    0,843 ve formátu 0.0% → „84.3%", 12,5 ve formátu 0.0" °P" → „12.5 °P"."""
    f = (formát or 'General').split(';')[0]
    f = re.sub(r'\[[^\]]*\]', '', f)
    holy = re.sub(r'"[^"]*"|\\.', '', f)
    if not re.search(r'[0#?]', holy):
        return _obecne_cislo(v)
    procento = '%' in holy
    hodnota = v * 100 if procento else v
    m = re.search(r'\.([0#?]+)', holy)
    desetinna = len(m.group(1)) if m else 0
    if re.search(r'E[+-]', holy, re.IGNORECASE):
        text = f'{hodnota:.{desetinna}E}'
    else:
        text = f'{hodnota:.{desetinna}f}'
    tokeny = re.findall(r'"[^"]*"|\\.|[0#?]|.', f)
    zastupne = [i for i, t in enumerate(tokeny) if t in ('0', '#', '?')]
    def literal(t: str) -> str:
        return t[1:-1] if t.startswith('"') else t[1:] if t.startswith('\\') else ''
    pred = ''.join(literal(t) for t in tokeny[:zastupne[0]])
    za = ''.join(literal(t) for t in tokeny[zastupne[-1] + 1:])
    return f'{pred}{text}{"%" if procento else ""}{za}'.strip()


def _hodnota_bunky(bunka) -> str:
    v = getattr(bunka, 'value', None)
    if v is None:
        return ''
    if isinstance(v, bool):
        return 'PRAVDA' if v else 'NEPRAVDA'
    if isinstance(v, datetime):
        return v.date().isoformat() if v.time() == time(0) else v.isoformat(sep=' ')
    if isinstance(v, (date, time)):
        return v.isoformat()
    if isinstance(v, (int, float)):
        return formatuj_cislo(v, getattr(bunka, 'number_format', None))
    return ' '.join(str(v).split())


def _orizni_sloupce(radky: list[tuple[int, list[str]]]) -> list[tuple[int, list[str]]]:
    """Prázdné sloupce zleva i zprava pryč (zbloudilá buňka v XFD1 nesmí nafouknout text)."""
    vyplnene = [(c, [x for x in b]) for c, b in radky if any(x.strip() for x in b)]
    if not vyplnene:
        return []
    levy = min(next(i for i, x in enumerate(b) if x.strip()) for _, b in vyplnene)
    pravy = max(max(i for i, x in enumerate(b) if x.strip()) for _, b in vyplnene)
    return [(c, b[levy:pravy + 1]) for c, b in vyplnene]


def _casti_listu(nazev: str | None, radky: list[tuple[int, list[str]]], radku_na_cast: int, cil: int) -> list[str]:
    """Řádky listu (skutečné číslo řádku, buňky) → části s markdown tabulkou.

    Hlavička = první řádek s aspoň dvěma vyplněnými buňkami (titulek tabulky
    nad ní se uvede jako popis); opakuje se v každé části. Rozsah řádků
    v textu části odpovídá číslům řádků v Excelu.
    """
    radky = _orizni_sloupce(radky)
    if not radky:
        return []
    i_hlavicky = next((i for i, (_, b) in enumerate(radky) if sum(1 for x in b if x.strip()) >= 2), 0)
    popis = ' — '.join(' '.join(x for x in b if x.strip()) for _, b in radky[:i_hlavicky])
    _, hlavicka = radky[i_hlavicky]
    telo = radky[i_hlavicky + 1:]
    nadpis = f'## {nazev}\n\n' if nazev else ''
    casti: list[str] = []

    def pridej(kus: list[tuple[int, list[str]]]) -> None:
        od = kus[0][0] if kus else radky[i_hlavicky][0]
        do = kus[-1][0] if kus else od
        rozsah = f'řádek {od}' if od == do else f'řádky {od}–{do}'
        uvod = f'({rozsah}{f"; {popis}" if popis else ""})'
        casti.append(f'{nadpis}{uvod}\n\n{_markdown_tabulka([hlavicka, *[b for _, b in kus]])}')

    kus: list[tuple[int, list[str]]] = []
    delka = sum(len(x) + 3 for x in hlavicka)
    for radek in telo:
        delka_radku = sum(len(x) + 3 for x in radek[1])
        if kus and (len(kus) >= radku_na_cast or delka + delka_radku > cil):
            pridej(kus)
            kus, delka = [], sum(len(x) + 3 for x in hlavicka)
        kus.append(radek)
        delka += delka_radku
    if kus or not telo:
        pridej(kus)
    return casti


def casti_tabulek(data: bytes, typ: str, radku_na_cast: int = 40, cil: int = CAST_ZNAKU) -> tuple[list[str], list[str]]:
    """CSV nebo XLSX → (části s markdown tabulkami, varování)."""
    varovani: list[str] = []
    casti: list[str] = []
    if typ == 'text/csv':
        text = dekoduj_text(data)
        ctenar = csv.reader(io.StringIO(text), delimiter=oddelovac_csv(text))
        radky = [(cislo, [' '.join(x.split()) for x in r]) for cislo, r in enumerate(ctenar, start=1)]
        casti.extend(_casti_listu(None, radky, radku_na_cast, cil))
        return casti, varovani

    import openpyxl

    sesit = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    try:
        for list_ in sesit.worksheets:
            sirka = list_.max_column or MAX_SLOUPCU
            if sirka > MAX_SLOUPCU:
                varovani.append(f'List „{list_.title}" má víc než {MAX_SLOUPCU} sloupců — zpracováno jen prvních {MAX_SLOUPCU}.')
            radky: list[tuple[int, list[str]]] = []
            for cislo, radek in enumerate(list_.iter_rows(min_row=1, max_col=min(sirka, MAX_SLOUPCU)), start=1):
                bunky = [_hodnota_bunky(b) for b in radek]
                while bunky and not bunky[-1]:
                    bunky.pop()
                if bunky:
                    radky.append((cislo, bunky))
            casti.extend(_casti_listu(list_.title, radky, radku_na_cast, cil))
    finally:
        sesit.close()
    return casti, varovani
