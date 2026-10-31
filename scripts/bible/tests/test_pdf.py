import io

from PIL import Image

import pdf as pdf_mod
from conftest import vyrob_pdf, vyrob_pdf_presne
from stranky import kandidati_cisla

RADKY = ['Die Maischarbeit beeinflusst die Zusammensetzung der Wuerze entscheidend.'] * 12
TELO = [(72, 700 - 14 * i, 'Die Maischarbeit beeinflusst die Zusammensetzung der Wuerze.') for i in range(20)]


def test_text_strany_a_okraje():
    # Řádky jdou od y = 770 po 14 bodech: číslo strany na 52. řádku leží
    # v dolním pásu 8 % výšky (pod 67 bodů), záhlaví v horním.
    data = vyrob_pdf([['3 Maischen', *RADKY] + [''] * 38 + ['124']])
    d = pdf_mod.otevri(data)
    s = pdf_mod.text_strany(d, 0)
    assert s.pdf_index == 1
    assert 'Maischarbeit' in s.text
    assert '3 Maischen' in s.okraje.splitlines()
    assert '124' in s.okraje.splitlines()
    assert '\r' not in s.text
    assert s.sken_s_vrstvou is False


def test_zive_zahlavi_jako_ze_sazby_da_cislo_strany():
    # Sazba: název vlevo, číslo vpravo na stejné účaří. V textu strany je pdfium
    # spojí jednou mezerou, v okrajích je každý úsek zvlášť.
    data = vyrob_pdf_presne([{'text': [(72, 800, '3.2 Infuzni postup'), (500, 800, '125')] + TELO}])
    s = pdf_mod.text_strany(pdf_mod.otevri(data), 0)
    assert s.text.splitlines()[0] == '3.2 Infuzni postup 125'
    assert s.okraje.splitlines() == ['3.2 Infuzni postup', '125']
    assert kandidati_cisla(s.okraje) == [125]


def test_pasy_okraju_se_meri_od_orezu_strany():
    # Oříznutý sken: CropBox nezačíná v 0, číslo dole leží uvnitř viditelné plochy.
    data = vyrob_pdf_presne([{'text': [(300, 140, '57')] + TELO, 'cropbox': (60, 120, 535, 760)}])
    s = pdf_mod.text_strany(pdf_mod.otevri(data), 0)
    assert s.okraje.splitlines() == ['57']


def test_otocena_strana_ma_okraje_podle_cteni():
    # /Rotate 180: vizuální vrch je dole v souřadnicích PDF.
    data = vyrob_pdf_presne([{'text': [(72, 30, '88'), (72, 400, 'Text uprostred strany.')], 'rotate': 180}])
    s = pdf_mod.text_strany(pdf_mod.otevri(data), 0)
    assert s.okraje.splitlines() == ['88']


def test_sken_s_neviditelnou_ocr_vrstvou():
    data = vyrob_pdf_presne([
        {'text': TELO, 'obrazek': (0, 0, 595, 842), 'neviditelny': True},   # ABBYY, Adobe Scan…
        {'text': TELO, 'obrazek': (0, 0, 595, 842), 'obrazek_nahore': True},  # text schovaný pod obrázkem
        {'text': TELO, 'obrazek': (0, 0, 595, 842)},                          # digitální text na pozadí
        {'text': TELO, 'obrazek': (100, 100, 200, 200)},                      # malý obrázek v textu
    ])
    d = pdf_mod.otevri(data)
    assert [pdf_mod.text_strany(d, i).sken_s_vrstvou for i in range(4)] == [True, True, False, False]


def test_stitky_a_osnova():
    data = vyrob_pdf([['a'], ['b'], ['c'], ['d']], stitky=[(0, 'r', 1), (2, 'D', 1)],
                     osnova=[('1 Slad', 0), ('2 Rmutování', 2)])
    d = pdf_mod.otevri(data)
    assert pdf_mod.stitky(d) == ['i', 'ii', '1', '2']
    assert pdf_mod.osnova(d) == [(0, '1 Slad', 0), (0, '2 Rmutování', 2)]


def test_vnorena_osnova():
    data = vyrob_pdf([['a'], ['b'], ['c']], osnova=[('1 Slad', 0, 0), ('1.1 Ječmen', 1, 1), ('2 Chmel', 2, 0)])
    assert pdf_mod.osnova(pdf_mod.otevri(data)) == [(0, '1 Slad', 0), (1, '1.1 Ječmen', 1), (0, '2 Chmel', 2)]


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
