// 🧮 Souhrn objednaného množství podle varianty (pivo + obal) pro záložku
// „Celkem“ v Objednávkách. Čistá funkce bez závislosti na UI — snadno testovatelná.
//
// Pravidla:
//  - Sčítá quantity všech položek objednávek ve zvoleném rozsahu.
//  - Stornované objednávky se do součtu NEPOČÍTAJÍ (zrušená objednávka nemá
//    smysl započítávat do „kolik se celkem objednalo“).
//  - Položky bez piva nebo bez obalu se přeskočí (nemají variantu).

export type VariantTotal = {
  beerId: string;
  packageId: string;
  /** Celkový počet ks dané varianty napříč objednávkami. */
  qty: number;
  /** Počet objednávek, ve kterých se varianta vyskytuje (objednávka jen jednou). */
  orderCount: number;
};

export type VariantTotalsResult = {
  totals: VariantTotal[];
  /** Celkový počet ks všech variant. */
  totalKs: number;
  /** Celkový počet objednávek, které přispěly aspoň jednou variantou. */
  totalOrders: number;
};

type OrderLike = { id: string; status: string };
type ItemLike = { beer_id?: string | null; package_id?: string | null; quantity?: number | null };

export function computeVariantTotals(orders: OrderLike[], itemsByOrder: Record<string, ItemLike[]>): VariantTotalsResult {
  const map = new Map<string, { beerId: string; packageId: string; qty: number; orders: Set<string> }>();
  let totalOrders = 0;

  for (const o of orders) {
    if (o.status === 'storno') continue;
    const its = itemsByOrder[o.id] ?? [];
    let contributed = false;
    for (const i of its) {
      if (!i.beer_id || !i.package_id) continue;
      const key = `${i.beer_id}\u0001${i.package_id}`;
      const e = map.get(key) ?? { beerId: i.beer_id, packageId: i.package_id, qty: 0, orders: new Set<string>() };
      e.qty += Number(i.quantity) || 0;
      e.orders.add(o.id);
      map.set(key, e);
      contributed = true;
    }
    if (contributed) totalOrders++;
  }

  const totals = [...map.values()]
    .map(({ orders, ...rest }) => ({ ...rest, orderCount: orders.size }))
    // Deterministic order; UI si řadí podle druhu obalu / názvu samo.
    .sort((a, b) => a.beerId.localeCompare(b.beerId) || a.packageId.localeCompare(b.packageId));

  return {
    totals,
    totalKs: totals.reduce((s, t) => s + t.qty, 0),
    totalOrders,
  };
}
