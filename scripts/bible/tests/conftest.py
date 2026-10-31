"""Testy workeru Pivovarské bible: moduly ze složky scripts/bible na cestu importů
a pomocník, který vyrobí malé PDF s textem, štítky stran a osnovou."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


def _pdf_text(s: str) -> str:
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def vyrob_pdf(strany: list[list[str]], stitky: list[tuple[int, str, int]] | None = None,
              osnova: list[tuple[str, int]] | None = None) -> bytes:
    """Minimální PDF (Helvetica): každá strana = řádky textu shora dolů.

    stitky: [(od indexu listu, styl 'D'/'r', první číslo)] → /PageLabels
    osnova: [(titulek, index listu)] → záložky jedné úrovně
    """
    objekty: list[str] = []

    def pridej(obsah: str) -> int:
        objekty.append(obsah)
        return len(objekty)

    katalog = pridej('')
    stromy = pridej('')
    font = pridej('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    deti = []
    for radky in strany:
        prikazy = ['BT', '/F1 11 Tf', '14 TL', '72 770 Td']
        for r in radky:
            prikazy.append(f'({_pdf_text(r)}) Tj T*')
        prikazy.append('ET')
        proud = '\n'.join(prikazy)
        obsah = pridej(f'<< /Length {len(proud.encode("latin-1"))} >>\nstream\n{proud}\nendstream')
        deti.append(pridej(f'<< /Type /Page /Parent {stromy} 0 R /MediaBox [0 0 595 842] '
                           f'/Resources << /Font << /F1 {font} 0 R >> >> /Contents {obsah} 0 R >>'))
    objekty[stromy - 1] = f'<< /Type /Pages /Kids [{" ".join(f"{d} 0 R" for d in deti)}] /Count {len(deti)} >>'
    navic = ''
    if stitky:
        nums = ' '.join(f'{od} << /S /{styl} /St {start} >>' for od, styl, start in stitky)
        navic += f' /PageLabels << /Nums [{nums}] >>'
    if osnova:
        koren = pridej('')
        polozky = []
        for titulek, index in osnova:
            polozky.append(pridej(''))
        for i, (titulek, index) in enumerate(osnova):
            prev = f' /Prev {polozky[i - 1]} 0 R' if i > 0 else ''
            nxt = f' /Next {polozky[i + 1]} 0 R' if i + 1 < len(polozky) else ''
            objekty[polozky[i] - 1] = (f'<< /Title ({_pdf_text(titulek)}) /Parent {koren} 0 R{prev}{nxt} '
                                       f'/Dest [{deti[index]} 0 R /Fit] >>')
        objekty[koren - 1] = f'<< /Type /Outlines /First {polozky[0]} 0 R /Last {polozky[-1]} 0 R /Count {len(polozky)} >>'
        navic += f' /Outlines {koren} 0 R'
    objekty[katalog - 1] = f'<< /Type /Catalog /Pages {stromy} 0 R{navic} >>'

    vystup = bytearray(b'%PDF-1.4\n')
    pozice = []
    for i, obsah in enumerate(objekty, start=1):
        pozice.append(len(vystup))
        vystup += f'{i} 0 obj\n{obsah}\nendobj\n'.encode('latin-1')
    xref = len(vystup)
    vystup += f'xref\n0 {len(objekty) + 1}\n0000000000 65535 f \n'.encode()
    for p in pozice:
        vystup += f'{p:010d} 00000 n \n'.encode()
    vystup += f'trailer\n<< /Size {len(objekty) + 1} /Root {katalog} 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    return bytes(vystup)
