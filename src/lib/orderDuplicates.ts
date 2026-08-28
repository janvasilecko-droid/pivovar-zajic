import { fetchAllRows, supabase } from './supabase';
import { businessDateISO } from './businessDate';

// ⚠️ Kontrola duplicit objednávek při čtení do aplikace.
// Cíl: aby dva lidé nezadali ve stejnou chvíli stejnou objednávku (např. oba
// kliknou na „Schválit“ u téže WhatsApp zprávy, nebo jeden přepíše objednávku,
// kterou už druhý právě zadal). Porovnává se odběratel + týden dodání + položky.

export interface DuplicateOrderCandidate {
  orderId: string;
  placeName: string | null;
  orderDate: string;
  deliveryDate: string | null;
  createdAt: string;
  matchedItems: number;
  totalItems: number;
}

export interface DuplicateCheckItem {
  beerId?: string | null;
  pkgId?: string | null;
  qty?: number | null;
  beerName?: string | null;
  packageLabel?: string | null;
}

export interface DuplicateCheckInput {
  placeId?: string | null;
  placeName?: string | null;
  deliveryDate?: string | null;
  deliveryDay?: string | null;
  items: DuplicateCheckItem[];
}

const normName = (s?: string | null) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/** ISO pondělí a neděle týdne, do kterého datum spadá (bez data → aktuální týden). */
function weekBounds(dateStr: string | null): { start: string; end: string } {
  // Bez data se používá pražský "obchodní den" (ne syrové new Date(), které je
  // v UTC) — kolem půlnoci by jinak UTC den mohl být ještě včerejší a týden by
  // se spočítal špatně (viz stejný vzorec v monthlyCleanup.ts).
  const ref = new Date((dateStr || businessDateISO()) + 'T00:00:00Z');
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // 0 = pondělí
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - dow);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

/**
 * Hledá existující objednávku, která by mohla být duplicitou právě zadávané:
 * stejný odběratel, stejný týden dodání (nebo zadání) a všechny položky
 * (pivo + obal + množství) se shodují. Vrací nejlépe odpovídající objednávku
 * nebo null. Pokud kontrola selže (chyba dotazu), vrací null — import neblokuje.
 */
export async function findDuplicateOrders(input: DuplicateCheckInput): Promise<DuplicateOrderCandidate | null> {
  if (!input.items || input.items.length === 0) return null;

  const { start, end } = weekBounds(input.deliveryDate || null);

  // Objednávky ve stejném týdnu (podle delivery_date; bez něj podle order_date).
  // Pozn.: dřív byl tenhle filtr chybně `.or(delivery_date.is.null, delivery_date.gte.start,
  // delivery_date.lte.end)` — tři samostatné OR podmínky bez závorkování, takže
  // "delivery_date >= start" NEBO "delivery_date <= end" pokrylo prakticky každé
  // datum a dotaz tahal skoro celou tabulku objednávek. Teď je to správně
  // (delivery_date v rozsahu týdne) NEBO (delivery_date chybí A order_date v rozsahu týdne).
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_date, delivery_date, place_id, place_name, status, created_at')
    .not('status', 'eq', 'storno')
    .or(`and(delivery_date.gte.${start},delivery_date.lte.${end}),and(delivery_date.is.null,order_date.gte.${start},order_date.lte.${end})`)
    .limit(200);

  if (error) {
    console.warn('Kontrola duplicit selhala:', error.message);
    return null;
  }

  const incomingPlaceNorm = input.placeId ? null : normName(input.placeName);

  const candidates = (orders || []).filter((o: any) => {
    if (o.status === 'storno') return false;
    // Stejný týden (efektivní datum = delivery_date, jinak order_date)
    const effDate = o.delivery_date || o.order_date;
    if (!effDate || effDate < start || effDate > end) return false;
    // Stejný odběratel (podle id, jinak podle normalizovaného názvu)
    if (input.placeId && o.place_id === input.placeId) return true;
    if (!input.placeId && incomingPlaceNorm && normName(o.place_name) === incomingPlaceNorm) return true;
    return false;
  });

  if (candidates.length === 0) return null;

  const ids = candidates.map((o: any) => o.id);
  const { data: existingItems } = await fetchAllRows(
    'order_items',
    'order_id, beer_id, package_id, quantity',
  ).in('order_id', ids);

  const itemsByOrder = new Map<string, any[]>();
  for (const it of existingItems || []) {
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push(it);
    itemsByOrder.set(it.order_id, arr);
  }

  const incomingCounts = new Map<string, number>();
  for (const i of input.items) {
    const k = `${i.beerId ?? ''}|${i.pkgId ?? ''}|${Number(i.qty ?? 0)}`;
    incomingCounts.set(k, (incomingCounts.get(k) ?? 0) + 1);
  }
  const totalIncoming = input.items.length;

  let best: DuplicateOrderCandidate | null = null;

  for (const o of candidates) {
    const list = itemsByOrder.get(o.id) ?? [];
    const covered = new Map(incomingCounts);
    let coveredTotal = 0;
    for (const it of list) {
      const k = `${it.beer_id ?? ''}|${it.package_id ?? ''}|${Number(it.quantity ?? 0)}`;
      const c = covered.get(k);
      if (c && c > 0) {
        covered.set(k, c - 1);
        coveredTotal++;
      }
    }
    // Duplicita = VŠECHNY položky nové objednávky už existují ve staré objednávce.
    if (coveredTotal === totalIncoming && coveredTotal > 0) {
      best = {
        orderId: o.id,
        placeName: o.place_name,
        orderDate: o.order_date,
        deliveryDate: o.delivery_date,
        createdAt: o.created_at,
        matchedItems: coveredTotal,
        totalItems: totalIncoming,
      };
      break;
    }
  }

  return best;
}

/**
 * Převede duplicitu na srozumitelnou hlášku pro uživatele.
 */
export function formatDuplicateMessage(dup: DuplicateOrderCandidate): string {
  const when = dup.deliveryDate || dup.orderDate;
  const whenLabel = when
    ? new Date(when + 'T00:00:00').toLocaleDateString('cs-CZ')
    : '—';
  return (
    `Duplicitní objednávka: ${dup.placeName ?? 'odběratel'} už má objednávku na ${whenLabel}` +
    ` (všech ${dup.totalItems} položek se shoduje). Pokud ji přesto chcete zadat (např. zákazník přidal další pivo), pokračujte — jinak import zrušte.`
  );
}
