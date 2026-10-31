"""Minimální klient Supabase (REST + Storage) pro worker — service role.

Chyby se hlásí jen kódem a HTTP stavem: tělo odpovědi PostgRESTu umí
obsahovat zapisovaná data (např. „Failing row contains …"), a logy GitHub
Actions jsou u veřejného repa veřejné.
"""
from __future__ import annotations

from urllib.parse import quote

import requests


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

    def vloz(self, tabulka: str, radky: list[dict], davka: int = 200) -> None:
        for i in range(0, len(radky), davka):
            r = self.s.post(
                f'{self.url}/rest/v1/{tabulka}',
                json=radky[i:i + davka],
                headers={'Prefer': 'return=minimal'},
                timeout=self.timeout,
            )
            self._kontrola(r, f'zápis {tabulka}')

    def uprav(self, tabulka: str, filtry: dict, zmena: dict) -> None:
        r = self.s.patch(
            f'{self.url}/rest/v1/{tabulka}', params=filtry, json=zmena,
            headers={'Prefer': 'return=minimal'}, timeout=self.timeout,
        )
        self._kontrola(r, f'úprava {tabulka}')

    def smaz(self, tabulka: str, filtry: dict) -> None:
        if not filtry:
            raise ChybaSupabase('Mazání bez filtru se nedělá (pg_safeupdate i zásada „nic nemazat").')
        r = self.s.delete(
            f'{self.url}/rest/v1/{tabulka}', params=filtry,
            headers={'Prefer': 'return=minimal'}, timeout=self.timeout,
        )
        self._kontrola(r, f'mazání {tabulka}')

    def stahni(self, bucket: str, cesta: str) -> bytes:
        r = self.s.get(f'{self.url}/storage/v1/object/{bucket}/{quote(cesta)}', timeout=600)
        self._kontrola(r, f'stažení souboru z {bucket}')
        return r.content
