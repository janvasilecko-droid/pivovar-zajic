/**
 * 🧭 Hledání podle významu (R38) — co o něm říct správci ve Správě znalostí.
 *
 * Vektory pasáží počítá worker (zpracování knih v GitHub Actions), vektor dotazu server při hledání. Správce chce
 * vědět tři věci: jestli je migrace pustená, jestli je klíč OpenAI a kolik pasáží už má vektor. Text se skládá
 * tady (čistá funkce, testovaná), komponenta ho jen ukáže.
 */
import type { StavVektoru } from './bibleKnihovnaApi';

export const MIGRACE_VEKTORY = '20261124000000_bible_vektory';
/** Ruční spuštění zpracování knih (jinak běží samo zhruba každé 3 hodiny). */
export const ODKAZ_ZPRACOVANI = 'https://github.com/janvasilecko-droid/pivovar-zajic/actions/workflows/bible-zpracovani.yml';

export type VysledekVektoru = { stav: StavVektoru } | { chyba: string; bezMigrace: boolean } | null;

const cislo = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const KLIC_CHYBI = 'řádek OPENAI_API_KEY v app_secrets hlavní appky';

/** Věta o stavu hledání podle významu; `ok` = je zapnuté a kompletní. */
export function popisVektoru(v: VysledekVektoru): { text: string; ok: boolean } {
  if (v === null) return { text: 'Načítám stav hledání podle významu…', ok: false };
  if ('chyba' in v) {
    return v.bezMigrace
      ? { text: `Hledání podle významu čeká na migraci ${MIGRACE_VEKTORY} (Systém → Databázové migrace → Databáze bible).`, ok: false }
      : { text: `Stav hledání podle významu se nenačetl: ${v.chyba}`, ok: false };
  }
  const { pasazi, sVektorem, klic } = v.stav;
  if (pasazi === 0) return { text: 'Hledání podle významu: v knihovně zatím nejsou žádné zpracované pasáže.', ok: false };
  if (!klic && sVektorem === 0) {
    return { text: `Hledání podle významu je vypnuté: chybí klíč OpenAI (${KLIC_CHYBI}). Hledá se jen podle slov.`, ok: false };
  }
  if (sVektorem >= pasazi) {
    return klic
      ? { text: `Hledání podle významu je zapnuté: všech ${cislo(pasazi)} pasáží má vektor.`, ok: true }
      : { text: `Všech ${cislo(pasazi)} pasáží má vektor, ale server nemá klíč OpenAI pro vektor dotazu (${KLIC_CHYBI}) — hledá se jen podle slov.`, ok: false };
  }
  const procenta = Math.floor((sVektorem / pasazi) * 100);
  return {
    text: `Vektory se doplňují: ${cislo(sVektorem)} z ${cislo(pasazi)} pasáží (${procenta} %).${klic ? '' : ` Server zatím nemá klíč OpenAI pro vektor dotazu (${KLIC_CHYBI}).`}`,
    ok: false,
  };
}

/** Má smysl nabídnout ruční spuštění zpracování (nějaké pasáže vektor nemají)? */
export const cekajiVektory = (v: VysledekVektoru): boolean => !!v && 'stav' in v && v.stav.pasazi > 0 && v.stav.sVektorem < v.stav.pasazi;
