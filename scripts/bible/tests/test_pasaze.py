from pasaze import CIL_ZNAKU, MAX_STRAN, MAX_ZNAKU, bloky, rozdel_na_pasaze

TABULKA = '| Slad | Extrakt % |\n|---|---|\n| Plzeňský | 81,5 |\n| Mnichovský | 79,0 |'


def test_bloky_rozpoznaji_tabulku_vzorec_a_popisek():
    text = f'Úvodní odstavec.\n\n{TABULKA}\n\n$$\nIBU = U \\cdot \\alpha\n$$\n\nObr. 3.2 Průběh rmutování\n\nZávěr.'
    druhy = [d for d, _ in bloky(text)]
    assert druhy == ['text', 'tabulka', 'vzorec', 'popisek', 'text']


def test_jednoradkovy_vzorec():
    assert bloky('$$ V = m / \\rho $$') == [('vzorec', '$$ V = m / \\rho $$')]


def test_pasaze_drzi_kapitolu_a_nejvys_dve_strany():
    odstavec = 'Rmutování je enzymatický proces. ' * 30   # ≈ 1 000 znaků
    strany = [(1, odstavec, 0), (2, odstavec, 0), (3, odstavec, 0), (4, odstavec, 1)]
    p = rozdel_na_pasaze(strany)
    assert all(x.strana_do - x.strana_od + 1 <= MAX_STRAN for x in p)
    assert all(len(x.text) <= MAX_ZNAKU for x in p)
    # Kapitola 1 začíná na straně 4 vlastní pasáží.
    assert p[-1].kapitola == 1 and p[-1].strana_od == 4
    assert [x.poradi for x in p] == list(range(1, len(p) + 1))


def test_tabulka_a_vzorec_jsou_i_samostatne():
    strany = [(7, f'Text před tabulkou.\n\n{TABULKA}\n\n$$ IBU = U \\cdot \\alpha $$\n\nText za.', 2)]
    p = rozdel_na_pasaze(strany)
    druhy = [x.druh for x in p]
    assert 'tabulka' in druhy and 'vzorec' in druhy
    tab = next(x for x in p if x.druh == 'tabulka')
    assert tab.strana_od == tab.strana_do == 7 and 'Plzeňský' in tab.text
    # Vzorec zůstává i v textové pasáži (kvůli souvislosti), tabulka ne.
    text = next(x for x in p if x.druh == 'text')
    assert 'IBU' in text.text and 'Plzeňský' not in text.text


def test_dlouhy_odstavec_se_rozdeli_po_vetach():
    veta = 'Teplota rmutu se zvýší na 72 °C a drží se dvacet minut. '
    p = rozdel_na_pasaze([(1, veta * 120, None)])
    assert len(p) > 1
    assert all(len(x.text) <= MAX_ZNAKU for x in p)
    assert sum(len(x.text) for x in p) >= len((veta * 120).strip()) - len(p) * 2
    assert all(len(x.text) >= CIL_ZNAKU // 4 for x in p[:-1])


def test_prazdne_strany_nic():
    assert rozdel_na_pasaze([(1, '', None), (2, '   \n ', None)]) == []


def test_velka_tabulka_se_rozdeli_a_kazdy_kus_ma_hlavicku():
    # Příloha s tabulkou o tisících řádků: jedna pasáž by přerostla limit tsvectoru.
    radky = [f'| Slad {i} | {80 + i % 5},{i % 10} | {3 + i % 7} |' for i in range(3000)]
    tabulka = '| Slad | Extrakt % | Barva EBC |\n|---|---|---|\n' + '\n'.join(radky)
    p = rozdel_na_pasaze([(1, tabulka, 0)])
    assert len(p) > 20 and all(x.druh == 'tabulka' for x in p)
    assert all(len(x.text) <= MAX_ZNAKU for x in p)
    assert all(x.text.startswith('| Slad | Extrakt % | Barva EBC |\n|---|---|---|\n') for x in p)
    # Žádný řádek se neztratil ani nezdvojil.
    obsah = [r for x in p for r in x.text.split('\n')[2:]]
    assert obsah == radky


def test_dlouhy_seznam_bez_vet_se_deli_po_radcich():
    seznam = '\n'.join(f'- surovina číslo {i} bez tečky na konci' for i in range(400))
    p = rozdel_na_pasaze([(1, seznam, None)])
    assert all(len(x.text) <= MAX_ZNAKU for x in p)
    # Řádky zůstanou celé (žádné dělení uprostřed slova).
    assert all(r.startswith('- surovina') for x in p for r in x.text.split('\n'))
