import { useEffect, useMemo, useState } from 'react';
import { supabase, Package, Beer, Place, useRealtime, formatPackageLabel } from '../lib/supabase';
import { Spinner, EmptyState, Modal } from '../components/ui';
import { orderWeightKg, fmtKg } from '../lib/weight';
import { DAYS } from '../lib/shared';
import { Calendar, Truck, Plus, FileText, Package as PackageIcon, CheckCircle2, Scale, Search, Printer, Share2, ArrowRightCircle, Phone, CalendarDays, MapPin, Pencil, StickyNote, Cylinder, Wine, ArrowRightLeft, AlertTriangle, MessageCircle, PenTool } from 'lucide-react';
import { shareDeliveryListToWhatsApp } from '../lib/whatsapp';
import { exportZavozToExcel } from '../lib/excel';
import { isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';
import { EditOrderModal } from '../components/EditOrderModal';
import { getSecondCarOrderIds, toggleOrderKachna, toggleOrdersKachna, migrateSecondCarDatesToOrders } from '../lib/zavozSecondCar';
import { SignatureModal } from '../components/SignatureModal';
import { KegReturnModal } from '../components/KegReturnModal';
import { saveKegReturns, fetchKegMovements, computeKegBalances, type KegBalance } from '../lib/kegAccount';
import { useAuth } from '../lib/auth';
import { openNavigation, buildCustomerDeliveryWhatsAppText, openCustomerWhatsApp } from '../lib/navigation';
import { printDeliveryList } from '../lib/safePrint';

type Order = {
  id: string; order_date: string; place_id: string | null; place_name: string | null;
  status: string; delivery_day: string | null; is_prepared: boolean; is_packaged: boolean;
  is_delivered: boolean; note: string | null; source: string; delivered_at: string | null;
  created_at: string; delivery_date: string | null;
  place_phone?: string | null;
  signature_url?: string | null;
  signature_name?: string | null;
};
type OrderItem = { id: string; order_id: string; beer_id: string | null; beer_name: string | null; package_id: string | null; package_label: string | null; quantity: number; is_prepared: boolean };

export default function Zavoz({ setPage, embedded = false }: { setPage?: (p: any, sec?: string) => void; embedded?: boolean } = {}) {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [packages, setPackages] = useState<Package[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [weekKey, setWeekKey] = useState(isoWeekKey(new Date().toISOString().slice(0, 10)));
  const [hideDelivered, setHideDelivered] = useState(false);
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all');
  const [mobileTab, setMobileTab] = useState<'routes' | 'loading'>('routes');
  const [searchTerm, setSearchTerm] = useState('');
  const [moveDay, setMoveDay] = useState<{ source: string | null; label: string; orderIds: string[] } | null>(null);
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [secondCarOrderIds, setSecondCarOrderIds] = useState<string[]>(() => getSecondCarOrderIds());

  // Driver Tool Modals
  const [navTarget, setNavTarget] = useState<{ name: string; destination: string } | null>(null);
  const [signOrder, setSignOrder] = useState<Order | null>(null);
  const [kegReturnOrder, setKegReturnOrder] = useState<Order | null>(null);
  // Konto sudů — kdo má u sebe kolik prázdných KEGů (odvezeno − vráceno).
  const [kegBalances, setKegBalances] = useState<KegBalance[]>([]);
  const [showKegBalances, setShowKegBalances] = useState(false);

  async function load(silent = false) {
    if (!silent && !orders.length) setLoading(true);
    const [{ data: o }, { data: p }, { data: b }, { data: pl }] = await Promise.all([
      supabase.from('orders').select('*').neq('status', 'storno').order('order_date', { ascending: false }),
      supabase.from('packages').select('*'),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('places').select('*').order('name'),
    ]);
    const ords = ((o as Order[]) ?? []).map(order => {
      const place = (pl as Place[] ?? []).find(p => p.id === order.place_id);
      return { ...order, place_phone: place?.phone ?? null, delivery_group: (place as any)?.delivery_group };
    });
    setOrders(ords);
    // Jednorázová migrace ze starého (datumového) na nové (po objednávkách) označení
    // druhého auta — bez efektu, pokud už migrace proběhla nebo staré označení chybí.
    migrateSecondCarDatesToOrders(ords);
    setSecondCarOrderIds(getSecondCarOrderIds());
    setPackages((p as Package[]) ?? []);
    setBeers((b as Beer[]) ?? []);
    setPlaces((pl as Place[]) ?? []);
    if (ords.length) {
      const { data: it } = await supabase.from('order_items').select('*').in('order_id', ords.map((x) => x.id));
      const map: Record<string, OrderItem[]> = {};
      (it as OrderItem[])?.forEach((i) => { (map[i.order_id] ??= []).push(i); });
      setItems(map);
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useRealtime(['orders', 'order_items', 'packages', 'beers', 'places', 'keg_returns'], () => load(true));

  // Konto sudů se počítá ze všech pohybů (odvezeno/vráceno) — načítá se zvlášť,
  // ať to nezdržuje hlavní seznam závozu.
  async function loadKegBalances() {
    try {
      setKegBalances(computeKegBalances(await fetchKegMovements()));
    } catch { /* konto sudů je doplňkový přehled — chyba nesmí shodit obrazovku */ }
  }
  useEffect(() => { loadKegBalances(); }, []);
  useRealtime(['keg_returns'], loadKegBalances);

  const activeOrders = useMemo(() => {
    return orders.filter((o) => isoWeekKey(o.order_date) === weekKey);
  }, [orders, weekKey]);

  const weekOrders = useMemo(
    () => orders.filter((o) => isoWeekKey(o.order_date) === weekKey && o.status !== 'storno'),
    [orders, weekKey]
  );

  const dayStats = useMemo(() => {
    const m = new Map<string, { count: number; qty: number }>();
    weekOrders.forEach((o) => {
      const key = o.delivery_day || '_none';
      const cur = m.get(key) ?? { count: 0, qty: 0 };
      cur.count += 1;
      const orderQty = (items[o.id] ?? []).reduce((s, i) => s + Number(i.quantity), 0);
      cur.qty += orderQty;
      m.set(key, cur);
    });
    return m;
  }, [weekOrders, items]);

  const filteredOrders = useMemo(() => {
    return activeOrders.filter((o) => {
      if (hideDelivered && o.is_delivered) return false;
      if (selectedDayFilter !== 'all') {
        if (selectedDayFilter === '_none' && o.delivery_day) return false;
        if (selectedDayFilter !== '_none' && o.delivery_day !== selectedDayFilter) return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const pName = (o.place_name ?? '').toLowerCase();
        const oItems = items[o.id] ?? [];
        const hasBeer = oItems.some((i) => (i.beer_name ?? '').toLowerCase().includes(q));
        if (!pName.includes(q) && !hasBeer) return false;
      }
      return true;
    });
  }, [activeOrders, hideDelivered, selectedDayFilter, searchTerm, items]);

  const loadingListBreakdown = useMemo(() => {
    const kegMap = new Map<string, { label: string; qty: number; preparedQty: number }>();
    const bottleMap = new Map<string, { label: string; qty: number; preparedQty: number }>();
    let totalKegs = 0;
    let totalBottles = 0;

    filteredOrders.forEach((o) => {
      (items[o.id] ?? []).forEach((i) => {
        const pkg = packages.find((p) => p.id === i.package_id);
        const pkgLabel = i.package_label ?? pkg?.label ?? 'Neurčeno';
        const isKeg = pkg?.kind === 'keg' || pkgLabel.toLowerCase().includes('keg') || pkgLabel.toLowerCase().includes('sud');
        const label = `${formatPackageLabel(pkgLabel)} ${i.beer_name ?? '?'}`;
        const qty = Number(i.quantity);
        const preparedQty = i.is_prepared ? qty : 0;

        if (isKeg) {
          const cur = kegMap.get(label) ?? { label, qty: 0, preparedQty: 0 };
          cur.qty += qty;
          cur.preparedQty += preparedQty;
          kegMap.set(label, cur);
          totalKegs += qty;
        } else {
          const cur = bottleMap.get(label) ?? { label, qty: 0, preparedQty: 0 };
          cur.qty += qty;
          cur.preparedQty += preparedQty;
          bottleMap.set(label, cur);
          totalBottles += qty;
        }
      });
    });

    const kegs = [...kegMap.values()].sort((a, b) => b.qty - a.qty);
    const bottles = [...bottleMap.values()].sort((a, b) => b.qty - a.qty);
    const preparedCount = [...kegMap.values(), ...bottleMap.values()].filter((x) => x.preparedQty >= x.qty).length;
    const totalLabels = kegMap.size + bottleMap.size;

    return { kegs, bottles, totalKegs, totalBottles, totalCount: totalKegs + totalBottles, preparedCount, totalLabels };
  }, [filteredOrders, items, packages]);

  const totalWeight = useMemo(() => {
    return filteredOrders.reduce((sum, o) => {
      const its = items[o.id] ?? [];
      return sum + orderWeightKg(its, packages);
    }, 0);
  }, [filteredOrders, items, packages]);

  const ordersGroupedByDay = useMemo(() => {
    const orderDays = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne', '_none']; // Keep this order
    const dayGroups: { dayKey: string; label: string; orders: any[] }[] = [];

    for (const dKey of orderDays) {
        const dayOrders = filteredOrders.filter((o) => (dKey === '_none' ? !o.delivery_day : o.delivery_day === dKey));
        if (dayOrders.length === 0) continue;

        const groupedByDelivery = new Map<string, any[]>();
        for (const order of dayOrders) {
            const groupKey = (order as any).delivery_group || order.id;
            if (!groupedByDelivery.has(groupKey)) {
                groupedByDelivery.set(groupKey, []);
            }
            groupedByDelivery.get(groupKey)!.push(order);
        }

        const finalOrders = Array.from(groupedByDelivery.values()).map(orderGroup => {
            if (orderGroup.length > 1) {
                return { isGroup: true, groupName: (orderGroup[0] as any).delivery_group, orders: orderGroup };
            }
            return orderGroup[0];
        });

        const label = dKey === '_none' ? 'Bez určeného dne' : (DAYS.find((d) => d.v === dKey)?.label ?? dKey);
        dayGroups.push({ dayKey: dKey, label, orders: finalOrders });
    }
    return dayGroups;
}, [filteredOrders]);

  async function toggleItemPrepared(o: Order, it: OrderItem) {
    const newPrepared = !it.is_prepared;
    const { error } = await supabase.from('order_items').update({ is_prepared: newPrepared }).eq('id', it.id);
    if (error) return;
    const its = items[o.id] ?? [];
    const updatedItems = its.map((x) => (x.id === it.id ? { ...x, is_prepared: newPrepared } : x));
    setItems((m) => ({ ...m, [o.id]: updatedItems }));
    // Auto-update order is_prepared flag if all items are prepared
    const allPrepared = updatedItems.every((x) => x.is_prepared);
    if (allPrepared !== o.is_prepared) {
      await supabase.from('orders').update({ is_prepared: allPrepared }).eq('id', o.id);
      setOrders((arr) => arr.map((x) => (x.id === o.id ? { ...x, is_prepared: allPrepared } : x)));
    }
  }

  // Toggle all order_items matching a loading-list label (beer_name + package)
  async function toggleLoadingLabel(label: string, currentlyAllPrepared: boolean) {
    const newPrepared = !currentlyAllPrepared;
    // Find all order_items across filteredOrders that match this label
    const toUpdate: { orderId: string; itemId: string }[] = [];
    filteredOrders.forEach((o) => {
      (items[o.id] ?? []).forEach((it) => {
        const pkg = packages.find((p) => p.id === it.package_id);
        const pkgLabel = it.package_label ?? pkg?.label ?? 'Neurčeno';
        const itemLabel = `${formatPackageLabel(pkgLabel)} ${it.beer_name ?? '?'}`;
        if (itemLabel === label) toUpdate.push({ orderId: o.id, itemId: it.id });
      });
    });
    if (!toUpdate.length) return;
    // Batch update in DB
    await Promise.all(toUpdate.map(({ itemId }) =>
      supabase.from('order_items').update({ is_prepared: newPrepared }).eq('id', itemId)
    ));
    // Update local state
    setItems((m) => {
      const next = { ...m };
      toUpdate.forEach(({ orderId, itemId }) => {
        next[orderId] = (next[orderId] ?? []).map((x) => x.id === itemId ? { ...x, is_prepared: newPrepared } : x);
      });
      return next;
    });
    // Auto-mark orders as prepared if all items done
    const orderIds = [...new Set(toUpdate.map((x) => x.orderId))];
    for (const oid of orderIds) {
      const updatedIts = (items[oid] ?? []).map((x) =>
        toUpdate.find((u) => u.itemId === x.id) ? { ...x, is_prepared: newPrepared } : x
      );
      const allPrepared = updatedIts.every((x) => x.is_prepared);
      const order = filteredOrders.find((o) => o.id === oid);
      if (order && allPrepared !== order.is_prepared) {
        await supabase.from('orders').update({ is_prepared: allPrepared }).eq('id', oid);
        setOrders((arr) => arr.map((x) => (x.id === oid ? { ...x, is_prepared: allPrepared } : x)));
      }
    }
  }

  async function toggleDelivered(o: Order, afterDeliveredCallback?: () => void) {
    const nowDelivered = !o.is_delivered;
    const patch: Record<string, unknown> = { is_delivered: nowDelivered };
    if (nowDelivered) {
      patch.delivered_at = new Date().toISOString();
      // Auto-mark as 'vyrizeno_zavoz' for proper stock tracking
      if (o.status === 'nova' || o.status === 'pripravena') {
        patch.status = 'vyrizeno_zavoz';
      }
    } else {
      patch.delivered_at = null;
      // Revert to 'nova' if undelivered
      if (o.status === 'vyrizeno_zavoz') patch.status = 'nova';
    }
    await supabase.from('orders').update(patch).eq('id', o.id);
    setOrders((arr) => arr.map((x) => (x.id === o.id ? ({ ...x, ...patch } as Order) : x)));
    // After marking as delivered, offer keg return dialog
    if (nowDelivered && afterDeliveredCallback) afterDeliveredCallback();
  }

  async function markAllAsPrepared(o: Order) {
    const orderItems = items[o.id] ?? [];
    if (orderItems.length === 0) return;
    await Promise.all(orderItems.filter(it => !it.is_prepared).map(it => toggleItemPrepared(o, it)));
  }

  // Konkrétní data CELÉHO závozu — pro každou objednávku dne stejný klíč, jaký používá
  // generátor Knihy jízd (delivery_date ?? order_date). Závoz může obsahovat objednávky
  // s více daty, proto vracíme VŠECHNA, aby se „Druhé auto (Kačena)“ vztáhlo na celý závoz.

  // Zaškrtnutí „Druhé auto (Kačena)“ pro celý den najednou (tlačítko u nadpisu dne) —
  // označí VŠECHNY objednávky toho dne. Jednotlivé objednávky lze pak dál doladit
  // zvlášť (viz toggleOrderKachnaFor) — např. jen 2 ze 3 skutečně jely Kačenou.
  function toggleSecondCarForDay(orderIds: string[]) {
    if (!orderIds.length) return;
    setSecondCarOrderIds(toggleOrdersKachna(orderIds));
  }

  // Zaškrtnutí „Druhé auto (Kačena)“ pro JEDNU konkrétní objednávku — umožní smíšený
  // den (část objednávek Kačenou, část velkým autem). Kniha jízd pak takový den
  // rozdělí na dvě jízdy.
  function toggleOrderKachnaFor(orderId: string) {
    setSecondCarOrderIds(toggleOrderKachna(orderId));
  }

  // Otevře dialog pro přesun celého dne závozu na jiný den (pouze objednávky aktuálního týdne)
  function openMoveDay(dayKey: string) {
    const source = dayKey === '_none' ? null : dayKey;
    const label = dayKey === '_none' ? 'Bez určeného dne' : (DAYS.find((d) => d.v === dayKey)?.label ?? dayKey);
    const orderIds = activeOrders
      .filter((o) => (source ? o.delivery_day === source : !o.delivery_day))
      .map((o) => o.id);
    if (!orderIds.length) return;
    setMoveTarget(null);
    setMoveDay({ source, label, orderIds });
  }

  // Hromadně přepíše delivery_day všem objednávkám přesouvaného dne
  async function confirmMoveDay() {
    if (!moveDay || moveTarget === null || moveBusy) return;
    setMoveBusy(true);
    const newDay = moveTarget === '_none' ? null : moveTarget;
    const { error } = await supabase.from('orders').update({ delivery_day: newDay }).in('id', moveDay.orderIds);
    if (!error) {
      const ids = new Set(moveDay.orderIds);
      setOrders((arr) => arr.map((x) => (ids.has(x.id) ? ({ ...x, delivery_day: newDay } as Order) : x)));
      setMoveDay(null);
      setMoveTarget(null);
    }
    setMoveBusy(false);
  }
  function printDeliveryListForOrders(toPrint: Order[], titleLabel: string) {
    printDeliveryList({
      title: `Zavážecí list — ${titleLabel}`,
      heading: `🚚 Zavážecí list — ${titleLabel}`,
      summary: `Celkem objednávek: ${toPrint.length}`,
      emptyMessage: 'Žádné objednávky k vytištění.',
      orders: toPrint.map((order) => ({
        placeName: order.place_name,
        deliveryLabel: order.delivery_day
          ? DAYS.find((day) => day.v === order.delivery_day)?.label
          : 'Bez dne',
        note: order.note,
        items: (items[order.id] ?? []).map((item) => ({
          beerName: item.beer_name,
          quantity: item.quantity,
          packageLabel: item.package_label,
        })),
      })),
    });
  }

  const wr = weekRange(weekKey);
  const deliveredCount = activeOrders.filter((o) => o.is_delivered).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Navigation Tabs — zobrazeno jen na samostatné stránce Závoz (ne když je vloženo v Objednávkách) */}
      {!embedded && (
        <div className="flex items-center gap-1.5 flex-nowrap border-b border-neutral-200 pb-2 w-full">
          {setPage && (
            <button
              onClick={() => setPage('orders_entry')}
              className="flex-1 px-2 py-1.5 rounded font-black text-[11px] leading-tight transition flex items-center justify-center gap-1 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 shadow-xs whitespace-nowrap"
            >
              <Plus size={14} />
              <span>Nové</span>
            </button>
          )}
          {setPage && (
            <button
              onClick={() => setPage('orders')}
              className="flex-1 px-2 py-1.5 rounded font-black text-[11px] leading-tight transition flex items-center justify-center gap-1 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 shadow-xs whitespace-nowrap"
            >
              <FileText size={14} />
              <span>Přehled</span>
            </button>
          )}
          <button
            className="flex-1 px-2 py-1.5 rounded font-black text-[11px] leading-tight transition flex items-center justify-center gap-1 bg-white text-neutral-900 shadow-md whitespace-nowrap"
          >
            <Truck size={14} />
            <span>Závoz</span>
          </button>
        </div>
      )}

      {/* Top Action Bar — styl jako Stáčení KEG / Lahve */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded border border-neutral-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <span className="text-sm font-display font-black text-amber-950 flex items-center gap-1.5">
            <span>🚚</span>
            <span>Závoz</span>
          </span>
          <div className="relative group">
            <button className="btn-ghost !rounded !bg-white border-amber-300 text-amber-950 font-extrabold text-xs shadow-xs" disabled={!activeOrders.length}>📊 Export Excel ▾</button>
            {activeOrders.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-neutral-200 rounded shadow-lg py-1 min-w-[180px] hidden group-hover:block group-focus-within:block">
                <button className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-amber-50 hover:text-amber-950 transition" onClick={() => {
                  const rows = weekOrders.flatMap((o) => (items[o.id] ?? []).map((i) => ({
                    order_date: o.order_date, place_name: o.place_name, delivery_day: o.delivery_day,
                    beer_name: i.beer_name, package_label: i.package_label, quantity: i.quantity, is_delivered: o.is_delivered,
                  })));
                  exportZavozToExcel(rows, `tyden-${weekKey}`);
                }}>📅 Tento týden</button>
                <button className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-amber-50 hover:text-amber-950 transition" onClick={() => {
                  const rows = orders.filter((o) => o.status !== 'storno').flatMap((o) => (items[o.id] ?? []).map((i) => ({
                    order_date: o.order_date, place_name: o.place_name, delivery_day: o.delivery_day,
                    beer_name: i.beer_name, package_label: i.package_label, quantity: i.quantity, is_delivered: o.is_delivered,
                  })));
                  exportZavozToExcel(rows, 'vse');
                }}>📅 Všechno</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 🛢️ KONTO SUDŮ — kdo má u sebe kolik prázdných KEGů.
          Dřív se vrácené sudy nikam neukládaly, takže se nedalo zjistit,
          kdo kolik dluží; sud přitom stojí 2–3 tisíce. */}
      {kegBalances.length > 0 && (
        <div className="card p-0 overflow-hidden border border-sky-300">
          <button
            type="button"
            onClick={() => setShowKegBalances((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-sky-50 hover:bg-sky-100 transition text-left"
          >
            <span className="flex items-center gap-2 font-black text-sm text-sky-950">
              <Cylinder size={16} className="text-sky-700" />
              Konto sudů — u odběratelů je {kegBalances.reduce((s, b) => s + b.total, 0)} prázdných KEGů
            </span>
            <span className="text-xs font-bold text-sky-800 shrink-0">
              {showKegBalances ? 'Skrýt ▲' : `Zobrazit (${kegBalances.length}) ▼`}
            </span>
          </button>
          {showKegBalances && (
            <div className="divide-y divide-neutral-200">
              {kegBalances.map((b) => (
                <div key={b.placeId ?? b.placeName} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span className="font-bold text-sm text-neutral-900">{b.placeName}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {Object.entries(b.byVolume)
                      .filter(([, n]) => n !== 0)
                      .sort((x, y) => Number(y[0]) - Number(x[0]))
                      .map(([vol, n]) => (
                        <span
                          key={vol}
                          className={`px-2 py-0.5 rounded-md text-xs font-black tabular-nums ${
                            n > 0 ? 'bg-sky-100 text-sky-950 border border-sky-300' : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                          }`}
                          title={n > 0 ? 'Nevrácené sudy u odběratele' : 'Vráceno víc, než bylo evidováno odvezeno'}
                        >
                          {n > 0 ? `${n}× ` : `${n}× `}{vol}l
                        </span>
                      ))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AKTUÁLNÍ ZÁVOZOVÝ TÝDEN */}
      <>
        {/* Action Controls */}
          <div className="flex flex-wrap items-center justify-end gap-3 mb-2">
            <label className="flex items-center gap-2 text-xs font-extrabold text-amber-950 cursor-pointer px-3.5 py-2.5 rounded bg-white border border-amber-300/80 hover:bg-amber-50 transition shadow-xs">
              <input
                type="checkbox"
                checked={hideDelivered}
                onChange={(e) => setHideDelivered(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 accent-amber-500"
              />
              <span>Skrýt zavezené</span>
            </label>

            <button
              onClick={() => printDeliveryListForOrders(filteredOrders, `týden ${weekKey}`)}
              disabled={!activeOrders.length}
              className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs transition shadow-md flex items-center gap-2"
            >
              <Printer size={15} />
              <span>Tisk rozvozového listu</span>
            </button>
          </div>

          {/* Week Selector Bar */}
          <div className="card p-3 shadow-sm border-neutral-200/80 bg-white flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setWeekKey(shiftWeek(weekKey, -1))} className="btn-ghost !rounded !py-2 !px-3 font-black text-base" title="Předchozí týden">‹</button>
            <div className="text-center flex-1">
              <div className="font-display font-black text-neutral-900 text-sm flex items-center justify-center gap-1.5">
                <Calendar size={14} className="text-amber-600" />
                <span>Týden {weekKey.split('-')[1]} / {weekKey.split('-')[0]}</span>
              </div>
              <div className="text-[11px] text-neutral-500 font-bold mt-0.5">{wr.label}</div>
            </div>
            <button onClick={() => setWeekKey(shiftWeek(weekKey, 1))} className="btn-ghost !rounded !py-2 !px-3 font-black text-base" title="Následující týden">›</button>
            <button onClick={() => setWeekKey(isoWeekKey(new Date().toISOString().slice(0, 10)))} className="btn-ghost !rounded !py-2 !px-3 text-xs font-black text-amber-700">Dnes</button>
          </div>

          {/* Kompaktní přehled závozu — styl jako "Zbývá stočit keg" */}
          <div className="card p-3 mb-4 border-2 border-amber-300/80 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-display font-black text-amber-950 text-xs">🚚 Závoz na tento týden</span>
                <span className="text-[10px] text-amber-800/70">{wr.label}</span>
              </div>
              <span className="chip bg-amber-500 text-slate-950 font-mono font-black text-xs">
                {activeOrders.length} objednávek
              </span>
            </div>

            {activeOrders.length === 0 ? (
              <div className="text-xs text-emerald-800 bg-emerald-100/80 border border-emerald-200 rounded px-3 py-2 font-bold flex items-center gap-1.5">
                <span>✅</span>
                <span>Žádné objednávky k závozu tento týden.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {DAYS.map((d) => {
                  const stats = dayStats.get(d.v) ?? { count: 0, qty: 0 };
                  if (stats.count === 0) return null;
                  return (
                    <button
                      key={d.v}
                      onClick={() => setSelectedDayFilter(selectedDayFilter === d.v ? 'all' : d.v)}
                      className={`flex items-center gap-1 bg-amber-100/80 rounded px-2.5 py-1.5 border shadow-2xs transition ${
                        selectedDayFilter === d.v ? 'border-amber-500 bg-amber-200' : 'border-amber-300/60 hover:bg-amber-200'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-amber-950 whitespace-nowrap">{d.label}</span>
                      <span className="text-xs font-black text-amber-800">{stats.count}</span>
                    </button>
                  );
                })}
                {(() => {
                  const noneStats = dayStats.get('_none');
                  if (!noneStats || noneStats.count === 0) return null;
                  return (
                    <button
                      onClick={() => setSelectedDayFilter(selectedDayFilter === '_none' ? 'all' : '_none')}
                      className={`flex items-center gap-1 bg-neutral-200/80 rounded px-2.5 py-1.5 border shadow-2xs transition ${
                        selectedDayFilter === '_none' ? 'border-neutral-500 bg-neutral-300' : 'border-neutral-300/60 hover:bg-neutral-300'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-neutral-800 whitespace-nowrap">Bez dne</span>
                      <span className="text-xs font-black text-neutral-700">{noneStats.count}</span>
                    </button>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Interactive Day Filter Tabs — jediná ukotvená lišta v Zavozu (spolu s přepínačem Trasy/Co naložit níže). */}
          <div className="sticky top-[52px] z-20 flex items-center gap-2 overflow-x-auto scrollbar-thin bg-neutral-100 pb-2 pt-1">
            <button
              onClick={() => setSelectedDayFilter('all')}
              className={`px-4 py-2.5 rounded font-black text-xs shrink-0 transition-all flex items-center gap-2 shadow-xs ${
                selectedDayFilter === 'all'
                  ? 'bg-amber-500 text-neutral-950 scale-105'
                  : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <CalendarDays size={14} />
              <span>Všechny</span>
            </button>

            {DAYS.map((d) => {
              const stats = dayStats.get(d.v) ?? { count: 0, qty: 0 };
              const isSelected = selectedDayFilter === d.v;

              return (
                <div key={d.v} className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setSelectedDayFilter(isSelected ? 'all' : d.v)}
                    className={`px-3.5 py-2 rounded font-black text-xs transition-all flex items-center gap-1.5 shadow-xs ${
                      isSelected
                        ? 'bg-amber-500 text-neutral-950 scale-105'
                        : stats.count > 0
                        ? 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                        : 'bg-neutral-200 text-neutral-400'
                    }`}
                  >
                    <Truck size={13} />
                    <span>{d.label}</span>
                  </button>
                  {stats.count > 0 && (
                    <button
                      onClick={() => openMoveDay(d.v)}
                      title={`Přesunout ${d.label} na jiný den`}
                      className="w-8 h-8 grid place-items-center rounded border border-neutral-200 bg-white text-neutral-400 hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50 transition shadow-xs"
                    >
                      <ArrowRightLeft size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Top Quick Search & Weight Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded border border-neutral-200/90 shadow-xs">
            <div className="relative flex-1 min-w-[240px] flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Hledat hospodu, pivo nebo obal..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded border border-neutral-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-black text-neutral-700">
              <div className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-50 border border-amber-200/80 text-amber-900">
                <Scale size={13} className="text-amber-600" />
                <span>Váha: <strong className="font-mono">{fmtKg(totalWeight)} kg</strong></span>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 border border-emerald-200/80 text-emerald-900">
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span>Zavezeno: <strong className="font-mono">{deliveredCount}/{activeOrders.length}</strong></span>
              </div>
            </div>
          </div>

          {loading ? (
            <Spinner />
          ) : activeOrders.length === 0 ? (
            <EmptyState text="Žádné objednávky k závozu pro zvolený filtr." icon="🚚" />
          ) : (
            <>
              {/* Mobile Tab Switcher — ukotvený hned pod dnovým filtrem výše. */}
              <div className="lg:hidden sticky top-[100px] z-20 flex items-center p-1.5 rounded bg-white border border-neutral-200 shadow-md">
                <button
                  onClick={() => setMobileTab('routes')}
                  className={`flex-1 py-3 px-3 rounded font-black text-xs transition-all flex items-center justify-center gap-2 ${
                    mobileTab === 'routes' ? 'bg-amber-500 text-neutral-950 shadow-md scale-[1.02]' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <Truck size={16} />
                  <span>Trasy & Hospody</span>
                </button>

                <button
                  onClick={() => setMobileTab('loading')}
                  className={`flex-1 py-3 px-3 rounded font-black text-xs transition-all flex items-center justify-center gap-2 ${
                    mobileTab === 'loading' ? 'bg-amber-500 text-neutral-950 shadow-md scale-[1.02]' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <PackageIcon size={16} />
                  <span>Co naložit ({loadingListBreakdown.totalCount} ks)</span>
                </button>
              </div>

              {/* MAIN 2-COLUMN DRIVER DASHBOARD */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT COLUMN: NAKLÁDKOVÝ LIST DO AUTA */}
                <div className={`lg:col-span-5 bg-white text-neutral-900 p-5 rounded border-2 border-amber-300 shadow-md space-y-5 sticky top-4 ${
                  mobileTab === 'loading' ? 'block' : 'hidden lg:block'
                }`}>
                  <div className="flex items-center justify-between pb-3 border-b border-amber-200/80">
                    <div>
                      <h2 className="font-display font-black text-lg text-neutral-950 flex items-center gap-2">
                        <PackageIcon size={20} className="text-amber-600" />
                        <span>Co naložit do auta</span>
                      </h2>
                      <p className="text-xs text-neutral-700 mt-0.5 font-bold">
                        {selectedDayFilter === 'all' ? 'Součet pro všechny dny' : `Nakládka pro: ${DAYS.find((d) => d.v === selectedDayFilter)?.label ?? 'Vybraný den'}`}
                      </p>
                    </div>

                    <span className="px-3 py-1 rounded-full bg-amber-500 text-neutral-950 font-mono font-black text-sm shadow-xs">
                      {loadingListBreakdown.totalCount} ks
                    </span>
                  </div>

                  {/* Progress indicator */}
                  {loadingListBreakdown.totalLabels > 0 && (
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <div className="flex-1 h-2 rounded-full bg-neutral-200 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.round((loadingListBreakdown.preparedCount / loadingListBreakdown.totalLabels) * 100)}%` }}
                        />
                      </div>
                      <span className="text-emerald-700 font-black shrink-0">
                        {loadingListBreakdown.preparedCount}/{loadingListBreakdown.totalLabels} připraveno
                      </span>
                    </div>
                  )}

                  {/* Kegs Section */}
                  {loadingListBreakdown.kegs.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-neutral-900 mb-2.5 pb-1 border-b border-amber-200/80">
                        <span className="flex items-center gap-1.5"><Cylinder size={14} className="text-amber-700" /> Sudy & Kegy</span>
                        <span className="font-mono text-neutral-950 bg-amber-200 px-2 py-0.5 rounded-md font-bold">{loadingListBreakdown.totalKegs} ks</span>
                      </div>

                      <div className="space-y-1.5">
                        {loadingListBreakdown.kegs.map((k) => {
                          const allPrepared = k.preparedQty >= k.qty;
                          return (
                            <button
                              key={k.label}
                              onClick={() => toggleLoadingLabel(k.label, allPrepared)}
                              className={`w-full flex items-center justify-between p-2.5 rounded border shadow-xs transition text-left ${
                                allPrepared
                                  ? 'bg-emerald-50 border-emerald-300 opacity-80'
                                  : 'bg-white hover:bg-amber-50 border-amber-200/80'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-5 h-5 rounded border-2 flex items-center justify-center text-[11px] shrink-0 ${
                                  allPrepared ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-neutral-300'
                                }`}>{allPrepared ? '✓' : ''}</span>
                                <span className={`font-extrabold text-xs truncate ${
                                  allPrepared ? 'text-emerald-800 line-through' : 'text-neutral-900'
                                }`}>{k.label}</span>
                              </div>
                              <span className={`px-2.5 py-1 rounded font-mono font-black text-xs shrink-0 shadow-xs ml-2 ${
                                allPrepared ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-neutral-950'
                              }`}>{k.qty} ks</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Bottles Section */}
                  {loadingListBreakdown.bottles.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-emerald-900 mb-2.5 pb-1 border-b border-emerald-200/80">
                        <span className="flex items-center gap-1.5"><Wine size={14} className="text-emerald-700" /> Lahve</span>
                        <span className="font-mono text-emerald-950 bg-emerald-200 px-2 py-0.5 rounded-md font-bold">{loadingListBreakdown.totalBottles} ks</span>
                      </div>

                      <div className="space-y-1.5 max-h-[350px] overflow-y-auto scrollbar-thin pr-1">
                        {loadingListBreakdown.bottles.map((b) => {
                          const allPrepared = b.preparedQty >= b.qty;
                          return (
                            <button
                              key={b.label}
                              onClick={() => toggleLoadingLabel(b.label, allPrepared)}
                              className={`w-full flex items-center justify-between p-2.5 rounded border shadow-xs transition text-left ${
                                allPrepared
                                  ? 'bg-emerald-50 border-emerald-300 opacity-80'
                                  : 'bg-white hover:bg-emerald-50 border-emerald-200/80'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`w-5 h-5 rounded border-2 flex items-center justify-center text-[11px] shrink-0 ${
                                  allPrepared ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-neutral-300'
                                }`}>{allPrepared ? '✓' : ''}</span>
                                <span className={`font-extrabold text-xs truncate ${
                                  allPrepared ? 'text-emerald-800 line-through' : 'text-neutral-900'
                                }`}>{b.label}</span>
                              </div>
                              <span className={`px-2.5 py-1 rounded font-mono font-black text-xs shrink-0 shadow-xs ml-2 ${
                                allPrepared ? 'bg-emerald-600 text-white' : 'bg-emerald-600 text-white'
                              }`}>{b.qty} ks</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* RIGHT COLUMN: ODBĚRATELÉ A ROZVOZOVÉ TRASY */}
                <div className={`lg:col-span-7 space-y-6 ${mobileTab === 'routes' ? 'block' : 'hidden lg:block'}`}>
                  {ordersGroupedByDay.map((group) => {
                    const gOrderIds = group.orders.flatMap((entry: any) => entry.isGroup ? entry.orders.map((o: Order) => o.id) : [entry.id]);
                    return (
                    <div key={group.dayKey} className="card p-5 shadow-sm border-neutral-200/90 bg-white rounded space-y-4">
                      {/* Day Section Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-neutral-200/70">
                        <div
                          onClick={() => openMoveDay(group.dayKey)}
                          title={`Změnit den závozu — přesunout ${group.label} na jiný den`}
                          className="flex items-center gap-3 cursor-pointer group select-none"
                        >
                          <div className="w-10 h-10 rounded bg-amber-500 text-slate-950 font-black text-lg flex items-center justify-center shadow-md group-hover:bg-amber-600 transition">
                            <Truck size={20} />
                          </div>
                          <div>
                            <h3 className="font-display font-extrabold text-lg text-neutral-900 group-hover:text-amber-700 transition flex items-center gap-1.5">
                              {group.label}
                              <ArrowRightLeft size={15} className="text-amber-500 opacity-0 group-hover:opacity-100 transition" />
                            </h3>
                            <p className="text-xs text-neutral-500 font-medium">{group.orders.length} objednávek v tento den</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 flex-wrap justify-end">
                          <span className="chip bg-amber-500 text-slate-950 font-mono font-black text-xs">
                            {group.orders.reduce((s, o) => s + (items[o.id] ?? []).reduce((x, i) => x + Number(i.quantity), 0), 0)} ks celkem
                          </span>
                          <button
                            onClick={() => toggleSecondCarForDay(gOrderIds)}
                            disabled={!gOrderIds.length}
                            title="Označit/odznačit Kačenu pro VŠECHNY objednávky tohoto dne najednou (jednotlivé objednávky lze pak doladit zvlášť u každé karty)"
                            className={`px-3 py-1.5 rounded font-black text-xs transition shadow-xs flex items-center gap-1.5 border disabled:opacity-40 disabled:cursor-not-allowed ${
                              gOrderIds.some((id) => secondCarOrderIds.includes(id))
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white border-neutral-300 text-neutral-700 hover:bg-emerald-50'
                            }`}
                          >
                            <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                              gOrderIds.some((id) => secondCarOrderIds.includes(id))
                                ? 'bg-white text-emerald-700 border-white'
                                : 'bg-white border-neutral-300'
                            }`}>
                              {gOrderIds.some((id) => secondCarOrderIds.includes(id)) ? '✓' : ''}
                            </span>
                            <span>Druhé auto (Kačena) — celý den</span>
                          </button>
                          <button
                            onClick={() => openMoveDay(group.dayKey)}
                            className="px-3 py-1.5 rounded bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 font-black text-xs transition shadow-xs flex items-center gap-1.5"
                            title="Přesunout tento den na jiný den"
                          >
                            <ArrowRightLeft size={14} />
                            <span>Změnit den</span>
                          </button>
                          {group.orders.length > 0 && (
                            <a
                              href={`https://www.google.com/maps/dir/${group.orders.map((o) => encodeURIComponent(o.place_name ?? '')).filter(Boolean).join('/')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-black text-xs transition shadow-xs flex items-center gap-1.5"
                              title="Otevřít celou trasu v Google Mapách"
                            >
                              <MapPin size={14} />
                              <span>Trasa dne ({group.orders.length})</span>
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Orders Cards List */}
                      <div className="space-y-4">
                        {group.orders.map((orderOrGroup, index) => {
                          if (orderOrGroup.isGroup) {
                            const { groupName, orders: groupOrders } = orderOrGroup;
                            const allItems = groupOrders.flatMap((o: Order) => items[o.id] ?? []);
                            const totalWeight = orderWeightKg(allItems, packages);
                            const totalQty = allItems.reduce((s: number, i: OrderItem) => s + i.quantity, 0);
                            const allDelivered = groupOrders.every((o: Order) => o.is_delivered);

                            return (
                              <div key={`group-${groupName}-${index}`} className={`p-4 rounded border-2 transition-all shadow-sm ${allDelivered ? 'bg-emerald-50/60 border-emerald-300/80' : 'bg-amber-50/50 border-amber-300/80'}`}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <h4 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                                      <span className="text-emerald-700">SPOLEČNÝ ZÁVOZ:</span>
                                      <span>{groupName}</span>
                                      {allDelivered && <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-[10px]">✓ Vše zavezeno</span>}
                                    </h4>
                                    <div className="text-xs text-neutral-600 font-medium mt-1">
                                      {groupOrders.map((o: Order) => o.place_name).join(', ')}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-neutral-600 font-bold">
                                    <span>Celkem: {totalQty} ks</span>
                                    <span>Váha: {fmtKg(totalWeight)} kg</span>
                                  </div>
                                </div>
                                <div className="mt-3 pt-3 border-t border-amber-200/60 space-y-3">
                                  {groupOrders.map((o: Order) => {
                                    const orderItems = items[o.id] ?? [];
                                    return (
                                      <div key={o.id} className={`p-3 rounded border ${o.is_delivered ? 'bg-emerald-100/50 border-emerald-200' : 'bg-white border-neutral-200'}`}>
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <a onClick={() => setPage && setPage('orders', o.id)} className="font-bold text-sm text-neutral-900 hover:underline cursor-pointer">{o.place_name}</a>
                                            {o.note && <div className="text-xs text-neutral-600 font-medium mt-1 bg-amber-100/60 px-2.5 py-1 rounded italic flex items-start gap-1"><StickyNote size={12} className="mt-0.5 shrink-0" /> {o.note}</div>}
                                          </div>
                                          <div className="flex items-center gap-1.5">
                                            <button
                                              onClick={() => toggleOrderKachnaFor(o.id)}
                                              title="Tato objednávka pojede druhým autem (Kačena)"
                                              className={`px-2.5 py-1.5 rounded font-black text-[11px] transition shadow-xs flex items-center gap-1 border ${
                                                secondCarOrderIds.includes(o.id)
                                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                                  : 'bg-white border-neutral-300 text-neutral-500 hover:bg-emerald-50'
                                              }`}
                                            >
                                              🦆 {secondCarOrderIds.includes(o.id) ? 'Kačena' : ''}
                                            </button>
                                            <button onClick={() => toggleDelivered(o)} className={`px-3 py-1.5 rounded font-black text-xs transition shadow-xs flex items-center gap-1.5 ${o.is_delivered ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-slate-950 hover:bg-amber-400'}`}>
                                              {o.is_delivered ? '✓ Zavezeno' : 'Označit'}
                                            </button>
                                          </div>
                                        </div>
                                        <div className="mt-2 space-y-1.5">
                                          {orderItems.map(it => (
                                            <div key={it.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white/80 border border-neutral-100">
                                              <button onClick={() => toggleItemPrepared(o, it)} className={`flex items-center gap-2 text-left font-bold transition ${it.is_prepared ? 'text-emerald-700 line-through' : 'text-neutral-900'}`}>
                                                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${it.is_prepared ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-neutral-300'}`}>{it.is_prepared ? '✓' : ''}</span>
                                                <span>{it.beer_name ?? '—'}</span>
                                              </button>
                                              <div className="flex items-center gap-3 font-mono">
                                                <span className="text-neutral-950 font-black text-[11px]">{formatPackageLabel(it.package_label)}</span>
                                                <span className="font-black text-white bg-amber-600 px-2 py-0.5 rounded-md text-xs shadow-2xs">{it.quantity} ks</span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }

                          const o = orderOrGroup;
                          const orderItems = items[o.id] ?? [];
                          const weightKg = orderWeightKg(orderItems, packages);
                          const totalQty = orderItems.reduce((s, i) => s + Number(i.quantity), 0);

                          return (
                            <div
                              key={o.id}
                              className={`p-4 rounded border-2 transition-all shadow-sm ${
                                o.is_delivered
                                  ? 'bg-emerald-50/60 border-emerald-300/80 text-emerald-950'
                                  : o.is_prepared
                                  ? 'bg-amber-50/50 border-amber-300/80 text-neutral-900'
                                  : 'bg-white border-neutral-200 hover:border-amber-400'
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <a
                                    onClick={() => setPage && setPage('orders', o.id)}
                                    className="font-display font-black text-lg text-neutral-900 flex items-center gap-2 text-left hover:underline cursor-pointer"
                                    title="Zobrazit detail objednávky"
                                  >
                                    <span>
                                      {(o.place_name && o.place_name.trim())
                                        || (o.place_id && places.find((p) => p.id === o.place_id)?.name)
                                        || 'Neznámý odběratel'}
                                    </span>
                                    {o.is_delivered && (
                                      <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-[10px]">
                                        ✓ Zavezeno
                                      </span>
                                    )}
                                  </a>
                                  {/* Telefon zákazníka — klikatelný */}
                                  {o.place_phone && (
                                    <a
                                      href={`tel:${o.place_phone}`}
                                      className="text-xs font-mono font-bold text-amber-700 hover:text-amber-900 flex items-center gap-1 mt-1 w-fit"
                                      title="Zavolat zákazníkovi"
                                    >
                                      <Phone size={11} /> {o.place_phone}
                                    </a>
                                  )}
                                  {o.note && (
                                    <div className="text-xs text-neutral-600 font-medium mt-1 bg-amber-100/60 px-2.5 py-1 rounded italic flex items-start gap-1">
                                      <StickyNote size={12} className="mt-0.5 shrink-0" /> {o.note}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Order Items Table */}
                              <div className="my-3 space-y-2">
                                {orderItems.map((it) => (
                                  <div key={it.id} className="flex items-center justify-between text-sm py-1.5 px-2.5 rounded bg-white/60 border border-neutral-200/80">
                                    <button
                                      onClick={() => toggleItemPrepared(o, it)}
                                      className={`flex items-center gap-2.5 text-left font-bold transition ${it.is_prepared ? 'text-emerald-800 line-through' : 'text-neutral-900'}`}
                                    >
                                      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center text-xs font-black ${it.is_prepared ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-neutral-300'}`}>
                                        {it.is_prepared ? '✓' : ''}
                                      </span>
                                      <span>{it.beer_name ?? '—'}</span>
                                    </button>

                                    <div className="flex items-center gap-2 font-mono">
                                      <span className="text-neutral-950 font-black text-xs">{formatPackageLabel(it.package_label)}</span>
                                      <span className="font-black text-white bg-amber-600 px-2.5 py-1 rounded text-sm shadow-sm">
                                        {it.quantity} ks
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-200/60">
                                <div className="flex items-center gap-3 text-xs text-neutral-600 font-bold">
                                  <span>Celkem: {totalQty} ks</span>
                                  <span>Váha: {fmtKg(weightKg)} kg</span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                  {/* 🧭 1-Click Navigace — používá adresu z databáze pokud existuje */}
                                  {o.place_name && (() => {
                                    const placeRecord = places.find(p => p.id === o.place_id);
                                    const navDest = placeRecord?.address || o.place_name!;
                                    return (
                                      <button
                                        type="button"
                                        onClick={() => setNavTarget({ name: o.place_name!, destination: navDest })}
                                        className="btn-ghost !rounded !py-1.5 !px-2.5 text-xs font-black flex items-center gap-1 bg-amber-50 text-amber-950 border border-amber-300 shadow-2xs hover:bg-amber-100"
                                        title={`Navigovat: ${navDest}`}
                                      >
                                        <MapPin size={13} className="text-amber-700" /> Navigovat
                                      </button>
                                    );
                                  })()}

                                  {/* 💬 WhatsApp avízo zákazníkovi */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const text = buildCustomerDeliveryWhatsAppText(o.place_name || 'Vážený zákazníku', orderItems, o.note);
                                      openCustomerWhatsApp(o.place_phone || undefined, text);
                                    }}
                                    className="btn-ghost !rounded !py-1.5 !px-2.5 text-xs font-black flex items-center gap-1 bg-emerald-50 text-emerald-950 border border-emerald-300 shadow-2xs hover:bg-emerald-100"
                                    title="Odeslat avízo o závozu na WhatsApp"
                                  >
                                    <MessageCircle size={13} className="text-emerald-700" /> WhatsApp
                                  </button>

                                  {/* 🛢️ Vrácené prázdné sudy */}
                                  <button
                                    type="button"
                                    onClick={() => setKegReturnOrder(o)}
                                    className="btn-ghost !rounded !py-1.5 !px-2.5 text-xs font-black flex items-center gap-1 bg-sky-50 text-sky-950 border border-sky-300 shadow-2xs hover:bg-sky-100"
                                    title="Zaznamenat vrácené prázdné KEG sudy"
                                  >
                                    <Cylinder size={13} className="text-sky-700" /> Sudy
                                  </button>

                                  {/* ✍️ Podpis zákazníka */}
                                  <button
                                    type="button"
                                    onClick={() => setSignOrder(o)}
                                    className="btn-ghost !rounded !py-1.5 !px-2.5 text-xs font-black flex items-center gap-1 bg-neutral-100 text-neutral-900 border border-neutral-300 shadow-2xs hover:bg-neutral-200"
                                    title="Podepsat převzetí na sklo"
                                  >
                                    <PenTool size={13} /> Podpis
                                  </button>

                                  <button onClick={() => setEditOrder(o)} className="btn-ghost !rounded !py-1.5 !px-2.5 text-xs font-black flex items-center gap-1" title="Upravit objednávku">
                                    <Pencil size={13} /> Upravit
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => toggleOrderKachnaFor(o.id)}
                                    title="Tato objednávka pojede druhým autem (Kačena) — Kniha jízd ji zapíše zvlášť"
                                    className={`btn-ghost !rounded !py-1.5 !px-2.5 text-xs font-black flex items-center gap-1 border ${
                                      secondCarOrderIds.includes(o.id)
                                        ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                        : 'bg-white text-neutral-600 border-neutral-300 hover:bg-emerald-50'
                                    }`}
                                  >
                                    🦆 Kačena
                                  </button>

                                  <button
                                    onClick={() => toggleDelivered(o, () => {
                                      // Po zavezení: nabídni dialog pro vrácené sudy (pokud má KEGy)
                                      const hasKegs = orderItems.some(it => {
                                        const pkg = packages.find(p => p.id === it.package_id);
                                        return pkg?.kind === 'keg' || (it.package_label || '').toLowerCase().includes('sud') || (it.package_label || '').toLowerCase().includes('keg');
                                      });
                                      if (hasKegs) setKegReturnOrder(o);
                                    })}
                                    className={`px-3.5 py-1.5 rounded font-black text-xs transition shadow-xs flex items-center gap-1.5 ${
                                      o.is_delivered
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                                    }`}
                                  >
                                    <span>{o.is_delivered ? '✓ Zavezeno' : 'Označit jako zavezené'}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            </>
          )}
        </>

      {editOrder && (
        <EditOrderModal
          order={editOrder as any}
          items={items[editOrder.id] ?? []}
          beers={beers}
          packages={packages}
          places={places}
          onClose={() => setEditOrder(null)}
          onSaved={() => { setEditOrder(null); load(); }}
          onPlacesChanged={load}
        />
      )}

      {moveDay && (
        <Modal open onClose={() => setMoveDay(null)} title={`↔ Přesunout den závozu — ${moveDay.label}`}>
          <div className="space-y-4">
            <div className="text-xs font-bold text-neutral-700 bg-amber-50 border border-amber-200/80 rounded px-3.5 py-2.5 flex items-start gap-2">
              <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <span>
                Přesune se <strong>{moveDay.orderIds.length} objednávek</strong> z <strong>{moveDay.label}</strong> na jiný den.
                Změní se jen den v týdnu (Po–Ne); konkrétní datum dodání zůstává beze změny.
              </span>
            </div>

            <div>
              <label className="label">Nový den závozu</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {DAYS.filter((d) => d.v !== moveDay.source).map((d) => {
                  const cnt = dayStats.get(d.v)?.count ?? 0;
                  const active = moveTarget === d.v;
                  return (
                    <button
                      key={d.v}
                      onClick={() => setMoveTarget(d.v)}
                      className={`flex items-center justify-between gap-1 px-3 py-2.5 rounded border font-black text-xs transition shadow-xs ${
                        active
                          ? 'bg-amber-500 text-slate-950 border-amber-600 ring-2 ring-amber-300'
                          : 'bg-white text-neutral-800 hover:bg-amber-50 border-neutral-200'
                      }`}
                    >
                      <span>{d.label}</span>
                      {cnt > 0 && (
                        <span className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] ${active ? 'bg-white/30 text-slate-900' : 'bg-neutral-100 text-neutral-500'}`}>
                          {cnt}
                        </span>
                      )}
                    </button>
                  );
                })}
                {moveDay.source !== null && (
                  <button
                    onClick={() => setMoveTarget('_none')}
                    className={`flex items-center justify-between gap-1 px-3 py-2.5 rounded border font-black text-xs transition shadow-xs ${
                      moveTarget === '_none'
                        ? 'bg-amber-500 text-slate-950 border-amber-600 ring-2 ring-amber-300'
                        : 'bg-white text-neutral-800 hover:bg-amber-50 border-neutral-200'
                    }`}
                  >
                    <span>Bez dne</span>
                    {(() => { const cnt = dayStats.get('_none')?.count ?? 0; return cnt > 0 ? <span className="px-1.5 py-0.5 rounded-md font-mono text-[10px] bg-neutral-100 text-neutral-500">{cnt}</span> : null; })()}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => setMoveDay(null)} className="btn-ghost !rounded !py-2.5 !px-4 text-sm font-black">Zrušit</button>
              <button
                onClick={confirmMoveDay}
                disabled={moveTarget === null || moveBusy}
                className="flex-1 py-2.5 rounded bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm transition shadow-md flex items-center justify-center gap-2"
              >
                {moveBusy ? (
                  <>Přesouvám…</>
                ) : (
                  <><ArrowRightLeft size={15} /> Přesunout {moveDay.orderIds.length} objednávek</>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal pro výběr Navigační aplikace */}
      {navTarget && (
        <Modal open onClose={() => setNavTarget(null)} title={`🧭 Spustit navigaci — ${navTarget.name}`}>
          <div className="space-y-4">
            <p className="text-xs text-neutral-600 font-medium">
              Zvolte navigační aplikaci pro trasu k odběrateli <strong>{navTarget.destination}</strong>:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => {
                  openNavigation('google', navTarget.destination);
                  setNavTarget(null);
                }}
                className="p-4 rounded bg-white hover:bg-neutral-50 border-2 border-neutral-200 hover:border-amber-400 font-black text-xs text-neutral-900 shadow-sm flex flex-col items-center justify-center gap-2"
              >
                <span className="text-2xl">🗺️</span>
                <span>Google Mapy</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  openNavigation('waze', navTarget.destination);
                  setNavTarget(null);
                }}
                className="p-4 rounded bg-white hover:bg-neutral-50 border-2 border-neutral-200 hover:border-sky-400 font-black text-xs text-neutral-900 shadow-sm flex flex-col items-center justify-center gap-2"
              >
                <span className="text-2xl">🚗</span>
                <span>Waze</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  openNavigation('mapycz', navTarget.destination);
                  setNavTarget(null);
                }}
                className="p-4 rounded bg-white hover:bg-neutral-50 border-2 border-neutral-200 hover:border-emerald-400 font-black text-xs text-neutral-900 shadow-sm flex flex-col items-center justify-center gap-2"
              >
                <span className="text-2xl">🌲</span>
                <span>Mapy.cz</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal pro podpis zákazníka na sklo */}
      {signOrder && (
        <SignatureModal
          isOpen={!!signOrder}
          onClose={() => setSignOrder(null)}
          customerName={signOrder.place_name || ''}
          onSaveSignature={async (signatureDataUrl, signerName) => {
            await supabase.from('orders').update({
              signature_url: signatureDataUrl,
              signature_name: signerName,
              is_delivered: true,
              delivered_at: new Date().toISOString(),
            }).eq('id', signOrder.id);
            alert(`✅ Podpis ${signerName} úspěšně zaznamenán!`);
            load();
          }}
        />
      )}

      {/* Modal pro vrácené prázdné sudy */}
      {kegReturnOrder && (
        <KegReturnModal
          isOpen={!!kegReturnOrder}
          onClose={() => setKegReturnOrder(null)}
          customerName={kegReturnOrder.place_name || 'Odběratel'}
          onSaveReturns={async (returns) => {
            // Dřív se tady jen složil text do alert() a nikam se nic neuložilo,
            // přestože appka hlásila „✅ Zaznamenáno". Teď jde o skutečný zápis
            // a při chybě se úspěch NEHLÁSÍ.
            const err = await saveKegReturns({
              returns,
              placeId: kegReturnOrder.place_id,
              placeName: kegReturnOrder.place_name,
              orderId: kegReturnOrder.id,
              recordedBy: profile?.display_name || null,
            });
            if (err) {
              alert(`⚠️ Vrácené sudy se NEPODAŘILO uložit: ${err}\n\nZkuste to prosím znovu.`);
              return;
            }
            const summaryStr = returns.filter((r) => r.count > 0).map((r) => `${r.count}x ${r.size}`).join(', ');
            alert(`✅ Zaznamenáno vrácení prázdných sudů pro ${kegReturnOrder.place_name}: ${summaryStr}`);
            setKegReturnOrder(null);
          }}
        />
      )}
    </div>
  );
}
