/**
 * ⚡ Načtení obrazovky, které přežije nasazení nové verze.
 *
 * PROBLÉM, KTERÝ TO ŘEŠÍ: appka se dělí na kousky (`lazy(() => import(...))`)
 * a každý kousek má v názvu otisk obsahu — `TimersScreen-CKtmL-pC.js`. Po
 * nasazení nové verze mají kousky nové názvy a ty staré na serveru končí.
 * Kdo měl appku otevřenou z minulé verze a klepl na obrazovku, kterou ještě
 * nenačetl, dostal „Failed to fetch dynamically imported module" a červenou
 * obrazovku s výzvou vyčistit mezipaměť. V provozu se to stalo dvakrát jen
 * 7. 9. 2026 (viz tabulka app_errors, obrazovky Fasování a Časovač).
 *
 * ŘEŠENÍ: nedovolit, aby se to k červené obrazovce vůbec dostalo.
 *   1. První pokus normálně.
 *   2. Když spadne, počkat chvíli a zkusit znovu — na mobilní síti bývá
 *      první selhání jen výpadek spojení, ne stará verze.
 *   3. Když spadne i podruhé, je to opravdu stará verze: jednou (a jen
 *      jednou za relaci) se stránka tvrdě načte znovu, což stáhne aktuální
 *      index.html s novými názvy kousků.
 *
 * Pojistka proti smyčce je klíč v sessionStorage: druhý pád po reloadu už
 * reload nespustí a chyba propadne do ErrorBoundary — nekonečné obnovování
 * je horší než chybová hláška, protože se z něj uživatel nedostane vůbec.
 */
import { lazy, type ComponentType } from 'react';

const KLIC_RELOADU = 'lazy_reload_po_nasazeni';
const PRODLEVA_MS = 400;

function jeStaryKousek(e: unknown): boolean {
  const zprava = String((e as Error)?.message ?? e ?? '');
  return (
    zprava.includes('dynamically imported module') ||
    zprava.includes('Importing a module script failed') ||
    zprava.includes('Failed to fetch') ||
    zprava.includes('error loading dynamically imported module')
  );
}

function pockej(ms: number): Promise<void> {
  return new Promise((hotovo) => setTimeout(hotovo, ms));
}

/**
 * Jako `lazy(() => import(...))`, ale s opakováním a jedním tvrdým načtením.
 *
 * @param nacti Funkce, která vrací `import('./…')`. Musí to být funkce,
 *   ne hotový příslib — druhý pokus potřebuje import spustit znovu.
 */
export function lazyStranka<T extends ComponentType<any>>(
  nacti: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await nacti();
    } catch (prvni) {
      if (!jeStaryKousek(prvni)) throw prvni;

      await pockej(PRODLEVA_MS);
      try {
        return await nacti();
      } catch (druhy) {
        if (!jeStaryKousek(druhy)) throw druhy;

        let uzSeReloadovalo = false;
        try { uzSeReloadovalo = sessionStorage.getItem(KLIC_RELOADU) === '1'; } catch { /* privátní režim */ }

        if (!uzSeReloadovalo) {
          try { sessionStorage.setItem(KLIC_RELOADU, '1'); } catch { /* nevadí, jen přijdeme o pojistku */ }
          // `reload()` stáhne index.html znovu — s odkazy na aktuální kousky.
          window.location.reload();
          // Příslib se schválně nikdy nesplní: stránka se právě zahazuje
          // a vyhozená chyba by ještě stihla probliknout červenou obrazovku.
          return await new Promise<{ default: T }>(() => {});
        }
        throw druhy;
      }
    }
  });
}

/** Po úspěšném načtení appky pojistku uklidit, ať platí zase pro příště. */
export function uklidPojistkuReloadu(): void {
  try { sessionStorage.removeItem(KLIC_RELOADU); } catch { /* nevadí */ }
}
