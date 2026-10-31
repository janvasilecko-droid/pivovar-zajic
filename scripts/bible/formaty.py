"""Dokumenty bez pevných stran (TXT, MD, DOCX, EPUB, CSV, XLSX) → části textu.

Tyhle formáty tištěná čísla stran nemají. Text se proto rozdělí na části
(≈ 3 000 znaků) a citace pak řekne „část č. X" (zadání: nevymýšlet čísla
stran). Nadpisy se převedou na markdown („# …"), ze kterých vzniknou
kapitoly stejně jako u přepsaných skenů.
"""
from __future__ import annotations

import csv
import io
import posixpath
import re
import zipfile
from html.parser import HTMLParser
from xml.etree import ElementTree

CAST_ZNAKU = 3000


def na_casti(text: str, cil: int = CAST_ZNAKU) -> list[str]:
    """Text → části po odstavcích; nadpis začíná novou část, když je ta stará dost dlouhá."""
    casti: list[str] = []
    aktualni: list[str] = []
    delka = 0
    for odstavec in re.split(r'\n\s*\n', (text or '').replace('\r\n', '\n')):
        odstavec = odstavec.strip()
        if not odstavec:
            continue
        nadpis = odstavec.startswith('#')
        if aktualni and (delka + len(odstavec) > cil or (nadpis and delka > cil // 3)):
            casti.append('\n\n'.join(aktualni))
            aktualni, delka = [], 0
        aktualni.append(odstavec)
        delka += len(odstavec) + 2
    if aktualni:
        casti.append('\n\n'.join(aktualni))
    return casti


def dekoduj_text(data: bytes) -> str:
    for kodovani in ('utf-8-sig', 'cp1250', 'latin-1'):
        try:
            return data.decode(kodovani)
        except UnicodeDecodeError:
            continue
    return data.decode('utf-8', errors='replace')


def docx_na_text(data: bytes) -> str:
    """DOCX → markdown: odstavce, nadpisy podle stylů „Heading N"/„Nadpis N", tabulky."""
    import docx  # python-docx

    dokument = docx.Document(io.BytesIO(data))
    radky: list[str] = []
    for blok in dokument.element.body.iterchildren():
        znacka = blok.tag.rsplit('}', 1)[-1]
        if znacka == 'p':
            odstavec = docx.text.paragraph.Paragraph(blok, dokument)
            text = odstavec.text.strip()
            if not text:
                continue
            styl = (odstavec.style.name if odstavec.style is not None else '') or ''
            m = re.match(r'(?:heading|nadpis)\s*(\d)', styl, re.IGNORECASE)
            radky.append(f"{'#' * int(m.group(1))} {text}" if m else text)
        elif znacka == 'tbl':
            tabulka = docx.table.Table(blok, dokument)
            radky.append(_markdown_tabulka([[c.text.strip() for c in r.cells] for r in tabulka.rows]))
    return '\n\n'.join(radky)


class _HtmlNaText(HTMLParser):
    """XHTML kapitoly EPUBu → markdown (nadpisy h1–h3, odstavce, tabulky)."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.casti: list[str] = []
        self.aktualni: list[str] = []
        self.nadpis = 0
        self.preskoc = 0
        self.tabulka: list[list[str]] | None = None
        self.bunka: list[str] | None = None

    def _uzavri(self) -> None:
        text = ' '.join(''.join(self.aktualni).split())
        if text:
            self.casti.append(f"{'#' * self.nadpis} {text}" if self.nadpis else text)
        self.aktualni = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in ('script', 'style', 'head'):
            self.preskoc += 1
        elif tag in ('h1', 'h2', 'h3', 'h4'):
            self._uzavri()
            self.nadpis = int(tag[1])
        elif tag in ('p', 'div', 'li', 'br', 'section'):
            self._uzavri()
        elif tag == 'table':
            self._uzavri()
            self.tabulka = []
        elif tag == 'tr' and self.tabulka is not None:
            self.tabulka.append([])
        elif tag in ('td', 'th') and self.tabulka is not None:
            self.bunka = []

    def handle_endtag(self, tag: str) -> None:
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
        elif tag in ('p', 'div', 'li', 'section'):
            self._uzavri()

    def handle_data(self, data: str) -> None:
        if self.preskoc:
            return
        if self.bunka is not None:
            self.bunka.append(data)
        elif self.tabulka is None:
            self.aktualni.append(data)

    def text(self) -> str:
        self._uzavri()
        return '\n\n'.join(self.casti)


def epub_na_text(data: bytes) -> str:
    """EPUB → markdown v pořadí čtení (spine z OPF)."""
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        kontejner = ElementTree.fromstring(z.read('META-INF/container.xml'))
        opf_cesta = next(e.attrib['full-path'] for e in kontejner.iter() if e.tag.endswith('rootfile'))
        opf = ElementTree.fromstring(z.read(opf_cesta))
        zaklad = posixpath.dirname(opf_cesta)
        polozky = {e.attrib['id']: e.attrib['href'] for e in opf.iter() if e.tag.endswith('item') and 'id' in e.attrib}
        poradi = [e.attrib['idref'] for e in opf.iter() if e.tag.endswith('itemref')]
        casti: list[str] = []
        for idref in poradi:
            href = polozky.get(idref)
            if not href:
                continue
            cesta = posixpath.normpath(posixpath.join(zaklad, href.split('#')[0]))
            try:
                html = z.read(cesta).decode('utf-8', errors='replace')
            except KeyError:
                continue
            prevodnik = _HtmlNaText()
            prevodnik.feed(html)
            text = prevodnik.text()
            if text:
                casti.append(text)
    return '\n\n'.join(casti)


def _markdown_tabulka(radky: list[list[str]]) -> str:
    sirka = max(len(r) for r in radky)
    plne = [[(c or '').replace('|', '/').replace('\n', ' ') for c in r] + [''] * (sirka - len(r)) for r in radky]
    hlavicka = '| ' + ' | '.join(plne[0]) + ' |'
    oddelovac = '|' + '---|' * sirka
    telo = ['| ' + ' | '.join(r) + ' |' for r in plne[1:]]
    return '\n'.join([hlavicka, oddelovac, *telo])


def tabulky_na_casti(data: bytes, typ: str, radku_na_cast: int = 40) -> list[str]:
    """CSV nebo XLSX → části s markdown tabulkami (list + hlavička + až 40 řádků)."""
    listy: list[tuple[str, list[list[str]]]] = []
    if typ == 'text/csv':
        text = dekoduj_text(data)
        try:
            dialekt = csv.Sniffer().sniff(text[:4096], delimiters=';,\t')
        except csv.Error:
            dialekt = csv.excel
        listy.append(('CSV', [list(r) for r in csv.reader(io.StringIO(text), dialekt)]))
    else:
        import openpyxl

        sesit = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        for list_ in sesit.worksheets:
            radky = [['' if v is None else str(v) for v in r] for r in list_.iter_rows(values_only=True)]
            listy.append((list_.title, [r for r in radky if any(c.strip() for c in r)]))
    casti: list[str] = []
    for nazev, radky in listy:
        if not radky:
            continue
        hlavicka, telo = radky[0], radky[1:] or [[]]
        for i in range(0, len(telo), radku_na_cast):
            kus = [hlavicka, *[r for r in telo[i:i + radku_na_cast] if r]]
            od, do = i + 2, min(i + radku_na_cast, len(telo)) + 1
            casti.append(f'## {nazev} (řádky {od}–{do})\n\n{_markdown_tabulka(kus)}')
    return casti
