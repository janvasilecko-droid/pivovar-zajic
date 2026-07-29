import { useEffect, useState } from 'react';
import { supabase, Beer, Package, useRealtime, beerBg, beerText, beerBorder } from '../lib/supabase';
import { Spinner, EmptyState, Modal } from '../components/ui';
import { Warehouse, Calendar, BarChart2, PackageCheck, AlertTriangle, Layers, ChevronLeft, ChevronRight, Download, ShoppingBag, Tent } from 'lucide-react';
import { exportExciseTaxReportToExcel } from '../lib/excel';
import { FestivalEquipmentTracker } from '../components/FestivalEquipmentTracker';
import { MarketingMerchInventory } from '../components/MarketingMerchInventory';

type StockByPkg = {
  package_id: string; label: string; quantity: number; volume_l: number; kind: string;
  fromInventory: number; brewedWeek: number;
  orderedWeek: number; writeoffsWeek: number; akTaken: number; akReturned: number; remaining: number;
};
type StockRow = {
  beer: Beer;
  stockByPkg: StockByPkg[];
  stockBottles: number; stockKegs: number; stockTotal: number; stockLiters: number;
  brewedWeek: number; orderedWeek: number; writeoffsWeek: number;
  remaining: number;
};

type BrewRow = { entry_date: string; beer_id: string | null; package_id: string | null; quantity: number };
type BrewStat = {
  beer: Beer;
  byPkg: { package_id: string; label: string; kind: string; volume_l: number; quantity: number; ordered: number }[];
  totalKegs: number; totalBottles: number; totalQty: number; totalLiters: number;
  orderedKegs: number; orderedBottles: number; orderedQty: number;
};

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = 1 + Math.round(((thursday.getTime() - yearStart.getTime()) / 86400000 - 3 + ((yearStart.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}
function monthKey(dateStr: string): string { return dateStr.slice(0, 7); }
function weekRangeLabel(weekKey: string): string {
  const [y, w] = weekKey.split('-').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const ws = new Date(jan4); ws.setUTCDate(jan4.getUTCDate() - jan4Day + (w - 1) * 7);
  const we = new Date(ws); we.setUTCDate(ws.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
  return `${fmt(ws)} – ${fmt(we)}`;
}
function shiftWeek(weekKey: string, delta: number): string {
  const [y, w] = weekKey.split('-').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
  const ws = new Date(jan4); ws.setUTCDate(jan4.getUTCDate() - jan4Day + (w - 1) * 7);
  ws.setUTCDate(ws.getUTCDate() + delta * 7);
  return isoWeekKey(ws.toISOString().slice(0, 10));
}
function fmtHl(qty: number): string {
  return (qty / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
}
function pkgLiters(rows: { quantity: number; volume_l: number }[]): number {
  return rows.reduce((s, r) => s + r.quantity * r.volume_l, 0);
}
function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function addDaysISO(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function startOfMonthISO(iso: string): string { return iso.slice(0, 7) + '-01'; }
function startOfYearISO(iso: string): string { return iso.slice(0, 4) + '-01-01'; }

export default function Stock() {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekKey, setWeekKey] = useState(isoWeekKey(todayISO()));
  const [detail, setDetail] = useState<StockRow | null>(null);

  // Brewed filter
  const [brewFrom, setBrewFrom] = useState<string>(startOfMonthISO(todayISO()));
  const [brewTo, setBrewTo] = useState<string>(todayISO());
  const [brewStats, setBrewStats] = useState<BrewStat[]>([]);
  const [brewLoading, setBrewLoading] = useState(true);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const [{ data: b }, { data: pk }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]);
    const beerList = (b as Beer[]) ?? [];
    const pkgList = (pk as Package[]) ?? [];
    setBeers(beerList);
    setPackages(pkgList);

    const nowIso = todayISO();
    const curMonth = monthKey(nowIso);

    const [{ data: invData }, { data: botData }, { data: kegData }, { data: ordItemsData }, { data: ordData }, { data: woData }, { data: akItemsData }] =
      await Promise.all([
        supabase.from('monthly_inventory').select('*'),
        supabase.from('bottling_entries').select('*'),
        supabase.from('kegging_entries').select('*'),
        supabase.from('order_items').select('*'),
        supabase.from('orders').select('id, order_date, status'),
        supabase.from('writeoffs').select('*'),
        supabase.from('event_items').select('package_id, beer_id, quantity, returned_qty'),
      ]);

    const inv = (invData ?? []) as { entry_date: string; beer_id: string | null; package_id: string | null; quantity: number }[];
    const invMonths = [...new Set(inv.map((r) => monthKey(r.entry_date)))].filter((m) => m < curMonth).sort().reverse();
    const lastInvMonth = invMonths[0];
    const lastInv = lastInvMonth ? inv.filter((r) => monthKey(r.entry_date) === lastInvMonth) : [];

    const bot = (botData ?? []) as BrewRow[];
    const keg = (kegData ?? []) as BrewRow[];
    const wo = (woData ?? []) as BrewRow[];
    const ords = (ordData ?? []) as { id: string; order_date: string; status: string }[];
    const ordItems = (ordItemsData ?? []) as { order_id: string; beer_id: string | null; package_id: string; quantity: number }[];
    const akItems = (akItemsData ?? []) as { package_id: string; beer_id: string | null; quantity: number; returned_qty: number }[];

    const validOrdIdsWeek = new Set(ords.filter((o) => o.status !== 'storno' && isoWeekKey(o.order_date) === weekKey).map((o) => o.id));

    const stockRows: StockRow[] = beerList.map((beer) => {
      const stockByPkg: StockByPkg[] = pkgList.map((pkg) => {
        const fromInv = lastInv.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id).reduce((s, r) => s + Number(r.quantity), 0);
        const brewedW = [...bot, ...keg].filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && isoWeekKey(r.entry_date) === weekKey).reduce((s, r) => s + Number(r.quantity), 0);
        const orderedW = ordItems.filter((i) => validOrdIdsWeek.has(i.order_id) && i.beer_id === beer.id && i.package_id === pkg.id).reduce((s, i) => s + Number(i.quantity), 0);
        const woW = wo.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && isoWeekKey(r.entry_date) === weekKey).reduce((s, r) => s + Number(r.quantity), 0);
        const akT = akItems.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id).reduce((s, r) => s + Number(r.quantity), 0);
        const akR = akItems.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id).reduce((s, r) => s + Number(r.returned_qty ?? 0), 0);

        const currentStock = fromInv + brewedW;
        const remaining = currentStock - orderedW - woW - (akT - akR);

        return {
          package_id: pkg.id, label: pkg.label, volume_l: Number(pkg.volume_l), kind: pkg.kind,
          quantity: currentStock, fromInventory: fromInv, brewedWeek: brewedW, orderedWeek: orderedW, writeoffsWeek: woW, akTaken: akT, akReturned: akR, remaining,
        };
      });

      const stockBottles = stockByPkg.filter((p) => p.kind === 'bottle').reduce((s, p) => s + p.quantity, 0);
      const stockKegs = stockByPkg.filter((p) => p.kind === 'keg').reduce((s, p) => s + p.quantity, 0);
      const stockTotal = stockBottles + stockKegs;
      const stockLiters = pkgLiters(stockByPkg);
      const brewedWeek = stockByPkg.reduce((s, p) => s + p.brewedWeek, 0);
      const orderedWeek = stockByPkg.reduce((s, p) => s + p.orderedWeek, 0);
      const writeoffsWeek = stockByPkg.reduce((s, p) => s + p.writeoffsWeek, 0);
      const remaining = stockByPkg.reduce((s, p) => s + p.remaining, 0);

      return { beer, stockByPkg, stockBottles, stockKegs, stockTotal, stockLiters, brewedWeek, orderedWeek, writeoffsWeek, remaining };
    });

    setRows(stockRows);
    if (!silent) setLoading(false);
  }

  async function loadBrewed(silent = false) {
    if (!silent) setBrewLoading(true);
    const [{ data: b }, { data: pk }, { data: botData }, { data: kegData }, { data: ordItemsData }, { data: ordData }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('bottling_entries').select('entry_date, beer_id, package_id, quantity').gte('entry_date', brewFrom).lte('entry_date', brewTo),
      supabase.from('kegging_entries').select('entry_date, beer_id, package_id, quantity').gte('entry_date', brewFrom).lte('entry_date', brewTo),
      supabase.from('order_items').select('order_id, beer_id, package_id, quantity'),
      supabase.from('orders').select('id, order_date, status').gte('order_date', brewFrom).lte('order_date', brewTo),
    ]);
    const beerList = (b as Beer[]) ?? [];
    const pkgList = (pk as Package[]) ?? [];
    const bot = (botData ?? []) as BrewRow[];
    const keg = (kegData ?? []) as BrewRow[];
    const ords = (ordData ?? []) as { id: string; order_date: string; status: string }[];
    const ordItems = (ordItemsData ?? []) as { order_id: string; beer_id: string | null; package_id: string; quantity: number }[];
    const validOrdIds = new Set(ords.filter((o) => o.status !== 'storno').map((o) => o.id));

    const stats: BrewStat[] = beerList.map((beer) => {
      const byPkg = pkgList.map((pkg) => {
        const qty = [...bot, ...keg].filter((r) => r.beer_id === beer.id && r.package_id === pkg.id).reduce((s, r) => s + Number(r.quantity), 0);
        const ordered = ordItems.filter((i) => validOrdIds.has(i.order_id) && i.beer_id === beer.id && i.package_id === pkg.id).reduce((s, i) => s + Number(i.quantity), 0);
        return { package_id: pkg.id, label: pkg.label, kind: pkg.kind, volume_l: Number(pkg.volume_l), quantity: qty, ordered };
      });
      const totalKegs = byPkg.filter((p) => p.kind === 'keg').reduce((s, p) => s + p.quantity, 0);
      const totalBottles = byPkg.filter((p) => p.kind === 'bottle').reduce((s, p) => s + p.quantity, 0);
      const totalQty = totalKegs + totalBottles;
      const totalLiters = pkgLiters(byPkg);

      const orderedKegs = byPkg.filter((p) => p.kind === 'keg').reduce((s, p) => s + p.ordered, 0);
      const orderedBottles = byPkg.filter((p) => p.kind === 'bottle').reduce((s, p) => s + p.ordered, 0);
      const orderedQty = orderedKegs + orderedBottles;

      return { beer, byPkg: byPkg.filter((p) => p.quantity > 0 || p.ordered > 0), totalKegs, totalBottles, totalQty, totalLiters, orderedKegs, orderedBottles, orderedQty };
    }).filter((s) => s.totalQty > 0 || s.orderedQty > 0);

    setBrewStats(stats);
    if (!silent) setBrewLoading(false);
  }

  useEffect(() => { load(); }, [weekKey]);
  useEffect(() => { loadBrewed(); }, [brewFrom, brewTo]);
  useRealtime(['bottling_entries','kegging_entries','monthly_inventory','order_items','orders','writeoffs'], () => { load(true); loadBrewed(true); });

  function setQuickRange(type: 'week' | 'month' | 'year' | 'all') {
    const today = todayISO();
    if (type === 'week') { setBrewFrom(addDaysISO(today, -7)); setBrewTo(today); }
    else if (type === 'month') { setBrewFrom(startOfMonthISO(today)); setBrewTo(today); }
    else if (type === 'year') { setBrewFrom(startOfYearISO(today)); setBrewTo(today); }
    else if (type === 'all') { setBrewFrom('2020-01-01'); setBrewTo(today); }
  }

  const grandKegs = rows.reduce((s, r) => s + r.stockKegs, 0);
  const grandBottles = rows.reduce((s, r) => s + r.stockBottles, 0);
  const grandLiters = rows.reduce((s, r) => s + r.stockLiters, 0);

  const brewTotalKegs = brewStats.reduce((s, r) => s + r.totalKegs, 0);
  const brewTotalBottles = brewStats.reduce((s, r) => s + r.totalBottles, 0);
  const brewTotalLiters = brewStats.reduce((s, r) => s + r.totalLiters, 0);

  const [topTab, setTopTab] = useState<'stock' | 'festival' | 'merch'>('stock');

  return (
    <div className="space-y-6 pb-12">
      {/* Top Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
        <button
          onClick={() => setTopTab('stock')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 ${
            topTab === 'stock'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Warehouse size={16} />
          <span>📦 Skladové zásoby piv</span>
        </button>

        <button
          onClick={() => setTopTab('festival')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 ${
            topTab === 'festival'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Tent size={16} />
          <span>🎪 Festivalové vybavení</span>
        </button>

        <button
          onClick={() => setTopTab('merch')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 ${
            topTab === 'merch'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <ShoppingBag size={16} />
          <span>🛍️ Marketing & Merch & Sklo</span>
        </button>
      </div>

      {topTab === 'festival' && <FestivalEquipmentTracker />}

      {topTab === 'merch' && <MarketingMerchInventory />}

      {topTab === 'stock' && (
        <>
          {/* Top summary stats */}
      <div className="grid grid-cols-3 gap-3 text-center mb-4">
        <div className="p-3 rounded-2xl bg-white border border-amber-300/80 shadow-xs">
          <div className="text-[10px] font-black uppercase text-amber-800">Na skladě</div>
          <div className="text-xl font-display font-black text-neutral-900">{fmtHl(grandLiters)} <span className="text-xs text-neutral-500 font-normal">hl</span></div>
        </div>
        <div className="p-3 rounded-2xl bg-white border border-amber-300/80 shadow-xs">
          <div className="text-[10px] font-black uppercase text-amber-800">Sudů</div>
          <div className="text-xl font-display font-black text-neutral-900">{grandKegs} <span className="text-xs text-neutral-500 font-normal">ks</span></div>
        </div>
        <div className="p-3 rounded-2xl bg-white border border-amber-300/80 shadow-xs">
          <div className="text-[10px] font-black uppercase text-amber-800">Lahví</div>
          <div className="text-xl font-display font-black text-neutral-900">{grandBottles} <span className="text-xs text-neutral-500 font-normal">ks</span></div>
        </div>
      </div>

      {/* Week Selector Bar - mobile-friendly: date big, prev/next small below */}
      <div className="card p-4 shadow-sm border-neutral-200/80 bg-white space-y-3">
        {/* Main week info — big and prominent */}
        <div className="text-center">
          <div className="font-display font-black text-neutral-900 text-xl sm:text-2xl flex items-center justify-center gap-2">
            <Calendar size={20} className="text-amber-600 shrink-0" />
            <span>Týden {weekKey.split('-')[1]} / {weekKey.split('-')[0]}</span>
          </div>
          <div className="text-sm sm:text-base font-extrabold text-amber-700 mt-1">{weekRangeLabel(weekKey)}</div>
        </div>

        {/* Navigation buttons — smaller, on second row */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setWeekKey(shiftWeek(weekKey, -1))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-100 hover:bg-amber-100 text-neutral-700 hover:text-amber-950 text-xs font-black border border-neutral-300 hover:border-amber-400 transition"
            title="Předchozí týden"
          >
            ‹ Předchozí
          </button>
          <button
            onClick={() => setWeekKey(isoWeekKey(todayISO()))}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-black border border-amber-400 shadow-sm transition"
          >
            Tento týden
          </button>
          <button
            onClick={() => setWeekKey(shiftWeek(weekKey, 1))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-100 hover:bg-amber-100 text-neutral-700 hover:text-amber-950 text-xs font-black border border-neutral-300 hover:border-amber-400 transition"
            title="Následující týden"
          >
            Následující ›
          </button>
        </div>
      </div>

      {/* Stock Cards Grid */}
      {loading ? <Spinner /> : rows.length === 0 ? <EmptyState text="Žádná piva na skladě." icon="📦" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((r) => {
            const isDeficit = r.remaining < 0;
            const isZero = r.remaining === 0;

            return (
              <div
                key={r.beer.id}
                onClick={() => setDetail(r)}
                className={`card p-5 cursor-pointer transition-all border-2 hover:shadow-md ${
                  isDeficit ? 'ring-2 ring-rose-500/50' : ''
                }`}
                style={{ backgroundColor: beerBg(r.beer), borderColor: beerBorder(r.beer) }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className={`font-display font-black text-lg ${beerText(r.beer)}`}>{r.beer.name}</h3>
                    {r.beer.degree && <span className="text-xs font-bold text-neutral-600">{r.beer.degree} • {r.beer.color}</span>}
                  </div>
                  <span className="px-3 py-1 rounded-xl bg-neutral-900 text-amber-300 font-mono font-black text-xs shadow-xs">
                    {fmtHl(r.stockLiters)} hl
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 my-3">
                  <div className="p-2.5 rounded-xl bg-white/70 border border-black/10">
                    <div className="text-[10px] font-black uppercase text-neutral-500">🛢️ Sudy</div>
                    <div className="text-base font-mono font-black text-neutral-900">{r.stockKegs} ks</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/70 border border-black/10">
                    <div className="text-[10px] font-black uppercase text-neutral-500">🍾 Lahve</div>
                    <div className="text-base font-mono font-black text-neutral-900">{r.stockBottles} ks</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-black/10 font-bold">
                  <span className="text-neutral-600">Po objednávkách zbude:</span>
                  <span className={`font-mono font-black text-sm px-2.5 py-0.5 rounded-lg shadow-xs ${
                    isDeficit ? 'bg-rose-600 text-white' : isZero ? 'bg-amber-500 text-slate-950' : 'bg-emerald-600 text-white'
                  }`}>
                    {r.remaining} ks
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Brewed / Excise Tax Report Section */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-br from-slate-900 via-neutral-900 to-amber-950 p-6 rounded-3xl text-white shadow-lg border border-white/10 mt-10">
        <div>
          <h2 className="text-xl sm:text-2xl font-display font-black text-amber-400 tracking-tight flex items-center gap-2.5">
            <BarChart2 size={24} />
            <span>Výkaz stočení pro Celní správu (Spotřební daň)</span>
          </h2>
          <p className="text-xs text-neutral-300 mt-1 font-medium">Přehled stočeného piva po hektolitrech a obalech pro úřad</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs" onClick={() => setQuickRange('week')}>Týden</button>
          <button className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs" onClick={() => setQuickRange('month')}>Měsíc</button>
          <button className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs" onClick={() => setQuickRange('year')}>Rok</button>
          <button className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs" onClick={() => setQuickRange('all')}>Vše</button>
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
            className="btn-amber text-xs font-black shadow-md px-3.5 py-1.5 ml-2 flex items-center gap-1.5"
          >
            <Download size={15} />
            Stáhnout Výkaz pro Celníky (Excel)
          </button>
        </div>
      </div>

      {/* Brewed Date Inputs */}
      <div className="card p-4 shadow-sm border-neutral-200/80 bg-white flex flex-wrap items-center gap-4">
        <div>
          <label className="block text-[11px] font-black uppercase text-neutral-500 mb-1">Od</label>
          <input type="date" value={brewFrom} onChange={(e) => setBrewFrom(e.target.value)} className="input !py-1.5 text-xs font-bold" />
        </div>
        <div>
          <label className="block text-[11px] font-black uppercase text-neutral-500 mb-1">Do</label>
          <input type="date" value={brewTo} onChange={(e) => setBrewTo(e.target.value)} className="input !py-1.5 text-xs font-bold" />
        </div>

        <div className="ml-auto flex items-center gap-4 text-xs font-black text-neutral-700">
          <span>Celkem stočeno: <strong className="font-mono text-amber-700">{fmtHl(brewTotalLiters)} hl</strong> ({brewTotalKegs} sudů, {brewTotalBottles} lahví)</span>
        </div>
      </div>

      {/* Brewed per Beer Grid */}
      {brewLoading ? <Spinner /> : brewStats.length === 0 ? <EmptyState text="Ve zvoleném období nebylo nic stočeno." icon="🏭" /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brewStats.map((s) => (
            <div key={s.beer.id} className="card p-5 border-2 shadow-sm" style={{ backgroundColor: beerBg(s.beer), borderColor: beerBorder(s.beer) }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className={`font-display font-black text-base ${beerText(s.beer)}`}>{s.beer.name}</div>
                  <span className="text-xs font-bold text-neutral-600">{fmtHl(s.totalLiters)} hl celkem</span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-neutral-900 text-amber-300 font-mono font-black text-xs shadow-xs">
                  {s.totalQty} ks
                </span>
              </div>

              <div className="space-y-1.5 my-3 text-xs font-bold">
                {s.byPkg.map((p) => (
                  <div key={p.package_id} className="flex items-center justify-between p-2 rounded-lg bg-white/70 border border-black/10">
                    <span className="text-neutral-800">{p.label}</span>
                    <span className="font-mono font-black text-neutral-900">{p.quantity} ks</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`${detail.beer.name} — Detail skladu po obalech`} wide>
          <div className="space-y-4">
            <div className="overflow-x-auto scrollbar-thin rounded-2xl border border-neutral-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-neutral-900 text-amber-300 uppercase tracking-wider text-[10px] font-black">
                    <th className="py-3 px-3 text-left">Obal</th>
                    <th className="py-3 px-3 text-right">Z inventury</th>
                    <th className="py-3 px-3 text-right">Stočeno týden</th>
                    <th className="py-3 px-3 text-right">Na skladě</th>
                    <th className="py-3 px-3 text-right">Objednáno</th>
                    <th className="py-3 px-3 text-right">Odpisy</th>
                    <th className="py-3 px-3 text-right">Zbude</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {detail.stockByPkg.map((p) => (
                    <tr key={p.package_id} className="hover:bg-neutral-50">
                      <td className="py-2.5 px-3 font-black text-neutral-900">{p.label}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-neutral-600">{p.fromInventory || '—'}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-700 font-bold">{p.brewedWeek || '—'}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-neutral-900">{p.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-rose-600 font-bold">{p.orderedWeek || '—'}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-neutral-500">{p.writeoffsWeek || '—'}</td>
                      <td className={`py-2.5 px-3 text-right font-mono font-black ${p.remaining < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {p.remaining}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Modal>
      )}
        </>
      )}
    </div>
  );
}
