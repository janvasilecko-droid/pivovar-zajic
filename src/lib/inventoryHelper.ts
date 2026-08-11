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

/**
 * Helper to compute the starting stock of a month with automatic fallbacks.
 * If no starting stock is explicitly defined for the target month, it falls back
 * to the previous month's ending stock (either physical count or calculated from movements).
 */
export function getStartingStockMap(
  monthKey: string, // YYYY-MM
  inventoryRows: any[],
  bottlingRows: any[],
  keggingRows: any[],
  fasovaniRows: any[],
  prodejnaRows: any[],
  writeoffsRows: any[],
  depth = 0
): Record<string, number> {
  // Prevent infinite recursion
  if (depth > 12) {
    return {};
  }

  // 1. Try to find explicit "Počáteční" records in inventoryRows for monthKey
  const explicitRows = inventoryRows.filter(
    (r) => r.entry_date?.slice(0, 7) === monthKey && (r.note?.includes('Počáteční') || !r.note)
  );

  if (explicitRows.length > 0) {
    const map: Record<string, number> = {};
    explicitRows.forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      map[k] = (map[k] || 0) + Number(r.quantity || 0);
    });
    return map;
  }

  // 2. If not found in DB, look at localStorage: initial_stock_YYYY-MM
  try {
    const saved = localStorage.getItem(`initial_stock_${monthKey}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        const map: Record<string, number> = {};
        Object.entries(parsed).forEach(([k, val]) => {
          map[k] = Number(val || 0);
        });
        return map;
      }
    }
  } catch {}

  // 3. Fallback: Ending stock of the previous month!
  const [y, m] = monthKey.split('-').map(Number);
  // Get date object representing the first day of previous month
  const prevDate = new Date(y, m - 2, 1);
  const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

  // 3a. Check if previous month has a physical/approved count in database
  const prevActualDB = inventoryRows.filter(
    (r) => r.entry_date?.slice(0, 7) === prevMonthKey && (r.note?.includes('Fyzická') || r.note?.includes('Schválená'))
  );
  if (prevActualDB.length > 0) {
    const map: Record<string, number> = {};
    prevActualDB.forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      map[k] = (map[k] || 0) + Number(r.quantity || 0);
    });
    return map;
  }

  // 3b. Check if previous month has physical count in localStorage: actual_inventory_YYYY-MM
  try {
    const savedActual = localStorage.getItem(`actual_inventory_${prevMonthKey}`);
    if (savedActual) {
      const parsed = JSON.parse(savedActual);
      if (parsed && typeof parsed === 'object') {
        const map: Record<string, number> = {};
        Object.entries(parsed).forEach(([k, val]) => {
          map[k] = Number(val || 0);
        });
        return map;
      }
    }
  } catch {}

  // 3c. Calculate computed ending stock of the previous month recursively:
  // starting stock of prev month + bottled/kegged in prev month - outgoing in prev month
  const prevStartingMap = getStartingStockMap(
    prevMonthKey,
    inventoryRows,
    bottlingRows,
    keggingRows,
    fasovaniRows,
    prodejnaRows,
    writeoffsRows,
    depth + 1
  );

  const map: Record<string, number> = { ...prevStartingMap };

  // Add bottling in prevMonthKey
  bottlingRows.filter((r) => r.entry_date?.slice(0, 7) === prevMonthKey).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    map[k] = (map[k] || 0) + Number(r.quantity || 0);
  });

  // Add kegging in prevMonthKey
  keggingRows.filter((r) => r.entry_date?.slice(0, 7) === prevMonthKey).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    map[k] = (map[k] || 0) + Number(r.quantity || 0);
  });

  // Subtract outgoing in prevMonthKey
  [...fasovaniRows, ...prodejnaRows, ...writeoffsRows]
    .filter((r) => r.entry_date?.slice(0, 7) === prevMonthKey)
    .forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      map[k] = Math.max(0, (map[k] || 0) - Number(r.quantity || 0));
    });

  return map;
}
