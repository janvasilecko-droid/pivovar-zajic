"""Celé zpracování dokumentu nad falešnou databází a falešným Claude (bez sítě)."""
import hashlib
import io
import json
from types import SimpleNamespace

import pytest
from PIL import Image, ImageDraw

import naklady
import ocr
import zpracuj
from conftest import vyrob_pdf

CENIK = {'claude-haiku-5-5': {'vstup': 0.10, 'vystup': 0.50, 'cache_cteni': 0.01, 'cache_zapis': 0.125}}
TAJNY_TEXT = 'Tajny odstavec knihy o rmutovani pri 62 stupnich.'
ID = '11111111-1111-1111-1111-111111111111'
CESTA = f'{ID}/kniha.pdf'


class FalesnaSupa:
    def __init__(self, soubory: dict[str, bytes], stav: str = 'zpracovava'):
        self.soubory = soubory
        self.stav = stav  # stav dokumentu v DB: 'zpracovava', 'pozastaveno' nebo 'smazan'
        self.tabulky: dict[str, list[dict]] = {'bible_kapitoly': [], 'bible_strany': [], 'bible_pasaze': [], 'ai_naklady': []}
        self.upravy: list[tuple[str, dict, dict]] = []
        self.mazani: list[tuple[str, dict]] = []
        self.poradi: list[str] = []
        self.stazeno: list[str] = []
        self.kapacita = 10_000_000

    def stahni(self, bucket, cesta):
        assert bucket == 'knihovna'
        self.stazeno.append(cesta)
        return self.soubory[cesta]

    def vloz(self, tabulka, radky, davka=200):
        self.poradi.append(f'vloz {tabulka}')
        self.tabulky.setdefault(tabulka, []).extend(radky)

    def vloz_nebo_prepis(self, tabulka, radky, klic, davka=100):
        self.poradi.append(f'upsert {tabulka}')
        sloupce = klic.split(',')
        stare = self.tabulky.setdefault(tabulka, [])
        for r in radky:
            for i, s in enumerate(stare):
                if all(s[k] == r[k] for k in sloupce):
                    stare[i] = {**s, **r}
                    break
            else:
                stare.append(dict(r))

    def smaz(self, tabulka, filtry):
        self.poradi.append(f'smaz {tabulka}')
        self.mazani.append((tabulka, filtry))
        assert filtry.get('dokument_id') == f'eq.{ID}'
        if 'pdf_index' in filtry:
            hranice = int(filtry['pdf_index'].removeprefix('gt.'))
            self.tabulky[tabulka] = [r for r in self.tabulky[tabulka] if r['pdf_index'] <= hranice]
        else:
            self.tabulky[tabulka] = []

    def uprav(self, tabulka, filtry, zmena, vratit=False):
        self.upravy.append((tabulka, filtry, zmena))
        if tabulka == 'bible_dokumenty' and vratit:
            pozadovany = filtry.get('stav', 'eq.' + self.stav).removeprefix('eq.')
            return [{'id': ID}] if self.stav == pozadovany else []
        return None

    def vyber_vse(self, tabulka, parametry, razeni):
        assert tabulka == 'bible_strany'
        vyhovuje = [r for r in self.tabulky['bible_strany']
                    if r.get('zdroj_textu') == 'ocr' and f'eq.{r.get("ocr_model")}' == parametry['ocr_model']
                    and f'eq.{r.get("ocr_verze")}' == parametry['ocr_verze']]
        return sorted(vyhovuje, key=lambda r: r['pdf_index'])

    def rpc(self, funkce, argumenty):
        assert funkce == 'bible_kapacita'
        return {'db_bajtu': self.kapacita}

    def stavy(self):
        return [z for t, _, z in self.upravy if t == 'bible_dokumenty' and 'stav' in z]

    def posledni_stav(self):
        return self.stavy()[-1]


def _dokument(data: bytes, mime: str, **navic):
    return {
        'id': ID, 'soubor_cesta': CESTA, 'soubor_mime': mime, 'soubor_velikost': len(data),
        'soubor_sha256': hashlib.sha256(data).hexdigest(), 'pokusy': 1, 'jazyk': None, **navic,
    }


def _odpoved(text, tistena='17'):
    data = {'zahlavi': '', 'zapati': tistena, 'tistena_strana': tistena, 'text': text, 'necitelne': False}
    return SimpleNamespace(
        stop_reason='end_turn',
        content=[SimpleNamespace(type='text', text=json.dumps(data))],
        usage=SimpleNamespace(input_tokens=2500, output_tokens=700, cache_read_input_tokens=0, cache_creation_input_tokens=0),
    )


def _klient(text='# Rmutování\n\nBeta-amyláza pracuje nejlépe při 62–65 °C.', tistena='17'):
    volani = []

    def create(**kw):
        volani.append(kw)
        return _odpoved(text, tistena)

    return SimpleNamespace(messages=SimpleNamespace(create=create)), volani


def _klient_s_chybou(chyba, po_uspesnych=0):
    volani = []

    def create(**kw):
        volani.append(kw)
        if len(volani) > po_uspesnych:
            raise chyba
        return _odpoved('# Text\n\nObsah strany.')

    return SimpleNamespace(messages=SimpleNamespace(create=create)), volani


def _chyba_api(status, druh='', zprava='chyba'):
    class ChybaApi(Exception):
        pass
    e = ChybaApi(zprava)
    e.status_code, e.type, e.message = status, druh, zprava
    return e


def _sken(text='Strana 5 knihy', stran=1) -> bytes:
    snimky = []
    for i in range(stran):
        obr = Image.new('L', (800, 1100), 255)
        ImageDraw.Draw(obr).text((100, 100 + i), f'{text} {i}', fill=0)
        snimky.append(obr)
    proud = io.BytesIO()
    if stran == 1:
        snimky[0].save(proud, format='PNG')
    else:
        snimky[0].save(proud, format='TIFF', save_all=True, append_images=snimky[1:])
    return proud.getvalue()


ODSTAVEC = 'Die Maischarbeit beeinflusst die Zusammensetzung der Wuerze entscheidend, Rasten bei 62 und 72 Grad.'


def _kniha_pdf() -> bytes:
    # 6 stran s textovou vrstvou; živé záhlaví s číslem kapitoly, tištěná strana = list + 10 (zápatí).
    strany = [[f'{1 if i < 3 else 2} Maischen', *([ODSTAVEC] * 8), *([''] * 42), str(i + 11)] for i in range(6)]
    return vyrob_pdf(strany, osnova=[('1 Slad', 0), ('2 Maischen', 3)])


def _skenovane_pdf(stran: int) -> bytes:
    """PDF ze skeneru: každá strana jen obrázek přes celou plochu, bez textové vrstvy."""
    from conftest import vyrob_pdf_presne
    return vyrob_pdf_presne([{'obrazek': (0, 0, 595, 842)} for _ in range(stran)])


def _ucet(strop=5):
    return naklady.Ucet(cenik=CENIK, strop_usd=strop)


def test_digitalni_pdf_bez_ai(capsys):
    data = _kniha_pdf()
    supa = FalesnaSupa({CESTA: data})
    utraceno = zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), None, _ucet())
    assert utraceno == 0
    stav = supa.posledni_stav()
    assert stav['stav'] == 'hotovo' and stav['zamek_do'] is None and stav['pokusy'] == 0
    assert stav['postup']['stran'] == 6 and stav['postup']['digitalnich'] == 6 and stav['postup']['ocr'] == 0
    assert stav['postup']['kapitol'] == 2 and stav['postup']['pasazi'] >= 1
    assert stav['kvalita_ocr'] is None and stav['verze_zpracovani'] == zpracuj.VERZE
    strany = sorted(supa.tabulky['bible_strany'], key=lambda s: s['pdf_index'])
    assert [s['tistena_strana'] for s in strany] == ['11', '12', '13', '14', '15', '16']
    assert all(s['zdroj_textu'] == 'vrstva' and s['ocr_verze'] is None for s in strany)
    kapitoly = supa.tabulky['bible_kapitoly']
    assert [(k['nazev'], k['strana_od'], k['strana_do']) for k in kapitoly] == [('Slad', 1, 3), ('Maischen', 4, 6)]
    assert strany[4]['kapitola_id'] == kapitoly[1]['id']
    pasaze = supa.tabulky['bible_pasaze']
    assert all(p['kapitola_id'] in {k['id'] for k in kapitoly} for p in pasaze)
    assert pasaze[0]['jazyk'] == 'de'
    # Staré odvozené řádky pryč dřív, než se zapíšou nové; vždy jen s filtrem dokumentu.
    assert supa.poradi == ['smaz bible_pasaze', 'smaz bible_kapitoly', 'vloz bible_kapitoly', 'upsert bible_strany',
                           'smaz bible_strany', 'vloz bible_pasaze']
    assert supa.tabulky['ai_naklady'] == []
    # Stav se zapisuje jen s filtrem „pořád se zpracovává" (pauzu nepřepíše).
    assert all(f == {'id': f'eq.{ID}', 'stav': 'eq.zpracovava'} for t, f, _ in supa.upravy if t == 'bible_dokumenty')
    vystup = capsys.readouterr().out
    assert 'Maischarbeit' not in vystup and 'hotovo: 6 stran' in vystup


def test_sken_prepise_claude_a_zapise_naklady(capsys):
    data = _sken()
    supa = FalesnaSupa({CESTA: data})
    ucet = _ucet()
    klient, volani = _klient(text=f'# Rmutování\n\n{TAJNY_TEXT}')
    utraceno = zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/png'),
                                        zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    assert len(volani) == 1 and volani[0]['messages'][0]['content'][0]['source']['media_type'] == 'image/jpeg'
    assert volani[0]['thinking'] == {'type': 'disabled'}
    strana = supa.tabulky['bible_strany'][0]
    assert strana['zdroj_textu'] == 'ocr' and strana['ocr_model'] == 'claude-haiku-5-5'
    assert strana['ocr_verze'] == ocr.OCR_VERZE and TAJNY_TEXT in strana['text']
    naklad = supa.tabulky['ai_naklady'][0]
    assert naklad['model'] == 'claude-haiku-5-5' and naklad['volani'] == 1 and naklad['vstup_tokenu'] == 2500
    assert naklad['cena_usd'] == pytest.approx((2500 * 0.10 + 700 * 0.50) / 1e6, abs=1e-6)
    assert naklad['dokument_id'] == ID
    assert utraceno == pytest.approx(naklad['cena_usd'], abs=1e-6)
    assert supa.posledni_stav()['stav'] in ('hotovo', 'ke_kontrole')
    assert TAJNY_TEXT not in capsys.readouterr().out


def test_vicestrankovy_tiff_jsou_vsechny_strany():
    data = _sken(stran=4)
    supa = FalesnaSupa({CESTA: data})
    ucet = _ucet()
    klient, volani = _klient()
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/tiff'), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    assert len(volani) == 4
    assert supa.posledni_stav()['postup']['stran'] == 4


def test_sken_bez_klice_pocka_a_pokus_se_vrati():
    data = _sken()
    supa = FalesnaSupa({CESTA: data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/png', pokusy=1), None, _ucet())
    stav = supa.posledni_stav()
    assert stav['stav'] == 'ceka' and stav['pokusy'] == 0 and 'ANTHROPIC_API_KEY' in stav['stav_zprava']


def test_jiny_soubor_nez_nahrany():
    data = _kniha_pdf()
    supa = FalesnaSupa({CESTA: data + b'zmena'})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), None, _ucet())
    stav = supa.posledni_stav()
    assert stav['stav'] == 'chyba' and 'SHA-256' in stav['stav_zprava']
    assert supa.tabulky['bible_strany'] == []


@pytest.mark.parametrize('cesta', ['../../../../auth/v1/admin/users', f'{ID}/../jiny/soubor.pdf',
                                   '22222222-2222-2222-2222-222222222222/kniha.pdf', f'{ID}/kniha s mezerou.pdf', ''])
def test_podezrela_cesta_se_nestahuje(cesta):
    data = _kniha_pdf()
    supa = FalesnaSupa({cesta: data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf', soubor_cesta=cesta), None, _ucet())
    assert supa.stazeno == []
    assert supa.posledni_stav()['stav'] == 'chyba'


def test_neznama_chyba_se_zkusi_znovu_a_po_tretim_pokusu_vzda(monkeypatch, capsys):
    data = b'# Nadpis\n\nText.'

    def spadni(*a, **k):
        raise ValueError('nečekaná porucha s obsahem knihy')

    monkeypatch.setattr(zpracuj, 'rozloz', spadni)
    supa = FalesnaSupa({CESTA: data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'text/markdown', pokusy=1), None, _ucet())
    assert supa.posledni_stav()['stav'] == 'ceka'
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'text/markdown', pokusy=3), None, _ucet())
    assert supa.posledni_stav()['stav'] == 'chyba'
    assert 'ValueError' in supa.posledni_stav()['stav_zprava']
    assert 'obsahem knihy' not in capsys.readouterr().out


def test_strop_utraty_vrati_dokument_do_fronty():
    data = _sken()
    supa = FalesnaSupa({CESTA: data})
    ucet = _ucet(strop=0)
    klient, volani = _klient()
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/png', pokusy=2), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    stav = supa.posledni_stav()
    assert stav['stav'] == 'ceka' and stav['pokusy'] == 1 and 'strop' in stav['stav_zprava']
    assert volani == []


def test_prerusene_ocr_navaze_a_neplati_dvakrat():
    # Strop na ~3 strany: první běh přepíše část a uloží ji, druhý naváže.
    data = _skenovane_pdf(8)
    supa = FalesnaSupa({CESTA: data})
    cena_strany = (2500 * 0.10 + 700 * 0.50) / 1e6
    ucet = _ucet(strop=cena_strany * 2.5)
    klient, volani = _klient()
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    assert supa.posledni_stav()['stav'] == 'ceka'
    prvni = len(volani)
    ulozene = {s['pdf_index'] for s in supa.tabulky['bible_strany'] if s['zdroj_textu'] == 'ocr' and s['text']}
    assert 3 <= prvni < 8 and len(ulozene) == prvni   # každý zaplacený přepis je uložený
    ucet2 = _ucet()
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet2), ucet2)
    assert len(volani) == 8   # dřívější strany se znovu neplatily
    stav = supa.posledni_stav()
    assert stav['stav'] in ('hotovo', 'ke_kontrole') and stav['postup']['ocr_znovu_pouzito'] == prvni


def test_smazany_dokument_behem_ocr_se_neprepisuje_a_naklady_se_zapisou():
    data = _skenovane_pdf(30)
    supa = FalesnaSupa({CESTA: data})
    ucet = _ucet()
    klient, volani = _klient()
    puvodni = supa.uprav

    def uprav(tabulka, filtry, zmena, vratit=False):
        if zmena.get('zamek_do') is not None:
            supa.stav = 'smazan'   # správce dokument smazal během OCR
        return puvodni(tabulka, filtry, zmena, vratit)

    supa.uprav = uprav
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    assert len(volani) < 30                      # OCR se zastavilo
    assert not any(z.get('stav') == 'hotovo' for z in supa.stavy())
    assert supa.tabulky['ai_naklady'] and supa.tabulky['ai_naklady'][0]['volani'] == len(volani)


def test_pozastaveny_dokument_zustane_pozastaveny():
    data = _kniha_pdf()
    supa = FalesnaSupa({CESTA: data}, stav='pozastaveno')
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), None, _ucet())
    # Stav se zapisuje jen s filtrem stav=zpracovava, takže pauzu nepřepíše.
    assert all(f.get('stav') == 'eq.zpracovava' for t, f, _ in supa.upravy if t == 'bible_dokumenty')


@pytest.mark.parametrize('status,druh,zprava', [
    (401, 'authentication_error', 'invalid x-api-key'),
    (402, 'billing_error', 'Your credit balance is too low'),
    (400, 'invalid_request_error', 'You have reached your specified API usage limits'),
    (404, 'not_found_error', 'model: claude-x'),
    (429, 'rate_limit_error', 'Number of request tokens has exceeded your limit'),
    (402, '', 'Payment required'),
])
def test_chyby_uctu_zastavi_beh_a_dokument_pocka(status, druh, zprava):
    data = _sken()
    supa = FalesnaSupa({CESTA: data})
    ucet = _ucet()
    klient, _ = _klient_s_chybou(_chyba_api(status, druh, zprava))
    with pytest.raises(zpracuj.ZastavitBeh):
        zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/png', pokusy=1), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    stav = supa.posledni_stav()
    assert stav['stav'] == 'ceka' and stav['pokusy'] == 0


def test_odmitnuty_prvni_pozadavek_behu_je_chyba_nastaveni_ale_pokus_se_pocita():
    data = _sken()
    supa = FalesnaSupa({CESTA: data})
    ucet = _ucet()
    klient, _ = _klient_s_chybou(_chyba_api(400, 'invalid_request_error', 'thinking.type.disabled is not supported'))
    with pytest.raises(zpracuj.ZastavitBeh):
        zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/png', pokusy=3), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    assert supa.posledni_stav()['stav'] == 'chyba'   # třetí takový pokus = dokument to způsobuje


def test_odmitnuty_pozadavek_po_uspesnych_je_chyba_dokumentu():
    data = _sken(stran=3)
    supa = FalesnaSupa({CESTA: data})
    ucet = _ucet()
    klient, _ = _klient_s_chybou(_chyba_api(400, 'invalid_request_error', 'image: bad data'), po_uspesnych=1)
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/tiff'), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    stav = supa.posledni_stav()
    assert stav['stav'] == 'chyba' and 'HTTP 400' in stav['stav_zprava']


def test_docasny_vypadek_ukonci_beh_a_pokus_se_pocita():
    data = _sken()
    supa = FalesnaSupa({CESTA: data})
    ucet = _ucet()
    klient, _ = _klient_s_chybou(_chyba_api(529, 'overloaded_error', 'Overloaded'))
    with pytest.raises(zpracuj.PrechodnaChyba):
        zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/png', pokusy=1), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    stav = supa.posledni_stav()
    assert stav['stav'] == 'ceka' and 'pokusy' not in stav


def test_plna_databaze_dokument_odlozi_a_zastavi_beh():
    data = _kniha_pdf()
    supa = FalesnaSupa({CESTA: data})
    supa.kapacita = 449_990_000
    with pytest.raises(zpracuj.PlnaDatabaze):
        zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), None, _ucet(), limit_db_bajtu=450_000_000)
    stav = supa.posledni_stav()
    assert stav['stav'] == 'ceka' and 'limit' in stav['stav_zprava']
    assert supa.tabulky['bible_pasaze'] == []


def test_markdown_formaty_bez_cisel_stran():
    data = '# Chmelovar\n\nVar trvá 90 minut.\n\n## Odpar\n\nOdpar je 8 % za hodinu.'.encode('utf-8')
    supa = FalesnaSupa({CESTA: data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'text/markdown'), None, _ucet())
    stav = supa.posledni_stav()
    assert stav['stav'] == 'hotovo' and stav['postup']['bez_cisla_strany'] == 0
    assert [k['nazev'] for k in supa.tabulky['bible_kapitoly']] == ['Chmelovar', 'Odpar']
    assert all(s['zdroj_textu'] == 'soubor' and s['tistena_strana'] is None for s in supa.tabulky['bible_strany'])


def test_prazdny_dokument_je_chyba():
    data = b'\n\n   \n'
    supa = FalesnaSupa({CESTA: data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'text/plain'), None, _ucet())
    stav = supa.posledni_stav()
    assert stav['stav'] == 'chyba' and 'žádný text' in stav['stav_zprava']


def test_nul_v_textu_se_do_db_nedostane():
    data = 'Rmutování\x00 při 62 °C\x07.'.encode('utf-8')
    supa = FalesnaSupa({CESTA: data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'text/plain'), None, _ucet())
    assert all('\x00' not in s['text'] and '\x07' not in s['text'] for s in supa.tabulky['bible_strany'])
    assert all('\x00' not in p['text'] for p in supa.tabulky['bible_pasaze'])


def test_chyba_api_rozliseni():
    assert isinstance(zpracuj.chyba_api(_chyba_api(500, 'api_error')), zpracuj.PrechodnaChyba)
    assert zpracuj.chyba_api(ValueError('x')) is None

    class APIConnectionError(Exception):
        pass
    assert isinstance(zpracuj.chyba_api(APIConnectionError()), zpracuj.PrechodnaChyba)
    assert isinstance(zpracuj.chyba_api(_chyba_api(413, '', 'too large'), prvni=False), zpracuj.ChybaZpracovani)


def test_strop_nula_neni_vychozi_hodnota():
    assert zpracuj._cislo(0, 20.0) == 0.0
    assert zpracuj._cislo('0', 5.0) == 0.0
    assert zpracuj._cislo(None, 20.0) == 20.0
    assert zpracuj._cislo('', 5.0) == 5.0
    assert zpracuj._cislo('nesmysl', 5.0) == 5.0


def test_mysleni_podle_modelu():
    assert ocr.mysleni_pro_model('claude-haiku-5-5') == {'type': 'disabled'}
    assert ocr.mysleni_pro_model('claude-sonnet-5-5') == {'type': 'between_tools'}
    assert ocr.mysleni_pro_model('claude-opus-5-5') is None


def test_klic_se_mimo_actions_nevypise(monkeypatch, capsys):
    class Supa:
        def vyber(self, tabulka, parametry):
            return [{'value': 'sk-ant-tajny-klic'}]
    monkeypatch.delenv('GITHUB_ACTIONS', raising=False)
    assert zpracuj.nacti_klic_anthropic(Supa()) == 'sk-ant-tajny-klic'
    assert 'sk-ant' not in capsys.readouterr().out
    monkeypatch.setenv('GITHUB_ACTIONS', 'true')
    zpracuj.nacti_klic_anthropic(Supa())
    assert capsys.readouterr().out.strip() == '::add-mask::sk-ant-tajny-klic'


def test_pad_behu_nevypise_traceback(monkeypatch, capsys):
    import logging
    import signal
    import sys
    import threading

    def spadni():
        raise RuntimeError('obsah knihy ve zprave https://x/storage/v1/object/knihovna/id/Nazev-knihy.pdf')

    # main() mění globální háčky procesu — po testu se vrátí.
    monkeypatch.setattr(sys, 'excepthook', sys.excepthook)
    monkeypatch.setattr(threading, 'excepthook', threading.excepthook)
    puvodni_signal = signal.getsignal(signal.SIGTERM)
    monkeypatch.setattr(zpracuj, '_beh', spadni)
    try:
        assert zpracuj.main() == 1
    finally:
        signal.signal(signal.SIGTERM, puvodni_signal)
        logging.disable(logging.NOTSET)
    vystup = capsys.readouterr()
    assert 'Běh spadl: RuntimeError' in vystup.out
    assert 'Nazev-knihy' not in vystup.out + vystup.err and 'Traceback' not in vystup.out + vystup.err


def test_poskozeny_docx_je_rovnou_chyba():
    data = b'tohle neni docx'
    supa = FalesnaSupa({CESTA: data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, zpracuj.DOCX), None, _ucet())
    stav = supa.posledni_stav()
    assert stav['stav'] == 'chyba' and 'nejde přečíst' in stav['stav_zprava']


def test_kratka_digitalni_strana_nejde_do_ocr():
    # Titulní strana s pár slovy a prázdná strana: přesný text, žádné OCR ani klíč.
    from conftest import vyrob_pdf_presne
    telo = [(72, 700 - 14 * i, ODSTAVEC) for i in range(12)]
    data = vyrob_pdf_presne([{'text': [(72, 400, 'Technologie piva')]}, {'text': []}, {'text': telo}])
    supa = FalesnaSupa({CESTA: data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), None, _ucet())
    stav = supa.posledni_stav()
    assert stav['stav'] == 'hotovo' and stav['postup']['ocr'] == 0
    assert [s['zdroj_textu'] for s in sorted(supa.tabulky['bible_strany'], key=lambda s: s['pdf_index'])] == ['vrstva'] * 3


def test_strana_s_velkym_obrazkem_a_popiskem_jde_do_ocr():
    from conftest import vyrob_pdf_presne
    data = vyrob_pdf_presne([{'text': [(72, 100, 'Obr. 3 Varna')], 'obrazek': (72, 150, 450, 600)}])
    supa = FalesnaSupa({CESTA: data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), None, _ucet())
    assert supa.posledni_stav()['stav'] == 'ceka'   # text v obrázku chce OCR, bez klíče čeká


def test_zive_zahlavi_neprotahne_pasaz_predchozi_kapitoly():
    from conftest import vyrob_pdf_presne
    telo = [(72, 700 - 14 * i, ODSTAVEC) for i in range(6)]
    data = vyrob_pdf_presne([
        {'text': [(72, 800, '1 Slad'), (500, 800, '7')] + telo},
        {'text': [(72, 800, '8'), (400, 800, '2 Rmutovani'), (72, 760, '2 Rmutovani')] + telo},
    ], osnova=[('1 Slad', 0), ('2 Rmutovani', 1)])
    supa = FalesnaSupa({CESTA: data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), None, _ucet())
    kapitoly = {k['id']: k['nazev'] for k in supa.tabulky['bible_kapitoly']}
    rozsahy = [(kapitoly[p['kapitola_id']], p['strana_od'], p['strana_do']) for p in supa.tabulky['bible_pasaze']]
    assert rozsahy == [('Slad', 1, 1), ('Rmutovani', 2, 2)]
    assert all('Rmutovani 8' not in p['text'] and p['text'].strip() != '7' for p in supa.tabulky['bible_pasaze'])


def test_prepisy_se_ukladaji_po_davkach_uz_behem_ocr():
    # Kdyby proces spadl (OOM, zrušený job), uložené dávky zůstanou — neplatí se znovu.
    data = _skenovane_pdf(25)
    supa = FalesnaSupa({CESTA: data})
    davky = []
    puvodni = supa.vloz_nebo_prepis

    def zaznamenej(tabulka, radky, klic, davka=100):
        davky.append(len(radky))
        return puvodni(tabulka, radky, klic, davka)

    supa.vloz_nebo_prepis = zaznamenej
    ucet = _ucet()
    klient, _ = _klient()
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    # Vlákna OCR můžou doběhnout naráz, takže dávka bývá o pár stran větší
    # (podle vytížení stroje) — podstatné je, že se ukládá průběžně.
    assert zpracuj.DAVKA_PREPISU <= davky[0] < zpracuj.DAVKA_PREPISU + 2 * zpracuj.VLAKEN_OCR, davky
    assert len(davky) >= 3 and sum(davky[:-1]) == 25, davky   # každý přepis uložený v některé dávce
    assert davky[-1] == 25   # závěrečný zápis všech stran


# --- samostatný projekt bible (R12) -------------------------------------------

def test_beh_bere_knihy_z_projektu_bible_a_klic_z_hlavni_appky(monkeypatch):
    vytvorene = []
    cteni = []

    class Falesna:
        def __init__(self, url, klic, timeout=60):
            self.url, self.klic = url, klic
            vytvorene.append(self)

        def rpc(self, funkce, argumenty):
            cteni.append((funkce, self.url))
            return []

    monkeypatch.setattr(zpracuj, 'Supa', Falesna)
    monkeypatch.setattr(zpracuj, 'nacti_nastaveni', lambda s: cteni.append(('nastaveni', s.url)) or {'limit_db_mb': 0})
    monkeypatch.setattr(zpracuj, 'nacti_klic_anthropic', lambda s: cteni.append(('klic', s.url)) or None)
    monkeypatch.setattr(zpracuj, 'utraceno_tento_mesic', lambda s: cteni.append(('utrata', s.url)) or 0.0)
    monkeypatch.delenv('BIBLE_URL', raising=False)
    monkeypatch.setenv('BIBLE_KLIC', 'sb_secret_bible')
    monkeypatch.setenv('HLAVNI_URL', 'https://hlavni.example')
    monkeypatch.setenv('HLAVNI_KLIC', 'sb_secret_hlavni')
    assert zpracuj._beh() == 0
    assert zpracuj.BIBLE_URL == 'https://cegrelgvkygcatupqwrx.supabase.co'
    assert [(v.url, v.klic) for v in vytvorene] == [
        (zpracuj.BIBLE_URL, 'sb_secret_bible'), ('https://hlavni.example', 'sb_secret_hlavni')]
    # Nastavení, útrata i fronta z projektu bible; z hlavní appky jen klíč.
    assert ('nastaveni', zpracuj.BIBLE_URL) in cteni and ('utrata', zpracuj.BIBLE_URL) in cteni
    assert ('bible_vezmi_dokument', zpracuj.BIBLE_URL) in cteni
    assert [c for c in cteni if c[1] == 'https://hlavni.example'] == [('klic', 'https://hlavni.example')]


def test_beh_bez_hlavni_appky_zpracuje_knihy_bez_ai(monkeypatch, capsys):
    class Falesna:
        def __init__(self, url, klic, timeout=60):
            self.url = url

        def rpc(self, funkce, argumenty):
            return []

    monkeypatch.setattr(zpracuj, 'Supa', Falesna)
    monkeypatch.setattr(zpracuj, 'nacti_nastaveni', lambda s: {'limit_db_mb': 0})
    monkeypatch.setattr(zpracuj, 'utraceno_tento_mesic', lambda s: 0.0)
    monkeypatch.setenv('BIBLE_KLIC', 'x')
    monkeypatch.delenv('HLAVNI_URL', raising=False)
    monkeypatch.delenv('HLAVNI_KLIC', raising=False)
    assert zpracuj._beh() == 0
    assert 'chybí ANTHROPIC_API_KEY' in capsys.readouterr().out


@pytest.mark.parametrize('chyba, kod, hlaska', [
    ('rest bible_nastaveni: HTTP 404 PGRST205', 0, 'spusť migraci 20261101000000_bible_zaklad'),
    ('rest bible_nastaveni: HTTP 404', 1, 'zkontroluj BIBLE_URL'),
    ('rest bible_nastaveni: HTTP 401', 1, 'zkontroluj BIBLE_URL'),
])
def test_beh_bez_tabulek_konci_bez_chyby_spatna_adresa_s_chybou(monkeypatch, capsys, chyba, kod, hlaska):
    class Falesna:
        def __init__(self, url, klic, timeout=60):
            pass

    def nastaveni(_s):
        raise zpracuj.ChybaSupabase(chyba)

    monkeypatch.setattr(zpracuj, 'Supa', Falesna)
    monkeypatch.setattr(zpracuj, 'nacti_nastaveni', nastaveni)
    monkeypatch.setenv('BIBLE_KLIC', 'x')
    assert zpracuj._beh() == kod
    assert hlaska in capsys.readouterr().out


def test_klic_claude_z_prostredi_hlavni_appku_vubec_nevola(monkeypatch, capsys):
    vytvorene = []

    class Falesna:
        def __init__(self, url, klic, timeout=60):
            vytvorene.append(url)
            self.url = url

        def rpc(self, funkce, argumenty):
            return []

    monkeypatch.setattr(zpracuj, 'Supa', Falesna)
    monkeypatch.setattr(zpracuj, 'nacti_nastaveni', lambda s: {'limit_db_mb': 0, 'cenik_usd_za_mtok': CENIK})
    monkeypatch.setattr(zpracuj, 'utraceno_tento_mesic', lambda s: 0.0)
    monkeypatch.setattr(zpracuj, 'nacti_klic_anthropic', lambda s: pytest.fail('klíč se nemá číst z hlavní appky'))
    monkeypatch.setenv('BIBLE_KLIC', 'x')
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-ant-z-prostredi')
    monkeypatch.setenv('HLAVNI_URL', 'https://hlavni.example')
    monkeypatch.setenv('HLAVNI_KLIC', 'sb_secret_hlavni')
    monkeypatch.delenv('GITHUB_ACTIONS', raising=False)
    assert zpracuj._beh() == 0
    assert vytvorene == [zpracuj.BIBLE_URL]
    assert 'sk-ant' not in capsys.readouterr().out


def test_nativni_nastroje_nedostanou_klice(monkeypatch):
    for k, v in {'BIBLE_KLIC': 'sb_secret_bible', 'ANTHROPIC_API_KEY': 'sk-ant-x', 'HLAVNI_KLIC': 'sb_secret_h',
                 'PATH': '/usr/bin', 'HOME': '/home/runner', 'TESSDATA_PREFIX': '/usr/share/tessdata'}.items():
        monkeypatch.setenv(k, v)
    prostredi = ocr.prostredi_nastroju()
    assert prostredi['PATH'] == '/usr/bin' and prostredi['TESSDATA_PREFIX'] == '/usr/share/tessdata'
    assert not any(k in prostredi for k in ('BIBLE_KLIC', 'ANTHROPIC_API_KEY', 'HLAVNI_KLIC'))
    zachycene = {}

    def falesny_run(prikaz, **kw):
        zachycene.update(kw)
        return SimpleNamespace(returncode=0, stdout=b'')

    monkeypatch.setattr(ocr.subprocess, 'run', falesny_run)
    monkeypatch.setattr(ocr, 'tesseract_k_dispozici', lambda: True)
    ocr.precti_tesseractem(b'jpeg', 'ces')
    assert 'env' in zachycene and 'ANTHROPIC_API_KEY' not in zachycene['env']


# --- průběh zpracování (procenta v knihovně) ---------------------------------

def _prubehy(supa):
    return [z['postup']['prubeh'] for t, _, z in supa.upravy
            if t == 'bible_dokumenty' and 'postup' in z and 'prubeh' in z['postup']]


def test_prubeh_skenu_jde_po_fazich_a_pribyva(monkeypatch):
    monkeypatch.setattr(zpracuj, 'PRUBEH_KAZDYCH_S', 0)
    monkeypatch.setattr(zpracuj, 'DAVKA_PREPISU', 2)
    data = _skenovane_pdf(6)
    supa = FalesnaSupa({CESTA: data})
    ucet = _ucet()
    klient, _ = _klient()
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    prubehy = _prubehy(supa)
    faze = [p['faze'] for p in prubehy]
    assert faze[0] == 'stahovani' and faze[-1] == 'ukladani' and 'prepis' in faze
    assert faze.index('cteni') < faze.index('prepis') < faze.index('ukladani')
    prepis = [p for p in prubehy if p['faze'] == 'prepis']
    assert all(p['celkem'] == 6 and p['ocr_celkem'] == 6 for p in prepis)
    hotovo = [p['hotovo'] for p in prepis]
    assert hotovo == sorted(hotovo) and hotovo[0] == 0 and hotovo[-1] == 6 and len(set(hotovo)) >= 3
    assert all(p['hotovo'] == p['ocr_hotovo'] for p in prepis)   # celé PDF je sken
    assert all(isinstance(p['cas'], str) for p in prubehy)
    # Průběh se píše jen dokumentu, který zpracovává tenhle běh.
    assert all(f == {'id': f'eq.{ID}', 'stav': 'eq.zpracovava'} for t, f, z in supa.upravy if 'postup' in z and 'stav' not in z)
    # Konečný zápis má počty, ne průběh.
    konec = supa.posledni_stav()
    assert konec['stav'] in ('hotovo', 'ke_kontrole') and 'prubeh' not in konec['postup'] and konec['postup']['stran'] == 6


def test_digitalni_pdf_hlasi_cteni_a_ukladani_bez_prepisu():
    data = _kniha_pdf()
    supa = FalesnaSupa({CESTA: data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), None, _ucet())
    faze = [p['faze'] for p in _prubehy(supa)]
    assert faze[:2] == ['stahovani', 'cteni'] and faze[-1] == 'ukladani' and 'prepis' not in faze
    ukladani = _prubehy(supa)[-1]
    assert ukladani['hotovo'] == ukladani['celkem'] > 0 and ukladani['ocr_celkem'] == 0


def test_prubeh_necha_pocty_z_driveho_zpracovani_a_stary_prubeh_nahradi():
    data = _kniha_pdf()
    supa = FalesnaSupa({CESTA: data})
    stary = {'stran': 99, 'kapitol': 7, 'prubeh': {'faze': 'prepis', 'hotovo': 50, 'celkem': 99}}
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf', postup=stary), None, _ucet())
    zapisy = [z['postup'] for t, _, z in supa.upravy if 'postup' in z and 'stav' not in z]
    assert zapisy and all(z['stran'] == 99 and z['kapitol'] == 7 for z in zapisy)
    assert all(z['prubeh']['faze'] != 'prepis' or z['prubeh']['celkem'] != 99 for z in zapisy)


def test_nezapsany_prubeh_zpracovani_nezastavi(capsys):
    data = _kniha_pdf()
    supa = FalesnaSupa({CESTA: data})
    puvodni = supa.uprav

    def uprav(tabulka, filtry, zmena, vratit=False):
        if 'postup' in zmena and 'stav' not in zmena:
            raise RuntimeError('výpadek')
        return puvodni(tabulka, filtry, zmena, vratit)

    supa.uprav = uprav
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), None, _ucet())
    assert supa.posledni_stav()['stav'] in ('hotovo', 'ke_kontrole')
    vystup = capsys.readouterr().out
    assert 'průběh se nepodařilo zapsat (RuntimeError)' in vystup and 'výpadek' not in vystup


def test_prubeh_se_nepise_pri_kazde_davce(monkeypatch):
    # Bez zrychlení: během krátkého přepisu se každá fáze zapíše jednou (omezení četnosti zápisů).
    monkeypatch.setattr(zpracuj, 'DAVKA_PREPISU', 1)
    data = _skenovane_pdf(5)
    supa = FalesnaSupa({CESTA: data})
    ucet = _ucet()
    klient, _ = _klient()
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    faze = [p['faze'] for p in _prubehy(supa)]
    assert faze == ['stahovani', 'cteni', 'prepis', 'ukladani']


# --- chyba účtu Claude: AI se vypne, fronta pokračuje --------------------------

class FrontaSupa:
    """Falešný projekt bible s frontou víc dokumentů (bible_vezmi_dokument)."""

    def __init__(self, dokumenty: list[dict], soubory: dict[str, bytes], prepisy: dict[str, list[dict]] | None = None):
        self.fronta = list(dokumenty)
        self.soubory = soubory
        self.prepisy = prepisy or {}   # id dokumentu → uložené přepisy skenů (bible_strany)
        self.stavy: dict[str, list[dict]] = {}
        self.stazeno: list[str] = []

    def __call__(self, url, klic, timeout=60):   # zpracuj.Supa(url, klic)
        return self

    def rpc(self, funkce, argumenty):
        if funkce == 'bible_kapacita':
            return {'db_bajtu': 1000}
        assert funkce == 'bible_vezmi_dokument'
        for d in self.fronta:
            if str(d['id']) not in argumenty['p_vynechat']:
                self.fronta.remove(d)
                return [d]
        return []

    def stahni(self, bucket, cesta):
        self.stazeno.append(cesta)
        return self.soubory[cesta]

    def uprav(self, tabulka, filtry, zmena, vratit=False):
        if tabulka == 'bible_dokumenty' and 'stav' in zmena:
            self.stavy.setdefault(filtry['id'].removeprefix('eq.'), []).append(zmena)
        return [{'id': filtry['id']}] if vratit else None

    def vyber_vse(self, tabulka, parametry, razeni):
        if tabulka != 'bible_strany':
            return []
        id_ = parametry.get('dokument_id', '').removeprefix('eq.')
        return [r for r in self.prepisy.get(id_, []) if parametry.get('ocr_model') == f"eq.{r['ocr_model']}"]

    def vloz(self, tabulka, radky, davka=200):
        pass

    def vloz_nebo_prepis(self, tabulka, radky, klic, davka=100):
        pass

    def smaz(self, tabulka, filtry):
        pass


def test_dosly_kredit_vypne_ai_a_digitalni_knihy_se_zpracuji_dal(monkeypatch, capsys):
    import anthropic

    sken, kniha, sken2 = _skenovane_pdf(2), _kniha_pdf(), _skenovane_pdf(1)
    ids = ['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444']
    dokumenty, soubory = [], {}
    for id_, data in zip(ids, (sken, kniha, sken2)):
        cesta = f'{id_}/kniha.pdf'
        soubory[cesta] = data
        dokumenty.append({**_dokument(data, 'application/pdf'), 'id': id_, 'soubor_cesta': cesta})
    supa = FrontaSupa(dokumenty, soubory)
    klient, volani = _klient_s_chybou(_chyba_api(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'))
    monkeypatch.setattr(anthropic, 'Anthropic', lambda **kw: klient)
    monkeypatch.setattr(zpracuj, 'Supa', supa)
    monkeypatch.setattr(zpracuj, 'nacti_nastaveni', lambda s: {'limit_db_mb': 0, 'cenik_usd_za_mtok': CENIK, 'model_ocr': 'claude-haiku-5-5'})
    monkeypatch.setattr(zpracuj, 'utraceno_tento_mesic', lambda s: 0.0)
    monkeypatch.setenv('BIBLE_KLIC', 'x')
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-test')
    monkeypatch.delenv('GITHUB_ACTIONS', raising=False)
    monkeypatch.delenv('DOKUMENT', raising=False)

    assert zpracuj._beh() == 1   # problém s účtem je vidět (červený běh)
    kredit = 'Čeká: na účtu Anthropic došel kredit nebo limit útraty — dobij kredit a zpracování poběží dál.'
    assert supa.stavy[ids[0]][-1]['stav'] == 'ceka' and supa.stavy[ids[0]][-1]['stav_zprava'] == kredit
    assert supa.stavy[ids[1]][-1]['stav'] in ('hotovo', 'ke_kontrole')   # digitální kniha se zpracovala
    assert supa.stavy[ids[2]][-1]['stav'] == 'ceka' and supa.stavy[ids[2]][-1]['stav_zprava'] == kredit
    assert all(z['pokusy'] == 0 for i in (ids[0], ids[2]) for z in supa.stavy[i] if z['stav'] == 'ceka')
    assert len(volani) == 1   # po chybě účtu už se Claude nevolal
    vystup = capsys.readouterr().out
    assert 'AI vypnutá pro zbytek běhu' in vystup, vystup
    assert 'hotovo: 6 stran' in vystup and 'odloženo (ChybiKlic)' in vystup, vystup
    assert 'credit balance' not in vystup, vystup


@pytest.mark.parametrize('postup', [
    {'prubeh': {'faze': 'prepis', 'hotovo': 325, 'celkem': 327, 'ocr_hotovo': 0, 'ocr_celkem': 2}},
    {'stran': 40, 'ocr': 3},   # dřívější úplné zpracování se skeny („Zpracovat znovu")
])
def test_bez_ai_se_kniha_se_skeny_znovu_nestahuje(postup):
    data = _skenovane_pdf(2)
    supa = FalesnaSupa({CESTA: data})
    duvod = 'Čeká: na účtu Anthropic došel kredit nebo limit útraty — dobij kredit a zpracování poběží dál.'
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf', postup=postup), None, _ucet(), bez_ai=duvod)
    assert supa.stazeno == []   # žádné stahování (přenosy tarifu Free)
    stav = supa.posledni_stav()
    assert stav['stav'] == 'ceka' and stav['stav_zprava'] == duvod and stav['pokusy'] == 0
    # Běh knihu viděl: průběh má nový čas, počty zůstaly (knihovna nepíše, že na běh teprve čeká).
    prubehy = [z['postup']['prubeh'] for t, _f, z in supa.upravy if t == 'bible_dokumenty' and 'postup' in z]
    assert len(prubehy) == 1 and prubehy[0]['cas']
    drive = postup.get('prubeh') or {'faze': 'prepis', 'hotovo': 0, 'celkem': 0, 'ocr_hotovo': 0, 'ocr_celkem': postup['ocr']}
    assert {k: v for k, v in prubehy[0].items() if k != 'cas'} == drive
    assert supa.upravy[-1][2]['stav'] == 'ceka' and 'postup' not in supa.upravy[-1][2]   # stav bez přepsání postupu


def test_bez_ai_se_kniha_bez_skenu_stahuje_dal():
    data = _kniha_pdf()
    supa = FalesnaSupa({CESTA: data})
    postup = {'stran': 6, 'ocr': 0, 'prubeh': {'faze': 'ukladani', 'hotovo': 6, 'celkem': 6, 'ocr_hotovo': 0, 'ocr_celkem': 0}}
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf', postup=postup), None, _ucet())
    assert supa.stazeno == [CESTA] and supa.posledni_stav()['stav'] in ('hotovo', 'ke_kontrole')


# --- AI teď nejde: kniha se známými skeny se ani nestahuje -----------------------

KREDIT = 'Čeká: na účtu Anthropic došel kredit nebo limit útraty — dobij kredit a zpracování poběží dál.'
ZNAME_SKENY = {'prubeh': {'faze': 'prepis', 'hotovo': 0, 'celkem': 2, 'ocr_hotovo': 0, 'ocr_celkem': 2}}


def _kniha_ve_fronte(id_: str, data: bytes, postup: dict | None = None) -> tuple[dict, str]:
    cesta = f'{id_}/kniha.pdf'
    return {**_dokument(data, 'application/pdf'), 'id': id_, 'soubor_cesta': cesta, 'postup': postup or {}}, cesta


def _priprav_beh(monkeypatch, knihy: list[tuple[dict, str, bytes]], klient, utraceno=0.0, prepisy=None) -> FrontaSupa:
    import anthropic

    supa = FrontaSupa([d for d, _c, _data in knihy], {c: data for _d, c, data in knihy}, prepisy)
    monkeypatch.setattr(anthropic, 'Anthropic', lambda **kw: klient)
    monkeypatch.setattr(zpracuj, 'Supa', supa)
    monkeypatch.setattr(zpracuj, 'nacti_nastaveni', lambda s: {'limit_db_mb': 0, 'cenik_usd_za_mtok': CENIK, 'model_ocr': 'claude-haiku-5-5'})
    monkeypatch.setattr(zpracuj, 'utraceno_tento_mesic', lambda s: utraceno)
    monkeypatch.setenv('BIBLE_KLIC', 'x')
    monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-test')
    monkeypatch.delenv('GITHUB_ACTIONS', raising=False)
    monkeypatch.delenv('DOKUMENT', raising=False)
    monkeypatch.delenv('LIMIT_USD', raising=False)
    return supa


def _jen_text(volani: dict) -> bool:
    """Levné ověření účtu: zpráva jen s textem, bez obrázku strany."""
    return isinstance(volani['messages'][0]['content'], str)


def test_dosly_kredit_kniha_se_znamymi_skeny_se_ani_nestahuje(monkeypatch, capsys):
    # 31. 10. 2026: klíč je, kredit došel, ve frontě jediná kniha se 2 skeny —
    # dřív se celá stáhla a přečetla v každém běhu (8× denně), než to Claude odmítl.
    data = _skenovane_pdf(2)
    dok, cesta = _kniha_ve_fronte('55555555-5555-5555-5555-555555555555', data, ZNAME_SKENY)
    klient, volani = _klient_s_chybou(_chyba_api(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'))
    supa = _priprav_beh(monkeypatch, [(dok, cesta, data)], klient)
    assert zpracuj._beh() == 1   # problém s účtem je vidět
    assert supa.stazeno == []
    assert len(volani) == 1 and _jen_text(volani[0]) and volani[0]['max_tokens'] <= 16
    posledni = supa.stavy[dok['id']][-1]
    assert posledni['stav'] == 'ceka' and posledni['stav_zprava'] == KREDIT and posledni['pokusy'] == 0
    assert 'credit balance' not in capsys.readouterr().out


def test_ucet_se_overi_jednou_za_beh_a_knihy_se_skeny_se_zpracuji(monkeypatch):
    ids = ['66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777']
    knihy = []
    for id_ in ids:
        data = _skenovane_pdf(2)
        dok, cesta = _kniha_ve_fronte(id_, data, ZNAME_SKENY)
        knihy.append((dok, cesta, data))
    klient, volani = _klient()
    supa = _priprav_beh(monkeypatch, knihy, klient)
    assert zpracuj._beh() == 0
    assert len(supa.stazeno) == 2
    assert all(supa.stavy[id_][-1]['stav'] in ('hotovo', 'ke_kontrole') for id_ in ids)
    # Ověření jen jednou a jako úplně první požadavek; po úspěšném přepisu už ne.
    assert _jen_text(volani[0]) and sum(1 for v in volani if _jen_text(v)) == 1
    assert len(volani) == 1 + 4


def test_vycerpany_strop_kniha_se_znamymi_skeny_se_nestahuje(monkeypatch):
    data = _skenovane_pdf(2)
    dok, cesta = _kniha_ve_fronte('88888888-8888-8888-8888-888888888888', data, ZNAME_SKENY)
    klient, volani = _klient()
    supa = _priprav_beh(monkeypatch, [(dok, cesta, data)], klient, utraceno=20.0)   # měsíční strop 20 USD vyčerpaný
    assert zpracuj._beh() == 0
    assert supa.stazeno == [] and volani == []
    posledni = supa.stavy[dok['id']][-1]
    assert posledni['stav'] == 'ceka' and posledni['pokusy'] == 0
    assert posledni['stav_zprava'] == 'Čeká: došel strop útraty za AI — pokračuje se dalším během.'


def test_vycerpany_strop_knihu_s_prepsanymi_skeny_dokonci_bez_ai(monkeypatch):
    # Přepisy z dřívějška se znovu neplatí: kniha, která je má všechny, AI nepotřebuje.
    data = _skenovane_pdf(2)
    dok, cesta = _kniha_ve_fronte('99999999-9999-9999-9999-999999999999', data, ZNAME_SKENY)
    prepisy = {dok['id']: [{'pdf_index': i, 'text': f'# Rmutování\n\nPřepsaná strana {i}.', 'okraje': '', 'ke_kontrole': False,
                            'kontrola_duvod': None, 'ocr_model': 'claude-haiku-5-5'} for i in (1, 2)]}   # pdf_index od 1
    klient, volani = _klient()
    supa = _priprav_beh(monkeypatch, [(dok, cesta, data)], klient, utraceno=20.0, prepisy=prepisy)
    assert zpracuj._beh() == 0
    assert supa.stazeno == [cesta] and volani == []
    assert supa.stavy[dok['id']][-1]['stav'] in ('hotovo', 'ke_kontrole')


def test_overeni_uctu_jina_chyba_nezastavi(monkeypatch, capsys):
    # Výpadek nebo odmítnutý požadavek o účtu nic neříká: kniha se zpracuje jako dřív.
    data = _skenovane_pdf(2)
    dok, cesta = _kniha_ve_fronte('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', data, ZNAME_SKENY)
    vysledky = [_chyba_api(529, 'overloaded_error', 'Overloaded')]

    def create(**kw):
        volani.append(kw)
        if vysledky:
            raise vysledky.pop(0)
        return _odpoved('# Text\n\nObsah strany.')

    volani: list = []
    klient = SimpleNamespace(messages=SimpleNamespace(create=create))
    supa = _priprav_beh(monkeypatch, [(dok, cesta, data)], klient)
    assert zpracuj._beh() == 0
    assert supa.stazeno == [cesta] and supa.stavy[dok['id']][-1]['stav'] in ('hotovo', 'ke_kontrole')
    assert 'ověření účtu Claude se nepovedlo' in capsys.readouterr().out
