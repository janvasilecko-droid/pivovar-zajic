// Odškrtávání úkolů k závozu — čtení a zápis do databáze.
//
// Samotné úkoly se nikam nezadávají, čtou se z poznámky objednávky
// (zavozUkoly.ts). Tady se drží jediná věc navíc, kterou z poznámky vyčíst
// nejde: jestli už to někdo udělal. Splněný úkol má řádek, nesplněný ne —
// odškrtnutí se ruší smazáním řádku.
//
// Výpočet zůstává v zavozUkoly.ts bez závislosti na databázi, aby se dal
// testovat bez připojení.
import { supabase, fetchAllRows } from './supabase';
import type { UkolKlic } from './zavozUkoly';

/** Klíč do množiny splněných úkolů. Objednávka + druh úkolu. */
export function klicUkolu(orderId: string, klic: UkolKlic | string): string {
  return `${orderId}:${klic}`;
}

/**
 * Načte splněné úkoly pro dané objednávky.
 * Vrací množinu klíčů `orderId:klic` — na dotaz „je tenhle hotový?" se
 * odpovídá tisíckrát při vykreslování, takže to musí být bez hledání v poli.
 */
export async function nactiHotoveUkoly(orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();

  // Přes fetchAllRows, ne přímo: Supabase vrací nejvýš 1000 řádků na dotaz
  // a zbytek TIŠE zahodí. Na objednávku můžou být až tři úkoly, takže by se
  // hranice dala přerazit — a odškrtnuté úkoly by se vrátily jako neodškrtnuté.
  const { data, error } = await fetchAllRows<{ order_id: string; klic: string }>(
    'zavoz_ukoly_hotovo',
    'order_id,klic',
  ).in('order_id', orderIds);
  if (error) throw error;

  const hotove = new Set<string>();
  for (const r of data ?? []) hotove.add(klicUkolu(r.order_id, r.klic));
  return hotove;
}

/**
 * Odškrtne úkol, nebo odškrtnutí zruší.
 *
 * Zakládá se přes upsert na (order_id, klic): dvě klepnutí na telefonu nebo
 * dva lidé naráz by jinak založili dva řádky a odškrtnutí by pak nešlo
 * zrušit jedním smazáním.
 */
export async function nastavUkolHotovo(
  orderId: string,
  klic: UkolKlic | string,
  hotovo: boolean,
  kdo?: string | null,
): Promise<void> {
  if (hotovo) {
    const { error } = await supabase
      .from('zavoz_ukoly_hotovo')
      .upsert({ order_id: orderId, klic, splneno_at: new Date().toISOString(), splnil: kdo ?? null },
              { onConflict: 'order_id,klic' });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('zavoz_ukoly_hotovo')
      .delete()
      .eq('order_id', orderId)
      .eq('klic', klic);
    if (error) throw error;
  }
}
