"""Vektory pasáží pro hledání podle významu (vektory.py a zpracuj.dopln_vektory_beh), R38.

Jen vymyšlené věty a falešná síť i databáze — žádný skutečný klíč ani text knih (repo je veřejné).
"""
from __future__ import annotations

import os
import re
import time

import pytest
import requests

import naklady
import vektory
import zpracuj
from supa import ChybaSupabase

CENIK = {vektory.MODEL: {'vstup': 0.13, 'vystup': 0}}
KLIC = 'tajny-klic-openai'
KOREN = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))


def _vektor(i: int) -> list[float]:
    v = [0.0] * vektory.ROZMER
    v[i % vektory.ROZMER] = 1.0
    return v


class Odpoved:
    def __init__(self, status: int = 200, telo=None, bez_json: bool = False):
        self.status_code = status
        self._telo = telo
        self._bez_json = bez_json

    def json(self):
        if self._bez_json:
            raise ValueError('není json')
        return self._telo


def dobra(n: int, tokeny: int = 100, indexy: list[int] | None = None) -> Odpoved:
    poradi = indexy if indexy is not None else list(range(n))
    return Odpoved(200, {'data': [{'index': i, 'embedding': _vektor(i)} for i in poradi], 'usage': {'prompt_tokens': tokeny, 'total_tokens': tokeny}})


class Http:
    """Falešná síť: odpovědi podle pořadí, nebo funkce (url, hlavicky, json) → odpověď / výjimka."""

    def __init__(self, *odpovedi):
        self.odpovedi = list(odpovedi)
        self.pozadavky: list[dict] = []

    def post(self, url, headers=None, json=None, timeout=None):
        self.pozadavky.append({'url': url, 'headers': headers, 'json': json, 'timeout': timeout})
        o = self.odpovedi.pop(0) if len(self.odpovedi) > 1 else self.odpovedi[0]
        if callable(o):
            o = o(json)
        if isinstance(o, BaseException):
            raise o
        return o


def podle_vstupu(json) -> Odpoved:
    return dobra(len(json['input']), tokeny=10 * len(json['input']))


class FalesnaSupa:
    """Pasáže bez vektoru podle bible_vektory_chybi (s p_krome), upsert do bible_vektory a stav."""

    def __init__(self, pasaze: list[dict], chyba_stavu: Exception | None = None):
        self.pasaze = pasaze
        self.vektory: dict[str, str] = {}
        self.volani: list[tuple[str, dict]] = []
        self.zapisy: list[tuple[str, str, list[dict]]] = []
        self.chyba_stavu = chyba_stavu
        self.dotazu_na_chybejici = 0

    def rpc(self, funkce: str, argumenty: dict):
        self.volani.append((funkce, argumenty))
        if funkce == 'bible_vektory_stav':
            if self.chyba_stavu:
                raise self.chyba_stavu
            return [{'pasazi': len(self.pasaze), 's_vektorem': len(self.vektory)}]
        if funkce == 'bible_vektory_chybi':
            # Pojistka testů: chyba v běhu nesmí z testu udělat nekonečnou smyčku, která sní paměť.
            self.dotazu_na_chybejici += 1
            if self.dotazu_na_chybejici > 300:
                raise AssertionError('běh se točí donekonečna (bible_vektory_chybi se ptá pořád dokola)')
            krome = set(argumenty.get('p_krome') or [])
            zbyva = [p for p in self.pasaze if p['id'] not in self.vektory and p['id'] not in krome]
            return zbyva[:argumenty['p_limit']]
        raise AssertionError(funkce)

    def vloz_nebo_prepis(self, tabulka, radky, klic, davka=100):
        self.zapisy.append((tabulka, klic, radky))
        for r in radky:
            self.vektory[r['pasaz_id']] = r['embedding']


def pasaze(n: int) -> list[dict]:
    return [{'id': f'p{i:04d}', 'text': f'Vymyšlená věta číslo {i} o chmelu.', 'kontext': f'Kontext {i}' if i % 2 == 0 else None} for i in range(n)]


def ucet(strop: float = 5.0) -> naklady.Ucet:
    return naklady.Ucet(cenik=CENIK, strop_usd=strop)


class Zapis:
    """Náhrada zapis_naklady: pamatuje si, kolik bylo nezapsáno při každém volání."""

    def __init__(self, u: naklady.Ucet):
        self.u = u
        self.volani: list[float] = []

    def __call__(self) -> float:
        celkem = self.u.celkem
        self.u.vynuluj()
        self.volani.append(celkem)
        return celkem


def spust(supa, http, u=None, konec=None, **kw):
    u = u or ucet()
    zapis = Zapis(u)
    logy: list[str] = []
    vysledek = vektory.dopln_vektory(supa, KLIC, u, zapis, konec if konec is not None else time.time() + 600,
                                     http=http, spanek=lambda s: None, log=logy.append, **kw)
    return vysledek, zapis, logy


# --- text a tvar vektoru ---------------------------------------------------------------

def test_text_pasaze_ma_kontext_a_text_a_je_omezeny():
    assert vektory.text_pasaze({'text': ' Chmel ', 'kontext': ' O hořčině '}) == 'O hořčině\n\nChmel'
    assert vektory.text_pasaze({'text': 'Chmel', 'kontext': None}) == 'Chmel'
    assert vektory.text_pasaze({'text': 'Chmel'}) == 'Chmel'
    assert len(vektory.text_pasaze({'text': 'x' * 50_000})) == vektory.MAX_ZNAKU
    assert vektory.text_pasaze({'text': '   ', 'kontext': ''}) == '.'


def test_vektor_text_je_pro_postgresql():
    v = [0.0] * vektory.ROZMER
    v[0], v[1], v[2], v[3] = 0.25, 0.123456789012, 1e-9, -0.5
    casti = vektory.vektor_text(v).strip('[]').split(',')
    assert casti[:4] == ['0.25', '0.1234568', '1e-09', '-0.5']
    assert len(casti) == vektory.ROZMER
    with pytest.raises(vektory.ChybaVektoru):
        vektory.vektor_text([1.0, 2.0])
    with pytest.raises(vektory.ChybaVektoru):
        vektory.vektor_text([float('nan')] + [0.0] * (vektory.ROZMER - 1))


def test_konstanty_sedi_s_typescriptem_a_migraci():
    ts = open(os.path.join(KOREN, 'bible/supabase/functions/_shared/vektory.ts'), encoding='utf-8').read()
    assert f"MODEL_VEKTORU = '{vektory.MODEL}'" in ts
    assert f'ROZMER_VEKTORU = {vektory.ROZMER};' in ts
    assert f"URL_EMBEDDINGU = '{vektory.URL}'" in ts
    sql = open(os.path.join(KOREN, 'bible/supabase/migrations/20261124000000_bible_vektory.sql'), encoding='utf-8').read()
    assert f'extensions.halfvec({vektory.ROZMER})' in sql
    assert f'"{vektory.MODEL}"' in sql


# --- volání OpenAI ---------------------------------------------------------------------------

def test_embedduj_posle_model_rozmer_a_texty_a_vrati_vektory_ve_spravnem_poradi_i_tokeny():
    http = Http(dobra(3, tokeny=42, indexy=[2, 0, 1]))
    vektory_, tokeny = vektory.embedduj(['a', 'b', 'c'], KLIC, http, spanek=lambda s: None)
    assert tokeny == 42
    assert [v.index(1.0) for v in vektory_] == [0, 1, 2]
    p = http.pozadavky[0]
    assert p['url'] == 'https://api.openai.com/v1/embeddings'
    assert p['headers'] == {'Authorization': f'Bearer {KLIC}', 'Content-Type': 'application/json'}
    assert p['json'] == {'model': 'text-embedding-3-large', 'input': ['a', 'b', 'c'], 'dimensions': 1024, 'encoding_format': 'float'}
    assert p['timeout'] == vektory.CAS_POZADAVKU_S


def test_docasne_chyby_se_zkusi_znovu_s_rostouci_pauzou():
    pauzy: list[float] = []
    http = Http(Odpoved(429, {}), requests.ConnectionError('x'), Odpoved(503, {}), dobra(1))
    v, _ = vektory.embedduj(['a'], KLIC, http, spanek=pauzy.append)
    assert len(v) == 1 and len(http.pozadavky) == 4
    assert pauzy == [2.0, 4.0, 8.0]


def test_po_vycerpani_pokusu_chyba_bez_tela_odpovedi_a_bez_klice():
    http = Http(Odpoved(500, {'error': {'message': f'tajny text {KLIC}'}}))
    with pytest.raises(vektory.ChybaVektoru) as e:
        vektory.embedduj(['a'], KLIC, http, spanek=lambda s: None)
    assert len(http.pozadavky) == vektory.POKUSU
    assert str(e.value) == 'OpenAI neodpovídá (HTTP 500)'
    assert KLIC not in str(e.value) and 'tajny text' not in str(e.value)


def test_jina_chyba_konci_hned_a_nese_stav():
    http = Http(Odpoved(401, {'error': {'message': 'špatný klíč'}}))
    with pytest.raises(vektory.ChybaVektoru) as e:
        vektory.embedduj(['a'], KLIC, http, spanek=lambda s: None)
    assert len(http.pozadavky) == 1
    assert e.value.status == 401 and str(e.value) == 'HTTP 401'


@pytest.mark.parametrize('odpoved', [
    Odpoved(200, bez_json=True),
    Odpoved(200, {}),
    Odpoved(200, {'data': []}),
    Odpoved(200, {'data': [{'index': 0, 'embedding': [0.1, 0.2]}]}),
    Odpoved(200, {'data': [{'index': 0, 'embedding': ['a'] * vektory.ROZMER}]}),
    Odpoved(200, {'data': [{'index': 0, 'embedding': [True] * vektory.ROZMER}]}),
    Odpoved(200, {'data': [{'index': 0, 'embedding': [float('inf')] * vektory.ROZMER}]}),
    Odpoved(200, {'data': [{'index': 5, 'embedding': [0.0] * vektory.ROZMER}]}),
    Odpoved(200, {'data': ['x']}),
])
def test_rozbita_odpoved_je_chyba_vektoru(odpoved):
    with pytest.raises(vektory.ChybaVektoru):
        vektory.embedduj(['a'], KLIC, Http(odpoved), spanek=lambda s: None)


# --- doplnění vektorů ------------------------------------------------------------------------

def test_dopocita_vsechny_pasaze_po_davkach_a_zapise_je_upsertem():
    supa = FalesnaSupa(pasaze(150))
    http = Http(podle_vstupu)
    vysledek, zapis, logy = spust(supa, http)
    assert vysledek == {'zpracovano': 150, 'preskoceno': 0, 'duvod': 'hotovo'}
    assert [len(p['json']['input']) for p in http.pozadavky] == [64, 64, 22]
    assert len(supa.vektory) == 150
    assert all(t == 'bible_vektory' and k == 'pasaz_id,model_key' for t, k, _ in supa.zapisy)
    radek = supa.zapisy[0][2][0]
    assert radek['pasaz_id'] == 'p0000' and radek['model_key'] == 'text-embedding-3-large'
    assert re.fullmatch(r'\[(-?[0-9.e+-]+,){1023}-?[0-9.e+-]+\]', radek['embedding'])
    # vektor patří stejné pasáži: do OpenAI šel kontext + text téže pasáže
    assert http.pozadavky[0]['json']['input'][0] == 'Kontext 0\n\nVymyšlená věta číslo 0 o chmelu.'
    assert http.pozadavky[0]['json']['input'][1] == 'Vymyšlená věta číslo 1 o chmelu.'
    assert 'Vektory: nově 150 pasáží (hotovo).' in logy


def test_podruhe_uz_nic_nechybi_a_sit_se_nevola():
    supa = FalesnaSupa(pasaze(5))
    spust(supa, Http(podle_vstupu))
    http2 = Http(podle_vstupu)
    vysledek, _, logy = spust(supa, http2)
    assert vysledek['zpracovano'] == 0 and vysledek['duvod'] == 'hotovo'
    assert http2.pozadavky == []
    assert logy[0] == 'Vektory: 5 z 5 pasáží už má vektor.'


def test_naklady_se_pocitaji_z_tokenu_podle_ceniku_a_zapisuji_prubezne_i_nakonec():
    supa = FalesnaSupa(pasaze(70))
    u = ucet()
    _, zapis, _ = spust(supa, Http(podle_vstupu), u)
    # 70 pasáží × 10 tokenů = 700 tokenů × 0,13 USD / 1 M
    assert sum(zapis.volani) == pytest.approx(700 * 0.13 / 1_000_000)
    assert zapis.volani[-1] == 0 or zapis.volani[-1] >= 0
    assert u.utraceno == pytest.approx(700 * 0.13 / 1_000_000)


def test_kdyz_se_ulozene_vektory_v_databazi_neprojevi_zastavi_se_misto_zacykleni():
    class NeukladaVektory(FalesnaSupa):
        def vloz_nebo_prepis(self, tabulka, radky, klic, davka=100):
            self.zapisy.append((tabulka, klic, radky))  # zápis „projde“, ale v databázi nic nezůstane

    supa = NeukladaVektory(pasaze(5))
    http = Http(podle_vstupu)
    vysledek, _, logy = spust(supa, http)
    assert vysledek == {'zpracovano': 5, 'preskoceno': 0, 'duvod': 'bez_postupu'}
    assert len(http.pozadavky) == 1  # druhé kolo už se neplatí
    assert any('neprojevily' in radek for radek in logy)


def test_naklady_se_zapisuji_po_deseti_davkach_a_pak_nakonec():
    # 25 dávek po jedné pasáži (10 tokenů): zápis po 10. a po 20. dávce a závěrečný zápis zbytku
    _, zapis, _ = spust(FalesnaSupa(pasaze(25)), Http(podle_vstupu), davka=1)
    jednotka = 10 * 0.13 / 1_000_000
    assert zapis.volani == [pytest.approx(10 * jednotka), pytest.approx(10 * jednotka), pytest.approx(5 * jednotka)]


def test_model_bez_ceniku_je_chyba_ne_nula():
    u = naklady.Ucet(cenik={}, strop_usd=5.0)
    with pytest.raises(naklady.ChybiCenik):
        spust(FalesnaSupa(pasaze(3)), Http(podle_vstupu), u)


def test_konec_casu_strop_utraty_a_misto_v_databazi_zastavi_pred_prvni_davkou():
    http = Http(podle_vstupu)
    vysledek, _, _ = spust(FalesnaSupa(pasaze(3)), http, konec=time.time() - 1)
    assert vysledek['duvod'] == 'cas' and http.pozadavky == []
    u = ucet(strop=0.0)
    vysledek, _, _ = spust(FalesnaSupa(pasaze(3)), http, u)
    assert vysledek['duvod'] == 'strop' and http.pozadavky == []
    vysledek, _, _ = spust(FalesnaSupa(pasaze(3)), http, velikost_db=lambda: 449_700_000, limit_db_bajtu=450_000_000)
    assert vysledek['duvod'] == 'db' and http.pozadavky == []  # 449,7 MB + dávka 64 × 6 kB přes 450 MB
    vysledek, _, _ = spust(FalesnaSupa(pasaze(3)), Http(podle_vstupu), velikost_db=lambda: 449_000_000, limit_db_bajtu=450_000_000)
    assert vysledek['duvod'] == 'hotovo'  # tahle dávka se ještě vejde
    # bez údaje o velikosti se pojistka neuplatní
    vysledek, _, _ = spust(FalesnaSupa(pasaze(3)), Http(podle_vstupu), velikost_db=lambda: None, limit_db_bajtu=450_000_000)
    assert vysledek['duvod'] == 'hotovo'


def test_strop_utraty_zastavi_i_uprostred_a_nezapsana_utrata_se_zapise():
    supa = FalesnaSupa(pasaze(300))
    u = ucet(strop=0.0000012)  # první dávka (640 tokenů ≈ 0,00008 USD) strop překročí
    vysledek, zapis, _ = spust(supa, Http(podle_vstupu), u)
    assert vysledek['duvod'] == 'strop' and vysledek['zpracovano'] == 64
    assert sum(zapis.volani) == pytest.approx(640 * 0.13 / 1_000_000)


def test_bez_migrace_se_to_jen_ohlasi():
    chyba = ChybaSupabase('rpc bible_vektory_stav: HTTP 404 PGRST202')
    http = Http(podle_vstupu)
    vysledek, _, logy = spust(FalesnaSupa(pasaze(3), chyba_stavu=chyba), http)
    assert vysledek == {'zpracovano': 0, 'preskoceno': 0, 'duvod': 'bez_migrace'}
    assert http.pozadavky == []
    assert any('20261124000000_bible_vektory' in l for l in logy)
    with pytest.raises(ChybaSupabase):
        spust(FalesnaSupa(pasaze(3), chyba_stavu=ChybaSupabase('rpc bible_vektory_stav: HTTP 500')), http)


def test_vadna_pasaz_nezastavi_ostatni_a_nevyzaduje_se_znovu():
    supa = FalesnaSupa(pasaze(5))

    def odpoved(json):
        if len(json['input']) > 1 or 'číslo 2 ' in json['input'][0]:
            return Odpoved(400, {'error': {'message': 'vadný vstup'}})
        return podle_vstupu(json)

    vysledek, _, logy = spust(supa, Http(odpoved))
    assert vysledek == {'zpracovano': 4, 'preskoceno': 1, 'duvod': 'hotovo'}
    assert 'p0002' not in supa.vektory and len(supa.vektory) == 4
    assert any('přeskočeno 1' in l for l in logy)
    # další dotaz na seznam už přeskočenou pasáž vylučuje
    posledni = [a for f, a in supa.volani if f == 'bible_vektory_chybi'][-1]
    assert posledni['p_krome'] == ['p0002']


def test_chyba_klice_zastavi_beh_ale_drive_zaplacene_se_zapise():
    supa = FalesnaSupa(pasaze(130))
    http = Http(podle_vstupu, Odpoved(401, {}))
    u = ucet()
    zapis = Zapis(u)
    with pytest.raises(vektory.ChybaVektoru) as e:
        vektory.dopln_vektory(supa, KLIC, u, zapis, time.time() + 600, http=http, spanek=lambda s: None, log=lambda s: None)
    assert e.value.status == 401
    assert len(supa.vektory) == 64
    assert sum(zapis.volani) == pytest.approx(640 * 0.13 / 1_000_000)


def test_do_logu_nejde_text_pasaze_klic_ani_telo_odpovedi():
    supa = FalesnaSupa(pasaze(70))
    _, _, logy = spust(supa, Http(podle_vstupu))
    spolu = '\n'.join(logy)
    assert 'Vymyšlená věta' not in spolu and 'Kontext' not in spolu and KLIC not in spolu and '[' not in spolu


# --- krok v běhu workeru (zpracuj.dopln_vektory_beh) --------------------------------------------

def _beh_prostredi(monkeypatch, klic: str | None):
    for k in ('OPENAI_API_KEY', 'GITHUB_ACTIONS'):
        monkeypatch.delenv(k, raising=False)
    if klic is not None:
        monkeypatch.setenv('OPENAI_API_KEY', klic)


def test_beh_bez_klice_preskoci_a_hledani_zustane_jen_podle_slov(monkeypatch, capsys):
    _beh_prostredi(monkeypatch, None)
    volano = []
    monkeypatch.setattr(vektory, 'dopln_vektory', lambda *a, **k: volano.append(1))
    assert zpracuj.dopln_vektory_beh(FalesnaSupa([]), ucet(), time.time() + 60, None) is None
    assert volano == []
    assert 'klíč OpenAI' in capsys.readouterr().out


def test_beh_bez_ceniku_preskoci_a_rekne_kterou_migraci_pustit(monkeypatch, capsys):
    _beh_prostredi(monkeypatch, KLIC)
    volano = []
    monkeypatch.setattr(vektory, 'dopln_vektory', lambda *a, **k: volano.append(1))
    assert zpracuj.dopln_vektory_beh(FalesnaSupa([]), naklady.Ucet(cenik={}, strop_usd=5.0), time.time() + 60, None) is None
    assert volano == []
    assert '20261124000000_bible_vektory' in capsys.readouterr().out


def test_beh_s_klicem_a_cenikem_zavola_vektory_s_nakladem_ucelu_vektory(monkeypatch):
    _beh_prostredi(monkeypatch, KLIC)
    zavolano = {}

    def falesne(supa, klic, u, zapis, konec, **kw):
        zavolano.update(klic=klic, konec=konec, **kw)
        zavolano['zapis'] = zapis
        return {'zpracovano': 1, 'preskoceno': 0, 'duvod': 'hotovo'}

    zapsano = []
    monkeypatch.setattr(vektory, 'dopln_vektory', falesne)
    monkeypatch.setattr(zpracuj, 'zapis_naklady', lambda supa, u, dok, ucel='ocr': zapsano.append((dok, ucel)) or 0.0)
    monkeypatch.setattr(zpracuj, 'kapacita_db', lambda supa: 123)
    konec = time.time() + 60
    assert zpracuj.dopln_vektory_beh(FalesnaSupa([]), ucet(), konec, 450_000_000) == {'zpracovano': 1, 'preskoceno': 0, 'duvod': 'hotovo'}
    assert zavolano['klic'] == KLIC and zavolano['konec'] == konec and zavolano['limit_db_bajtu'] == 450_000_000
    assert zavolano['velikost_db']() == 123
    zavolano['zapis']()
    assert zapsano == [(None, 'vektory')]


def test_beh_nesahne_na_hlavni_appku_ani_kdyz_jsou_v_prostredi_jeji_udaje(monkeypatch, capsys):
    # Klíč OpenAI přijde jen z prostředí; klíč service role hlavní appky se k vektorům nikdy nedostane.
    _beh_prostredi(monkeypatch, None)
    monkeypatch.setenv('HLAVNI_URL', 'https://hlavni.example')
    monkeypatch.setenv('HLAVNI_KLIC', 'sb_secret_hlavni')
    vytvorene = []
    monkeypatch.setattr(zpracuj, 'Supa', lambda *a, **k: vytvorene.append(a) or None)
    assert zpracuj.dopln_vektory_beh(FalesnaSupa([]), ucet(), time.time() + 60, None) is None
    assert vytvorene == []
    assert 'klíč OpenAI' in capsys.readouterr().out


# --- napojení do běhu workeru (zpracuj._beh) -----------------------------------------------------

def _beh_bez_claude(monkeypatch):
    """Běh workeru s prázdnou frontou, bez klíče Claude i bez hlavní appky — vektory na nich nezávisí."""

    class Falesna:
        def __init__(self, url, klic, timeout=60):
            self.url = url

        def rpc(self, funkce, argumenty):
            return []

    monkeypatch.setattr(zpracuj, 'Supa', Falesna)
    monkeypatch.setattr(zpracuj, 'nacti_nastaveni', lambda s: {'limit_db_mb': 450})
    monkeypatch.setattr(zpracuj, 'utraceno_tento_mesic', lambda s: 0.0)
    monkeypatch.setenv('BIBLE_KLIC', 'x')
    for k in ('HLAVNI_URL', 'HLAVNI_KLIC', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENAI_API_KEY', 'GITHUB_ACTIONS', 'LIMIT_MINUT'):
        monkeypatch.delenv(k, raising=False)


def test_beh_workeru_dopocita_vektory_i_bez_klice_claude(monkeypatch):
    _beh_bez_claude(monkeypatch)
    volano = []
    monkeypatch.setattr(zpracuj, 'dopln_vektory_beh', lambda supa, u, konec, limit: volano.append((supa.url, limit, konec > time.time())))
    assert zpracuj._beh() == 0
    assert volano == [(zpracuj.BIBLE_URL, 450_000_000, True)]


def test_beh_workeru_po_konci_casu_vektory_nezacina(monkeypatch):
    _beh_bez_claude(monkeypatch)
    monkeypatch.setenv('LIMIT_MINUT', '0')
    monkeypatch.setattr(zpracuj, 'dopln_vektory_beh', lambda *a: pytest.fail('po konci času se vektory nezačínají'))
    assert zpracuj._beh() == 0


def test_chyba_vektoru_zpracovani_knih_neshodi_a_do_logu_jde_jen_typ_a_stav(monkeypatch, capsys):
    _beh_bez_claude(monkeypatch)

    def spadne(supa, u, konec, limit):
        raise vektory.ChybaVektoru('HTTP 401', 401)

    monkeypatch.setattr(zpracuj, 'dopln_vektory_beh', spadne)
    assert zpracuj._beh() == 0
    assert 'Vektory spadly (ChybaVektoru: HTTP 401)' in capsys.readouterr().out


def test_jina_chyba_vektoru_zpracovani_neshodi_a_jeji_text_se_nevypise(monkeypatch, capsys):
    _beh_bez_claude(monkeypatch)

    def spadne(supa, u, konec, limit):
        raise RuntimeError('věta z pasáže, která se nesmí dostat do veřejného logu')

    monkeypatch.setattr(zpracuj, 'dopln_vektory_beh', spadne)
    assert zpracuj._beh() == 0
    vystup = capsys.readouterr().out
    assert 'Vektory spadly (RuntimeError)' in vystup
    assert 'veřejného logu' not in vystup


def test_beh_maskuje_klic_openai_v_actions(monkeypatch, capsys):
    _beh_prostredi(monkeypatch, KLIC)
    monkeypatch.setenv('GITHUB_ACTIONS', 'true')
    monkeypatch.setattr(vektory, 'dopln_vektory', lambda *a, **k: None)
    zpracuj.dopln_vektory_beh(FalesnaSupa([]), ucet(), time.time() + 60, None)
    assert f'::add-mask::{KLIC}' in capsys.readouterr().out


def test_beh_mimo_actions_klic_nemaskuje(monkeypatch, capsys):
    _beh_prostredi(monkeypatch, KLIC)
    monkeypatch.setattr(vektory, 'dopln_vektory', lambda *a, **k: None)
    zpracuj.dopln_vektory_beh(FalesnaSupa([]), ucet(), time.time() + 60, None)
    assert '::add-mask::' not in capsys.readouterr().out
