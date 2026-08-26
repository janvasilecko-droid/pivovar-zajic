// 🛑 Zachycení překlepu o řád při zápisu množství.
// ---------------------------------------------------------------------------
// Nejčastější nesmyslné číslo v evidenci nevzniká tím, že by někdo počítal
// špatně — vznikne přehmatem: místo 12 se uloží 120, místo 40 se uloží 400.
// Ve skladu se to pozná až u inventury, kdy se hledá, kde je chyba.
//
// Kontrola schválně NEBLOKUJE. Velká čísla jsou legitimní (velká várka,
// festival). Jen se zeptá, když je zadané množství úplně mimo to, co se
// u daného piva a obalu obvykle stáčí.
const MIN_VZORKU = 5;      // pod tím se ještě nedá říct, co je „obvyklé"
const NASOBEK = 5;         // pětinásobek běžného už stojí za dotaz
const MALE_CISLO = 20;     // u drobných počtů se výkyvy dějí běžně

/** Medián — proti průměru ho nerozhodí jeden festival ani jeden překlep. */
function median(cisla: number[]): number {
  if (!cisla.length) return 0;
  const s = [...cisla].sort((a, b) => a - b);
  const p = Math.floor(s.length / 2);
  return s.length % 2 ? s[p] : (s[p - 1] + s[p]) / 2;
}

/**
 * Vrátí text dotazu, když je množství podezřele mimo obvyklé hodnoty,
 * jinak null. Historie = dřívější množství téhož piva a obalu.
 */
export function podezreleMnozstvi(
  mnozstvi: number,
  historie: number[],
  popis: string,
): string | null {
  if (!Number.isFinite(mnozstvi) || mnozstvi <= 0) return null;
  const vzorky = historie.filter((n) => Number.isFinite(n) && n > 0);
  if (vzorky.length < MIN_VZORKU) return null;

  const obvykle = median(vzorky);
  if (obvykle <= 0) return null;
  // U malých počtů (do 20 ks) je výkyv běžný — ptát se pokaždé by z dotazu
  // udělalo šum, který se odklikává bez čtení.
  if (mnozstvi <= MALE_CISLO) return null;
  if (mnozstvi < obvykle * NASOBEK) return null;

  const nejvyssi = Math.max(...vzorky);
  return (
    `${popis}: zadáno ${mnozstvi} ks.\n\n` +
    `Obvykle to bývá ${Math.round(obvykle)} ks, nejvíc dosud ${nejvyssi} ks. ` +
    `Není to překlep o řád?`
  );
}
