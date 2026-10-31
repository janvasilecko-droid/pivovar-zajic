from stranky import je_digitalni, je_mojibake, kandidati_cisla, tistena_cisla

ODSTAVEC = ('Die Maischarbeit beeinflusst die Zusammensetzung der Würze entscheidend. '
            'Bei 62 bis 65 °C arbeitet die beta-Amylase am besten, bei 72 °C die alpha-Amylase. ') * 2
CESKY = ('Při rmutování se škrob štěpí na zkvasitelné cukry; beta-amyláza pracuje nejlépe '
         'až při 62–65 °C, alfa-amyláza při 72 °C. Řízení teplot je proto důležité. ') * 2


def test_textova_vrstva_s_pismeny_je_digitalni():
    assert je_digitalni(ODSTAVEC)
    assert je_digitalni(CESKY)


def test_ciselna_tabulka_je_digitalni():
    # Platóva tabulka: skoro jen číslice — textová vrstva je přesná, OCR by jen škodilo.
    tabulka = '\n'.join(f'{p:.1f} {1 + p * 0.004:.4f} {p * 10.3:.2f}' for p in range(8, 30))
    assert je_digitalni(tabulka)


def test_obsah_s_vodicimi_teckami_je_digitalni():
    obsah = '\n'.join(f'{i}.1 Kapitola o pivu ' + '.' * 60 + f' {i * 7}' for i in range(1, 12))
    assert je_digitalni(obsah)


def test_prazdna_kratka_nebo_rozbita_vrstva_je_sken():
    assert not je_digitalni('')
    assert not je_digitalni(None)
    assert not je_digitalni('124')
    assert not je_digitalni('(cid:12)(cid:44)(cid:7)(cid:9)(cid:3)(cid:88) ' * 20)
    assert not je_digitalni('�' * 50 + ODSTAVEC[:150])
    # Font se symboly v soukromé oblasti Unicode (bez mapy znaků).
    assert not je_digitalni('  ' * 40)
    # Jen interpunkce a značky.
    assert not je_digitalni('§ ¶ † ‡ ° ± × ÷ ' * 30)


def test_mojibake_cestiny_je_sken():
    # Starší sazba: ISO-8859-2 bez mapy znaků → „Pøi … ¹krob … a¾".
    rozbite = CESKY.replace('–', '-').encode('iso-8859-2').decode('latin-1')
    assert je_mojibake(rozbite) and not je_digitalni(rozbite)
    # UTF-8 přečtené jako cp1252.
    utf8 = CESKY.encode('utf-8').decode('cp1252', errors='replace')
    assert je_mojibake(utf8) and not je_digitalni(utf8)
    # Správný text, Sørensen a poznámka pod čarou¹ mojibake nejsou.
    assert not je_mojibake(CESKY + ' Sørensen zavedl stupnici pH.¹ ' + ODSTAVEC)


def test_kandidati_cisla_v_zahlavi_a_zapati():
    assert kandidati_cisla('124') == [124]
    assert kandidati_cisla('– 124 –') == [124]
    assert kandidati_cisla('S. 37\nSeite 38\nstr. 39\npage 40') == [37, 38, 39, 40]
    assert kandidati_cisla('124 | Kapitola 3') == [124]
    assert kandidati_cisla('Kapitola tři bez čísla') == []
    assert kandidati_cisla('Tab. 3\nObr. 5') == []


def test_kandidati_z_ziveho_zahlavi_s_jednou_mezerou():
    # Takhle záhlaví vrací pdfium i OCR: číslo a název spojené jednou mezerou.
    assert kandidati_cisla('3.2 Infuzní postup 125') == [125]
    assert 124 in kandidati_cisla('124 Kapitola 3 Rmutování')
    # Číslo kapitoly se dostane mezi kandidáty taky — vyřadí ho až hlasování.
    assert set(kandidati_cisla('124 Kapitola 3')) == {124, 3}


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


def test_zive_zahlavi_stridave_vlevo_a_vpravo():
    # Sudé strany „124 Kapitola 3", liché „3.2 Infuzní postup 125".
    okraje = [f'{124 + i} Kapitola 3' if i % 2 == 0 else f'3.2 Infuzní postup {124 + i}' for i in range(10)]
    vysledek = tistena_cisla([kandidati_cisla(o) for o in okraje])
    assert [c for c, _ in vysledek] == [str(124 + i) for i in range(10)]


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


def test_jeden_neciselny_stitek_neudela_ze_stitku_tistena_cisla():
    # Štítky „Obálka, 2, 3…" (jen pořadí), vytištěno 1, 2, 3… od listu 5.
    stitky = ['Obálka'] + [str(i + 1) for i in range(1, 14)]
    kandidati = [[], [], [], []] + [[i] for i in range(1, 11)]
    vysledek = tistena_cisla(kandidati, stitky)
    assert vysledek[4] == ('1', 'zahlavi') and vysledek[13] == ('10', 'zahlavi')
    assert vysledek[0] == (None, None)


def test_stitky_v_rozporu_s_tiskem_se_nepouziji():
    # Štítky „Cover, 1, 2…" posunuté o list proti číslům vytištěným v zápatí.
    stitky = ['Cover'] + [str(i) for i in range(1, 14)]
    kandidati = [[], [], [], []] + [[i] for i in range(1, 11)]
    vysledek = tistena_cisla(kandidati, stitky)
    assert vysledek[4] == ('1', 'zahlavi')
    assert all(zdroj != 'stitek_pdf' for _, zdroj in vysledek)


def test_stitky_ve_shode_s_tiskem_doplni_rimske_strany():
    stitky = ['i', 'ii', 'iii', 'iv'] + [str(i) for i in range(1, 11)]
    kandidati = [[], [], [], []] + [[i] for i in range(1, 11)]
    vysledek = tistena_cisla(kandidati, stitky)
    assert vysledek[0] == ('i', 'stitek_pdf') and vysledek[4] == ('1', 'stitek_pdf')


def test_neciselny_stitek_sam_o_sobe_stitky_neudela_uzitecnymi():
    # Bez čísel v záhlaví (nic, s čím porovnat): „Obálka, 2, 3…" je pořád jen pořadí listů.
    assert tistena_cisla([[] for _ in range(5)], ['Obálka', '2', '3', '4', '5']) == [(None, None)] * 5
