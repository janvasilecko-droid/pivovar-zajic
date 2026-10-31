"""Minimální klient Supabase (REST + Storage) pro worker — service role.

Chyby se hlásí jen kódem a HTTP stavem: tělo odpovědi PostgRESTu umí
obsahovat zapisovaná data (např. „Failing row contains …"), a logy GitHub
Actions jsou u veřejného repa veřejné.

Krátký výpadek sítě nebo Supabase (5xx) přečká: čtení, úpravy a mazání se
zkusí znovu, zápis (POST) jen tehdy, když požadavek vůbec neodešel —
opakovaný zápis by mohl řádky zdvojit (např. náklady).
"""
from __future__ import annotations

from urllib.parse import quote

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# PostgREST vrací nejvýš tolik řádků na dotaz (víc tiše zahodí) — čte se po stránkách.
STRANKA = 1000


class ChybaSupabase(RuntimeError):
    pass


class Supa:
    def __init__(self, url: str, klic: str, timeout: float = 60):
        if not url or not klic:
            raise ChybaSupabase('Chybí adresa Supabase nebo klíč service role.')
        self.url = url.rstrip('/')
        self.timeout = timeout
        self.s = requests.Session()
        self.s.headers.update({'apikey': klic, 'Authorization': f'Bearer {klic}'})
        opakovani = Retry(
            total=5, connect=5, read=3, status=4, backoff_factor=2,
            status_forcelist=(500, 502, 503, 504),
            allowed_methods=frozenset({'GET', 'HEAD', 'PATCH', 'DELETE'}),
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=opakovani)
        self.s.mount('https://', adapter)
        self.s.mount('http://', adapter)

    @staticmethod
    def _kontrola(odpoved: requests.Response, co: str) -> None:
        if odpoved.status_code < 400:
            return
        kod = ''
        try:
            telo = odpoved.json()
            if isinstance(telo, dict):
                kod = str(telo.get('code') or telo.get('error') or '')
        except ValueError:
            pass
        raise ChybaSupabase(f'{co}: HTTP {odpoved.status_code} {kod}'.strip())

    def rpc(self, funkce: str, argumenty: dict) -> object:
        r = self.s.post(f'{self.url}/rest/v1/rpc/{funkce}', json=argumenty, timeout=self.timeout)
        self._kontrola(r, f'rpc {funkce}')
        return r.json() if r.content else None

    def vyber(self, tabulka: str, parametry: dict) -> list[dict]:
        r = self.s.get(f'{self.url}/rest/v1/{tabulka}', params=parametry, timeout=self.timeout)
        self._kontrola(r, f'čtení {tabulka}')
        return r.json()

    def vyber_vse(self, tabulka: str, parametry: dict, razeni: str) -> list[dict]:
        """Všechny řádky po stránkách (PostgREST jich na dotaz vrátí nejvýš 1000)."""
        vysledek: list[dict] = []
        while True:
            stranka = self.vyber(tabulka, {**parametry, 'order': razeni, 'limit': STRANKA, 'offset': len(vysledek)})
            vysledek.extend(stranka)
            if len(stranka) < STRANKA:
                return vysledek

    def vloz(self, tabulka: str, radky: list[dict], davka: int = 200) -> None:
        for i in range(0, len(radky), davka):
            r = self.s.post(
                f'{self.url}/rest/v1/{tabulka}',
                json=radky[i:i + davka],
                headers={'Prefer': 'return=minimal'},
                timeout=self.timeout,
            )
            self._kontrola(r, f'zápis {tabulka}')

    def vloz_nebo_prepis(self, tabulka: str, radky: list[dict], klic: str, davka: int = 100) -> None:
        """Upsert podle `klic` (sloupce oddělené čárkou) — opakovat ho je bezpečné."""
        for i in range(0, len(radky), davka):
            r = self.s.post(
                f'{self.url}/rest/v1/{tabulka}',
                params={'on_conflict': klic},
                json=radky[i:i + davka],
                headers={'Prefer': 'resolution=merge-duplicates,return=minimal'},
                timeout=self.timeout,
            )
            self._kontrola(r, f'zápis {tabulka}')

    def uprav(self, tabulka: str, filtry: dict, zmena: dict, vratit: bool = False) -> list[dict] | None:
        """PATCH; s `vratit` vrátí změněné řádky (jen id) — prázdný seznam = filtr
        nic nenašel (dokument mezitím smazán nebo už není ve stavu z filtru)."""
        r = self.s.patch(
            f'{self.url}/rest/v1/{tabulka}', params={**filtry, **({'select': 'id'} if vratit else {})}, json=zmena,
            headers={'Prefer': 'return=representation' if vratit else 'return=minimal'}, timeout=self.timeout,
        )
        self._kontrola(r, f'úprava {tabulka}')
        return r.json() if vratit else None

    def smaz(self, tabulka: str, filtry: dict) -> None:
        if not filtry:
            raise ChybaSupabase('Mazání bez filtru se nedělá (pg_safeupdate i zásada „nic nemazat").')
        r = self.s.delete(
            f'{self.url}/rest/v1/{tabulka}', params=filtry,
            headers={'Prefer': 'return=minimal'}, timeout=self.timeout,
        )
        self._kontrola(r, f'mazání {tabulka}')

    def stahni(self, bucket: str, cesta: str) -> bytes:
        if not cesta or cesta.startswith('/') or any(c in ('', '.', '..') for c in cesta.split('/')):
            raise ChybaSupabase('stažení souboru: nepovolená cesta')
        r = self.s.get(f'{self.url}/storage/v1/object/{bucket}/{quote(cesta)}', timeout=600)
        self._kontrola(r, f'stažení souboru z {bucket}')
        return r.content
