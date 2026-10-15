import { fetchAllRows, supabase } from './supabase';
import { businessDateISO } from './businessDate';
import {
  najdiShody, pondeliTydne, stejnyOdberatel,
  type NovaObjednavka, type ObjednavkaKPorovnani, type PolozkaUlozena, type Shoda,
} from './duplicityObjednavek';

// ⚠️ Kontrola zdvojených objednávek PŘED uložením — načtení kandidátů z databáze.
// Samotné porovnávání (stejný odběratel, den, pivo, obal) je čistá logika v
// lib/duplicityObjednavek.ts; dialog je v lib/duplicityDialog.ts.
//
// Data se čtou čerstvě z databáze, ne ze seznamu na obrazovce: duplicitu často
// zadá druhý člověk, nebo ten samý z druhého telefonu, a v seznamu, který se
// ještě nepřenačetl, by nebyla.
//
// Dřív se kontrolovalo jen u WhatsAppu a jen když VŠECHNY řádky nové objednávky
// už existovaly. Ruční zadání a fotka se nekontrolovaly vůbec (15. 10. 2026:
// Restaurace na 11. 10. dvakrát, jednou zpětně s řádkem navíc).

/** Pondělí a neděle týdne, do kterého datum spadá. */
function mezeTydne(iso: string): { start: string; end: string } {
  const start = pondeliTydne(iso);
  const nedele = new Date(`${start}T00:00:00Z`);
  nedele.setUTCDate(nedele.getUTCDate() + 6);
  return { start, end: nedele.toISOString().slice(0, 10) };
}

/**
 * Najde uložené objednávky, které vypadají jako ta, co se právě zadává
 * (viz `najdiShody`). Vrací prázdné pole, když nic takového není, a `null`,
 * když se kontrola nepovedla (chyba dotazu) — uložení objednávky se kvůli ní
 * nikdy neblokuje.
 */
export async function najdiDuplicitniObjednavky(nova: NovaObjednavka): Promise<Shoda[] | null> {
  try {
    if (!nova.radky.some((r) => r.beerId && r.pkgId && r.qty > 0)) return [];
    const den = nova.deliveryDate || nova.orderDate || businessDateISO();
    const { start, end } = mezeTydne(den);

    // Objednávky téhož týdne (podle data dovozu; bez něj podle data zadání).
    // Závorky v `or` jsou nutné: bez nich by se tři podmínky spojily jako
    // samostatné NEBO a dotaz by tahal skoro celou tabulku.
    const { data: objednavky, error } = await supabase
      .from('orders')
      .select('id, order_date, delivery_date, place_id, place_name, status, source, created_at')
      .not('status', 'eq', 'storno')
      .or(`and(delivery_date.gte.${start},delivery_date.lte.${end}),and(delivery_date.is.null,order_date.gte.${start},order_date.lte.${end})`)
      .limit(500);
    if (error) {
      console.warn('Kontrola duplicit selhala:', error.message);
      return null;
    }

    const kandidati = ((objednavky as Omit<ObjednavkaKPorovnani, 'polozky'>[] | null) ?? []).filter((o) => stejnyOdberatel(nova, o));
    if (kandidati.length === 0) return [];

    const { data: polozky, error: chybaPolozek } = await fetchAllRows('order_items', 'order_id, beer_id, package_id, quantity')
      .in('order_id', kandidati.map((o) => o.id));
    if (chybaPolozek) {
      console.warn('Kontrola duplicit selhala (položky):', chybaPolozek.message);
      return null;
    }
    const poObjednavkach = new Map<string, PolozkaUlozena[]>();
    for (const p of (polozky as (PolozkaUlozena & { order_id: string })[] | null) ?? []) {
      poObjednavkach.set(p.order_id, [...(poObjednavkach.get(p.order_id) ?? []), p]);
    }

    return najdiShody(
      { ...nova, orderDate: nova.orderDate ?? den },
      kandidati.map((o) => ({ ...o, polozky: poObjednavkach.get(o.id) ?? [] })),
    );
  } catch (e) {
    console.warn('Kontrola duplicit selhala:', e);
    return null;
  }
}
