// 🧮 Výpočetní modul bible (etapa 6) — společný základ.
// ---------------------------------------------------------------------------
// Architektura § 7: čisté TS moduly bez závislostí, sdílí je appka (Výpočtová
// laboratoř) i edge funkce (nástroj `vypocet` konektoru Claude). Zásada 2:
// „Čísla z výpočtů počítá výpočetní modul, ne model."
//
// Každý výpočet vrací vstupy s jednotkami, vzorec, mezikroky, výsledek
// s jednotkou, předpoklady, rozsah platnosti, nejistotu a zdroj. Vstup mimo
// rozsah platnosti odmítne (MimoRozsah) — nic se nedopočítává odhadem.

/** Jeden číselný vstup výpočtu. */
export type Vstup = {
  id: string;
  nazev: string;
  jednotka: string;
  /** Rozsah platnosti vzorce — mimo něj se výpočet odmítne. */
  min: number;
  max: number;
  vychozi: number;
  krok?: number;
  napoveda?: string;
};

/** Opakovaný řádek vstupů (chmelové dávky, slady). */
export type SeznamVstupu = {
  id: string;
  nazev: string;
  polozky: readonly Vstup[];
  minRadku: number;
  maxRadku: number;
  vychozi: readonly Record<string, number>[];
};

/** Hodnota s jednotkou a počtem desetinných míst pro zobrazení. */
export type Velicina = { nazev: string; hodnota: number; jednotka: string; mist: number };

export type Vysledek = {
  vstupy: Velicina[];
  /** Vzorec po řádcích (čitelně, bez LaTeXu). */
  vzorec: string[];
  mezikroky: Velicina[];
  /** Výsledky — první je hlavní. */
  vysledky: Velicina[];
  predpoklady: string[];
  rozsah: string;
  nejistota: string;
  zdroj: string;
};

export type Hodnoty = Record<string, number>;
export type Radky = Record<string, Hodnoty[]>;

export type Definice = {
  id: string;
  nazev: string;
  /** Co výpočet řeší, jednou větou. */
  popis: string;
  /** Tematická oblast A–T (src/lib/bibleOblasti.ts). */
  oblast: string;
  vstupy: readonly Vstup[];
  seznam?: SeznamVstupu;
  /** Dotaz do knihovny — „Najít v knihách" ukáže, kde vzorec v nahraných knihách je. */
  hledat: string;
  spocitej(h: Hodnoty, radky: Radky): Vysledek;
};

/** Vstup mimo rozsah platnosti nebo nesmyslná kombinace — hláška jde ukázat tak, jak je. */
export class MimoRozsah extends Error {}

/** Číslo do hlášky: desetinná čárka a skutečné minus. */
const cesky = (n: number) => String(n).replace('.', ',').replace(/^-/, '−');

function zkontrolujJeden(v: Vstup, hodnota: unknown, kde = ''): number {
  if (typeof hodnota !== 'number' || !Number.isFinite(hodnota)) {
    throw new MimoRozsah(`Chybí ${v.nazev.toLowerCase()}${kde}.`);
  }
  if (hodnota < v.min || hodnota > v.max) {
    throw new MimoRozsah(`${v.nazev}${kde} musí být ${cesky(v.min)}–${cesky(v.max)} ${v.jednotka} (zadáno ${cesky(hodnota)}).`);
  }
  return hodnota;
}

/** Zkontroluje vstupy podle definice a vrátí jen známá pole (nic navíc). */
export function zkontrolujVstupy(d: Definice, hodnoty: Record<string, unknown>, radky: Record<string, unknown> = {}): { h: Hodnoty; r: Radky } {
  const h: Hodnoty = {};
  for (const v of d.vstupy) h[v.id] = zkontrolujJeden(v, hodnoty[v.id]);
  const r: Radky = {};
  if (d.seznam) {
    const s = d.seznam;
    const vstup = radky[s.id];
    if (!Array.isArray(vstup) || vstup.length < s.minRadku || vstup.length > s.maxRadku) {
      throw new MimoRozsah(`${s.nazev}: zadej ${s.minRadku}–${s.maxRadku} řádků.`);
    }
    r[s.id] = vstup.map((radek, i) => {
      const o = (radek ?? {}) as Record<string, unknown>;
      const vysledek: Hodnoty = {};
      for (const p of s.polozky) vysledek[p.id] = zkontrolujJeden(p, o[p.id], ` (řádek ${i + 1})`);
      return vysledek;
    });
  }
  return { h, r };
}

/** Výchozí hodnoty pro formulář. */
export function vychoziHodnoty(d: Definice): { h: Hodnoty; r: Radky } {
  const h: Hodnoty = {};
  for (const v of d.vstupy) h[v.id] = v.vychozi;
  const r: Radky = {};
  if (d.seznam) r[d.seznam.id] = d.seznam.vychozi.map((x) => ({ ...x }));
  return { h, r };
}

/** Spočítá výpočet se zkontrolovanými vstupy. */
export function spocitej(d: Definice, hodnoty: Record<string, unknown>, radky: Record<string, unknown> = {}): Vysledek {
  const { h, r } = zkontrolujVstupy(d, hodnoty, radky);
  return d.spocitej(h, r);
}

export const vel = (nazev: string, hodnota: number, jednotka: string, mist = 2): Velicina => ({ nazev, hodnota, jednotka, mist });

/** Číslo pro člověka: desetinná čárka, mezera mezi tisíci (jako appka). */
export function formatuj(v: Velicina): string {
  const cislo = v.hodnota.toLocaleString('cs-CZ', { minimumFractionDigits: v.mist, maximumFractionDigits: v.mist });
  return v.jednotka ? `${cislo} ${v.jednotka}` : cislo;
}
