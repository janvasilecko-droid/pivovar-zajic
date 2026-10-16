// 🔎 Předvýběr pro Sklad → Pohyby (components/PohybySkladu.tsx): pivo, obal
// a týden. Samostatně, ať plocha kvůli jednomu proklik nenačítá celou
// obrazovku pohybů (30. 9. 2026: „když na to kliknu, ať se jednoduše
// prokliknu k historii — nejčastěji týden").
import { ulozJson } from './uloziste';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';

export const LS_POHYBY_FILTR = 'pohyby_skladu_filtr_v1';
export const LS_POHYBY_REZIM = 'pohyby_skladu_rezim_v1';

export const LS_POHYBY_MESIC = 'pohyby_skladu_mesic_v1';

/**
 * `mesic` (YYYY-MM) = otevřít celý měsíc — z Inventury (1. 10. 2026: „nesedí
 * mi data v inventuře, projdi to"), jinak aktuální týden.
 */
export function predvyberPohyby(beerId: string, packageId: string, mesic?: string) {
  ulozJson(LS_POHYBY_FILTR, { beerId, packageId });
  ulozJson(LS_POHYBY_REZIM, mesic ? 'mesic' : 'tyden');
  if (mesic) ulozJson(LS_POHYBY_MESIC, mesic);
}

/**
 * Dlaždice Rozbor na ploše (16. 10. 2026: „tohle má být na úvodní stránce,
 * rozbor — od začátku měsíce, s možností filtrovat třeba jen týden"): Pohyby
 * se otevřou na celém aktuálním měsíci. Vybrané pivo a obal se nemění.
 */
export function predvyberRozbor(dnes: string) {
  ulozJson(LS_POHYBY_REZIM, 'mesic');
  ulozJson(LS_POHYBY_MESIC, dnes.slice(0, 7));
}

export type TydenMesice = { klic: string; cislo: string; od: string; doDne: string };

/**
 * Týdny, které zasahují do měsíce (RRRR-MM), od prvního: klíč týdne
 * (RRRR-TT), jeho číslo a dny měsíce, které do něj padnou (např. 1.–4. 10.).
 */
export function tydnyMesice(mesic: string): TydenMesice[] {
  if (!/^\d{4}-\d{2}$/.test(mesic)) return [];
  const rok = Number(mesic.slice(0, 4));
  const mes = Number(mesic.slice(5, 7));
  const dnu = new Date(Date.UTC(rok, mes, 0)).getUTCDate();
  const tydny: TydenMesice[] = [];
  for (let d = 1; d <= dnu; d++) {
    const den = `${mesic}-${String(d).padStart(2, '0')}`;
    const klic = isoWeekKey(den);
    const posledni = tydny[tydny.length - 1];
    if (posledni && posledni.klic === klic) posledni.doDne = den;
    else tydny.push({ klic, cislo: klic.split('-')[1], od: den, doDne: den });
  }
  return tydny;
}
