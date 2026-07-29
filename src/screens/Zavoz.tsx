import { useEffect, useMemo, useState } from 'react';
import { supabase, Package, Beer, Place, useRealtime, formatPackageLabel } from '../lib/supabase';
import { Spinner, EmptyState } from '../components/ui';
import { orderWeightKg, fmtKg } from '../lib/weight';
import { DAYS } from '../lib/shared';
import { Calendar, Truck, Package as PackageIcon, CheckCircle2, Scale, Search, History as HistoryIcon, Printer, Share2, ArrowRightCircle, Phone } from 'lucide-react';
import { shareDeliveryListToWhatsApp } from '../lib/whatsapp';
import { isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';
import { VoiceDictationButton } from '../components/VoiceDictationButton'; // Assuming this is needed
import { EditOrderModal } from '../components/EditOrderModal';

type Order = {
  id: string; order_date: string; place_id: string | null; place_name: string | null;
  status: string; delivery_day: string | null; is_prepared: boolean; is_packaged: boolean;
  is_delivered: boolean; note: string | null; source: string; delivered_at: string | null;
  created_at: string; delivery_date: string | null;
  place_phone?: string | null;
};
type OrderItem = { id: string; order_id: string; beer_id: string | null; beer_name: string | null; package_id: string | null; package_label: string | null; quantity: number; is_prepared: boolean };

export default function Zavoz({ setPage }: { setPage?: (p: any, sec?: string) => void } = {}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [packages, setPackages] = useState<Package[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const [weekKey, setWeekKey] = useState(isoWeekKey(new Date().toISOString().slice(0, 10)));
  const [hideDelivered, setHideDelivered] = useState(false);
  const [selectedDayFilter, setSelectedDayFilter] = useState<string>('all');
  const [mobileTab, setMobileTab] = useState<'routes' | 'loading'>('routes');
  const [searchTerm, setSearchTerm] = useState('');

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
  useRealtime(['orders', 'order_items', 'packages', 'beers', 'places'], () => load(true));

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

  // Skupiny v historii závozů podle přesných kalendářních dnů
  const historyByDate = useMemo(() => {
    const map = new Map<string, { date: string; orders: Order[]; totalWeight: number; totalQty: number }>();
    orders.forEach((o) => {
      const dateKey = o.order_date;
      const cur = map.get(dateKey) || { date: dateKey, orders: [], totalWeight: 0, totalQty: 0 };
      cur.orders.push(o);
      const oItems = items[o.id] ?? [];
      cur.totalWeight += orderWeightKg(oItems, packages);
      cur.totalQty += oItems.reduce((s, i) => s + Number(i.quantity), 0);
      map.set(dateKey, cur);
    });

    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, items, packages]);

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

  async function toggleDelivered(o: Order) {
    const patch: Record<string, unknown> = { is_delivered: !o.is_delivered };
    if (!o.is_delivered) patch.delivered_at = new Date().toISOString();
    else patch.delivered_at = null;
    await supabase.from('orders').update(patch).eq('id', o.id);
    setOrders((arr) => arr.map((x) => (x.id === o.id ? ({ ...x, ...patch } as Order) : x)));
  }

  async function markAllAsPrepared(o: Order) {
    const orderItems = items[o.id] ?? [];
    if (orderItems.length === 0) return;
    await Promise.all(orderItems.filter(it => !it.is_prepared).map(it => toggleItemPrepared(o, it)));
  }
  function printDeliveryListForOrders(toPrint: Order[], titleLabel: string) {
    const rows = toPrint.map((o) => {
      const its = items[o.id] ?? [];
      const itemsHtml = its.map((i) => `<li>${i.beer_name ?? '—'} — <strong>${i.quantity} ks</strong> (${i.package_label ?? '—'})</li>`).join('');
      return `
        <div style="page-break-inside:avoid;border:2px solid #333;border-radius:10px;padding:14px;margin-bottom:14px;background:#FAF8F5;">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #ccc;padding-bottom:6px;">
            <span style="font-weight:900;font-size:18px;color:#111;">${o.place_name ?? 'Neznámý odběratel'}</span>
            <span style="font-weight:bold;font-size:13px;background:#f59e0b;padding:4px 8px;border-radius:6px;color:#000;">
              ${o.delivery_day ? DAYS.find((d) => d.v === o.delivery_day)?.label ?? '' : 'Bez dne'}
            </span>
          </div>
          <ul style="margin:10px 0 0 18px;padding:0;font-size:14px;">${itemsHtml}</ul>
          ${o.note ? `<div style="font-size:12px;margin-top:8px;color:#555;font-style:italic;">Poznámka: ${o.note}</div>` : ''}
        </div>`;
    }).join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Zavážecí list — ${titleLabel}</title>
      <style>body{font-family:sans-serif;padding:24px;background:#fff;color:#000;} h1{font-size:22px;margin-bottom:16px;}</style>
      </head><body>
      <h1>🚚 Zavážecí list — ${titleLabel}</h1>
      <p style="font-size:13px;margin-bottom:20px;color:#444;">Celkem objednávek: ${toPrint.length}</p>
      ${rows || '<p>Žádné objednávky k vytištění.</p>'}
      <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    win.document.close();
  }

  const wr = weekRange(weekKey);
  const deliveredCount = activeOrders.filter((o) => o.is_delivered).length;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
        <button
          onClick={() => setActiveTab('current')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 ${
            activeTab === 'current'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Truck size={16} />
          <span>🚚 Plánování & Nakládka závozu</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 ${
            activeTab === 'history'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <HistoryIcon size={16} />
          <span>📅 Historie a přehled tras podle dnů</span>
        </button>
      </div>

      {activeTab === 'history' ? (
        /* HISTORIE TRAS PODLE DNŮ */
        <div className="space-y-6">
          <div className="bg-neutral-900 text-white p-5 rounded-3xl border border-neutral-800 space-y-1">
            <h2 className="font-display font-black text-xl text-amber-400 flex items-center gap-2">
              <HistoryIcon size={22} />
              <span>Přehledová historie všech závozů podle dnů</span>
            </h2>
            <p className="text-xs text-neutral-400 font-medium">
              Kompletní vyčíslení rozvezených tras: váha nákladu v kg, počet navštívených odběratelů a tisk trasovek
            </p>
          </div>

          <div className="space-y-6">
            {historyByDate.map((hGroup) => {
              const formattedDate = new Date(hGroup.date).toLocaleDateString('cs-CZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
              return (
                <div key={hGroup.date} className="card p-6 bg-white border border-neutral-200 rounded-3xl space-y-4 shadow-xs">
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-3 flex-wrap gap-2">
                    <div>
                      <h3 className="font-display font-black text-lg text-neutral-900 capitalize flex items-center gap-2">
                        <span>🗓️ {formattedDate}</span>
                      </h3>
                      <p className="text-xs text-neutral-500 font-bold">
                        {hGroup.orders.length} závozů · Celková váha tras: <strong className="text-amber-700 font-mono">{fmtKg(hGroup.totalWeight)} kg</strong>
                      </p>
                    </div>

                    <button
                      onClick={() => printDeliveryListForOrders(hGroup.orders, formattedDate)}
                      className="px-3.5 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-xs transition flex items-center gap-1.5"
                    >
                      <Printer size={15} /> Tisk trasovky
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {hGroup.orders.map((o) => {
                      const oItems = items[o.id] ?? [];
                      const wKg = orderWeightKg(oItems, packages);
                      return (
                        <div key={o.id} className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-sm text-neutral-900 truncate">{o.place_name}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${o.is_delivered ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-amber-100 text-amber-900'}`}>
                              {o.is_delivered ? '✓ Zavezeno' : 'Čeká'}
                            </span>
                          </div>

                          <div className="space-y-1 text-xs">
                            {oItems.map((it) => (
                              <div key={it.id} className="flex justify-between text-[11px] font-medium text-neutral-700">
                                <span>{it.beer_name}</span>
                                <span className="font-bold font-mono">{it.quantity}x {formatPackageLabel(it.package_label)}</span>
                              </div>
                            ))}
                          </div>

                          <div className="text-[10px] text-neutral-500 font-bold text-right pt-1 border-t border-neutral-200/60">
                            Váha: {fmtKg(wKg)} kg
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
      ) : (
        /* AKTUÁLNÍ ZÁVOZOVÝ TÝDEN */
        <>
          {/* Action Controls */}
          <div className="flex flex-wrap items-center justify-end gap-3 mb-2">
            <label className="flex items-center gap-2 text-xs font-extrabold text-amber-950 cursor-pointer px-3.5 py-2.5 rounded-2xl bg-white border border-amber-300/80 hover:bg-amber-50 transition shadow-xs">
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
              className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-black text-xs transition shadow-md flex items-center gap-2"
            >
              <span>🖨️</span>
              <span>Tisk rozvozového listu</span>
            </button>
          </div>

          {/* Week Selector Bar */}
          <div className="card p-3 shadow-sm border-neutral-200/80 bg-white flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setWeekKey(shiftWeek(weekKey, -1))} className="btn-ghost !py-2 !px-3 font-black text-base" title="Předchozí týden">‹</button>
            <div className="text-center flex-1">
              <div className="font-display font-black text-neutral-900 text-lg flex items-center justify-center gap-2">
                <Calendar size={18} className="text-amber-600" />
                <span>Týden {weekKey.split('-')[1]} / {weekKey.split('-')[0]}</span>
              </div>
              <div className="text-xs text-neutral-500 font-bold mt-0.5">{wr.label}</div>
            </div>
            <button onClick={() => setWeekKey(shiftWeek(weekKey, 1))} className="btn-ghost !py-2 !px-3 font-black text-base" title="Následující týden">›</button>
            <button onClick={() => setWeekKey(isoWeekKey(new Date().toISOString().slice(0, 10)))} className="btn-ghost !py-2 !px-3 text-xs font-black text-amber-700">Dnes</button>
          </div>

          {/* Interactive Day Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-2 pt-1">
            <button
              onClick={() => setSelectedDayFilter('all')}
              className={`px-4 py-2.5 rounded-2xl font-black text-xs shrink-0 transition-all flex items-center gap-2 shadow-xs ${
                selectedDayFilter === 'all'
                  ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300 scale-105'
                  : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200/90'
              }`}
            >
              <span>🗓️ Všechny dny</span>
              <span className="px-2 py-0.5 rounded-full bg-slate-950/20 text-xs font-mono font-black">{weekOrders.length}</span>
            </button>

            {DAYS.map((d) => {
              const stats = dayStats.get(d.v) ?? { count: 0, qty: 0 };
              const isSelected = selectedDayFilter === d.v;

              return (
                <button
                  key={d.v}
                  onClick={() => setSelectedDayFilter(isSelected ? 'all' : d.v)}
                  className={`px-3.5 py-2 rounded-2xl font-black text-xs shrink-0 transition-all flex items-center gap-1.5 shadow-xs ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300 scale-105'
                      : stats.count > 0
                      ? 'bg-white text-neutral-900 hover:bg-amber-50 border border-amber-200'
                      : 'bg-neutral-100 text-neutral-400 border border-neutral-200/60'
                  }`}
                >
                  <span>🚚 {d.label}</span>
                  {stats.qty > 0 && (
                    <span className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-extrabold ${isSelected ? 'bg-slate-950 text-white' : 'bg-amber-100 text-amber-900'}`}>
                      {stats.qty} ks
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Top Quick Search & Weight Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-neutral-200/90 shadow-xs">
            <div className="relative flex-1 min-w-[240px] flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Hledat hospodu, pivo nebo obal..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-neutral-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <VoiceDictationButton onTranscript={(txt) => setSearchTerm(txt)} />
            </div>

            <div className="flex items-center gap-4 text-xs font-black text-neutral-700">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900">
                <Scale size={16} className="text-amber-600" />
                <span>Celková váha: <strong className="text-sm font-mono">{fmtKg(totalWeight)} kg</strong></span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-900">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span>Zavezeno: <strong className="text-sm font-mono">{deliveredCount} / {activeOrders.length}</strong></span>
              </div>
            </div>
          </div>

          {loading ? (
            <Spinner />
          ) : activeOrders.length === 0 ? (
            <EmptyState text="Žádné objednávky k závozu pro zvolený filtr." icon="🚚" />
          ) : (
            <>
              {/* Mobile Tab Switcher */}
              <div className="lg:hidden flex items-center p-1.5 rounded-2xl bg-neutral-900 text-white border border-white/10 shadow-md">
                <button
                  onClick={() => setMobileTab('routes')}
                  className={`flex-1 py-3 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 ${
                    mobileTab === 'routes' ? 'bg-amber-500 text-slate-950 shadow-md scale-[1.02]' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Truck size={16} />
                  <span>Trasy & Hospody</span>
                </button>

                <button
                  onClick={() => setMobileTab('loading')}
                  className={`flex-1 py-3 px-3 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-2 ${
                    mobileTab === 'loading' ? 'bg-amber-500 text-slate-950 shadow-md scale-[1.02]' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <PackageIcon size={16} />
                  <span>Co naložit ({loadingListBreakdown.totalCount} ks)</span>
                </button>
              </div>

              {/* MAIN 2-COLUMN DRIVER DASHBOARD */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* LEFT COLUMN: NAKLÁDKOVÝ LIST DO AUTA */}
                <div className={`lg:col-span-5 bg-gradient-to-br from-amber-500/10 via-amber-100/30 to-white text-neutral-900 p-5 rounded-3xl border-2 border-amber-300/80 shadow-md space-y-5 sticky top-4 ${
                  mobileTab === 'loading' ? 'block' : 'hidden lg:block'
                }`}>
                  <div className="flex items-center justify-between pb-3 border-b border-amber-200/80">
                    <div>
                      <h2 className="font-display font-black text-lg text-amber-950 flex items-center gap-2">
                        <PackageIcon size={20} className="text-amber-600" />
                        <span>Co naložit do auta</span>
                      </h2>
                      <p className="text-xs text-amber-900/80 mt-0.5 font-bold">
                        {selectedDayFilter === 'all' ? 'Součet pro všechny dny' : `Nakládka pro: ${DAYS.find((d) => d.v === selectedDayFilter)?.label ?? 'Vybraný den'}`}
                      </p>
                    </div>

                    <span className="px-3 py-1 rounded-full bg-amber-500 text-white font-mono font-black text-sm shadow-xs">
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
                      <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-amber-900 mb-2.5 pb-1 border-b border-amber-200/80">
                        <span className="flex items-center gap-1.5">🛢️ Sudy & Kegy</span>
                        <span className="font-mono text-amber-950 bg-amber-200 px-2 py-0.5 rounded-md font-bold">{loadingListBreakdown.totalKegs} ks</span>
                      </div>

                      <div className="space-y-1.5">
                        {loadingListBreakdown.kegs.map((k) => {
                          const allPrepared = k.preparedQty >= k.qty;
                          return (
                            <button
                              key={k.label}
                              onClick={() => toggleLoadingLabel(k.label, allPrepared)}
                              className={`w-full flex items-center justify-between p-2.5 rounded-xl border shadow-xs transition text-left ${
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
                              <span className={`px-2.5 py-1 rounded-lg font-mono font-black text-xs shrink-0 shadow-xs ml-2 ${
                                allPrepared ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
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
                        <span className="flex items-center gap-1.5">🍾 Lahve</span>
                        <span className="font-mono text-emerald-950 bg-emerald-200 px-2 py-0.5 rounded-md font-bold">{loadingListBreakdown.totalBottles} ks</span>
                      </div>

                      <div className="space-y-1.5 max-h-[350px] overflow-y-auto scrollbar-thin pr-1">
                        {loadingListBreakdown.bottles.map((b) => {
                          const allPrepared = b.preparedQty >= b.qty;
                          return (
                            <button
                              key={b.label}
                              onClick={() => toggleLoadingLabel(b.label, allPrepared)}
                              className={`w-full flex items-center justify-between p-2.5 rounded-xl border shadow-xs transition text-left ${
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
                              <span className={`px-2.5 py-1 rounded-lg font-mono font-black text-xs shrink-0 shadow-xs ml-2 ${
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
                  {ordersGroupedByDay.map((group) => (
                    <div key={group.dayKey} className="card p-5 shadow-sm border-neutral-200/90 bg-white rounded-3xl space-y-4">
                      {/* Day Section Header */}
                      <div className="flex items-center justify-between pb-3 border-b border-neutral-200/70">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 font-black text-lg flex items-center justify-center shadow-md">
                            🚚
                          </div>
                          <div>
                            <h3 className="font-display font-extrabold text-lg text-neutral-900">{group.label}</h3>
                            <p className="text-xs text-neutral-500 font-medium">{group.orders.length} objednávek v tento den</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="chip bg-neutral-900 text-amber-300 font-mono font-black text-xs">
                            {group.orders.reduce((s, o) => s + (items[o.id] ?? []).reduce((x, i) => x + Number(i.quantity), 0), 0)} ks celkem
                          </span>
                          {group.orders.length > 0 && (
                            <a
                              href={`https://www.google.com/maps/dir/${group.orders.map((o) => encodeURIComponent(o.place_name ?? '')).filter(Boolean).join('/')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs transition shadow-xs flex items-center gap-1.5"
                              title="Otevřít celou trasu v Google Mapách"
                            >
                              <span>🗺️</span>
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
                              <div key={`group-${groupName}-${index}`} className={`p-4 rounded-2xl border-2 transition-all shadow-sm ${allDelivered ? 'bg-emerald-50/60 border-emerald-300/80' : 'bg-amber-50/50 border-amber-300/80'}`}>
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
                                      <div key={o.id} className={`p-3 rounded-xl border ${o.is_delivered ? 'bg-emerald-100/50 border-emerald-200' : 'bg-white border-neutral-200'}`}>
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <a onClick={() => setPage && setPage('orders', o.id)} className="font-bold text-sm text-neutral-900 hover:underline cursor-pointer">{o.place_name}</a>
                                            {o.note && <div className="text-xs text-neutral-600 font-medium mt-1 bg-amber-100/60 px-2.5 py-1 rounded-lg italic">📝 {o.note}</div>}
                                          </div>
                                          <button onClick={() => toggleDelivered(o)} className={`px-3 py-1.5 rounded-xl font-black text-xs transition shadow-xs flex items-center gap-1.5 ${o.is_delivered ? 'bg-emerald-600 text-white' : 'bg-neutral-900 text-amber-300'}`}>
                                            {o.is_delivered ? '✓ Zavezeno' : '🚚 Označit'}
                                          </button>
                                        </div>
                                        <div className="mt-2 space-y-1.5">
                                          {orderItems.map(it => (
                                            <div key={it.id} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white/80 border border-neutral-100">
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
                              className={`p-4 rounded-2xl border-2 transition-all shadow-sm ${
                                o.is_delivered
                                  ? 'bg-emerald-50/60 border-emerald-300/80 text-emerald-950'
                                  : o.is_prepared
                                  ? 'bg-amber-50/50 border-amber-300/80 text-neutral-900'
                                  : 'bg-white border-neutral-200 hover:border-amber-400'
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <a
                                    onClick={() => setPage && setPage('orders', o.id)}
                                    className="font-display font-black text-lg text-neutral-900 flex items-center gap-2 text-left hover:underline cursor-pointer"
                                    title="Zobrazit detail objednávky"
                                  >
                                    <span>{o.place_name ?? 'Neznámý odběratel'}</span>
                                    {o.is_delivered && (
                                      <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-[10px]">
                                        ✓ Zavezeno
                                      </span>
                                    )}
                                  </a>
                                  {o.note && (
                                    <div className="text-xs text-neutral-600 font-medium mt-1 bg-amber-100/60 px-2.5 py-1 rounded-lg italic">
                                      📝 {o.note}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Order Items Table */}
                              <div className="my-3 space-y-2">
                                {orderItems.map((it) => (
                                  <div key={it.id} className="flex items-center justify-between text-sm py-1.5 px-2.5 rounded-lg bg-white/60 border border-neutral-200/80">
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
                                      <span className="font-black text-white bg-amber-600 px-2.5 py-1 rounded-lg text-sm shadow-sm">
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
                                <div className="flex items-center gap-2">
                                  <button onClick={() => setEditOrder(o)} className="btn-ghost !py-1.5 !px-3 text-xs font-black" title="Upravit objednávku">✏️ Upravit</button>
                                  {o.place_name && (
                                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.place_name)}`} target="_blank" rel="noreferrer" className="btn-ghost !py-1.5 !px-3 text-xs font-black" title="Otevřít v Google Mapách">🗺️ Mapy</a>
                                  )}
                                  <button
                                    onClick={() => toggleDelivered(o)}
                                    className={`px-3.5 py-1.5 rounded-xl font-black text-xs transition shadow-xs flex items-center gap-1.5 ${
                                      o.is_delivered
                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                        : 'bg-neutral-900 text-amber-300 hover:bg-slate-800'
                                    }`}
                                  >
                                    <span>{o.is_delivered ? '✓ Zavezeno' : '🚚 Označit jako zavezené'}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

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
    </div>
  );
}
