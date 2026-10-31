"""Čtení PDF přes pypdfium2 (licence BSD-3/Apache-2.0): strany, textová vrstva,
záhlaví a zápatí, štítky stran, osnova a obrázek strany pro OCR."""
from __future__ import annotations

import io
from dataclasses import dataclass

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c

# Pás nahoře a dole, kde bývá živé záhlaví a číslo strany (podíl výšky strany).
OKRAJ = 0.08
# Delší hrana obrázku pro OCR — Claude větší obrázky stejně zmenšuje.
MAX_HRANA = 1568
# Obrázek přes aspoň tolik plochy strany = strana je sken (případně s OCR vrstvou).
PLOCHA_SKENU = 0.8


@dataclass
class StranaPdf:
    pdf_index: int  # od 1
    text: str
    # Úseky textu v pásu záhlaví a zápatí, každý na vlastním řádku: „3.2 Rmutování"
    # vlevo a „125" vpravo jsou dva řádky (v textu strany je pdfium spojí mezerou).
    okraje: str
    # Obrázek přes celou stranu a text neviditelný nebo pod ním = sken s OCR
    # vrstvou od cizího programu. Taková vrstva se nebere jako přesný text.
    sken_s_vrstvou: bool = False
    # Podíl strany pokrytý největším obrázkem a počet kreslených tvarů (křivky):
    # strana s málo textem a velkým obrázkem nebo kresbou se přepíše přes OCR,
    # krátká strana bez nich (titul, prázdná strana) zůstane, jak je.
    plocha_obrazku: float = 0.0
    tvaru: int = 0


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


def _od_vrchu(rect: tuple[float, float, float, float], bbox: tuple[float, float, float, float],
              otoceni: int) -> tuple[float, float]:
    """Horní a dolní hrana úseku od vizuálního vrchu strany (0 = nahoře, 1 = dole).

    Souřadnice textu i rámeček strany (CropBox) jsou v neotočeném prostoru PDF;
    /Rotate určuje, která hrana je při čtení nahoře.
    """
    rl, rb, rr, rt = rect
    l, b, r, t = bbox
    if otoceni in (90, 270):
        delka = (r - l) or 1.0
        a, z = ((rl - l) / delka, (rr - l) / delka) if otoceni == 90 else ((r - rr) / delka, (r - rl) / delka)
    else:
        delka = (t - b) or 1.0
        a, z = ((t - rt) / delka, (t - rb) / delka) if otoceni != 180 else ((rb - b) / delka, (rt - b) / delka)
    return min(a, z), max(a, z)


def _okraje(strana: pdfium.PdfPage, textova: pdfium.PdfTextPage) -> str:
    """Text pásu záhlaví a zápatí po úsecích (každý úsek textu = jeden řádek).

    Úsek patří do pásu, když do něj aspoň zasahuje (číslo strany kousek pod
    okrajem pásu se tak neztratí; řádek těla navíc hlasování o posunu vyřadí).
    """
    bbox = strana.get_bbox()
    otoceni = strana.get_rotation() % 360
    nahore: list[str] = []
    dole: list[str] = []
    for j in range(textova.count_rects()):
        rect = textova.get_rect(j)
        horni, dolni = _od_vrchu(rect, bbox, otoceni)
        if horni > OKRAJ and dolni < 1 - OKRAJ:
            continue
        usek = _cisty(textova.get_text_bounded(*rect))
        if usek:
            (nahore if horni <= OKRAJ else dole).append(usek)
    return '\n'.join(nahore + dole)


def _obsah_strany(strana: pdfium.PdfPage) -> tuple[bool, float, int]:
    """(sken s OCR vrstvou, podíl největšího obrázku, počet tvarů) podle objektů strany.

    Sken s vrstvou = obrázek přes ≥ 80 % strany a text neviditelný (režim 3)
    nebo celý pod obrázkem. Digitální strana s obrázkem na pozadí (text
    kreslený až po obrázku) sken není.
    """
    l, b, r, t = strana.get_bbox()
    plocha = max((r - l) * (t - b), 1.0)
    obrazek_na_poradi: int | None = None
    nejvetsi = 0.0
    tvaru = viditelnych_pred = viditelnych_po = neviditelnych = 0
    for poradi, objekt in enumerate(strana.get_objects(max_depth=2)):
        if objekt.type == pdfium_c.FPDF_PAGEOBJ_IMAGE:
            ol, ob, orr, ot = objekt.get_bounds()
            prekryv = max(0.0, min(r, orr) - max(l, ol)) * max(0.0, min(t, ot) - max(b, ob)) / plocha
            nejvetsi = max(nejvetsi, prekryv)
            if prekryv >= PLOCHA_SKENU and obrazek_na_poradi is None:
                obrazek_na_poradi = poradi
        elif objekt.type == pdfium_c.FPDF_PAGEOBJ_PATH:
            tvaru += 1
        elif objekt.type == pdfium_c.FPDF_PAGEOBJ_TEXT:
            if pdfium_c.FPDFTextObj_GetTextRenderMode(objekt.raw) == pdfium_c.FPDF_TEXTRENDERMODE_INVISIBLE:
                neviditelnych += 1
            elif obrazek_na_poradi is None:
                viditelnych_pred += 1
            else:
                viditelnych_po += 1
    sken = obrazek_na_poradi is not None and (
        (neviditelnych > 0 and neviditelnych >= viditelnych_pred + viditelnych_po)
        or (viditelnych_po == 0 and viditelnych_pred > 0))
    return sken, nejvetsi, tvaru


def text_strany(pdf: pdfium.PdfDocument, index: int) -> StranaPdf:
    strana = pdf[index]
    try:
        textova = strana.get_textpage()
        try:
            text = textova.get_text_bounded()
            okraje = _okraje(strana, textova)
        finally:
            textova.close()
        try:
            sken, plocha_obrazku, tvaru = _obsah_strany(strana)
        except Exception:  # noqa: BLE001 — nejde-li to poznat, platí textová vrstva
            sken, plocha_obrazku, tvaru = False, 0.0, 0
    finally:
        strana.close()
    return StranaPdf(index + 1, _cisty(text), okraje, sken, plocha_obrazku, tvaru)


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
