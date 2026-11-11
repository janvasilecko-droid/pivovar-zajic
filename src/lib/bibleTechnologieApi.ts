// 🏭 Technologie pivovaru (etapa 7) přes bible-api — bez offline mezipaměti.
// ---------------------------------------------------------------------------
// Profil pivovaru: zařízení s parametry (každý parametr má ZDROJ — štítek,
// dokumentace, změřeno, ze Sklepa, odhad) a provozní postupy. Claude je přes
// konektor čte nástrojem profil_pivovaru a odděluje je od literatury.
// Zapisuje přispěvatel, celý pivovar smaže jen správce (hlídá i SQL).
import { volejBibli } from './bibleKlient';
import {
  DRUHY_ZARIZENI, ZDROJE_PARAMETRU, type DruhZarizeni, type Parametr, type ZdrojParametru,
} from '../../bible/supabase/functions/_shared/technologie-popisy.ts';

export type Pivovar = { id: string; nazev: string; popis: string | null; hlavni: boolean; zalozilJmeno: string | null; upraveno: string | null };
export type Zarizeni = {
  id: string; druh: DruhZarizeni; nazev: string; pocet: number; parametry: Parametr[];
  poznamka: string | null; zapsalJmeno: string | null; upraveno: string | null;
};
export type PostupProvozu = { id: string; nazev: string; oblast: string | null; kroky: string; zdroj: string | null; zapsalJmeno: string | null; upraveno: string | null };
export type Technologie = { pivovary: Pivovar[]; pivovarId: string | null; zarizeni: Zarizeni[]; postupy: PostupProvozu[]; migrace: boolean };

export type PivovarVstup = { nazev: string; popis: string; hlavni: boolean };
export type ParametrVstup = { nazev: string; hodnota: string; jednotka: string; zdroj: ZdrojParametru };
export type ZarizeniVstup = { druh: DruhZarizeni; nazev: string; pocet: number; parametry: ParametrVstup[]; poznamka: string };
export type PostupVstup = { nazev: string; oblast: string; kroky: string; zdroj: string };

const txt = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const jeDruh = (v: unknown): v is DruhZarizeni => DRUHY_ZARIZENI.some((d) => d.id === v);
const jeZdroj = (v: unknown): v is ZdrojParametru => ZDROJE_PARAMETRU.some((z) => z.id === v);

/** Stará bible-api akci ještě nezná (web se nasazuje dřív než funkce) — appka to řekne srozumitelně. */
const NENASAZENO = 'Technologie pivovaru se právě nasazuje — zkus to za pár minut.';
const jeNenasazeno = (kod: string, zprava: string) => kod === 'nenasazeno' || (kod === 'neplatny_vstup' && zprava === 'Neznámá akce.');

function parametry(v: unknown): Parametr[] {
  const out: Parametr[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const nazev = txt(o.nazev);
    if (!nazev) continue;
    const hodnota = typeof o.hodnota === 'number' && Number.isFinite(o.hodnota) ? o.hodnota : undefined;
    const text = txt(o.text) ?? undefined;
    if (hodnota === undefined && !text) continue;
    out.push({
      nazev,
      ...(hodnota !== undefined ? { hodnota } : {}),
      ...(text ? { text } : {}),
      ...(txt(o.jednotka) ? { jednotka: txt(o.jednotka)! } : {}),
      zdroj: jeZdroj(o.zdroj) ? o.zdroj : 'odhad',
    });
  }
  return out;
}

export async function nactiTechnologii(
  pivovarId?: string | null,
): Promise<{ stav: 'ok'; technologie: Technologie } | { stav: 'chyba' | 'nenasazeno'; zprava: string }> {
  const telo: Record<string, unknown> = { akce: 'technologie' };
  if (pivovarId) telo.pivovar_id = pivovarId;
  const r = await volejBibli<Record<string, unknown>>('bible-api', telo);
  if (!r.ok) {
    if (jeNenasazeno(r.chyba.kod, r.chyba.zprava)) return { stav: 'nenasazeno', zprava: NENASAZENO };
    return { stav: 'chyba', zprava: r.chyba.zprava };
  }
  const d = r.data ?? {};
  const pivovary: Pivovar[] = [];
  for (const v of Array.isArray(d.pivovary) ? d.pivovary : []) {
    const o = (v ?? {}) as Record<string, unknown>;
    const id = txt(o.id);
    if (!id) continue;
    pivovary.push({
      id, nazev: txt(o.nazev) ?? 'Pivovar', popis: txt(o.popis), hlavni: o.hlavni === true,
      zalozilJmeno: txt(o.zalozil_jmeno), upraveno: txt(o.upraveno_at),
    });
  }
  const zarizeni: Zarizeni[] = [];
  for (const v of Array.isArray(d.zarizeni) ? d.zarizeni : []) {
    const o = (v ?? {}) as Record<string, unknown>;
    const id = txt(o.id);
    if (!id || !jeDruh(o.druh)) continue;
    zarizeni.push({
      id, druh: o.druh, nazev: txt(o.nazev) ?? 'Zařízení',
      pocet: typeof o.pocet === 'number' && o.pocet >= 1 ? o.pocet : 1,
      parametry: parametry(o.parametry), poznamka: txt(o.poznamka),
      zapsalJmeno: txt(o.zapsal_jmeno), upraveno: txt(o.upraveno_at),
    });
  }
  const postupy: PostupProvozu[] = [];
  for (const v of Array.isArray(d.postupy) ? d.postupy : []) {
    const o = (v ?? {}) as Record<string, unknown>;
    const id = txt(o.id);
    if (!id) continue;
    postupy.push({
      id, nazev: txt(o.nazev) ?? 'Postup', oblast: txt(o.oblast), kroky: txt(o.kroky) ?? '', zdroj: txt(o.zdroj),
      zapsalJmeno: txt(o.zapsal_jmeno), upraveno: txt(o.upraveno_at),
    });
  }
  const vybrany = txt(d.pivovar_id);
  return {
    stav: 'ok',
    technologie: {
      pivovary, zarizeni, postupy,
      pivovarId: vybrany && pivovary.some((p) => p.id === vybrany) ? vybrany : null,
      migrace: d.migrace !== false,
    },
  };
}

type Vysledek<T = undefined> = { stav: 'ok'; data: T } | { stav: 'chyba'; zprava: string };

async function zapis<T>(telo: Record<string, unknown>, vyber: (d: Record<string, unknown>) => T): Promise<Vysledek<T>> {
  const r = await volejBibli<Record<string, unknown>>('bible-api', telo);
  if (r.ok) return { stav: 'ok', data: vyber(r.data ?? {}) };
  if (jeNenasazeno(r.chyba.kod, r.chyba.zprava)) return { stav: 'chyba', zprava: NENASAZENO };
  return { stav: 'chyba', zprava: r.chyba.zprava };
}

const idZOdpovedi = (d: Record<string, unknown>): string | null => txt(d.id);
const nic = (): undefined => undefined;

/**
 * Číslo z pole formuláře: „7,5" i „7.5"; prázdné = žádné. Cokoli jiného je
 * chyba — číslo se nedomýšlí (radši odmítnout než uložit špatně).
 */
export function cisloZPole(s: string): number | null | 'chyba' {
  const t = s.trim().replace(/\s+/g, '').replace(',', '.');
  if (!t) return null;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return 'chyba';
  const n = Number(t);
  return Number.isFinite(n) ? n : 'chyba';
}

/**
 * Parametr z formuláře do bible-api: číslo jako hodnota, jinak text. Prázdné
 * řádky (bez hodnoty) se vynechají — šablona nabízí názvy, ne povinné údaje.
 */
export function parametryKOdeslani(seznam: readonly ParametrVstup[]): Parametr[] {
  const out: Parametr[] = [];
  for (const p of seznam) {
    const nazev = p.nazev.trim();
    const hodnota = p.hodnota.trim();
    if (!nazev || !hodnota) continue;
    const cislo = cisloZPole(hodnota);
    const jednotka = p.jednotka.trim();
    out.push({
      nazev,
      ...(typeof cislo === 'number' ? { hodnota: cislo } : { text: hodnota }),
      ...(jednotka ? { jednotka } : {}),
      zdroj: p.zdroj,
    });
  }
  return out;
}

/** Parametr uložený v bibli zpátky do formuláře. */
export const parametrDoFormulare = (p: Parametr): ParametrVstup => ({
  nazev: p.nazev,
  hodnota: typeof p.hodnota === 'number' ? String(p.hodnota).replace('.', ',') + (p.text ? ` ${p.text}` : '') : p.text ?? '',
  jednotka: p.jednotka ?? '',
  zdroj: p.zdroj,
});

export const ulozPivovar = (id: string | null, p: PivovarVstup): Promise<Vysledek<string | null>> => zapis({
  akce: 'pivovar_ulozit',
  pivovar: { ...(id ? { id } : {}), nazev: p.nazev.trim(), ...(p.popis.trim() ? { popis: p.popis.trim() } : {}), hlavni: p.hlavni },
}, idZOdpovedi);

export const smazPivovar = (id: string): Promise<Vysledek> => zapis({ akce: 'pivovar_smazat', id }, nic);

export const ulozZarizeni = (id: string | null, pivovarId: string, z: ZarizeniVstup): Promise<Vysledek<string | null>> => zapis({
  akce: 'zarizeni_ulozit',
  zarizeni: {
    ...(id ? { id } : { pivovar_id: pivovarId }),
    druh: z.druh,
    nazev: z.nazev.trim(),
    pocet: z.pocet,
    parametry: parametryKOdeslani(z.parametry),
    ...(z.poznamka.trim() ? { poznamka: z.poznamka.trim() } : {}),
  },
}, idZOdpovedi);

export const smazZarizeni = (id: string): Promise<Vysledek> => zapis({ akce: 'zarizeni_smazat', id }, nic);

export const ulozPostup = (id: string | null, pivovarId: string, p: PostupVstup): Promise<Vysledek<string | null>> => zapis({
  akce: 'postup_provozu_ulozit',
  postup: {
    ...(id ? { id } : { pivovar_id: pivovarId }),
    nazev: p.nazev.trim(),
    ...(p.oblast ? { oblast: p.oblast } : {}),
    kroky: p.kroky.trim(),
    ...(p.zdroj.trim() ? { zdroj: p.zdroj.trim() } : {}),
  },
}, idZOdpovedi);

export const smazPostup = (id: string): Promise<Vysledek> => zapis({ akce: 'postup_provozu_smazat', id }, nic);

// --- Převzetí tanků ze Sklepa ---------------------------------------------

export type TankSklepa = { label: string; capacity_l: number | null };

/**
 * Tanky ze Sklepa hlavní appky jako zařízení bible: Spilka = kvasný tank,
 * ostatní = ležácký. Objem užitný v hl z kapacity v litrech (zdroj „ze Sklepa").
 * Tank bez kladné kapacity jde bez objemu — nic se nedomýšlí.
 */
export function tankyZeSklepa(tanky: readonly TankSklepa[]): { druh: DruhZarizeni; nazev: string; pocet: number; parametry: Parametr[] }[] {
  const out: { druh: DruhZarizeni; nazev: string; pocet: number; parametry: Parametr[] }[] = [];
  const videno = new Set<string>();
  for (const t of tanky) {
    const nazev = (t.label ?? '').trim().slice(0, 120);
    if (!nazev || videno.has(nazev.toLowerCase())) continue;
    videno.add(nazev.toLowerCase());
    const objem = typeof t.capacity_l === 'number' && Number.isFinite(t.capacity_l) && t.capacity_l > 0
      ? Math.round(t.capacity_l) / 100
      : null;
    out.push({
      druh: /spilka/i.test(nazev) ? 'tank_kvasny' : 'tank_lezacky',
      nazev,
      pocet: 1,
      parametry: objem === null ? [] : [{ nazev: 'Objem užitný', hodnota: objem, jednotka: 'hl', zdroj: 'sklep' }],
    });
  }
  return out;
}

export const prevezmiZarizeni = (
  pivovarId: string,
  seznam: ReturnType<typeof tankyZeSklepa>,
): Promise<Vysledek<number>> => zapis(
  { akce: 'zarizeni_prevzit', pivovar_id: pivovarId, seznam },
  (d) => (typeof d.prevzato === 'number' ? d.prevzato : 0),
);
