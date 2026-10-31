// Časovače, které po konci testového souboru ještě běží.
//
// Komponenta, která si pustí setTimeout a při odpojení ho nezruší, je v provozu
// neškodná (React 18 setState na odpojené komponentě tiše zahodí). V testech
// ale časovač doběhne až po zrušení jsdom, sáhne na neexistující `window`
// a vitest shodí CELÝ běh, i když všechny testy prošly. Takhle dvakrát spadlo
// nasazení: KEG 28. 10. 2026 (#446) a Prodejna 31. 10. 2026 (běh #1181).
// Komponenty se opravují jednotlivě (časovač v refu, zrušit při odpojení);
// tohle je pojistka pro ty, na které se zatím nepřišlo.

type Casovace = Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
type Hlidac = { bezici: Set<unknown> };

const ZNACKA = Symbol.for('pivovar-zajic.hlidaneCasovace');

/**
 * Začne evidovat časovače spuštěné přes `cil.setTimeout` (výchozí globalThis).
 * Opakované volání nad stejným cílem obal nevrší — vrátí stávající hlídač.
 * `zrusBezici()` zruší všechny, které ještě neproběhly ani nebyly zrušené.
 */
export function hlidejCasovace(cil: Casovace = globalThis): { zrusBezici: () => number } {
  const stavajici = (cil.setTimeout as unknown as Record<symbol, Hlidac | undefined>)[ZNACKA];
  const hlidac: Hlidac = stavajici ?? { bezici: new Set() };

  if (!stavajici) {
    const puvodniSet = cil.setTimeout;
    const puvodniClear = cil.clearTimeout;
    const obal = ((fn: unknown, ms?: number, ...args: unknown[]) => {
      if (typeof fn !== 'function') return puvodniSet(fn as never, ms, ...args);
      const h = puvodniSet(() => {
        hlidac.bezici.delete(h);
        (fn as (...a: unknown[]) => void)(...args);
      }, ms);
      hlidac.bezici.add(h);
      return h;
    }) as unknown as typeof setTimeout;
    Object.defineProperty(obal, ZNACKA, { value: hlidac });
    const zrus = ((h?: Parameters<typeof clearTimeout>[0]) => {
      hlidac.bezici.delete(h);
      return puvodniClear(h);
    }) as typeof clearTimeout;
    cil.setTimeout = obal;
    cil.clearTimeout = zrus;
  }

  return {
    zrusBezici() {
      const pocet = hlidac.bezici.size;
      for (const h of hlidac.bezici) cil.clearTimeout(h as Parameters<typeof clearTimeout>[0]);
      hlidac.bezici.clear();
      return pocet;
    },
  };
}
