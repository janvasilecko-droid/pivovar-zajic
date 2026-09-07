/**
 * 🎨 Barva políčka v inventuře — jedno kouknutí místo počítání.
 *
 * Sloupců je v tabulce sedm a rozdíl se hledá očima. Barva políčka to řekne
 * dřív, než se člověk stihne podívat na číslo vedle:
 *
 *   • ŠEDÉ  — ve skladu něco je, ale nespočítalo se to. Tohle je ta
 *     nebezpečná kombinace: prázdné políčko se ve výpočtu chová jako nula,
 *     takže by z nespočítané položky vyšlo manko rovné celému stavu.
 *   • ZELENÉ — napočítáno sedí se skladem.
 *   • ČERVENÉ — nesedí; tady se bude dohledávat.
 *   • BEZ BARVY — ve skladu nic a nic se nepočítalo, řádek je jen výplň.
 */
export type StavPolicka = 'nespocitano' | 'sedi' | 'nesedi' | 'prazdne';

export function stavPolicka(napocitano: string | number | undefined | null, sklad: number): StavPolicka {
  const text = String(napocitano ?? '').trim();

  if (text === '') return sklad === 0 ? 'prazdne' : 'nespocitano';

  const cislo = Number(text.replace(',', '.'));
  // Rozepsané číslo („−", „1,") ještě není číslo — barvit ho jako nesouhlas
  // by blikalo při každém úhozu.
  if (!Number.isFinite(cislo)) return 'prazdne';

  return cislo === sklad ? 'sedi' : 'nesedi';
}

/** Třídy pro `<input>` podle stavu. Rámeček i podklad, ať je to vidět i koutkem oka. */
export function tridyPolicka(stav: StavPolicka): string {
  switch (stav) {
    case 'nespocitano': return 'border-neutral-400 bg-neutral-200 text-neutral-600';
    case 'sedi': return 'border-emerald-500 bg-emerald-100 text-emerald-950';
    case 'nesedi': return 'border-rose-500 bg-rose-100 text-rose-950';
    default: return 'border-amber-400 bg-amber-100/80 text-neutral-950';
  }
}
