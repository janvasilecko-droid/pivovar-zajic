import io
import zipfile
from datetime import datetime

import pytest

import formaty

XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def test_na_casti_po_odstavcich_a_nadpisech():
    odstavec = 'Rmutování je enzymatický proces. ' * 20   # ≈ 660 znaků
    text = '\n\n'.join(['# Úvod', odstavec, odstavec, '# Rmutování', odstavec, odstavec, odstavec, odstavec, odstavec])
    casti = formaty.na_casti(text, cil=2000)
    assert len(casti) >= 3
    assert all(len(c) <= 2000 + len(odstavec) for c in casti)
    # Nadpis začíná novou část, když je ta předchozí aspoň třetinová.
    assert any(c.startswith('# Rmutování') for c in casti)
    assert formaty.na_casti('') == []


def test_txt_bez_prazdnych_radku_se_rozdeli_a_nadpis_zacne_kus():
    radky = [f'Odstavec {i}: rmutování probíhá při různých teplotách podle druhu piva.' for i in range(300)]
    radky.insert(150, '# Chmelovar')
    casti = formaty.na_casti('\n'.join(radky), cil=3000)
    assert len(casti) > 5 and all(len(c) <= 3000 for c in casti)
    assert any(c.startswith('# Chmelovar') for c in casti)
    assert sum(c.count('Odstavec') for c in casti) == 300


def test_velka_tabulka_v_casti_opakuje_hlavicku():
    tabulka = '| Slad | Extrakt |\n|---|---|\n' + '\n'.join(f'| Slad {i} | {80 + i % 5} |' for i in range(500))
    casti = formaty.na_casti(tabulka, cil=3000)
    assert len(casti) >= 3 and all(len(c) <= 3000 for c in casti)
    assert all(c.startswith('| Slad | Extrakt |\n|---|---|\n') for c in casti)
    assert sum(c.count('| Slad ') for c in casti) - len(casti) == 500


def test_dekoduj_text_utf8_i_cp1250():
    assert formaty.dekoduj_text('Žluťoučký kůň'.encode('utf-8')) == 'Žluťoučký kůň'
    assert formaty.dekoduj_text('Žluťoučký kůň úpěl ďábelské ódy'.encode('cp1250')) == 'Žluťoučký kůň úpěl ďábelské ódy'


def test_dekoduj_text_utf16_utf32_a_bom():
    text = 'Rmutování při 62 °C\nŠkrob se štěpí.'
    assert formaty.dekoduj_text(text.encode('utf-16')) == text            # s BOM (Poznámkový blok „Unicode")
    assert formaty.dekoduj_text(text.encode('utf-16-le')) == text         # bez BOM
    assert formaty.dekoduj_text(text.encode('utf-16-be')) == text
    assert formaty.dekoduj_text(text.encode('utf-32')) == text
    assert formaty.dekoduj_text(b'\xef\xbb\xbf' + text.encode('utf-8')) == text
    assert '\x00' not in formaty.dekoduj_text(text.encode('utf-16'))


def test_utf8_s_jednim_vadnym_bajtem_zustane_utf8():
    data = 'Rmutování při 52 °C trvá 20 minut'.encode('utf-8') + b' \x96 ' + 'žádná změna diakritiky.'.encode('utf-8')
    text = formaty.dekoduj_text(data)
    assert text.startswith('Rmutování při 52 °C') and 'žádná' in text


def _docx(xml_tela: str) -> bytes:
    import docx
    from docx.oxml import parse_xml

    d = docx.Document()
    d.add_heading('Chmelovar', level=1)
    telo = d.element.body
    nsdecl = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
              'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
              'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
              'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
              'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"')
    for prvek in parse_xml(f'<w:wrap {nsdecl}>{xml_tela}</w:wrap>'):
        telo.insert(len(telo) - 1, prvek)
    proud = io.BytesIO()
    d.save(proud)
    return proud.getvalue()


def test_docx_nadpisy_odstavce_a_tabulka():
    import docx

    d = docx.Document()
    d.add_heading('Chmelovar', level=1)
    d.add_paragraph('Var trvá 90 minut.')
    d.add_heading('Odpar', level=2)
    tab = d.add_table(rows=2, cols=2)
    tab.cell(0, 0).text, tab.cell(0, 1).text = 'Čas', 'Odpar'
    tab.cell(1, 0).text, tab.cell(1, 1).text = '90 min', '8 %'
    proud = io.BytesIO()
    d.save(proud)
    vysledek = formaty.docx_na_text(proud.getvalue())
    assert '# Chmelovar' in vysledek.text and '## Odpar' in vysledek.text
    assert 'Var trvá 90 minut.' in vysledek.text
    assert '| Čas | Odpar |' in vysledek.text and '| 90 min | 8 % |' in vysledek.text
    assert vysledek.obrazku == 0


def test_docx_sledovane_zmeny_pole_sdt_a_vzorce():
    r = lambda t: f'<w:r><w:t xml:space="preserve">{t}</w:t></w:r>'  # noqa: E731
    xml = (
        # Přepsaná hodnota se sledováním změn: platí vložená (65), smazaná (62) ne.
        f'<w:p>{r("Teplota rmutu je ")}<w:del w:id="1" w:author="x"><w:r><w:delText>62</w:delText></w:r></w:del>'
        f'<w:ins w:id="2" w:author="x">{r("65")}</w:ins>{r(" °C.")}</w:p>'
        # Výsledek pole (odkaz na tabulku), kód pole ne.
        f'<w:p>{r("Hodnoty viz tabulka ")}<w:fldSimple w:instr=" REF tab32 ">{r("3.2")}</w:fldSimple>{r(".")}</w:p>'
        f'<w:p>{r("Strana ")}<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGEREF x </w:instrText></w:r>'
        f'<w:r><w:fldChar w:fldCharType="separate"/></w:r>{r("45")}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
        # Ovládací prvek obsahu (šablona) na úrovni těla.
        f'<w:sdt><w:sdtContent><w:p>{r("Rmutovací postup: 52 °C 15 min, 63 °C 40 min.")}</w:p></w:sdtContent></w:sdt>'
        # Vzorec z editoru rovnic: výtěžnost = E·V / S.
        f'<w:p>{r("Výtěžnost varny: ")}<m:oMath><m:f><m:num><m:r><m:t>E·V</m:t></m:r></m:num>'
        f'<m:den><m:r><m:t>S</m:t></m:r></m:den></m:f></m:oMath>{r(" (v %).")}</w:p>'
        # Obrázek (sken strany vložený do Wordu) se spočítá.
        '<w:p><w:r><w:drawing><wp:inline><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip/></pic:blipFill>'
        '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    )
    vysledek = formaty.docx_na_text(_docx(xml))
    text = vysledek.text
    assert 'Teplota rmutu je 65 °C.' in text and '62' not in text
    assert 'Hodnoty viz tabulka 3.2.' in text and 'REF' not in text
    assert 'Strana 45' in text and 'PAGEREF' not in text
    assert 'Rmutovací postup: 52 °C 15 min, 63 °C 40 min.' in text
    assert '$(E·V)/(S)$' in text
    assert vysledek.obrazku == 1


def _epub(kapitoly: list[tuple[str, str]], hrefy: list[str] | None = None, kodovani: str = 'utf-8',
          navic_spine: int = 0, sifrovani: str | None = None) -> bytes:
    hrefy = hrefy or [f'k{i}.xhtml' for i in range(len(kapitoly))]
    proud = io.BytesIO()
    with zipfile.ZipFile(proud, 'w') as z:
        z.writestr('mimetype', 'application/epub+zip')
        z.writestr('META-INF/container.xml',
                   '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">'
                   '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        if sifrovani:
            z.writestr('META-INF/encryption.xml', sifrovani)
        from urllib.parse import quote
        manifest = ''.join(f'<item id="k{i}" href="{quote(h)}" media-type="application/xhtml+xml"/>' for i, h in enumerate(hrefy))
        manifest += ''.join(f'<item id="x{i}" href="chybi{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(navic_spine))
        # Pořadí čtení schválně obrácené proti manifestu — rozhoduje spine.
        spine = ''.join(f'<itemref idref="k{i}"/>' for i in reversed(range(len(kapitoly))))
        spine += ''.join(f'<itemref idref="x{i}"/>' for i in range(navic_spine))
        z.writestr('OEBPS/content.opf',
                   f'<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">'
                   f'<manifest>{manifest}</manifest><spine>{spine}</spine></package>')
        for (nadpis, telo), href in zip(kapitoly, hrefy):
            html = (f'<?xml version="1.0" encoding="{kodovani}"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title>'
                    f'<style>p{{}}</style></head><body><h1>{nadpis}</h1><p>{telo}</p>'
                    f'<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table></body></html>')
            z.writestr(f'OEBPS/{href}', html.encode(kodovani))
    return proud.getvalue()


def test_epub_v_poradi_cteni_s_nadpisy_a_tabulkou():
    vysledek = formaty.epub_na_text(_epub([('Slad', 'Ječmen se máčí.'), ('Rmut', 'Teplota 62 °C.')]))
    text = vysledek.text
    assert text.index('# Rmut') < text.index('# Slad')
    assert 'Ječmen se máčí.' in text and 'Teplota 62 °C.' in text
    assert '| A | B |' in text and '| 1 | 2 |' in text
    assert 'p{}' not in text   # obsah <style> se nepřepisuje
    assert vysledek.varovani == []


def test_epub_procentne_kodovany_href_a_kodovani_xhtml():
    vysledek = formaty.epub_na_text(_epub([('Rmutování', 'Rmutuje se při 62 °C.'), ('Chmel', 'Žatecký poloraný červeňák.')],
                                         hrefy=['kapitola 1.xhtml', 'kapitola_č2.xhtml'], kodovani='windows-1250'))
    assert '# Rmutování' in vysledek.text and 'Rmutuje se při 62 °C.' in vysledek.text
    assert 'Žatecký poloraný červeňák.' in vysledek.text and '\ufffd' not in vysledek.text


def test_epub_chybejici_cast_se_ohlasi():
    vysledek = formaty.epub_na_text(_epub([('Slad', 'Text.')], navic_spine=2))
    assert vysledek.varovani and '2 z 3' in vysledek.varovani[0]


def test_epub_s_drm_je_chyba_a_zamaskovane_fonty_ne():
    drm = ('<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">'
           '<enc:EncryptedData><enc:CipherData><enc:CipherReference URI="OEBPS/k0.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>')
    with pytest.raises(formaty.ChybaFormatu):
        formaty.epub_na_text(_epub([('Slad', 'Text.')], sifrovani=drm))
    fonty = drm.replace('OEBPS/k0.xhtml', 'OEBPS/fonts/a.otf')
    assert 'Text.' in formaty.epub_na_text(_epub([('Slad', 'Text.')], sifrovani=fonty)).text


def test_epub_vzorec_mathml_a_obrazky():
    mathml = ('Výtěžnost: <math><mi>V</mi><mo>=</mo><mfrac><mrow><mi>E</mi><mo>·</mo><mi>M</mi></mrow><mi>S</mi></mfrac></math> %'
              '<img src="a.png"/><math alttext="IBU = U \\cdot \\alpha"><mi>x</mi></math>')
    vysledek = formaty.epub_na_text(_epub([('Vzorce', mathml)]))
    assert '$V=(E·M)/(S)$' in vysledek.text
    assert '$IBU = U \\cdot \\alpha$' in vysledek.text
    assert vysledek.obrazku == 1


def test_csv_cesky_s_carkou_v_cislech_i_v_hlavicce():
    data = 'Slad;Extrakt, %;Barva, EBC\nSlad 0;81,2;14,2\nSlad 1;80,5;3,5\n'.encode('utf-8')
    casti, varovani = formaty.casti_tabulek(data, 'text/csv')
    assert len(casti) == 1 and varovani == []
    assert '| Slad | Extrakt, % | Barva, EBC |' in casti[0] and '| Slad 0 | 81,2 | 14,2 |' in casti[0]
    assert '(řádky 2–3)' in casti[0]
    # Jen čísla bez hlavičky a řádky s různým počtem polí.
    assert '| 81,5 | 16,3 |' in formaty.casti_tabulek('81,5;16,3\n80,1;15,9\n'.encode(), 'text/csv')[0][0]
    ruzne = 'Slad;Extrakt;Barva\n' + '\n'.join(f'Slad {i};8{i},5;{i},5' + (';ok' if i % 3 == 0 else '') for i in range(9))
    assert '| Slad 0 | 80,5 | 0,5 | ok |' in formaty.casti_tabulek(ruzne.encode(), 'text/csv')[0][0]
    # Anglické CSV s čárkou.
    assert '| Malt | 81.5 |' in formaty.casti_tabulek(b'Malt,Extract\nMalt,81.5\n', 'text/csv')[0][0]


def _xlsx(naplneni) -> bytes:
    import openpyxl

    sesit = openpyxl.Workbook()
    naplneni(sesit.active)
    proud = io.BytesIO()
    sesit.save(proud)
    return proud.getvalue()


def test_xlsx_cisla_radku_odpovidaji_excelu_a_hlavicka_se_opakuje():
    def naplneni(lst):
        lst.title = 'Voda'
        lst['A1'] = 'Tabulka 4: Rozbor vody 2026'
        # řádek 2 prázdný, hlavička v řádku 3, data od řádku 4
        lst.append([])
        lst['A3'], lst['B3'] = 'Ion', 'mg/l'
        for i in range(45):
            lst.cell(row=4 + i, column=1, value=f'ion{i}')
            lst.cell(row=4 + i, column=2, value=i)
    casti, _ = formaty.casti_tabulek(_xlsx(naplneni), XLSX)
    assert len(casti) == 2
    assert casti[0].startswith('## Voda\n\n(řádky 4–43; Tabulka 4: Rozbor vody 2026)')
    assert casti[1].startswith('## Voda\n\n(řádky 44–48; Tabulka 4: Rozbor vody 2026)')
    assert all('| Ion | mg/l |' in c for c in casti)
    assert '| ion0 | 0 |' in casti[0] and '| ion40 | 40 |' in casti[1]


def test_xlsx_hodnoty_jako_v_excelu():
    def naplneni(lst):
        lst.append(['Slad', 'Odpar', 'Výtěžnost', 'Extrakt', 'Datum', 'Poměr'])
        lst.append(['Slad 43', 0.08, 0.8430000000000001, 12.5, datetime(2026, 10, 1), 0.1 + 0.2])
        lst['B2'].number_format = '0%'
        lst['C2'].number_format = '0.0%'
        lst['D2'].number_format = '0.0" °P"'
    casti, _ = formaty.casti_tabulek(_xlsx(naplneni), XLSX)
    assert '| Slad 43 | 8% | 84.3% | 12.5 °P | 2026-10-01 | 0.3 |' in casti[0]


def test_xlsx_zbloudila_bunka_vpravo_nenafoukne_text():
    def naplneni(lst):
        lst.append(['Slad', 'Extrakt'])
        for i in range(50):
            lst.append([f'Slad {i}', 80 + i % 3])
        lst['XFD1'].font = __import__('openpyxl').styles.Font(bold=True)
        lst['XFD1'] = ''
    casti, varovani = formaty.casti_tabulek(_xlsx(naplneni), XLSX)
    assert sum(len(c) for c in casti) < 5000
    assert '| Slad | Extrakt |' in casti[0]
    assert varovani and 'sloupců' in varovani[0]


def test_formatuj_cislo():
    assert formaty.formatuj_cislo(0.08, '0%') == '8%'
    assert formaty.formatuj_cislo(0.843, '0.0%') == '84.3%'
    assert formaty.formatuj_cislo(1234.5678, '#,##0.00') == '1234.57'
    assert formaty.formatuj_cislo(12.5, '0.0" °P"') == '12.5 °P'
    assert formaty.formatuj_cislo(0.8430000000000001, 'General') == '0.843'
    assert formaty.formatuj_cislo(7, 'General') == '7'
    assert formaty.formatuj_cislo(-3.25, '0.00;[Red]-0.00') == '-3.25'
