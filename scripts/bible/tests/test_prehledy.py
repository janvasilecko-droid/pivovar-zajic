"""Přehledy témat (prehledy.py a zpracuj.pis_prehledy)."""
from __future__ import annotations

import json
import time
from types import SimpleNamespace

import naklady
import prehledy
import zpracuj
from supa import ChybaSupabase

# Jen vymyšlené krátké věty — žádný text skutečných knih (repo je veřejné).


def _r(dok, pdf, text, skore=1.0, zdroj='original', nazev='Kniha A', tistena=None):
    return {'dokument_id': dok, 'pdf_index': pdf, 'text': text, 'skore': skore, 'zdroj': zdroj, 'nazev': nazev,
            'tistena_strana': tistena, 'kapitola': 'Chmelovar'}


def test_vyber_zdroju_bez_duplicit_stridave_z_knih():
    radky = [[_r('A', 1, 'a1', 9), _r('A', 2, 'a2', 8), _r('A', 3, 'a3', 7)], [_r('B', 1, 'b1', 1), _r('A', 1, 'a1 znovu', 5)]]
    z = prehledy.vyber_zdroje(radky, max_zdroju=3)
    assert [(x.dokument_id, x.pdf_index) for x in z] == [('A', 1), ('B', 1), ('A', 2)]
    assert prehledy.vyber_zdroje([[_r('A', 1, '  ')]]) == []


def test_otisk_se_zmeni_s_novym_zdrojem_nebo_textem():
    z1 = prehledy.vyber_zdroje([[_r('A', 1, 'Var 90 min.')]])
    z2 = prehledy.vyber_zdroje([[_r('A', 1, 'Var 90 min.'), _r('B', 4, 'Odpar 8 %.')]])
    z3 = prehledy.vyber_zdroje([[_r('A', 1, 'Var 60 min.')]])
    assert prehledy.otisk_zdroju(z1) == prehledy.otisk_zdroju(prehledy.vyber_zdroje([[_r('A', 1, 'Var 90 min.', 5)]]))
    assert len({prehledy.otisk_zdroju(z) for z in (z1, z2, z3)}) == 3


def test_kontrola_citaci_a_cisel():
    zdroje = prehledy.vyber_zdroje([[_r('A', 1, 'Chmelovar trvá 60–90 min, odpar 6–8 %.'), _r('B', 2, 'Var 90 min.', 0.5)]])
    text, kontrola, pouzite = prehledy.zkontroluj('Chmelovar trvá 60–90 min [1][2], odpar 6–8 % [1].', zdroje)
    assert kontrola is None and pouzite == [1, 2] and text.endswith('[1].')
    text, kontrola, pouzite = prehledy.zkontroluj('Var 120 min [7], odpar 8 % [1].', zdroje)
    assert '[7]' not in text and pouzite == [1]
    assert '1 citací mimo zdroje' in kontrola and '1 čísel v přehledu není' in kontrola
    assert 'žádnou citaci' in prehledy.zkontroluj('Bez citace.', zdroje)[1]


def test_zadani_cisluje_zdroje_s_knihou_a_mistem():
    zdroje = prehledy.vyber_zdroje([[_r('A', 5, 'Var.', tistena='12', zdroj='preklad', nazev='Kniha X')]])
    z = prehledy.zadani({'nazev': 'Chmelovar'}, zdroje)
    assert '[1] Kniha X, s. 12, kapitola „Chmelovar" (český překlad)' in z and '<uryvek>\nVar.\n</uryvek>' in z


def _odpoved(text, stop='end_turn'):
    return SimpleNamespace(content=[SimpleNamespace(type='text', text=json.dumps({'text': text}, ensure_ascii=False))],
                           stop_reason=stop, usage=SimpleNamespace(input_tokens=5000, output_tokens=1500,
                                                                   cache_read_input_tokens=0, cache_creation_input_tokens=0))


class Klient:
    def __init__(self, *odpovedi):
        self.odpovedi = list(odpovedi)
        self.pozadavky = []
        self.messages = self

    def create(self, **kw):
        self.pozadavky.append(kw)
        o = self.odpovedi.pop(0) if len(self.odpovedi) > 1 else self.odpovedi[0]
        if isinstance(o, BaseException):
            raise o
        return o


def test_napis_prehled_posle_zdroje_a_vrati_kontrolovany_text():
    zdroje = prehledy.vyber_zdroje([[_r('A', 1, 'Chmelovar 90 min.')]])
    k = Klient(_odpoved('Chmelovar trvá 90 min [1].'))
    p = prehledy.napis_prehled(k, {'nazev': 'Chmelovar'}, zdroje, 'claude-opus-5-5')
    assert p.text == 'Chmelovar trvá 90 min [1].' and p.kontrola is None and p.pouzite == [1]
    assert k.pozadavky[0]['system'] == prehledy.PROMPT and 'thinking' not in k.pozadavky[0]
    assert prehledy.napis_prehled(Klient(_odpoved('', 'refusal')), {'nazev': 'x'}, zdroje, 'm').text is None


class PrehledySupa:
    def __init__(self, existujici=None, ceka_dok=False, ceka_preklad=False, bez_tabulky=False):
        self.existujici = existujici or {}
        self.ceka_dok, self.ceka_preklad, self.bez_tabulky = ceka_dok, ceka_preklad, bez_tabulky
        self.zapsane = []
        self.stav = []
        self.naklady = []

    def vyber_vse(self, tabulka, parametry, razeni):
        assert tabulka == 'bible_prehledy'
        if self.bez_tabulky:
            raise ChybaSupabase('čtení bible_prehledy: HTTP 404 PGRST205')
        return [{'klic': k, 'otisk': v} for k, v in self.existujici.items()]

    def vyber(self, tabulka, parametry):
        if tabulka == 'bible_dokumenty':
            return [{'id': 'x'}] if self.ceka_dok else []
        return [{'pdf_index': 1}] if self.ceka_preklad else []

    def uprav(self, tabulka, filtry, zmena, vratit=False):
        assert tabulka == 'bible_nastaveni' and filtry == {'klic': 'eq.prehledy_aktualni'}
        self.stav.append(zmena['hodnota'])

    def rpc(self, funkce, argumenty):
        assert funkce == 'bible_hledej' and argumenty['p_limit'] == prehledy.NA_DOTAZ
        if argumenty['p_dotaz'] == 'chmelovar':
            return [_r('A', 1, 'Chmelovar 90 min.', tistena='12'), _r('B', 3, 'Odpar 8 %.')]
        return []

    def vloz_nebo_prepis(self, tabulka, radky, klic, davka=100):
        assert tabulka == 'bible_prehledy' and klic == 'klic'
        self.zapsane.extend(radky)

    def vloz(self, tabulka, radky, davka=200):
        self.naklady.extend(radky)


def _prepisovac(klient):
    return SimpleNamespace(klient=klient, zdroj='predplatne', ucet=naklady.Ucet(cenik={}, strop_usd=5.0))


def test_pis_prehledy_napise_jen_temata_se_zdroji_a_zmenou(monkeypatch):
    monkeypatch.setattr(prehledy, 'TEMATA', [
        {'klic': 'chmelovar', 'nazev': 'Chmelovar', 'oblast': 'F', 'dotazy': ['chmelovar', 'odpar']},
        {'klic': 'filtrace', 'nazev': 'Filtrace', 'oblast': 'J', 'dotazy': ['filtrace']},
    ])
    supa = PrehledySupa()
    k = Klient(_odpoved('Chmelovar 90 min [1], odpar 8 % [2].'))
    souhrn = zpracuj.pis_prehledy(supa, _prepisovac(k), {}, time.time() + 600)
    assert souhrn['napsano'] == 1 and souhrn['bez_zdroju'] == 1 and souhrn['nepovedlo'] == 0
    r = supa.zapsane[0]
    assert r['klic'] == 'chmelovar' and r['oblast'] == 'F' and r['kontrola'] is None
    assert [(z['n'], z['dokument_id'], z['pdf_index'], z['tistena_strana']) for z in r['zdroje']] == [(1, 'A', 1, '12'), (2, 'B', 3, None)]
    assert 'text' not in r['zdroje'][0]  # v citacích není text knihy
    assert supa.stav == [False, True]
    assert supa.naklady and supa.naklady[0]['ucel'] == 'prehled'
    # Druhý běh beze změny zdrojů: nic se nepíše, Claude se nevolá
    supa2 = PrehledySupa(existujici={'chmelovar': r['otisk']})
    k2 = Klient(_odpoved('x'))
    assert zpracuj.pis_prehledy(supa2, _prepisovac(k2), {}, time.time() + 600)['beze_zmeny'] == 1
    assert k2.pozadavky == [] and supa2.zapsane == [] and supa2.stav == [False, True]


def test_pis_prehledy_ceka_na_knihy_preklad_a_migraci(monkeypatch):
    k = Klient(_odpoved('x [1]'))
    for supa in (PrehledySupa(ceka_dok=True), PrehledySupa(ceka_preklad=True)):
        zpracuj.pis_prehledy(supa, _prepisovac(k), {}, time.time() + 600)
        assert supa.zapsane == [] and supa.stav == [False]  # přehledy zastaralé, běh se zopakuje
    bez = PrehledySupa(bez_tabulky=True)
    zpracuj.pis_prehledy(bez, _prepisovac(k), {}, time.time() + 600)
    assert bez.stav == []  # bez migrace se stav nemění (plánovaný běh se kvůli tomu nespouští)
    vyp = PrehledySupa()
    zpracuj.pis_prehledy(vyp, _prepisovac(k), {'prehledy_zapnute': False}, time.time() + 600)
    assert vyp.stav == [] and k.pozadavky == []


def test_pis_prehledy_chyba_uctu_zastavi_a_stav_zustane_zastaraly(monkeypatch):
    monkeypatch.setattr(prehledy, 'TEMATA', [{'klic': 'chmelovar', 'nazev': 'Chmelovar', 'oblast': 'F', 'dotazy': ['chmelovar']}])
    supa = PrehledySupa()
    k = Klient(zpracuj.claude_cli.ChybaClaudeCode('subscription_limit', 'limit'))
    zpracuj.pis_prehledy(supa, _prepisovac(k), {}, time.time() + 600)
    assert supa.zapsane == [] and supa.stav == [False]


def test_temata_maji_platne_klice_a_oblasti():
    klice = [t['klic'] for t in prehledy.TEMATA]
    assert len(klice) == len(set(klice))
    assert all(__import__('re').fullmatch(r'[a-z0-9_]{1,40}', k) for k in klice)
    assert all(t['oblast'] in 'ABCDEFGHIJKLMNOPQRST' and t['dotazy'] for t in prehledy.TEMATA)
