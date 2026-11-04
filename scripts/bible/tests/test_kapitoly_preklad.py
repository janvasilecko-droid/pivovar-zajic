"""Český překlad názvů kapitol (kapitoly_preklad.py a zpracuj.prekladej_kapitoly)."""
from __future__ import annotations

import json
import time
from types import SimpleNamespace

import kapitoly_preklad
import naklady
import zpracuj
from supa import ChybaSupabase


def _odpoved(nazvy, stop='end_turn'):
    return SimpleNamespace(content=[SimpleNamespace(type='text', text=json.dumps({'nazvy': nazvy}, ensure_ascii=False))],
                           stop_reason=stop, usage=SimpleNamespace(input_tokens=500, output_tokens=200,
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
        if callable(o):
            return o(kw)
        return o


def test_preloz_nazvy_jen_se_stejnym_poctem():
    k = Klient(_odpoved(['3.2 Rmutování', ' ']))
    nazvy, _ = kapitoly_preklad.preloz_nazvy(k, ['3.2 Mashing', 'Hops'], 'claude-sonnet-5-5', 'en')
    assert nazvy == ['3.2 Rmutování', 'Hops']  # prázdný překlad → původní název
    assert 'z angličtiny' in k.pozadavky[0]['messages'][0]['content'][0]['text']
    assert kapitoly_preklad.preloz_nazvy(Klient(_odpoved(['jen jeden'])), ['a', 'b'], 'm', 'en')[0] is None
    assert kapitoly_preklad.preloz_nazvy(Klient(_odpoved([], 'refusal')), ['a'], 'm', 'en')[0] is None


class KapitolySupa:
    def __init__(self, dokumenty, kapitoly, ceka=(), prelozene=(), bez_migrace=False):
        self.dokumenty, self.kapitoly = dokumenty, kapitoly  # kapitoly: {dok: [(id, nazev)]}
        self.ceka, self.prelozene, self.bez_migrace = set(ceka), set(prelozene), bez_migrace
        self.rpc_volani = []
        self.naklady = []

    def vyber_vse(self, tabulka, parametry, razeni):
        if tabulka == 'bible_dokumenty':
            return self.dokumenty
        assert tabulka == 'bible_kapitoly' and parametry['nazev_cs'] == 'is.null'
        if self.bez_migrace:
            raise ChybaSupabase('čtení bible_kapitoly: HTTP 400 42703')
        return [{'id': i, 'nazev': n} for i, n in self.kapitoly.get(parametry['dokument_id'][3:], [])]

    def vyber(self, tabulka, parametry):
        dok = parametry['dokument_id'][3:]
        if 'preklad_platny' in parametry:
            return [{'pdf_index': 1}] if dok in self.ceka else []
        return [{'pdf_index': 1}] if dok in self.prelozene else []

    def rpc(self, funkce, argumenty):
        self.rpc_volani.append((funkce, argumenty))
        if funkce == 'bible_kapitoly_nazvy':
            return len(argumenty['p_id'])
        return 3

    def vloz(self, tabulka, radky, davka=200):
        self.naklady.extend(radky)


def _prepisovac(klient):
    return SimpleNamespace(klient=klient, zdroj='predplatne', ucet=naklady.Ucet(cenik={}, strop_usd=5.0))


def test_prekladej_kapitoly_anglicka_ceska_a_rozpracovana(monkeypatch):
    monkeypatch.setattr(kapitoly_preklad, 'DAVKA', 2)
    supa = KapitolySupa(
        [{'id': 'EN', 'jazyk': 'en'}, {'id': 'CS', 'jazyk': None}, {'id': 'POZDEJI', 'jazyk': 'en'}],
        {'EN': [('k1', 'Malt'), ('k2', 'Hops'), ('k3', 'Yeast')], 'CS': [('c1', 'Slad')], 'POZDEJI': [('p1', 'Water')]},
        ceka={'POZDEJI'}, prelozene={'EN'})

    def odpoved(kw):
        text = kw['messages'][0]['content'][0]['text']
        return _odpoved(['Slad', 'Chmel'] if 'Malt' in text else ['Kvasnice'])

    k = Klient(odpoved)
    souhrn = zpracuj.prekladej_kapitoly(supa, _prepisovac(k), {}, time.time() + 600)
    assert souhrn == {'prelozeno': 3, 'bez_prekladu': 3, 'nepovedlo': 0}
    assert ('bible_kapitoly_nazvy', {'p_id': ['k1', 'k2'], 'p_nazvy': ['Slad', 'Chmel']}) in supa.rpc_volani
    assert ('bible_kapitoly_nazvy', {'p_id': ['k3'], 'p_nazvy': ['Kvasnice']}) in supa.rpc_volani
    assert ('bible_kapitoly_bez_prekladu', {'p_dokument': 'CS'}) in supa.rpc_volani
    assert not any(a.get('p_dokument') == 'POZDEJI' or 'p1' in a.get('p_id', []) for _, a in supa.rpc_volani)
    assert len(k.pozadavky) == 2


def test_prekladej_kapitoly_bez_migrace_a_chyba_uctu():
    bez = KapitolySupa([{'id': 'EN', 'jazyk': 'en'}], {}, bez_migrace=True)
    assert zpracuj.prekladej_kapitoly(bez, _prepisovac(Klient(_odpoved([]))), {}, time.time() + 600) == {'prelozeno': 0, 'bez_prekladu': 0, 'nepovedlo': 0}
    supa = KapitolySupa([{'id': 'EN', 'jazyk': 'en'}], {'EN': [('k1', 'Malt')]}, prelozene={'EN'})
    zpracuj.prekladej_kapitoly(supa, _prepisovac(Klient(zpracuj.claude_cli.ChybaClaudeCode('subscription_limit', 'l'))), {}, time.time() + 600)
    assert supa.rpc_volani == []
