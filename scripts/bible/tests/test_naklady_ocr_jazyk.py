import json
from types import SimpleNamespace

import pytest

import naklady
import ocr
from jazyk import odhad_jazyka

CENIK = {
    'claude-haiku-5-5': {'vstup': 0.10, 'vystup': 0.50, 'cache_cteni': 0.01, 'cache_zapis': 0.125},
    'claude-opus-5-5': {'vstup': 4, 'vystup': 20},
}


def test_cena_volani_z_tokenu():
    usage = {'input_tokens': 2_600, 'output_tokens': 900}
    assert naklady.cena_usd('claude-haiku-5-5', usage, CENIK) == pytest.approx((2600 * 0.10 + 900 * 0.50) / 1e6)
    # Bez ceníku cache: čtení 0,1× a zápis 1,25× ceny vstupu.
    usage_cache = {'input_tokens': 0, 'output_tokens': 0, 'cache_read_input_tokens': 1_000_000, 'cache_creation_input_tokens': 1_000_000}
    assert naklady.cena_usd('claude-opus-5-5', usage_cache, CENIK) == pytest.approx(0.4 + 5.0)


def test_model_bez_ceniku_je_chyba_ne_nula():
    with pytest.raises(naklady.ChybiCenik):
        naklady.cena_usd('neznamy-model', {'input_tokens': 1}, CENIK)


def test_ucet_scita_hlida_strop_a_vynuluje():
    u = naklady.Ucet(cenik=CENIK, strop_usd=0.001)
    u.pridej('claude-haiku-5-5', {'input_tokens': 2600, 'output_tokens': 900})
    assert not u.prekroceno()
    u.pridej('claude-haiku-5-5', {'input_tokens': 2600, 'output_tokens': 900})
    assert u.prekroceno()
    polozky = u.vynuluj()
    assert polozky['claude-haiku-5-5'].volani == 2 and polozky['claude-haiku-5-5'].vstup == 5200
    assert u.celkem == 0


def test_kontrola_cisel_proti_nezavislemu_cteni():
    prepis = 'Rmut se ohřeje na 62 °C, po 30 min na 72 °C; extrakt 12,5 %, objem 1 200 l.'
    assert ocr.kontrola_cisel(prepis, 'Rmut se ohreje na 62 C, po 30 min na 72 C; extrakt 12.5 %, objem 1 200 l.') == (True, None)
    sedi, duvod = ocr.kontrola_cisel(prepis, 'Rmut se ohreje na 64 C, po 35 min na 78 C; extrakt 14.5 %, objem 1 900 l.')
    assert not sedi and 'nepotvrdilo' in duvod
    # Tesseract skoro nic nepřečetl → porovnat nejde, to není důvod ke kontrole.
    assert ocr.kontrola_cisel(prepis, '...') == (True, None)
    assert ocr.kontrola_cisel('Bez čísel.', 'cokoli dlouhého ' * 10) == (True, None)


def _klient(odpoved_text, stop='end_turn'):
    volani = {}

    def create(**kw):
        volani.update(kw)
        return SimpleNamespace(
            stop_reason=stop,
            content=[SimpleNamespace(type='text', text=odpoved_text)],
            usage=SimpleNamespace(input_tokens=2500, output_tokens=800, cache_read_input_tokens=0, cache_creation_input_tokens=0),
        )

    return SimpleNamespace(messages=SimpleNamespace(create=create)), volani


def test_prepis_stranky_posle_obrazek_a_schema_a_precte_vysledek():
    data = {'zahlavi': '3 Rmutování', 'zapati': '124', 'tistena_strana': '124', 'text': '# Rmutování\n\nText.', 'necitelne': False}
    klient, volani = _klient(json.dumps(data))
    p = ocr.prepis_stranky(klient, b'\xff\xd8jpeg', 'claude-haiku-5-5')
    assert p.text.startswith('# Rmutování') and p.tistena_strana == '124' and not p.ke_kontrole
    assert p.usage == {'input_tokens': 2500, 'output_tokens': 800, 'cache_read_input_tokens': 0, 'cache_creation_input_tokens': 0}
    assert volani['model'] == 'claude-haiku-5-5'
    assert volani['output_config']['format']['type'] == 'json_schema'
    assert volani['thinking'] == {'type': 'disabled'}
    obsah = volani['messages'][0]['content']
    assert obsah[0]['type'] == 'image' and obsah[0]['source']['media_type'] == 'image/jpeg'
    assert 'temperature' not in volani   # Haiku 5.5 vzorkovací parametry odmítá


def test_nedokonceny_odmitnuty_nebo_rozbity_prepis_jde_ke_kontrole():
    data = {'zahlavi': '', 'zapati': '', 'tistena_strana': '', 'text': 'část', 'necitelne': False}
    p = ocr.prepis_stranky(_klient(json.dumps(data), stop='max_tokens')[0], b'x', 'm')
    assert p.ke_kontrole and 'limitu' in p.duvod and p.tistena_strana is None
    assert ocr.prepis_stranky(_klient('', stop='refusal')[0], b'x', 'm').ke_kontrole
    assert ocr.prepis_stranky(_klient('to není JSON')[0], b'x', 'm').ke_kontrole
    necitelne = dict(data, necitelne=True)
    assert ocr.prepis_stranky(_klient(json.dumps(necitelne))[0], b'x', 'm').duvod == 'část stránky je nečitelná'


def test_odhad_jazyka():
    assert odhad_jazyka('Rmutování je proces, při kterém se škrob ve sladu mění na cukry. ' * 3) == 'cs'
    assert odhad_jazyka('Beim Maischen wird die Stärke des Malzes in Zucker umgewandelt und die Würze gewonnen. ' * 3) == 'de'
    assert odhad_jazyka('During mashing the starch of the malt is converted to sugars and the wort is produced. ' * 3) == 'en'
    assert odhad_jazyka('Krátké.') is None
