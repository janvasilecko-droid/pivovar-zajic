import { useEffect, useMemo, useState } from 'react';
import { Beer, Package, Place, fetchAllRows, formatPackageLabel, supabase, useRealtime } from '../lib/supabase';
import { Spinner, EmptyState } from './ui';
import { orderWeightKg, fmtKg } from '../lib/weight';
import { DAYS } from '../lib/shared';
import { CalendarDays, Filter, History as HistoryIcon, Check, Printer, Truck, X } from 'lucide-react';
import { printDeliveryList } from '../lib/safePrint';

type Order = {
  id: string; order_date: string; place_id: string | null; place_name: string | null;
  status: string; delivery_day: string | null; is_prepared: boolean; is_packaged: boolean;
  is_delivered: boolean; note: string | null; source: string; delivered_at: string | null;
  created_at: string; delivery_date: string | null;
  place_phone?: string | null;
};
type OrderItem = { id: string; order_id: string; beer_id: string | null; beer_name: string | null; package_id: string | null; package_label: string | null; quantity: number; is_prepared: boolean };

export default function ZavozHistory() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, OrderItem[]>>({});
  const [packages, setPackages] = useState<Package[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- Filtry historie tras ----
  const [histPeriod, setHistPeriod] = useState<'all' | 'week' | 'month' | 'year'>('all');
  const [histPlaceId, setHistPlaceId] = useState<string>('');
  const [histBeerId, setHistBeerId] = useState<string>('');
  const [histPackageId, setHistPackageId] = useState<string>('');

  async function load(silent = false) {
    if (!silent && !orders.length) setLoading(true);
    const [{ data: o }, { data: p }, { data: b }, { data: pl }] = await Promise.all([
      fetchAllRows('orders', '*').neq('status', 'storno').order('order_date', { ascending: false }),
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
      const { data: it } = await fetchAllRows('order_items', '*').in('order_id', ords.map((x) => x.id));
      const map: Record<string, OrderItem[]> = {};
      (it as OrderItem[])?.forEach((i) => { (map[i.order_id] ??= []).push(i); });
      setItems(map);
    }
    if (!silent) setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useRealtime(['orders', 'order_items', 'packages', 'beers', 'places'], () => load(true));

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

  // Filtrovaná historie tras podle období, odběrného místa, piva a obalu
  const filteredHistoryByDate = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
    const weekStartISO = weekStart.toISOString().slice(0, 10);
    const monthStartISO = today.slice(0, 7) + '-01';
    const yearStartISO = today.slice(0, 4) + '-01-01';

    const matchesOrder = (o: Order): boolean => {
      // Období
      if (histPeriod === 'week' && o.order_date < weekStartISO) return false;
      if (histPeriod === 'month' && o.order_date < monthStartISO) return false;
      if (histPeriod === 'year' && o.order_date < yearStartISO) return false;
      // Odběrné místo
      if (histPlaceId && o.place_id !== histPlaceId) return false;
      // Pivo / obal — musí být v položkách objednávky
      if (histBeerId || histPackageId) {
        const oItems = items[o.id] ?? [];
        const ok = oItems.some((i) =>
          (!histBeerId || i.beer_id === histBeerId) &&
          (!histPackageId || i.package_id === histPackageId)
        );
        if (!ok) return false;
      }
      return true;
    };

    const map = new Map<string, { date: string; orders: Order[]; totalWeight: number; totalQty: number }>();
    orders.forEach((o) => {
      if (!matchesOrder(o)) return;
      const dateKey = o.order_date;
      const cur = map.get(dateKey) || { date: dateKey, orders: [], totalWeight: 0, totalQty: 0 };
      cur.orders.push(o);
      const oItems = items[o.id] ?? [];
      cur.totalWeight += orderWeightKg(oItems, packages);
      cur.totalQty += oItems.reduce((s, i) => s + Number(i.quantity), 0);
      map.set(dateKey, cur);
    });

    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [orders, items, packages, histPeriod, histPlaceId, histBeerId, histPackageId]);

  function printDeliveryListForOrders(toPrint: Order[], titleLabel: string) {
    printDeliveryList({
      title: `Zavážecí list — ${titleLabel}`,
      heading: `Zavážecí list — ${titleLabel}`,
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

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 text-white p-5 rounded border border-neutral-800 space-y-1">
        <h2 className="font-display font-black text-xl text-amber-400 flex items-center gap-2">
          <HistoryIcon size={22} />
          <span>Přehledová historie všech závozů podle dnů</span>
        </h2>
        <p className="text-xs text-neutral-400 font-medium">
          Kompletní vyčíslení rozvezených tras: váha nákladu v kg, počet navštívených odběratelů a tisk trasovek
        </p>
      </div>

      {/* Filtry historie tras */}
      <div className="card sticky top-0 z-10 p-3 bg-white border border-neutral-200 rounded shadow-xs space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500 flex items-center gap-1"><Filter size={13} /> Filtry</span>
          {/* Období */}
          <div className="flex items-center gap-1 bg-neutral-100 rounded p-1">
            {([['all', 'Vše'], ['week', 'Týden'], ['month', 'Měsíc'], ['year', 'Rok']] as const).map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => setHistPeriod(k)}
                className={`tap px-3 py-1.5 rounded font-black text-[11px] transition ${
                  histPeriod === k ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:bg-white'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={histPlaceId}
            onChange={(e) => setHistPlaceId(e.target.value)}
            className="input !py-1.5 text-xs font-bold w-auto min-w-[150px]"
          >
            <option value="">Všechna odběrná místa</option>
            {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={histBeerId}
            onChange={(e) => setHistBeerId(e.target.value)}
            className="input !py-1.5 text-xs font-bold w-auto min-w-[150px]"
          >
            <option value="">Všechna piva</option>
            {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            value={histPackageId}
            onChange={(e) => setHistPackageId(e.target.value)}
            className="input !py-1.5 text-xs font-bold w-auto min-w-[150px]"
          >
            <option value="">Všechny obaly</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {(histPeriod !== 'all' || histPlaceId || histBeerId || histPackageId) && (
            <button
              onClick={() => { setHistPeriod('all'); setHistPlaceId(''); setHistBeerId(''); setHistPackageId(''); }}
              className="btn-ghost !rounded !py-1.5 text-xs font-black text-amber-900"
            >
              <X className="ikona-text" /> Zrušit filtr
            </button>
          )}
        </div>
      </div>

      {filteredHistoryByDate.length === 0 ? (
        <EmptyState text="Žádné závozové trasy neodpovídají zvoleným filtrům." icon={Truck} />
      ) : (
      <div className="space-y-6">
        {filteredHistoryByDate.map((hGroup) => {
          const formattedDate = new Date(hGroup.date).toLocaleDateString('cs-CZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
          return (
            <div key={hGroup.date} className="card p-6 bg-white border border-neutral-200 rounded space-y-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-neutral-200 pb-3 flex-wrap gap-2">
                <div>
                  <h3 className="font-display font-black text-lg text-neutral-900 capitalize flex items-center gap-2">
                    <span><CalendarDays className="ikona-text" /> {formattedDate}</span>
                  </h3>
                  <p className="text-xs text-neutral-500 font-bold">
                    {hGroup.orders.length} závozů · Celková váha tras: <strong className="text-amber-700 font-mono">{fmtKg(hGroup.totalWeight)} kg</strong>
                  </p>
                </div>

                <button
                  onClick={() => printDeliveryListForOrders(hGroup.orders, formattedDate)}
                  className="px-3.5 py-2 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-xs transition flex items-center gap-1.5"
                >
                  <Printer size={15} /> Tisk trasovky
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {hGroup.orders.map((o) => {
                  const oItems = items[o.id] ?? [];
                  const wKg = orderWeightKg(oItems, packages);
                  return (
                    <div key={o.id} className="p-3.5 rounded bg-neutral-50 border border-neutral-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-sm text-neutral-900 truncate">{o.place_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${o.is_delivered ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-amber-100 text-amber-900'}`}>
                          {o.is_delivered ? <><Check className="ikona-text" /> Zavezeno</> : 'Čeká'}
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

                      <div className="text-[11px] text-neutral-500 font-bold text-right pt-1 border-t border-neutral-200/60">
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
      )}
    </div>
  );
}
