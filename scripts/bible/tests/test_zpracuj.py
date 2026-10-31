"""Celé zpracování dokumentu nad falešnou databází a falešným Claude (bez sítě)."""
import hashlib
import io
import json
from types import SimpleNamespace

import pytest
from PIL import Image

import naklady
import zpracuj
from conftest import vyrob_pdf

CENIK = {'claude-haiku-5-5': {'vstup': 0.10, 'vystup': 0.50, 'cache_cteni': 0.01, 'cache_zapis': 0.125}}
TAJNY_TEXT = 'Tajny odstavec knihy o rmutovani pri 62 stupnich.'


class FalesnaSupa:
    def __init__(self, soubory: dict[str, bytes]):
        self.soubory = soubory
        self.tabulky: dict[str, list[dict]] = {'bible_kapitoly': [], 'bible_strany': [], 'bible_pasaze': [], 'ai_naklady': []}
        self.upravy: list[tuple[str, dict, dict]] = []
        self.mazani: list[tuple[str, dict]] = []
        self.poradi: list[str] = []

    def stahni(self, bucket, cesta):
        assert bucket == 'knihovna'
        return self.soubory[cesta]

    def vloz(self, tabulka, radky, davka=200):
        self.poradi.append(f'vloz {tabulka}')
        self.tabulky.setdefault(tabulka, []).extend(radky)

    def smaz(self, tabulka, filtry):
        self.poradi.append(f'smaz {tabulka}')
        self.mazani.append((tabulka, filtry))
        self.tabulky[tabulka] = []

    def uprav(self, tabulka, filtry, zmena):
        self.upravy.append((tabulka, filtry, zmena))

    def posledni_stav(self):
        return [z for t, _, z in self.upravy if t == 'bible_dokumenty' and 'stav' in z][-1]


def _dokument(data: bytes, mime: str, **navic):
    return {
        'id': '11111111-1111-1111-1111-111111111111', 'soubor_cesta': 'x/soubor', 'soubor_mime': mime,
        'soubor_velikost': len(data), 'soubor_sha256': hashlib.sha256(data).hexdigest(), 'pokusy': 1, 'jazyk': None,
        **navic,
    }


def _klient(text='# Rmutování\n\nBeta-amyláza pracuje nejlépe při 62–65 °C.', tistena='17'):
    volani = []

    def create(**kw):
        volani.append(kw)
        data = {'zahlavi': '', 'zapati': tistena, 'tistena_strana': tistena, 'text': text, 'necitelne': False}
        return SimpleNamespace(
            stop_reason='end_turn',
            content=[SimpleNamespace(type='text', text=json.dumps(data))],
            usage=SimpleNamespace(input_tokens=2500, output_tokens=700, cache_read_input_tokens=0, cache_creation_input_tokens=0),
        )

    return SimpleNamespace(messages=SimpleNamespace(create=create)), volani


def _png() -> bytes:
    proud = io.BytesIO()
    Image.new('RGB', (800, 1100), 'white').save(proud, format='PNG')
    return proud.getvalue()


ODSTAVEC = 'Die Maischarbeit beeinflusst die Zusammensetzung der Wuerze entscheidend, Rasten bei 62 und 72 Grad.'


def _kniha_pdf() -> bytes:
    # 6 stran s textovou vrstvou; tištěná strana = list + 10 (číslo v zápatí).
    strany = [[f'{i + 1} Maischen', *([ODSTAVEC] * 8), *([''] * 42), str(i + 11)] for i in range(6)]
    return vyrob_pdf(strany, osnova=[('1 Slad', 0), ('2 Maischen', 3)])


def test_digitalni_pdf_bez_ai(capsys):
    data = _kniha_pdf()
    supa = FalesnaSupa({'x/soubor': data})
    ucet = naklady.Ucet(cenik=CENIK, strop_usd=5)
    utraceno = zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), None, ucet)
    assert utraceno == 0
    stav = supa.posledni_stav()
    assert stav['stav'] == 'hotovo' and stav['zamek_do'] is None
    assert stav['postup']['stran'] == 6 and stav['postup']['digitalnich'] == 6 and stav['postup']['ocr'] == 0
    assert stav['postup']['kapitol'] == 2 and stav['postup']['pasazi'] >= 1
    assert stav['kvalita_ocr'] is None and stav['verze_zpracovani'] == zpracuj.VERZE
    strany = supa.tabulky['bible_strany']
    assert [s['tistena_strana'] for s in strany] == ['11', '12', '13', '14', '15', '16']
    assert all(s['zdroj_textu'] == 'vrstva' for s in strany)
    kapitoly = supa.tabulky['bible_kapitoly']
    assert [(k['nazev'], k['strana_od'], k['strana_do']) for k in kapitoly] == [('Slad', 1, 3), ('Maischen', 4, 6)]
    assert strany[4]['kapitola_id'] == kapitoly[1]['id']
    pasaze = supa.tabulky['bible_pasaze']
    assert all(p['kapitola_id'] in {k['id'] for k in kapitoly} for p in pasaze)
    assert pasaze[0]['jazyk'] == 'de'
    # Staré odvozené řádky pryč dřív, než se zapíšou nové; vždy jen s filtrem dokumentu.
    assert supa.poradi[:3] == ['smaz bible_pasaze', 'smaz bible_strany', 'smaz bible_kapitoly']
    assert all(f == {'dokument_id': 'eq.11111111-1111-1111-1111-111111111111'} for _, f in supa.mazani)
    assert supa.tabulky['ai_naklady'] == []
    vystup = capsys.readouterr().out
    assert 'Maischarbeit' not in vystup and 'hotovo: 6 stran' in vystup


def test_sken_prepise_claude_a_zapise_naklady(capsys):
    data = _png()
    supa = FalesnaSupa({'x/soubor': data})
    ucet = naklady.Ucet(cenik=CENIK, strop_usd=5)
    klient, volani = _klient(text=f'# Rmutování\n\n{TAJNY_TEXT}')
    prepisovac = zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet)
    utraceno = zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/png'), prepisovac, ucet)
    assert len(volani) == 1 and volani[0]['messages'][0]['content'][0]['source']['media_type'] == 'image/jpeg'
    strana = supa.tabulky['bible_strany'][0]
    assert strana['zdroj_textu'] == 'ocr' and strana['ocr_model'] == 'claude-haiku-5-5'
    assert TAJNY_TEXT in strana['text']
    naklad = supa.tabulky['ai_naklady'][0]
    assert naklad['model'] == 'claude-haiku-5-5' and naklad['volani'] == 1 and naklad['vstup_tokenu'] == 2500
    assert naklad['cena_usd'] == pytest.approx((2500 * 0.10 + 700 * 0.50) / 1e6, abs=1e-6)
    assert utraceno == pytest.approx(naklad['cena_usd'], abs=1e-6)
    assert supa.posledni_stav()['stav'] in ('hotovo', 'ke_kontrole')
    assert TAJNY_TEXT not in capsys.readouterr().out


def test_sken_bez_klice_je_chyba_dokumentu():
    data = _png()
    supa = FalesnaSupa({'x/soubor': data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/png'), None, naklady.Ucet(cenik=CENIK, strop_usd=5))
    stav = supa.posledni_stav()
    assert stav['stav'] == 'chyba' and 'ANTHROPIC_API_KEY' in stav['stav_zprava']


def test_jiny_soubor_nez_nahrany():
    data = _kniha_pdf()
    supa = FalesnaSupa({'x/soubor': data + b'zmena'})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'application/pdf'), None, naklady.Ucet(cenik=CENIK, strop_usd=5))
    stav = supa.posledni_stav()
    assert stav['stav'] == 'chyba' and 'SHA-256' in stav['stav_zprava']
    assert supa.tabulky['bible_strany'] == []


def test_neznama_chyba_se_zkusi_znovu_a_po_tretim_pokusu_vzda(monkeypatch):
    data = b'# Nadpis\n\nText.'

    def spadni(*a, **k):
        raise ValueError('nečekaná porucha')

    monkeypatch.setattr(zpracuj, 'rozloz', spadni)
    supa = FalesnaSupa({'x/soubor': data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'text/markdown', pokusy=1), None, naklady.Ucet(cenik=CENIK, strop_usd=5))
    assert supa.posledni_stav()['stav'] == 'ceka'
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'text/markdown', pokusy=3), None, naklady.Ucet(cenik=CENIK, strop_usd=5))
    assert supa.posledni_stav()['stav'] == 'chyba'
    assert 'ValueError' in supa.posledni_stav()['stav_zprava']


def test_strop_utraty_vrati_dokument_do_fronty():
    data = _png()
    supa = FalesnaSupa({'x/soubor': data})
    ucet = naklady.Ucet(cenik=CENIK, strop_usd=0)
    klient, volani = _klient()
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/png', pokusy=2), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    stav = supa.posledni_stav()
    assert stav['stav'] == 'ceka' and stav['pokusy'] == 1 and 'strop' in stav['stav_zprava']
    assert volani == []


def test_spatny_klic_zastavi_cely_beh():
    data = _png()
    supa = FalesnaSupa({'x/soubor': data})

    class Odmitnuto(Exception):
        status_code = 401
        message = 'invalid x-api-key'

    def create(**kw):
        raise Odmitnuto()

    klient = SimpleNamespace(messages=SimpleNamespace(create=create))
    ucet = naklady.Ucet(cenik=CENIK, strop_usd=5)
    with pytest.raises(zpracuj.ZastavitBeh):
        zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/png'), zpracuj.Prepisovac(klient, 'claude-haiku-5-5', ucet), ucet)
    stav = supa.posledni_stav()
    assert stav['stav'] == 'ceka' and 'ANTHROPIC_API_KEY' in stav['stav_zprava']


def test_odmitnuty_pozadavek_je_chyba_dokumentu():
    data = _png()
    supa = FalesnaSupa({'x/soubor': data})

    class Spatne(Exception):
        status_code = 400
        message = 'output_config: unsupported'

    def create(**kw):
        raise Spatne()

    ucet = naklady.Ucet(cenik=CENIK, strop_usd=5)
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'image/png'),
                             zpracuj.Prepisovac(SimpleNamespace(messages=SimpleNamespace(create=create)), 'claude-haiku-5-5', ucet), ucet)
    stav = supa.posledni_stav()
    assert stav['stav'] == 'chyba' and 'HTTP 400' in stav['stav_zprava']


def test_markdown_docx_formaty_bez_cisel_stran():
    data = '# Chmelovar\n\nVar trvá 90 minut.\n\n## Odpar\n\nOdpar je 8 % za hodinu.'.encode('utf-8')
    supa = FalesnaSupa({'x/soubor': data})
    zpracuj.zpracuj_dokument(supa, _dokument(data, 'text/markdown'), None, naklady.Ucet(cenik=CENIK, strop_usd=5))
    stav = supa.posledni_stav()
    assert stav['stav'] == 'hotovo' and stav['postup']['bez_cisla_strany'] == 0
    assert [k['nazev'] for k in supa.tabulky['bible_kapitoly']] == ['Chmelovar', 'Odpar']
    assert all(s['zdroj_textu'] == 'soubor' and s['tistena_strana'] is None for s in supa.tabulky['bible_strany'])
