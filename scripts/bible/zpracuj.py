#!/usr/bin/env python3
"""Worker Pivovarské bible: zpracuje nahrané knihy (spouští GitHub Actions).

Pro každý čekající dokument (fronta bible_vezmi_dokument):
  1. stáhne originál ze soukromého bucketu a ověří SHA-256,
  2. rozloží ho na strany — u PDF textová vrstva; skeny (i skeny s cizí OCR
     vrstvou a DjVu) přepíše Claude a čísla v přepisu ověří Tesseract a vrstva
     souboru (nesedí → strana „ke kontrole"); hotové přepisy průběžně ukládá,
     takže přerušený dokument naváže a nic se neplatí dvakrát,
  3. určí tištěná čísla stran (jen s jistotou), kapitoly a pasáže,
  4. zapíše strany, kapitoly a pasáže, stav a počty, náklady na AI.

Knihy žijí v SAMOSTATNÉM projektu Supabase (projekt bible, rozhodnutí R12
v docs/pivovarska-bible/ROZHODNUTI.md). Hlavní projekt appky worker potřebuje
jen kvůli klíči Anthropic (app_secrets) — nic jiného v něm nečte ani nepíše.

PROMĚNNÉ: BIBLE_KLIC (service role projektu bible), volitelně BIBLE_URL
(výchozí adresa projektu bible); ANTHROPIC_API_KEY (v Actions ho připraví
zvláštní krok), jinak HLAVNI_URL a HLAVNI_KLIC (hlavní projekt, jen čtení
klíče); volitelně CLAUDE_CODE_OAUTH_TOKEN (přepis přes Claude Code
s předplatným Claude, když API kredit nejde — claude_cli.py), DOKUMENT (id),
LIMIT_USD (strop běhu), LIMIT_MINUT, MAX_DOKUMENTU.

BEZPEČNOST: repo i logy Actions jsou veřejné. Do logu jde jen ID dokumentu,
počty a stavy — nikdy text, název ani jiný obsah knihy, ani traceback (nesl
by zprávy výjimek). Klíč Anthropic se čte z app_secrets hlavní appky a
v Actions se hned maskuje.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import warnings
import zipfile
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable
from xml.etree import ElementTree

import claude_cli
import formaty
import naklady
import obrazky
import ocr
import pdf as pdf_mod
from jazyk import odhad_jazyka
from kapitoly import Kapitola, kapitola_listu, okrajove_radky, osnova_pouzitelna, useky, z_nadpisu, z_osnovy
from pasaze import rozdel_na_pasaze
from stranky import je_digitalni, kandidati_cisla, tistena_cisla, vada_vrstvy
from supa import ChybaSupabase, Supa

VERZE = 'zpracovani-2'
BUCKET = 'knihovna'
BIBLE_URL = 'https://cegrelgvkygcatupqwrx.supabase.co'   # projekt bible (veřejná adresa)
ZAMEK_MINUT = 120
VLAKEN_OCR = 4
DAVKA_PREPISU = 10          # přepsané strany se ukládají po tolika (navázání po přerušení)
PRUBEH_KAZDYCH_S = 15       # průběh zpracování (procenta v knihovně) se zapisuje nejvýš takhle často
NAKLADY_KAZDYCH_S = 300     # útrata dlouhého OCR se zapisuje průběžně
LIMIT_DB_MB = 450           # výchozí pojistka velikosti databáze (Supabase Free = 500 MB)
# Přes předplatné se za běh přepíše nejvýš tolik stran (bible_nastaveni.max_stran_predplatne):
# limity Maxu sdílí i majitelova vlastní práce s Claude, ať je přepis knih nevyčerpá naráz.
MAX_STRAN_PREDPLATNE = 150
BAJTU_NA_ZNAK = 8           # odhad místa v DB na znak textu (strana + pasáž + tsvector + index)
DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
OBRAZKY = {'image/jpeg', 'image/png', 'image/webp', 'image/tiff'}
POVOLENE_TYPY = OBRAZKY | {'application/pdf', 'image/vnd.djvu', 'text/plain', 'text/markdown', 'text/csv',
                           'application/epub+zip', DOCX, XLSX}
# Appka ukládá soubor jako „<id dokumentu>/<bezpečné jméno>" (bezpecneJmeno v bibleKnihovna.ts).
_CESTA = re.compile(r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/([A-Za-z0-9._-]{1,200})$')
_RIDICI = re.compile('[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


class ChybaZpracovani(RuntimeError):
    """Chyba dokumentu, kterou má vidět uživatel (česky, bez obsahu knihy) → stav „chyba"."""


class Odlozit(RuntimeError):
    """Dokument za nic nemůže: počká na další běh, zpráva jde do stav_zprava.

    vratit_pokus=False: pokus se počítá (po třech je dokument „chyba"), aby
    dokument, který chybu sám způsobuje, nemohl frontu točit donekonečna.
    """
    zastavit_beh = False

    def __init__(self, zprava: str, do_logu: str | None = None, vratit_pokus: bool = True):
        super().__init__(zprava)
        self.do_logu = do_logu or zprava
        self.vratit_pokus = vratit_pokus


class PrerusenoStropem(Odlozit):
    """Došel strop útraty za AI — dokumenty bez AI se zpracují dál."""


class ChybiKlic(Odlozit):
    """Sken bez klíče Anthropic — dokumenty bez AI se zpracují dál."""


class PrerusenoCasem(Odlozit):
    """Běh došel na časový limit; přepsané strany jsou uložené, další běh naváže."""
    zastavit_beh = True


class PrerusenoDavkou(Odlozit):
    """Přes předplatné je dávka stran pro tento běh hotová; přepsané strany jsou uložené, další běh naváže."""
    zastavit_beh = True


class PlnaDatabaze(Odlozit):
    """Kniha by přeplnila databázi bible (Supabase Free ji při 500 MB přepne jen pro čtení)."""
    zastavit_beh = True


class ZastavitBeh(Odlozit):
    """Chyba, kvůli které by selhaly všechny dokumenty (klíč, kredit, model) — běh končí."""
    zastavit_beh = True


class PrechodnaChyba(RuntimeError):
    """Dočasný výpadek Anthropic (5xx, 529, síť): pokus se počítá, běh končí, další běh to zkusí znovu."""


class DokumentZmenen(RuntimeError):
    """Dokument během zpracování někdo smazal, pozastavil nebo vrátil do fronty."""


def chyba_api(e: BaseException, prvni: bool = False) -> BaseException | None:
    """Chyba Anthropic API → výjimka workeru podle toho, čí je.

    Účet a nastavení (klíč, kredit, limit útraty, model) zastaví celý běh —
    dokumenty počkají. Dočasný výpadek ukončí běh a pokus se počítá. Odmítnutý
    požadavek u dokumentu je chyba dokumentu, u prvního volání běhu ale spíš
    chyba nastavení. Zprávy API obsah knih neobsahují; do DB jde jen začátek.
    """
    status = getattr(e, 'status_code', None)
    druh = str(getattr(e, 'type', '') or '')
    zprava = ' '.join(str(getattr(e, 'message', '') or e).split())[:200]
    mala = zprava.lower()
    if getattr(e, 'zdroj', None) == 'predplatne':
        return _chyba_predplatneho(druh, status)
    if status in (401, 403) or druh in ('authentication_error', 'permission_error'):
        return ZastavitBeh(f'Čeká: Anthropic odmítl klíč (HTTP {status}) — zkontroluj ANTHROPIC_API_KEY v app_secrets hlavní appky.')
    if status == 402 or druh == 'billing_error' or any(
            s in mala for s in ('credit balance', 'usage limit', 'spend limit', 'you have reached your specified')):
        return ZastavitBeh('Čeká: na účtu Anthropic došel kredit nebo limit útraty — dobij kredit a zpracování poběží dál.')
    if status == 404 or druh == 'not_found_error':
        return ZastavitBeh('Čeká: Anthropic model nezná nebo ho účet nemá (HTTP 404) — zkontroluj model_ocr v nastavení bible.')
    if status == 429 or druh == 'rate_limit_error':
        return ZastavitBeh('Čeká: Anthropic omezil počet požadavků (HTTP 429) — pokračuje se příštím během.')
    if status in (400, 413):
        if prvni:
            return ZastavitBeh(
                f'Čeká: Anthropic odmítl první požadavek běhu (HTTP {status}): {zprava} — spíš chyba nastavení (model_ocr) než dokumentu.',
                do_logu=f'Anthropic odmítl první požadavek běhu (HTTP {status}).', vratit_pokus=False)
        return ChybaZpracovani(f'Anthropic požadavek odmítl (HTTP {status}): {zprava}')
    if (status is not None and status >= 500) or druh in ('api_error', 'overloaded_error') \
            or type(e).__name__ in ('APIConnectionError', 'APITimeoutError'):
        return PrechodnaChyba(f'Čeká: Anthropic je dočasně nedostupný ({f"HTTP {status}" if status else type(e).__name__}) — zkusí se příštím během.')
    return None


def _chyba_predplatneho(druh: str, status: int | None) -> BaseException:
    """Chyba Claude Code s předplatným (claude_cli.ChybaClaudeCode) → výjimka workeru.

    Limit předplatného a token zastaví běh (knihy se skeny počkají, ostatní
    se zpracují); přetížení a výpadek jako u API. Zpráva je pevná věta —
    z výsledku Claude Code se nebere žádný text (mohl by nést obsah stránky).
    """
    if druh == 'subscription_limit':
        return ZastavitBeh('Čeká: došel limit předplatného Claude (5hodinový nebo týdenní) — přepis pokračuje dalším během.')
    if druh == 'authentication_error':
        return ZastavitBeh('Čeká: Claude Code odmítl token předplatného — vytvoř nový příkazem „claude setup-token" '
                           'a ulož ho v GitHubu jako secret CLAUDE_CODE_OAUTH_TOKEN.')
    if druh == 'not_installed':
        return ZastavitBeh('Čeká: v běhu chybí Claude Code (instalace selhala) — zkusí se příštím během.')
    if druh == 'not_found_error':
        return ZastavitBeh('Čeká: Claude Code model nezná nebo ho předplatné nemá — zkontroluj model_ocr v nastavení bible.')
    if druh == 'rate_limit_error':
        return ZastavitBeh('Čeká: Claude omezil počet požadavků (HTTP 429) — pokračuje se příštím během.')
    return PrechodnaChyba(f'Čeká: Claude Code je dočasně nedostupný ({druh}{f", HTTP {status}" if status else ""}) — zkusí se příštím během.')


def log(zprava: str) -> None:
    print(zprava, flush=True)


def _cislo(hodnota, vychozi: float) -> float:
    """Číslo z nastavení: chybějící nebo prázdné = výchozí, 0 je platná nula (strop 0 = nic neutrácet)."""
    if hodnota is None or (isinstance(hodnota, str) and not hodnota.strip()):
        return vychozi
    try:
        return float(hodnota)
    except (TypeError, ValueError):
        return vychozi


def _cisty(text: str | None) -> str:
    """Text pro PostgreSQL: bez NUL a řídicích znaků (kromě tabulátoru a konce řádku)."""
    return _RIDICI.sub('', (text or '').replace('\r\n', '\n').replace('\r', '\n'))


@dataclass
class Strana:
    pdf_index: int
    text: str
    zdroj: str                  # 'vrstva' | 'ocr' | 'soubor'
    okraje: str = ''
    ocr_model: str | None = None
    ke_kontrole: bool = False
    duvod: str | None = None
    tistena: str | None = None
    tistena_zdroj: str | None = None


@dataclass
class Vysledek:
    strany: list[Strana]
    kapitoly: list[Kapitola]
    pasaze: list = field(default_factory=list)
    varovani: list[str] = field(default_factory=list)
    obrazku: int = 0
    znovu_pouzito: int = 0


# --- nastavení a klíč --------------------------------------------------------

def nacti_nastaveni(supa: Supa) -> dict:
    radky = supa.vyber('bible_nastaveni', {'select': 'klic,hodnota'})
    return {r['klic']: r['hodnota'] for r in radky}


def nacti_klic_anthropic(supa: Supa) -> str | None:
    """Klíč Anthropic z app_secrets HLAVNÍHO projektu (používají ho i edge funkce appky)."""
    radky = supa.vyber('app_secrets', {'select': 'value', 'key': 'eq.ANTHROPIC_API_KEY'})
    klic = (radky[0].get('value') if radky else None) or None
    if klic and os.environ.get('GITHUB_ACTIONS') == 'true':
        # GitHub od teď klíč v logu nahradí hvězdičkami (řádek příkazu se nezobrazuje).
        # Mimo Actions se klíč nikdy nevypisuje.
        print(f'::add-mask::{klic}', flush=True)
    return klic


def utraceno_tento_mesic(supa: Supa) -> float:
    """Útrata za AI od začátku měsíce (UTC) — součet počítá databáze (žádný limit 1000 řádků)."""
    zacatek = datetime.now(timezone.utc).strftime('%Y-%m-01T00:00:00Z')
    return float(supa.rpc('bible_utraceno_od', {'p_od': zacatek}) or 0)


def kapacita_db(supa: Supa) -> int | None:
    try:
        kapacita = supa.rpc('bible_kapacita', {})
    except Exception:  # noqa: BLE001 — bez údaje se pojistka neuplatní, zpracování pokračuje
        return None
    if isinstance(kapacita, dict) and kapacita.get('db_bajtu') is not None:
        return int(kapacita['db_bajtu'])
    return None


# --- OCR skenů ----------------------------------------------------------------

class Prepisovac:
    """Přepis skenů přes Claude s kontrolou čísel; hlídá strop útraty a čas běhu."""

    def __init__(self, klient, model: str, ucet: naklady.Ucet, konec: float | None = None,
                 zdroj: str = 'api', limit_stran: int | None = None):
        self.klient = klient
        self.model = model
        self.ucet = ucet
        self.konec = konec
        # 'api' = API klíč (platí se kredit), 'predplatne' = Claude Code s předplatným (bez útraty,
        # jen limity předplatného — proto dávka stran za běh).
        self.zdroj = zdroj
        self.limit_stran = limit_stran
        self.zamek = threading.Lock()
        self.tesseract = ocr.tesseract_k_dispozici()
        self.uspesnych = 0
        self.zahajenych = 0
        self.ucet_overen = False

    def over_ucet(self) -> None:
        """Ověří, že přepis teď půjde, dřív než se kvůli skenům stáhne celá kniha.

        Strop útraty z počítadla; klíč, kredit a model jedním levným požadavkem
        za běh (po úspěšném přepisu už ne). Zastaví jen jasná chyba účtu
        (ZastavitBeh) — jiná chyba o účtu nic neříká a kniha se zpracuje jako dřív.
        """
        with self.zamek:
            if self.ucet.prekroceno():
                raise PrerusenoStropem('Čeká: došel strop útraty za AI — pokračuje se dalším během.')
        if self.ucet_overen or self.uspesnych:
            return
        self.ucet_overen = True
        try:
            odpoved = ocr.over_ucet(self.klient, self.model)
        except Exception as e:  # noqa: BLE001 — chyba API → výjimka workeru
            prevedena = chyba_api(e)
            if isinstance(prevedena, ZastavitBeh):
                raise prevedena from None
            log(f'  ověření účtu Claude se nepovedlo ({type(e).__name__}) — pokračuje se')
            return
        with self.zamek:
            self.ucet.pridej(self.model, ocr.usage_jako_dict(getattr(odpoved, 'usage', None)), zdarma=self.zdroj == 'predplatne')

    def prepis(self, obrazek: bytes, dalsi_cteni: str = '') -> ocr.Prepis:
        with self.zamek:
            if self.ucet.prekroceno():
                raise PrerusenoStropem('Čeká: došel strop útraty za AI — pokračuje se dalším během.')
            if self.limit_stran is not None and self.zahajenych >= self.limit_stran:
                raise PrerusenoDavkou(f'Čeká: přes předplatné Claude se za jeden běh přepíše {self.limit_stran} stran '
                                      '— další dávka příštím během (každé 3 hodiny).')
            self.zahajenych += 1
        if self.konec is not None and time.time() >= self.konec:
            raise PrerusenoCasem('Čeká: běh došel na časový limit — přepis pokračuje dalším během.')
        try:
            vysledek = ocr.prepis_stranky(self.klient, obrazek, self.model)
        except Exception as e:  # noqa: BLE001 — chyba API → výjimka workeru
            prevedena = chyba_api(e, prvni=self.uspesnych == 0)
            if prevedena is not None:
                raise prevedena from None
            raise
        with self.zamek:
            self.ucet.pridej(self.model, vysledek.usage, zdarma=self.zdroj == 'predplatne')
            self.uspesnych += 1
        if not vysledek.ke_kontrole:
            cteni = ([ocr.precti_tesseractem(obrazek)] if self.tesseract else []) + ([dalsi_cteni] if dalsi_cteni else [])
            if cteni:
                sedi, duvod = ocr.kontrola_cisel(vysledek.text, *cteni)
                if not sedi:
                    vysledek.ke_kontrole, vysledek.duvod = True, duvod
        if not vysledek.ke_kontrole and not vysledek.text.strip() and not obrazky.je_prazdna_strana(obrazek):
            vysledek.ke_kontrole, vysledek.duvod = True, 'přepis je prázdný, ale strana prázdná není'
        return vysledek


def prepis_strany(prepisovac: Prepisovac | None, strany: list[Strana], obrazky_stran: dict[int, Callable[[], bytes]],
                  ulozit: Callable[[list[Strana]], None], kontrola: Callable[[], None],
                  dalsi_cteni: dict[int, str] | None = None,
                  postup: Callable[[int], None] | None = None,
                  bez_ai: str | None = None) -> None:
    """Přepíše strany z `obrazky_stran` (index v `strany` → funkce vracející JPEG).

    Obrázky se vykreslují v hlavním vlákně (PDFium není vláknově bezpečné),
    souběžně běží jen volání API a Tesseract — nejvýš 2× tolik, kolik je vláken.
    Hotové přepisy se průběžně ukládají (`ulozit`) a `kontrola` prodlouží zámek
    a ověří, že dokument nikdo nesmazal ani nepozastavil. `postup` dostane po
    každé uložené dávce počet přepsaných stran (procenta v knihovně).
    """
    if not obrazky_stran:
        return
    if prepisovac is None:
        # bez_ai: AI vypnutá kvůli účtu Claude (kredit, klíč…) — dokument počká s tímhle důvodem.
        raise ChybiKlic(bez_ai or ('Čeká: dokument má naskenované strany a chybí klíč Claude (ANTHROPIC_API_KEY v app_secrets hlavní appky) '
                    'i token předplatného (secret CLAUDE_CODE_OAUTH_TOKEN v GitHubu).'))
    dalsi_cteni = dalsi_cteni or {}
    k_ulozeni: list[Strana] = []
    hotovo = 0
    nahlaseno = 0
    posledni_ulozeni = time.time()

    def zapis(i: int, p: ocr.Prepis) -> None:
        nonlocal hotovo
        s = strany[i]
        s.text = p.text
        tistena = p.tistena_strana if (p.tistena_strana or '').isdigit() else ''
        s.okraje = '\n'.join(x for x in (p.zahlavi, p.zapati, tistena) if x)
        s.ocr_model = prepisovac.model
        s.ke_kontrole, s.duvod = p.ke_kontrole, p.duvod
        k_ulozeni.append(s)
        hotovo += 1

    def uloz_davku(vzdy: bool = False) -> None:
        nonlocal posledni_ulozeni, nahlaseno
        if k_ulozeni and (vzdy or len(k_ulozeni) >= DAVKA_PREPISU or time.time() - posledni_ulozeni > 60):
            ulozit(list(k_ulozeni))
            k_ulozeni.clear()
            posledni_ulozeni = time.time()
            kontrola()
            if postup is not None:
                postup(hotovo)
        if hotovo - nahlaseno >= 50:
            nahlaseno = hotovo
            log(f'  OCR {hotovo}/{len(obrazky_stran)} stran')

    pool = ThreadPoolExecutor(max_workers=VLAKEN_OCR)
    bezi: dict = {}
    try:
        for i, vyrob in obrazky_stran.items():
            bezi[pool.submit(prepisovac.prepis, vyrob(), dalsi_cteni.get(i, ''))] = i
            if len(bezi) >= 2 * VLAKEN_OCR:
                hotove, _ = wait(list(bezi), return_when=FIRST_COMPLETED)
                for b in hotove:
                    zapis(bezi.pop(b), b.result())
                uloz_davku()
        while bezi:
            hotove, _ = wait(list(bezi), return_when=FIRST_COMPLETED)
            for b in hotove:
                zapis(bezi.pop(b), b.result())
            uloz_davku()
        uloz_davku(vzdy=True)
    except BaseException as e:
        for b in bezi:
            b.cancel()
        # Zaplacené přepisy, které stihly doběhnout, se uloží — další pokus je platit nebude.
        cekat = 5 if isinstance(e, (KeyboardInterrupt, SystemExit)) else 30
        dobehle, _ = wait([b for b in bezi if not b.cancelled()], timeout=cekat)
        for b in dobehle:
            if not b.cancelled() and b.exception() is None:
                zapis(bezi[b], b.result())
        try:
            if k_ulozeni:
                ulozit(list(k_ulozeni))
        except Exception as e2:  # noqa: BLE001 — do logu jen typ
            log(f'  POZOR: rozpracované přepisy se nepodařilo uložit ({type(e2).__name__})')
        raise
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


@dataclass
class Prace:
    """Co rozklad dokumentu potřebuje kromě dat souboru."""
    prepisovac: Prepisovac | None
    hotove: dict[int, dict] = field(default_factory=dict)  # pdf_index → přepis z dřívějšího pokusu
    ulozit: Callable[[list[Strana]], None] = lambda strany: None
    kontrola: Callable[[], None] = lambda: None
    # Průběh pro knihovnu: (fáze, stran hotovo, stran celkem, OCR hotovo, OCR celkem).
    hlasit: Callable[[str, int, int, int, int], None] = lambda faze, hotovo, celkem, ocr_hotovo, ocr_celkem: None
    bez_ai: str | None = None   # proč AI neběží (účet Claude) — zpráva u dokumentu se skeny


def _pouzitelny_prepis(hotovy: dict | None) -> bool:
    """Přepis z dřívějška, který se použije znovu — nepovedený (prázdný a ke kontrole) se zkusí znovu."""
    return hotovy is not None and bool((hotovy.get('text') or '').strip() or not hotovy.get('ke_kontrole'))


def _prepis_skeny(prace: Prace, strany: list[Strana], ke_skenu: dict[int, Callable[[], bytes]],
                  vrstvy: dict[int, str]) -> int:
    """Strany ke skenu: hotové přepisy z dřívějšího pokusu použije, zbytek přepíše. Vrátí počet použitých."""
    zbyva: dict[int, Callable[[], bytes]] = {}
    pouzito = 0
    for i, vyrob in ke_skenu.items():
        hotovy = prace.hotove.get(strany[i].pdf_index)
        if _pouzitelny_prepis(hotovy):
            s = strany[i]
            s.text, s.okraje = hotovy.get('text') or '', hotovy.get('okraje') or ''
            s.ke_kontrole, s.duvod = bool(hotovy.get('ke_kontrole')), hotovy.get('kontrola_duvod')
            s.ocr_model = hotovy.get('ocr_model')
            pouzito += 1
        else:
            zbyva[i] = vyrob
    if pouzito:
        log(f'  {pouzito} stran přepsaných v dřívějším pokusu se použije znovu (bez placení)')
    if ke_skenu:
        # Hotové jsou strany s textovou vrstvou, přepisy z dřívějška a nově přepsané.
        celkem, zaklad, ke_prepisu = len(strany), len(strany) - len(ke_skenu) + pouzito, len(ke_skenu)
        prace.hlasit('prepis', zaklad, celkem, pouzito, ke_prepisu)
        postup = lambda hotovo: prace.hlasit('prepis', zaklad + hotovo, celkem, pouzito + hotovo, ke_prepisu)  # noqa: E731
    else:
        postup = None
    prepis_strany(prace.prepisovac, strany, zbyva, prace.ulozit, prace.kontrola,
                  {i: vrstvy[i] for i in zbyva if i in vrstvy}, postup, prace.bez_ai)
    return pouzito


def _tistena(strany: list[Strana], stitky: list[str | None] | None = None) -> None:
    kandidati = [kandidati_cisla(s.okraje, len(strany)) for s in strany]
    for s, (cislo, zdroj) in zip(strany, tistena_cisla(kandidati, stitky)):
        s.tistena, s.tistena_zdroj = cislo, zdroj


# --- rozklad podle typu souboru ----------------------------------------------

def _vrstva_staci(s: pdf_mod.StranaPdf) -> bool:
    """Stačí textová vrstva strany PDF, nebo se strana přepíše přes OCR?

    Sken (i s cizí OCR vrstvou) a vadná vrstva → OCR. Dost čistého textu →
    vrstva. Krátká strana: s velkým obrázkem nebo kresbou (text v obrázku) →
    OCR, jinak vrstva — titul, věnování nebo prázdná strana nic nestojí.
    """
    if s.sken_s_vrstvou or vada_vrstvy(s.text):
        return False
    if je_digitalni(s.text):
        return True
    return s.plocha_obrazku < 0.3 and s.tvaru < 100

def rozloz_pdf(data: bytes, prace: Prace) -> Vysledek:
    try:
        dokument = pdf_mod.otevri(data)
    except Exception:  # noqa: BLE001
        raise ChybaZpracovani('PDF nejde otevřít (je poškozené nebo zaheslované).') from None
    try:
        n = len(dokument)
        strany: list[Strana] = []
        ke_skenu: dict[int, Callable[[], bytes]] = {}
        vrstvy: dict[int, str] = {}
        for i in range(n):
            s = pdf_mod.text_strany(dokument, i)
            if _vrstva_staci(s):
                strany.append(Strana(s.pdf_index, s.text, 'vrstva', okraje=s.okraje))
            else:
                strany.append(Strana(s.pdf_index, '', 'ocr'))
                ke_skenu[i] = (lambda i=i: pdf_mod.obrazek_strany(dokument, i))
                if s.text.strip():
                    vrstvy[i] = s.text  # cizí OCR vrstva = další nezávislé čtení čísel
            if (i + 1) % 200 == 0:
                prace.kontrola()
                prace.hlasit('cteni', len(strany) - len(ke_skenu), n, 0, len(ke_skenu))
        log(f'  {n} stran: {n - len(ke_skenu)} s textovou vrstvou, {len(ke_skenu)} k přepisu')
        pouzito = _prepis_skeny(prace, strany, ke_skenu, vrstvy)
        _tistena(strany, pdf_mod.stitky(dokument))
        osnova = pdf_mod.osnova(dokument)
    finally:
        dokument.close()
    texty = [(s.pdf_index, s.text) for s in strany]
    # Okraje jen u textové vrstvy: v ní je živé záhlaví součástí textu strany,
    # přepis skenu ho má zvlášť (a nadpis kapitoly se stejným textem se nesmí vyřadit).
    okraje = {s.pdf_index: s.okraje for s in strany if s.zdroj == 'vrstva'}
    kapitoly = z_osnovy(osnova, n, texty, okraje) if osnova else []
    if not osnova_pouzitelna(kapitoly, n):
        kapitoly = z_nadpisu(texty, n, okraje)
    return Vysledek(strany, kapitoly, znovu_pouzito=pouzito)


def rozloz_djvu(data: bytes, prace: Prace) -> Vysledek:
    """DjVu je vždy sken: textová vrstva pochází z cizího OCR, proto se strany
    přepíšou a vrstva slouží jen jako další nezávislé čtení čísel."""
    if not (shutil.which('djvused') and shutil.which('djvutxt') and shutil.which('ddjvu')):
        raise ChybaZpracovani('DjVu: na serveru chybí nástroje djvulibre.')
    with tempfile.TemporaryDirectory() as slozka:
        cesta = os.path.join(slozka, 'kniha.djvu')
        with open(cesta, 'wb') as f:
            f.write(data)
        try:
            n = int(subprocess.run(['djvused', '-e', 'n', cesta], capture_output=True, check=True,
                                   timeout=120, env=ocr.prostredi_nastroju()).stdout.strip() or 0)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError):
            raise ChybaZpracovani('DjVu nejde otevřít (je poškozené).') from None

        def obrazek(cislo: int) -> bytes:
            tif = os.path.join(slozka, f's{cislo}.tif')
            subprocess.run(['ddjvu', '-format=tiff', f'-page={cislo}', '-size=1568x1568', cesta, tif],
                           capture_output=True, check=True, timeout=300, env=ocr.prostredi_nastroju())
            with open(tif, 'rb') as f:
                obsah = f.read()
            os.remove(tif)
            return obrazky.obrazek_na_jpeg(obsah)

        strany: list[Strana] = []
        ke_skenu: dict[int, Callable[[], bytes]] = {}
        vrstvy: dict[int, str] = {}
        for i in range(n):
            vrstva = subprocess.run(['djvutxt', f'--page={i + 1}', cesta], capture_output=True,
                                    timeout=120, env=ocr.prostredi_nastroju()).stdout.decode('utf-8', 'replace')
            strany.append(Strana(i + 1, '', 'ocr'))
            ke_skenu[i] = (lambda c=i + 1: obrazek(c))
            if vrstva.strip():
                vrstvy[i] = vrstva
        log(f'  DjVu {n} stran k přepisu ({len(vrstvy)} s vrstvou pro kontrolu čísel)')
        pouzito = _prepis_skeny(prace, strany, ke_skenu, vrstvy)
    _tistena(strany)
    return Vysledek(strany, z_nadpisu([(s.pdf_index, s.text) for s in strany], n), znovu_pouzito=pouzito)


def rozloz_obrazek(data: bytes, prace: Prace) -> Vysledek:
    """Obrázek strany; vícestránkový TIFF ze skeneru = víc stran."""
    try:
        snimku = obrazky.pocet_snimku(data)
    except Exception:  # noqa: BLE001
        raise ChybaZpracovani('Obrázek nejde otevřít (je poškozený nebo v nepodporovaném formátu).') from None
    strany = [Strana(i + 1, '', 'ocr') for i in range(snimku)]
    ke_skenu = {i: (lambda i=i: obrazky.obrazek_na_jpeg(data, i)) for i in range(snimku)}
    if snimku > 1:
        log(f'  obrázek má {snimku} stran')
    pouzito = _prepis_skeny(prace, strany, ke_skenu, {})
    if snimku > 1:
        _tistena(strany)
    return Vysledek(strany, z_nadpisu([(s.pdf_index, s.text) for s in strany], snimku), znovu_pouzito=pouzito)


def rozloz_casti(casti: list[str], varovani: list[str] | None = None) -> Vysledek:
    strany = [Strana(i + 1, t, 'soubor') for i, t in enumerate(casti)]
    kapitoly = z_nadpisu([(s.pdf_index, s.text) for s in strany], len(strany))
    return Vysledek(strany, kapitoly, varovani=list(varovani or []))


def rozloz(data: bytes, mime: str, prace: Prace) -> Vysledek:
    if mime == 'application/pdf':
        return rozloz_pdf(data, prace)
    if mime == 'image/vnd.djvu':
        return rozloz_djvu(data, prace)
    if mime in OBRAZKY:
        return rozloz_obrazek(data, prace)
    try:
        if mime in ('text/plain', 'text/markdown'):
            text = formaty.Text(formaty.dekoduj_text(data))
        elif mime == DOCX:
            text = formaty.docx_na_text(data)
        elif mime == 'application/epub+zip':
            text = formaty.epub_na_text(data)
        elif mime in ('text/csv', XLSX):
            casti, varovani = formaty.casti_tabulek(data, mime)
            return rozloz_casti(casti, varovani)
        else:
            raise ChybaZpracovani('Tento typ souboru zpracování neumí.')
    except formaty.ChybaFormatu as e:
        raise ChybaZpracovani(str(e)) from None
    except (zipfile.BadZipFile, KeyError, ElementTree.ParseError, ValueError) as e:
        raise ChybaZpracovani(f'Soubor nejde přečíst (je poškozený nebo v jiném formátu; {type(e).__name__}).') from None
    except Exception as e:  # noqa: BLE001 — knihovny formátů mají vlastní výjimky pro vadný soubor
        if type(e).__name__ in ('PackageNotFoundError', 'InvalidFileException', 'XMLSyntaxError'):
            raise ChybaZpracovani(f'Soubor nejde přečíst (je poškozený nebo v jiném formátu; {type(e).__name__}).') from None
        raise
    varovani = list(text.varovani)
    if text.obrazku and len(text.text) < 500 * text.obrazku:
        varovani.append(f'Dokument má {text.obrazku} obrázků a málo textu — text v obrázcích (třeba naskenované '
                        f'strany) se nepřepisuje; převeď dokument do PDF a nahraj ho znovu.')
    vysledek = rozloz_casti(formaty.na_casti(text.text), varovani)
    vysledek.obrazku = text.obrazku
    return vysledek


# --- zápis výsledku ------------------------------------------------------------

def _radek_strany(dokument_id: str, s: Strana, kapitola_id: str | None) -> dict:
    return {
        'dokument_id': dokument_id, 'pdf_index': s.pdf_index, 'tistena_strana': s.tistena, 'tistena_zdroj': s.tistena_zdroj,
        'zdroj_textu': s.zdroj, 'ocr_model': s.ocr_model, 'ocr_verze': ocr.OCR_VERZE if s.zdroj == 'ocr' else None,
        'text': _cisty(s.text), 'okraje': _cisty(s.okraje) or None, 'znaku': len(s.text),
        'ke_kontrole': s.ke_kontrole, 'kontrola_duvod': s.duvod, 'kapitola_id': kapitola_id, 'verze_zpracovani': VERZE,
    }


def _bez_okraju(s: Strana) -> str:
    """Text listu s vyprázdněnými řádky živého záhlaví a zápatí (jen textová vrstva —
    přepis skenu je má zvlášť)."""
    if s.zdroj != 'vrstva' or not s.okraje:
        return s.text
    radky = s.text.splitlines()
    pryc = okrajove_radky(radky, s.okraje)
    return '\n'.join('' if i in pryc else r for i, r in enumerate(radky))


def nacti_prepisy(supa: Supa, dokument_id: str, model: str) -> dict[int, dict]:
    """Přepisy skenů z dřívějšího pokusu (stejný model i verze promptu)."""
    try:
        radky = supa.vyber_vse('bible_strany', {
            'select': 'pdf_index,text,okraje,ke_kontrole,kontrola_duvod,ocr_model',
            'dokument_id': f'eq.{dokument_id}', 'zdroj_textu': 'eq.ocr',
            'ocr_model': f'eq.{model}', 'ocr_verze': f'eq.{ocr.OCR_VERZE}',
        }, razeni='pdf_index')
    except ChybaSupabase as e:
        log(f'  dřívější přepisy nejde načíst ({type(e).__name__}) — strany se přepíšou znovu')
        return {}
    return {int(r['pdf_index']): r for r in radky}


def uloz(supa: Supa, dok: dict, v: Vysledek) -> dict:
    id_ = str(dok['id'])
    jazyk_dokumentu = dok.get('jazyk')
    filtr = {'dokument_id': f'eq.{id_}'}
    for s in v.strany:
        s.text, s.okraje = _cisty(s.text), _cisty(s.okraje)
    # Pasáže bez živého záhlaví a zápatí (jinak by řádek „2 Rmutování 3" nahoře
    # listu protáhl pasáž předchozí kapitoly na další stranu). Řádky se jen
    # vyprázdní, ať sedí čísla řádků, na kterých začínají kapitoly.
    texty = [(s.pdf_index, _bez_okraju(s)) for s in v.strany]
    v.pasaze = rozdel_na_pasaze(useky(v.kapitoly, texty))
    kapitola_na_listu = kapitola_listu(v.kapitoly, texty)

    # Odvozená data minulého zpracování se nahradí (vzniknou znovu z originálu);
    # strany se přepíšou (upsert) — přepisy skenů v nich zůstanou stejné.
    supa.smaz('bible_pasaze', filtr)
    supa.smaz('bible_kapitoly', filtr)
    id_kapitol = [str(uuid.uuid4()) for _ in v.kapitoly]
    supa.vloz('bible_kapitoly', [{
        'id': id_kapitol[i], 'dokument_id': id_, 'rodic_id': id_kapitol[k.rodic] if k.rodic is not None else None,
        'poradi': k.poradi, 'uroven': k.uroven, 'cislo': k.cislo, 'nazev': _cisty(k.nazev)[:300],
        'strana_od': k.strana_od, 'strana_do': k.strana_do, 'zdroj': k.zdroj,
    } for i, k in enumerate(v.kapitoly)])
    supa.vloz_nebo_prepis('bible_strany', [
        _radek_strany(id_, s, id_kapitol[kapitola_na_listu[s.pdf_index]] if kapitola_na_listu.get(s.pdf_index) is not None else None)
        for s in v.strany], klic='dokument_id,pdf_index')
    supa.smaz('bible_strany', {**filtr, 'pdf_index': f'gt.{max((s.pdf_index for s in v.strany), default=0)}'})
    supa.vloz('bible_pasaze', [{
        'dokument_id': id_, 'kapitola_id': id_kapitol[p.kapitola] if p.kapitola is not None else None,
        'poradi': p.poradi, 'strana_od': p.strana_od, 'strana_do': p.strana_do, 'druh': p.druh, 'text': p.text,
        'jazyk': jazyk_dokumentu or odhad_jazyka(p.text), 'verze_zpracovani': VERZE,
    } for p in v.pasaze])

    postup = {
        'stran': len(v.strany),
        'digitalnich': sum(1 for s in v.strany if s.zdroj == 'vrstva'),
        'ocr': sum(1 for s in v.strany if s.zdroj == 'ocr'),
        'ocr_znovu_pouzito': v.znovu_pouzito,
        'ke_kontrole': sum(1 for s in v.strany if s.ke_kontrole),
        'bez_cisla_strany': sum(1 for s in v.strany if s.zdroj != 'soubor' and not s.tistena),
        'kapitol': len(v.kapitoly),
        'tabulek': sum(1 for p in v.pasaze if p.druh == 'tabulka'),
        'vzorcu': sum(1 for p in v.pasaze if p.druh == 'vzorec'),
        'pasazi': len(v.pasaze),
    }
    if v.obrazku:
        postup['obrazku'] = v.obrazku
    if v.varovani:
        postup['varovani'] = v.varovani
    return postup


def zapis_naklady(supa: Supa, ucet: naklady.Ucet, dokument_id: str | None) -> float:
    """Zapíše dosud nezapsanou útratu do ai_naklady; vrátí ji i tehdy, když zápis selže."""
    polozky = ucet.vynuluj()
    celkem = sum(p.cena for p in polozky.values())
    if not polozky:
        return 0.0
    try:
        supa.vloz('ai_naklady', [{
            'ucel': 'ocr', 'model': model, 'volani': p.volani, 'vstup_tokenu': p.vstup, 'vystup_tokenu': p.vystup,
            'cache_cteni_tokenu': p.cache_cteni, 'cache_zapis_tokenu': p.cache_zapis, 'cena_usd': round(p.cena, 6),
            'dokument_id': dokument_id, 'poznamka': VERZE if ucet.zdroj == 'api' else f'{VERZE} · předplatné Claude (bez útraty)',
        } for model, p in polozky.items()])
    except Exception as e:  # noqa: BLE001 — útrata se aspoň vypíše do logu
        log(f'  POZOR: náklady {celkem:.4f} USD se nepodařilo zapsat ({type(e).__name__})')
    log(f'  náklady AI: {celkem:.4f} USD')
    return celkem


def _hlidej_kapacitu(supa: Supa, v: Vysledek, limit_bajtu: int) -> None:
    db = kapacita_db(supa)
    if db is None:
        return
    odhad = BAJTU_NA_ZNAK * sum(len(s.text) for s in v.strany)
    if db + odhad > limit_bajtu:
        raise PlnaDatabaze(
            f'Čeká: databáze má {db / 1e6:.0f} MB a dokument by přidal asi {odhad / 1e6:.0f} MB — limit je '
            f'{limit_bajtu / 1e6:.0f} MB (Supabase Free přepne při 500 MB databázi bible jen pro čtení). '
            'Uvolni místo nebo zvyš limit_db_mb v nastavení bible.')


def zpracuj_dokument(supa: Supa, dok: dict, prepisovac: Prepisovac | None, ucet: naklady.Ucet,
                     limit_db_bajtu: int | None = None, bez_ai: str | None = None) -> float:
    """Zpracuje jeden dokument a zapíše jeho stav. Vrátí útratu za AI.

    Když se má celý běh zastavit (klíč, kredit, čas, plná DB, výpadek API),
    po zápisu stavu dokumentu a nákladů vyhodí příslušnou výjimku.
    """
    id_ = str(dok['id'])
    pokusy = int(dok.get('pokusy') or 1)
    mime = dok.get('soubor_mime') or ''
    log(f'Dokument {id_} ({mime if mime in POVOLENE_TYPY else "jiný typ"}, '
        f'{int(dok.get("soubor_velikost") or 0)} B, pokus {pokusy})')
    utraceno = 0.0
    posledni_naklady = time.time()
    konec_behu: BaseException | None = None
    filtr = {'id': f'eq.{id_}', 'stav': 'eq.zpracovava'}

    def nastav(zmena: dict) -> bool:
        """Zapíše stav, jen když dokument pořád zpracovává tenhle běh (pauzu ani smazání nepřepíše)."""
        try:
            return bool(supa.uprav('bible_dokumenty', filtr, zmena, vratit=True))
        except Exception as e:  # noqa: BLE001 — do logu jen typ chyby
            log(f'  POZOR: stav dokumentu se nepodařilo zapsat ({type(e).__name__})')
            return False

    def kontrola() -> None:
        nonlocal utraceno, posledni_naklady
        do = datetime.fromtimestamp(time.time() + ZAMEK_MINUT * 60, timezone.utc).isoformat()
        try:
            zmeneno = supa.uprav('bible_dokumenty', filtr, {'zamek_do': do}, vratit=True)
        except Exception as e:  # noqa: BLE001 — zámek má rezervu, zkusí se příště
            log(f'  prodloužení zámku se nepovedlo ({type(e).__name__})')
            zmeneno = None
        if zmeneno == []:
            raise DokumentZmenen('dokument mezitím smazán, pozastaven nebo vrácen do fronty')
        if time.time() - posledni_naklady > NAKLADY_KAZDYCH_S:
            utraceno += zapis_naklady(supa, ucet, id_)
            posledni_naklady = time.time()

    def ulozit_prepisy(strany: list[Strana]) -> None:
        supa.vloz_nebo_prepis('bible_strany', [_radek_strany(id_, s, None) for s in strany], klic='dokument_id,pdf_index')

    # Průběh pro knihovnu (procenta): do bible_dokumenty.postup.prubeh, vedle
    # počtů z dřívějšího zpracování. Konečný zápis níž prubeh nahradí počty.
    puvodni = dok.get('postup') if isinstance(dok.get('postup'), dict) else {}
    zaklad_postupu = {k: v for k, v in puvodni.items() if k != 'prubeh'}
    prubeh_stav = {'faze': None, 'cas': 0.0}

    def hlasit_prubeh(faze: str, hotovo: int, celkem: int, ocr_hotovo: int = 0, ocr_celkem: int = 0) -> None:
        """Zapíše průběh — nejvýš jednou za PRUBEH_KAZDYCH_S, při změně fáze hned. Chyba zápisu zpracování nezastaví."""
        ted = time.time()
        if faze == prubeh_stav['faze'] and ted - prubeh_stav['cas'] < PRUBEH_KAZDYCH_S:
            return
        prubeh_stav['faze'], prubeh_stav['cas'] = faze, ted
        prubeh = {'faze': faze, 'hotovo': max(0, int(hotovo)), 'celkem': max(0, int(celkem)),
                  'ocr_hotovo': max(0, int(ocr_hotovo)), 'ocr_celkem': max(0, int(ocr_celkem)),
                  'cas': datetime.now(timezone.utc).isoformat(timespec='seconds')}
        try:
            supa.uprav('bible_dokumenty', filtr, {'postup': {**zaklad_postupu, 'prubeh': prubeh}})
        except Exception as e:  # noqa: BLE001 — procenta jsou jen informace, zpracování běží dál
            log(f'  průběh se nepodařilo zapsat ({type(e).__name__})')

    try:
        m = _CESTA.match(dok.get('soubor_cesta') or '')
        if not m or m.group(1) != id_ or m.group(2) in ('.', '..'):
            raise ChybaZpracovani('Cesta k souboru v úložišti má nečekaný tvar — nahraj dokument znovu přes appku.')
        # Přepisy skenů z dřívějška (stejný model a verze) se znovu neplatí; bez AI
        # se nenačítají — kniha se skeny pak počká vždycky.
        hotove = nacti_prepisy(supa, id_, prepisovac.model) if prepisovac is not None else {}
        # Kniha, o které už víme, že má skeny (průběh dřívějšího pokusu nebo počty
        # dřívějšího zpracování) a nemá je všechny přepsané, potřebuje AI. Když
        # teď nejde (klíč, kredit, strop útraty), počká BEZ stažení — celá kniha
        # by se jinak každé 3 hodiny stahovala zbytečně (přenosy tarifu Free).
        # Účet se ověří jedním levným požadavkem za běh, dřív než se stahuje.
        drive = puvodni.get('prubeh') if isinstance(puvodni.get('prubeh'), dict) else {}
        skenu = int(max(_cislo(drive.get('ocr_celkem'), 0), _cislo(puvodni.get('ocr'), 0)))
        if skenu > sum(1 for h in hotove.values() if _pouzitelny_prepis(h)):
            try:
                if prepisovac is None:
                    raise ChybiKlic(bez_ai or ('Čeká: dokument má naskenované strany a chybí klíč Claude (ANTHROPIC_API_KEY v app_secrets hlavní appky) '
                    'i token předplatného (secret CLAUDE_CODE_OAUTH_TOKEN v GitHubu).'))
                prepisovac.over_ucet()
            except Odlozit:
                # Stejné počty, nový čas: knihovna pozná, že ji tenhle běh viděl
                # (jinak by psala, že na běh teprve čeká).
                hlasit_prubeh(str(drive.get('faze') or 'prepis'), int(_cislo(drive.get('hotovo'), 0)),
                              int(_cislo(drive.get('celkem'), 0)), int(_cislo(drive.get('ocr_hotovo'), 0)), skenu)
                raise
        hlasit_prubeh('stahovani', 0, 0)
        data = supa.stahni(BUCKET, dok['soubor_cesta'])
        if hashlib.sha256(data).hexdigest() != dok.get('soubor_sha256'):
            raise ChybaZpracovani('Soubor v úložišti se liší od nahraného (otisk SHA-256 nesedí).')
        hlasit_prubeh('cteni', 0, 0)
        vysledek = rozloz(data, mime, Prace(prepisovac, hotove, ulozit_prepisy, kontrola, hlasit_prubeh, bez_ai))
        if not any(s.text.strip() for s in vysledek.strany):
            raise ChybaZpracovani('Dokument neobsahuje žádný text' + (
                ' — jen obrázky; převeď ho do PDF a nahraj znovu.' if vysledek.obrazku else '.'))
        if limit_db_bajtu:
            _hlidej_kapacitu(supa, vysledek, limit_db_bajtu)
        kontrola()
        n_stran = len(vysledek.strany)
        hlasit_prubeh('ukladani', n_stran, n_stran, sum(1 for s in vysledek.strany if s.zdroj == 'ocr'),
                      sum(1 for s in vysledek.strany if s.zdroj == 'ocr'))
        postup = uloz(supa, dok, vysledek)
        ke_kontrole = postup['ke_kontrole']
        kvalita = None if not postup['ocr'] else round(1 - ke_kontrole / postup['ocr'], 3)
        zpravy = ([f'{ke_kontrole} stran ke kontrole (přepis skenu se neshoduje s kontrolním čtením nebo je nečitelný).']
                  if ke_kontrole else []) + vysledek.varovani
        if not nastav({
            'stav': 'ke_kontrole' if zpravy else 'hotovo',
            'stav_zprava': ' '.join(zpravy)[:500] or None,
            'postup': postup,
            'stran_celkem': postup['stran'],
            'kvalita_ocr': kvalita,
            'verze_zpracovani': VERZE,
            'zpracovano_at': datetime.now(timezone.utc).isoformat(),
            'zamek_do': None,
            'pokusy': 0,
        }):
            log('  dokument se mezitím změnil (pozastaven nebo smazán) — jeho stav zůstává')
        log(f'  hotovo: {postup["stran"]} stran, {postup["kapitol"]} kapitol, {postup["pasazi"]} pasáží, '
            f'{postup["ocr"]} přes OCR ({postup["ocr_znovu_pouzito"]} z dřívějška), {ke_kontrole} ke kontrole')
    except DokumentZmenen:
        log('  přerušeno: dokument byl během zpracování smazán, pozastaven nebo vrácen do fronty')
    except Odlozit as e:
        log(f'  odloženo ({type(e).__name__})')
        vratit = e.vratit_pokus
        nastav({'stav': 'ceka' if vratit or pokusy < 3 else 'chyba', 'zamek_do': None,
                'pokusy': max(0, pokusy - 1) if vratit else pokusy, 'stav_zprava': str(e)[:300]})
        if e.zastavit_beh:
            konec_behu = e
    except ChybaZpracovani as e:
        log(f'  chyba dokumentu ({type(e).__name__})')
        nastav({'stav': 'chyba', 'stav_zprava': str(e)[:300], 'zamek_do': None})
    except PrechodnaChyba as e:
        posledni = pokusy >= 3
        log(f'  dočasná chyba Anthropic{" — vzdávám po 3 pokusech" if posledni else " — zkusí se příštím během"}')
        nastav({'stav': 'chyba' if posledni else 'ceka', 'stav_zprava': str(e)[:300], 'zamek_do': None})
        konec_behu = e
    except (KeyboardInterrupt, SystemExit) as e:
        log('  přerušeno zvenku — dokument počká na další běh')
        nastav({'stav': 'ceka', 'zamek_do': None, 'pokusy': max(0, pokusy - 1),
                'stav_zprava': 'Čeká: běh zpracování byl přerušen, pokračuje se dalším během.'})
        konec_behu = e
    except Exception as e:  # noqa: BLE001 — neznámá chyba: zkusit znovu příštím během, po 3 pokusech „chyba"
        posledni = pokusy >= 3
        log(f'  neočekávaná chyba: {type(e).__name__}{" — vzdávám po 3 pokusech" if posledni else " — zkusí se znovu"}')
        nastav({'stav': 'chyba' if posledni else 'ceka', 'zamek_do': None,
                'stav_zprava': f'Zpracování selhalo ({type(e).__name__}: {" ".join(str(e).split())[:200]}).'})
    finally:
        utraceno += zapis_naklady(supa, ucet, id_)
    if konec_behu is not None:
        raise konec_behu
    return utraceno


MIGRACE = '20261101000000_bible_zaklad'


def _klient_api(klic: str):
    import anthropic

    return anthropic.Anthropic(api_key=klic, max_retries=5, timeout=180)


def vyber_prepisovac(klic: str | None, token: str | None, model: str, nastaveni: dict, ucet: naklady.Ucet,
                     konec: float | None, klient_api: Callable = _klient_api,
                     klient_predplatne: Callable = claude_cli.KlientClaudeCode):
    """Čím se budou přepisovat skeny: (Prepisovac nebo None, klient Claude Code k uklizení nebo None).

    API klíč (placený kredit) má přednost, protože neubírá z limitů předplatného.
    S tokenem předplatného se ale API bere, jen když teď opravdu jde (levné
    ověření účtu) — jinak, a bez klíče vůbec, přepis jede přes Claude Code
    s předplatným Claude (1. 11. 2026: „nechci to dělat přes kredit").
    """
    prepisovac = None
    if klic:
        prepisovac = Prepisovac(klient_api(klic), model, ucet, konec)
        if token:
            try:
                prepisovac.over_ucet()
            except (ZastavitBeh, PrerusenoStropem) as e:
                log(f'Přepis přes API teď nejde ({e.do_logu}) — pojede přes předplatné Claude.')
                prepisovac = None
    klient_cc = None
    if prepisovac is None and token:
        limit_stran = int(_cislo(nastaveni.get('max_stran_predplatne'), MAX_STRAN_PREDPLATNE))
        if limit_stran > 0:
            klient_cc = klient_predplatne(token)
            ucet.zdroj = 'predplatne'
            prepisovac = Prepisovac(klient_cc, model, ucet, konec, zdroj='predplatne', limit_stran=limit_stran)
            log(f'Přepis skenů přes předplatné Claude (Claude Code, model {model}), nejvýš {limit_stran} stran za běh; '
                f'{klient_cc.popis_tokenu() if hasattr(klient_cc, "popis_tokenu") else "token"}.')
        else:
            log('Přepis přes předplatné je vypnutý (max_stran_predplatne = 0).')
    if prepisovac is not None and not prepisovac.tesseract:
        log('Pozor: Tesseract chybí — přepisy skenů se nebudou křížově kontrolovat.')
    if prepisovac is None and not klic:
        log('Pozor: chybí ANTHROPIC_API_KEY (app_secrets hlavní appky) i CLAUDE_CODE_OAUTH_TOKEN — dokumenty se skeny počkají, ostatní se zpracují.')
    return prepisovac, klient_cc


def _beh() -> int:
    supa = Supa(os.environ.get('BIBLE_URL') or BIBLE_URL, os.environ.get('BIBLE_KLIC', ''))
    try:
        nastaveni = nacti_nastaveni(supa)
    except ChybaSupabase as e:
        if any(k in str(e) for k in ('PGRST205', '42P01')):
            log(f'Databáze bible ještě nemá tabulky: spusť migraci {MIGRACE} '
                '(appka → Systém → Databázové migrace → Databáze bible). Konec bez chyby.')
            return 0
        # Holé 404 bez kódu PostgRESTu = špatná adresa projektu, ne chybějící migrace.
        log(f'Databáze bible neodpovídá ({e}) — zkontroluj BIBLE_URL a BIBLE_KLIC.')
        return 1
    # Klíč Claude: v Actions ho přečte zvláštní krok z app_secrets hlavní appky
    # a předá jako ANTHROPIC_API_KEY (klíč service role hlavní appky se sem tak
    # vůbec nedostane). Jinak (ruční běh) z hlavní appky přes HLAVNI_URL/KLIC.
    klic = os.environ.get('ANTHROPIC_API_KEY') or None
    if klic and os.environ.get('GITHUB_ACTIONS') == 'true':
        print(f'::add-mask::{klic}', flush=True)
    hlavni_url, hlavni_klic = os.environ.get('HLAVNI_URL', ''), os.environ.get('HLAVNI_KLIC', '')
    if not klic and hlavni_url and hlavni_klic:
        try:
            klic = nacti_klic_anthropic(Supa(hlavni_url, hlavni_klic))
        except ChybaSupabase as e:
            log(f'Klíč Anthropic z hlavní appky se nepodařilo přečíst ({e}).')
    cenik = nastaveni.get('cenik_usd_za_mtok') or {}
    strop_behu = _cislo(os.environ.get('LIMIT_USD'), _cislo(nastaveni.get('strop_zpracovani_usd'), 5.0))
    zbyva_mesic = _cislo(nastaveni.get('strop_mesic_usd'), 20.0) - utraceno_tento_mesic(supa)
    ucet = naklady.Ucet(cenik=cenik, strop_usd=max(0.0, min(strop_behu, zbyva_mesic)))
    limit_db = _cislo(nastaveni.get('limit_db_mb'), LIMIT_DB_MB)
    limit_db_bajtu = int(limit_db * 1_000_000) if limit_db > 0 else None
    konec = time.time() + _cislo(os.environ.get('LIMIT_MINUT'), 300.0) * 60
    log(f'Zpracování knih {VERZE}: strop běhu {ucet.strop_usd:.2f} USD (měsíc zbývá {max(0.0, zbyva_mesic):.2f} USD)')

    # Token předplatného Claude (secret CLAUDE_CODE_OAUTH_TOKEN, z „claude setup-token"):
    # přepis přes Claude Code bez API kreditu (claude_cli.py, 1. 11. 2026).
    token = os.environ.get('CLAUDE_CODE_OAUTH_TOKEN') or None
    if token and os.environ.get('GITHUB_ACTIONS') == 'true':
        print(f'::add-mask::{token}', flush=True)
    model = str(nastaveni.get('model_ocr') or 'claude-haiku-5-5')
    if klic:
        try:
            naklady.cena_usd(model, {}, cenik)
        except naklady.ChybiCenik:
            log('Model z model_ocr nemá v bible_nastaveni ceník (cenik_usd_za_mtok) — náklady by nešly evidovat. Konec.')
            return 1
    prepisovac, klient_cc = vyber_prepisovac(klic, token, model, nastaveni, ucet, konec)
    try:
        return _fronta(supa, prepisovac, ucet, konec, limit_db_bajtu)
    finally:
        if klient_cc is not None:
            klient_cc.zavri()


def _fronta(supa: Supa, prepisovac: Prepisovac | None, ucet: naklady.Ucet, konec: float,
            limit_db_bajtu: int | None) -> int:
    """Projde frontu dokumentů (bible_vezmi_dokument) do časového limitu běhu."""
    jen = os.environ.get('DOKUMENT') or None
    max_dokumentu = int(_cislo(os.environ.get('MAX_DOKUMENTU'), 50))
    vynechat: list[str] = []
    zpracovano = 0
    bez_ai: str | None = None
    chyba_uctu: ZastavitBeh | None = None
    while time.time() < konec and zpracovano < max_dokumentu:
        if limit_db_bajtu:
            db = kapacita_db(supa)
            if db is not None and db > limit_db_bajtu:
                log(f'Databáze má {db / 1e6:.0f} MB, limit je {limit_db_bajtu / 1e6:.0f} MB — další dokumenty počkají.')
                return 1
        # Dokument zkoušený v tomhle běhu se znovu nebere (přechodná chyba nespálí všechny pokusy naráz).
        vzate = supa.rpc('bible_vezmi_dokument', {'p_minut': ZAMEK_MINUT, 'p_id': jen, 'p_vynechat': vynechat})
        if not vzate:
            log('Žádný další dokument nečeká.' if zpracovano else 'Žádný dokument nečeká na zpracování.')
            break
        dok = vzate[0]
        vynechat.append(str(dok['id']))
        try:
            zpracuj_dokument(supa, dok, prepisovac, ucet, limit_db_bajtu, bez_ai)
        except ZastavitBeh as e:
            # Účet Claude (klíč, kredit, limit útraty, model, počet požadavků):
            # knihy se skeny počkají, zbytek fronty se zpracuje bez AI — digitální
            # knihy Claude nepotřebují (31. 10. 2026: 2 skenované strany z 327
            # zastavily celý běh i druhou knihu). Běh pak skončí chybou, ať je
            # problém s účtem vidět.
            chyba_uctu = e
            if prepisovac is None:
                log(f'Běh ukončen: {e.do_logu}')
                return 1
            prepisovac, bez_ai = None, str(e)
            log(f'AI vypnutá pro zbytek běhu ({e.do_logu}) — dokumenty bez skenů se zpracují dál.')
            continue
        except Odlozit as e:
            log(f'Běh ukončen: {e.do_logu}')
            return 1 if isinstance(e, PlnaDatabaze) else 0
        except PrechodnaChyba as e:
            log(f'Běh ukončen: {e}')
            return 0
        zpracovano += 1
        if jen:
            break
    log(f'Konec: zpracováno {zpracovano} dokumentů, utraceno {ucet.utraceno:.4f} USD.')
    if chyba_uctu is not None:
        log(f'Pozor: {chyba_uctu.do_logu}')
        return 1
    return 0


def _preruseni(_cislo_signalu, _ramec) -> None:
    # SIGTERM (zrušení jobu) jako Ctrl+C: doběhnou bloky finally, zapíše se stav a útrata.
    raise KeyboardInterrupt


def main() -> int:
    # Do veřejného logu nesmí nic, co by neslo obsah knihy: varování knihoven
    # (openpyxl vypíše souřadnici a hodnotu buňky) ani traceback se zprávou výjimky.
    warnings.simplefilter('ignore')
    logging.disable(logging.CRITICAL)
    sys.excepthook = lambda typ, _hodnota, _tb: print(f'Neošetřená chyba: {typ.__name__}', file=sys.stderr, flush=True)
    threading.excepthook = lambda a: print(f'Neošetřená chyba ve vlákně: {a.exc_type.__name__}', file=sys.stderr, flush=True)
    signal.signal(signal.SIGTERM, _preruseni)
    try:
        return _beh()
    except (KeyboardInterrupt, SystemExit):
        log('Běh přerušen zvenku.')
        return 1
    except BaseException as e:  # noqa: BLE001 — jen typ, žádný traceback
        log(f'Běh spadl: {type(e).__name__}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
