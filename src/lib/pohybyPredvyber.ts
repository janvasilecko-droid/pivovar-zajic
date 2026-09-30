// 🔎 Předvýběr pro Sklad → Pohyby (components/PohybySkladu.tsx): pivo, obal
// a týden. Samostatně, ať plocha kvůli jednomu proklik nenačítá celou
// obrazovku pohybů (30. 9. 2026: „když na to kliknu, ať se jednoduše
// prokliknu k historii — nejčastěji týden").
import { ulozJson } from './uloziste';

export const LS_POHYBY_FILTR = 'pohyby_skladu_filtr_v1';
export const LS_POHYBY_REZIM = 'pohyby_skladu_rezim_v1';

export function predvyberPohyby(beerId: string, packageId: string) {
  ulozJson(LS_POHYBY_FILTR, { beerId, packageId });
  ulozJson(LS_POHYBY_REZIM, 'tyden');
}
