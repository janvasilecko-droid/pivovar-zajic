"""Dodatek k PDF (vyvážený strom stran): stavba, kontroly a čtení po kouscích.

Jen umělá PDF („Strana 12") — žádný text skutečných knih (repo je veřejné).
"""
from __future__ import annotations

import io
import os
import re
import zlib

import pypdfium2 as pdfium
import pytest
from pypdf import PdfReader, PdfWriter

import dodatek
from dodatek import BezDodatku, RozsahovySoubor, SpojenySoubor

VZOREK = os.path.join(os.path.dirname(__file__), 'vzorky')


class Pdf:
    """Ruční skládání PDF: objekty v pořadí, jak se zapíšou, a tabulka nebo proud odkazů."""

    def __init__(self) -> None:
        self.out = bytearray(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')
        self.pozice: dict[int, tuple[int, int]] = {}
        self.v_proudu: dict[int, tuple[int, int]] = {}

    def obj(self, num: int, telo: bytes | str, gen: int = 0) -> None:
        telo = telo.encode('latin-1') if isinstance(telo, str) else telo
        self.pozice[num] = (len(self.out), gen)
        self.out += f'{num} {gen} obj\n'.encode() + telo + b'\nendobj\n'

    def proud(self, num: int, slovnik: str, data: bytes) -> None:
        self.obj(num, f'<< {slovnik} /Length {len(data)} >>\nstream\n'.encode() + data + b'\nendstream')

    def objstm(self, num: int, objekty: list[tuple[int, str]]) -> None:
        hlavicka, telo = [], b''
        for i, (n, t) in enumerate(objekty):
            hlavicka.append(f'{n} {len(telo)}')
            telo += t.encode('latin-1') + b'\n'
            self.v_proudu[n] = (num, i)
        h = (' '.join(hlavicka) + '\n').encode()
        self.proud(num, f'/Type /ObjStm /N {len(objekty)} /First {len(h)}', h + telo)

    def tabulka(self, trailer: str, jen: set[int] | None = None) -> int:
        cisla = sorted(n for n in self.pozice if jen is None or n in jen)
        x = len(self.out)
        self.out += b'xref\n'
        if jen is None:
            self.out += f'0 {max(cisla) + 1}\n0000000000 65535 f\r\n'.encode()
            for n in range(1, max(cisla) + 1):
                if n in self.pozice:
                    p, g = self.pozice[n]
                    self.out += f'{p:010d} {g:05d} n\r\n'.encode()
                else:
                    self.out += b'0000000000 00001 f\r\n'
        else:
            for n in cisla:
                p, g = self.pozice[n]
                self.out += f'{n} 1\n{p:010d} {g:05d} n\r\n'.encode()
        self.out += f'trailer\n<< {trailer} >>\nstartxref\n{x}\n%%EOF\n'.encode()
        return x

    def xref_proud(self, num: int, trailer: str) -> int:
        x = len(self.out)
        nejvyssi = max(list(self.pozice) + list(self.v_proudu) + [num])
        radky = bytearray()
        for n in range(0, nejvyssi + 1):
            if n == num:
                radky += b'\x01' + x.to_bytes(4, 'big') + b'\x00\x00'
            elif n in self.v_proudu:
                s, i = self.v_proudu[n]
                radky += b'\x02' + s.to_bytes(4, 'big') + i.to_bytes(2, 'big')
            elif n in self.pozice:
                p, g = self.pozice[n]
                radky += b'\x01' + p.to_bytes(4, 'big') + g.to_bytes(2, 'big')
            else:
                radky += b'\x00' + (0).to_bytes(4, 'big') + b'\xff\xff'
        z = zlib.compress(bytes(radky))
        self.out += (f'{num} 0 obj\n<< /Type /XRef /Size {nejvyssi + 1} /W [1 4 2] {trailer}'
                     f' /Filter /FlateDecode /Length {len(z)} >>\nstream\n').encode() + z + b'\nendstream\nendobj\n'
        self.out += f'startxref\n{x}\n%%EOF\n'.encode()
        return x


def obsah(i: int, vypln: int) -> bytes:
    return f'BT /F1 24 Tf 72 700 Td (Strana {i + 1}) Tj ET\n% '.encode() + (b'abcdefghij' * (vypln // 10 + 1))[:vypln] + b'\n'


def vyrob(n: int = 40, vypln: int = 70_000, *, tvar: str = 'plochy', xref: str = 'tabulka',
          strany_v_proudu: bool = False, slovniky_na_konci: bool = False, kat_gen: int = 0,
          aktualizace: bool = False) -> bytes:
    """Kniha s rozházenými slovníky stran (mezi obsahem). Čísla objektů:
    1 katalog, 2 kořen /Pages, 3 písmo, 4 info, 5.. obsah a strany, pak mezilehlé uzly."""
    p = Pdf()
    p.obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
    stran_cisla = [6 + 2 * i for i in range(n)]
    if tvar == 'plochy':
        rodice = [2] * n
        mezi: list[tuple[int, list[int], str]] = []
    else:  # dva mezilehlé uzly s vlastními zděděnými vlastnostmi
        pul = n // 2
        a, b = 6 + 2 * n, 7 + 2 * n
        rodice = [a] * pul + [b] * (n - pul)
        mezi = [(a, stran_cisla[:pul], '/MediaBox [0 0 500 700]'),
                (b, stran_cisla[pul:], '/Rotate 90')]
    slovniky = []
    for i in range(n):
        rot = ' /Rotate 180' if i % 7 == 3 else ''
        slovnik = f'<< /Type /Page /Parent {rodice[i]} 0 R /Contents {5 + 2 * i} 0 R{rot} >>'
        p.proud(5 + 2 * i, '', obsah(i, vypln))
        if slovniky_na_konci:
            slovniky.append((stran_cisla[i], slovnik))
        elif strany_v_proudu:
            p.objstm(1000 + i, [(stran_cisla[i], slovnik)])
        else:
            p.obj(stran_cisla[i], slovnik)
    for num, slovnik in slovniky:
        p.obj(num, slovnik)
    for num, deti, dedi in mezi:
        p.obj(num, f'<< /Type /Pages /Parent 2 0 R /Kids [{" ".join(f"{k} 0 R" for k in deti)}] /Count {len(deti)} {dedi} >>')
    kids = stran_cisla if tvar == 'plochy' else [m[0] for m in mezi]
    p.obj(2, f'<< /Type /Pages /Kids [{" ".join(f"{k} 0 R" for k in kids)}] /Count {n} /MediaBox [0 0 595 842]'
             ' /Resources << /Font << /F1 3 0 R >> >> >>')
    p.obj(1, '<< /Type /Catalog /Pages 2 0 R /PageLabels << /Nums [0 << /S /r >> 2 << /S /D >>] >> /Lang (cs) >>', gen=kat_gen)
    p.obj(4, '<< /Producer (test) >>')
    ident = '/ID [<00112233445566778899aabbccddeeff> <00112233445566778899aabbccddeeff>]'
    if xref == 'tabulka':
        x = p.tabulka(f'/Size {max(p.pozice) + 1} /Root 1 {kat_gen} R /Info 4 0 R {ident}')
    else:
        x = p.xref_proud(max(list(p.pozice) + list(p.v_proudu)) + 1, f'/Root 1 {kat_gen} R /Info 4 0 R {ident}')
    if aktualizace:
        # Přírůstková aktualizace originálu: nový objekt info.
        p.obj(4, '<< /Producer (test 2) >>')
        p.tabulka(f'/Size {max(p.pozice) + 1} /Root 1 {kat_gen} R /Info 4 0 R /Prev {x} {ident}', jen={4})
    return bytes(p.out)


def postav(data: bytes, **k) -> dodatek.Dodatek:
    return dodatek.postav(io.BytesIO(data), len(data), **k)


def strany_pdfium(data: bytes) -> list[tuple[float, float]]:
    d = pdfium.PdfDocument(data)
    try:
        return [d.get_page_size(i) for i in range(len(d))]
    finally:
        d.close()


def texty_stran(data: bytes, indexy: list[int]) -> list[str]:
    d = pdfium.PdfDocument(data)
    try:
        return [d[i].get_textpage().get_text_range().strip() for i in indexy]
    finally:
        d.close()


# --- stavba a kontroly -------------------------------------------------------------

def test_plochy_strom_dostane_maly_dodatek_a_strany_zustanou():
    data = vyrob()
    d = postav(data)
    assert d.stran == 40 and d.delka_originalu == len(data)
    # pdf.js bez dodatku čte slovník každé strany; s dodatkem jen dvou (poslední + hledaná).
    assert d.kusu_pred >= 40 and d.kusu_po <= 2
    assert d.data.startswith(b'\n') and d.data.endswith(b'%%EOF\n')
    assert len(d.data) < 3000
    cele = data + d.data
    # Stejné strany ve stejném pořadí, zděděné rozměry a otočení i text.
    assert strany_pdfium(cele) == strany_pdfium(data)
    assert texty_stran(cele, [0, 3, 39]) == ['Strana 1', 'Strana 4', 'Strana 40']
    r = PdfReader(io.BytesIO(cele), strict=True)
    assert [p.indirect_reference.idnum for p in r.pages] == [6 + 2 * i for i in range(40)]
    assert r.trailer['/Root']['/Lang'] == 'cs'
    # Žádný text knihy v dodatku — jen struktura (obsah stran zůstává v originále).
    assert b'Strana' not in zlib.decompress(d.data.split(b'stream\n', 1)[1].split(b'\nendstream', 1)[0])


def test_proud_krizovych_odkazu_a_strany_v_objektovych_proudech():
    for kniha in (vyrob(xref='proud'), vyrob(xref='proud', strany_v_proudu=True)):
        d = postav(kniha)
        assert d.kusu_po <= 2
        assert strany_pdfium(kniha + d.data) == strany_pdfium(kniha)
        assert texty_stran(kniha + d.data, [39]) == ['Strana 40']


def test_vnoreny_strom_s_dedenim_na_uzlech():
    kniha = vyrob(tvar='vnoreny')
    d = postav(kniha)
    rozmery = strany_pdfium(kniha + d.data)
    assert rozmery == strany_pdfium(kniha)
    # MediaBox z prvního uzlu, Rotate 90 z druhého (strany se dál dědí přes svůj /Parent).
    assert rozmery[0] == (500.0, 700.0) and rozmery[25] == (842.0, 595.0)


def test_katalog_s_generaci_a_drivejsi_aktualizace():
    kniha = vyrob(kat_gen=2, aktualizace=True)
    d = postav(kniha)
    assert b'\n1 2 obj\n' in d.data
    r = PdfReader(io.BytesIO(kniha + d.data), strict=True)
    assert r.metadata.producer == 'test 2'
    assert len(r.pages) == 40
    # /Prev ukazuje na poslední tabulku originálu (tu z aktualizace).
    assert f'/Prev {dodatek.posledni_startxref(io.BytesIO(kniha), len(kniha))}'.encode() in d.data


def test_dodatek_je_pokazde_stejny():
    kniha = vyrob(n=30)
    assert postav(kniha).data == postav(kniha).data


def test_kde_neni_co_zrychlit():
    with pytest.raises(BezDodatku) as e:
        postav(vyrob(slovniky_na_konci=True))
    assert e.value.duvod == 'strom_staci'
    with pytest.raises(BezDodatku) as e:
        postav(vyrob(n=3))
    assert e.value.duvod == 'strom_staci'


def test_sifrovane_pdf():
    w = PdfWriter(clone_from=io.BytesIO(vyrob(n=10, vypln=100)))
    w.encrypt(user_password='', owner_password='majitel', algorithm='RC4-128')
    b = io.BytesIO()
    w.write(b)
    with pytest.raises(BezDodatku) as e:
        postav(b.getvalue())
    assert e.value.duvod == 'sifrovane'


@pytest.mark.parametrize('zmena', [
    (b'<< /Type /Pages /Kids', b'<< /Kids'),                 # uzel bez /Type
    (b'/Count 40 /MediaBox', b'/Count 41 /MediaBox'),          # špatný počet stran
    (b'/Kids [6 0 R 8 0 R', b'/Kids [6 0 R 6 0 R'),            # strana dvakrát
])
def test_nejednoznacny_strom(zmena):
    kniha = vyrob().replace(*zmena, 1)
    with pytest.raises(BezDodatku) as e:
        postav(kniha)
    assert e.value.duvod == 'struktura'


def test_rozbita_tabulka_a_cisla_nad_size():
    kniha = vyrob()
    with pytest.raises(BezDodatku) as e:
        postav(kniha[:-40] + kniha[-40:].replace(b'startxref\n', b'startxref\n9'))
    assert e.value.duvod == 'struktura'
    mala_size = re.sub(rb'trailer\n<< /Size \d+ ', b'trailer\n<< /Size 50 ', kniha)
    assert mala_size != kniha
    with pytest.raises(BezDodatku) as e:
        postav(mala_size)
    assert e.value.duvod == 'struktura'


# --- čtení po kouscích (starší knihy bez stažení celého souboru) --------------------

def test_rozsahovy_soubor_stahne_jen_kousky_a_da_stejny_dodatek():
    kniha = vyrob(n=60)
    dotazy: list[tuple[int, int]] = []

    def cti(od: int, do_: int) -> bytes:
        dotazy.append((od, do_))
        return kniha[od:do_]

    soubor = RozsahovySoubor(cti, len(kniha))
    d = dodatek.postav(soubor, len(kniha))
    assert d.data == postav(kniha).data
    assert soubor.stazeno == sum(b - a for a, b in dotazy)
    assert soubor.stazeno < len(kniha) / 10
    assert all(0 <= a < b <= len(kniha) and b - a <= 64 * 1024 for a, b in dotazy)


def test_rozsahovy_soubor_rozpocet_a_chyba_site():
    kniha = vyrob(n=60)
    with pytest.raises(BezDodatku) as e:
        dodatek.postav(RozsahovySoubor(lambda od, do_: kniha[od:do_], len(kniha), rozpocet=20_000), len(kniha))
    assert e.value.duvod == 'rozsah'

    def spadne(od: int, do_: int) -> bytes:
        raise ConnectionError('síť')

    with pytest.raises(dodatek.ChybaCteni):
        dodatek.postav(RozsahovySoubor(spadne, len(kniha)), len(kniha))
    with pytest.raises(dodatek.ChybaCteni):
        RozsahovySoubor(lambda od, do_: b'x', len(kniha)).read(10)


def test_rozsahovy_a_spojeny_soubor_ctou_presne():
    data = bytes(range(256)) * 100
    s = RozsahovySoubor(lambda od, do_: data[od:do_], len(data), blok=1000)
    s.seek(2500)
    assert s.read(3000) == data[2500:5500]
    s.predem([(9000, 12_000), (20_000, 25_600)])
    assert s.read(10) == data[5500:5510]
    s.seek(-5, io.SEEK_END)
    assert s.read() == data[-5:]
    sp = SpojenySoubor(io.BytesIO(data), len(data), b'DODATEK')
    sp.seek(len(data) - 3)
    assert sp.read(6) == data[-3:] + b'DOD'
    assert sp.seek(0, io.SEEK_END) == len(data) + 7


# --- vzorek pro test appky (src/lib/biblePdf.test.ts čte tytéž soubory) -------------

def test_vzorek_pro_appku():
    """Malá kniha a její dodatek, na kterých appka zkouší skutečné pdf.js.

    Stavba se tu zkouší s 1kB kousky (appka v testu čte po 1 kB, ať se
    vzorek vejde do pár desítek kB). Přepsat: PREPSAT_VZOREK=1 pytest …
    """
    kniha = vyrob(n=24, vypln=1500, tvar='vnoreny', xref='proud')
    d = postav(kniha, kus=1024)
    assert d.kusu_po <= 2 < d.kusu_pred
    cesty = os.path.join(VZOREK, 'kniha-vnoreny-strom.pdf'), os.path.join(VZOREK, 'kniha-vnoreny-strom.dodatek')
    if os.environ.get('PREPSAT_VZOREK') == '1':
        os.makedirs(VZOREK, exist_ok=True)
        for cesta, obsah_ in zip(cesty, (kniha, d.data)):
            with open(cesta, 'wb') as f:
                f.write(obsah_)
    with open(cesty[0], 'rb') as f:
        assert f.read() == kniha
    with open(cesty[1], 'rb') as f:
        assert f.read() == d.data


def test_duvody_a_verze_odpovidaji_migraci():
    cesta = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'bible', 'supabase', 'migrations',
                         '20261111050000_bible_dodatky.sql')
    with open(cesta, encoding='utf-8') as f:
        sql = f.read()
    m = re.search(r"duvod text CHECK \(duvod IN \(([^)]*)\)\)", sql)
    assert m and re.findall(r"'([a-z_]+)'", m.group(1)) == list(dodatek.DUVODY)
    assert dodatek.MAX_DODATKU < 2_000_000 and 'BETWEEN 16 AND 2000000' in sql


def test_actions_se_ptaji_na_stejnou_verzi_dodatku():
    cesta = os.path.join(os.path.dirname(__file__), '..', '..', '..', '.github', 'workflows', 'bible-zpracovani.yml')
    with open(cesta, encoding='utf-8') as f:
        assert f'"p_verze": {dodatek.VERZE}' in f.read()


def test_predem_nestahuje_blok_dvakrat():
    data = bytes(range(256)) * 64
    dotazy: list[tuple[int, int]] = []

    def cti(od: int, do_: int) -> bytes:
        dotazy.append((od, do_))
        return data[od:do_]

    s = RozsahovySoubor(cti, len(data), blok=1024)
    s.predem([(100, 2148), (3000, 5048), (9000, 9100)])
    stazene = [i for a, b in dotazy for i in range(a // 1024, (b - 1) // 1024 + 1)]
    assert sorted(stazene) == sorted(set(stazene)) == [0, 1, 2, 3, 4, 8]
    assert s.stazeno == sum(b - a for a, b in dotazy)
