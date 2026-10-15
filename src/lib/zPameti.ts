// 📵 „Tohle číslo je z paměti telefonu, ne ze serveru" — aby se to poznalo.
// ---------------------------------------------------------------------------
// Když dotaz na server vyprší nebo selže (slabý signál ve sklepě, výpadek),
// appka odpoví z paměti telefonu (supabase.ts, serveCached) — a to je správně:
// kdo pracuje bez signálu, má vidět aspoň poslední známý stav. Jenže obrazovky
// Skladu skládají čísla z deseti tabulek, každá z paměti jiného stáří, a nikdo
// se nedozvěděl, že se zrovna tohle stalo. Z provozu 15. 10. 2026: Jantar 50 l
// „na začátku 3", i když je v databázi 2 („občas se nechce načíst sklad") — a
// telefon měl ten den slabý signál bez mobilních dat.
//
// Tady se jen zapíše, KDY se naposledy odpovědělo z paměti. Kdo načítá data,
// si před dotazem vezme čas a po dotazu se zeptá `dataZPametiOd`. Je to
// záměrně hrubé (platí pro všechny dotazy v appce): radši zbytečné varování
// než čísla, která se tváří jako aktuální a nejsou.
let posledniOdpovedZPameti = 0;

/** Poznačí, že se právě odpovědělo z paměti telefonu. */
export function zapisZPameti(kdy: number = Date.now()): void {
  posledniOdpovedZPameti = kdy;
}

/** Odpovědělo se od času `ts` aspoň jednou z paměti telefonu? */
export function dataZPametiOd(ts: number): boolean {
  return posledniOdpovedZPameti > 0 && posledniOdpovedZPameti >= ts;
}

/** Pro testy. */
export function vycistiZPameti(): void {
  posledniOdpovedZPameti = 0;
}

/** Zdroj dat tak, jak ho vrací dotaz: data, případně chyba. */
export type ZdrojDat = { data?: unknown; error?: { message?: string } | null };

/**
 * Které zdroje se nenačetly (chyba, nebo žádná data). Skladová kniha, ze které
 * chybí tabulka, nesmí vypočítat stav — „chybějící pohyby" jsou pro ni nuly,
 * a sklad by se tvářil, že je všechno v pořádku.
 */
export function chybejiciZdroje(zdroje: Record<string, ZdrojDat | null | undefined>): string[] {
  return Object.entries(zdroje)
    .filter(([, z]) => !z || z.error || z.data === null || z.data === undefined)
    .map(([nazev]) => nazev);
}

/** Chyba „nepodařilo se načíst všechna data" — nese seznam zdrojů, které chyběly. */
export class NeuplnaDataError extends Error {
  readonly zdroje: string[];
  constructor(zdroje: string[]) {
    super(`Chybí data: ${zdroje.join(', ')} — čísla by byla neúplná, proto se nepočítají.`);
    this.name = 'NeuplnaDataError';
    this.zdroje = zdroje;
  }
}
