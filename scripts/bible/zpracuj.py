#!/usr/bin/env python3
"""Worker Pivovarské bible: zpracuje nahrané knihy (spouští GitHub Actions).

Pro každý čekající dokument (fronta bible_vezmi_dokument):
  1. stáhne originál ze soukromého bucketu a ověří SHA-256,
  2. rozloží ho na strany — u PDF textová vrstva, skeny přepíše Claude Haiku
     a čísla v přepisu ověří Tesseract (nesedí → strana „ke kontrole"),
  3. určí tištěná čísla stran (jen s jistotou), kapitoly a pasáže,
  4. zapíše strany, kapitoly a pasáže, stav a počty, náklady na AI.

PROMĚNNÉ: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY; volitelně DOKUMENT (id),
LIMIT_USD (strop běhu), LIMIT_MINUT, MAX_DOKUMENTU.

BEZPEČNOST: repo i logy Actions jsou veřejné. Do logu jde jen ID dokumentu,
počty a stavy — nikdy text, název ani jiný obsah knihy. Klíč Anthropic se
čte z app_secrets a hned maskuje.
"""
from __future__ import annotations

import hashlib
import io
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, as_completed, wait
from dataclasses import dataclass, field
from datetime import datetime, timezone

import formaty
import naklady
import ocr
import pdf as pdf_mod
from jazyk import odhad_jazyka
from kapitoly import Kapitola, kapitola_strany, z_nadpisu, z_osnovy
from pasaze import rozdel_na_pasaze
from stranky import je_digitalni, kandidati_cisla, tistena_cisla
from supa import ChybaSupabase, Supa

VERZE = 'zpracovani-1'
BUCKET = 'knihovna'
ZAMEK_MINUT = 120
VLAKEN_OCR = 4
OBRAZKY = {'image/jpeg', 'image/png', 'image/webp', 'image/tiff'}


class ChybaZpracovani(RuntimeError):
    """Chyba dokumentu, kterou má vidět uživatel (česky, bez obsahu knihy)."""


class PrerusenoStropem(RuntimeError):
    """Došel strop útraty — dokument počká na další běh, není to jeho chyba."""


class ZastavitBeh(RuntimeError):
    """Chyba, kvůli které by selhaly všechny dokumenty (klíč, kredit) — běh končí."""


def chyba_api(e: BaseException) -> BaseException | None:
    """Trvalá chyba Anthropic API → srozumitelná výjimka; dočasnou (síť, 429, 5xx) nechá být.

    Zprávy API obsah knih neobsahují; přesto se do databáze bere jen jejich začátek.
    """
    status = getattr(e, 'status_code', None)
    zprava = str(getattr(e, 'message', '') or e)[:200]
    if status in (401, 403):
        return ZastavitBeh(f'Anthropic odmítl klíč (HTTP {status}) — zkontroluj ANTHROPIC_API_KEY v app_secrets.')
    if status == 400 and 'credit' in zprava.lower():
        return ZastavitBeh('Na účtu Anthropic došel kredit — dobij ho a pusť zpracování znovu.')
    if status in (400, 404, 413):
        return ChybaZpracovani(f'Anthropic požadavek odmítl (HTTP {status}): {zprava}')
    return None


def log(zprava: str) -> None:
    print(zprava, flush=True)


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


# --- nastavení a klíč --------------------------------------------------------

def nacti_nastaveni(supa: Supa) -> dict:
    radky = supa.vyber('bible_nastaveni', {'select': 'klic,hodnota'})
    return {r['klic']: r['hodnota'] for r in radky}


def nacti_klic_anthropic(supa: Supa) -> str | None:
    radky = supa.vyber('app_secrets', {'select': 'value', 'key': 'eq.ANTHROPIC_API_KEY'})
    klic = (radky[0].get('value') if radky else None) or None
    if klic:
        # GitHub od teď klíč v logu nahradí hvězdičkami (řádek příkazu se nezobrazuje).
        print(f'::add-mask::{klic}', flush=True)
    return klic


def utraceno_tento_mesic(supa: Supa) -> float:
    zacatek = datetime.now(timezone.utc).strftime('%Y-%m-01T00:00:00Z')
    radky = supa.vyber('ai_naklady', {'select': 'cena_usd', 'cas': f'gte.{zacatek}'})
    return sum(float(r.get('cena_usd') or 0) for r in radky)


# --- OCR skenů ----------------------------------------------------------------

class Prepisovac:
    """Přepis skenů přes Claude s kontrolou Tesseractem; hlídá strop útraty."""

    def __init__(self, klient, model: str, ucet: naklady.Ucet):
        self.klient = klient
        self.model = model
        self.ucet = ucet
        self.zamek = threading.Lock()
        self.tesseract = ocr.tesseract_k_dispozici()

    def prepis(self, obrazek: bytes) -> ocr.Prepis:
        with self.zamek:
            if self.ucet.prekroceno():
                raise PrerusenoStropem('strop útraty')
        vysledek = ocr.prepis_stranky(self.klient, obrazek, self.model)
        with self.zamek:
            self.ucet.pridej(self.model, vysledek.usage)
        if self.tesseract and not vysledek.ke_kontrole:
            sedi, duvod = ocr.kontrola_cisel(vysledek.text, ocr.precti_tesseractem(obrazek))
            if not sedi:
                vysledek.ke_kontrole, vysledek.duvod = True, duvod
        return vysledek


def prepis_strany(prepisovac: Prepisovac | None, strany: list[Strana], obrazky: dict[int, callable],
                  prodluz_zamek: callable) -> None:
    """Přepíše strany ze `obrazky` (index v `strany` → funkce vracející JPEG).

    Obrázky se vykreslují v hlavním vlákně (PDFium není vláknově bezpečné),
    souběžně běží jen volání API a Tesseract — nejvýš 2× tolik, kolik je vláken.
    """
    if not obrazky:
        return
    if prepisovac is None:
        raise ChybaZpracovani('Dokument má naskenované strany a v app_secrets chybí ANTHROPIC_API_KEY.')
    hotovo = 0

    def zapis(i: int, p: ocr.Prepis) -> None:
        nonlocal hotovo
        s = strany[i]
        s.text = p.text
        s.okraje = f'{p.zahlavi}\n{p.zapati}'
        if p.tistena_strana and p.tistena_strana.isdigit():
            s.okraje = f'{s.okraje}\n{p.tistena_strana}'
        s.ocr_model = prepisovac.model
        s.ke_kontrole, s.duvod = p.ke_kontrole, p.duvod
        hotovo += 1
        if hotovo % 25 == 0:
            prodluz_zamek()
            log(f'  OCR {hotovo}/{len(obrazky)} stran')

    with ThreadPoolExecutor(max_workers=VLAKEN_OCR) as pool:
        bezi: dict = {}
        try:
            for i, vyrob in obrazky.items():
                bezi[pool.submit(prepisovac.prepis, vyrob())] = i
                if len(bezi) >= 2 * VLAKEN_OCR:
                    hotove, _ = wait(list(bezi), return_when=FIRST_COMPLETED)
                    for b in hotove:
                        zapis(bezi.pop(b), b.result())
            for b in as_completed(list(bezi)):
                zapis(bezi.pop(b), b.result())
        except BaseException:
            for b in bezi:
                b.cancel()
            raise


# --- rozklad podle typu souboru ----------------------------------------------

def rozloz_pdf(data: bytes, prepisovac: Prepisovac | None, prodluz_zamek) -> Vysledek:
    try:
        dokument = pdf_mod.otevri(data)
    except Exception as e:  # noqa: BLE001
        raise ChybaZpracovani('PDF nejde otevřít (je poškozené nebo zaheslované).') from e
    try:
        n = len(dokument)
        strany: list[Strana] = []
        ke_skenu: dict[int, callable] = {}
        for i in range(n):
            s = pdf_mod.text_strany(dokument, i)
            if je_digitalni(s.text):
                strany.append(Strana(s.pdf_index, s.text, 'vrstva', okraje=s.okraje))
            else:
                strany.append(Strana(s.pdf_index, '', 'ocr'))
                ke_skenu[i] = (lambda i=i: pdf_mod.obrazek_strany(dokument, i))
        log(f'  {n} stran: {n - len(ke_skenu)} s textovou vrstvou, {len(ke_skenu)} k přepisu')
        prepis_strany(prepisovac, strany, ke_skenu, prodluz_zamek)
        kandidati = [kandidati_cisla(s.okraje, n) for s in strany]
        for s, (cislo, zdroj) in zip(strany, tistena_cisla(kandidati, pdf_mod.stitky(dokument))):
            s.tistena, s.tistena_zdroj = cislo, zdroj
        osnova = pdf_mod.osnova(dokument)
    finally:
        dokument.close()
    kapitoly = z_osnovy(osnova, n) if osnova else z_nadpisu([(s.pdf_index, s.text) for s in strany], n)
    return Vysledek(strany, kapitoly)


def rozloz_casti(casti: list[str]) -> Vysledek:
    strany = [Strana(i + 1, t, 'soubor') for i, t in enumerate(casti)]
    kapitoly = z_nadpisu([(s.pdf_index, s.text) for s in strany], len(strany))
    return Vysledek(strany, kapitoly)


def obrazek_na_jpeg(data: bytes) -> bytes:
    from PIL import Image

    obr = Image.open(io.BytesIO(data))
    obr.seek(0)
    obr = obr.convert('L')
    obr.thumbnail((pdf_mod.MAX_HRANA, pdf_mod.MAX_HRANA))
    vystup = io.BytesIO()
    obr.save(vystup, format='JPEG', quality=85, optimize=True)
    return vystup.getvalue()


def rozloz_djvu(data: bytes, prepisovac: Prepisovac | None, prodluz_zamek) -> Vysledek:
    if not (shutil.which('djvused') and shutil.which('djvutxt') and shutil.which('ddjvu')):
        raise ChybaZpracovani('DjVu: na serveru chybí nástroje djvulibre.')
    slozka = tempfile.mkdtemp()
    cesta = os.path.join(slozka, 'kniha.djvu')
    with open(cesta, 'wb') as f:
        f.write(data)
    n = int(subprocess.run(['djvused', '-e', 'n', cesta], capture_output=True, check=True, timeout=120).stdout.strip() or 0)
    strany: list[Strana] = []
    ke_skenu: dict[int, callable] = {}

    def obrazek(cislo: int) -> bytes:
        tif = os.path.join(slozka, f's{cislo}.tif')
        subprocess.run(['ddjvu', '-format=tiff', f'-page={cislo}', '-size=1568x1568', cesta, tif],
                       capture_output=True, check=True, timeout=300)
        with open(tif, 'rb') as f:
            obsah = f.read()
        os.remove(tif)
        return obrazek_na_jpeg(obsah)

    for i in range(n):
        text = subprocess.run(['djvutxt', f'--page={i + 1}', cesta], capture_output=True, timeout=120).stdout.decode('utf-8', 'ignore')
        if je_digitalni(text):
            radky = [r for r in text.splitlines() if r.strip()]
            strany.append(Strana(i + 1, text.strip(), 'vrstva', okraje='\n'.join(radky[:2] + radky[-2:])))
        else:
            strany.append(Strana(i + 1, '', 'ocr'))
            ke_skenu[i] = (lambda c=i + 1: obrazek(c))
    log(f'  DjVu {n} stran: {n - len(ke_skenu)} s textovou vrstvou, {len(ke_skenu)} k přepisu')
    prepis_strany(prepisovac, strany, ke_skenu, prodluz_zamek)
    kandidati = [kandidati_cisla(s.okraje, n) for s in strany]
    for s, (cislo, zdroj) in zip(strany, tistena_cisla(kandidati)):
        s.tistena, s.tistena_zdroj = cislo, zdroj
    shutil.rmtree(slozka, ignore_errors=True)
    return Vysledek(strany, z_nadpisu([(s.pdf_index, s.text) for s in strany], n))


def rozloz(data: bytes, mime: str, prepisovac: Prepisovac | None, prodluz_zamek) -> Vysledek:
    if mime == 'application/pdf':
        return rozloz_pdf(data, prepisovac, prodluz_zamek)
    if mime == 'image/vnd.djvu':
        return rozloz_djvu(data, prepisovac, prodluz_zamek)
    if mime in ('text/plain', 'text/markdown'):
        return rozloz_casti(formaty.na_casti(formaty.dekoduj_text(data)))
    if mime == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return rozloz_casti(formaty.na_casti(formaty.docx_na_text(data)))
    if mime == 'application/epub+zip':
        return rozloz_casti(formaty.na_casti(formaty.epub_na_text(data)))
    if mime in ('text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'):
        return rozloz_casti(formaty.tabulky_na_casti(data, mime))
    if mime in OBRAZKY:
        strany = [Strana(1, '', 'ocr')]
        prepis_strany(prepisovac, strany, {0: lambda: obrazek_na_jpeg(data)}, prodluz_zamek)
        return Vysledek(strany, [])
    raise ChybaZpracovani(f'Typ souboru {mime} zpracování neumí.')


# --- zápis výsledku ------------------------------------------------------------

def uloz(supa: Supa, dok: dict, v: Vysledek) -> dict:
    import uuid

    id_ = dok['id']
    jazyk_dokumentu = dok.get('jazyk')
    filtr = {'dokument_id': f'eq.{id_}'}
    # Odvozená data z minulého zpracování se nahradí (vzniknou znovu z originálu).
    supa.smaz('bible_pasaze', filtr)
    supa.smaz('bible_strany', filtr)
    supa.smaz('bible_kapitoly', filtr)

    id_kapitol = [str(uuid.uuid4()) for _ in v.kapitoly]
    supa.vloz('bible_kapitoly', [{
        'id': id_kapitol[i], 'dokument_id': id_, 'rodic_id': id_kapitol[k.rodic] if k.rodic is not None else None,
        'poradi': k.poradi, 'uroven': k.uroven, 'cislo': k.cislo, 'nazev': k.nazev,
        'strana_od': k.strana_od, 'strana_do': k.strana_do, 'zdroj': k.zdroj,
    } for i, k in enumerate(v.kapitoly)])

    kapitola_listu = {s.pdf_index: kapitola_strany(v.kapitoly, s.pdf_index) for s in v.strany}
    supa.vloz('bible_strany', [{
        'dokument_id': id_, 'pdf_index': s.pdf_index, 'tistena_strana': s.tistena, 'tistena_zdroj': s.tistena_zdroj,
        'zdroj_textu': s.zdroj, 'ocr_model': s.ocr_model, 'text': s.text, 'znaku': len(s.text),
        'ke_kontrole': s.ke_kontrole, 'kontrola_duvod': s.duvod,
        'kapitola_id': id_kapitol[kapitola_listu[s.pdf_index]] if kapitola_listu[s.pdf_index] is not None else None,
        'verze_zpracovani': VERZE,
    } for s in v.strany], davka=100)

    v.pasaze = rozdel_na_pasaze([(s.pdf_index, s.text, kapitola_listu[s.pdf_index]) for s in v.strany])
    supa.vloz('bible_pasaze', [{
        'dokument_id': id_, 'kapitola_id': id_kapitol[p.kapitola] if p.kapitola is not None else None,
        'poradi': p.poradi, 'strana_od': p.strana_od, 'strana_do': p.strana_do, 'druh': p.druh, 'text': p.text,
        'jazyk': jazyk_dokumentu or odhad_jazyka(p.text), 'verze_zpracovani': VERZE,
    } for p in v.pasaze])

    ocr_stran = sum(1 for s in v.strany if s.zdroj == 'ocr')
    ke_kontrole = sum(1 for s in v.strany if s.ke_kontrole)
    return {
        'stran': len(v.strany),
        'digitalnich': sum(1 for s in v.strany if s.zdroj == 'vrstva'),
        'ocr': ocr_stran,
        'ke_kontrole': ke_kontrole,
        'bez_cisla_strany': sum(1 for s in v.strany if s.zdroj != 'soubor' and not s.tistena),
        'kapitol': len(v.kapitoly),
        'tabulek': sum(1 for p in v.pasaze if p.druh == 'tabulka'),
        'vzorcu': sum(1 for p in v.pasaze if p.druh == 'vzorec'),
        'pasazi': len(v.pasaze),
    }


def zapis_naklady(supa: Supa, ucet: naklady.Ucet, dokument_id: str | None) -> float:
    """Zapíše útratu dokumentu do ai_naklady; vrátí ji i tehdy, když zápis selže."""
    polozky = ucet.vynuluj()
    celkem = sum(p.cena for p in polozky.values())
    if not polozky:
        return 0.0
    try:
        supa.vloz('ai_naklady', [{
            'ucel': 'ocr', 'model': model, 'volani': p.volani, 'vstup_tokenu': p.vstup, 'vystup_tokenu': p.vystup,
            'cache_cteni_tokenu': p.cache_cteni, 'cache_zapis_tokenu': p.cache_zapis, 'cena_usd': round(p.cena, 6),
            'dokument_id': dokument_id, 'poznamka': VERZE,
        } for model, p in polozky.items()])
    except Exception as e:  # noqa: BLE001 — útrata se aspoň vypíše do logu
        log(f'  POZOR: náklady {celkem:.4f} USD se nepodařilo zapsat ({type(e).__name__})')
    log(f'  náklady AI: {celkem:.4f} USD')
    return celkem


def zpracuj_dokument(supa: Supa, dok: dict, prepisovac: Prepisovac | None, ucet: naklady.Ucet) -> float:
    id_ = dok['id']
    filtr = {'id': f'eq.{id_}'}
    log(f'Dokument {id_} ({dok.get("soubor_mime")}, {dok.get("soubor_velikost")} B, pokus {dok.get("pokusy")})')

    def prodluz_zamek() -> None:
        do = datetime.fromtimestamp(time.time() + ZAMEK_MINUT * 60, timezone.utc).isoformat()
        supa.uprav('bible_dokumenty', filtr, {'zamek_do': do})

    try:
        data = supa.stahni(BUCKET, dok['soubor_cesta'])
        if hashlib.sha256(data).hexdigest() != dok['soubor_sha256']:
            raise ChybaZpracovani('Soubor v úložišti se liší od nahraného (otisk SHA-256 nesedí).')
        vysledek = rozloz(data, dok.get('soubor_mime') or '', prepisovac, prodluz_zamek)
        postup = uloz(supa, dok, vysledek)
        ke_kontrole = postup['ke_kontrole']
        kvalita = None if not postup['ocr'] else round(1 - ke_kontrole / postup['ocr'], 3)
        supa.uprav('bible_dokumenty', filtr, {
            'stav': 'ke_kontrole' if ke_kontrole else 'hotovo',
            'stav_zprava': f'{ke_kontrole} stran ke kontrole (přepis skenu se neshoduje s kontrolním čtením nebo je nečitelný).' if ke_kontrole else None,
            'postup': postup,
            'stran_celkem': postup['stran'],
            'kvalita_ocr': kvalita,
            'verze_zpracovani': VERZE,
            'zpracovano_at': datetime.now(timezone.utc).isoformat(),
            'zamek_do': None,
        })
        log(f'  hotovo: {postup["stran"]} stran, {postup["kapitol"]} kapitol, {postup["pasazi"]} pasáží, '
            f'{postup["ocr"]} přes OCR, {ke_kontrole} ke kontrole')
    except PrerusenoStropem:
        log('  přerušeno: došel strop útraty — dokument počká na další běh')
        supa.uprav('bible_dokumenty', filtr, {'stav': 'ceka', 'zamek_do': None, 'pokusy': max(0, int(dok.get('pokusy') or 1) - 1),
                                              'stav_zprava': 'Čeká: došel strop útraty za AI, pokračuje se dalším během.'})
    except ChybaZpracovani as e:
        log(f'  chyba dokumentu: {type(e).__name__}')
        supa.uprav('bible_dokumenty', filtr, {'stav': 'chyba', 'stav_zprava': str(e)[:300], 'zamek_do': None})
    except Exception as e:  # noqa: BLE001 — neznámá chyba: zkusit znovu, po 3 pokusech „chyba"
        prevedena = chyba_api(e)
        if isinstance(prevedena, ZastavitBeh):
            # Dokument za nic nemůže: vrátit do fronty a skončit celý běh.
            supa.uprav('bible_dokumenty', filtr, {'stav': 'ceka', 'zamek_do': None, 'stav_zprava': str(prevedena),
                                                  'pokusy': max(0, int(dok.get('pokusy') or 1) - 1)})
            raise prevedena from None
        if isinstance(prevedena, ChybaZpracovani):
            log('  chyba dokumentu: požadavek na Anthropic odmítnut')
            supa.uprav('bible_dokumenty', filtr, {'stav': 'chyba', 'stav_zprava': str(prevedena)[:300], 'zamek_do': None})
        else:
            posledni = int(dok.get('pokusy') or 1) >= 3
            log(f'  neočekávaná chyba: {type(e).__name__}{" — vzdávám po 3 pokusech" if posledni else " — zkusí se znovu"}')
            supa.uprav('bible_dokumenty', filtr, {
                'stav': 'chyba' if posledni else 'ceka',
                'stav_zprava': f'Zpracování selhalo ({type(e).__name__}: {str(e)[:200]}).',
                'zamek_do': None,
            })
    finally:
        utraceno = zapis_naklady(supa, ucet, id_)
    return utraceno


MIGRACE = '20261231420000_pivovarska_bible_zpracovani'


def main() -> int:
    supa = Supa(os.environ.get('SUPABASE_URL', ''), os.environ.get('SUPABASE_SERVICE_ROLE_KEY', ''))
    try:
        nastaveni = nacti_nastaveni(supa)
    except ChybaSupabase as e:
        if any(k in str(e) for k in ('PGRST205', '42P01', 'HTTP 404')):
            log(f'Tabulky zpracování v databázi ještě nejsou: spusť migraci {MIGRACE} '
                '(appka → Systém → Databázové migrace). Konec bez chyby.')
            return 0
        raise
    klic = nacti_klic_anthropic(supa)
    cenik = nastaveni.get('cenik_usd_za_mtok') or {}
    strop_behu = float(os.environ.get('LIMIT_USD') or nastaveni.get('strop_zpracovani_usd') or 5)
    zbyva_mesic = float(nastaveni.get('strop_mesic_usd') or 20) - utraceno_tento_mesic(supa)
    ucet = naklady.Ucet(cenik=cenik, strop_usd=max(0.0, min(strop_behu, zbyva_mesic)))
    log(f'Zpracování knih {VERZE}: strop běhu {ucet.strop_usd:.2f} USD (měsíc zbývá {zbyva_mesic:.2f} USD)')

    prepisovac = None
    if klic:
        import anthropic

        model = str(nastaveni.get('model_ocr') or 'claude-haiku-5-5')
        naklady.cena_usd(model, {}, cenik)  # model bez ceníku = chyba hned na začátku
        prepisovac = Prepisovac(anthropic.Anthropic(api_key=klic, max_retries=5, timeout=180), model, ucet)
        if not prepisovac.tesseract:
            log('Pozor: Tesseract chybí — přepisy skenů se nebudou křížově kontrolovat.')
    else:
        log('Pozor: chybí ANTHROPIC_API_KEY — dokumenty se skeny skončí chybou.')

    jen = os.environ.get('DOKUMENT') or None
    konec = time.time() + float(os.environ.get('LIMIT_MINUT') or 300) * 60
    max_dokumentu = int(os.environ.get('MAX_DOKUMENTU') or 50)
    zpracovano = 0
    try:
        while time.time() < konec and zpracovano < max_dokumentu:
            if ucet.prekroceno():
                log('Strop útraty dosažen — další dokumenty počkají na příští běh.')
                break
            vzate = supa.rpc('bible_vezmi_dokument', {'p_minut': ZAMEK_MINUT, 'p_id': jen})
            if not vzate:
                log('Žádný další dokument nečeká.' if zpracovano else 'Žádný dokument nečeká na zpracování.')
                break
            utraceno = zpracuj_dokument(supa, vzate[0], prepisovac, ucet)
            ucet.strop_usd = max(0.0, ucet.strop_usd - utraceno)
            zpracovano += 1
            if jen:
                break
    except ZastavitBeh as e:
        log(f'Běh zastaven: {e}')
        return 1
    log(f'Konec: zpracováno {zpracovano} dokumentů.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
