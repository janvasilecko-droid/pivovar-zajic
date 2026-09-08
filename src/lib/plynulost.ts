/**
 * 📉 Změř sekání na SKUTEČNÉM telefonu a nabídni, co s tím.
 *
 * Proč to musí měřit až appka a ne já: sekání se dá poznat jen na tom
 * zařízení, kde k němu dochází. Zkoušel jsem to nasimulovat v prohlížeči
 * na serveru se zpomaleným procesorem (scripts/vykon.mjs) a i při 10×
 * zpomalení držel 16,7 ms na snímek — serverový prohlížeč nemá kompozitor
 * telefonu, takže cenu skleněného rozostření vůbec nezaplatí.
 *
 * Tenhle modul tedy počítá délky snímků přímo v provozu, na tom telefonu,
 * kde se appka používá. Když je jich dost dlouhých, JEDNOU nabídne přepnutí
 * na „méně efektů" (lib/efekty.ts) — a víc už nikdy, ať to neotravuje.
 *
 * Zásady:
 *  • Neměří se hned po startu. Prvních pár vteřin appka stahuje a staví
 *    obrazovku, takže by dlouhé snímky změřila i na rychlém telefonu.
 *  • Měří se jen když je appka VIDĚT. Na pozadí prohlížeč snímky škrtí
 *    schválně a vyšlo by z toho „sekáš" u každého.
 *  • Rozhoduje počet ZAHOZENÝCH snímků, ne průměr. Průměr utopí přesně to,
 *    co člověk vnímá — jedno trhnutí za vteřinu.
 *  • Nic se neposílá pryč. Výsledek zůstává v telefonu.
 */
import { mensiEfekty, nastavEfekty } from './efekty';
import { nacti, uloz } from './uloziste';

const KLIC_NABIDNUTO = 'minipivovar_plynulost_nabidnuto';

/** Snímek delší než tohle člověk uvidí jako trhnutí (60 Hz = 16,7 ms). */
const DLOUHY_SNIMEK_MS = 34;
/** Kolik snímků se sbírá, než se rozhodne. */
const SNIMKU = 180;
/** Od kolika procent zahozených snímků se to nabídne. */
const PRAH_PODIL = 0.2;
/** Než se začne měřit — ať se nezměří stavění první obrazovky. */
const ODKLAD_MS = 6000;

export type VysledekMereni = {
  snimku: number;
  dlouhych: number;
  podil: number;
  median: number;
  seka: boolean;
};

/** Vyhodnotí naměřené délky snímků. Oddělené kvůli testům. */
export function vyhodnot(delky: number[]): VysledekMereni {
  const platne = delky.filter((d) => d > 0 && d < 2000);
  if (platne.length < 30) {
    // Málo dat = žádný závěr. Radši mlčet než hádat.
    return { snimku: platne.length, dlouhych: 0, podil: 0, median: 0, seka: false };
  }
  const dlouhych = platne.filter((d) => d >= DLOUHY_SNIMEK_MS).length;
  const serazene = [...platne].sort((a, z) => a - z);
  const podil = dlouhych / platne.length;
  return {
    snimku: platne.length,
    dlouhych,
    podil,
    median: serazene[Math.floor(serazene.length / 2)],
    seka: podil >= PRAH_PODIL,
  };
}

/** Nabídlo se to už? (Nabízí se jednou za život instalace.) */
export function uzNabidnuto(): boolean {
  return nacti(KLIC_NABIDNUTO) === '1';
}
function zapamatujNabidnuto() {
  uloz(KLIC_NABIDNUTO, '1');
}

/** Má se vůbec měřit? */
export function maSeMerit(): boolean {
  if (typeof window === 'undefined') return false;
  if (mensiEfekty()) return false;   // už je vypnuto, není co nabízet
  if (uzNabidnuto()) return false;   // jednou a dost
  return true;
}

/**
 * Změří délky snímků. Vrací je, jakmile jich je dost — nebo dřív, když
 * uživatel odejde z appky (pak jich je málo a `vyhodnot` mlčí).
 */
export function zmerSnimky(pocet = SNIMKU): Promise<number[]> {
  return new Promise((hotovo) => {
    const delky: number[] = [];
    let posledni = performance.now();
    const tik = () => {
      const ted = performance.now();
      delky.push(ted - posledni);
      posledni = ted;
      if (document.hidden || delky.length >= pocet) { hotovo(delky.slice(1)); return; }
      requestAnimationFrame(tik);
    };
    requestAnimationFrame(tik);
  });
}

/**
 * Spustí měření a případně nabídne vypnutí efektů.
 * `nabidni` je předaná zvenčí (toast), ať modul nezávisí na UI a jde testovat.
 */
export async function hlidejPlynulost(
  nabidni: (text: string, zapnout: () => void) => void,
  // Odklad a počet snímků jdou nastavit kvůli testům. Volat je s jinými
  // hodnotami v appce nemá důvod: krátký odklad by změřil stavění první
  // obrazovky a málo snímků nedá závěr (viz `vyhodnot`).
  { odklad = ODKLAD_MS, pocet = SNIMKU }: { odklad?: number; pocet?: number } = {}
): Promise<VysledekMereni | null> {
  if (!maSeMerit()) return null;
  await new Promise((r) => setTimeout(r, odklad));
  if (document.hidden || !maSeMerit()) return null;

  const vysledek = vyhodnot(await zmerSnimky(pocet));
  if (!vysledek.seka) return vysledek;

  zapamatujNabidnuto();
  nabidni(
    `Aplikace se na tomhle telefonu trhá (${Math.round(vysledek.podil * 100)} % snímků). ` +
    'Pomůže vypnout skleněné efekty a blikání.',
    () => nastavEfekty(true)
  );
  return vysledek;
}
