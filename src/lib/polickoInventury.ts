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

/**
 * Třídy pro `<input>` podle stavu — barví se CELÉ POZADÍ, ne jen rámeček.
 *
 * Rámeček je na telefonu za světla k nepoznání a v tabulce o sedmi sloupcích
 * ho oko přehlédne úplně. Plná zelená a plná červená se poznají i koutkem
 * oka, takže se v seznamu hledají jen červené řádky.
 *
 * Odstín 600 s bílým písmem schválně: světlejší zelená s tmavým textem
 * neprojde měřením kontrastu (viz scripts/zkontroluj-kontrast.mjs).
 */
export function tridyPolicka(stav: StavPolicka): string {
  switch (stav) {
    case 'nespocitano': return 'border-neutral-800 bg-neutral-600 text-white';
    case 'sedi': return 'border-emerald-900 bg-emerald-700 text-white';
    case 'nesedi': return 'border-rose-900 bg-rose-700 text-white';
    default: return 'border-amber-400 bg-amber-100/80 text-neutral-950';
  }
}
