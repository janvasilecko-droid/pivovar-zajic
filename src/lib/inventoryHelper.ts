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
  depth = 0,
  zavozDeductionRows: any[] = [],
  akceRows: AkceRow[] = [],
  prefukRows: any[] = [],
  adjustmentRows: any[] = []
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
    depth + 1,
    zavozDeductionRows,
    akceRows,
    prefukRows,
    adjustmentRows
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

  // Subtract outgoing in prevMonthKey (fasování, prodejna, odpisy)
  [...fasovaniRows, ...prodejnaRows, ...writeoffsRows]
    .filter((r) => r.entry_date?.slice(0, 7) === prevMonthKey)
    .forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      map[k] = Math.max(0, (map[k] || 0) - Number(r.quantity || 0));
    });

  // Subtract orders delivered/deducted in prevMonthKey (zavoz_deductions — stejný zdroj jako
  // obrazovka Sklad, aby zpětný dopočet neignoroval vydané objednávky).
  zavozDeductionRows
    .filter((r) => r.deduct_date?.slice(0, 7) === prevMonthKey)
    .forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      map[k] = Math.max(0, (map[k] || 0) - Number(r.quantity || 0));
    });

  // Subtract Akce (festivaly) consumed in prevMonthKey — čistý odběr (odvezeno
  // − vráceno), stejný zdroj jako obrazovka Sklad (Stock.tsx).
  flattenAkceNet(akceRows)
    .filter((r) => r.entry_date?.slice(0, 7) === prevMonthKey)
    .forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      map[k] = Math.max(0, (map[k] || 0) - Number(r.quantity || 0));
    });

  // Přefuk KEGů v prevMonthKey (přelití piva mezi obaly: z jednoho objemu
  // ubude, do druhého přibude). Chyběl tady i v Dashboardu a Inventuře, a
  // počítal ho jen Sklad — přefuk 20× 50l na 33× 30l tak jinde vypadal jako
  // manko u jedné velikosti a přebytek u druhé, každý měsíc znovu.
  prefukRows
    .filter((r) => r.entry_date?.slice(0, 7) === prevMonthKey)
    .forEach((r) => {
      if (!r.beer_id) return;
      if (r.from_package_id) {
        const k = `${r.beer_id}__${r.from_package_id}`;
        map[k] = Math.max(0, (map[k] || 0) - Number(r.from_count || 0));
      }
      if (r.to_package_id) {
        const k = `${r.beer_id}__${r.to_package_id}`;
        map[k] = (map[k] || 0) + Number(r.to_count || 0);
      }
    });

  // Dorovnání inventury (manko/přebytek, ± ks) — stejný zdroj jako Sklad.
  adjustmentRows
    .filter((r) => r.entry_date?.slice(0, 7) === prevMonthKey)
    .forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      map[k] = Math.max(0, (map[k] || 0) + Number(r.quantity || 0));
    });

  // Subtract kegs consumed as a bottling source in prevMonthKey (kegs_used /
  // kegs_used_package_id on bottling rows) — these deplete keg stock separately
  // from the bottled-beer row already added above.
  const seenKegSource = new Set<string>();
  bottlingRows
    .filter((r) => r.entry_date?.slice(0, 7) === prevMonthKey)
    .forEach((r) => {
      const kegsUsed = Number(r.kegs_used || 0);
      const kegPkgId = r.kegs_used_package_id;
      if (kegsUsed <= 0 || !kegPkgId || !r.beer_id) return;
      const dedupeKey = `${r.entry_date}|${r.beer_id}|${kegsUsed}|${kegPkgId}|${r.created_at || r.note || ''}`;
      if (seenKegSource.has(dedupeKey)) return;
      seenKegSource.add(dedupeKey);
      const k = `${r.beer_id}__${kegPkgId}`;
      map[k] = Math.max(0, (map[k] || 0) - kegsUsed);
    });

  return map;
}
