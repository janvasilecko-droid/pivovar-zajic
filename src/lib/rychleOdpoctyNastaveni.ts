// ⏱️ Uložené nastavení rychlých odpočtů v liště (lib/rychleOdpocty.ts).
// ---------------------------------------------------------------------------
// Ukládá se do úložiště prohlížeče a synchronizuje přes profiles.home_layout
// (pole `rychleOdpocty`), takže stejný účet má stejnou lištu na telefonu
// i na počítači — stejně jako poznámky a odpočty (lib/profileSync.ts).
import { uloz } from './uloziste';
import { queueHomeLayoutPatch } from './profileSync';
import { zalogujANahlas } from './chybyHlaseni';
import { BEZ_NASTAVENI, normalizujNastaveni, type NastaveniRychlychOdpoctu } from './rychleOdpocty';

const KLIC = 'pivovar_rychle_odpocty_v1';
export const RYCHLE_ODPOCTY_NASTAVENI_EVENT = 'pivovar_rychle_odpocty_nastaveni';

export function getNastaveniRychlychOdpoctu(): NastaveniRychlychOdpoctu {
  try {
    const raw = localStorage.getItem(KLIC);
    if (raw) return normalizujNastaveni(JSON.parse(raw));
  } catch {
    // rozbitý záznam = výchozí lišta
  }
  return BEZ_NASTAVENI;
}

/**
 * @param zCloudu Hodnota přišla ze serveru — neposílat ji rovnou zpátky
 *   (viz saveHomeNotes: jinak by každé převzetí z cloudu spustilo zápis).
 */
export function saveNastaveniRychlychOdpoctu(nastaveni: NastaveniRychlychOdpoctu, zCloudu = false): void {
  try {
    uloz(KLIC, JSON.stringify(nastaveni));
    window.dispatchEvent(new CustomEvent(RYCHLE_ODPOCTY_NASTAVENI_EVENT, { detail: nastaveni }));
  } catch (e) {
    zalogujANahlas('Chyba při ukládání rychlých odpočtů', e);
  }
  if (zCloudu) return;
  queueHomeLayoutPatch({ rychleOdpocty: nastaveni });
}
