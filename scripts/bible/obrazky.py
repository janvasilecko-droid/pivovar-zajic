"""Obrázky stran (JPEG, PNG, WebP, TIFF, snímky DjVu) → šedý JPEG pro OCR.

Fotka z telefonu má orientaci v EXIF, archivní sken bývá 16bitový, PNG může
mít průhledné pozadí a TIFF víc stran — nic z toho se nesmí tiše pokazit
(otočená, bílá nebo černá stránka by se přepsala jako prázdná).
"""
from __future__ import annotations

import io

from PIL import Image, ImageOps

# Delší hrana obrázku pro OCR — Claude větší obrázky stejně zmenšuje.
MAX_HRANA = 1568


def pocet_snimku(data: bytes) -> int:
    """Počet stran obrázku (vícestránkový TIFF ze skeneru)."""
    with Image.open(io.BytesIO(data)) as obr:
        return max(1, int(getattr(obr, 'n_frames', 1) or 1))


def na_sedou(obr: Image.Image) -> Image.Image:
    """Libovolný režim obrázku → 8bitová šedá bez ztráty obsahu."""
    if obr.mode in ('I;16', 'I;16B', 'I;16L', 'I;16N', 'I', 'F'):
        # 16bitový (nebo 32bitový) sken: convert('L') by hodnoty nad 255 ořízl
        # na čistou bílou. Rozsah se roztáhne podle skutečných hodnot.
        obr = obr.convert('F')
        nejmensi, nejvetsi = obr.getextrema()
        rozsah = (nejvetsi - nejmensi) or 1
        return obr.point(lambda v: (v - nejmensi) * 255.0 / rozsah).convert('L')
    if obr.mode in ('RGBA', 'LA', 'PA') or (obr.mode == 'P' and 'transparency' in obr.info):
        # Černý text na průhledné ploše: složit na bílý papír, jinak vyjde černá stránka.
        obr = obr.convert('RGBA')
        papir = Image.new('RGBA', obr.size, (255, 255, 255, 255))
        obr = Image.alpha_composite(papir, obr)
    return obr.convert('L')


def obrazek_na_jpeg(data: bytes, snimek: int = 0, kvalita: int = 85) -> bytes:
    with Image.open(io.BytesIO(data)) as zdroj:
        zdroj.seek(snimek)
        obr = ImageOps.exif_transpose(zdroj)  # fotka strany z telefonu: otočit podle EXIF
        obr = na_sedou(obr)
    obr.thumbnail((MAX_HRANA, MAX_HRANA))
    vystup = io.BytesIO()
    obr.save(vystup, format='JPEG', quality=kvalita, optimize=True)
    return vystup.getvalue()


def je_prazdna_strana(jpeg: bytes) -> bool:
    """Skoro bez tmavých bodů = prázdná strana (prázdný přepis je pak v pořádku)."""
    with Image.open(io.BytesIO(jpeg)) as obr:
        sedy = obr.convert('L')
        histogram = sedy.histogram()
    tmavych = sum(histogram[:128])
    return tmavych <= 0.002 * max(1, sum(histogram))
