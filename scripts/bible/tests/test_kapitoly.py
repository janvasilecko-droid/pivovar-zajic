from kapitoly import kapitola_strany, rozdel_cislo, z_nadpisu, z_osnovy


def test_rozdel_cislo():
    assert rozdel_cislo('3.4.2 Rmutování') == ('3.4.2', 'Rmutování')
    assert rozdel_cislo('3. Maischen') == ('3', 'Maischen')
    assert rozdel_cislo('  Úvod  ') == (None, 'Úvod')


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


def test_osnova_bez_cile_a_mimo_rozsah():
    k = z_osnovy([(0, 'Úvod', None), (0, 'Kapitola', 99)], 10)
    assert k[0].strana_od is None and k[1].strana_od is None


def test_kapitola_strany_bere_nejhlubsi():
    k = z_osnovy([(0, '1 Slad', 0), (1, '1.1 Ječmen', 0), (1, '1.2 Sladování', 3)], 6)
    assert k[kapitola_strany(k, 2)].nazev == 'Ječmen'
    assert k[kapitola_strany(k, 5)].nazev == 'Sladování'
    assert kapitola_strany([], 1) is None


def test_kapitoly_z_nadpisu_a_markdownu():
    strany = [
        (1, '# Rmutování\n\nText úvodu.'),
        (2, '3.2 Infuzní postup\nPostup se skládá z kroků.'),
        (3, '3.2 Infuzní postup\nPokračování (živé záhlaví se opakuje).'),
        (4, 'Kapitel 4: Läuterung\nDer Läuterbottich …'),
        (5, '1. Smíchej slad s vodou.\nTo je jen seznam.'),
    ]
    k = z_nadpisu(strany, 6)
    assert [(x.cislo, x.nazev, x.uroven, x.strana_od) for x in k] == [
        (None, 'Rmutování', 1, 1),
        ('3.2', 'Infuzní postup', 2, 2),
        ('4', 'Läuterung', 1, 4),
    ]
    assert all(x.zdroj == 'nadpis' for x in k)
