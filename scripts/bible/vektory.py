"""Vektory (embeddingy) pasáží pro hledání podle významu (R38; testy: tests/test_vektory.py).

Majitel 24. 11. 2026 (zadání RAG chatbota): „vytvoření embeddings a uložení do vektorové databáze“.
Worker najde pasáže bez vektoru (RPC bible_vektory_chybi), pošle jejich text do OpenAI embeddings
(text-embedding-3-large zkrácený na 1024 čísel) a uloží vektory do bible_vektory (pgvector). Hledání v chatu
a v konektoru pak spojuje hledání podle slov s hledáním podle významu (bible/supabase/functions/_shared/vektory.ts).

Pasáže se berou po dávkách od nejstarší a zápis je upsert — běh jde kdykoli přerušit a spustit znovu, nic se
nezdvojí. Model a velikost vektoru musí odpovídat migraci 20261124000000_bible_vektory (halfvec(1024)) a TypeScriptu
(MODEL_VEKTORU, ROZMER_VEKTORU); hlídá to test.

⚠️ REPOZITÁŘ JE VEŘEJNÝ, LOGY TAKY: do logu jdou jen počty, stavy a typy chyb — nikdy text pasáže, klíč ani tělo
odpovědi API (HTTP chyba se hlásí jen stavem).
"""
from __future__ import annotations

import math
import time
from typing import Callable

import requests

import naklady
from supa import ChybaSupabase, Supa

MODEL = 'text-embedding-3-large'
ROZMER = 1024
URL = 'https://api.openai.com/v1/embeddings'
# Pasáží na jedno volání: ≈ 64 × 600 tokenů; limit OpenAI je 300 000 tokenů a 2048 vstupů na požadavek.
DAVKA = 64
# Delší text se zkrátí (pasáž má nejvýš ≈ 3 600 znaků; limit modelu je 8191 tokenů).
MAX_ZNAKU = 12_000
CAS_POZADAVKU_S = 60
POKUSU = 5
# Odhad místa v databázi na jednu pasáž: vektor 1024 × 2 B = 2 kB a HNSW index (pojistka proti plné databázi bible).
ODHAD_BAJTU_NA_VEKTOR = 6_000
# Průběžný zápis nákladů do ai_naklady po tolika dávkách (aby je nezahodil spadlý běh).
ZAPIS_NAKLADU_PO_DAVKACH = 10

_DOCASNE_STAVY = (429, 500, 502, 503, 504)


class ChybaVektoru(RuntimeError):
    """Chyba embeddingů; zpráva nese jen stav, nikdy text pasáže ani tělo odpovědi."""

    def __init__(self, zprava: str, status: int | None = None):
        super().__init__(zprava)
        self.status = status


def text_pasaze(p: dict) -> str:
    """Co se převádí na vektor: krátký kontext od AI (pomáhá hledání) a text pasáže."""
    kontext = (p.get('kontext') or '').strip()
    text = (p.get('text') or '').strip()
    spojeny = f'{kontext}\n\n{text}' if kontext else text
    return spojeny[:MAX_ZNAKU] or '.'


def vektor_text(v: list[float]) -> str:
    """Vektor jako text pro PostgreSQL / PostgREST: „[a,b,…]“ na 7 platných číslic."""
    if len(v) != ROZMER or not all(math.isfinite(x) for x in v):
        raise ChybaVektoru('vektor má špatný tvar')
    return '[' + ','.join(format(x, '.7g') for x in v) + ']'


def _vektory_z_odpovedi(r, pocet: int) -> tuple[list[list[float]], int]:
    try:
        telo = r.json()
    except ValueError:
        raise ChybaVektoru('odpověď není JSON') from None
    data = telo.get('data') if isinstance(telo, dict) else None
    if not isinstance(data, list) or len(data) != pocet:
        raise ChybaVektoru('odpověď má jiný počet vektorů')
    if not all(isinstance(d, dict) for d in data):
        raise ChybaVektoru('odpověď má špatný tvar')
    serazene = sorted(data, key=lambda d: d.get('index', -1))
    if [d.get('index') for d in serazene] != list(range(pocet)):
        raise ChybaVektoru('odpověď má jiné pořadí vektorů')
    vektory: list[list[float]] = []
    for d in serazene:
        v = d.get('embedding')
        if (not isinstance(v, list) or len(v) != ROZMER
                or not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in v)):
            raise ChybaVektoru('vektor má špatný tvar')
        vektory.append([float(x) for x in v])
    usage = telo.get('usage') if isinstance(telo.get('usage'), dict) else {}
    tokeny = int(usage.get('prompt_tokens') or usage.get('total_tokens') or 0)
    return vektory, tokeny


def embedduj(texty: list[str], klic: str, http=requests, spanek: Callable[[float], None] = time.sleep) -> tuple[list[list[float]], int]:
    """Vektory pro dané texty (stejné pořadí) a počet použitých tokenů.

    Dočasné chyby (429, 5xx, síť) se zkusí znovu s rostoucí pauzou; jiná chyba (např. 401 špatný klíč, 400 vadný
    vstup) skončí hned. Do chyby nejde tělo odpovědi, jen stav.
    """
    hlavicky = {'Authorization': f'Bearer {klic}', 'Content-Type': 'application/json'}
    telo = {'model': MODEL, 'input': texty, 'dimensions': ROZMER, 'encoding_format': 'float'}
    posledni = 'síť'
    for pokus in range(POKUSU):
        if pokus:
            spanek(min(60.0, 2.0 ** pokus))
        try:
            r = http.post(URL, headers=hlavicky, json=telo, timeout=CAS_POZADAVKU_S)
        except requests.RequestException as e:
            posledni = f'síť ({type(e).__name__})'
            continue
        if r.status_code in _DOCASNE_STAVY:
            posledni = f'HTTP {r.status_code}'
            continue
        if r.status_code != 200:
            raise ChybaVektoru(f'HTTP {r.status_code}', r.status_code)
        return _vektory_z_odpovedi(r, len(texty))
    raise ChybaVektoru(f'OpenAI neodpovídá ({posledni})')


def _davka(radky: list[dict], klic: str, http, spanek) -> tuple[list[tuple[dict, list[float]]], int, list[str]]:
    """Vektory pro dávku pasáží: [(pasáž, vektor)], tokeny a id pasáží, které nejdou převést (HTTP 400).

    Vadný vstup (400) jedné pasáže nesmí zastavit všechny ostatní: dávka se zkusí po jedné a nepřevoditelné
    pasáže se přeskočí (další dávky je už nevyžádají; příští běh to zkusí znovu).
    """
    try:
        vektory, tokeny = embedduj([text_pasaze(r) for r in radky], klic, http, spanek)
        return list(zip(radky, vektory)), tokeny, []
    except ChybaVektoru as e:
        if e.status != 400:
            raise
        if len(radky) == 1:
            return [], 0, [radky[0]['id']]
    hotove: list[tuple[dict, list[float]]] = []
    tokeny_celkem = 0
    preskocene: list[str] = []
    for r in radky:
        casti, tokeny, vynechane = _davka([r], klic, http, spanek)
        hotove.extend(casti)
        tokeny_celkem += tokeny
        preskocene.extend(vynechane)
    return hotove, tokeny_celkem, preskocene


def _vypis(zprava: str) -> None:
    print(zprava, flush=True)


def dopln_vektory(
    supa: Supa, klic: str, ucet: naklady.Ucet, zapis_naklady: Callable[[], float], konec: float, *,
    velikost_db: Callable[[], int | None] | None = None, limit_db_bajtu: int | None = None,
    http=requests, spanek: Callable[[float], None] = time.sleep, davka: int = DAVKA,
    log: Callable[[str], None] = _vypis,
) -> dict:
    """Dopočítá vektory pasážím, které je nemají; vrací {'zpracovano', 'preskoceno', 'duvod'}.

    duvod: hotovo | cas | strop (útrata běhu) | db (málo místa v databázi bible) | bez_migrace | bez_postupu
    (databáze vrací pasáže, které se právě uložily — zápis se neprojevil, další kolo by platilo to samé znovu).
    Náklady se zapisují průběžně a nakonec (i když běh spadne), strop útrata/čas/místo se hlídá před každou dávkou.
    """
    zpracovano = 0
    preskoceno: list[str] = []
    ulozene: set[str] = set()
    duvod = 'hotovo'
    davek = 0
    try:
        try:
            stav = supa.rpc('bible_vektory_stav', {'p_model': MODEL})
        except ChybaSupabase as e:
            if 'PGRST202' in str(e) or 'HTTP 404' in str(e):
                log('Vektory: databáze bible ještě nemá migraci 20261124000000_bible_vektory (appka → Systém → Databázové migrace → Databáze bible). Přeskočeno.')
                return {'zpracovano': 0, 'preskoceno': 0, 'duvod': 'bez_migrace'}
            raise
        radek = stav[0] if isinstance(stav, list) and stav else {}
        log(f'Vektory: {int(radek.get("s_vektorem") or 0)} z {int(radek.get("pasazi") or 0)} pasáží už má vektor.')
        while True:
            if time.time() >= konec:
                duvod = 'cas'
                break
            if ucet.prekroceno():
                duvod = 'strop'
                break
            if velikost_db is not None and limit_db_bajtu:
                velikost = velikost_db()
                if velikost is not None and velikost + davka * ODHAD_BAJTU_NA_VEKTOR >= limit_db_bajtu:
                    duvod = 'db'
                    break
            radky = supa.rpc('bible_vektory_chybi', {'p_model': MODEL, 'p_limit': davka, 'p_krome': preskoceno or None})
            if not radky:
                duvod = 'hotovo'
                break
            if all(r['id'] in ulozene for r in radky):
                # Pojistka proti zacyklení (a zbytečné útratě): uložené vektory by už nechyběly.
                log('Vektory: uložené vektory se v databázi neprojevily (stejné pasáže chybí znovu) — zastaveno, ať se zbytečně neplatí.')
                duvod = 'bez_postupu'
                break
            hotove, tokeny, vynechane = _davka(radky, klic, http, spanek)
            if tokeny:
                ucet.pridej(MODEL, {'input_tokens': tokeny})  # nejdřív náklady: tokeny jsou zaplacené, i kdyby zápis selhal
            if hotove:
                supa.vloz_nebo_prepis(
                    'bible_vektory',
                    [{'pasaz_id': r['id'], 'model_key': MODEL, 'embedding': vektor_text(v)} for r, v in hotove],
                    'pasaz_id,model_key',
                )
            zpracovano += len(hotove)
            ulozene.update(r['id'] for r, _ in hotove)
            preskoceno.extend(vynechane)
            davek += 1
            if davek % ZAPIS_NAKLADU_PO_DAVKACH == 0:
                zapis_naklady()
    finally:
        zapis_naklady()
    vysledek = {'zpracovano': zpracovano, 'preskoceno': len(preskoceno), 'duvod': duvod}
    log(f'Vektory: nově {zpracovano} pasáží ({duvod}){f", přeskočeno {len(preskoceno)}" if preskoceno else ""}.')
    return vysledek
