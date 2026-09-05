/**
 * Stavy objednávky — jedno místo pro popisek, barvu i tvar.
 *
 * Do 5. 9. 2026 to bylo zapsané uvnitř `Orders.tsx` (soubor o 3 800 řádcích)
 * a pět stavů z osmi mělo JEDNU barvu a čtyři z nich stejný popisek, takže ze
 * seznamu nešlo poznat naloženo od odbaveného. Jinde se stav překládal
 * potřetí a jinak — `QuickSearchModal` zná jen „zavezeno / storno /
 * nevyřízená".
 *
 * Postup je teď vidět odstupňováním (světlá zelená → sytější → tmavá) a
 * hlavně TVAREM: `znak` nese tutéž informaci i pro toho, kdo barvy
 * rozlišuje jinak — a ve sklepě v mizerném světle to je každý. Stejný
 * princip jako popis plnosti tanku slovem.
 *
 * Proč v `lib/` a ne u obrazovky: potřebuje to hledání, závoz i cokoliv, co
 * objednávku ukáže. Druhá kopie významů je přesně to, co dělá z jedné
 * aplikace čtyři.
 */
export type StavObjednavky = {
  /** Co se napíše na štítek. */
  label: string;
  /** Třídy pozadí, písma a rámečku — vždy z palety, nikdy natvrdo. */
  cls: string;
  /** Tvar vedle popisku, aby stav nenesla jen barva. */
  znak: string;
};

export const STAVY_OBJEDNAVKY: Record<string, StavObjednavky> = {
  nova: { label: 'Nová', cls: 'bg-primary-50 text-primary-700 border-primary-200', znak: '•' },
  pripravena: { label: 'Připravená', cls: 'bg-amber-50 text-amber-800 border-amber-200', znak: '◐' },
  // Popisek „Expedovaná" zůstává — je to slovo, které se v pivovaru používá,
  // a hromadná akce se jmenuje „Expedovat". Rozlišuje odstín a tvar.
  expedovana: { label: 'Expedovaná', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', znak: '↑' },
  vyrizeno_zavoz: { label: 'Zavezeno', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300', znak: '✓' },
  vyrizeno: { label: 'Vyřízeno', cls: 'bg-emerald-200 text-emerald-950 border-emerald-300', znak: '✓✓' },
  vyrizena: { label: 'Vyřízeno', cls: 'bg-emerald-200 text-emerald-950 border-emerald-300', znak: '✓✓' },
  hotova: { label: 'Hotová', cls: 'bg-emerald-200 text-emerald-950 border-emerald-300', znak: '✓✓' },
  storno: { label: 'Storno', cls: 'bg-rose-50 text-rose-700 border-rose-200', znak: '✕' },
};

/**
 * Popisek stavu pro místa, kde se kreslí jen text (hledání, souhrny).
 * Neznámý stav se vrátí tak, jak přišel — radši syrový název než „—",
 * protože podle něj se dá dohledat, co se v databázi objevilo.
 */
export function popisStavu(status: string | null | undefined): string {
  if (!status) return 'Nová';
  return STAVY_OBJEDNAVKY[status]?.label ?? status;
}

/** Je objednávka odbavená? (zavezená nebo vyřízená, ne stornovaná) */
export function jeVyrizena(status: string | null | undefined): boolean {
  return status === 'vyrizeno_zavoz' || status === 'vyrizeno'
    || status === 'vyrizena' || status === 'hotova';
}
