// Rychlé volby množství podle SKUTEČNĚ nejčastěji použitých hodnot pro dané
// pivo+obal v minulém kalendářním měsíci — na rozdíl od pevně daných hodnot
// v QuickQtySelect.tsx (které jsou stejné pro všechny piva stejného typu
// obalu), tohle se přizpůsobí konkrétní kombinaci pivo+obal podle historie.

export type QtyHistoryRow = {
  beer_id: string | null;
  package_id: string | null;
  quantity: number | null;
  entry_date: string | null;
};

function lastMonthKey(today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Vrátí až `limit` nejčastějších hodnot quantity pro dané pivo+obal z minulého
// měsíce, seřazené vzestupně podle hodnoty (pro přehledné zobrazení tlačítek).
// Při shodné četnosti vyhrává vyšší hodnota (obvykle typičtější "plná" dávka).
export function topQuantitiesLastMonth(
  rows: QtyHistoryRow[],
  beerId: string | null | undefined,
  packageId: string | null | undefined,
  limit = 4
): number[] {
  if (!beerId || !packageId || !rows?.length) return [];
  const monthKey = lastMonthKey();
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.beer_id !== beerId || r.package_id !== packageId) continue;
    if (!r.entry_date || !r.entry_date.startsWith(monthKey)) continue;
    const q = Number(r.quantity);
    if (!Number.isFinite(q) || q <= 0) continue;
    counts.set(q, (counts.get(q) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .slice(0, limit)
    .map(([q]) => q)
    .sort((a, b) => a - b);
}
