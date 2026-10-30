// ⚖️ Vyrovnání z inventury — kolik kusů se u položky už srovnalo.
// ---------------------------------------------------------------------------
// Po srovnání rozdíl spadne na nulu a tlačítko zmizí. Jenže nula vypadá
// stejně, ať se srovnávalo, nebo to sedělo od začátku — a člověk pak neví,
// jestli u téhle položky už něco udělal. Z provozu: „přidej tam kolonku
// vyrovnání, aby šlo vidět, že už je to odečtený."
//
// Poznat to jde podle poznámky: každý zápis, který vznikl srovnáním, ji má
// a začíná vždycky stejně (viz lib/inventoryFix.ts a lib/srovnaniDavka.ts).
// Nic jiného se takhle nepodepisuje, takže se to nesplete s běžnou výrobou.
import type { Movement } from './stockLedger';
import { stockKey } from './stockLedger';

/** Přebytek — chybějící stočení se doplnilo. */
export const ZNACKA_DOPLNENO = 'Doplněno z inventury';
/** Manko — zapsalo se víc, než se stočilo, a rozdíl se odečetl. */
export const ZNACKA_ODECTENO = 'Odečteno z inventury';

/** Druhy pohybů, které srovnání zakládá. */
const SROVNAVACI = new Set(['staceni', 'kegovani', 'sud_na_lahve']);

/**
 * Vznikl tenhle zápis srovnáním inventury ZA DANÝ MĚSÍC?
 *
 * Měsíc je součástí podpisu schválně: zápis ze srpnové inventury nemá
 * v zářijové tabulce co dělat. Bez toho by se u položky, která se srovnávala
 * opakovaně, sečetly všechny měsíce dohromady.
 */
export function jeVyrovnani(note: string | null | undefined, monthKey: string): boolean {
  if (!note) return false;
  return note.startsWith(`${ZNACKA_DOPLNENO} ${monthKey}`)
    || note.startsWith(`${ZNACKA_ODECTENO} ${monthKey}`);
}

/**
 * Kolik kusů se u které položky srovnalo z inventury daného měsíce.
 *
 * Hodnota nese ZNAMÉNKO: kladná = doplnilo se chybějící stočení, záporná =
 * odečetlo se, co se zapsalo navíc. U sudů se počítají i ty, které ubyly
 * (nebo se vrátily) kvůli srovnání lahví — je to totéž vyrovnání, jen se
 * projeví na jiném řádku, a právě tohle bylo dřív nejhůř dohledatelné.
 */
export function vyrovnaniZaMesic(movements: Movement[], monthKey: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const mv of movements) {
    if (!SROVNAVACI.has(mv.kind)) continue;
    if (!jeVyrovnani(mv.note, monthKey)) continue;
    const key = stockKey(mv.beer_id, mv.package_id);
    out.set(key, (out.get(key) ?? 0) + mv.qty);
  }
  return out;
}

/** Záznam deníku úprav stáčení (tabulka stoceni_upravy), jak ho potřebuje „Vyrovnáno". */
export type ZaznamDeniku = {
  beer_id: string | null;
  package_id: string | null;
  druh: string;
  kusu: number | string;
  tyden_od: string | null;
  zdroje?: { pred: number; po: number; oprava?: boolean; vyrovnani?: boolean }[] | null;
};

/**
 * Přičte k „Vyrovnáno" odečty manka, které nemají záporný řádek.
 *
 * Od 30. 10. 2026 se manko odečítá přímo ze stočených řádků (lib/odecetStaceni.ts)
 * a v knize po něm nezůstane pohyb se značkou „Odečteno z inventury …" — stopa
 * je jen v deníku. Počítají se odečty MĚSÍČNÍ inventury (bez týdne), stejně
 * jako dřív záporný řádek s měsícem v poznámce. Část, která se odečetla
 * z řádku „Doplněno z inventury" téhož měsíce (`vyrovnani`), už je vidět přes
 * jeho poznámku; převedený starý záporný řádek (`oprava`) není zdroj.
 */
export function sOdectyZDeniku(mapa: Map<string, number>, denik: ZaznamDeniku[]): Map<string, number> {
  const out = new Map(mapa);
  for (const u of denik) {
    if (u.druh !== 'odecteno' || u.tyden_od || !u.beer_id || !u.package_id) continue;
    const zdroje = u.zdroje ?? [];
    const kusu = zdroje.length
      ? zdroje.filter((z) => !z.oprava && !z.vyrovnani).reduce((s, z) => s + (Number(z.pred) - Number(z.po)), 0)
      : Number(u.kusu || 0);
    if (!kusu) continue;
    const k = stockKey(u.beer_id, u.package_id);
    out.set(k, (out.get(k) ?? 0) - kusu);
  }
  return out;
}
