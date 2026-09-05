import { useCallback, useEffect, useRef } from 'react';

/**
 * 🧯 Zámek na dvě věci, které se stanou při každém přenačtení na telefonu:
 * odpověď, která dorazí, až když už obrazovka není vidět — a odpověď, která
 * dorazí PO novější odpovědi a přepíše ji zpátky na starší stav.
 *
 * Proč to v aplikaci vzniká:
 *
 *   1. Otevření obrazovky spustí 13–17 dotazů naráz (Stáčení KEG jich má 17).
 *      Když člověk mezitím přepne jinam, odpovědi se pořád vrací a zapisují
 *      do komponenty, která už není na obrazovce.
 *   2. `useRealtime` přenačítá při KAŽDÉ změně v odebíraných tabulkách. Šest
 *      lidí v provozu znamená víc přenačtení najednou a mobilní připojení
 *      nezaručuje, že se vrátí v pořadí, v jakém odešla. Když se starší
 *      odpověď vrátí jako druhá, přepíše novější data.
 *
 * Hlásí se to jako „ukázalo mi to staré číslo" a nedá se to zopakovat —
 * proto to tak dlouho vydrželo.
 *
 * Použití je jeden řádek u načítací funkce a jeden před zápisem do stavu:
 *
 * ```ts
 * const zacniNacteni = usePosledniNacteni();
 *
 * async function load(silent = false) {
 *   const smiZapsat = zacniNacteni();
 *   const [a, b] = await Promise.all([...]);
 *   if (!smiZapsat()) return;      // ← novější načtení už běží, nebo je po odchodu
 *   setA(a); setB(b);
 * }
 * ```
 *
 * `smiZapsat()` vrátí false, když se mezitím spustilo další načtení nebo se
 * komponenta odpojila. Nic neruší samotný dotaz (ten už letí) — jen zahodí
 * jeho výsledek, což je přesně to, o co jde.
 */
export function usePosledniNacteni() {
  /** Pořadové číslo posledního spuštěného načtení. */
  const beh = useRef(0);
  /** Je komponenta ještě na obrazovce? */
  const zivy = useRef(true);

  useEffect(() => {
    // Ve StrictMode (vývoj) se efekt spustí, uklidí a spustí znovu — proto se
    // `zivy` na začátku vrací na true, ne jen nastavuje na false v úklidu.
    zivy.current = true;
    return () => { zivy.current = false; };
  }, []);

  return useCallback(() => {
    const moje = ++beh.current;
    return () => zivy.current && beh.current === moje;
  }, []);
}

/**
 * Vezme výsledky ze Supabase a vrátí text první chyby, nebo null.
 *
 * Proč: načítací funkce v aplikaci braly data zápisem `(kg.data as X[]) ?? []`
 * a `.error` nikdo nečetl. Když dotaz selhal — vypadlé připojení ve sklepě,
 * chybějící migrace, zamítnuté právo — obrazovka se vykreslila jako PRÁZDNÁ.
 * „Nemáš žádné stočení" a „nepodařilo se ho načíst" jsou přitom dvě úplně
 * jiné zprávy: u první se nemá dělat nic, u druhé zkusit znovu.
 *
 * `EmptyState` má pro tenhle rozdíl variantu `chyba` už od v2.273, jenže se
 * do 5. 9. 2026 nepoužila ani jednou — nebylo z čeho ji zapnout.
 */
export function prvniChyba(
  ...vysledky: ({ error?: { message?: string } | null } | null | undefined)[]
): string | null {
  for (const v of vysledky) {
    const zprava = v?.error?.message;
    if (zprava) return zprava;
  }
  return null;
}
