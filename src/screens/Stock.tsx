import { useEffect, useState } from 'react';
import { ZavozDeductionRow } from '../lib/zavozDeduction';

import { supabase, Beer, Package, KegPrefuk, useRealtime, beerBg, beerText, beerBorder } from '../lib/supabase';
import { Spinner, EmptyState, Modal } from '../components/ui';
import { Warehouse, Calendar, BarChart2, PackageCheck, Download, ShoppingBag, Tent } from 'lucide-react';
import { exportExciseTaxReportToExcel } from '../lib/excel';
import { FestivalEquipmentTracker } from '../components/FestivalEquipmentTracker';
import { MarketingMerchInventory } from '../components/MarketingMerchInventory';

type StockByPkg = {
  package_id: string; label: string; volume_l: number; kind: string;
  currentStock: number; rawStock: number; outgoing: number; difference: number;
};

type StockRow = {
  beer: Beer;
  stockByPkg: StockByPkg[];
  stockBottles: number; stockKegs: number; stockTotal: number; stockLiters: number;
  totalOutgoing: number;
  remaining: number;
};

type BrewRow = { entry_date: string; beer_id: string | null; package_id: string | null; quantity: number; kegs_used?: number | null; kegs_used_package_id?: string | null };

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
  const [invMonth, setInvMonth] = useState<string>(monthKey(todayISO()));
  const [detail, setDetail] = useState<StockRow | null>(null);

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

    const curMonth = invMonth;

    const [{ data: invData }, { data: botData }, { data: kegData }, { data: ordItemsData }, { data: ordData }, { data: woData }, { data: akData }, { data: faData }, { data: fpData }, { data: pfData }, { data: zdData }] =
      await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('bottling').select('*'),
        supabase.from('kegging').select('*'),
        supabase.from('order_items').select('*'),
        supabase.from('orders').select('id, order_date, delivery_date, status'),
        supabase.from('writeoffs').select('*'),
        supabase.from('akce').select('entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
        supabase.from('fasovani').select('*'),
        supabase.from('fasovani_private').select('*'),
        supabase.from('keg_prefuk').select('*'),
        supabase.from('zavoz_deductions').select('deduct_date,beer_id,package_id,quantity'),
      ]);

    const inv = (invData ?? []) as { entry_date: string; beer_id: string | null; package_id: string | null; quantity: number; note?: string }[];
    // Počáteční inventura pro zvolený měsíc (s navázáním na předchozí měsíc)
    let lastInv = inv.filter((r) => monthKey(r.entry_date) === curMonth && (r.note?.includes('Počáteční') || !r.note));
    if (lastInv.length === 0) {
      const prevMonth = (() => {
        const [y, m] = curMonth.split('-').map(Number);
        const d = new Date(Date.UTC(y, m - 2, 1));
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      })();
      const prevActual = inv.filter((r) => monthKey(r.entry_date) === prevMonth && (r.note?.includes('Fyzická') || r.note?.includes('Schválená')));
      if (prevActual.length > 0) {
        lastInv = prevActual;
      } else {
        lastInv = inv.filter((r) => monthKey(r.entry_date) === prevMonth);
      }
    }

    const isMovementInPeriod = (entry_date?: string) => {
      if (!entry_date) return false;
      return monthKey(entry_date) === curMonth;
    };

    const getKegsUsed = (r: any) => {
      const kegsUsed = Number(r.kegs_used || 0);
      if (kegsUsed <= 0) return null;
      if (r.kegs_used_package_id) return { kegPkgId: r.kegs_used_package_id, kegsUsed };
      const sourceL = Number(r.source_volume_l || 0);
      if (sourceL > 0) {
        const singleVol = sourceL / kegsUsed;
        const matched = pkgList.find((p) => p.kind === 'keg' && Number(p.volume_l) === singleVol);
        if (matched) return { kegPkgId: matched.id, kegsUsed };
      }
      const pkg = pkgList.find((p) => p.id === r.package_id);
      if (pkg && pkg.kind === 'keg') return { kegPkgId: pkg.id, kegsUsed };
      return null;
    };

    const bot = (botData ?? []) as BrewRow[];
    const keg = (kegData ?? []) as BrewRow[];
    const wo = (woData ?? []) as BrewRow[];
    const fa = (faData ?? []) as BrewRow[];
    const fp = (fpData ?? []) as BrewRow[];
    const pf = (pfData ?? []) as KegPrefuk[];
    const zd = (zdData ?? []) as Pick<ZavozDeductionRow, 'deduct_date' | 'beer_id' | 'package_id' | 'quantity'>[];
    const ords = (ordData ?? []) as { id: string; order_date: string; delivery_date: string | null; status: string }[];
    const ordItems = (ordItemsData ?? []) as { order_id: string; beer_id: string | null; package_id: string; quantity: number }[];
    const akRows = (akData ?? []) as { entry_date: string; items: { beer_id: string | null; package_id: string | null; quantity_taken: number; quantity_returned: number }[] }[];

    const validOrdIdsWeek = new Set(ords.filter((o) => o.status !== 'storno' && isoWeekKey(o.delivery_date || o.order_date) === weekKey).map((o) => o.id));

    const stockRows: StockRow[] = beerList.map((beer) => {
      const stockByPkg: StockByPkg[] = pkgList.map((pkg) => {
        const fromInv = lastInv.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id).reduce((s, r) => s + Number(r.quantity), 0);
        const brewedW = [...bot, ...keg]
          .filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && isMovementInPeriod(r.entry_date))
          .reduce((s, r) => s + Number(r.quantity), 0);

        const woW = wo.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && isMovementInPeriod(r.entry_date)).reduce((s, r) => s + Number(r.quantity), 0);
        const fasovaniW = fa.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && isMovementInPeriod(r.entry_date)).reduce((s, r) => s + Number(r.quantity), 0);
        const prodejnaW = fp.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && isMovementInPeriod(r.entry_date)).reduce((s, r) => s + Number(r.quantity), 0);

        let akceWeek = 0;
        akRows.filter((r) => isMovementInPeriod(r.entry_date)).forEach((r) => {
          (r.items ?? []).forEach((it: any) => {
            if (it.beer_id === beer.id && it.package_id === pkg.id) {
              akceWeek += Math.max(0, Number(it.quantity_taken || 0) - Number(it.quantity_returned || 0));
            }
          });
        });

        const seenKegSource = new Set<string>();
        let kegsUsedW = 0;
        bot.filter((r) => r.beer_id === beer.id && isMovementInPeriod(r.entry_date)).forEach((r) => {
          const res = getKegsUsed(r);
          if (res && res.kegPkgId === pkg.id) {
            const key = `${r.entry_date}|${r.beer_id}|${res.kegsUsed}|${res.kegPkgId}|${(r as any).created_at || (r as any).note || ''}`;
            if (seenKegSource.has(key)) return;
            seenKegSource.add(key);
            kegsUsedW += res.kegsUsed;
          }
        });

        const outgoingMoved = fasovaniW + woW + prodejnaW + akceWeek + kegsUsedW;

        // Automatický odpočet závozu (zavoz_deductions) — položky odečtené ráno v 01:00
        const zdW = zd
          .filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && isMovementInPeriod(r.deduct_date))
          .reduce((s, r) => s + Number(r.quantity), 0);

        // Přefuk KEG: sudy ZE (from_count) se odečtou ze skladu, sudy DO (to_count) se přičtou
        const prefukFrom = pf.filter((r) => r.beer_id === beer.id && r.from_package_id === pkg.id && isMovementInPeriod(r.entry_date)).reduce((s, r) => s + Number(r.from_count || 0), 0);
        const prefukTo = pf.filter((r) => r.beer_id === beer.id && r.to_package_id === pkg.id && isMovementInPeriod(r.entry_date)).reduce((s, r) => s + Number(r.to_count || 0), 0);

        // Aktuální reálný stav na skladě = Počáteční + Stočeno − vydáno/odepsáno − odpočet závozu − přefuk ZE + přefuk DO
        const rawStock = fromInv + brewedW - outgoingMoved - zdW - prefukFrom + prefukTo;
        const currentStock = Math.max(0, rawStock);

        const orderedW = ordItems.filter((i) => validOrdIdsWeek.has(i.order_id) && i.beer_id === beer.id && i.package_id === pkg.id).reduce((s, i) => s + Number(i.quantity), 0);
        // Odečtené závozy jsou již v rawStock — zobrazíme je ale v outgoing jako info (ne duplicitní odpočet)
        const zdWeekOrdered = zd.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && isMovementInPeriod(r.deduct_date)).reduce((s, r) => s + Number(r.quantity), 0);
        const outgoing = Math.max(0, orderedW - zdWeekOrdered); // zbývající neodevzdané závozy
        const difference = currentStock - outgoing;

        return {
          package_id: pkg.id, label: pkg.label, volume_l: Number(pkg.volume_l), kind: pkg.kind,
          currentStock, rawStock, outgoing, difference,
        };
      });

      const stockBottles = stockByPkg.filter((p) => p.kind === 'bottle').reduce((s, p) => s + p.currentStock, 0);
      const stockKegs = stockByPkg.filter((p) => p.kind === 'keg').reduce((s, p) => s + p.currentStock, 0);
      const stockTotal = stockBottles + stockKegs;
      const stockLiters = pkgLiters(stockByPkg.map((p) => ({ quantity: p.currentStock, volume_l: p.volume_l })));

      const totalOutgoing = stockByPkg.reduce((s, p) => s + p.outgoing, 0);
      const remaining = stockByPkg.reduce((s, p) => s + p.difference, 0);

      return { beer, stockByPkg, stockBottles, stockKegs, stockTotal, stockLiters, totalOutgoing, remaining };
    });

    setRows(stockRows);
    if (!silent) setLoading(false);
  }

  async function loadBrewed(silent = false) {
    if (!silent) setBrewLoading(true);
    const [{ data: b }, { data: pk }, { data: botData }, { data: kegData }, { data: ordItemsData }, { data: ordData }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('bottling').select('entry_date, beer_id, package_id, quantity').gte('entry_date', brewFrom).lte('entry_date', brewTo),
      supabase.from('kegging').select('entry_date, beer_id, package_id, quantity').gte('entry_date', brewFrom).lte('entry_date', brewTo),
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

  useEffect(() => { load(); }, [weekKey, invMonth]);
  useEffect(() => { loadBrewed(); }, [brewFrom, brewTo]);
  useRealtime(['bottling','kegging','keg_prefuk','inventory','order_items','orders','writeoffs','fasovani','fasovani_private','zavoz_deductions'], () => { load(true); loadBrewed(true); });

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

          {/* Week Selector Bar */}
          <div className="card p-4 shadow-sm border-neutral-200/80 bg-white space-y-3">
            <div className="text-center">
              <div className="font-display font-black text-neutral-900 text-xl sm:text-2xl flex items-center justify-center gap-2">
                <Calendar size={20} className="text-amber-600 shrink-0" />
                <span>Týden {weekKey.split('-')[1]} / {weekKey.split('-')[0]}</span>
              </div>
              <div className="text-sm sm:text-base font-extrabold text-amber-700 mt-1">{weekRangeLabel(weekKey)}</div>
            </div>

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

            {/* Inventory month selector */}
            <div className="flex items-center justify-center gap-2 pt-2 border-t border-neutral-100">
              <span className="text-[11px] font-black uppercase text-neutral-500">Inventura měsíc:</span>
              <input
                type="month"
                value={invMonth}
                onChange={(e) => setInvMonth(e.target.value)}
                className="input !py-1 !px-2 text-xs font-black text-amber-800 border-amber-300 w-auto"
              />
              <button
                onClick={() => setInvMonth(monthKey(todayISO()))}
                className="px-2.5 py-1 rounded-lg bg-neutral-100 hover:bg-amber-100 text-neutral-600 hover:text-amber-950 text-[11px] font-black border border-neutral-300 hover:border-amber-400 transition"
                title="Aktuální měsíc"
              >
                Nyní
              </button>
            </div>
          </div>

          {/* Stock Cards Grid */}
          {loading ? <Spinner /> : rows.length === 0 ? <EmptyState text="Žádná piva na skladě." icon="📦" /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {rows.map((r) => {
                const isDeficit = r.remaining < 0;
                const isZero = r.remaining === 0;

                const kegs = r.stockByPkg.filter((p) => p.kind === 'keg' && (p.currentStock > 0 || p.outgoing > 0));
                const bottles = r.stockByPkg.filter((p) => p.kind === 'bottle' && (p.currentStock > 0 || p.outgoing > 0));

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
                        <div className={`text-base font-mono font-black ${r.stockKegs < 0 ? 'text-rose-600' : 'text-neutral-900'}`}>{r.stockKegs} ks</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/70 border border-black/10">
                        <div className="text-[10px] font-black uppercase text-neutral-500">🍾 Lahve</div>
                        <div className={`text-base font-mono font-black ${r.stockBottles < 0 ? 'text-rose-600' : 'text-neutral-900'}`}>{r.stockBottles} ks</div>
                      </div>
                    </div>

                    {/* Package breakdown: KEG + Lahve side by side */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {kegs.length > 0 && (
                        <div className="bg-white/70 backdrop-blur-xs rounded-xl p-2.5 border border-neutral-200/50">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1.5 flex items-center gap-1">🛢️ Sudy</div>
                          <table className="w-full text-[11px] font-semibold border-collapse">
                            <thead>
                              <tr className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">
                                <th className="text-left pb-1 pr-1">Obal</th>
                                <th className="text-center pb-1 px-1" title="Aktuální stav">Stav</th>
                                <th className="text-center pb-1 px-1" title="Odpis (všechny odchody)">Odpis</th>
                                <th className="text-center pb-1 pl-1" title="Rozdíl">Rozdíl</th>
                              </tr>
                            </thead>
                            <tbody>
                              {kegs.map((p) => (
                                <tr key={p.package_id}>
                                  <td className="py-0.5 pr-1 whitespace-nowrap text-neutral-400 text-[9px] font-bold">{p.label}</td>
                                  <td className="py-0.5 px-1 text-center font-extrabold text-neutral-900 bg-neutral-100 rounded-md">
                                    {p.currentStock}
                                    {p.rawStock < 0 && <span className="block text-[8px] font-black text-rose-600 font-mono" title="Nestočeno / nestíhá sklad">({p.rawStock})</span>}
                                  </td>
                                  <td className={`py-0.5 px-1 text-center font-extrabold rounded-md ${p.outgoing > 0 ? 'bg-rose-50 text-rose-600' : 'bg-neutral-50 text-neutral-400'}`}>{p.outgoing > 0 ? `-${p.outgoing}` : '0'}</td>
                                  <td className={`py-0.5 pl-1 text-center font-extrabold rounded-md ${p.difference < 0 ? 'bg-rose-50 text-rose-600' : p.difference === 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{p.difference}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {bottles.length > 0 && (
                        <div className="bg-white/70 backdrop-blur-xs rounded-xl p-2.5 border border-neutral-200/50">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-primary-700 mb-1.5 flex items-center gap-1">🍾 Lahve</div>
                          <table className="w-full text-[11px] font-semibold border-collapse">
                            <thead>
                              <tr className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">
                                <th className="text-left pb-1 pr-1">Obal</th>
                                <th className="text-center pb-1 px-1" title="Aktuální stav">Stav</th>
                                <th className="text-center pb-1 px-1" title="Odpis (všechny odchody)">Odpis</th>
                                <th className="text-center pb-1 pl-1" title="Rozdíl">Rozdíl</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bottles.map((p) => (
                                <tr key={p.package_id}>
                                  <td className="py-0.5 pr-1 whitespace-nowrap text-neutral-400 text-[9px] font-bold">{p.label}</td>
                                  <td className="py-0.5 px-1 text-center font-extrabold text-neutral-900 bg-neutral-100 rounded-md">
                                    {p.currentStock}
                                    {p.rawStock < 0 && <span className="block text-[8px] font-black text-rose-600 font-mono" title="Nestočeno / nestíhá sklad">({p.rawStock})</span>}
                                  </td>
                                  <td className={`py-0.5 px-1 text-center font-extrabold rounded-md ${p.outgoing > 0 ? 'bg-rose-50 text-rose-600' : 'bg-neutral-50 text-neutral-400'}`}>{p.outgoing > 0 ? `-${p.outgoing}` : '0'}</td>
                                  <td className={`py-0.5 pl-1 text-center font-extrabold rounded-md ${p.difference < 0 ? 'bg-rose-50 text-rose-600' : p.difference === 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{p.difference}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/10">
                      <span className="text-[10px] font-black uppercase text-neutral-500">Zbývá</span>
                      <span className={`text-sm font-mono font-black ${isDeficit ? 'text-rose-600' : isZero ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {r.remaining > 0 ? `+${r.remaining}` : r.remaining} ks
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Detail Modal */}
          <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? detail.beer.name : ''}>
            {detail && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                    <div className="text-[10px] font-black uppercase text-neutral-500">Na skladě</div>
                    <div className="text-lg font-mono font-black text-neutral-900">{fmtHl(detail.stockLiters)} hl</div>
                  </div>
                  <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200">
                    <div className="text-[10px] font-black uppercase text-neutral-500">Zbývá</div>
                    <div className={`text-lg font-mono font-black ${detail.remaining < 0 ? 'text-rose-600' : detail.remaining === 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {detail.remaining > 0 ? `+${detail.remaining}` : detail.remaining} ks
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {(['keg', 'bottle'] as const).map((kind) => {
                    const items = detail.stockByPkg.filter((p) => p.kind === kind && (p.currentStock > 0 || p.outgoing > 0));
                    if (!items.length) return null;
                    return (
                      <div key={kind} className="rounded-xl border border-neutral-200 overflow-hidden">
                        <div className={`px-3 py-2 text-xs font-black uppercase tracking-wider ${kind === 'keg' ? 'bg-amber-100 text-amber-800' : 'bg-primary-100 text-primary-800'}`}>
                          {kind === 'keg' ? '🛢 Sudy' : '🍾 Lahve'}
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] font-bold uppercase text-neutral-400 bg-neutral-50">
                              <th className="text-left px-3 py-1.5">Obal</th>
                              <th className="text-center px-2 py-1.5">Stav</th>
                              <th className="text-center px-2 py-1.5">Odpis</th>
                              <th className="text-center px-3 py-1.5">Rozdíl</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((p) => (
                              <tr key={p.package_id} className="border-t border-neutral-100">
                                <td className="px-3 py-1.5 font-bold text-neutral-600">{p.label}</td>
                                <td className="px-2 py-1.5 text-center font-mono font-black text-neutral-900">{p.currentStock}</td>
                                <td className={`px-2 py-1.5 text-center font-mono font-black ${p.outgoing > 0 ? 'text-rose-600' : 'text-neutral-400'}`}>{p.outgoing > 0 ? `-${p.outgoing}` : '0'}</td>
                                <td className={`px-3 py-1.5 text-center font-mono font-black ${p.difference < 0 ? 'text-rose-600' : p.difference === 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{p.difference}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-neutral-400">
                  Stav = počáteční stav (inventura) + stočeno do dnešního dne. Odpis = fasování + odpisy + objednávky + prodejna + akce + sudy ze stáčení lahví. Rozdíl = stav − odpis.
                </p>
              </div>
            )}
          </Modal>

          {/* Excise Tax Report */}
          <div className="card p-4 shadow-sm border-neutral-200/80 bg-white">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <BarChart2 size={18} className="text-amber-600" />
                Spotřební daň – přehled
              </h2>
              <button
                onClick={() => exportExciseTaxReportToExcel(
                  rows.map((r) => ({
                    beer_name: r.beer.name,
                    degree: r.beer.degree ?? '',
                    liters: r.stockLiters,
                    hl: r.stockLiters / 100,
                    keg_count: r.stockKegs,
                    bottle_count: r.stockBottles,
                  })),
                  `${brewFrom} – ${brewTo}`
                )}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-sm transition"
              >

                <Download size={14} />
                Export Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-bold uppercase text-neutral-400 border-b border-neutral-200">
                    <th className="text-left py-2 pr-2">Pivo</th>
                    <th className="text-right py-2 px-2">Sudů</th>
                    <th className="text-right py-2 px-2">Lahví</th>
                    <th className="text-right py-2 px-2">Celkem ks</th>
                    <th className="text-right py-2 pl-2">hl</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.beer.id} className="border-b border-neutral-100">
                      <td className="py-2 pr-2 font-bold text-neutral-800">{r.beer.name}</td>
                      <td className="py-2 px-2 text-right font-mono">{r.stockKegs}</td>
                      <td className="py-2 px-2 text-right font-mono">{r.stockBottles}</td>
                      <td className="py-2 px-2 text-right font-mono font-black">{r.stockTotal}</td>
                      <td className="py-2 pl-2 text-right font-mono font-black">{fmtHl(r.stockLiters)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Brewed Section */}
          <div className="card p-4 shadow-sm border-neutral-200/80 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <PackageCheck size={18} className="text-amber-600" />
                Stočeno za období
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" value={brewFrom} onChange={(e) => setBrewFrom(e.target.value)} className="input !py-1 !px-2 text-xs font-black text-amber-800 border-amber-300 w-auto" />
                <span className="text-neutral-400 font-black">–</span>
                <input type="date" value={brewTo} onChange={(e) => setBrewTo(e.target.value)} className="input !py-1 !px-2 text-xs font-black text-amber-800 border-amber-300 w-auto" />
                <div className="flex gap-1">
                  {(['week', 'month', 'year', 'all'] as const).map((t) => (
                    <button key={t} onClick={() => setQuickRange(t)} className="px-2 py-1 rounded-lg bg-neutral-100 hover:bg-amber-100 text-neutral-600 hover:text-amber-950 text-[11px] font-black border border-neutral-300 hover:border-amber-400 transition">
                      {t === 'week' ? 'Týden' : t === 'month' ? 'Měsíc' : t === 'year' ? 'Rok' : 'Vše'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200">
                <div className="text-[10px] font-black uppercase text-amber-800">Sudů</div>
                <div className="text-xl font-display font-black text-neutral-900">{brewTotalKegs} <span className="text-xs text-neutral-500 font-normal">ks</span></div>
              </div>
              <div className="p-3 rounded-2xl bg-primary-50 border border-primary-200">
                <div className="text-[10px] font-black uppercase text-primary-800">Lahví</div>
                <div className="text-xl font-display font-black text-neutral-900">{brewTotalBottles} <span className="text-xs text-neutral-500 font-normal">ks</span></div>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] font-black uppercase text-emerald-800">Celkem</div>
                <div className="text-xl font-display font-black text-neutral-900">{fmtHl(brewTotalLiters)} <span className="text-xs text-neutral-500 font-normal">hl</span></div>
              </div>
            </div>

            {brewLoading ? <Spinner /> : brewStats.length === 0 ? <EmptyState text="Žádné stočení v tomto období." icon="🍺" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {brewStats.map((s) => (
                  <div key={s.beer.id} className="rounded-2xl border border-neutral-200 bg-white p-4" style={{ borderColor: beerBorder(s.beer) }}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className={`font-display font-black text-base ${beerText(s.beer)}`}>{s.beer.name}</h3>
                      <span className="px-2.5 py-1 rounded-lg bg-neutral-900 text-amber-300 font-mono font-black text-xs">{fmtHl(s.totalLiters)} hl</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-center">
                        <div className="text-[9px] font-black uppercase text-amber-800">Sudy</div>
                        <div className="text-sm font-mono font-black text-neutral-900">{s.totalKegs}</div>
                      </div>
                      <div className="p-2 rounded-lg bg-primary-50 border border-primary-200 text-center">
                        <div className="text-[9px] font-black uppercase text-primary-800">Lahve</div>
                        <div className="text-sm font-mono font-black text-neutral-900">{s.totalBottles}</div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {s.byPkg.map((p) => (
                        <div key={p.package_id} className="flex items-center justify-between text-xs">
                          <span className="font-bold text-neutral-600">{p.label}</span>
                          <span className="font-mono font-black text-neutral-900">{p.quantity} ks</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
