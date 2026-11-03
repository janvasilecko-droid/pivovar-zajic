"""Český překlad stran (preklad.py a zpracuj.prekladej)."""
from __future__ import annotations

import hashlib
import json
import time
from types import SimpleNamespace

import naklady
import preklad
import zpracuj
from supa import ChybaSupabase


def _odpoved(text: str | None = None, stop: str = 'end_turn', data=None):
    obsah = json.dumps(data if data is not None else {'preklad': text}, ensure_ascii=False)
    return SimpleNamespace(content=[SimpleNamespace(type='text', text=obsah)], stop_reason=stop,
                           usage=SimpleNamespace(input_tokens=1000, output_tokens=800,
                                                 cache_read_input_tokens=0, cache_creation_input_tokens=0))


class Klient:
    """Falešný klient: vrací předem dané odpovědi (nebo výjimky) a pamatuje si požadavky."""

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


def test_otisk_je_md5_utf8_jako_v_databazi():
    # Stejná hodnota je natvrdo v bible/supabase/testy/10_kontroly.sql (md5(text) v PostgreSQL).
    assert preklad.otisk('Die β-Amylase arbeitet bei 62–65 °C.') == 'ded436ab21220e6c7346efb489ec1ac0'
    assert preklad.otisk('x') == hashlib.md5(b'x').hexdigest()


def test_kontrola_cisel_prekladu():
    assert preklad.kontrola_cisel('Mash at 62-65 °C for 30 min, 1.5 %', 'Rmutuj při 62-65 °C 30 min, 1,5 %') is None
    duvod = preklad.kontrola_cisel('Mash at 62 °C for 30 min', 'Rmutuj při 63 °C 30 min')
    assert duvod and '1 z originálu v překladu chybí' in duvod and '1 navíc' in duvod
    assert 'chybí' in preklad.kontrola_cisel('a 1 2 3', 'a 1 2')


def test_preklad_strany_posle_text_schema_a_cte_vysledek():
    k = Klient(_odpoved('Rmutování při 62 °C.'))
    p = preklad.preloz_stranu(k, 'Mashing at 62 °C.', 'claude-sonnet-5-5', 'en')
    assert p.text == 'Rmutování při 62 °C.' and p.kontrola is None and p.usage['output_tokens'] == 800
    poz = k.pozadavky[0]
    assert poz['system'] == preklad.PROMPT and poz['model'] == 'claude-sonnet-5-5'
    assert poz['output_config']['format']['schema'] == preklad.SCHEMA
    assert 'z angličtiny' in poz['messages'][0]['content'][0]['text'] and 'Mashing at 62 °C.' in poz['messages'][0]['content'][0]['text']
    assert poz['thinking'] == {'type': 'between_tools'}


def test_nepovedeny_preklad_se_neulozi():
    assert preklad.preloz_stranu(Klient(_odpoved(stop='refusal', data={})), 't', 'm').text is None
    assert preklad.preloz_stranu(Klient(_odpoved(data={'preklad': '   '})), 't', 'm').text is None
    rozbity = SimpleNamespace(content=[SimpleNamespace(type='text', text='{"prekl')], stop_reason='end_turn', usage=None)
    assert preklad.preloz_stranu(Klient(rozbity), 't', 'm').text is None
    # useknutý → jednou s dvojnásobným limitem
    k = Klient(_odpoved(stop='max_tokens', data={}), _odpoved('hotovo'))
    p = preklad.preloz_stranu(k, 't', 'm', max_tokens=100)
    assert p.text == 'hotovo' and [x['max_tokens'] for x in k.pozadavky] == [100, 200] and p.usage['input_tokens'] == 2000


def test_potreba_prekladu():
    cesky = 'Rmutování je proces, při kterém se škrob ve sladu mění na cukry a pivo pak může kvasit, je to důležité pro pivo.'
    assert not preklad.potreba_prekladu('  ', 'en', zpracuj.odhad_jazyka)
    assert not preklad.potreba_prekladu('Mashing', 'cs', zpracuj.odhad_jazyka)
    assert not preklad.potreba_prekladu(cesky, None, zpracuj.odhad_jazyka)
    assert preklad.potreba_prekladu(cesky, 'en', zpracuj.odhad_jazyka)  # jazyk určený u dokumentu má přednost
    assert preklad.potreba_prekladu('Table 3', None, zpracuj.odhad_jazyka)


class PrekladSupa:
    def __init__(self, dokumenty, strany, chyba_stran=None):
        self.dokumenty = dokumenty
        self.strany = strany  # {(dok, pdf_index): text}
        self.chyba_stran = chyba_stran
        self.upravy = []
        self.naklady = []

    def vyber_vse(self, tabulka, parametry, razeni):
        if tabulka == 'bible_dokumenty':
            assert parametry['stav'] == 'in.(hotovo,ke_kontrole)'
            return self.dokumenty
        assert tabulka == 'bible_strany' and parametry['preklad_platny'] == 'is.false'
        if self.chyba_stran:
            raise self.chyba_stran
        dok = parametry['dokument_id'][3:]
        hotove = {(u[0], u[1]) for u in self.upravy}
        return [{'pdf_index': i, 'text': t} for (d, i), t in sorted(self.strany.items()) if d == dok and (d, i) not in hotove]

    def uprav(self, tabulka, filtry, zmena, vratit=False):
        assert tabulka == 'bible_strany'
        self.upravy.append((filtry['dokument_id'][3:], int(filtry['pdf_index'][3:]), zmena))

    def vloz(self, tabulka, radky, davka=200):
        assert tabulka == 'ai_naklady'
        self.naklady.extend(radky)


def _prepisovac(klient, zdroj='predplatne', strop=5.0):
    ucet = naklady.Ucet(cenik={'claude-sonnet-5-5': {'vstup': 2, 'vystup': 10, 'cache_cteni': 0.2, 'cache_zapis': 2.5}},
                        strop_usd=strop)
    return SimpleNamespace(klient=klient, zdroj=zdroj, ucet=ucet)


ANGLICKY = 'The mash is held at 62 °C for 30 minutes and then the wort is lautered and boiled with the hops for 60 minutes.'


def test_prekladej_prelozi_cizi_strany_preskoci_ceske_a_prazdne(monkeypatch):
    supa = PrekladSupa(
        [{'id': 'A', 'jazyk': 'en'}, {'id': 'C', 'jazyk': 'cs'}, {'id': 'N', 'jazyk': None}],
        {('A', 1): ANGLICKY, ('A', 2): '', ('A', 3): 'At 70 °C.', ('C', 1): 'Česky.',
         ('N', 1): 'Rmutování je proces, při kterém se škrob ve sladu mění na cukry a pivo pak může kvasit, je to pro pivo důležité.'})

    def odpoved(kw):
        text = kw['messages'][0]['content'][0]['text']
        return _odpoved('Rmut se drží při 62 °C 30 minut, mladina se scedí a 60 minut vaří s chmelem.' if '62' in text
                        else 'Při 71 °C.')

    k = Klient(odpoved)
    souhrn = zpracuj.prekladej(supa, _prepisovac(k), {}, time.time() + 600)
    assert souhrn == {'prelozeno': 2, 'ke_kontrole': 1, 'bez_prekladu': 3, 'nepovedlo': 0}
    podle = {(d, i): z for d, i, z in supa.upravy}
    assert set(podle) == {('A', 1), ('A', 2), ('A', 3), ('C', 1), ('N', 1)}
    assert podle[('C', 1)]['preklad'] == '' and podle[('C', 1)]['preklad_zdroj'] == preklad.otisk('Česky.')  # česká kniha: nepotřebuje
    assert podle[('A', 1)]['preklad'].startswith('Rmut') and podle[('A', 1)]['preklad_kontrola'] is None
    assert podle[('A', 1)]['preklad_zdroj'] == preklad.otisk(ANGLICKY) and podle[('A', 1)]['preklad_model'] == 'claude-sonnet-5-5'
    assert podle[('A', 1)]['preklad_verze'] == preklad.PREKLAD_VERZE
    assert 'ověř v originále' in podle[('A', 3)]['preklad_kontrola']  # 70 → 71
    assert podle[('A', 2)]['preklad'] == '' and podle[('A', 2)]['preklad_model'] is None
    assert podle[('N', 1)]['preklad'] == ''  # česká strana knihy bez určeného jazyka
    assert len(k.pozadavky) == 2
    assert supa.naklady and all(r['ucel'] == 'preklad' and float(r['cena_usd']) == 0 for r in supa.naklady)


def test_prekladej_zastavi_chyba_uctu_a_nic_neulozi():
    supa = PrekladSupa([{'id': 'A', 'jazyk': 'en'}], {('A', 1): ANGLICKY, ('A', 2): ANGLICKY + ' 2', ('A', 3): ANGLICKY + ' 3'})
    chyba = zpracuj.claude_cli.ChybaClaudeCode('subscription_limit', 'došel limit')
    k = Klient(chyba)
    souhrn = zpracuj.prekladej(supa, _prepisovac(k), {}, time.time() + 600)
    assert souhrn['prelozeno'] == 0 and supa.upravy == []
    assert len(k.pozadavky) == 2  # jedna dvojice, pak konec (ne všechny strany)


def test_prekladej_hlida_cas_strop_vypnuti_a_chybejici_migraci():
    supa = PrekladSupa([{'id': 'A', 'jazyk': 'en'}], {('A', 1): ANGLICKY})
    k = Klient(_odpoved('x'))
    assert zpracuj.prekladej(supa, _prepisovac(k), {}, time.time() - 1)['prelozeno'] == 0
    assert zpracuj.prekladej(supa, _prepisovac(k), {'preklad_zapnuty': False}, time.time() + 600)['prelozeno'] == 0
    assert zpracuj.prekladej(supa, _prepisovac(k, strop=0.0, zdroj='api'), {}, time.time() + 600)['prelozeno'] == 0
    assert k.pozadavky == []
    bez_migrace = PrekladSupa([{'id': 'A', 'jazyk': 'en'}], {}, chyba_stran=ChybaSupabase('čtení bible_strany: HTTP 400 42703'))
    assert zpracuj.prekladej(bez_migrace, _prepisovac(k), {}, time.time() + 600)['prelozeno'] == 0


def test_beh_preklada_jen_po_fronte_bez_chyby(monkeypatch):
    volano = []
    monkeypatch.setattr(zpracuj, 'prekladej', lambda *a, **kw: volano.append(1))
    for vysledek, ocekavam in ((0, [1]), (1, [])):
        volano.clear()
        monkeypatch.setattr(zpracuj, '_fronta', lambda *a, v=vysledek, **kw: v)
        monkeypatch.setattr(zpracuj, 'vyber_prepisovac', lambda *a, **kw: (SimpleNamespace(), None))
        monkeypatch.setattr(zpracuj, 'nacti_nastaveni', lambda supa: {})
        monkeypatch.setattr(zpracuj, 'utraceno_tento_mesic', lambda supa: 0.0)
        monkeypatch.setenv('BIBLE_KLIC', 'k')
        monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
        assert zpracuj._beh() == vysledek
        assert volano == ocekavam
