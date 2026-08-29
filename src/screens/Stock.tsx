import { useEffect, useState } from 'react';
import { ZavozDeductionRow } from '../lib/zavozDeduction';

import { supabase, Beer, Package, KegPrefuk, useRealtime, beerBorder, fetchAllRows } from '../lib/supabase';
import { buildMovements, stockAsOf, stockKey, type Movement } from '../lib/stockLedger';
import PohybyModal from '../components/PohybyModal';
import { Spinner, EmptyState, Modal } from '../components/ui';
import { AlertTriangle, BarChart2, Beer as BeerIcon, Calendar, ChevronDown, Download, Package as PackageIcon, PackageCheck, ShoppingBag, Tent, Warehouse } from 'lucide-react';
import { exportExciseTaxReportToExcel } from '../lib/excel';
import { FestivalEquipmentTracker } from '../components/FestivalEquipmentTracker';
import { MarketingMerchInventory } from '../components/MarketingMerchInventory';
import { IkonaLahev, IkonaSud } from '../components/ikony';

type StockByPkg = {
  package_id: string; label: string; volume_l: number; kind: string;
  currentStock: number; rawStock: number; outgoing: number; difference: number;
  // Odkud se stav počítá — potřebuje rozpad pohybů (PohybyModal).
  baselineDate: string | null; baselineQty: number;
  // Podrobný rozpad pohybu za období (pro kontrolní detail) — stejné složky,
  // ze kterých se currentStock/rawStock počítá výš.
  fromInv: number; brewedW: number; woW: number; fasovaniW: number; prodejnaW: number;
  akceWeek: number; kegsUsedW: number; zdW: number; prefukFrom: number; prefukTo: number; adjW: number;
  orderedW: number;
};

// Položka, u které skladová kniha vychází záporně — evidence u ní nesedí.
type NesediRow = {
  key: string; beerName: string; pkgLabel: string;
  qty: number; baselineDate: string | null; baselineQty: number;
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
  const [nesediRows, setNesediRows] = useState<NesediRow[]>([]);
  // Pohyby skladové knihy si držíme i po načtení — otevírá se z nich rozpad
  // „proč je tam tohle číslo" (components/PohybyModal.tsx).
  const [pohyby, setPohyby] = useState<Movement[]>([]);
  const [pohybyKDatu, setPohybyKDatu] = useState<string>(todayISO());
  const [rozpad, setRozpad] = useState<
    { beerId: string; packageId: string; nazev: string; baselineDate: string | null; baselineQty: number; vysledek: number } | null
  >(null);
  const [showNesedi, setShowNesedi] = useState(false);

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

    const [{ data: invData }, { data: botData }, { data: kegData }, { data: ordItemsData }, { data: ordData }, { data: woData }, { data: akData }, { data: faData }, { data: fpData }, { data: pfData }, { data: zdData }, { data: adjData }] =
      await Promise.all([
        fetchAllRows('inventory', '*'),
        fetchAllRows('bottling', '*'),
        fetchAllRows('kegging', '*'),
        fetchAllRows('order_items', '*'),
        fetchAllRows('orders', 'id, order_date, delivery_date, status, is_delivered'),
        fetchAllRows('writeoffs', '*'),
        fetchAllRows('akce', 'entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
        fetchAllRows('fasovani', '*'),
        fetchAllRows('fasovani_private', '*'),
        fetchAllRows('keg_prefuk', '*'),
        fetchAllRows('zavoz_deductions', 'deduct_date,beer_id,package_id,quantity,order_item_id'),
        fetchAllRows('inventory_adjustments', 'entry_date,beer_id,package_id,quantity'),
      ]);

    const inv = (invData ?? []) as { entry_date: string; beer_id: string | null; package_id: string | null; quantity: number; note?: string }[];

    const bot = (botData ?? []) as BrewRow[];
    const keg = (kegData ?? []) as BrewRow[];
    const wo = (woData ?? []) as BrewRow[];
    const fa = (faData ?? []) as BrewRow[];
    const fp = (fpData ?? []) as BrewRow[];
    const pf = (pfData ?? []) as KegPrefuk[];
    const zd = (zdData ?? []) as Pick<ZavozDeductionRow, 'deduct_date' | 'beer_id' | 'package_id' | 'quantity' | 'order_item_id'>[];
    const adj = (adjData ?? []) as { entry_date: string; beer_id: string | null; package_id: string | null; quantity: number }[];
    const ords = (ordData ?? []) as { id: string; order_date: string; delivery_date: string | null; status: string; is_delivered?: boolean }[];
    const ordItems = (ordItemsData ?? []) as { id: string; order_id: string; beer_id: string | null; package_id: string; quantity: number }[];
    const akRows = (akData ?? []) as { entry_date: string; items: { beer_id: string | null; package_id: string | null; quantity_taken: number; quantity_returned: number }[] }[];

    // Objednáno = VŠECHNY objednávky tohoto týdne (i ty už zavezené — informační
    // "kolik se má tento týden celkem odeslat"). Do odečtu na "Zbývá" ale smí jít
    // jen to, co JEŠTĚ nebylo zavezeno — jinak by se už odeslané kusy odečetly
    // dvakrát (jednou přes zavoz_deductions v currentStock, podruhé tady).
    const ordersThisWeek = ords.filter((o) => o.status !== 'storno' && isoWeekKey(o.delivery_date || o.order_date) === weekKey);
    const validOrdIdsWeek = new Set(ordersThisWeek.map((o) => o.id));
    const validOrdIdsWeekOutstanding = new Set(ordersThisWeek.filter((o) => !o.is_delivered).map((o) => o.id));
    // Položky, které už mají svůj vlastní odpočet závozu — odděleně od is_delivered
    // výše, protože se nastavuje samostatně (řidič odklikne až po dojetí trasy) a
    // může chvíli zaostávat za ranním odpočtem ze skladu.
    const deductedItemIds = new Set(zd.map((r) => r.order_item_id).filter(Boolean));

    // 📒 Stav skladu ze skladové knihy (lib/stockLedger.ts) — jediné místo,
    // které v aplikaci ví, jak se která tabulka promítá do skladu. Dřív si
    // tenhle výpočet držela každá obrazovka po svém (Sklad, Inventura,
    // Dashboard, potřeba stočit lahví i sudů, plánovač stáčení) a kopie se
    // rozcházely — přefuk chyběl ve třech ze čtyř, Akce se nepočítaly vůbec.
    const movements = buildMovements({
      inventoryRows: inv,
      bottlingRows: bot,
      keggingRows: keg,
      fasovaniRows: fa,
      prodejnaRows: fp,
      writeoffsRows: wo,
      zavozDeductionRows: zd,
      akceRows: akRows,
      prefukRows: pf,
      adjustmentRows: adj,
      packages: pkgList,
    });
    // Konec zvoleného měsíce, nebo dnešek, když jde o měsíc aktuální.
    const monthEnd = (() => {
      const [y, m] = curMonth.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      const dnes = todayISO();
      return last > dnes ? dnes : last;
    })();
    const ledger = stockAsOf(movements, monthEnd);
    setPohyby(movements);
    setPohybyKDatu(monthEnd);

    const stockRows: StockRow[] = beerList.map((beer) => {
      const stockByPkg: StockByPkg[] = pkgList.map((pkg) => {
        const line = ledger.get(stockKey(beer.id, pkg.id));
        const k = line?.byKind ?? {};
        const fromInv = line?.baselineQty ?? 0;
        const brewedW = (k.kegovani ?? 0) + (k.staceni ?? 0);
        const woW = -(k.odpis ?? 0);
        const fasovaniW = -(k.fasovani ?? 0);
        const prodejnaW = -(k.prodejna ?? 0);
        const akceWeek = -(k.akce ?? 0);
        const kegsUsedW = -(k.sud_na_lahve ?? 0);
        const zdW = -(k.zavoz ?? 0);
        const prefukFrom = -(k.prefuk_z ?? 0);
        const prefukTo = k.prefuk_do ?? 0;
        const adjW = k.dorovnani ?? 0;

        // rawStock může být ZÁPORNÝ a to je správně — znamená to, že se vydalo
        // víc, než evidence zná. Dřív se to ořezávalo na nulu už při každém
        // jednotlivém pohybu, takže schodek nebyl vidět nikde (v srpnu 2026 byl
        // u 34 z 56 položek) a čerstvé stáčení nejdřív umazávalo neexistující
        // dluh, místo aby zvedlo stav.
        const rawStock = line?.qty ?? 0;
        const currentStock = Math.max(0, rawStock);

        // Objednáno (zobrazený sloupec) = celý týden, i to už zavezené — informace
        // "kolik se má tento týden celkem odeslat".
        const orderedW = ordItems.filter((i) => validOrdIdsWeek.has(i.order_id) && i.beer_id === beer.id && i.package_id === pkg.id).reduce((s, i) => s + Number(i.quantity), 0);
        // Zbývá = (sklad + stočené − fasování − prodejna − akce − odpisy − sudy na
        // lahve − zavezeno ± přefuk + dorovnání), tedy currentStock, − JEN JEŠTĚ
        // NEZAVEZENÉ objednávky tohoto týdne. Už zavezené se neodečítají znovu —
        // ty currentStock zohlednil už přes zavoz_deductions.
        const outstandingW = ordItems.filter((i) => validOrdIdsWeekOutstanding.has(i.order_id) && !deductedItemIds.has(i.id) && i.beer_id === beer.id && i.package_id === pkg.id).reduce((s, i) => s + Number(i.quantity), 0);
        const outgoing = orderedW;
        const difference = currentStock - outstandingW;

        return {
          package_id: pkg.id, label: pkg.label, volume_l: Number(pkg.volume_l), kind: pkg.kind,
          currentStock, rawStock, outgoing, difference,
          baselineDate: line?.baselineDate ?? null, baselineQty: line?.baselineQty ?? 0,
          fromInv, brewedW, woW, fasovaniW, prodejnaW, akceWeek, kegsUsedW, zdW, prefukFrom, prefukTo, adjW, orderedW,
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

    // Položky, u kterých kniha vychází do mínusu — evidence u nich nesedí.
    const nesedi: NesediRow[] = [];
    ledger.forEach((line) => {
      if (line.qty >= 0) return;
      const beer = beerList.find((x) => x.id === line.beer_id);
      const pkg = pkgList.find((x) => x.id === line.package_id);
      if (!beer || !pkg) return;
      nesedi.push({
        key: line.key,
        beerName: beer.name,
        pkgLabel: String(pkg.label).trim(),
        qty: line.qty,
        baselineDate: line.baselineDate,
        baselineQty: line.baselineQty,
      });
    });
    nesedi.sort((a, z) => a.qty - z.qty);
    setNesediRows(nesedi);
    if (!silent) setLoading(false);
  }

  async function loadBrewed(silent = false) {
    if (!silent) setBrewLoading(true);
    const [{ data: b }, { data: pk }, { data: botData }, { data: kegData }, { data: ordItemsData }, { data: ordData }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      fetchAllRows('bottling', 'entry_date, beer_id, package_id, quantity').gte('entry_date', brewFrom).lte('entry_date', brewTo),
      fetchAllRows('kegging', 'entry_date, beer_id, package_id, quantity').gte('entry_date', brewFrom).lte('entry_date', brewTo),
      fetchAllRows('order_items', 'order_id, beer_id, package_id, quantity'),
      fetchAllRows('orders', 'id, order_date, status').gte('order_date', brewFrom).lte('order_date', brewTo),
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
      {/* Top Navigation Tabs — černá/bílý text, označená se obrací na bílou s tmavým textem. */}
      <div className="flex items-center gap-2 pb-2">
        <button
          onClick={() => setTopTab('stock')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 ${
            topTab === 'stock'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Warehouse size={16} />
          <span>Skladové zásoby piv</span>
        </button>

        <button
          onClick={() => setTopTab('festival')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 ${
            topTab === 'festival'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Tent size={16} />
          <span>Festivalové vybavení</span>
        </button>

        <button
          onClick={() => setTopTab('merch')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 ${
            topTab === 'merch'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <ShoppingBag size={16} />
          <span>Marketing & Merch & Sklo</span>
        </button>
      </div>

      {topTab === 'festival' && <FestivalEquipmentTracker />}
      {topTab === 'merch' && <MarketingMerchInventory />}

      {topTab === 'stock' && (
        <>
          {/* ⚠️ Položky, u kterých evidence nesedí — vydalo se víc, než kolik
              aplikace zná. Dřív se každý takový schodek ořezal na nulu a nikde
              nebyl vidět; sklad pak tvrdil „0 ks" i tam, kde chybělo 160 kusů.
              Viz lib/stockLedger.ts. */}
          {nesediRows.length > 0 && (
            <div className="mb-4 rounded border-2 border-rose-300 bg-rose-50 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowNesedi((v) => !v)}
                className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-rose-100/60 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AlertTriangle size={20} className="text-rose-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-display font-black text-rose-900 text-sm">
                      U {nesediRows.length} {nesediRows.length === 1 ? 'položky' : nesediRows.length < 5 ? 'položek' : 'položek'} nesedí evidence
                    </div>
                    <div className="text-[11px] font-bold text-rose-700 mt-0.5">
                      Vydalo se víc, než kolik aplikace ví, že se stočilo nebo napočítalo v inventuře. Sklad u nich ukazuje 0.
                    </div>
                  </div>
                </div>
                <ChevronDown size={18} className={`text-rose-600 shrink-0 transition-transform ${showNesedi ? 'rotate-180' : ''}`} />
              </button>
              {showNesedi && (
                <div className="border-t border-rose-200 bg-white/70 divide-y divide-rose-100">
                  {nesediRows.map((r) => (
                    <div key={r.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                      <span className="font-black text-neutral-800 min-w-0 truncate">
                        {r.beerName} <span className="text-neutral-500">{r.pkgLabel}</span>
                      </span>
                      <span className="flex items-center gap-3 shrink-0 font-mono font-bold text-neutral-600">
                        <span className="hidden sm:inline text-[11px]">
                          {r.baselineDate ? `inventura ${r.baselineDate} = ${r.baselineQty}` : 'bez inventury'}
                        </span>
                        <span className="text-rose-700 font-black text-sm tabular-nums">{r.qty} ks</span>
                      </span>
                    </div>
                  ))}
                  <div className="px-4 py-3 text-[11px] font-bold text-neutral-600 bg-rose-50/60">
                    Nejčastější příčina: v inventuře se položka nenapočítala (chybí v seznamu), nebo se nezapsalo stáčení.
                    Srovná to fyzická inventura — ta stav nastaví napevno a počítá se od ní dál.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Top summary stats */}
          <div className="grid grid-cols-3 gap-3 text-center mb-4">
            <div className="p-3 rounded bg-white border border-amber-300/80 shadow-xs">
              <div className="text-[11px] font-black uppercase text-amber-800">Na skladě</div>
              <div className="text-xl font-display font-black text-neutral-900">{fmtHl(grandLiters)} <span className="text-xs text-neutral-500 font-normal">hl</span></div>
            </div>
            <div className="p-3 rounded bg-white border border-amber-300/80 shadow-xs">
              <div className="text-[11px] font-black uppercase text-amber-800">Sudů</div>
              <div className="text-xl font-display font-black text-neutral-900">{grandKegs} <span className="text-xs text-neutral-500 font-normal">ks</span></div>
            </div>
            <div className="p-3 rounded bg-white border border-amber-300/80 shadow-xs">
              <div className="text-[11px] font-black uppercase text-amber-800">Lahví</div>
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
                className="flex items-center gap-1.5 px-4 py-2 rounded bg-neutral-100 hover:bg-amber-100 text-neutral-700 hover:text-amber-950 text-xs font-black border border-neutral-300 hover:border-amber-400 transition"
                title="Předchozí týden"
              >
                ‹ Předchozí
              </button>
              <button
                onClick={() => setWeekKey(isoWeekKey(todayISO()))}
                className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-black border border-amber-400 shadow-sm transition"
              >
                Tento týden
              </button>
              <button
                onClick={() => setWeekKey(shiftWeek(weekKey, 1))}
                className="flex items-center gap-1.5 px-4 py-2 rounded bg-neutral-100 hover:bg-amber-100 text-neutral-700 hover:text-amber-950 text-xs font-black border border-neutral-300 hover:border-amber-400 transition"
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
                className="px-2.5 py-1 rounded bg-neutral-100 hover:bg-amber-100 text-neutral-600 hover:text-amber-950 text-[11px] font-black border border-neutral-300 hover:border-amber-400 transition"
                title="Aktuální měsíc"
              >
                Nyní
              </button>
            </div>
          </div>

          {/* Stock Cards Grid */}
          {loading ? <Spinner /> : rows.length === 0 ? <EmptyState text="Žádná piva na skladě." icon={PackageIcon} /> : (
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
                    style={{ borderColor: beerBorder(r.beer) }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-display font-black text-lg text-neutral-900">{r.beer.name}</h3>
                        {r.beer.degree && <span className="text-xs font-bold text-neutral-600">{r.beer.degree} • {r.beer.color}</span>}
                      </div>
                      <span className="px-3 py-1 rounded bg-neutral-900 text-amber-300 font-mono font-black text-xs shadow-xs">
                        {fmtHl(r.stockLiters)} hl
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 my-3">
                      <div className="p-2.5 rounded bg-white/70 border border-black/10">
                        <div className="text-[11px] font-black uppercase text-neutral-500"><IkonaSud className="ikona-text" /> Sudy</div>
                        <div className={`text-base font-mono font-black ${r.stockKegs < 0 ? 'text-rose-600' : 'text-neutral-900'}`}>{r.stockKegs} ks</div>
                      </div>
                      <div className="p-2.5 rounded bg-white/70 border border-black/10">
                        <div className="text-[11px] font-black uppercase text-neutral-500"><IkonaLahev className="ikona-text" /> Lahve</div>
                        <div className={`text-base font-mono font-black ${r.stockBottles < 0 ? 'text-rose-600' : 'text-neutral-900'}`}>{r.stockBottles} ks</div>
                      </div>
                    </div>

                    {/* Package breakdown: KEG + Lahve */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {kegs.length > 0 && (
                        <div className="bg-white/70 backdrop-blur-xs rounded p-2.5 border border-neutral-200/50">
                          <div className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1.5 flex items-center gap-1"><IkonaSud className="ikona-text" /> Sudy</div>
                          <table className="w-full text-xs font-semibold border-collapse">
                            <thead>
                              <tr className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                                <th className="text-left pb-1 pr-1">Obal</th>
                                <th className="text-center pb-1 px-1" title="Aktuální stav">Stav</th>
                                <th className="text-center pb-1 px-1" title="Objednáno tento týden, ještě nezavezeno">Objedn.</th>
                                <th className="text-center pb-1 pl-1" title="Rozdíl">Rozdíl</th>
                              </tr>
                            </thead>
                            <tbody>
                              {kegs.map((p) => (
                                <tr key={p.package_id}>
                                  <td className="py-1 pr-1 whitespace-nowrap text-neutral-500 text-xs font-bold">{p.label}</td>
                                  <td className="p-0">
                                    {/* Klepnutím se ukáže, z čeho se stav skládá — inventura
                                        a každý pohyb po ní. Dřív se tohle dohledávalo ručně
                                        po obrazovkách. */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRozpad({
                                          beerId: r.beer.id, packageId: p.package_id,
                                          nazev: `${r.beer.name} · ${p.label}`,
                                          baselineDate: p.baselineDate, baselineQty: p.baselineQty,
                                          vysledek: p.rawStock,
                                        });
                                      }}
                                      title="Ukázat, z čeho se stav skládá"
                                      className="w-full min-h-[36px] py-1 px-1 text-center font-extrabold text-neutral-900 bg-neutral-100 rounded-md hover:bg-amber-100 active:scale-95 transition underline decoration-dotted decoration-neutral-400 underline-offset-2"
                                    >
                                      {p.currentStock}
                                      {p.rawStock < 0 && <span className="block text-[11px] font-black text-rose-600 font-mono" title="Vydáno víc, než evidence zná">({p.rawStock})</span>}
                                    </button>
                                  </td>
                                  <td className={`py-1 px-1 text-center font-extrabold rounded-md ${p.outgoing > 0 ? 'bg-rose-50 text-rose-700' : 'bg-neutral-50 text-neutral-500'}`}>{p.outgoing > 0 ? `-${p.outgoing}` : '0'}</td>
                                  <td className={`py-1 pl-1 text-center font-extrabold rounded-md ${p.difference < 0 ? 'bg-rose-50 text-rose-700' : p.difference === 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{p.difference}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {bottles.length > 0 && (
                        <div className="bg-white/70 backdrop-blur-xs rounded p-2.5 border border-neutral-200/50">
                          <div className="text-xs font-bold uppercase tracking-wider text-primary-700 mb-1.5 flex items-center gap-1"><IkonaLahev className="ikona-text" /> Lahve</div>
                          <table className="w-full text-xs font-semibold border-collapse">
                            <thead>
                              <tr className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                                <th className="text-left pb-1 pr-1">Obal</th>
                                <th className="text-center pb-1 px-1" title="Aktuální stav">Stav</th>
                                <th className="text-center pb-1 px-1" title="Objednáno tento týden, ještě nezavezeno">Objedn.</th>
                                <th className="text-center pb-1 pl-1" title="Rozdíl">Rozdíl</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bottles.map((p) => (
                                <tr key={p.package_id}>
                                  <td className="py-1 pr-1 whitespace-nowrap text-neutral-500 text-xs font-bold">{p.label}</td>
                                  <td className="p-0">
                                    {/* Klepnutím se ukáže, z čeho se stav skládá — inventura
                                        a každý pohyb po ní. Dřív se tohle dohledávalo ručně
                                        po obrazovkách. */}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setRozpad({
                                          beerId: r.beer.id, packageId: p.package_id,
                                          nazev: `${r.beer.name} · ${p.label}`,
                                          baselineDate: p.baselineDate, baselineQty: p.baselineQty,
                                          vysledek: p.rawStock,
                                        });
                                      }}
                                      title="Ukázat, z čeho se stav skládá"
                                      className="w-full min-h-[36px] py-1 px-1 text-center font-extrabold text-neutral-900 bg-neutral-100 rounded-md hover:bg-amber-100 active:scale-95 transition underline decoration-dotted decoration-neutral-400 underline-offset-2"
                                    >
                                      {p.currentStock}
                                      {p.rawStock < 0 && <span className="block text-[11px] font-black text-rose-600 font-mono" title="Vydáno víc, než evidence zná">({p.rawStock})</span>}
                                    </button>
                                  </td>
                                  <td className={`py-1 px-1 text-center font-extrabold rounded-md ${p.outgoing > 0 ? 'bg-rose-50 text-rose-700' : 'bg-neutral-50 text-neutral-500'}`}>{p.outgoing > 0 ? `-${p.outgoing}` : '0'}</td>
                                  <td className={`py-1 pl-1 text-center font-extrabold rounded-md ${p.difference < 0 ? 'bg-rose-50 text-rose-700' : p.difference === 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{p.difference}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-black/10">
                      <span className="text-[11px] font-black uppercase text-neutral-500">Zbývá</span>
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
          {/* Rozpad jednoho stavu na pohyby — otevírá se klepnutím na číslo. */}
          {rozpad && (
            <PohybyModal
              open
              onClose={() => setRozpad(null)}
              movements={pohyby}
              beerId={rozpad.beerId}
              packageId={rozpad.packageId}
              nazev={rozpad.nazev}
              kDatu={pohybyKDatu}
              baselineDate={rozpad.baselineDate}
              baselineQty={rozpad.baselineQty}
              vysledek={rozpad.vysledek}
            />
          )}

          <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? detail.beer.name : ''}>
            {detail && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded bg-neutral-50 border border-neutral-200">
                    <div className="text-[11px] font-black uppercase text-neutral-500">Na skladě</div>
                    <div className="text-lg font-mono font-black text-neutral-900">{fmtHl(detail.stockLiters)} hl</div>
                  </div>
                  <div className="p-3 rounded bg-neutral-50 border border-neutral-200">
                    <div className="text-[11px] font-black uppercase text-neutral-500">Zbývá</div>
                    <div className={`text-lg font-mono font-black ${detail.remaining < 0 ? 'text-rose-600' : detail.remaining === 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {detail.remaining > 0 ? `+${detail.remaining}` : detail.remaining} ks
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  {detail.stockByPkg
                    .filter((p) => p.currentStock > 0 || p.outgoing > 0 || p.fromInv > 0 || p.brewedW > 0)
                    .map((p) => (
                      <div key={p.package_id} className="rounded border border-neutral-200 overflow-hidden">
                        <div className={`px-3 py-2 flex items-center justify-between gap-2 text-xs font-black uppercase tracking-wider ${p.kind === 'keg' ? 'bg-amber-100 text-amber-800' : 'bg-primary-100 text-primary-800'}`}>
                          <span>{p.kind === 'keg' ? <IkonaSud className="ikona-text" /> : <IkonaLahev className="ikona-text" />} {p.label}</span>
                          <span className="font-mono">Aktuální stav: {p.currentStock} ks</span>
                        </div>
                        <div className="p-3 grid grid-cols-3 gap-1.5 text-center">
                          <div className="rounded bg-neutral-50 py-1.5">
                            <div className="text-[11px] font-black uppercase text-neutral-500">Počáteční</div>
                            <div className="text-sm font-black text-neutral-800">{p.fromInv}</div>
                          </div>
                          <div className="rounded bg-emerald-50 py-1.5">
                            <div className="text-[11px] font-black uppercase text-emerald-700">Stočeno</div>
                            <div className="text-sm font-black text-emerald-800">+{p.brewedW}</div>
                          </div>
                          <div className="rounded bg-sky-50 py-1.5">
                            <div className="text-[11px] font-black uppercase text-sky-700">Objednáno (týden)</div>
                            <div className="text-sm font-black text-sky-800">{p.orderedW}</div>
                          </div>
                          <div className="rounded bg-rose-50 py-1.5">
                            <div className="text-[11px] font-black uppercase text-rose-700">Odečteno závozem</div>
                            <div className="text-sm font-black text-rose-800">−{p.zdW}</div>
                          </div>
                          <div className="rounded bg-rose-50 py-1.5">
                            <div className="text-[11px] font-black uppercase text-rose-700">Fasování (personál)</div>
                            <div className="text-sm font-black text-rose-800">−{p.fasovaniW}</div>
                          </div>
                          <div className="rounded bg-rose-50 py-1.5">
                            <div className="text-[11px] font-black uppercase text-rose-700">Prodejna</div>
                            <div className="text-sm font-black text-rose-800">−{p.prodejnaW}</div>
                          </div>
                          <div className="rounded bg-rose-50 py-1.5">
                            <div className="text-[11px] font-black uppercase text-rose-700">Akce</div>
                            <div className="text-sm font-black text-rose-800">−{p.akceWeek}</div>
                          </div>
                          <div className="rounded bg-rose-50 py-1.5">
                            <div className="text-[11px] font-black uppercase text-rose-700">Odpisy</div>
                            <div className="text-sm font-black text-rose-800">−{p.woW}</div>
                          </div>
                          <div className="rounded bg-violet-50 py-1.5">
                            <div className="text-[11px] font-black uppercase text-violet-700">Sudy na lahve</div>
                            <div className="text-sm font-black text-violet-800">−{p.kegsUsedW}</div>
                          </div>
                          {(p.prefukFrom > 0 || p.prefukTo > 0) && (
                            <div className="rounded bg-neutral-50 py-1.5">
                              <div className="text-[11px] font-black uppercase text-neutral-500">Přefuk ZE/DO</div>
                              <div className="text-sm font-black text-neutral-800">−{p.prefukFrom} / +{p.prefukTo}</div>
                            </div>
                          )}
                          {p.adjW !== 0 && (
                            <div className="rounded bg-amber-50 py-1.5">
                              <div className="text-[11px] font-black uppercase text-amber-700">Dorovnání inventury</div>
                              <div className="text-sm font-black text-amber-800">{p.adjW > 0 ? '+' : ''}{p.adjW}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                </div>

                <p className="text-xs text-neutral-400">
                  Aktuální stav = počáteční + stočeno − fasování (personál) − prodejna − akce − odpisy − sudy na lahve − odečteno závozem − přefuk ZE + přefuk DO + dorovnání inventury. Objednáno (týden) je celý týden včetně už zavezeného. Zbývá = aktuální stav − jen ještě nezavezené objednávky tohoto týdne — kolik po vyřízení zbytku týdne reálně zbyde na skladě.
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
                  // Spotřební daň se vyměřuje ze skutečně stočeného množství za dané období
                  // (brewStats, filtrováno podle entry_date od–do), ne z toho, kolik zbývá
                  // na skladě teď (r.stockLiters = počáteční stav + stočeno − vydané do dneška).
                  brewStats.map((s) => ({
                    beer_name: s.beer.name,
                    degree: s.beer.degree ?? '',
                    liters: s.totalLiters,
                    hl: s.totalLiters / 100,
                    keg_count: s.totalKegs,
                    bottle_count: s.totalBottles,
                  })),
                  `${brewFrom} – ${brewTo}`
                )}
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-sm transition"
              >

                <Download size={14} />
                Export Excel
              </button>
            </div>
            {/* Mobilní karty */}
            <div className="grid grid-cols-1 gap-2 md:hidden">
              {rows.map((r) => (
                <div key={r.beer.id} className="rounded border border-neutral-200 p-3 flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-neutral-800 truncate">{r.beer.name}</span>
                  <div className="flex items-center gap-3 text-xs font-mono shrink-0">
                    <span className="text-neutral-500">{r.stockKegs} sud.</span>
                    <span className="text-neutral-500">{r.stockBottles} lah.</span>
                    <span className="font-black text-neutral-900">{r.stockTotal} ks</span>
                    <span className="font-black text-amber-700">{fmtHl(r.stockLiters)} hl</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[11px] font-bold uppercase text-neutral-400 border-b border-neutral-200">
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
                    <button key={t} onClick={() => setQuickRange(t)} className="px-2 py-1 rounded bg-neutral-100 hover:bg-amber-100 text-neutral-600 hover:text-amber-950 text-[11px] font-black border border-neutral-300 hover:border-amber-400 transition">
                      {t === 'week' ? 'Týden' : t === 'month' ? 'Měsíc' : t === 'year' ? 'Rok' : 'Vše'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center mb-4">
              <div className="p-3 rounded bg-amber-50 border border-amber-200">
                <div className="text-[11px] font-black uppercase text-amber-800">Sudů</div>
                <div className="text-xl font-display font-black text-neutral-900">{brewTotalKegs} <span className="text-xs text-neutral-500 font-normal">ks</span></div>
              </div>
              <div className="p-3 rounded bg-primary-50 border border-primary-200">
                <div className="text-[11px] font-black uppercase text-primary-800">Lahví</div>
                <div className="text-xl font-display font-black text-neutral-900">{brewTotalBottles} <span className="text-xs text-neutral-500 font-normal">ks</span></div>
              </div>
              <div className="p-3 rounded bg-emerald-50 border border-emerald-200">
                <div className="text-[11px] font-black uppercase text-emerald-800">Celkem</div>
                <div className="text-xl font-display font-black text-neutral-900">{fmtHl(brewTotalLiters)} <span className="text-xs text-neutral-500 font-normal">hl</span></div>
              </div>
            </div>

            {brewLoading ? <Spinner /> : brewStats.length === 0 ? <EmptyState text="Žádné stočení v tomto období." icon={BeerIcon} /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {brewStats.map((s) => (
                  <div key={s.beer.id} className="bg-white rounded border-2 border-neutral-200 p-4" style={{ borderColor: beerBorder(s.beer) }}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-display font-black text-base text-neutral-900">{s.beer.name}</h3>
                      <span className="px-2.5 py-1 rounded bg-neutral-900 text-amber-300 font-mono font-black text-xs">{fmtHl(s.totalLiters)} hl</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div className="p-2 rounded bg-amber-50 border border-amber-200 text-center">
                        <div className="text-[11px] font-black uppercase text-amber-800">Sudy</div>
                        <div className="text-sm font-mono font-black text-neutral-900">{s.totalKegs}</div>
                      </div>
                      <div className="p-2 rounded bg-primary-50 border border-primary-200 text-center">
                        <div className="text-[11px] font-black uppercase text-primary-800">Lahve</div>
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
