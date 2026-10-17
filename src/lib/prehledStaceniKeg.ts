// 📋 Přehled stáčení KEG jako tabulka po dnech — jen počítání.
// ---------------------------------------------------------------------------
// Zadání 17. 10. 2026: „udělej takhle i přehled stáčení KEG" (po přehledu
// stáčení lahví, lib/prehledStaceniTabulka.ts): den je pás se součtem, řádek je
// pivo, sloupce jsou velikosti sudů (50 · 30 · 20 · 15 · 10 l) a pod řádkem je
// kolik litrů se stočilo a jaká byla výtrata, když je znám objem z tanku.
// Vykreslení je v components/PrehledStaceniKeg.tsx.
import { SLOUPCE_SUDY } from './prehledVydeje';
import { skutecnaVytrataProcenta } from './bottlingYield';
import type { DavkaStaceni, DenStaceni, ZaznamStaceni } from './prehledStaceni';

/** Záznam stáčení KEG: společná pole přehledu + objem odebraný z tanku. */
export type ZaznamKeg = ZaznamStaceni & {
  source_volume_l?: number | string | null;
  note?: string | null;
};

/** Sloupce, které se ukazují vždycky (padesátky a třicítky se stáčejí nejčastěji). */
export const ZAKLADNI_SLOUPCE_KEG = [50, 30];

/**
 * Velikosti sudů ve sloupcích: základní + ty, ve kterých něco je, od největšího.
 * Velikost, kterou nezná katalog sloupců (např. 5 l), dostane vlastní sloupec,
 * ať se kusy neschovají.
 */
export function sloupceKeg<R extends ZaznamStaceni>(dny: DenStaceni<R>[]): number[] {
  const objemy = new Set<number>(ZAKLADNI_SLOUPCE_KEG);
  for (const den of dny) {
    for (const davka of den.davky) {
      for (const p of davka.polozky) if (p.objemL > 0 && (Number(p.zaznam.quantity) || 0) > 0) objemy.add(p.objemL);
    }
  }
  const znama = SLOUPCE_SUDY.filter((l) => objemy.has(l));
  const jina = [...objemy].filter((l) => !SLOUPCE_SUDY.includes(l)).sort((a, b) => b - a);
  return [...znama, ...jina].sort((a, b) => b - a);
}

/** Kusy dávky v jednom sloupci a záznamy, ze kterých se skládají. */
export function bunkaDavky<R extends ZaznamStaceni>(davka: DavkaStaceni<R>, objemL: number): { ks: number; zaznamy: R[] } {
  const zaznamy = davka.polozky.filter((p) => p.objemL === objemL).map((p) => p.zaznam);
  return { ks: zaznamy.reduce((s, z) => s + (Number(z.quantity) || 0), 0), zaznamy };
}

/** Záznamy dávky s obalem mimo všechny sloupce (obal chybí v katalogu: objem 0). */
export function zaznamyBezSloupce<R extends ZaznamStaceni>(davka: DavkaStaceni<R>, sloupce: number[]): R[] {
  return davka.polozky.filter((p) => !sloupce.includes(p.objemL)).map((p) => p.zaznam);
}

/**
 * Litry odebrané z tanku a výtrata dávky. Výtrata jen tehdy, když MÁ objem
 * z tanku každý záznam dávky — stáčení bez tanku nebo jen část zdrojů by
 * vyšlo jako vymyšlená záporná výtrata.
 */
export function zdrojAVytrata<R extends ZaznamKeg>(davka: DavkaStaceni<R>): { zdrojL: number; vytrata: number | null } {
  const stocene = davka.polozky.filter((p) => (Number(p.zaznam.quantity) || 0) > 0);
  const zdroje = stocene.map((p) => Number(p.zaznam.source_volume_l) || 0);
  if (stocene.length === 0 || zdroje.some((z) => !(z > 0))) return { zdrojL: 0, vytrata: null };
  const zdrojL = zdroje.reduce((a, b) => a + b, 0);
  const litry = stocene.reduce((s, p) => s + p.litry, 0);
  return { zdrojL, vytrata: skutecnaVytrataProcenta(litry, zdrojL) };
}

/** Součty dne po sloupcích (stejné pořadí jako `sloupce`). */
export function souctyDne<R extends ZaznamStaceni>(den: DenStaceni<R>, sloupce: number[]): number[] {
  return sloupce.map((l) => den.davky.reduce((s, d) => s + bunkaDavky(d, l).ks, 0));
}
