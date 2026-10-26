// Kam se vrátit po klepnutí na Aktualizovat.
//
// Obnovení stránky zahodí stav Reactu. Rozepsané řádky už leží v localStorage
// (lib/rozepsanyZapis.ts a podobné klíče) a tahle obnova je nemaže — smaže se
// jen místo v sessionStorage, a to až ve chvíli, kdy ho appka přečte.
// Skladová kniha se tudy nezapisuje.

const KLIC = 'misto_po_aktualizaci';

export type MistoVAplikaci = {
  page: string;
  subTab: string;
};

let zapamatovano: MistoVAplikaci = { page: 'home', subTab: '' };
// Jedno přečtení na načtení modulu. Strict Mode ve vývoji volá inicializaci
// stavu dvakrát; podruhé už by klíč v sessionStorage nebyl.
let precteno: MistoVAplikaci | null | undefined;

/** Appka hlásí, která obrazovka a záložka je právě otevřená. */
export function zapamatujMisto(page: string, subTab: string): void {
  zapamatovano = { page, subTab: subTab || '' };
}

/** Zavolá se těsně před reloadem. Do localStorage nesahá.
 *  Paměť „už přečteno" se neresetuje — jinak by ještě běžící stránka
 *  klíč spotřebovala dřív, než se prohlížeč obnoví. */
export function ulozMistoPredObnovou(): void {
  try {
    sessionStorage.setItem(KLIC, JSON.stringify(zapamatovano));
  } catch {
    /* privátní režim — po obnovení se otevře Domů, rozepsaná data zůstanou */
  }
}

/** Jednorázově vrátí místo uložené před aktualizací. */
export function nactiMistoPoAktualizaci(): MistoVAplikaci | null {
  if (precteno !== undefined) return precteno;
  precteno = null;
  try {
    const surove = sessionStorage.getItem(KLIC);
    sessionStorage.removeItem(KLIC);
    if (!surove) return null;
    const data = JSON.parse(surove) as Partial<MistoVAplikaci>;
    if (!data || typeof data.page !== 'string' || !data.page) return null;
    precteno = { page: data.page, subTab: typeof data.subTab === 'string' ? data.subTab : '' };
    return precteno;
  } catch {
    return null;
  }
}
