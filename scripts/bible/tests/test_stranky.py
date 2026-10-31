from stranky import je_digitalni, kandidati_cisla, tistena_cisla

ODSTAVEC = ('Die Maischarbeit beeinflusst die Zusammensetzung der Würze entscheidend. '
            'Bei 62 bis 65 °C arbeitet die beta-Amylase am besten, bei 72 °C die alpha-Amylase. ') * 2


def test_textova_vrstva_s_pismeny_je_digitalni():
    assert je_digitalni(ODSTAVEC)


def test_prazdna_kratka_nebo_rozbita_vrstva_je_sken():
    assert not je_digitalni('')
    assert not je_digitalni(None)
    assert not je_digitalni('124')
    assert not je_digitalni('(cid:12)(cid:44)(cid:7)(cid:9)(cid:3)(cid:88) ' * 20)
    assert not je_digitalni('�' * 50 + ODSTAVEC[:150])
    assert not je_digitalni('12 34 56 78 90 ' * 30)


def test_kandidati_cisla_v_zahlavi_a_zapati():
    assert kandidati_cisla('124') == [124]
    assert kandidati_cisla('– 124 –') == [124]
    assert kandidati_cisla('S. 37\nSeite 38\nstr. 39\npage 40') == [37, 38, 39, 40]
    assert kandidati_cisla('124    3 Rmutování') == [124]
    assert kandidati_cisla('3 Rmutování    124') == [124]
    assert kandidati_cisla('Kapitola tři bez čísla') == []


def test_letopocet_neni_cislo_strany():
    assert kandidati_cisla('© 2019', pocet_stran=400) == []
    assert kandidati_cisla('1950', pocet_stran=2400) == [1950]


def test_posun_z_cisel_v_zapati():
    # Listy 1–3 bez čísla (titul, obsah), od listu 4 tištěná strana 1, 2, 3…
    kandidati = [[], [], []] + [[i] for i in range(1, 11)]
    vysledek = tistena_cisla(kandidati)
    assert vysledek[:3] == [(None, None)] * 3
    assert vysledek[3] == ('1', 'zahlavi')
    assert vysledek[12] == ('10', 'zahlavi')


def test_strana_bez_cisla_uvnitr_useku_se_dopocita_ale_na_okraji_ne():
    kandidati = [[1], [2], [3], [], [5], [6], [7]]
    vysledek = tistena_cisla(kandidati)
    assert vysledek[3] == ('4', 'dopocet')
    # Za posledním číslem už není soused, který by posun potvrdil.
    kandidati2 = [[1], [2], [3], [4], []]
    assert tistena_cisla(kandidati2)[4] == (None, None)


def test_cislo_kapitoly_v_zahlavi_nezmate():
    # Živé záhlaví „3 Rmutování" na každé straně + skutečné číslo strany.
    kandidati = [[3, 120 + i] for i in range(10)]
    vysledek = tistena_cisla(kandidati)
    assert [c for c, _ in vysledek] == [str(120 + i) for i in range(10)]


def test_malo_dukazu_nic_nehada():
    assert tistena_cisla([[5], [], [], [], []]) == [(None, None)] * 5


def test_obrazova_priloha_zmeni_posun():
    # Strany 1–6, pak 4 listy příloh bez čísel, pak pokračuje strana 7.
    kandidati = [[i] for i in range(1, 7)] + [[], [], [], []] + [[i] for i in range(7, 13)]
    vysledek = tistena_cisla(kandidati)
    assert vysledek[5] == ('6', 'zahlavi')
    assert vysledek[6:10] == [(None, None)] * 4   # přílohy: posun před a za se liší
    assert vysledek[10] == ('7', 'zahlavi')


def test_stitky_pdf_maji_prednost_jen_kdyz_nejsou_obycejne_poradi():
    assert tistena_cisla([[], [], []], ['i', 'ii', '1']) == [('i', 'stitek_pdf'), ('ii', 'stitek_pdf'), ('1', 'stitek_pdf')]
    # Štítky 1, 2, 3 = jen pořadí listů → rozhoduje záhlaví.
    assert tistena_cisla([[10], [11], [12], [13]], ['1', '2', '3', '4'])[0] == ('10', 'zahlavi')
