// 🍺 Receptury a várky (etapa 8) přes bible-api — bez offline mezipaměti.
// ---------------------------------------------------------------------------
// Evidence várek: pevné hodnoty s jednotkou a rozsahem (katalog sdílený
// s bible-api a konektorem v _shared/varky-popisy.ts). Porovnání várek počítá
// appka stejným kódem jako Claude přes konektor (nástroj porovnej_varky).
// Číslo, které nejde přečíst, se odmítne — nic se nedomýšlí ani nezaokrouhluje.
import { volejBibli } from './bibleKlient';
import { cisloZPole } from './bibleTechnologieApi';
import {
  HODNOTY_VARKY, prehledVarek, type DruhSuroviny, type FazeKroku, type Krok, type PrehledVarek, type Surovina,
} from '../../bible/supabase/functions/_shared/varky-popisy.ts';

const NENASAZENO = 'Receptury a várky se právě nasazují — zkus to za pár minut.';
const jeNenasazeno = (kod: string, zprava: string) => kod === 'nenasazeno' || (kod === 'neplatny_vstup' && zprava === 'Neznámá akce.');

export async function nactiVarky(): Promise<{ stav: 'ok'; prehled: PrehledVarek; migrace: boolean } | { stav: 'chyba' | 'nenasazeno'; zprava: string }> {
  const r = await volejBibli<Record<string, unknown>>('bible-api', { akce: 'varky' });
  if (!r.ok) {
    if (jeNenasazeno(r.chyba.kod, r.chyba.zprava)) return { stav: 'nenasazeno', zprava: NENASAZENO };
    return { stav: 'chyba', zprava: r.chyba.zprava };
  }
  return { stav: 'ok', prehled: prehledVarek(r.data), migrace: r.data?.migrace !== false };
}

type Vysledek<T = undefined> = { stav: 'ok'; data: T } | { stav: 'chyba'; zprava: string };

async function zapis<T>(telo: Record<string, unknown>, vyber: (d: Record<string, unknown>) => T): Promise<Vysledek<T>> {
  const r = await volejBibli<Record<string, unknown>>('bible-api', telo);
  if (r.ok) return { stav: 'ok', data: vyber(r.data ?? {}) };
  if (jeNenasazeno(r.chyba.kod, r.chyba.zprava)) return { stav: 'chyba', zprava: NENASAZENO };
  return { stav: 'chyba', zprava: r.chyba.zprava };
}

const idZOdpovedi = (d: Record<string, unknown>): string | null => (typeof d.id === 'string' ? d.id : null);
const nic = (): undefined => undefined;

/** Číslo z pole s rozsahem: null = prázdné, jinak číslo, nebo česká chyba. */
export function cisloSRozsahem(s: string, co: string, min: number, max: number, cele = false): { cislo: number | null } | { chyba: string } {
  const n = cisloZPole(s);
  if (n === null) return { cislo: null };
  if (n === 'chyba') return { chyba: `${co}: „${s.trim()}" není číslo.` };
  if (n < min || n > max) return { chyba: `${co}: ${s.trim()} je mimo rozsah ${String(min).replace('.', ',')} až ${String(max).replace('.', ',')}.` };
  if (cele && !Number.isInteger(n)) return { chyba: `${co} musí být celé číslo.` };
  return { cislo: n };
}

// --- Várky -------------------------------------------------------------------

export type VarkaVstup = {
  recepturaId: string;
  pivovarId: string | null;
  cislo: string;
  pivo: string;
  datumVaru: string;
  /** Hodnoty z formuláře jako text (klíč katalogu → „11,3"). */
  hodnoty: Record<string, string>;
  poznamka: string;
};

/** Hodnoty várky z formuláře → čísla podle katalogu, nebo první chyba. Prázdná pole se neposílají. */
export function hodnotyKOdeslani(pole: Record<string, string>): { hodnoty: Record<string, number> } | { chyba: string } {
  const hodnoty: Record<string, number> = {};
  for (const k of HODNOTY_VARKY) {
    const s = pole[k.klic] ?? '';
    const r = cisloSRozsahem(s, k.nazev, k.min, k.max, k.cele === true);
    if ('chyba' in r) return r;
    if (r.cislo !== null) hodnoty[k.klic] = r.cislo;
  }
  return { hodnoty };
}

/** Uložené číslo zpátky do pole formuláře („11,3"). */
export const doPole = (n: number | null | undefined): string => (typeof n === 'number' ? String(n).replace('.', ',') : '');

export function chybaVarky(v: VarkaVstup): string | null {
  if (!v.pivo.trim()) return 'Doplň pivo.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.datumVaru)) return 'Doplň datum varu.';
  const h = hodnotyKOdeslani(v.hodnoty);
  return 'chyba' in h ? h.chyba : null;
}

export function ulozVarku(id: string | null, v: VarkaVstup): Promise<Vysledek<string | null>> {
  const h = hodnotyKOdeslani(v.hodnoty);
  if ('chyba' in h) return Promise.resolve({ stav: 'chyba', zprava: h.chyba });
  return zapis({
    akce: 'varka_ulozit',
    varka: {
      ...(id ? { id } : {}),
      ...(v.pivovarId ? { pivovar_id: v.pivovarId } : {}),
      ...(v.recepturaId ? { receptura_id: v.recepturaId } : {}),
      ...(v.cislo.trim() ? { cislo: v.cislo.trim() } : {}),
      pivo: v.pivo.trim(),
      datum_varu: v.datumVaru,
      hodnoty: h.hodnoty,
      ...(v.poznamka.trim() ? { poznamka: v.poznamka.trim() } : {}),
    },
  }, idZOdpovedi);
}

export const smazVarku = (id: string): Promise<Vysledek> => zapis({ akce: 'varka_smazat', id }, nic);

// --- Receptury -----------------------------------------------------------------

export type SurovinaVstup = { druh: DruhSuroviny; nazev: string; mnozstvi: string; jednotka: string; kdy: string; poznamka: string };
export type KrokVstup = { faze: FazeKroku; nazev: string; teplota: string; minut: string; poznamka: string };
export type RecepturaVstup = {
  pivovarId: string | null;
  nazev: string;
  styl: string;
  cilObjem: string;
  cilStupnovitost: string;
  cilAlkohol: string;
  cilIbu: string;
  cilBarva: string;
  suroviny: SurovinaVstup[];
  kroky: KrokVstup[];
  poznamka: string;
};

export const CILE_RECEPTURY = [
  { pole: 'cilObjem', klic: 'cil_objem_hl', nazev: 'Objem vyražené mladiny', jednotka: 'hl', min: 0.01, max: 2000 },
  { pole: 'cilStupnovitost', klic: 'cil_stupnovitost', nazev: 'Stupňovitost', jednotka: '°P', min: 1, max: 35 },
  { pole: 'cilAlkohol', klic: 'cil_alkohol', nazev: 'Alkohol', jednotka: '% obj.', min: 0, max: 20 },
  { pole: 'cilIbu', klic: 'cil_ibu', nazev: 'Hořkost', jednotka: 'IBU', min: 0, max: 200 },
  { pole: 'cilBarva', klic: 'cil_barva_ebc', nazev: 'Barva', jednotka: 'EBC', min: 0, max: 300 },
] as const;

/** Receptura z formuláře → tělo pro bible-api, nebo první chyba. Prázdné řádky surovin a kroků se vynechají. */
export function recepturaKOdeslani(r: RecepturaVstup): { receptura: Record<string, unknown> } | { chyba: string } {
  if (!r.nazev.trim()) return { chyba: 'Doplň název receptury.' };
  const out: Record<string, unknown> = {
    ...(r.pivovarId ? { pivovar_id: r.pivovarId } : {}),
    nazev: r.nazev.trim(),
    ...(r.styl.trim() ? { styl: r.styl.trim() } : {}),
  };
  for (const c of CILE_RECEPTURY) {
    const x = cisloSRozsahem(r[c.pole], `Cíl — ${c.nazev.toLowerCase()}`, c.min, c.max);
    if ('chyba' in x) return x;
    if (x.cislo !== null) out[c.klic] = x.cislo;
  }
  const suroviny: Surovina[] = [];
  for (const s of r.suroviny) {
    const nazev = s.nazev.trim();
    if (!nazev) {
      if (s.mnozstvi.trim()) return { chyba: 'Surovina s množstvím nemá název.' };
      continue;
    }
    const m = cisloSRozsahem(s.mnozstvi, `Množství „${nazev}"`, 0, 1000000);
    if ('chyba' in m) return m;
    if (m.cislo === 0) return { chyba: `Množství „${nazev}" musí být kladné.` };
    suroviny.push({
      druh: s.druh, nazev,
      ...(m.cislo !== null ? { mnozstvi: m.cislo } : {}),
      ...(s.jednotka.trim() ? { jednotka: s.jednotka.trim() } : {}),
      ...(s.kdy.trim() ? { kdy: s.kdy.trim() } : {}),
      ...(s.poznamka.trim() ? { poznamka: s.poznamka.trim() } : {}),
    });
  }
  const kroky: Krok[] = [];
  for (const k of r.kroky) {
    const nazev = k.nazev.trim();
    if (!nazev) {
      if (k.teplota.trim() || k.minut.trim()) return { chyba: 'Krok s teplotou nebo délkou nemá název.' };
      continue;
    }
    const t = cisloSRozsahem(k.teplota, `Teplota „${nazev}"`, -5, 110);
    if ('chyba' in t) return t;
    const m = cisloSRozsahem(k.minut, `Délka „${nazev}"`, 0, 100000);
    if ('chyba' in m) return m;
    kroky.push({
      faze: k.faze, nazev,
      ...(t.cislo !== null ? { teplota_c: t.cislo } : {}),
      ...(m.cislo !== null ? { minut: m.cislo } : {}),
      ...(k.poznamka.trim() ? { poznamka: k.poznamka.trim() } : {}),
    });
  }
  out.suroviny = suroviny;
  out.kroky = kroky;
  if (r.poznamka.trim()) out.poznamka = r.poznamka.trim();
  return { receptura: out };
}

export function ulozRecepturu(id: string | null, r: RecepturaVstup): Promise<Vysledek<string | null>> {
  const x = recepturaKOdeslani(r);
  if ('chyba' in x) return Promise.resolve({ stav: 'chyba', zprava: x.chyba });
  return zapis({ akce: 'receptura_ulozit', receptura: { ...(id ? { id } : {}), ...x.receptura } }, idZOdpovedi);
}

export const smazRecepturu = (id: string): Promise<Vysledek> => zapis({ akce: 'receptura_smazat', id }, nic);
