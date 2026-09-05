import { Beer, Package, fetchAllRows, supabase } from './supabase';
import { WhatsAppIncoming } from './whatsappApi';
import { parseFreeTextEntries, emptyAliasMap, loadAliasMap } from './orderParser';
import { najdiRozjeteOdpocty, najdiRozjetaData, odpoctyStornovanych } from './zavozSync';

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

/**
 * Skladový odpočet zavozu se rozešel s objednávkou.
 *
 * Objednávka je pravda; odpočet je jen její otisk k okamžiku zavozu. Když se
 * po zavozu opraví množství, pivo nebo obal, sklad zůstane odepsaný podle
 * starého zadání. Dřív to nikdo nenašel — vyplavalo to až v inventuře jako
 * manko bez původu ve výrobě, o měsíce později.
 */
export interface ZavozDeductionIssue {
  type: 'zavoz_deduction_mismatch';
  /**
   * 'nesedi' — objednávka se po zavozu opravila, odpočet zůstal na starém.
   * 'storno' — objednávka je zrušená, ale sklad je pořád odepsaný. Uklidit
   *            to umí set_order_status; přímý UPDATE stavu ji obcházel.
   * 'datum'  — sklad ubyl k jinému dni, než se vezlo. Objednávka se přesunula
   *            až potom, co noční odpočet proběhl.
   */
  duvod: 'nesedi' | 'storno' | 'datum';
  orderId: string;
  orderItemId: string;
  placeName: string;
  orderDate: string;
  deliveryDate?: string | null;
  deductDate: string;
  /** Podle čeho je sklad odepsaný. */
  odepsano: { beerName: string; packageLabel: string; quantity: number };
  /** Jak to má být podle objednávky. */
  objednano: { beerId: string | null; packageId: string | null; beerName: string; packageLabel: string; quantity: number };
  /** Kladné = odepsáno o tolik kusů víc, než se objednalo. */
  rozdilKusu: number;
  jinePivoNeboObal: boolean;
  /** Jen u duvod === 'datum'. */
  denZavozu?: string;
  rozdilDnu?: number;
  /** Přesun přes konec měsíce — pak nesedí i inventura, ne jen týdenní pohled. */
  jinyMesic?: boolean;
}

export interface AuditReport {
  weekKey?: string;
  scannedOrdersCount: number;
  scannedWhatsAppCount: number;
  duplicateItemIssues: OrderItemDuplicateIssue[];
  whatsappMismatchIssues: WhatsAppMismatchIssue[];
  duplicateOrderIssues: DuplicateOrderIssue[];
  unprocessedWhatsAppIssues: UnprocessedWhatsAppIssue[];
  zavozDeductionIssues: ZavozDeductionIssue[];
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
  let ordersQuery = fetchAllRows('orders', 'id, order_date, delivery_date, delivery_day, place_id, place_name, status, whatsapp_message_id, created_at')
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
    const { data: itemsData, error: itemsErr } = await fetchAllRows(
      'order_items',
      'id, order_id, beer_id, package_id, quantity, beer_name, package_label, is_prepared',
    ).in('order_id', orderIds);
    if (itemsErr) {
      console.error('Audit: Chyba při načítání položek objednávek:', itemsErr);
    }
    orderItems = itemsData || [];
  }

  // 2. Načíst WhatsApp zprávy
  const waQuery = supabase
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
  //
  // Kontrola hlásila spoustu falešných nálezů, protože každý rozdíl mezi
  // zprávou a objednávkou brala jako chybu. Rozdíl je přitom často správně:
  //
  //   • objednávku někdo po importu ručně opravil (zákazník zavolal, doplnil
  //     se sud) — oprava se pak hlásila pořád dokola jako „nesouhlasí",
  //   • na zprávu navazoval dodatek („ještě dvě dvanáctky") — porovnávalo se
  //     jen s původní zprávou, takže doplněk vypadal jako přebytek,
  //   • u zprávy chybí uložený rozbor od AI, takže se text přeparsoval
  //     slabším lokálním parserem a rozdíl vznikl tímhle přeparsováním.
  //
  // Nově se hlásí jen to, kde rozdíl opravdu znamená špatně přečtenou zprávu.
  const whatsappMismatchIssues: WhatsAppMismatchIssue[] = [];

  // Zprávy, na které navazuje dodatek — objednávka u nich legitimně obsahuje
  // víc než původní zpráva.
  const maDodatek = new Set<string>();
  for (const m of waMessages as any[]) {
    if (m?.amends_message_id) maDodatek.add(String(m.amends_message_id));
  }

  const UPRAVENO_PO_MS = 10 * 60 * 1000; // víc než doběh importu = zásah člověka

  for (const o of orders) {
    if (!o.whatsapp_message_id) continue;
    const waMsg = waMap.get(o.whatsapp_message_id);
    if (!waMsg) continue;
    if (maDodatek.has(String(o.whatsapp_message_id))) continue;

    // Ruční úprava po importu: nejnovější položka vznikla znatelně později než
    // objednávka. To není chyba čtení, ale vědomá oprava člověkem.
    const polozkyObjednavky: any[] = itemsByOrder.get(o.id) ?? [];
    const vznikObjednavky = new Date((o as any).created_at || o.order_date).getTime();
    const nejnovejsiPolozka = polozkyObjednavky.reduce((max: number, it: any) => {
      const t = new Date(it.created_at || 0).getTime();
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    if (
      nejnovejsiPolozka > 0 &&
      Number.isFinite(vznikObjednavky) &&
      nejnovejsiPolozka - vznikObjednavky > UPRAVENO_PO_MS
    ) {
      continue;
    }

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
    } else {
      // Bez uloženého rozboru (parsed_items) se neví, co z té zprávy
      // aplikace skutečně vyčetla. Přeparsovat text lokálním parserem
      // a rozdíl vydávat za chybu čtení je nepoctivé — parser je slabší
      // než AI, která objednávku zakládala, takže by to hlásilo hlavně
      // vlastní nedostatky.
      continue;
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

  // --- KONTROLA 5: Skladový odpočet zavozu nesedí s objednávkou ---
  // Hlídač, ne oprava. Od 2.158 se odpočet po úpravě položky srovnává sám
  // (lib/zavozSync.ts), ale řádky rozešlé dřív — a cokoli, co by tu cestu
  // v budoucnu zase obešlo — musí appka umět sama najít.
  const zavozDeductionIssues: ZavozDeductionIssue[] = [];
  if (orderIds.length > 0) {
    const { data: dedData, error: dedErr } = await fetchAllRows(
      'zavoz_deductions',
      'order_id, order_item_id, beer_id, package_id, quantity, deduct_date',
    ).in('order_id', orderIds);
    if (dedErr) {
      console.error('Audit: Chyba při načítání odpočtů zavozu:', dedErr);
    }
    const odpocty = (dedData || []) as any[];
    const podleItemId = new Map(odpocty.map((d) => [d.order_item_id, d]));
    const orderById = new Map(orders.map((o: any) => [o.id, o]));
    const jmenoPiva = (id: string | null) => beers.find((b) => b.id === id)?.name ?? '?';
    const jmenoObalu = (id: string | null) => packages.find((p) => p.id === id)?.label ?? '?';

    const rozjete = najdiRozjeteOdpocty(
      orderItems.map((it: any) => ({
        id: it.id,
        beer_id: it.beer_id ?? null,
        package_id: it.package_id ?? null,
        quantity: Number(it.quantity || 0),
      })),
      odpocty,
    );

    // Datum odpočtu musí sedět na den zavozu. Uvnitř měsíce to inventuru
    // nerozhodí, ale týdenní pohled na sklad ukazuje výdej v jiný den, než
    // se doopravdy vezlo; přes konec měsíce se rozjede i inventura.
    const rozjetaData = najdiRozjetaData(
      orders.map((o: any) => ({
        id: o.id,
        order_date: o.order_date,
        delivery_day: o.delivery_day ?? null,
        delivery_date: o.delivery_date ?? null,
      })),
      odpocty,
    );
    const rozjeteItemIds = new Set(rozjete.map((r) => r.order_item_id));
    for (const d of rozjetaData) {
      // Řádek, který nesedí i množstvím, se hlásí jednou — jako 'nesedi'.
      if (rozjeteItemIds.has(d.order_item_id)) continue;
      const o: any = orderById.get(d.order_id);
      const zd: any = podleItemId.get(d.order_item_id);
      const beerName = jmenoPiva(zd?.beer_id ?? null);
      const packageLabel = jmenoObalu(zd?.package_id ?? null);
      zavozDeductionIssues.push({
        type: 'zavoz_deduction_mismatch',
        duvod: 'datum',
        orderId: d.order_id,
        orderItemId: d.order_item_id,
        placeName: o?.place_name || 'Neznámý podnik',
        orderDate: o?.order_date || '',
        deliveryDate: o?.delivery_date ?? null,
        deductDate: d.deductDate,
        odepsano: { beerName, packageLabel, quantity: Number(zd?.quantity ?? 0) },
        objednano: { beerId: zd?.beer_id ?? null, packageId: zd?.package_id ?? null, beerName, packageLabel, quantity: Number(zd?.quantity ?? 0) },
        rozdilKusu: 0,
        jinePivoNeboObal: false,
        denZavozu: d.denZavozu,
        rozdilDnu: d.rozdilDnu,
        jinyMesic: d.jinyMesic,
      });
    }

    for (const r of rozjete) {
      const o: any = orderById.get(r.order_id);
      const d: any = podleItemId.get(r.order_item_id);
      zavozDeductionIssues.push({
        type: 'zavoz_deduction_mismatch',
        duvod: 'nesedi',
        orderId: r.order_id,
        orderItemId: r.order_item_id,
        placeName: o?.place_name || 'Neznámý podnik',
        orderDate: o?.order_date || '',
        deliveryDate: o?.delivery_date ?? null,
        deductDate: d?.deduct_date || '',
        odepsano: {
          beerName: jmenoPiva(r.odpocet.beer_id),
          packageLabel: jmenoObalu(r.odpocet.package_id),
          quantity: r.odpocet.quantity,
        },
        objednano: {
          beerId: r.objednavka.beer_id,
          packageId: r.objednavka.package_id,
          beerName: jmenoPiva(r.objednavka.beer_id),
          packageLabel: jmenoObalu(r.objednavka.package_id),
          quantity: r.objednavka.quantity,
        },
        rozdilKusu: r.rozdilKusu,
        jinePivoNeboObal: r.jinePivoNeboObal,
      });
    }
  }

  // Stornované objednávky se do auditu nenačítají (dotaz je vylučuje), ale
  // právě u nich je nejhorší případ: zrušené zboží nikdo neodvezl a sklad
  // ho má pořád odepsané. Dotaz je proto vlastní a úzký.
  {
    const { data: stornoData } = await fetchAllRows('orders', 'id, place_name, order_date, delivery_date')
      .eq('status', 'storno');
    const stornoOrders = (stornoData || []) as any[];
    if (stornoOrders.length > 0) {
      const { data: stornoDed } = await fetchAllRows(
        'zavoz_deductions',
        'order_id, order_item_id, beer_id, package_id, quantity, deduct_date',
      ).in('order_id', stornoOrders.map((o) => o.id));
      const visici = odpoctyStornovanych(stornoOrders.map((o) => o.id), (stornoDed || []) as any[]);
      const stornoById = new Map(stornoOrders.map((o) => [o.id, o]));
      for (const d of visici) {
        const o: any = stornoById.get(d.order_id);
        const beerName = beers.find((b) => b.id === d.beer_id)?.name ?? '?';
        const packageLabel = packages.find((p) => p.id === d.package_id)?.label ?? '?';
        zavozDeductionIssues.push({
          type: 'zavoz_deduction_mismatch',
          duvod: 'storno',
          orderId: d.order_id,
          orderItemId: d.order_item_id,
          placeName: o?.place_name || 'Neznámý podnik',
          orderDate: o?.order_date || '',
          deliveryDate: o?.delivery_date ?? null,
          deductDate: d.deduct_date || '',
          odepsano: { beerName, packageLabel, quantity: Number(d.quantity) },
          objednano: { beerId: d.beer_id, packageId: d.package_id, beerName, packageLabel, quantity: 0 },
          rozdilKusu: Number(d.quantity),
          jinePivoNeboObal: false,
        });
      }
    }
  }

  const totalIssuesCount =
    duplicateItemIssues.length +
    whatsappMismatchIssues.length +
    duplicateOrderIssues.length +
    unprocessedWhatsAppIssues.length +
    zavozDeductionIssues.length;

  const cleanOrdersCount = Math.max(0, orders.length - (duplicateItemIssues.length + whatsappMismatchIssues.length));

  return {
    weekKey,
    scannedOrdersCount: orders.length,
    scannedWhatsAppCount: waMessages.length,
    duplicateItemIssues,
    whatsappMismatchIssues,
    duplicateOrderIssues,
    unprocessedWhatsAppIssues,
    zavozDeductionIssues,
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
