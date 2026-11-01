// 📅 Den závozu z objednávky — čisté funkce bez napojení na databázi, ať je
// může použít i výpočet malých sudů (lib/maleSudy.ts) a testy bez Supabase.
// Stejný vzorec jako databáze (ucinny_den_zavozu). Dřív žily v
// lib/zavozDeduction.ts, ten je dál vyváží.

const DAY_OFFSET: Record<string, number> = {
  po: 0,
  ut: 1,
  st: 2,
  ct: 3,
  pa: 4,
  so: 5,
  ne: 6,
};

function getMondayOfWeekISO(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function deliveryDayToISO(orderDate: string, deliveryDay: string | null): string {
  const firstDay = (deliveryDay ?? 'pa').split('/')[0].trim();
  const offset = DAY_OFFSET[firstDay] ?? DAY_OFFSET.pa;
  const monday = getMondayOfWeekISO(orderDate);
  const d = new Date(monday + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function computeDeliveryDateISO(
  orderDate: string,
  deliveryDay: string | null,
  deliveryDate: string | null,
): string {
  if (deliveryDate) return deliveryDate.slice(0, 10);
  return deliveryDayToISO(orderDate, deliveryDay);
}
