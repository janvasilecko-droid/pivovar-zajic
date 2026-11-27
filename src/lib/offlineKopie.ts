// 📴 Kopie provozních tabulek v telefonu — stahování na pozadí.
// ---------------------------------------------------------------------------
// Majitel 27. 11. 2026: „furt to nefunguje offline, offline si to má držet aspoň objednávky na daný týden,
// závozy, stáčení, sklad aktuální, vše z daného týdne."
//
// Dřív telefon držel jen odpovědi na dotazy, které člověk se signálem sám vyvolal (otevřel tu obrazovku, ten
// den). Tady si appka sama, kdykoliv má signál, stáhne CELÉ provozní tabulky a uloží je (lib/offlineKopieSklad.ts).
// Bez signálu z nich odpoví jakékoli obrazovce (lib/offlineDotaz.ts, lib/supabase.ts).
//
// Proč celé tabulky, a ne „jen tento týden": sklad se počítá ze všech pohybů od začátku, ne z jednoho týdne,
// a celá provozní data jsou malá (listopad 2026: ~1,6 MB, po zabalení na cestě ~200 kB). Jeden týden by navíc
// znamenal hádat, co kam patří; celá tabulka je vždycky správně.
//
// Kdy se stahuje: po spuštění, po návratu signálu, po návratu do aplikace, každých pár minut, a hned po změně
// (vlastní zápis i cizí přes realtime) jen ta tabulka, která se změnila.
//
// ⚠️ Stahuje se PŘÍMO ze serveru (obyčejný fetch s tokenem přihlášeného), ne přes klienta Supabase: ten by při
// výpadku odpověděl z paměti telefonu a kopie by se „obnovila" sama ze sebe. Co se nestáhlo, zůstane ve starší
// podobě — nikdy se nepřepíše prázdnem.
import { supabase, fetchSJisticem, VELKY_DOTAZ_TIMEOUT_MS } from './supabase';
import { UDALOST_SPOJENI_ZPET, vypadekCerstvy } from './jisticSpojeni';
import { priZneplatneni } from './zneplatneni';
import { nactiJson, ulozJson } from './uloziste';
import { stavKopie, ulozKopii, ulozStavKopie, type StavKopie } from './offlineKopieSklad';
import type { Radek } from './offlineDotaz';

/**
 * Tabulky, které telefon drží pro práci bez signálu: objednávky, závoz, stáčení, sklad a číselníky k nim,
 * plus drobnosti, které tytéž obrazovky čtou. Seznam je výslovný — do telefonu se nestahuje nic, co tu není
 * (zprávy z WhatsAppu, záznamy chyb, klíče, přehled přihlášení…).
 */
export const TABULKY_KOPIE: readonly string[] = [
  // číselníky
  'beers', 'packages', 'places', 'place_aliases', 'vehicles', 'price_list', 'profiles',
  // objednávky a závoz
  'orders', 'order_items', 'zavoz_deductions', 'zavoz_ukoly_hotovo', 'keg_returns', 'vycepy', 'vycepy_rezervace', 'male_sudy',
  // stáčení a plán
  'kegging', 'kegging_plan_checks', 'bottling', 'bottling_plans', 'keg_prefuk', 'stoceni_upravy',
  // sklad: výdeje, inventury, akce
  'fasovani', 'fasovani_private', 'writeoffs', 'inventory', 'inventory_adjustments', 'tydenni_inventura',
  'tydenni_uzaverky', 'closed_months', 'akce', 'akce_items', 'label_purchases', 'obal_nakupy',
  // sklep
  'cellar_tanks', 'cellar_transfers', 'cellar_tank_cycles', 'sanitation_logs',
  // provoz kolem
  'sdilene_poznamky', 'reminders', 'checklisty_hotovo', 'whatsapp_senders',
  // prodejna (obchod)
  'obchod_zbozi', 'obchod_prijem', 'obchod_odpis', 'obchod_inventura', 'obchod_uzaverky', 'obchod_zavreno',
];
const V_KOPII = new Set(TABULKY_KOPIE);

const STRANKA = 1000;
/** Pojistka: tabulka nad tenhle počet řádků se do telefonu nestahuje (provozní tabulky mají stovky až tisíce). */
export const MAX_RADKU_TABULKY = 60_000;
const SOUBEZNE = 4;
/** Počty řádků po tabulkách — ze součtu se skládá souhrn pro obrazovku. */
const KLIC_POCTU = 'pivovar_offline_kopie_pocty_v1';

/** Jak často se kopie obnovuje celá, když je appka vidět a má signál. */
export const OBNOVA_CELA_MS = 10 * 60_000;
/** Po návratu do appky se celá obnova spustí, je-li kopie starší než tohle. */
export const OBNOVA_PO_NAVRATU_MS = 3 * 60_000;
/** Po změně tabulky se čeká, až změny utichnou, a stáhne se jen ona. */
export const ZDRZENI_PO_ZMENE_MS = 5_000;
/** „Změnilo se něco, nevíme co" (RPC, edge funkce) smí spustit celou obnovu nejvýš jednou za tuhle dobu. */
export const ODSTUP_CELE_PO_ZMENE_MS = 60_000;

export type VysledekStahovani = {
  /** Stáhlo se a uložilo všechno, o co šlo. */
  ok: boolean;
  /** Proč se nestahovalo vůbec (nepřihlášen, bez signálu), nebo null. */
  preskoceno: 'neprihlasen' | 'offline' | null;
  stazene: string[];
  nestazene: { tabulka: string; duvod: string }[];
};

class ChybaSite extends Error {}
class ChybaPrihlaseni extends Error {}

const adresaServeru = (): string => String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const verejnyKlic = (): string => String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');

async function stranka(tabulka: string, token: string, razeni: boolean, offset: number): Promise<Response> {
  const adresa = `${adresaServeru()}/rest/v1/${tabulka}?select=*${razeni ? '&order=id.asc' : ''}&offset=${offset}&limit=${STRANKA}`;
  try {
    return await fetchSJisticem(adresa, { headers: { apikey: verejnyKlic(), Authorization: `Bearer ${token}`, Accept: 'application/json' } }, VELKY_DOTAZ_TIMEOUT_MS);
  } catch {
    throw new ChybaSite(tabulka);
  }
}

/**
 * Stáhne celou tabulku.
 *
 * Nejdřív jedním dotazem BEZ řazení: řádky tak přijdou ve stejném pořadí, v jakém je server vrací obrazovkám
 * (ty řazení často neuvádějí, nebo řadí podle sloupce se shodnými hodnotami) — bez signálu se pak seznam
 * nepřeskládá. Tak se vejde každá tabulka do tisíce řádků, což jsou skoro všechny.
 * Větší tabulka se stáhne po stránkách seřazená podle `id` (bez pevného pořadí by se řádky mezi stránkami
 * mohly přeskládat a některý by chyběl nebo byl dvakrát). Velká tabulka bez `id` se nestáhne — radši nic než
 * neúplná kopie.
 */
export async function stahniTabulku(tabulka: string, token: string): Promise<Radek[]> {
  const nacti = async (razeni: boolean, offset: number): Promise<Radek[]> => {
    const res = await stranka(tabulka, token, razeni, offset);
    if (res.status === 401) throw new ChybaPrihlaseni(tabulka);
    if (!res.ok) throw new Error(razeni && res.status === 400 ? 'tabulka bez id má víc řádků, než se vejde do jednoho dotazu' : `server odpověděl ${res.status}`);
    let cast: unknown;
    try { cast = await res.json(); } catch { throw new ChybaSite(tabulka); }      // spojení spadlo uprostřed odpovědi
    if (!Array.isArray(cast)) throw new Error('odpověď není seznam řádků');
    return cast as Radek[];
  };
  const prvni = await nacti(false, 0);
  if (prvni.length < STRANKA) return prvni;
  const radky: Radek[] = [];
  for (let offset = 0; ; offset += STRANKA) {
    const cast = await nacti(true, offset);
    for (const r of cast) radky.push(r);
    if (cast.length < STRANKA) return radky;
    if (radky.length > MAX_RADKU_TABULKY) throw new Error('tabulka je na telefon moc velká');
  }
}

let bezi: Promise<VysledekStahovani> | null = null;
/** Běží právě stahování VŠECH tabulek? (Druhé takové hned za ním by stáhlo totéž znovu.) */
let beziCela = false;
/**
 * Kdy naposledy DOBĚHLO stahování všech tabulek — i kdyby některá skončila chybou serveru. Bez toho by jedna
 * trvale nedostupná tabulka (smazaná, bez práv) znamenala „kopie není úplná" navždy a stahování všeho by se
 * pouštělo každou minutu znovu.
 */
let posledniCelyBeh = 0;
/** Co se má stáhnout hned po doběhnutí právě běžícího stahování: 'vse', nebo jen tyhle tabulky. */
let dalsi: 'vse' | Set<string> | null = null;

function pridejDoDalsich(co: 'vse' | readonly string[]): void {
  if (co === 'vse' || dalsi === 'vse') { dalsi = 'vse'; return; }
  if (!dalsi) dalsi = new Set();
  for (const t of co) dalsi.add(t);
}

async function stahni(co: 'vse' | readonly string[]): Promise<VysledekStahovani> {
  const prazdny = (preskoceno: VysledekStahovani['preskoceno']): VysledekStahovani => ({ ok: false, preskoceno, stazene: [], nestazene: [] });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return prazdny('offline');
  // Server před chvílí neodpověděl (slabý signál): stahování by jen viselo a drželo spojení. Zkusí se znovu,
  // až jistič ohlásí, že je spojení zpátky (lib/jisticSpojeni.ts).
  if (vypadekCerstvy()) return prazdny('offline');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const uzivatel = data.session?.user?.id;
  if (!token || !uzivatel) return prazdny('neprihlasen');

  const tabulky = co === 'vse' ? TABULKY_KOPIE.slice() : co.filter((t) => V_KOPII.has(t));
  const stazene: string[] = [];
  const nestazene: { tabulka: string; duvod: string }[] = [];
  const pocty = nactiJson<Record<string, number>>(KLIC_POCTU, {});
  let konec: 'sit' | 'prihlaseni' | null = null;
  let zacatek = 0;
  const fronta = tabulky.slice();
  const pracuj = async (): Promise<void> => {
    for (;;) {
      const tabulka = fronta.shift();
      if (!tabulka) return;
      if (konec) { nestazene.push({ tabulka, duvod: konec === 'sit' ? 'bez spojení' : 'přihlášení vypršelo' }); continue; }
      const t = Date.now();
      if (!zacatek) zacatek = t;
      try {
        const rows = await stahniTabulku(tabulka, token);
        await ulozKopii(tabulka, { rows, t, uzivatel });
        pocty[tabulka] = rows.length;
        stazene.push(tabulka);
      } catch (e) {
        if (e instanceof ChybaSite) konec = 'sit';
        else if (e instanceof ChybaPrihlaseni) konec = 'prihlaseni';
        nestazene.push({ tabulka, duvod: e instanceof ChybaSite ? 'bez spojení' : e instanceof ChybaPrihlaseni ? 'přihlášení vypršelo' : String((e as Error)?.message ?? e) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SOUBEZNE, tabulky.length) }, pracuj));
  // Kolo, které nepřerušilo spojení ani prošlé přihlášení, je hotové — příští až za obvyklou dobu.
  if (co === 'vse' && !konec) posledniCelyBeh = zacatek || Date.now();

  if (stazene.length > 0) {
    const dosud = stavKopie();
    // Jiný účet než minule: počty a „úplnost" staré kopie se ho netýkají.
    const stejny = dosud.uzivatel === uzivatel;
    const poctyUctu = stejny ? pocty : stazene.reduce<Record<string, number>>((m, t) => { m[t] = pocty[t]; return m; }, {});
    ulozJson(KLIC_POCTU, poctyUctu);
    const drzene = Object.keys(poctyUctu).filter((t) => V_KOPII.has(t));
    const selhane = new Set(nestazene.map((n) => n.tabulka));
    const stareNestazene = stejny ? dosud.nestazene.filter((t) => !stazene.includes(t)) : [];
    const stav: StavKopie = {
      uplneT: co === 'vse' && nestazene.length === 0 ? zacatek : (stejny ? dosud.uplneT : null),
      posledniT: zacatek,
      uzivatel,
      tabulek: drzene.length,
      radku: drzene.reduce((s, t) => s + (poctyUctu[t] || 0), 0),
      nestazene: Array.from(new Set([...stareNestazene, ...selhane])).sort(),
    };
    ulozStavKopie(stav);
  }
  return { ok: nestazene.length === 0 && stazene.length > 0, preskoceno: null, stazene, nestazene };
}

/**
 * Stáhne kopii (celou, nebo jen vyjmenované tabulky). Běží nejvýš jedno stahování; další požadavek se zařadí
 * a provede hned po něm. Nikdy nevyhodí chybu — výsledek říká, co se povedlo.
 */
export function stahniKopii(co: 'vse' | readonly string[] = 'vse'): Promise<VysledekStahovani> {
  if (bezi) {
    pridejDoDalsich(co);
    return bezi.then(() => bezi ?? stahniKopii(co));
  }
  beziCela = co === 'vse';
  const beh: Promise<VysledekStahovani> = stahni(co)
    .catch((e): VysledekStahovani => ({ ok: false, preskoceno: null, stazene: [], nestazene: [{ tabulka: '*', duvod: String((e as Error)?.message ?? e) }] }))
    .then((vysledek) => {
      if (bezi === beh) { bezi = null; beziCela = false; }
      const cekajici = dalsi;
      dalsi = null;
      // Spojení spadlo → čekající požadavky nemá smysl hned zkoušet; přijdou znovu s návratem signálu.
      const bezSpojeni = vysledek.preskoceno === 'offline' || vysledek.nestazene.some((n) => n.duvod === 'bez spojení');
      if (cekajici && !bezSpojeni) void stahniKopii(cekajici === 'vse' ? 'vse' : Array.from(cekajici));
      return vysledek;
    });
  bezi = beh;
  return beh;
}

/**
 * Udržuje kopii čerstvou, dokud je appka otevřená. Volá se jednou po přihlášení (App.tsx); vrací úklid.
 */
export function spustUdrzbuKopie(): () => void {
  if (typeof window === 'undefined') return () => {};
  let zruseno = false;
  const casovace = new Set<ReturnType<typeof setTimeout>>();
  const pozdeji = (fn: () => void, ms: number) => {
    const c = setTimeout(() => { casovace.delete(c); if (!zruseno) fn(); }, ms);
    casovace.add(c);
    return c;
  };
  const jeVidet = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const stariCele = () => { const t = Math.max(stavKopie().uplneT ?? 0, posledniCelyBeh); return t ? Date.now() - t : Infinity; };
  // „Kopie může být stará" (spuštění, návrat signálu, návrat do appky, čas): když se právě stahuje všechno,
  // další kolo hned za ním by bylo zbytečné.
  const cela = () => { if (!zruseno && !beziCela) void stahniKopii('vse'); };

  // Po spuštění: chvíli počkat, ať stahování nesoutěží s prvním vykreslením plochy. Po obnovení stránky
  // (kopie stará pár vteřin) se nestahuje znovu.
  pozdeji(() => { if (stariCele() > 60_000) cela(); }, 2500);

  const naOnline = () => { pozdeji(cela, 1500); };
  const naNavrat = () => { if (jeVidet() && stariCele() > OBNOVA_PO_NAVRATU_MS) cela(); };
  window.addEventListener('online', naOnline);
  // Server zase odpovídá po výpadku, o kterém telefon sám nevěděl (slabý signál — lib/jisticSpojeni.ts).
  window.addEventListener(UDALOST_SPOJENI_ZPET, naOnline);
  document.addEventListener('visibilitychange', naNavrat);
  const interval = setInterval(() => { if (jeVidet() && stariCele() > OBNOVA_CELA_MS) cela(); }, 60_000);

  // Po změně: jen změněné tabulky, až změny utichnou.
  const zmenene = new Set<string>();
  let chceVse = false;
  let posledniCelaPoZmene = 0;
  let casovacZmen: ReturnType<typeof setTimeout> | null = null;
  const poZmene = () => {
    casovacZmen = null;
    const tabulky = Array.from(zmenene);
    zmenene.clear();
    const vse = chceVse;
    chceVse = false;
    // „Něco se změnilo, nevíme co": i když zrovna běží stahování všeho, mohlo změněnou tabulku stáhnout ještě
    // před změnou — proto se zařadí další kolo za něj (ne přes `cela`, která by ho přeskočila).
    if (vse && Date.now() - posledniCelaPoZmene >= ODSTUP_CELE_PO_ZMENE_MS) { posledniCelaPoZmene = Date.now(); if (!zruseno) void stahniKopii('vse'); return; }
    if (tabulky.length > 0) void stahniKopii(tabulky);
  };
  const odhlasZmeny = priZneplatneni((tabulka) => {
    if (tabulka === null) chceVse = true;
    else if (V_KOPII.has(tabulka)) zmenene.add(tabulka);
    else return;
    if (casovacZmen) { clearTimeout(casovacZmen); casovace.delete(casovacZmen); }
    casovacZmen = pozdeji(poZmene, ZDRZENI_PO_ZMENE_MS);
  });

  return () => {
    zruseno = true;
    casovace.forEach((c) => clearTimeout(c));
    casovace.clear();
    clearInterval(interval);
    window.removeEventListener('online', naOnline);
    window.removeEventListener(UDALOST_SPOJENI_ZPET, naOnline);
    document.removeEventListener('visibilitychange', naNavrat);
    odhlasZmeny();
  };
}

/** Jen pro testy. */
export function zapomenBehyKopieProTesty(): void {
  posledniCelyBeh = 0;
}
