/**
 * Dorovnání inventury — přičte/odečte zadané ± ks k očekávanému (teoretickému) stavu,
 * aby seděl s fyzickou realitou (manko). Dorovnání se NEPOČÍTÁ do stáčení ani odpočtů,
 * je to pouze vyrovnávací evidence, která se ukládá bokem (inventory_adjustments).
 */
export function computeInventoryReconciliation(
  expectedQty: number,
  actualQty: number,
  dorovnatQty: number
): { diffQty: number; reconciledQty: number; diffAfterQty: number } {
  const diffQty = actualQty - expectedQty;          // Manko před dorovnáním (Skutečnost − Očekávání)
  const reconciledQty = expectedQty + dorovnatQty;  // Teoretický stav PO dorovnání
  const diffAfterQty = actualQty - reconciledQty;   // Manko po dorovnání
  return { diffQty, reconciledQty, diffAfterQty };
}

export type AkceRow = {
  entry_date: string;
  items: { beer_id: string | null; package_id: string | null; quantity_taken: number; quantity_returned: number }[];
};

/**
 * Rozbalí řádky Akcí (festivaly) na plochý seznam výdejových pohybů (stejný
 * tvar jako fasovaniRows/prodejnaRows/writeoffsRows), s množstvím = čistý
 * odběr (odvezeno − vráceno). Vrácené kusy se tak nepočítají jako spotřeba.
 */
export function flattenAkceNet(
  akceRows: AkceRow[]
): { entry_date: string; beer_id: string | null; package_id: string | null; quantity: number }[] {
  const out: { entry_date: string; beer_id: string | null; package_id: string | null; quantity: number }[] = [];
  for (const r of akceRows) {
    for (const it of r.items ?? []) {
      const net = Number(it.quantity_taken || 0) - Number(it.quantity_returned || 0);
      // Záporný čistý odběr (vrátilo se víc, než se odvezlo — typicky sudy
      // z minulé akce) se MUSÍ pustit dál. Dřív se zahazoval, takže Sklad
      // (skladová kniha počítá net !== 0) a "co je potřeba stočit" se o ty
      // kusy rozešly. Odběr se všude odčítá, záporný se tím přičte zpátky.
      if (net !== 0) out.push({ entry_date: r.entry_date, beer_id: it.beer_id, package_id: it.package_id, quantity: net });
    }
  }
  return out;
}

