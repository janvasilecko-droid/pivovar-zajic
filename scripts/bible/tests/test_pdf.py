import io

from PIL import Image

import pdf as pdf_mod
from conftest import vyrob_pdf

RADKY = ['Die Maischarbeit beeinflusst die Zusammensetzung der Wuerze entscheidend.'] * 12


def test_text_strany_a_okraje():
    # Řádky jdou od y = 770 po 14 bodech: číslo strany na 52. řádku leží
    # v dolním pásu 8 % výšky (pod 67 bodů), záhlaví v horním.
    data = vyrob_pdf([['3 Maischen', *RADKY] + [''] * 38 + ['124']])
    d = pdf_mod.otevri(data)
    s = pdf_mod.text_strany(d, 0)
    assert s.pdf_index == 1
    assert 'Maischarbeit' in s.text
    # Záhlaví je nahoře (prvních 8 % výšky), číslo strany dole.
    assert '3 Maischen' in s.okraje
    assert '124' in s.okraje
    assert '\r' not in s.text


def test_stitky_a_osnova():
    data = vyrob_pdf([['a'], ['b'], ['c'], ['d']], stitky=[(0, 'r', 1), (2, 'D', 1)],
                     osnova=[('1 Slad', 0), ('2 Rmutování', 2)])
    d = pdf_mod.otevri(data)
    assert pdf_mod.stitky(d) == ['i', 'ii', '1', '2']
    assert pdf_mod.osnova(d) == [(0, '1 Slad', 0), (0, '2 Rmutování', 2)]


def test_bez_stitku_a_osnovy():
    d = pdf_mod.otevri(vyrob_pdf([['a'], ['b']]))
    assert pdf_mod.stitky(d) == ['1', '2'] or pdf_mod.stitky(d) == [None, None]
    assert pdf_mod.osnova(d) == []


def test_obrazek_strany_pro_ocr():
    d = pdf_mod.otevri(vyrob_pdf([RADKY]))
    jpeg = pdf_mod.obrazek_strany(d, 0)
    obr = Image.open(io.BytesIO(jpeg))
    assert obr.format == 'JPEG' and obr.mode == 'L'
    assert max(obr.size) == pdf_mod.MAX_HRANA
