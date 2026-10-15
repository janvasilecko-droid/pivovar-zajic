// 📅 Datum posledního zápisu — odkud se čte tabulka z fotky.
// Zvlášť malý soubor: obrazovky (Lahve, KEG, Prodejna) ho potřebují hned při
// načtení, kdežto čtení tabulky (lib/tabulkaStaceni.ts) se stahuje až s oknem
// zadávání z fotky.
import { puvodZapisu } from './puvodZapisu';

/**
 * Datum posledního zápisu, který udělal člověk — bez zápisů, které appka
 * založila sama (zaškrtnutá kapka „Stočeno", opravy po inventuře), a bez
 * minusových oprav. Tabulka se čte od dne po něm.
 */
export function posledniRucniZapis(rows: { entry_date?: string | null; quantity?: number | string | null; note?: string | null }[]): string | null {
  let nejnovejsi: string | null = null;
  for (const r of rows) {
    if (!r.entry_date || !(Number(r.quantity) > 0) || puvodZapisu(r.note)?.automaticky) continue;
    if (nejnovejsi === null || r.entry_date > nejnovejsi) nejnovejsi = r.entry_date;
  }
  return nejnovejsi;
}
