from kapitoly import (kapitola_listu, okrajove_radky, osnova_pouzitelna, rozdel_cislo, useky, z_nadpisu,
                      z_osnovy)

ODSTAVEC = 'Postup se skládá z několika kroků, které se opakují podle druhu sladu a piva.'


def _kap(kapitoly, nazev):
    return next(k for k in kapitoly if k.nazev == nazev)


def test_rozdel_cislo():
    assert rozdel_cislo('3.4.2 Rmutování') == ('3.4.2', 'Rmutování')
    assert rozdel_cislo('3. Maischen') == ('3', 'Maischen')
    assert rozdel_cislo('  Úvod  ') == (None, 'Úvod')
    assert rozdel_cislo('4.1 pH-Wert der Maische') == ('4.1', 'pH-Wert der Maische')


def test_cislovka_v_nazvu_neni_cislo_kapitoly():
    assert rozdel_cislo('10 pravidel sanitace') == (None, '10 pravidel sanitace')
    assert rozdel_cislo('100 let pivovaru Zajíc') == (None, '100 let pivovaru Zajíc')
    assert rozdel_cislo('2.5 kg sladu na várku') == (None, '2.5 kg sladu na várku')


def test_strom_a_rozsahy_z_osnovy():
    osnova = [
        (0, '1 Slad', 0),
        (1, '1.1 Ječmen', 0),
        (1, '1.2 Sladování', 3),
        (0, '2 Rmutování', 6),
        (1, '2.1 Enzymy', 6),
        (0, 'Rejstřík', 9),
    ]
    k = z_osnovy(osnova, 10)
    assert [x.nazev for x in k] == ['Slad', 'Ječmen', 'Sladování', 'Rmutování', 'Enzymy', 'Rejstřík']
    assert [x.uroven for x in k] == [1, 2, 2, 1, 2, 1]
    assert k[1].rodic == 0 and k[2].rodic == 0 and k[4].rodic == 3 and k[3].rodic is None
    assert (k[0].strana_od, k[0].strana_do) == (1, 6)
    assert (k[1].strana_od, k[1].strana_do) == (1, 3)
    assert (k[2].strana_od, k[2].strana_do) == (4, 6)
    assert (k[5].strana_od, k[5].strana_do) == (10, 10)
    assert k[0].cislo == '1' and k[4].cislo == '2.1'


def test_zalozka_mimo_poradi_neprevezme_knihu():
    # „Obsah" přidaný na konec osnovy, ale míří na list 5.
    osnova = [(0, 'Úvod', 6), (0, '1 Slad', 9), (0, '2 Chmel', 49), (0, '3 Kvasnice', 89), (0, 'Obsah', 4)]
    k = z_osnovy(osnova, 120)
    rozsahy = {x.nazev: (x.strana_od, x.strana_do) for x in k}
    assert rozsahy == {'Obsah': (5, 6), 'Úvod': (7, 9), 'Slad': (10, 49), 'Chmel': (50, 89), 'Kvasnice': (90, 120)}
    assert [x.nazev for x in k] == ['Obsah', 'Úvod', 'Slad', 'Chmel', 'Kvasnice']


def test_osnova_bez_cile_a_mimo_rozsah():
    k = z_osnovy([(0, 'Úvod', None), (0, 'Kapitola', 99)], 10)
    assert k == []


def test_skupina_bez_cile_zacina_s_prvni_podkapitolou():
    k = z_osnovy([(0, 'Část I', None), (1, '1 Slad', 2), (1, '2 Chmel', 5)], 8)
    assert [(x.nazev, x.strana_od, x.strana_do, x.rodic) for x in k] == [
        ('Část I', 3, 8, None), ('Slad', 3, 5, 0), ('Chmel', 6, 8, 0)]


def test_osnova_s_jedinou_zalozkou_se_nepouzije():
    assert not osnova_pouzitelna(z_osnovy([(0, 'Titulní strana', 0)], 300), 300)
    # Jen úvodní listy (obálka, titul, obsah) knihu nepokrývají.
    assert not osnova_pouzitelna(z_osnovy([(0, 'Obálka', 0), (0, 'Titul', 1), (0, 'Obsah', 2)], 300), 300)
    assert osnova_pouzitelna(z_osnovy([(0, '1 Slad', 4), (0, '2 Chmel', 150)], 300), 300)


def test_kapitola_z_osnovy_zacina_uprostred_listu():
    strany = [
        (1, f'3.2 Infuzní postup\n{ODSTAVEC}'),
        (2, f'{ODSTAVEC}\nKonec infuze.\n3.3 Dekokce\nDekokce je starší postup.'),
        (3, 'Dekokce pokračuje.'),
    ]
    k = z_osnovy([(1, '3.2 Infuzní postup', 0), (1, '3.3 Dekokce', 1)], 3, strany)
    dekokce = _kap(k, 'Dekokce')
    assert (dekokce.strana_od, dekokce.radek) == (2, 2)
    # Infuze končí až na listu 2 (před nadpisem dekokce je její text).
    assert _kap(k, 'Infuzní postup').strana_do == 2
    casti = useky(k, strany)
    assert casti[1] == (2, f'{ODSTAVEC}\nKonec infuze.', 0)
    assert casti[2] == (2, '3.3 Dekokce\nDekokce je starší postup.', 1)
    assert kapitola_listu(k, strany) == {1: 0, 2: 0, 3: 1}


def test_kapitoly_z_nadpisu_a_markdownu():
    strany = [
        (1, '# Rmutování\n\nText úvodu.'),
        (2, '3.1 Suroviny\nPostup se skládá z kroků.'),
        (3, '3.2 Infuzní postup\nPokračování textu.'),
        (4, 'Kapitel 4: Läuterung\nDer Läuterbottich …'),
        (5, '1. Smíchej slad s vodou.\nTo je jen seznam.'),
    ]
    k = z_nadpisu(strany, 6)
    assert [(x.cislo, x.nazev, x.uroven, x.strana_od) for x in k] == [
        (None, 'Rmutování', 1, 1),
        ('3.1', 'Suroviny', 2, 2),
        ('3.2', 'Infuzní postup', 2, 3),
        ('4', 'Läuterung', 1, 4),
    ]
    assert all(x.zdroj == 'nadpis' for x in k)


def test_nadpis_hluboko_na_strane_se_najde_a_strana_se_rozdeli():
    seznam = '\n'.join(f'- bod {i} seznamu surovin' for i in range(14))
    strany = [
        (1, f'## 2.1 Suroviny\n{seznam}\n## 2.2 Šrotování\nŠrot se mele na válcovém šrotovníku.'),
        (2, '3.1 Infuzní postup\n' + '\n'.join([ODSTAVEC] * 20) + '\n3.2 Dekokce\nDekokce je starší.'),
    ]
    k = z_nadpisu(strany, 2)
    assert [(x.cislo, x.strana_od, x.radek) for x in k] == [('2.1', 1, 0), ('2.2', 1, 15), ('3.1', 2, 0), ('3.2', 2, 21)]
    casti = useky(k, strany)
    assert [kap for _, _, kap in casti] == [0, 1, 2, 3]
    assert casti[1][1].startswith('## 2.2 Šrotování')


def test_radky_obsahu_a_odkazy_v_textu_nejsou_nadpisy():
    strany = [
        (2, 'Obsah\nKapitola 1 Slad 7\n1.1 Ječmen 7\n2.1 Rmutování 13\n2.2 Infuzní postup 13\n3.1 Dekokce 20'),
        (3, 'Předmluva\nTato kniha je pro sládky.'),
        (7, 'Kapitola 1 Slad\nSlad je naklíčené obilí.'),
        (8, '1.1 Ječmen\nJečmen je základ.'),
        (11, 'Kapitola 2 Rmutování\nKapitola 5 popisuje dekokční postupy podrobněji, zde jen\nzáklad.'),
        (12, '2.1 Enzymy\nBeta-amyláza…'),
    ]
    k = z_nadpisu(strany, 15)
    assert [(x.cislo, x.nazev, x.strana_od) for x in k] == [
        ('1', 'Slad', 7), ('1.1', 'Ječmen', 8), ('2', 'Rmutování', 11), ('2.1', 'Enzymy', 12)]


def test_obsah_s_vodicimi_teckami_se_preskoci():
    nazvy = ['Slad', 'Chmel', 'Voda', 'Kvasnice', 'Rmutování', 'Chmelovar', 'Kvašení']
    obsah = '\n'.join(f'{i}.1 {n} ........ {i * 9}' for i, n in enumerate(nazvy, start=1))
    strany = [(1, obsah), (2, '1.1 Slad\nText.'), (3, '2.1 Chmel\nText.')]
    assert [(x.cislo, x.strana_od) for x in z_nadpisu(strany, 3)] == [('1.1', 2), ('2.1', 3)]


def test_zive_zahlavi_s_cislem_strany_nevyrobi_kapitolu_na_kazdem_listu():
    strany, okraje = [], {}
    for i in range(10):
        cislo = 120 + i
        zahlavi = f'3.2 Infuzni postup {cislo}' if i % 2 else f'{cislo} Kapitola 3 Rmutovani'
        strany.append((i + 1, f'{zahlavi}\n{ODSTAVEC}\n{ODSTAVEC}'))
        okraje[i + 1] = '\n'.join(['3.2 Infuzni postup', str(cislo)] if i % 2 else [str(cislo), 'Kapitola 3 Rmutovani'])
    strany[0] = (1, f'Kapitola 3 Rmutovani\n3.1 Suroviny\n{ODSTAVEC}')
    okraje[1] = ''
    strany[3] = (4, f'3.2 Infuzni postup 123\n3.2 Infuzni postup\n{ODSTAVEC}')
    k = z_nadpisu(strany, 10, okraje)
    assert [(x.cislo, x.nazev, x.strana_od) for x in k] == [
        ('3', 'Rmutovani', 1), ('3.1', 'Suroviny', 1), ('3.2', 'Infuzni postup', 4)]


def test_okrajove_radky():
    radky = ['3.2 Infuzni postup 125', ODSTAVEC, ODSTAVEC, '- 125 -']
    assert okrajove_radky(radky, '3.2 Infuzni postup\n125\n- 125 -') == {0, 3}
    assert okrajove_radky(radky, '') == set()


def test_osamely_ciselny_radek_neni_kapitola():
    strany = [(1, f'{ODSTAVEC}\n2.5 EBC je barva tohoto sladu\n{ODSTAVEC}')]
    assert z_nadpisu(strany, 1) == []


def test_useky_bez_kapitol_a_prazdne_listy():
    strany = [(1, 'Text bez nadpisu.'), (2, ''), (3, 'Další text.')]
    assert useky([], strany) == [(1, 'Text bez nadpisu.', None), (2, '', None), (3, 'Další text.', None)]
