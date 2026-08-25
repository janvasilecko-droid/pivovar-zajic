import { supabase, Beer, Package } from './supabase';
import { WhatsAppIncoming } from './whatsappApi';
import { parseFreeTextEntries, emptyAliasMap, loadAliasMap } from './orderParser';

export interface OrderItemDuplicateIssue {
  type: 'duplicate_item_rows';
  orderId: string;
  /** V téhle appce orders.order_number neexistuje — vždy undefined, UI to
   *  bere jako volitelné a bez čísla objednávky se prostě jen nezobrazí. */
  orderNumber?: number;
  placeName: string;
  deliveryDate?: string | null;
  orderDate: string;
  beerId: string;
  beerName: string;
  pkgId: string;
  packageLabel: string;
  rows: Array<{
    id: string;
    quantity: number;
    is_prepared?: boolean;
  }>;
  totalQuantity: number;
}

export interface WhatsAppMismatchIssue {
  type: 'whatsapp_mismatch';
  orderId: string;
  orderNumber?: number;
  placeName: string;
  deliveryDate?: string | null;
  orderDate: string;
  whatsappMessageId: string;
  messageText: string;
  senderName: string;
  mediaUrl?: string | null;
  createdAt: string;
  mismatches: Array<{
    kind: 'qty_diff' | 'missing_in_order' | 'extra_in_order';
    beerName: string;
    packageLabel: string;
    expectedQty?: number;
    actualQty?: number;
  }>;
  allMatched: boolean;
}

export interface DuplicateOrderIssue {
  type: 'duplicate_orders';
  placeName: string;
  deliveryDate?: string | null;
  deliveryWeek: string;
  orders: Array<{
    id: string;
    orderNumber?: number;
    orderDate: string;
    deliveryDate?: string | null;
    status: string;
    totalLiters: number;
    itemsSummary: string;
    createdAt: string;
  }>;
}

export interface UnprocessedWhatsAppIssue {
  type: 'unprocessed_whatsapp';
  messageId: string;
  senderName: string;
  createdAt: string;
  messageText: string;
  mediaUrl?: string | null;
  placeName?: string | null;
  deliveryDate?: string | null;
  status: string;
  itemsSummary: string;
}

export interface AuditReport {
  weekKey?: string;
  scannedOrdersCount: number;
  scannedWhatsAppCount: number;
  duplicateItemIssues: OrderItemDuplicateIssue[];
  whatsappMismatchIssues: WhatsAppMismatchIssue[];
  duplicateOrderIssues: DuplicateOrderIssue[];
  unprocessedWhatsAppIssues: UnprocessedWhatsAppIssue[];
  cleanOrdersCount: number;
  totalIssuesCount: number;
}

const normName = (s?: string | null) =>
  (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

/** ISO pondělí a neděle týdne */
function weekBounds(dateStr: string | null): { start: string; end: string } {
  const ref = dateStr ? new Date(dateStr + 'T00:00:00Z') : new Date();
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - dow);
  const sunday = new Date(monday); sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

/**
 * Spustí kompletní kontrolu a audit integrity objednávek
 */
export async function runOrderAudit({
  weekKey,
  beers,
  packages,
}: {
  weekKey?: string;
  beers: Beer[];
  packages: Package[];
}): Promise<AuditReport> {
  const aliasMap = await loadAliasMap().catch(() => emptyAliasMap());

  // 1. Načíst objednávky a položky
  let ordersQuery = supabase
    .from('orders')
    .select('id, order_date, delivery_date, delivery_day, place_id, place_name, status, whatsapp_message_id, created_at')
    .not('status', 'eq', 'storno')
    .order('delivery_date', { ascending: false, nullsFirst: false })
    .order('order_date', { ascending: false });

  if (weekKey) {
    const { start, end } = weekBounds(weekKey);
    ordersQuery = ordersQuery.or(`delivery_date.gte.${start},delivery_date.lte.${end},and(delivery_date.is.null,order_date.gte.${start},order_date.lte.${end})`);
  }

  const { data: ordersData, error: ordersErr } = await ordersQuery;
  if (ordersErr) {
    console.error('Audit: Chyba při načítání objednávek:', ordersErr);
  }
  const orders = ordersData || [];
  const orderIds = orders.map((o: any) => o.id);

  let orderItems: any[] = [];
  if (orderIds.length > 0) {
    const { data: itemsData, error: itemsErr } = await supabase
      .from('order_items')
      .select('id, order_id, beer_id, package_id, quantity, beer_name, package_label, is_prepared')
      .in('order_id', orderIds);
    if (itemsErr) {
      console.error('Audit: Chyba při načítání položek objednávek:', itemsErr);
    }
    orderItems = itemsData || [];
  }

  // 2. Načíst WhatsApp zprávy
  let waQuery = supabase
    .from('whatsapp_incoming')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  const { data: waData, error: waErr } = await waQuery;
  if (waErr) {
    console.error('Audit: Chyba při načítání WhatsApp zpráv:', waErr);
  }
  const waMessages: WhatsAppIncoming[] = waData || [];
  const waMap = new Map<string, WhatsAppIncoming>();
  for (const m of waMessages) {
    waMap.set(m.id, m);
  }

  // --- KONTROLA 1: Duplicitní řádky v rámci jedné objednávky (např. 2x 12% 50l) ---
  const duplicateItemIssues: OrderItemDuplicateIssue[] = [];
  const itemsByOrder = new Map<string, any[]>();
  for (const it of orderItems) {
    const arr = itemsByOrder.get(it.order_id) ?? [];
    arr.push(it);
    itemsByOrder.set(it.order_id, arr);
  }

  for (const o of orders) {
    const its = itemsByOrder.get(o.id) ?? [];
    const grouped = new Map<string, any[]>();
    for (const it of its) {
      const k = `${it.beer_id || ''}__${it.package_id || ''}`;
      const list = grouped.get(k) ?? [];
      list.push(it);
      grouped.set(k, list);
    }

    for (const [k, list] of grouped.entries()) {
      if (list.length > 1) {
        const first = list[0];
        const beer = beers.find((b) => b.id === first.beer_id);
        const pkg = packages.find((p) => p.id === first.package_id);
        const totalQuantity = list.reduce((sum, r) => sum + Number(r.quantity || 0), 0);

        duplicateItemIssues.push({
          type: 'duplicate_item_rows',
          orderId: o.id,
          placeName: o.place_name || 'Neznámý odběratel',
          deliveryDate: o.delivery_date,
          orderDate: o.order_date,
          beerId: first.beer_id,
          beerName: beer?.name || first.beer_name || 'Pivo',
          pkgId: first.package_id,
          packageLabel: pkg?.label || first.package_label || 'Obal',
          rows: list.map((r) => ({
            id: r.id,
            quantity: Number(r.quantity || 0),
            is_prepared: r.is_prepared,
          })),
          totalQuantity,
        });
      }
    }
  }

  // --- KONTROLA 2: Křížová kontrola s WhatsApp zprávou ---
  const whatsappMismatchIssues: WhatsAppMismatchIssue[] = [];

  for (const o of orders) {
    if (!o.whatsapp_message_id) continue;
    const waMsg = waMap.get(o.whatsapp_message_id);
    if (!waMsg) continue;

    // Extrahujeme položky z WhatsApp zprávy (buď z parsed_items nebo rozparsováním textu)
    let expectedItems: Array<{ beerId: string; pkgId: string; qty: number; beerName?: string; packageLabel?: string }> = [];

    if (waMsg.parsed_items && Array.isArray(waMsg.parsed_items) && waMsg.parsed_items.length > 0) {
      expectedItems = waMsg.parsed_items
        .filter((pi) => pi.beer_id && pi.pkg_id && Number(pi.qty) > 0)
        .map((pi) => {
          const b = beers.find((x) => x.id === pi.beer_id);
          const p = packages.find((x) => x.id === pi.pkg_id);
          return {
            beerId: pi.beer_id!,
            pkgId: pi.pkg_id!,
            qty: Number(pi.qty),
            beerName: b?.name || pi.beer_name || 'Pivo',
            packageLabel: p?.label || pi.package_label || 'Obal',
          };
        });
    } else if (waMsg.message_text || waMsg.parsed_raw_text) {
      const parsed = parseFreeTextEntries(waMsg.parsed_raw_text || waMsg.message_text, beers, packages, aliasMap);
      expectedItems = parsed
        .filter((pi) => pi.beer_id && pi.package_id && Number(pi.quantity) > 0)
        .map((pi) => {
          const b = beers.find((x) => x.id === pi.beer_id);
          const p = packages.find((x) => x.id === pi.package_id);
          return {
            beerId: pi.beer_id!,
            pkgId: pi.package_id!,
            qty: Number(pi.quantity),
            beerName: b?.name || 'Pivo',
            packageLabel: p?.label || 'Obal',
          };
        });
    }

    if (expectedItems.length === 0) continue;

    // Položky skutečně uložené v DB pro tuto objednávku
    const actualList = itemsByOrder.get(o.id) ?? [];
    const actualMap = new Map<string, number>();
    for (const it of actualList) {
      const k = `${it.beer_id || ''}__${it.package_id || ''}`;
      actualMap.set(k, (actualMap.get(k) || 0) + Number(it.quantity || 0));
    }

    const expectedMap = new Map<string, { qty: number; beerName: string; packageLabel: string }>();
    for (const exp of expectedItems) {
      const k = `${exp.beerId}__${exp.pkgId}`;
      const prev = expectedMap.get(k);
      expectedMap.set(k, {
        qty: (prev?.qty || 0) + exp.qty,
        beerName: exp.beerName || prev?.beerName || 'Pivo',
        packageLabel: exp.packageLabel || prev?.packageLabel || 'Obal',
      });
    }

    const mismatches: WhatsAppMismatchIssue['mismatches'] = [];

    // Kontrola očekávaných vs skutečných
    for (const [k, exp] of expectedMap.entries()) {
      const actualQty = actualMap.get(k) || 0;
      if (actualQty === 0) {
        mismatches.push({
          kind: 'missing_in_order',
          beerName: exp.beerName,
          packageLabel: exp.packageLabel,
          expectedQty: exp.qty,
          actualQty: 0,
        });
      } else if (actualQty !== exp.qty) {
        mismatches.push({
          kind: 'qty_diff',
          beerName: exp.beerName,
          packageLabel: exp.packageLabel,
          expectedQty: exp.qty,
          actualQty,
        });
      }
    }

    // Kontrola položek v objednávce navíc
    for (const [k, actQty] of actualMap.entries()) {
      if (!expectedMap.has(k)) {
        const sample = actualList.find((it) => `${it.beer_id || ''}__${it.package_id || ''}` === k);
        const b = beers.find((x) => x.id === sample?.beer_id);
        const p = packages.find((x) => x.id === sample?.package_id);
        mismatches.push({
          kind: 'extra_in_order',
          beerName: b?.name || sample?.beer_name || 'Pivo',
          packageLabel: p?.label || sample?.package_label || 'Obal',
          expectedQty: 0,
          actualQty: actQty,
        });
      }
    }

    if (mismatches.length > 0) {
      whatsappMismatchIssues.push({
        type: 'whatsapp_mismatch',
        orderId: o.id,
        placeName: o.place_name || 'Neznámý odběratel',
        deliveryDate: o.delivery_date,
        orderDate: o.order_date,
        whatsappMessageId: o.whatsapp_message_id,
        messageText: waMsg.message_text,
        senderName: waMsg.sender_name,
        mediaUrl: waMsg.media_url,
        createdAt: waMsg.created_at,
        mismatches,
        allMatched: false,
      });
    }
  }

  // --- KONTROLA 3: Duplicitní celé objednávky pro stejného zákazníka v témže týdnu ---
  const duplicateOrderIssues: DuplicateOrderIssue[] = [];
  const ordersByCustomer = new Map<string, any[]>();
  for (const o of orders) {
    const custNorm = normName(o.place_name);
    if (!custNorm) continue;
    const list = ordersByCustomer.get(custNorm) ?? [];
    list.push(o);
    ordersByCustomer.set(custNorm, list);
  }

  for (const [cust, list] of ordersByCustomer.entries()) {
    if (list.length < 2) continue;

    // Seskupit podle týdne
    const byWeek = new Map<string, any[]>();
    for (const o of list) {
      const effDate = o.delivery_date || o.order_date;
      const { start } = weekBounds(effDate);
      const wList = byWeek.get(start) ?? [];
      wList.push(o);
      byWeek.set(start, wList);
    }

    for (const [wStart, wOrders] of byWeek.entries()) {
      if (wOrders.length >= 2) {
        // Zkontrolovat, zda mají podobné nebo shodné položky
        duplicateOrderIssues.push({
          type: 'duplicate_orders',
          placeName: wOrders[0].place_name,
          deliveryDate: wOrders[0].delivery_date,
          deliveryWeek: wStart,
          orders: wOrders.map((o) => {
            const its = itemsByOrder.get(o.id) ?? [];
            let totalL = 0;
            const itemStrings: string[] = [];
            for (const it of its) {
              const b = beers.find((x) => x.id === it.beer_id);
              const p = packages.find((x) => x.id === it.package_id);
              const vol = Number(p?.volume_l || 0);
              const qty = Number(it.quantity || 0);
              totalL += qty * vol;
              itemStrings.push(`${qty}x ${b?.name || it.beer_name || 'Pivo'} ${p?.label || it.package_label || ''}`);
            }
            return {
              id: o.id,
              orderDate: o.order_date,
              deliveryDate: o.delivery_date,
              status: o.status,
              totalLiters: totalL,
              itemsSummary: itemStrings.join(', ') || 'Žádné položky',
              createdAt: o.created_at,
            };
          }),
        });
      }
    }
  }

  // --- KONTROLA 4: Nepropadlé / čekající WhatsApp zprávy s pivem ---
  const unprocessedWhatsAppIssues: UnprocessedWhatsAppIssue[] = [];
  const linkedOrderWaIds = new Set<string>();
  for (const o of orders) {
    if (o.whatsapp_message_id) linkedOrderWaIds.add(o.whatsapp_message_id);
  }

  for (const m of waMessages) {
    if (m.status === 'ignored') continue;
    const isLinked = linkedOrderWaIds.has(m.id) || (m.imported_order_id && orderIds.includes(m.imported_order_id));
    if (!isLinked && (m.status === 'pending' || m.status === 'parsed' || m.status === 'processing')) {
      let itemsSummary = '';
      if (m.parsed_items && m.parsed_items.length > 0) {
        itemsSummary = m.parsed_items
          .filter((pi) => Number(pi.qty) > 0)
          .map((pi) => `${pi.qty}x ${pi.beer_name || 'Pivo'} ${pi.package_label || ''}`)
          .join(', ');
      } else if (m.message_text) {
        const parsed = parseFreeTextEntries(m.message_text, beers, packages, aliasMap);
        itemsSummary = parsed.map((p) => `${p.quantity}x ${beers.find((b) => b.id === p.beer_id)?.name || 'Pivo'}`).join(', ');
      }

      unprocessedWhatsAppIssues.push({
        type: 'unprocessed_whatsapp',
        messageId: m.id,
        senderName: m.sender_name,
        createdAt: m.created_at,
        messageText: m.message_text,
        mediaUrl: m.media_url,
        placeName: m.parsed_place_name,
        deliveryDate: m.parsed_delivery_date,
        status: m.status,
        itemsSummary: itemsSummary || 'Nerozpoznané položky (nutno zkontrolovat)',
      });
    }
  }

  const totalIssuesCount =
    duplicateItemIssues.length +
    whatsappMismatchIssues.length +
    duplicateOrderIssues.length +
    unprocessedWhatsAppIssues.length;

  const cleanOrdersCount = Math.max(0, orders.length - (duplicateItemIssues.length + whatsappMismatchIssues.length));

  return {
    weekKey,
    scannedOrdersCount: orders.length,
    scannedWhatsAppCount: waMessages.length,
    duplicateItemIssues,
    whatsappMismatchIssues,
    duplicateOrderIssues,
    unprocessedWhatsAppIssues,
    cleanOrdersCount,
    totalIssuesCount,
  };
}

/**
 * Sloučí duplicitní řádky položek v objednávce do jednoho cílového řádku s daným množstvím
 */
export async function mergeDuplicateItemRows(
  rows: Array<{ id: string; quantity: number }>,
  targetQuantity: number
): Promise<{ success: boolean; error?: string }> {
  if (!rows || rows.length < 2) return { success: true };

  const [keepRow, ...deleteRows] = rows;
  const deleteIds = deleteRows.map((r) => r.id);

  // Update ponechaného řádku a smazání duplicit v JEDNÉ DB transakci (RPC) —
  // dřív šlo o dvě samostatná volání z klienta; když update prošel, ale delete
  // selhal (výpadek sítě, zavřený prohlížeč uprostřed), zůstaly v objednávce
  // OBA řádky se stejným pivem/obalem a množství se tiše zdvojilo.
  const { error } = await supabase.rpc('merge_duplicate_order_items', {
    p_keep_id: keepRow.id,
    p_delete_ids: deleteIds,
    p_target_quantity: targetQuantity,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Smaže konkrétní položku objednávky
 */
export async function deleteOrderItemRow(rowId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('order_items').delete().eq('id', rowId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
