"""Testy workeru Pivovarské bible: moduly ze složky scripts/bible na cestu importů
a pomocník, který vyrobí malé PDF s textem, štítky stran a osnovou."""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


def _pdf_text(s: str) -> str:
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


def _pdf_retezec(s: str) -> str:
    """Řetězec PDF pro titulek záložky: Latin-1 doslova, jinak UTF-16BE s BOM."""
    try:
        s.encode('latin-1')
        return f'({_pdf_text(s)})'
    except UnicodeEncodeError:
        return '<FEFF' + s.encode('utf-16-be').hex().upper() + '>'


def vyrob_pdf(strany: list[list[str]], stitky: list[tuple[int, str, int]] | None = None,
              osnova: list[tuple] | None = None) -> bytes:
    """Minimální PDF (Helvetica): každá strana = řádky textu shora dolů."""
    return vyrob_pdf_presne([{'radky': r} for r in strany], stitky, osnova)


def vyrob_pdf_presne(strany: list[dict], stitky: list[tuple[int, str, int]] | None = None,
                     osnova: list[tuple] | None = None) -> bytes:
    """PDF, jaké vyrábí sazba nebo skener. Strana = slovník:

      radky:   řádky textu shora dolů od y = 770 po 14 bodech
      text:    [(x, y, text)] — úsek na přesné pozici (záhlaví vlevo, číslo vpravo)
      obrazek: (x, y, šířka, výška) — šedý obrázek roztažený na tuto plochu
      obrazek_nahore: obrázek se kreslí až po textu (text leží pod ním)
      neviditelny: text v režimu 3 (OCR vrstva skenu)
      mediabox, cropbox, rotate

    stitky: [(od indexu listu, styl 'D'/'r', první číslo)] → /PageLabels
    osnova: [(titulek, index listu)] nebo [(titulek, index listu, úroveň od 0)] → záložky
    """
    objekty: list[str] = []

    def pridej(obsah: str) -> int:
        objekty.append(obsah)
        return len(objekty)

    katalog = pridej('')
    stromy = pridej('')
    font = pridej('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    pixely = bytes([180] * 100)
    obrazek = pridej(f'<< /Type /XObject /Subtype /Image /Width 10 /Height 10 /ColorSpace /DeviceGray '
                     f'/BitsPerComponent 8 /Length {len(pixely)} >>\nstream\n{pixely.decode("latin-1")}\nendstream')
    deti = []
    for s in strany:
        prikazy: list[str] = []

        def nakresli_obrazek() -> None:
            x, y, w, h = s['obrazek']
            prikazy.append(f'q {w} 0 0 {h} {x} {y} cm /Im1 Do Q')

        if s.get('obrazek') and not s.get('obrazek_nahore'):
            nakresli_obrazek()
        prikazy.append('BT /F1 11 Tf 14 TL')
        if s.get('neviditelny'):
            prikazy.append('3 Tr')
        if s.get('radky'):
            prikazy.append('1 0 0 1 72 770 Tm')
            prikazy.extend(f'({_pdf_text(r)}) Tj T*' for r in s['radky'])
        for x, y, t in s.get('text', []):
            prikazy.append(f'1 0 0 1 {x} {y} Tm ({_pdf_text(t)}) Tj')
        prikazy.append('ET')
        if s.get('obrazek') and s.get('obrazek_nahore'):
            nakresli_obrazek()
        proud = '\n'.join(prikazy)
        obsah = pridej(f'<< /Length {len(proud.encode("latin-1"))} >>\nstream\n{proud}\nendstream')
        mediabox = ' '.join(str(v) for v in s.get('mediabox', (0, 0, 595, 842)))
        navic = f' /CropBox [{" ".join(str(v) for v in s["cropbox"])}]' if 'cropbox' in s else ''
        navic += f' /Rotate {s["rotate"]}' if 'rotate' in s else ''
        deti.append(pridej(f'<< /Type /Page /Parent {stromy} 0 R /MediaBox [{mediabox}]{navic} '
                           f'/Resources << /Font << /F1 {font} 0 R >> /XObject << /Im1 {obrazek} 0 R >> >> '
                           f'/Contents {obsah} 0 R >>'))
    objekty[stromy - 1] = f'<< /Type /Pages /Kids [{" ".join(f"{d} 0 R" for d in deti)}] /Count {len(deti)} >>'
    navic = ''
    if stitky:
        nums = ' '.join(f'{od} << /S /{styl} /St {start} >>' for od, styl, start in stitky)
        navic += f' /PageLabels << /Nums [{nums}] >>'
    if osnova:
        navic += f' /Outlines {_osnova(osnova, deti, pridej, objekty)} 0 R'
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


def _osnova(osnova: list[tuple], deti: list[int], pridej, objekty: list[str]) -> int:
    """Strom záložek: položky v pořadí osnovy, úroveň určuje rodiče."""
    koren = pridej('')
    polozky = [(p[0], p[1], p[2] if len(p) > 2 else 0, pridej('')) for p in osnova]
    rodic: dict[int, int] = {}
    deti_uzlu: dict[int, list[int]] = {koren: []}
    zasobnik: list[tuple[int, int]] = []  # (úroveň, číslo objektu)
    for _, _, uroven, cislo in polozky:
        while zasobnik and zasobnik[-1][0] >= uroven:
            zasobnik.pop()
        nadrazeny = zasobnik[-1][1] if zasobnik else koren
        rodic[cislo] = nadrazeny
        deti_uzlu.setdefault(nadrazeny, []).append(cislo)
        deti_uzlu.setdefault(cislo, [])
        zasobnik.append((uroven, cislo))
    for titulek, index, _, cislo in polozky:
        sourozenci = deti_uzlu[rodic[cislo]]
        i = sourozenci.index(cislo)
        cast = f'<< /Title {_pdf_retezec(titulek)} /Parent {rodic[cislo]} 0 R'
        cast += f' /Prev {sourozenci[i - 1]} 0 R' if i > 0 else ''
        cast += f' /Next {sourozenci[i + 1]} 0 R' if i + 1 < len(sourozenci) else ''
        if deti_uzlu[cislo]:
            cast += f' /First {deti_uzlu[cislo][0]} 0 R /Last {deti_uzlu[cislo][-1]} 0 R /Count {len(deti_uzlu[cislo])}'
        cast += f' /Dest [{deti[index]} 0 R /Fit] >>'
        objekty[cislo - 1] = cast
    prvni = deti_uzlu[koren]
    objekty[koren - 1] = f'<< /Type /Outlines /First {prvni[0]} 0 R /Last {prvni[-1]} 0 R /Count {len(prvni)} >>'
    return koren
