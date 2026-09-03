/**
 * Knihovna na Excel až na vyžádání.
 *
 * `xlsx-js-style` váží 628 kB (323 kB komprimovaně) — je to největší jeden
 * kus celé aplikace. Importovalo se staticky z jedenácti obrazovek (Sklad,
 * Historie, Závoz, Stáčení, Uživatelé, sanitační deníky…), takže se
 * stahovala prakticky každému, kdo appku otevřel — ať už kdy něco
 * exportoval, nebo ne. Export přitom dělá jeden člověk jednou za měsíc.
 *
 * Modul se drží v paměti (`modul`), takže druhý export už nic nestahuje.
 *
 * PROČ DVĚ FUNKCE: `nactiXlsx()` je asynchronní a musí ji zavolat vstupní
 * bod exportu. `xlsx()` je synchronní a používá se ve vnitřních funkcích,
 * které se kvůli tomu nemusely přepsat na async (a jejich testy zůstaly,
 * jaké byly). Když si někdo `xlsx()` zavolá bez načtení, dozví se to hned
 * výjimkou — a ne tichým `undefined.utils` někde uprostřed sešitu.
 */

let modul: any = null;
let nacitani: Promise<any> | null = null;

/** Načte knihovnu (nebo vrátí už načtenou). Dvě souběžná volání ji stáhnou jednou. */
export async function nactiXlsx(): Promise<any> {
  if (modul) return modul;
  if (!nacitani) {
    nacitani = import('xlsx-js-style').then((m) => {
      modul = (m as any).default ?? m;
      return modul;
    });
  }
  return nacitani;
}

/** Už načtená knihovna. Vyhodí výjimku, když se zapomnělo na `nactiXlsx()`. */
export function xlsx(): any {
  if (!modul) {
    throw new Error(
      'Knihovna na Excel není načtená — před stavbou sešitu se musí zavolat nactiXlsx().',
    );
  }
  return modul;
}

/** Je knihovna už v paměti? (Kvůli testům a diagnostice.) */
export function jeXlsxNacteny(): boolean {
  return modul !== null;
}
