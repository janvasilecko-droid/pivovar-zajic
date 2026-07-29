import { useEffect, useMemo, useState } from 'react';
import { supabase, Beer, Package, Vehicle, useRealtime, beerBg, beerText, beerBorder } from '../lib/supabase';
import { Spinner, EmptyState, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { exportExciseTaxReportToExcel } from '../lib/excel';
import { getVehicleExpiryStatus } from './Catalogs';
import { Download, AlertTriangle } from 'lucide-react';
import { AnnouncementManagerModal } from '../components/AnnouncementManagerModal';

type Row = {
  entry_date: string; beer_id: string | null; beer_name: string | null;
  package_id: string | null; package_label: string | null; quantity: number;
};

function isoWeekKey(d: string): string {
  const dt = new Date(d + 'T00:00:00Z');
  const thu = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 3 - ((dt.getUTCDay() + 6) % 7)));
  const ys = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const wk = 1 + Math.round(((thu.getTime() - ys.getTime()) / 86400000 - 3 + ((ys.getUTCDay() + 6) % 7)) / 7);
  return `${thu.getUTCFullYear()}-${String(wk).padStart(2, '0')}`;
}
function monthKey(d: string): string { return d.slice(0, 7); }
function weekRange(wk: string): string {
  const [y, w] = wk.split('-').map(Number);
  const j4 = new Date(Date.UTC(y, 0, 4));
  const j4d = (j4.getUTCDay() + 6) % 7;
  const ws = new Date(j4); ws.setUTCDate(j4.getUTCDate() - j4d + (w - 1) * 7);
  const we = new Date(ws); we.setUTCDate(ws.getUTCDate() + 6);
  const f = (d: Date) => d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
  return `${f(ws)} – ${f(we)}`;
}
function shiftWeek(wk: string, d: number): string {
  const [y, w] = wk.split('-').map(Number);
  const j4 = new Date(Date.UTC(y, 0, 4));
  const j4d = (j4.getUTCDay() + 6) % 7;
  const ws = new Date(j4); ws.setUTCDate(j4.getUTCDate() - j4d + (w - 1) * 7);
  ws.setUTCDate(ws.getUTCDate() + d * 7);
  return isoWeekKey(ws.toISOString().slice(0, 10));
}
function fmtHl(liters: number): string {
  return (liters / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
}
function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function addDaysISO(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function startOfMonthISO(iso: string): string { return iso.slice(0, 7) + '-01'; }
function startOfYearISO(iso: string): string { return iso.slice(0, 4) + '-01-01'; }

type StockByPkg = {
  package_id: string; label: string; quantity: number; volume_l: number; kind: string;
  fromInventory: number; brewedWeek: number;
  orderedWeek: number; writeoffsWeek: number; akTaken: number; akReturned: number; remaining: number;
};
type StockStat = {
  beer: Beer;
  stockByPkg: StockByPkg[];
  stockBottles: number; stockKegs: number; stockTotal: number; stockLiters: number;
  brewedWeek: number; orderedWeek: number; writeoffsWeek: number;
  remaining: number;
};

type BrewStat = {
  beer: Beer;
  byPkg: { package_id: string; label: string; kind: string; volume_l: number; quantity: number }[];
  totalKegs: number; totalBottles: number; totalQty: number; totalLiters: number;
};

export default function Dashboard({ setPage }: { setPage?: (p: any) => void }) {
  const { profile } = useAuth();
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [stats, setStats] = useState<StockStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekKey, setWeekKey] = useState(isoWeekKey(todayISO()));
  const [detail, setDetail] = useState<StockStat | null>(null);

  const [brewFrom, setBrewFrom] = useState<string>(startOfMonthISO(todayISO()));
  const [brewTo, setBrewTo] = useState<string>(todayISO());
  const [brewStats, setBrewStats] = useState<BrewStat[]>([]);
  const [brewLoading, setBrewLoading] = useState(true);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const [{ data: b }, { data: pk }, { data: bt }, { data: kg }, { data: wo }, { data: inv }, { data: oi }, { data: ord }, { data: ak }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('bottling').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('kegging').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('writeoffs').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('inventory').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('order_items').select('beer_id,package_id,quantity,order_id'),
      supabase.from('orders').select('id,order_date,status'),
      supabase.from('akce').select('entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
    ]);
    const beerList = (b as Beer[]) ?? [];
    const pkgList = (pk as Package[]) ?? [];
    setBeers(beerList); setPackages(pkgList);
    const btRows = (bt as Row[]) ?? [];
    const kgRows = (kg as Row[]) ?? [];
    const woRows = (wo as Row[]) ?? [];
    const invRows = (inv as Row[]) ?? [];
    const oiRows = (oi as { beer_id: string | null; package_id: string | null; quantity: number; order_id: string }[]) ?? [];
    const ordRows = (ord as { id: string; order_date: string; status: string }[]) ?? [];
    const akRows = (ak as { entry_date: string; items: { beer_id: string | null; package_id: string | null; quantity_taken: number; quantity_returned: number }[] }[]) ?? [];

    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const invMonths = [...new Set(invRows.map((r) => monthKey(r.entry_date)))].filter((m) => m < curMonth).sort().reverse();
    const lastInvMonth = invMonths[0];

    const ordIdsThisWeek = new Set(
      ordRows
        .filter((o) => isoWeekKey(o.order_date) === weekKey && o.status !== 'storno')
        .map((o) => o.id)
    );

    const result: StockStat[] = beerList.map((beer) => {
      const byPkg = new Map<string, StockByPkg>();
      const add = (rs: { beer_id: string | null; package_id: string | null; quantity: number }[], field: 'fromInventory' | 'brewedWeek' | 'orderedWeek' | 'writeoffsWeek' | 'akTaken' | 'akReturned') =>
        rs.forEach((r) => {
          if (r.beer_id !== beer.id || !r.package_id) return;
          const pkg = pkgList.find((p) => p.id === r.package_id);
          if (!pkg) return;
          let e = byPkg.get(r.package_id);
          if (!e) { e = { package_id: r.package_id, label: pkg.label, quantity: 0, volume_l: pkg.volume_l, kind: pkg.kind, fromInventory: 0, brewedWeek: 0, orderedWeek: 0, writeoffsWeek: 0, akTaken: 0, akReturned: 0, remaining: 0 }; byPkg.set(r.package_id, e); }
          (e[field] as number) += Number(r.quantity);
        });
      add(invRows.filter((r) => r.beer_id === beer.id && !!lastInvMonth && monthKey(r.entry_date) === lastInvMonth), 'fromInventory');
      add(btRows.filter((r) => r.beer_id === beer.id && isoWeekKey(r.entry_date) === weekKey), 'brewedWeek');
      add(kgRows.filter((r) => r.beer_id === beer.id && isoWeekKey(r.entry_date) === weekKey), 'brewedWeek');
      add(oiRows.filter((i) => i.beer_id === beer.id && ordIdsThisWeek.has(i.order_id)), 'orderedWeek');
      add(woRows.filter((r) => r.beer_id === beer.id && isoWeekKey(r.entry_date) === weekKey), 'writeoffsWeek');
      const akFlat = akRows.flatMap((r) => (r.items ?? []).map((i) => ({ ...i, entry_date: r.entry_date })));
      add(akFlat.filter((i) => i.beer_id === beer.id && isoWeekKey(i.entry_date) === weekKey).map((i) => ({ beer_id: i.beer_id, package_id: i.package_id, quantity: i.quantity_taken })), 'akTaken');
      add(akFlat.filter((i) => i.beer_id === beer.id && isoWeekKey(i.entry_date) === weekKey).map((i) => ({ beer_id: i.beer_id, package_id: i.package_id, quantity: i.quantity_returned })), 'akReturned');

      const stockByPkg = [...byPkg.values()].map((p) => {
        p.quantity = p.fromInventory + p.brewedWeek;
        p.remaining = p.quantity - p.orderedWeek - p.writeoffsWeek - p.akTaken + p.akReturned;
        return p;
      }).filter((p) => p.quantity > 0 || p.orderedWeek > 0 || p.writeoffsWeek > 0 || p.brewedWeek > 0).sort((a, b) => b.quantity - a.quantity);

      const stockBottles = stockByPkg.filter((p) => p.kind === 'bottle').reduce((s, p) => s + p.quantity, 0);
      const stockKegs = stockByPkg.filter((p) => p.kind === 'keg').reduce((s, p) => s + p.quantity, 0);
      const stockTotal = stockBottles + stockKegs;
      const stockLiters = stockByPkg.reduce((s, p) => s + p.quantity * p.volume_l, 0);
      const brewedWeek = [...btRows, ...kgRows].filter((r) => r.beer_id === beer.id && isoWeekKey(r.entry_date) === weekKey).reduce((s, r) => s + Number(r.quantity), 0);
      const orderedWeek = oiRows.filter((i) => i.beer_id === beer.id && ordIdsThisWeek.has(i.order_id)).reduce((s, i) => s + Number(i.quantity), 0);
      const writeoffsWeek = woRows.filter((r) => r.beer_id === beer.id && isoWeekKey(r.entry_date) === weekKey).reduce((s, r) => s + Number(r.quantity), 0);
      const remaining = stockTotal - orderedWeek - writeoffsWeek
        - stockByPkg.reduce((s, p) => s + p.akTaken, 0) + stockByPkg.reduce((s, p) => s + p.akReturned, 0);
      return { beer, stockByPkg, stockBottles, stockKegs, stockTotal, stockLiters, brewedWeek, orderedWeek, writeoffsWeek, remaining };
    });
    setStats(result);
    if (!silent) setLoading(false);

    setBrewLoading(true);
    const inRange = (d: string) => d >= brewFrom && d <= brewTo;
    const allBrew = [...btRows, ...kgRows].filter((r) => r.beer_id && r.package_id && inRange(r.entry_date));
    const brewResult: BrewStat[] = beerList.map((beer) => {
      const byPkgMap = new Map<string, { package_id: string; label: string; kind: string; volume_l: number; quantity: number }>();
      allBrew.filter((r) => r.beer_id === beer.id).forEach((r) => {
        const pid = r.package_id as string;
        const pkg = pkgList.find((p) => p.id === pid);
        if (!pkg) return;
        let e = byPkgMap.get(pid);
        if (!e) { e = { package_id: pid, label: pkg.label, kind: pkg.kind, volume_l: pkg.volume_l, quantity: 0 }; byPkgMap.set(pid, e); }
        e.quantity += Number(r.quantity);
      });
      const byPkg = [...byPkgMap.values()].filter((p) => p.quantity > 0).sort((a, b) => b.quantity - a.quantity);
      const totalKegs = byPkg.filter((p) => p.kind === 'keg').reduce((s, p) => s + p.quantity, 0);
      const totalBottles = byPkg.filter((p) => p.kind === 'bottle').reduce((s, p) => s + p.quantity, 0);
      const totalQty = totalKegs + totalBottles;
      const totalLiters = byPkg.reduce((s, p) => s + p.quantity * p.volume_l, 0);
      return { beer, byPkg, totalKegs, totalBottles, totalQty, totalLiters };
    }).filter((s) => s.totalQty > 0);
    setBrewStats(brewResult);
    setBrewLoading(false);
  }

  useEffect(() => { load(); }, [weekKey, brewFrom, brewTo]);
  useRealtime(['bottling', 'kegging', 'fasovani', 'fasovani_private', 'writeoffs', 'inventory', 'orders', 'order_items', 'akce', 'akce_items'], () => load(true));

  const wr = weekRange(weekKey);
  const statusOf = (s: StockStat) => s.remaining < 0 ? 'deficit' : s.stockTotal === 0 ? 'empty' : s.remaining <= 10 ? 'low' : 'ok';

  const brewTotalQty = brewStats.reduce((s, r) => s + r.totalQty, 0);
  const brewTotalKegs = brewStats.reduce((s, r) => s + r.totalKegs, 0);
  const brewTotalBottles = brewStats.reduce((s, r) => s + r.totalBottles, 0);
  const brewTotalLiters = brewStats.reduce((s, r) => s + r.totalLiters, 0);

  // Keg breakdown by size across all beers
  const kegBySize = useMemo(() => {
    const m = new Map<string, number>();
    brewStats.forEach((s) => s.byPkg.filter((p) => p.kind === 'keg').forEach((p) => m.set(p.label, (m.get(p.label) ?? 0) + p.quantity)));
    return [...m.entries()].sort((a, b) => {
      const na = parseInt(a[0].replace(/\D/g, ''), 10); const nb = parseInt(b[0].replace(/\D/g, ''), 10);
      return nb - na;
    });
  }, [brewStats]);

  const [cellarTotal, setCellarTotal] = useState({ volume: 0, capacity: 0 });
  useEffect(() => {
    supabase.from('cellar_tanks').select('current_volume_l,capacity_l').then(({ data }) => {
      const rows = (data as { current_volume_l: number; capacity_l: number }[]) ?? [];
      setCellarTotal({
        volume: rows.reduce((s, r) => s + Number(r.current_volume_l), 0),
        capacity: rows.reduce((s, r) => s + Number(r.capacity_l), 0),
      });
    });
  }, [brewStats]);

  const setQuickRange = (kind: 'week' | 'month' | 'year' | 'all') => {
    const today = todayISO();
    if (kind === 'week') { setBrewFrom(addDaysISO(today, -6)); setBrewTo(today); }
    else if (kind === 'month') { setBrewFrom(startOfMonthISO(today)); setBrewTo(today); }
    else if (kind === 'year') { setBrewFrom(startOfYearISO(today)); setBrewTo(today); }
    else { setBrewFrom('2000-01-01'); setBrewTo(today); }
  };

  const canSeeVehicleAlerts = profile?.role === 'admin' || !!profile?.receive_vehicle_alerts;

  const [vehicleAlerts, setVehicleAlerts] = useState<{ vehicleName: string; label: string; status: 'warning' | 'expired' }[]>([]);
  useEffect(() => {
    if (!canSeeVehicleAlerts) {
      setVehicleAlerts([]);
      return;
    }

    supabase.from('vehicles').select('*').then(({ data }) => {
      const rows = (data as Vehicle[]) ?? [];
      const alerts: { vehicleName: string; label: string; status: 'warning' | 'expired' }[] = [];
      rows.forEach((v) => {
        const stk = getVehicleExpiryStatus(v.stk_valid_until);
        if (stk.status === 'warning' || stk.status === 'expired') {
          alerts.push({ vehicleName: v.name, label: `STK: ${stk.label}`, status: stk.status });
        }
        const toll = getVehicleExpiryStatus(v.highway_toll_valid_until);
        if (toll.status === 'warning' || toll.status === 'expired') {
          alerts.push({ vehicleName: v.name, label: `Dálniční známka: ${toll.label}`, status: toll.status });
        }
      });
      setVehicleAlerts(alerts);
    });
  }, [canSeeVehicleAlerts]);

  const [showAnnouncementManager, setShowAnnouncementManager] = useState(false);

  const [materialAlerts, setMaterialAlerts] = useState<{ name: string; type: 'etiketa' | 'lahev'; balance: number }[]>([]);
  useEffect(() => {
    Promise.all([
      supabase.from('beers').select('name'),
      supabase.from('packages').select('label,kind'),
      supabase.from('bottling').select('beer_name,package_label,quantity'),
    ]).then(([bRes, pRes, botRes]) => {
      const beers = (bRes.data as any[]) ?? [];
      const pkgs = (pRes.data as any[]) ?? [];
      const bot = (botRes.data as any[]) ?? [];

      let labelPurchases: any[] = [];
      let bottlePurchases: any[] = [];
      try {
        labelPurchases = JSON.parse(localStorage.getItem('labels_purchases') || '[]');
        bottlePurchases = JSON.parse(localStorage.getItem('bottles_purchases') || '[]');
      } catch {}

      const alerts: { name: string; type: 'etiketa' | 'lahev'; balance: number }[] = [];

      beers.forEach((b) => {
        const inL = labelPurchases.filter((lp) => lp.beer_name?.toLowerCase().trim() === b.name?.toLowerCase().trim()).reduce((s, lp) => s + Number(lp.quantity || 0), 0);
        if (inL > 0) {
          const usedL = bot.filter((bd) => bd.beer_name?.toLowerCase().trim() === b.name?.toLowerCase().trim()).reduce((s, bd) => s + Number(bd.quantity || 0), 0);
          const bal = inL - usedL;
          if (bal < 200) {
            alerts.push({ name: `Etikety "${b.name}"`, type: 'etiketa', balance: bal });
          }
        }
      });

      pkgs.filter((p) => p.kind !== 'keg').forEach((p) => {
        const inB = bottlePurchases.filter((bp) => bp.package_label?.toLowerCase().trim() === p.label?.toLowerCase().trim()).reduce((s, bp) => s + Number(bp.quantity || 0), 0);
        if (inB > 0) {
          const usedB = bot.filter((bd) => bd.package_label?.toLowerCase().trim() === p.label?.toLowerCase().trim()).reduce((s, bd) => s + Number(bd.quantity || 0), 0);
          const bal = inB - usedB;
          if (bal < 200) {
            alerts.push({ name: `Prázdné lahve "${p.label}"`, type: 'lahev', balance: bal });
          }
        }
      });

      setMaterialAlerts(alerts);
    });
  }, [brewStats]);

  if (loading) return <Spinner />;

  return (
    <div>
      {showAnnouncementManager && <AnnouncementManagerModal onClose={() => setShowAnnouncementManager(false)} />}

      <div className="flex justify-end mb-3">
        <button
          onClick={() => setShowAnnouncementManager(true)}
          className="px-3.5 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-sm transition flex items-center gap-1.5"
        >
          <AlertTriangle size={15} /> Spravovat Pivovarská Hlášení
        </button>
      </div>
      {/* Material (Labels & Bottles) Warning Banner */}
      {materialAlerts.length > 0 && (
        <div className="mb-6 p-4 rounded-3xl bg-gradient-to-r from-rose-500/20 via-rose-400/10 to-amber-500/10 border-2 border-rose-400 shadow-md flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center text-2xl font-black shadow-md shrink-0 animate-pulse">
              ⚠️
            </div>
            <div>
              <div className="font-extrabold text-sm text-neutral-900 flex items-center gap-2">
                <span>VAROVÁNÍ SKLADU: NÍZKÝ STAV ETIKET NEBO PRÁZDNÝCH LAHVÍ (&lt; 200 ks)</span>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-black text-xs">{materialAlerts.length} Varování</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {materialAlerts.map((a, i) => (
                  <span key={i} className="text-xs font-bold px-3 py-1 rounded-xl shadow-xs bg-rose-600 text-white font-mono">
                    <strong>{a.name}</strong> — zbývá jen {a.balance} ks!
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => setPage && setPage('sklo_promo')}
            className="px-4 py-2.5 rounded-2xl bg-neutral-900 text-amber-300 font-extrabold text-xs shadow-md hover:bg-slate-800 transition shrink-0"
          >
            Přejít do evidence etiket & lahví →
          </button>
        </div>
      )}

      {/* Vehicle STK / Highway Toll Warning Banner */}
      {vehicleAlerts.length > 0 && (
        <div className="mb-6 p-4 rounded-3xl bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-rose-500/10 border-2 border-amber-400 shadow-md flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center text-2xl font-black shadow-md shrink-0">
              🚗
            </div>
            <div>
              <div className="font-extrabold text-sm text-neutral-900 flex items-center gap-2">
                <span>Upozornění vozového parku (STK / Dálniční známky)</span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs">{vehicleAlerts.length} Upozornění</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {vehicleAlerts.map((a, i) => (
                  <span key={i} className={`text-xs font-bold px-3 py-1 rounded-xl shadow-xs ${a.status === 'expired' ? 'bg-rose-600 text-white font-black animate-pulse' : 'bg-amber-100 text-amber-950 border border-amber-300'}`}>
                    <strong>{a.vehicleName}</strong> — {a.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => setPage && setPage('vehicles')}
            className="px-4 py-2.5 rounded-2xl bg-neutral-900 text-amber-300 font-extrabold text-xs shadow-md hover:bg-slate-800 transition shrink-0"
          >
            Přejít do evidence aut →
          </button>
        </div>
      )}



      <div className="card p-4 mb-6 shadow-sm border-neutral-200/80 bg-white space-y-3">
        {/* Big week label */}
        <div className="text-center">
          <div className="font-display font-black text-neutral-900 text-xl sm:text-2xl">
            Skladové zásoby — Týden {weekKey.split('-')[1]} / {weekKey.split('-')[0]}
          </div>
          <div className="text-sm sm:text-base font-extrabold text-amber-700 mt-1">{wr}</div>
        </div>
        {/* Smaller nav buttons below */}
        <div className="flex items-center justify-center gap-3">
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-100 hover:bg-amber-100 text-neutral-700 hover:text-amber-950 text-xs font-black border border-neutral-300 hover:border-amber-400 transition"
            onClick={() => setWeekKey(shiftWeek(weekKey, -1))}
            title="Předchozí týden"
          >
            ‹ Předchozí
          </button>
          <button
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-black border border-amber-400 shadow-sm transition"
            onClick={() => setWeekKey(isoWeekKey(todayISO()))}
          >
            Tento týden
          </button>
          <button
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-100 hover:bg-amber-100 text-neutral-700 hover:text-amber-950 text-xs font-black border border-neutral-300 hover:border-amber-400 transition"
            onClick={() => setWeekKey(shiftWeek(weekKey, 1))}
            title="Následující týden"
          >
            Následující ›
          </button>
        </div>
      </div>

      {/* Beer cards with package breakdown */}
      {stats.length === 0 ? <EmptyState text="Žádná piva v evidenci." icon="🍺" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-8">
          {stats.map((s) => {
            const st = statusOf(s);
            const badgeClass = st === 'deficit'
              ? 'badge-rose'
              : st === 'empty'
              ? 'badge-slate'
              : st === 'low'
              ? 'badge-amber'
              : 'badge-emerald';

            const kegs = s.stockByPkg.filter((p) => p.kind === 'keg');
            const bottles = s.stockByPkg.filter((p) => p.kind === 'bottle');
            return (
              <div
                key={s.beer.id}
                className="card-hover p-5 flex flex-col relative overflow-hidden group"
                style={{ backgroundColor: beerBg(s.beer), borderColor: beerBorder(s.beer) }}
              >
                <div className="flex items-start justify-between mb-3.5">
                  <div>
                    <div className={`font-display font-extrabold text-lg sm:text-xl text-neutral-900 ${beerText(s.beer)}`}>{s.beer.name}</div>
                    {s.beer.degree && <div className="text-xs text-neutral-500 font-semibold mt-0.5">{s.beer.degree} • {s.beer.color}</div>}
                  </div>
                  <span className={`chip ${badgeClass}`}>
                    {st === 'deficit' ? '⚠️ Deficit' : st === 'empty' ? 'Vyprodáno' : st === 'low' ? 'Nízký stav' : '✓ Skladem'}
                  </span>
                </div>

                {kegs.length > 0 && (
                  <div className="mb-3 bg-white/70 backdrop-blur-xs rounded-xl p-3 border border-neutral-200/50">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1.5 flex items-center gap-1">🛢️ Sudy</div>
                    <div className="space-y-1">
                      {kegs.map((p) => (
                        <div key={p.package_id} className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-neutral-600">{p.label}</span>
                          <span className="text-neutral-900 font-extrabold bg-neutral-100 px-2 py-0.5 rounded-md">{p.quantity} ks</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {bottles.length > 0 && (
                  <div className="mb-3 bg-white/70 backdrop-blur-xs rounded-xl p-3 border border-neutral-200/50">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-primary-700 mb-1.5 flex items-center gap-1">🍾 Lahve</div>
                    <div className="space-y-1">
                      {bottles.map((p) => (
                        <div key={p.package_id} className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-neutral-600">{p.label}</span>
                          <span className="text-neutral-900 font-extrabold bg-neutral-100 px-2 py-0.5 rounded-md">{p.quantity} ks</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {s.stockByPkg.length === 0 && <p className="text-xs text-neutral-400 py-3 italic">Žádné volné obaly na skladě.</p>}

                <div className="mt-auto pt-3 border-t border-neutral-200/60 flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-500">Po expedici zbývá:</span>
                  <span className={`font-display font-extrabold text-xl ${s.remaining < 0 ? 'text-rose-600' : s.remaining === 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{s.remaining} ks</span>
                </div>
                <button className="text-xs text-primary-600 hover:text-primary-800 font-bold mt-2 text-left flex items-center gap-1 transition" onClick={() => setDetail(s)}>Detailní přehled →</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Brewed total banner */}
      <div className="card p-6 sm:p-7 mb-6 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white shadow-2xl relative overflow-hidden border-neutral-800">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="text-xs font-extrabold uppercase tracking-widest text-amber-400 mb-2 flex items-center gap-2">
          <span>🍺 Celkem stočeno v období</span>
          <span className="px-2 py-0.5 rounded-full bg-white/10 text-white font-mono text-[10px]">{brewFrom} – {brewTo}</span>
        </div>
        <div className="font-display font-black text-4xl sm:text-6xl text-white tracking-tight">{fmtHl(brewTotalLiters)} <span className="text-2xl sm:text-3xl text-amber-400 font-extrabold">hl</span></div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 backdrop-blur-sm">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">Sudů stočeno</div>
            <div className="font-display font-extrabold text-3xl text-white mt-1">{brewTotalKegs} <span className="text-sm font-semibold text-neutral-400">ks</span></div>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 backdrop-blur-sm">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-neutral-400">Lahví stočeno</div>
            <div className="font-display font-extrabold text-3xl text-white mt-1">{brewTotalBottles} <span className="text-sm font-semibold text-neutral-400">ks</span></div>
          </div>
        </div>

        {kegBySize.length > 0 && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2">Stočeno dle velikosti sudů:</div>
            <div className="flex flex-wrap gap-2">
              {kegBySize.map(([label, qty]) => (
                <span key={label} className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-semibold">
                  <span className="text-neutral-300">{label}:</span>
                  <span className="text-amber-300 font-bold">{qty} ks</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Cellar Progress Bar */}
        <div className="mt-5 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between text-xs font-bold text-neutral-300 mb-2">
            <span>Stav ležáckého sklepa (objem ležících šarží):</span>
            <span className="text-emerald-400 font-mono">{cellarTotal.volume.toLocaleString('cs-CZ')} / {cellarTotal.capacity.toLocaleString('cs-CZ')} l ({cellarTotal.capacity > 0 ? Math.round((cellarTotal.volume / cellarTotal.capacity) * 100) : 0}%)</span>
          </div>
          <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden p-0.5 border border-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${cellarTotal.capacity > 0 ? Math.min(100, Math.round((cellarTotal.volume / cellarTotal.capacity) * 100)) : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Brewed filter controls & Export */}
      <div className="card p-4 mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Od data</label>
            <input type="date" value={brewFrom} onChange={(e) => setBrewFrom(e.target.value)} className="input !py-2" />
          </div>
          <div>
            <label className="label">Do data</label>
            <input type="date" value={brewTo} onChange={(e) => setBrewTo(e.target.value)} className="input !py-2" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost !py-2 !px-3 text-xs font-bold" onClick={() => setQuickRange('week')}>Poslední týden</button>
            <button className="btn-ghost !py-2 !px-3 text-xs font-bold" onClick={() => setQuickRange('month')}>Tento měsíc</button>
            <button className="btn-ghost !py-2 !px-3 text-xs font-bold" onClick={() => setQuickRange('year')}>Tento rok</button>
            <button className="btn-accent !py-2 !px-3 text-xs font-bold" onClick={() => setQuickRange('all')}>Vše</button>
          </div>
        </div>

        <button
          onClick={() => {
            const exportRows = brewStats.map((s) => ({
              beer_name: s.beer.name,
              degree: s.beer.degree || '-',
              liters: s.totalLiters,
              hl: Number((s.totalLiters / 100).toFixed(2)),
              keg_count: s.totalKegs,
              bottle_count: s.totalBottles,
            }));
            exportExciseTaxReportToExcel(exportRows, `${brewFrom}-az-${brewTo}`);
          }}
          disabled={brewStats.length === 0}
          className="btn-amber text-xs shrink-0"
        >
          <Download size={15} />
          Výkaz pro daň z piva (Excel)
        </button>
      </div>

      {/* Visual Analytics Chart (Custom SVG - Crash Proof) */}
      {brewStats.length > 0 && (() => {
        const maxHl = Math.max(...brewStats.map((b) => b.totalLiters / 100), 1);
        return (
          <div className="card p-5 mb-6 shadow-sm border-neutral-200">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-neutral-800 mb-4 flex items-center gap-2">
              📈 Graf stočených hl podle druhů piv
            </h3>
            <div className="space-y-3.5">
              {brewStats.map((b, idx) => {
                const hl = Number((b.totalLiters / 100).toFixed(1));
                const pct = Math.min(100, Math.round((hl / maxHl) * 100));
                const isAmber = idx % 2 !== 0;
                return (
                  <div key={b.beer.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-neutral-700">
                      <span>{b.beer.name}</span>
                      <span className="font-mono text-neutral-900 font-extrabold">{hl} hl</span>
                    </div>
                    <div className="w-full h-4 rounded-full bg-neutral-100 p-0.5 overflow-hidden border border-neutral-200/60">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isAmber ? 'bg-gradient-to-r from-amber-400 to-amber-600' : 'bg-gradient-to-r from-primary-500 to-primary-700'}`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Brewed per beer */}
      {brewLoading ? <Spinner /> : brewStats.length === 0 ? <EmptyState text="Ve zvoleném období nebylo nic stočeno." icon="🏭" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {brewStats.map((s) => {
            const kegs = s.byPkg.filter((p) => p.kind === 'keg');
            const bottles = s.byPkg.filter((p) => p.kind === 'bottle');
            return (
              <div key={s.beer.id} className="card p-4" style={{ backgroundColor: beerBg(s.beer), borderColor: beerBorder(s.beer) }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className={`font-display font-bold text-primary-900 ${beerText(s.beer)}`}>{s.beer.name}</div>
                    {s.beer.degree && <div className="text-xs text-primary-400">{s.beer.degree} • {s.beer.color}</div>}
                  </div>
                  <span className="chip bg-primary-50 text-primary-700">{s.totalQty} ks</span>
                </div>
                {kegs.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-600 mb-1">🛢️ Sudy</div>
                    <div className="space-y-1">
                      {kegs.map((p) => (
                        <div key={p.package_id} className="flex items-center justify-between text-sm">
                          <span className="text-primary-600">{p.label}</span>
                          <span className="font-semibold text-primary-900">{p.quantity} ks</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {bottles.length > 0 && (
                  <div className="mb-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-600 mb-1">🍾 Lahve</div>
                    <div className="space-y-1">
                      {bottles.map((p) => (
                        <div key={p.package_id} className="flex items-center justify-between text-sm">
                          <span className="text-primary-600">{p.label}</span>
                          <span className="font-semibold text-primary-900">{p.quantity} ks</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-2 pt-2 border-t border-primary-100 text-xs text-primary-500">
                  {fmtHl(s.totalLiters)} hl · {s.totalKegs} sudů · {s.totalBottles} lahví
                </div>
                {s.byPkg.filter((p) => p.kind === 'keg').length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {s.byPkg.filter((p) => p.kind === 'keg').sort((a, b) => parseInt(b.label.replace(/\D/g, ''), 10) - parseInt(a.label.replace(/\D/g, ''), 10)).map((p) => (
                      <span key={p.package_id} className="text-[10px] rounded bg-primary-100 text-primary-700 px-1.5 py-0.5">{p.label}: {p.quantity}×</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`${detail.beer.name} — detail skladu po obalech`} wide>
          <div className="space-y-4">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="table">
                <thead>
                  <tr>
                    <th>Obal</th>
                    <th className="text-right">Z inventury</th>
                    <th className="text-right">Stočeno v týdnu</th>
                    <th className="text-right">Na skladě</th>
                    <th className="text-right">Objednáno</th>
                    <th className="text-right">Odpisy</th>
                    <th className="text-right">Akce ±</th>
                    <th className="text-right">Zbude</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.stockByPkg.map((p) => (
                    <tr key={p.package_id}>
                      <td className="font-medium">{p.label}</td>
                      <td className="text-right text-primary-700">{p.fromInventory || '—'}</td>
                      <td className="text-right text-primary-700">{p.brewedWeek || '—'}</td>
                      <td className="text-right font-semibold text-primary-900">{p.quantity}</td>
                      <td className="text-right text-accent-700">{p.orderedWeek || '—'}</td>
                      <td className="text-right text-warning-700">{p.writeoffsWeek || '—'}</td>
                      <td className="text-right text-xs text-primary-600">
                        {p.akTaken ? `-${p.akTaken}` : ''}{p.akTaken && p.akReturned ? ' ' : ''}{p.akReturned ? `+${p.akReturned}` : ''}
                        {!p.akTaken && !p.akReturned ? '—' : ''}
                      </td>
                      <td className={`text-right font-semibold ${p.remaining < 0 ? 'text-danger-600' : p.remaining === 0 ? 'text-warning-600' : 'text-success-600'}`}>{p.remaining}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-primary-400">
              Na skladě = z inventury + stočeno v tomto týdnu. Zbude = na skladě − objednávky (mimo storno) − odpisy − akce (vydané − vrácené) v tomto týdnu.
            </p>
          </div>
        </Modal>
      )}

      <p className="text-xs text-primary-400 mt-4">
        Sklad = poslední měsíční inventura + stočeno v tomto týdnu. Zbude = sklad − objednávky (mimo storno) − odpisy v týdnu {wr}.
      </p>
    </div>
  );
}
