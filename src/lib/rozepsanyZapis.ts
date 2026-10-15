// 💾 Rozepsaný zápis se neztratí, dokud se neuloží nebo ručně nesmaže.
// ---------------------------------------------------------------------------
// Z provozu 15. 10. 2026: „když zadávám fasování nebo stáčení, tak ať se ta
// data, pokud je nepotvrdím, nevymažou. Když teď kliknu jinam a nepotvrdím
// stáčení, smaže se to… ať to tam je, než se to potvrdí, nebo se to musí ručně
// smazat."
//
// Na telefonu se z obrazovky vypadne kdykoli: přijde hovor, systém appku
// uspí, ukliknutí vedle dlaždice, tlačítko Zpět. Co bylo jen ve stavu
// obrazovky, je pryč. Tady se rozepsané řádky zrcadlí do úložiště zařízení
// (lib/uloziste.ts) a při dalším otevření se vrátí — mizí až po uložení do
// databáze nebo ručním „Zahodit" / „Vymazat vše".
import { useEffect, useRef, useState } from 'react';
import { nactiJson, smaz, ulozJson } from './uloziste';

export type NactenyKoncept<T> = {
  /** Kdy se naposledy ukládalo (ISO). Starší koncepty ho nemají. */
  ulozeno: string | null;
  data: T;
};

/**
 * Přečte uložený koncept. Cokoliv nečitelného nebo nesprávného tvaru
 * (starší verze appky, ruční zásah) je „žádný koncept" — rozbitý záznam se
 * nesmí dostat do formuláře.
 */
export function nactiKoncept<T extends object>(klic: string, jePlatny: (d: unknown) => d is T): NactenyKoncept<T> | null {
  const surove = nactiJson<unknown>(klic, null);
  if (!surove || typeof surove !== 'object' || Array.isArray(surove)) return null;
  const { ulozeno, ...data } = surove as Record<string, unknown>;
  if (!jePlatny(data)) return null;
  return { ulozeno: typeof ulozeno === 'string' ? ulozeno : null, data };
}

/** Uloží koncept i s časem, kdy se to stalo. */
export function ulozKoncept<T extends object>(klic: string, data: T, kdy: Date = new Date()): boolean {
  return ulozJson(klic, { ...data, ulozeno: kdy.toISOString() });
}

export function smazKoncept(klic: string): void {
  smaz(klic);
}

/**
 * Hodnota z uložených dat jako řetězec — text, ne číslo (formulářová políčka
 * drží text). Cokoliv jiného se bere jako prázdné políčko, ať se do stavu
 * nedostane `undefined` ani objekt.
 */
export function jakoText(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
}

/**
 * Řádky formuláře z uložených dat. Bere jen pole, která řádek zná (`prazdny()`
 * je vzor), a doplní chybějící — koncept uložený starší verzí appky nemá
 * novější políčka a do stavu se nesmí dostat `undefined`. Řádků je vždy
 * aspoň `minimum`, ať formulář nemá míň prázdných řádků, než čeká.
 */
export function radkyZKonceptu<T extends Record<string, string | boolean | null | undefined>>(
  radky: unknown,
  prazdny: () => T,
  minimum: number,
): T[] {
  const vzor = prazdny();
  const zdroj = Array.isArray(radky) ? radky : [];
  const out = zdroj
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r))
    .map((r) => {
      const radek = { ...vzor };
      for (const k of Object.keys(vzor) as (keyof T)[]) {
        const v = r[k as string];
        radek[k] = (typeof vzor[k] === 'boolean' ? v === true : jakoText(v)) as T[keyof T];
      }
      return radek;
    });
  while (out.length < minimum) out.push(prazdny());
  return out;
}

/** Datum ze zápisu jen v tvaru RRRR-MM-DD, jinak `null` (formulář si nechá své). */
export function platneDatum(d: unknown): string | null {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/**
 * Hook: zrcadlí `data` do úložiště a při otevření obrazovky (a při změně
 * `klic`) vrátí uložený koncept přes `naObnovu`.
 *
 * - Formulář bez obsahu (`jeCo` vrátí false) se neukládá a uložený koncept
 *   se smaže — tak zmizí po uložení do databáze i po „Vymazat vše".
 * - Ukládat se začne až PO pokusu o obnovu. Jinak by prázdný výchozí stav
 *   přepsal koncept dřív, než se stihne vrátit do formuláře.
 * - Změna `klic` při otevřené obrazovce (Fasování → Odpis) přenese rozepsané
 *   řádky pod nový klíč, jen když tam není vlastní koncept; starý koncept se
 *   pak smaže, ať se po uložení neobjeví znovu jako přízrak.
 */
export function useRozepsanyZapis<T extends object>({ klic, data, jeCo, jePlatny, naObnovu }: {
  klic: string;
  data: T;
  jeCo: (d: T) => boolean;
  jePlatny: (d: unknown) => d is T;
  naObnovu: (d: T) => void;
}): { obnoveno: { ulozeno: string | null } | null } {
  const [pripravenoPro, setPripravenoPro] = useState<string | null>(null);
  const [obnoveno, setObnoveno] = useState<{ ulozeno: string | null } | null>(null);
  const predchoziKlic = useRef<string | null>(null);
  // Funkce z volajícího se mění při každém vykreslení; do závislostí efektu
  // se nedávají, drží se poslední.
  const nejnovejsi = useRef({ jeCo, jePlatny, naObnovu });
  nejnovejsi.current = { jeCo, jePlatny, naObnovu };

  useEffect(() => {
    const koncept = nactiKoncept(klic, nejnovejsi.current.jePlatny);
    if (koncept && nejnovejsi.current.jeCo(koncept.data)) {
      nejnovejsi.current.naObnovu(koncept.data);
      setObnoveno({ ulozeno: koncept.ulozeno });
    } else {
      if (predchoziKlic.current !== null && predchoziKlic.current !== klic) smazKoncept(predchoziKlic.current);
      setObnoveno(null);
    }
    predchoziKlic.current = klic;
    setPripravenoPro(klic);
  }, [klic]);

  // Podle obsahu, ne podle identity objektu — formuláře skládají `data`
  // znovu při každém vykreslení.
  const podoba = JSON.stringify(data);
  useEffect(() => {
    if (pripravenoPro !== klic) return;
    if (nejnovejsi.current.jeCo(data)) {
      ulozKoncept(klic, data);
    } else {
      smazKoncept(klic);
      setObnoveno(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podoba, klic, pripravenoPro]);

  return { obnoveno };
}
