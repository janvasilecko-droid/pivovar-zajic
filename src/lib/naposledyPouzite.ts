/**
 * „Naposledy použité" — co se v pivovaru zapisuje denně, má být první.
 *
 * Při zápisu stáčení, výdeje i odpisu se vybírá z celého číselníku piv,
 * i když se 90 % zápisů týká tří piv. Čtvrté pivo odspodu se pak hledá
 * očima stejně dlouho jako to, co se stáčí každý den.
 *
 * DRŽÍ SE TO U UŽIVATELE, NE V DATABÁZI. Je to ryze osobní pohodlí —
 * prodejna sahá na jiná piva než sklep — a databáze je na data o pivovaru,
 * ne na to, kdo si co kliknul. Když se úložiště nedá přečíst, pořadí
 * zůstane výchozí; nic se nerozbije.
 */

/** Kolik naposledy použitých se drží. Víc už není „naposledy". */
export const KOLIK_NAPOSLED = 5;

export type UlozisteVyberu = Pick<Storage, 'getItem' | 'setItem'>;

function vychoziUloziste(): UlozisteVyberu | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Klíč je na uživatele A na místo použití: kdo stáčí, sahá na jiná piva
 * než kdo vydává na prodejně, a slévat to do jednoho seznamu by pořadí jen
 * rozhodilo.
 */
export function klicVyberu(kde: string, userId: string | null | undefined): string {
  return `pivovar_naposled_${kde}_${userId || 'guest'}`;
}

/** Přečte seznam naposledy použitých id (nejnovější první). */
export function nactiNaposled(klic: string, uloziste?: UlozisteVyberu | null): string[] {
  const store = uloziste === undefined ? vychoziUloziste() : uloziste;
  if (!store) return [];
  try {
    const raw = store.getItem(klic);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, KOLIK_NAPOSLED);
  } catch {
    return [];
  }
}

/**
 * Zapamatuje si právě vybrané id. Vrací nový seznam, ať se s ním dá hned
 * pracovat, aniž by se muselo čekat na čtení z úložiště.
 *
 * Opakovaný výběr téhož id ho posune na začátek, nezdvojí.
 */
export function zapamatujVyber(
  klic: string,
  id: string,
  uloziste?: UlozisteVyberu | null,
): string[] {
  if (!id) return nactiNaposled(klic, uloziste);
  const bez = nactiNaposled(klic, uloziste).filter((x) => x !== id);
  const novy = [id, ...bez].slice(0, KOLIK_NAPOSLED);
  const store = uloziste === undefined ? vychoziUloziste() : uloziste;
  if (store) {
    try { store.setItem(klic, JSON.stringify(novy)); } catch { /* plné úložiště */ }
  }
  return novy;
}

/**
 * Přerovná seznam: naposledy použité dopředu (v pořadí, jak se používaly),
 * zbytek ZŮSTANE v původním pořadí.
 *
 * Původní pořadí se schválně nemíchá: číselník je seřazený podle `sort_order`,
 * což je pořadí, ve kterém piva v pivovaru chodí. Kdo hledá pivo, které
 * naposledy nepoužil, ho pak najde tam, kde ho vždycky měl.
 */
export function serazPodleNaposled<T>(
  polozky: T[],
  idPolozky: (p: T) => string,
  naposled: string[],
): T[] {
  if (naposled.length === 0) return polozky;
  const poradi = new Map(naposled.map((id, i) => [id, i]));
  const prvni: T[] = [];
  const zbytek: T[] = [];
  for (const p of polozky) {
    (poradi.has(idPolozky(p)) ? prvni : zbytek).push(p);
  }
  prvni.sort((a, b) => (poradi.get(idPolozky(a)) ?? 0) - (poradi.get(idPolozky(b)) ?? 0));
  return [...prvni, ...zbytek];
}
