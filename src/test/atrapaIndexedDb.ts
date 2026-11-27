// Atrapa IndexedDB pro testy (jsdom ji nemá): jen to, co potřebuje úložiště kopie tabulek
// (lib/offlineKopieSklad.ts) — open, jeden sklad, get / put / clear. Hodnoty se kopírují jako ve skutečné
// databázi, takže test pozná i to, co by se uložit nedalo.
type Zadost = { result?: unknown; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void; onblocked?: () => void };
type Transakce = { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: (n: string) => unknown };

export function atrapaIndexedDb() {
  /** název databáze → sklad → klíč → hodnota */
  const databaze = new Map<string, Map<string, Map<string, unknown>>>();
  const stav = { zapisSelze: false, otevreniSelze: false, cteni: 0, zapisu: 0 };
  const klon = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const pozdeji = (fn: () => void) => { void Promise.resolve().then(fn); };

  const indexedDB = {
    open(nazev: string): Zadost {
      const zadost: Zadost = {};
      pozdeji(() => {
        if (stav.otevreniSelze) { zadost.onerror?.(); return; }
        const nova = !databaze.has(nazev);
        if (nova) databaze.set(nazev, new Map());
        const sklady = databaze.get(nazev)!;
        zadost.result = {
          objectStoreNames: { contains: (n: string) => sklady.has(n) },
          createObjectStore: (n: string) => { sklady.set(n, new Map()); },
          transaction(sklad: string): Transakce {
            const t: Transakce = {
              objectStore: () => {
                const data = sklady.get(sklad)!;
                const zapis = (proved: () => unknown): Zadost => {
                  const z: Zadost = {};
                  pozdeji(() => {
                    if (stav.zapisSelze) { z.onerror?.(); t.onabort?.(); return; }
                    stav.zapisu++;
                    z.result = proved();
                    z.onsuccess?.();
                    pozdeji(() => t.oncomplete?.());
                  });
                  return z;
                };
                return {
                  get(klic: string): Zadost {
                    const z: Zadost = {};
                    pozdeji(() => { stav.cteni++; z.result = klon(data.get(klic)); z.onsuccess?.(); });
                    return z;
                  },
                  put: (hodnota: unknown, klic: string) => zapis(() => { data.set(klic, klon(hodnota)); return klic; }),
                  clear: () => zapis(() => { data.clear(); return undefined; }),
                };
              },
            };
            return t;
          },
        };
        if (nova) zadost.onupgradeneeded?.();
        zadost.onsuccess?.();
      });
      return zadost;
    },
  };
  return { indexedDB, databaze, stav };
}
