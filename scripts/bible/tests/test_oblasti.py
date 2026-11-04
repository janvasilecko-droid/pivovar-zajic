"""Zařazení knih do oblastí A–T (oblasti.py a zpracuj.urci_oblasti)."""
from __future__ import annotations

import json
import time
from types import SimpleNamespace

import naklady
import oblasti
import zpracuj


def _odpoved(kody, stop='end_turn'):
    return SimpleNamespace(content=[SimpleNamespace(type='text', text=json.dumps({'oblasti': kody}))], stop_reason=stop,
                           usage=SimpleNamespace(input_tokens=800, output_tokens=40, cache_read_input_tokens=0, cache_creation_input_tokens=0))


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


def test_urci_jen_platne_kody_bez_duplicit_a_bez_textu_knihy():
    k = Klient(_odpoved(['F', 'D', 'F', 'Z']))
    kody, usage = oblasti.urci(k, 'Technologie piva', 'Novák', ['1 Slad', '2 Rmutování', '3 Chmelovar'], 'claude-sonnet-5-5')
    assert kody == ['F', 'D'] and usage['input_tokens'] == 800
    text = k.pozadavky[0]['messages'][0]['content'][0]['text']
    assert '- 2 Rmutování' in text and 'F: Chmelovar' in text and 'Technologie piva (Novák)' in text
    assert oblasti.urci(Klient(_odpoved([], 'refusal')), 'x', None, [], 'm')[0] is None
    assert oblasti.urci(Klient(_odpoved([])), 'x', None, [], 'm')[0] is None


class OblastiSupa:
    def __init__(self, dokumenty):
        self.dokumenty = dokumenty
        self.upravy = []
        self.naklady = []

    def vyber_vse(self, tabulka, parametry, razeni):
        if tabulka == 'bible_dokumenty':
            assert parametry['oblasti'] == 'eq.{}' and parametry['stav'] == 'in.(hotovo,ke_kontrole)'
            return self.dokumenty
        assert tabulka == 'bible_kapitoly'
        return [{'nazev': 'Chmelovar'}, {'nazev': 'Kvašení'}]

    def uprav(self, tabulka, filtry, zmena, vratit=False):
        assert tabulka == 'bible_dokumenty' and filtry['oblasti'] == 'eq.{}'
        self.upravy.append((filtry['id'][3:], zmena))

    def vloz(self, tabulka, radky, davka=200):
        self.naklady.extend(radky)


def _prepisovac(klient):
    return SimpleNamespace(klient=klient, zdroj='predplatne', ucet=naklady.Ucet(cenik={}, strop_usd=5.0))


def test_urci_oblasti_doplni_jen_knihy_bez_oblasti_a_poznaci_automaticke():
    supa = OblastiSupa([
        {'id': 'A', 'nazev': 'Kniha A', 'autor': None, 'oblasti': [], 'postup': {'stran': 10}},
        {'id': 'B', 'nazev': 'Kniha B', 'autor': None, 'oblasti': [], 'postup': {'oblasti_zkouseno': True}},
    ])
    k = Klient(_odpoved(['F', 'H']))
    souhrn = zpracuj.urci_oblasti(supa, _prepisovac(k), {}, time.time() + 600)
    assert souhrn == {'zarazeno': 1, 'nepovedlo': 0} and len(k.pozadavky) == 1  # B už zkoušená
    id_, zmena = supa.upravy[0]
    assert id_ == 'A' and zmena['oblasti'] == ['F', 'H']
    assert zmena['postup'] == {'stran': 10, 'oblasti_zkouseno': True, 'oblasti_auto': ['F', 'H']}
    assert supa.naklady[0]['ucel'] == 'oblasti'


def test_urci_oblasti_neurcene_se_nezkousi_dokola_a_chyba_uctu_zastavi():
    supa = OblastiSupa([{'id': 'A', 'nazev': 'X', 'autor': None, 'oblasti': [], 'postup': {}}])
    zpracuj.urci_oblasti(supa, _prepisovac(Klient(_odpoved([]))), {}, time.time() + 600)
    assert supa.upravy[0][1] == {'postup': {'oblasti_zkouseno': True}}  # bez oblastí, ale už se nezkouší
    supa2 = OblastiSupa([{'id': 'A', 'nazev': 'X', 'autor': None, 'oblasti': [], 'postup': {}}])
    zpracuj.urci_oblasti(supa2, _prepisovac(Klient(zpracuj.claude_cli.ChybaClaudeCode('subscription_limit', 'l'))), {}, time.time() + 600)
    assert supa2.upravy == []
