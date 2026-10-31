"""Čtení PDF přes pypdfium2 (licence BSD-3/Apache-2.0): strany, textová vrstva,
záhlaví a zápatí, štítky stran, osnova a obrázek strany pro OCR."""
from __future__ import annotations

import io
from dataclasses import dataclass

import pypdfium2 as pdfium

# Pás nahoře a dole, kde bývá živé záhlaví a číslo strany (podíl výšky strany).
OKRAJ = 0.08
# Delší hrana obrázku pro OCR — Claude větší obrázky stejně zmenšuje.
MAX_HRANA = 1568


@dataclass
class StranaPdf:
    pdf_index: int  # od 1
    text: str
    okraje: str     # text záhlaví a zápatí (pro číslo strany)


def otevri(data: bytes) -> pdfium.PdfDocument:
    return pdfium.PdfDocument(data)


def stitky(pdf: pdfium.PdfDocument) -> list[str | None]:
    vysledek: list[str | None] = []
    for i in range(len(pdf)):
        try:
            s = pdf.get_page_label(i)
        except Exception:  # noqa: BLE001 — štítky jsou jen nápověda
            s = ''
        vysledek.append(s.strip() or None)
    return vysledek


def osnova(pdf: pdfium.PdfDocument) -> list[tuple[int, str, int | None]]:
    polozky: list[tuple[int, str, int | None]] = []
    try:
        for zalozka in pdf.get_toc(max_depth=6):
            cil = zalozka.get_dest()
            index = cil.get_index() if cil is not None else None
            polozky.append((zalozka.level, zalozka.get_title() or '', index))
    except Exception:  # noqa: BLE001 — rozbitá osnova = žádná osnova
        return []
    return polozky


def text_strany(pdf: pdfium.PdfDocument, index: int) -> StranaPdf:
    strana = pdf[index]
    try:
        textova = strana.get_textpage()
        try:
            vyska = strana.get_height()
            text = textova.get_text_bounded()
            nahore = textova.get_text_bounded(bottom=vyska * (1 - OKRAJ))
            dole = textova.get_text_bounded(top=vyska * OKRAJ)
        finally:
            textova.close()
    finally:
        strana.close()
    return StranaPdf(index + 1, _cisty(text), f'{_cisty(nahore)}\n{_cisty(dole)}')


def obrazek_strany(pdf: pdfium.PdfDocument, index: int, kvalita: int = 85) -> bytes:
    strana = pdf[index]
    try:
        sirka, vyska = strana.get_size()
        meritko = min(MAX_HRANA / max(sirka, vyska, 1), 4.0)
        bitmapa = strana.render(scale=meritko)
        obr = bitmapa.to_pil().convert('L')
    finally:
        strana.close()
    vystup = io.BytesIO()
    obr.save(vystup, format='JPEG', quality=kvalita, optimize=True)
    return vystup.getvalue()


def _cisty(text: str) -> str:
    # pdfium dává konce řádků \r\n a měkké dělení slov jako \x02 nebo \xad.
    return (text or '').replace('\r\n', '\n').replace('\r', '\n').replace('\x02', '').replace('\xad', '').strip()
