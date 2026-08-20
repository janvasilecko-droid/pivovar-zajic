import { useEffect, useMemo, useState } from 'react';
import { supabase, Beer, Package, Place, useRealtime, beerBg, beerBorder, beerName, formatPackageLabel } from '../lib/supabase';
import { Spinner, EmptyState } from '../components/ui';
import { exportHistoryDetailToExcel } from '../lib/excel';
import { orderWeightKg, fmtKg } from '../lib/weight';
import { DAYS } from '../lib/shared';
import { BarChart3, Search, Cylinder, Trophy, Calendar, Filter, Download, ArrowUpRight, ArrowDownRight, Zap, Printer, ShieldAlert, PieChart as PieChartIcon, TrendingUp, ShoppingCart, Beer as BeerIcon, Boxes, Building, Percent, Clock, AlertTriangle, CheckCircle2, DollarSign, TrendingDown, ArrowUp, ArrowDown, Eye, EyeOff, Maximize2, Minimize2, Smartphone, AlertOctagon, GitCompare, Truck, History as HistoryIcon } from 'lucide-react';
import { WeeklyOrderSummaryCard, WeeklyOrderItem, isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';
import { PieChart as RePieChart, Pie, Cell, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { EditOrderModal } from '../components/EditOrderModal';
import ZavozHistory from '../components/ZavozHistory';

type MonthData = {
  month: string;
  brewed: number;
  bottled: number;
  kegged: number;
  brewed_hl: number;
  fasovani: number;
  writeoffs: number;
  ordered: number;
  akce_taken: number;
  akce_returned: number;
  akce_revenue: number;
  byBeer: Record<string, number>;
  byBeerHl: Record<string, number>;
  byPackage: Record<string, number>;
  // Rozpad KEG vs PET (lahve) podle druhů obalů
  kegHl: number;       // HL stočeno do KEG
  bottleHl: number;    // HL stočeno do lahví/PET
  byBeerKegHl: Record<string, number>;   // HL každého piva v KEG
  byBeerBottleHl: Record<string, number>; // HL každého piva v lahvích/PET
  byPackageKind: Record<string, { ks: number; hl: number }>; // podle druhu obalu (keg/bottle)
};

type FilterableEntry = { entry_date: string; beer_id: string | null; package_id: string | null; quantity: number };

function monthKey(d: string): string { return d.slice(0, 7); }
function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'][Number(mo) - 1] + ' ' + y;
}
function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function startOfYearISO(iso: string): string { return iso.slice(0, 4) + '-01-01'; }
function startOfMonthISO(iso: string): string { return iso.slice(0, 7) + '-01'; }
function addDaysISO(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ---- Detailní hledání: definice zdrojů aktivit ----
type ActivitySourceKey = 'bottling' | 'kegging' | 'fasovani' | 'fasovani_private' | 'writeoffs' | 'order_items';
const ACTIVITY_SOURCES: { key: ActivitySourceKey; label: string; icon: string; dateField: 'entry_date' | 'order_date'; hasVolume: boolean }[] = [
  { key: 'bottling', label: 'Stáčení lahví', icon: '🍾', dateField: 'entry_date', hasVolume: true },
  { key: 'kegging', label: 'Stáčení kegů', icon: '🛢️', dateField: 'entry_date', hasVolume: true },
  { key: 'fasovani', label: 'Fasování', icon: '📦', dateField: 'entry_date', hasVolume: true },
  { key: 'fasovani_private', label: 'Prodejna', icon: '🏪', dateField: 'entry_date', hasVolume: true },
  { key: 'writeoffs', label: 'Odpisy', icon: '📉', dateField: 'entry_date', hasVolume: true },
  { key: 'order_items', label: 'Objednávky', icon: '🧾', dateField: 'order_date', hasVolume: true },
];

type DetailRow = {
  source: ActivitySourceKey;
  entry_date: string;
  beer_id: string | null;
  package_id: string | null;
  quantity: number;
};

type DetailResultRow = {
  beer_id: string | null;
  beer_name: string;
  package_id: string | null;
  package_label: string;
  volume_l: number;
  qtyBySource: Record<ActivitySourceKey, number>;
  totalQty: number;
  totalLiters: number;
};

type TankCycleRow = {
  id: string;
  tank_label: string;
  beer_name: string | null;
  initial_volume_l: number;
  kegged_volume_l: number;
  keg_count: number;
  loss_l: number;
  loss_pct: number;
  started_at: string | null;
  ended_at: string;
  duration_hours: number | null;
};

function fmtHoursShort(h: number | null | undefined): string {
  if (h == null) return '—';
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} dní`;
}

type SortDir = 'asc' | 'desc';
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <span className="text-neutral-300 ml-1">↕</span>;
  return <span className="text-neutral-900 ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}
function sortRows<T>(rows: T[], key: keyof T | null, dir: SortDir): T[] {
  if (!key) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const av = a[key]; const bv = b[key];
    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
    else cmp = String(av ?? '').localeCompare(String(bv ?? ''), 'cs');
    return dir === 'asc' ? cmp : -cmp;
  });
  return copy;
}

type SavedFilter = {
  name: string;
  selSources: ActivitySourceKey[];
  selBeers: string[];
  selPackages: string[];
  dateFrom: string;
  dateTo: string;
};

type DeliveryOrder = {
  id: string; order_date: string; place_id: string | null; place_name: string | null;
  status: string; delivery_day: string | null; is_prepared: boolean; is_packaged: boolean;
  is_delivered: boolean; note: string | null; source: string; delivered_at: string | null;
  created_at: string; delivery_date: string | null;
  place_phone?: string | null;
};
type DeliveryItem = { id: string; order_id: string; beer_id: string | null; beer_name: string | null; package_id: string | null; package_label: string | null; quantity: number; is_prepared: boolean };

export default function History({ setPage, initialSubTab }: { setPage?: (p: any, sec?: string, sub?: string) => void; initialSubTab?: string } = {}) {
  const [activeTab, setActiveTab] = useState<'overview' | 'production' | 'detail' | 'cycles' | 'stats' | 'orders' | 'deliveries'>((initialSubTab as any) || 'overview');

  useEffect(() => {
    setActiveTab((initialSubTab as any) || 'overview');
  }, [initialSubTab]);

  function selectTab(t: 'overview' | 'production' | 'detail' | 'cycles' | 'stats' | 'orders' | 'deliveries') {
    if (setPage) setPage('history', undefined, t);
    else setActiveTab(t);
  }
  // ---- Výstav (production) state ----
  const [prodPeriod, setProdPeriod] = useState<'week' | 'month' | 'year' | 'all'>('year');
  const [prodCustomFrom, setProdCustomFrom] = useState<string>(startOfYearISO(todayISO()));
  const [prodCustomTo, setProdCustomTo] = useState<string>(todayISO());

  const [data, setData] = useState<MonthData[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [beerFilter, setBeerFilter] = useState<string>('');
  const [packageFilter, setPackageFilter] = useState<string>('');

  // ---- Přehled objednávek (týdenní) ----
  const [ordWeekKey, setOrdWeekKey] = useState(isoWeekKey(new Date().toISOString().slice(0, 10)));
  type OrdItem = { order_id: string; beer_id: string | null; beer_name: string | null; package_id: string | null; package_label: string | null; quantity: number };
  type OrdRow = { id: string; order_date: string; delivery_date: string | null; status: string };
  const [ordItems, setOrdItems] = useState<OrdItem[]>([]);
  const [ordRows, setOrdRows] = useState<OrdRow[]>([]);
  // Modal pro tisk uzávěrky
  const [showPrintModal, setShowPrintModal] = useState(false);

  // ---- Detailní hledání state ----
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(true);
  const [selSources, setSelSources] = useState<Set<ActivitySourceKey>>(new Set(ACTIVITY_SOURCES.map((s) => s.key)));
  const [selBeers, setSelBeers] = useState<Set<string>>(new Set());
  const [selPackages, setSelPackages] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState<string>(startOfYearISO(todayISO()));
  const [dateTo, setDateTo] = useState<string>(todayISO());

  // ---- Historie cyklů tanků ----
  const [tankCycles, setTankCycles] = useState<TankCycleRow[]>([]);
  const [tankCyclesLoading, setTankCyclesLoading] = useState(true);

  // ---- Historie nákladek (přesunuto z původní obrazovky Závoz) ----
  const [delOrders, setDelOrders] = useState<DeliveryOrder[]>([]);
  const [delItems, setDelItems] = useState<Record<string, DeliveryItem[]>>({});
  const [delPackages, setDelPackages] = useState<Package[]>([]);
  const [delLoading, setDelLoading] = useState(true);

  // ---- Editace objednávek z přehledu ----
  const [editOrder, setEditOrder] = useState<DeliveryOrder | null>(null);
  const [editItems, setEditItems] = useState<DeliveryItem[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);

  async function loadDeliveries() {
    const [{ data: o }, { data: p }, { data: pl }] = await Promise.all([
      supabase.from('orders').select('*').neq('status', 'storno').order('order_date', { ascending: false }),
      supabase.from('packages').select('*'),
      supabase.from('places').select('*').order('name'),
    ]);
    const ords = (o as DeliveryOrder[]) ?? [];
    setDelOrders(ords);
    setDelPackages((p as Package[]) ?? []);
    setPlaces((pl as Place[]) ?? []);
    if (ords.length) {
      const { data: it } = await supabase.from('order_items').select('*').in('order_id', ords.map((x) => x.id));
      const map: Record<string, DeliveryItem[]> = {};
      (it as DeliveryItem[])?.forEach((i) => { (map[i.order_id] ??= []).push(i); });
      setDelItems(map);
    }
    setDelLoading(false);
  }

  async function openEditOrder(orderId: string) {
    const order = delOrders.find((o) => o.id === orderId);
    if (!order) return;
    const items = delItems[orderId] ?? [];
    setEditOrder(order);
    setEditItems(items);
  }

  useEffect(() => { loadDeliveries(); }, []);
  useRealtime(['orders', 'order_items', 'packages'], loadDeliveries);

  const delHistoryByDate = useMemo(() => {
    const map = new Map<string, { date: string; orders: DeliveryOrder[]; totalWeight: number; totalQty: number }>();
    delOrders.forEach((o) => {
      const dateKey = o.order_date;
      const cur = map.get(dateKey) || { date: dateKey, orders: [], totalWeight: 0, totalQty: 0 };
      cur.orders.push(o);
      const oItems = delItems[o.id] ?? [];
      cur.totalWeight += orderWeightKg(oItems, delPackages);
      cur.totalQty += oItems.reduce((s, i) => s + Number(i.quantity), 0);
      map.set(dateKey, cur);
    });
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [delOrders, delItems, delPackages]);

  // ---- Seskupení podrobného hledání ----
  const [groupBy, setGroupBy] = useState<'none' | 'month' | 'year'>('none');

  // ---- Uložené oblíbené filtry (localStorage) ----
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => {
    try { return JSON.parse(localStorage.getItem('history_saved_filters') || '[]'); } catch { return []; }
  });
  const [newFilterName, setNewFilterName] = useState('');

  // ---- Řazení tabulek ----
  const [detailSortKey, setDetailSortKey] = useState<keyof DetailResultRow | null>(null);
  const [detailSortDir, setDetailSortDir] = useState<SortDir>('desc');
  const [cycleSortKey, setCycleSortKey] = useState<keyof TankCycleRow | null>(null);
  const [cycleSortDir, setCycleSortDir] = useState<SortDir>('desc');

  function onSortDetail(key: keyof DetailResultRow) {
    if (detailSortKey === key) setDetailSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setDetailSortKey(key); setDetailSortDir('desc'); }
  }
  function onSortCycle(key: keyof TankCycleRow) {
    if (cycleSortKey === key) setCycleSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setCycleSortKey(key); setCycleSortDir('desc'); }
  }

  async function load() {
    setLoading(true);
    const [{ data: bt }, { data: kg }, { data: fa }, { data: wo }, { data: ak }, { data: oi }, { data: ord }, { data: b }, { data: pk }] = await Promise.all([
      supabase.from('bottling').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('kegging').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('fasovani').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('writeoffs').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('akce').select('entry_date,revenue,items:akce_items(beer_id,quantity_taken,quantity_returned,quantity)'),
      supabase.from('order_items').select('beer_id,package_id,quantity,order_id'),
      supabase.from('orders').select('id,order_date,delivery_date,status'),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
    ]);
    const beerList = (b as Beer[]) ?? [];
    setBeers(beerList);
    setPackages((pk as Package[]) ?? []);

    const agg = (rows: FilterableEntry[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => m.set(monthKey(r.entry_date), (m.get(monthKey(r.entry_date)) ?? 0) + Number(r.quantity)));
      return m;
    };
    const aggByDim = (rows: FilterableEntry[], dim: 'beer_id' | 'package_id') => {
      const m = new Map<string, Map<string, number>>();
      rows.forEach((r) => {
        const mk = monthKey(r.entry_date);
        const key = (r[dim] as string | null) ?? 'unknown';
        if (!m.has(mk)) m.set(mk, new Map());
        const inner = m.get(mk)!;
        inner.set(key, (inner.get(key) ?? 0) + Number(r.quantity));
      });
      return m;
    };
    const pkList = (pk as Package[]) ?? [];
    const aggLiters = (rows: FilterableEntry[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => {
        const pkg = pkList.find((p) => p.id === r.package_id);
        if (!pkg) return;
        m.set(monthKey(r.entry_date), (m.get(monthKey(r.entry_date)) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
      });
      return m;
    };
    const btRows = (bt as FilterableEntry[]) ?? [];
    const kgRows = (kg as FilterableEntry[]) ?? [];
    const faRows = (fa as FilterableEntry[]) ?? [];
    const woRows = (wo as FilterableEntry[]) ?? [];
    const btM = agg(btRows);
    const kgM = agg(kgRows);
    const faM = agg(faRows);
    const woM = agg(woRows);
    const btLitersM = aggLiters(btRows);
    const kgLitersM = aggLiters(kgRows);
    const brewedByBeer = aggByDim([...btRows, ...kgRows], 'beer_id');
    const brewedByPackage = aggByDim([...btRows, ...kgRows], 'package_id');
    const akRows = (ak as { entry_date: string; revenue: number | null; items: { beer_id: string | null; quantity_taken: number; quantity_returned: number; quantity: number | null }[] }[]) ?? [];
    const brewedByBeerHl = new Map<string, Map<string, number>>();
    [...btRows, ...kgRows].forEach((r) => {
      const mk = monthKey(r.entry_date);
      const key = r.beer_id ?? 'unknown';
      const pkg = pkList.find((p) => p.id === r.package_id);
      if (!pkg) return;

      if (!brewedByBeerHl.has(mk)) {
        brewedByBeerHl.set(mk, new Map());
      }
      const innerMap = brewedByBeerHl.get(mk)!;
      innerMap.set(key, (innerMap.get(key) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
    });

    const akTaken = new Map<string, number>();
    const akRet = new Map<string, number>();
    const akRevenue = new Map<string, number>();
    akRows.forEach((r) => {
      const mk = monthKey(r.entry_date);
      akRevenue.set(mk, (akRevenue.get(mk) ?? 0) + Number(r.revenue ?? 0));
      (r.items ?? []).forEach((i) => {
        if (i.quantity != null) {
          const q = Number(i.quantity);
          if (q < 0) akTaken.set(mk, (akTaken.get(mk) ?? 0) + (-q));
          else if (q > 0) akRet.set(mk, (akRet.get(mk) ?? 0) + q);
        } else {
          akTaken.set(mk, (akTaken.get(mk) ?? 0) + Number(i.quantity_taken));
          akRet.set(mk, (akRet.get(mk) ?? 0) + Number(i.quantity_returned));
        }
      });
    });

    const ordRows = (ord as { id: string; order_date: string; delivery_date: string | null; status: string }[]) ?? [];
    const oiRows = (oi as { beer_id: string | null; package_id: string | null; quantity: number; order_id: string }[]) ?? [];
    // Save for weekly orders tab
    setOrdRows(ordRows);
    setOrdItems(oiRows.map(i => ({ order_id: i.order_id, beer_id: i.beer_id, beer_name: null, package_id: i.package_id, package_label: null, quantity: Number(i.quantity) })));
    const ordM = new Map<string, number>();
    ordRows.filter((o) => o.status !== 'storno').forEach((o) => {
      const mk = monthKey(o.order_date);
      oiRows.filter((i) => i.order_id === o.id).forEach((i) => {
        ordM.set(mk, (ordM.get(mk) ?? 0) + Number(i.quantity));
      });
    });

    // Výpočet rozpadu KEG vs PET podle druhů obalů
    const calcKegHl = (rows: FilterableEntry[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => {
        const pkg = pkList.find((p) => p.id === r.package_id);
        if (!pkg || pkg.kind !== 'keg') return;
        m.set(monthKey(r.entry_date), (m.get(monthKey(r.entry_date)) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
      });
      return m;
    };
    const calcBottleHl = (rows: FilterableEntry[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => {
        const pkg = pkList.find((p) => p.id === r.package_id);
        if (!pkg || pkg.kind !== 'bottle') return;
        m.set(monthKey(r.entry_date), (m.get(monthKey(r.entry_date)) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
      });
      return m;
    };
    const calcByBeerKindHl = (rows: FilterableEntry[], kind: 'keg' | 'bottle') => {
      const m = new Map<string, Map<string, number>>();
      rows.forEach((r) => {
        const pkg = pkList.find((p) => p.id === r.package_id);
        if (!pkg || pkg.kind !== kind) return;
        const mk = monthKey(r.entry_date);
        const key = r.beer_id ?? 'unknown';
        if (!m.has(mk)) m.set(mk, new Map());
        const inner = m.get(mk)!;
        inner.set(key, (inner.get(key) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
      });
      return m;
    };
    const calcByPackageKind = (rows: FilterableEntry[]) => {
      const m = new Map<string, Map<string, { ks: number; hl: number }>>();
      rows.forEach((r) => {
        const pkg = pkList.find((p) => p.id === r.package_id);
        if (!pkg) return;
        const mk = monthKey(r.entry_date);
        const kind = pkg.kind;
        if (!m.has(mk)) m.set(mk, new Map());
        const inner = m.get(mk)!;
        const prev = inner.get(kind) ?? { ks: 0, hl: 0 };
        inner.set(kind, { ks: prev.ks + Number(r.quantity), hl: prev.hl + Number(r.quantity) * Number(pkg.volume_l) });
      });
      return m;
    };

    const allBrewRows = [...btRows, ...kgRows];
    const kegHlM = calcKegHl(allBrewRows);
    const bottleHlM = calcBottleHl(allBrewRows);
    const byBeerKegHlM = calcByBeerKindHl(allBrewRows, 'keg');
    const byBeerBottleHlM = calcByBeerKindHl(allBrewRows, 'bottle');
    const byPackageKindM = calcByPackageKind(allBrewRows);

    const allMonths = new Set<string>([...btM.keys(), ...kgM.keys(), ...faM.keys(), ...woM.keys(), ...akTaken.keys(), ...ordM.keys()]);
    const result: MonthData[] = [...allMonths].sort().reverse().map((mk) => ({
      month: mk,
      brewed: (btM.get(mk) ?? 0) + (kgM.get(mk) ?? 0),
      bottled: btM.get(mk) ?? 0,
      kegged: kgM.get(mk) ?? 0,
      brewed_hl: ((btLitersM.get(mk) ?? 0) + (kgLitersM.get(mk) ?? 0)) / 100,
      fasovani: faM.get(mk) ?? 0,
      writeoffs: woM.get(mk) ?? 0,
      ordered: ordM.get(mk) ?? 0,
      akce_taken: akTaken.get(mk) ?? 0,
      akce_returned: akRet.get(mk) ?? 0,
      akce_revenue: akRevenue.get(mk) ?? 0,
      byBeer: Object.fromEntries((brewedByBeer.get(mk) ?? new Map()).entries()),
      byBeerHl: Object.fromEntries((brewedByBeerHl.get(mk) ?? new Map()).entries()),
      byPackage: Object.fromEntries((brewedByPackage.get(mk) ?? new Map()).entries()),
      kegHl: (kegHlM.get(mk) ?? 0) / 100,
      bottleHl: (bottleHlM.get(mk) ?? 0) / 100,
      byBeerKegHl: Object.fromEntries((byBeerKegHlM.get(mk) ?? new Map()).entries()),
      byBeerBottleHl: Object.fromEntries((byBeerBottleHlM.get(mk) ?? new Map()).entries()),
      byPackageKind: Object.fromEntries((byPackageKindM.get(mk) ?? new Map()).entries()),
    }));
    setData(result);
    if (result.length > 0) setSelectedMonths([result[0].month]);
    setLoading(false);

    // Detailní hledání data
    setDetailLoading(true);
    const { data: faPriv } = await supabase.from('fasovani_private').select('entry_date,beer_id,package_id,quantity');
    const faPrivRows = (faPriv as FilterableEntry[]) ?? [];
    const ordDateById = new Map(ordRows.map((o) => [o.id, o.order_date] as const));
    const ordStatusById = new Map(ordRows.map((o) => [o.id, o.status] as const));

    const rows: DetailRow[] = [
      ...btRows.filter((r) => r && r.entry_date).map((r) => ({ source: 'bottling' as ActivitySourceKey, entry_date: r.entry_date, beer_id: r.beer_id, package_id: r.package_id, quantity: Number(r.quantity) })),
      ...kgRows.filter((r) => r && r.entry_date).map((r) => ({ source: 'kegging' as ActivitySourceKey, entry_date: r.entry_date, beer_id: r.beer_id, package_id: r.package_id, quantity: Number(r.quantity) })),
      ...faRows.filter((r) => r && r.entry_date).map((r) => ({ source: 'fasovani' as ActivitySourceKey, entry_date: r.entry_date, beer_id: r.beer_id, package_id: r.package_id, quantity: Number(r.quantity) })),
      ...faPrivRows.filter((r) => r && r.entry_date).map((r) => ({ source: 'fasovani_private' as ActivitySourceKey, entry_date: r.entry_date, beer_id: r.beer_id, package_id: r.package_id, quantity: Number(r.quantity) })),
      ...woRows.filter((r) => r && r.entry_date).map((r) => ({ source: 'writeoffs' as ActivitySourceKey, entry_date: r.entry_date, beer_id: r.beer_id, package_id: r.package_id, quantity: Number(r.quantity) })),
      ...oiRows.filter((i) => ordStatusById.get(i.order_id) !== 'storno' && ordDateById.get(i.order_id)).map((i) => ({
        source: 'order_items' as ActivitySourceKey,
        entry_date: ordDateById.get(i.order_id) as string,
        beer_id: i.beer_id,
        package_id: i.package_id,
        quantity: Number(i.quantity),
      })),
    ];
    setDetailRows(rows);
    setDetailLoading(false);
  }

  async function loadTankCycles() {
    setTankCyclesLoading(true);
    const { data: cy } = await supabase.from('cellar_tank_cycles').select('*').order('ended_at', { ascending: false }).limit(300);
    setTankCycles((cy as TankCycleRow[]) ?? []);
    setTankCyclesLoading(false);
  }

  useEffect(() => { load(); loadTankCycles(); }, []);
  useRealtime(['bottling', 'kegging', 'fasovani', 'fasovani_private', 'writeoffs', 'orders', 'order_items', 'akce', 'akce_items', 'beers', 'packages'], load);
  useRealtime(['cellar_tank_cycles'], loadTankCycles);

  // ---- Tydenny prehled objednavek ----
  const ordWr = useMemo(() => weekRange(ordWeekKey), [ordWeekKey]);
  const weeklyOrderItemsList = useMemo((): WeeklyOrderItem[] => {
    const { start, end } = ordWr;
    const activeOrdIds = new Set(
      ordRows
        .filter(o => o.status !== 'storno')
        // Datum dodání (delivery_date), pokud je vyplněné — objednávka zadaná dřív, ale
        // dodávaná v tomto týdnu, se jinak z týdenního přehledu ztratí.
        .filter(o => { const target = o.delivery_date || o.order_date; const d = new Date(target + 'T00:00:00Z'); return d >= start && d <= end; })
        .map(o => o.id)
    );
    const grouped = new Map<string, { beerName: string; volume: number; packageLabel: string; beerId: string; packageId: string; ordered: number }>();
    ordItems
      .filter(i => activeOrdIds.has(i.order_id))
      .forEach(i => {
        const beer = beers.find(b => b.id === i.beer_id);
        const pkg = packages.find(p => p.id === i.package_id);
        const beerName = beer?.name ?? '?';
        const pkgLabel = pkg?.label ?? '?';
        const volume = Number(pkg?.volume_l ?? 0);
        const key = `${i.beer_id ?? ''}__${i.package_id ?? ''}`;
        if (!grouped.has(key)) {
          grouped.set(key, { beerName, volume, packageLabel: pkgLabel, beerId: i.beer_id ?? '', packageId: i.package_id ?? '', ordered: 0 });
        }
        grouped.get(key)!.ordered += i.quantity;
      });
    return [...grouped.values()].map(g => ({
      beerKey: `${g.beerId}__${g.packageId}`,
      beerName: g.beerName,
      volume: g.volume,
      packageLabel: g.packageLabel,
      ordered: g.ordered,
      remaining: g.ordered,
      stock: 0,
      beerId: g.beerId,
      packageId: g.packageId,
    }));
  }, [ordRows, ordItems, beers, packages, ordWeekKey, ordWr]);

  function toggleMonth(m: string) {
    setSelectedMonths((s) => s.includes(m) ? s.filter((x) => x !== m) : [...s, m].sort().reverse());
  }

  const selected = data.filter((d) => selectedMonths.includes(d.month));

  const beerName = (id: string) => beers.find((b) => b.id === id)?.name ?? (id === 'unknown' ? 'Neznámé' : '—');
  const packageName = (id: string) => packages.find((p) => p.id === id)?.label ?? (id === 'unknown' ? 'Neznámý' : '—');
  const filteredData = data.filter((d) => {
    if (beerFilter && !(d.byBeer[beerFilter] > 0)) return false;
    if (packageFilter && !(d.byPackage[packageFilter] > 0)) return false;
    return true;
  });
  const filteredSelected = selected.filter((d) => {
    if (beerFilter && !(d.byBeer[beerFilter] > 0)) return false;
    if (packageFilter && !(d.byPackage[packageFilter] > 0)) return false;
    return true;
  });
  const maxBrewedFiltered = Math.max(...filteredData.map((d) => d.brewed), 1);

  function toggleSet<T>(set: Set<T>, val: T): Set<T> {
    const n = new Set(set);
    if (n.has(val)) n.delete(val); else n.add(val);
    return n;
  }

  const detailFiltered = useMemo(() => {
    return detailRows.filter((r) => {
      if (!selSources.has(r.source)) return false;
      if (r.entry_date < dateFrom || r.entry_date > dateTo) return false;
      if (selBeers.size > 0 && (!r.beer_id || !selBeers.has(r.beer_id))) return false;
      if (selPackages.size > 0 && (!r.package_id || !selPackages.has(r.package_id))) return false;
      return true;
    });
  }, [detailRows, selSources, dateFrom, dateTo, selBeers, selPackages]);

  const detailResults = useMemo(() => {
    const m = new Map<string, DetailResultRow>();
    detailFiltered.forEach((r) => {
      const beer = beers.find((b) => b.id === r.beer_id);
      const pkg = packages.find((p) => p.id === r.package_id);
      const key = `${r.beer_id ?? 'x'}__${r.package_id ?? 'x'}`;
      let e = m.get(key);
      if (!e) {
        e = {
          beer_id: r.beer_id, beer_name: beer?.name ?? 'Neznámé pivo',
          package_id: r.package_id, package_label: pkg?.label ?? 'Neznámý obal',
          volume_l: pkg?.volume_l ?? 0,
          qtyBySource: Object.fromEntries(ACTIVITY_SOURCES.map((s) => [s.key, 0])) as Record<ActivitySourceKey, number>,
          totalQty: 0, totalLiters: 0,
        };
        m.set(key, e);
      }
      e.qtyBySource[r.source] += r.quantity;
      e.totalQty += r.quantity;
      e.totalLiters += r.quantity * (pkg?.volume_l ?? 0);
    });
    return [...m.values()].sort((a, b) => b.totalQty - a.totalQty);
  }, [detailFiltered, beers, packages]);

  const detailResultsSorted = useMemo(() => sortRows(detailResults, detailSortKey, detailSortDir), [detailResults, detailSortKey, detailSortDir]);
  const tankCyclesSorted = useMemo(() => sortRows(tankCycles, cycleSortKey, cycleSortDir), [tankCycles, cycleSortKey, cycleSortDir]);

  // Diagnostika ztrátovosti podle tanků
  const tankLossDiagnostics = useMemo(() => {
    const m = new Map<string, { count: number; totalLossL: number; totalInitialL: number; avgLossPct: number }>();
    tankCycles.forEach((c) => {
      const label = c.tank_label;
      if (!m.has(label)) m.set(label, { count: 0, totalLossL: 0, totalInitialL: 0, avgLossPct: 0 });
      const e = m.get(label)!;
      e.count += 1;
      e.totalLossL += Number(c.loss_l ?? 0);
      e.totalInitialL += Number(c.initial_volume_l ?? 0);
    });
    return [...m.entries()].map(([label, e]) => ({
      tank_label: label,
      count: e.count,
      totalLossL: e.totalLossL,
      avgLossPct: e.totalInitialL > 0 ? (e.totalLossL / e.totalInitialL) * 100 : 0,
    })).sort((a, b) => b.avgLossPct - a.avgLossPct);
  }, [tankCycles]);

  const topStats = useMemo(() => {
    const topBeer = detailResults.length ? [...detailResults].sort((a, b) => b.totalQty - a.totalQty)[0] : null;
    const lowestLoss = tankCycles.length ? [...tankCycles].sort((a, b) => Number(a.loss_pct) - Number(b.loss_pct))[0] : null;
    const highestLoss = tankCycles.length ? [...tankCycles].sort((a, b) => Number(b.loss_pct) - Number(a.loss_pct))[0] : null;
    const withDuration = tankCycles.filter((c) => c.duration_hours != null);
    const fastest = withDuration.length ? [...withDuration].sort((a, b) => Number(a.duration_hours) - Number(b.duration_hours))[0] : null;
    const slowest = withDuration.length ? [...withDuration].sort((a, b) => Number(b.duration_hours) - Number(a.duration_hours))[0] : null;
    return { topBeer, lowestLoss, highestLoss, fastest, slowest };
  }, [detailResults, tankCycles]);

  function exportDetailExcel() {
    const rows = detailResultsSorted.map((r) => ({
      beer_name: r.beer_name, package_label: r.package_label,
      ...Object.fromEntries(ACTIVITY_SOURCES.map((s) => [s.key, r.qtyBySource[s.key]])),
      totalQty: r.totalQty, totalLiters: Math.round(r.totalLiters),
    }));
    const headers = ['Pivo', 'Obal', ...ACTIVITY_SOURCES.map((s) => s.label), 'Celkem ks', 'Celkem litrů'];
    const keys = ['beer_name', 'package_label', ...ACTIVITY_SOURCES.map((s) => s.key), 'totalQty', 'totalLiters'];
    exportHistoryDetailToExcel(rows, headers, keys, 'historie-podrobne-hledani.xlsx');
  }

  function exportCyclesExcel() {
    const rows = tankCyclesSorted.map((c) => ({
      tank_label: c.tank_label, beer_name: c.beer_name ?? '', initial_hl: (Number(c.initial_volume_l) / 100).toFixed(2),
      kegged_hl: (Number(c.kegged_volume_l) / 100).toFixed(2), keg_count: c.keg_count,
      loss_l: Number(c.loss_l).toFixed(1), loss_pct: Number(c.loss_pct).toFixed(1),
      duration: fmtHoursShort(c.duration_hours), ended_at: new Date(c.ended_at).toLocaleDateString('cs-CZ'),
    }));
    exportHistoryDetailToExcel(
      rows,
      ['Tank', 'Pivo', 'Počáteční (hl)', 'Stočeno (hl)', 'Sudů', 'Ztráta (l)', 'Ztráta (%)', 'Doba', 'Ukončeno'],
      ['tank_label', 'beer_name', 'initial_hl', 'kegged_hl', 'keg_count', 'loss_l', 'loss_pct', 'duration', 'ended_at'],
      'historie-cykly-tanku.xlsx'
    );
  }

  function saveCurrentFilter() {
    const name = newFilterName.trim();
    if (!name) return;
    const f: SavedFilter = {
      name,
      selSources: [...selSources],
      selBeers: [...selBeers],
      selPackages: [...selPackages],
      dateFrom, dateTo,
    };
    const next = [...savedFilters.filter((x) => x.name !== name), f];
    setSavedFilters(next);
    localStorage.setItem('history_saved_filters', JSON.stringify(next));
    setNewFilterName('');
  }
  function applyFilter(f: SavedFilter) {
    setSelSources(new Set(f.selSources));
    setSelBeers(new Set(f.selBeers));
    setSelPackages(new Set(f.selPackages));
    setDateFrom(f.dateFrom);
    setDateTo(f.dateTo);
  }
  function deleteFilter(name: string) {
    const next = savedFilters.filter((x) => x.name !== name);
    setSavedFilters(next);
    localStorage.setItem('history_saved_filters', JSON.stringify(next));
  }

  const detailTotals = useMemo(() => {
    const bySource = Object.fromEntries(ACTIVITY_SOURCES.map((s) => [s.key, 0])) as Record<ActivitySourceKey, number>;
    let totalQty = 0, totalLiters = 0;
    detailResults.forEach((r) => {
      totalQty += r.totalQty;
      totalLiters += r.totalLiters;
      ACTIVITY_SOURCES.forEach((s) => { bySource[s.key] += r.qtyBySource[s.key]; });
    });
    return { bySource, totalQty, totalLiters };
  }, [detailResults]);

  const setQuickRange = (kind: 'week' | 'month' | 'year' | 'all') => {
    const today = todayISO();
    if (kind === 'week') { setDateFrom(addDaysISO(today, -6)); setDateTo(today); }
    else if (kind === 'month') { setDateFrom(startOfMonthISO(today)); setDateTo(today); }
    else if (kind === 'year') { setDateFrom(startOfYearISO(today)); setDateTo(today); }
    else { setDateFrom('2000-01-01'); setDateTo(today); }
  };

  // ---- Celkové KPI za aktuální rok ----
  const currentYear = new Date().getFullYear().toString();
  const yearData = useMemo(() => {
    const yearMonths = data.filter(d => d.month.startsWith(currentYear));
    return {
      totalBrewed: yearMonths.reduce((s, d) => s + d.brewed, 0),
      totalBottled: yearMonths.reduce((s, d) => s + d.bottled, 0),
      totalKegged: yearMonths.reduce((s, d) => s + d.kegged, 0),
      totalBrewedHl: yearMonths.reduce((s, d) => s + d.brewed_hl, 0),
      totalFasovani: yearMonths.reduce((s, d) => s + d.fasovani, 0),
      totalWriteoffs: yearMonths.reduce((s, d) => s + d.writeoffs, 0),
      totalOrdered: yearMonths.reduce((s, d) => s + d.ordered, 0),
      totalAkceRevenue: yearMonths.reduce((s, d) => s + d.akce_revenue, 0),
      totalAkceTaken: yearMonths.reduce((s, d) => s + d.akce_taken, 0),
      avgMonthlyBrewed: yearMonths.length > 0 ? Math.round(yearMonths.reduce((s, d) => s + d.brewed, 0) / yearMonths.length) : 0,
      monthCount: yearMonths.length,
    };
  }, [data, currentYear]);

  // ---- TOP piva za celé období ----
  const topBeersOverall = useMemo(() => {
    const m = new Map<string, { name: string; totalQty: number; totalHl: number }>();
    detailResults.forEach(r => {
      const key = r.beer_id ?? 'unknown';
      if (!m.has(key)) m.set(key, { name: r.beer_name, totalQty: 0, totalHl: 0 });
      const e = m.get(key)!;
      e.totalQty += r.totalQty;
      e.totalHl += r.totalLiters / 100;
    });
    return [...m.values()].sort((a, b) => b.totalQty - a.totalQty).slice(0, 10);
  }, [detailResults]);

  // ---- TOP obaly za celé období ----
  const topPackagesOverall = useMemo(() => {
    const m = new Map<string, { label: string; totalQty: number }>();
    detailResults.forEach(r => {
      const key = r.package_id ?? 'unknown';
      if (!m.has(key)) m.set(key, { label: r.package_label, totalQty: 0 });
      m.get(key)!.totalQty += r.totalQty;
    });
    return [...m.values()].sort((a, b) => b.totalQty - a.totalQty).slice(0, 10);
  }, [detailResults]);

  // ---- Celková ztrátovost tanků ----
  const totalTankStats = useMemo(() => {
    const totalInitial = tankCycles.reduce((s, c) => s + Number(c.initial_volume_l ?? 0), 0);
    const totalKegged = tankCycles.reduce((s, c) => s + Number(c.kegged_volume_l ?? 0), 0);
    const totalLoss = tankCycles.reduce((s, c) => s + Number(c.loss_l ?? 0), 0);
    const avgLossPct = totalInitial > 0 ? (totalLoss / totalInitial) * 100 : 0;
    const avgDuration = tankCycles.filter(c => c.duration_hours != null).reduce((s, c) => s + Number(c.duration_hours), 0) / (tankCycles.filter(c => c.duration_hours != null).length || 1);
    return { totalInitial, totalKegged, totalLoss, avgLossPct, avgDuration, cycleCount: tankCycles.length };
  }, [tankCycles]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 pb-12">
      {/* 🏆 GLOBÁLNÍ KPI DASHBOARD — aktuální rok */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <div className="rounded-2xl p-3 bg-white border-2 border-amber-300 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">Uvařeno {currentYear}</div>
          <div className="text-lg font-display font-black text-neutral-900">{yearData.totalBrewed} ks</div>
          <div className="text-[10px] font-bold text-neutral-500">{yearData.totalBrewedHl.toFixed(1)} hl</div>
        </div>
        <div className="rounded-2xl p-3 bg-white border-2 border-sky-300 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-sky-700">Lahve</div>
          <div className="text-lg font-display font-black text-neutral-900">{yearData.totalBottled} ks</div>
        </div>
        <div className="rounded-2xl p-3 bg-white border-2 border-amber-500 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-800">Sudy (KEG)</div>
          <div className="text-lg font-display font-black text-neutral-900">{yearData.totalKegged} ks</div>
        </div>
        <div className="rounded-2xl p-3 bg-white border-2 border-emerald-300 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Fasováno</div>
          <div className="text-lg font-display font-black text-neutral-900">{yearData.totalFasovani} ks</div>
        </div>
        <div className="rounded-2xl p-3 bg-white border-2 border-rose-300 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-rose-700">Odpisy</div>
          <div className="text-lg font-display font-black text-neutral-900">{yearData.totalWriteoffs} ks</div>
        </div>
        <div className="rounded-2xl p-3 bg-white border-2 border-violet-300 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-violet-700">Objednáno</div>
          <div className="text-lg font-display font-black text-neutral-900">{yearData.totalOrdered} ks</div>
        </div>
        <div className="rounded-2xl p-3 bg-white border-2 border-green-300 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-green-700">Tržby akce</div>
          <div className="text-lg font-display font-black text-neutral-900">{yearData.totalAkceRevenue.toLocaleString('cs-CZ')} Kč</div>
        </div>
        <div className="rounded-2xl p-3 bg-white border-2 border-neutral-300 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-neutral-600">Ø měsíčně</div>
          <div className="text-lg font-display font-black text-neutral-900">{yearData.avgMonthlyBrewed} ks</div>
          <div className="text-[10px] font-bold text-neutral-500">{yearData.monthCount} měsíců</div>
        </div>
      </div>

      {/* Top Header Navigation Tabs — přilepené nahoře (tlačítko tiskové
          uzávěrky je mimo přilepený pruh, ať má pruh pořád stejnou výšku a
          nepřekrývá se s filtry pod ním). Na mobilu kratší popisky, ať se
          vejde víc záložek na obrazovku a je míň nutné vodorovně scrollovat. */}
      <div className="sticky top-0 z-20 bg-neutral-100 pt-1 flex items-center gap-2 border-b border-neutral-200 pb-2">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-thin">
          <button
            onClick={() => selectTab('overview')}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'overview'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 scale-102'
                : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            <BarChart3 size={16} />
            <span>📊 <span className="sm:hidden">Přehledy</span><span className="hidden sm:inline">Měsíční přehledy & Porovnání</span></span>
          </button>

          <button
            onClick={() => selectTab('production')}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'production'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 scale-102'
                : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            <TrendingUp size={16} />
            <span>📈 <span className="sm:hidden">Výstav</span><span className="hidden sm:inline">Výstav (HL) & KEG/PET</span></span>
          </button>

          <button
            onClick={() => selectTab('detail')}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'detail'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 scale-102'
                : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            <Search size={16} />
            <span>🔍 <span className="sm:hidden">Hledání</span><span className="hidden sm:inline">Podrobné hledání & Filtry</span></span>
          </button>

          <button
            onClick={() => selectTab('cycles')}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'cycles'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 scale-102'
                : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            <Cylinder size={16} />
            <span>🏚️ <span className="sm:hidden">Cykly ({tankCycles.length})</span><span className="hidden sm:inline">Cykly tanků & Ztráty ({tankCycles.length})</span></span>
          </button>

          <button
            onClick={() => selectTab('stats')}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'stats'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 scale-102'
                : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            <Trophy size={16} />
            <span>🏆 TOP Žebříčky</span>
          </button>

          <button
            onClick={() => selectTab('orders')}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'orders'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 scale-102'
                : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            <ShoppingCart size={16} />
            <span>📦 <span className="sm:hidden">Objednávky</span><span className="hidden sm:inline">Přehled objednávek</span></span>
          </button>

          <button
            onClick={() => selectTab('deliveries')}
            className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'deliveries'
                ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 scale-102'
                : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
            }`}
          >
            <Truck size={16} />
            <span>🚚 <span className="sm:hidden">Trasy</span><span className="hidden sm:inline">Historie a přehled tras</span></span>
          </button>
        </div>
      </div>

      {/* 🖨️ Tlačítko tiskové uzávěrky pro sládka — schválně mimo přilepený
          pruh záložek výše, ať má ten pruh stálou výšku. */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowPrintModal(true)}
          className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-amber-300 font-black text-xs transition shadow-md flex items-center gap-1.5 shrink-0"
        >
          <Printer size={16} />
          <span>🖨️ <span className="sm:hidden">Uzávěrka</span><span className="hidden sm:inline">Měsíční uzávěrka (PDF/Tisk)</span></span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & MONTHLY COMPARISON */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="card sticky top-[48px] sm:top-[56px] z-10 p-4 flex flex-wrap items-end gap-3 bg-white border border-neutral-200 shadow-sm">
            <div className="flex-1 min-w-[180px]">
              <label className="label">Pivo</label>
              <select className="input" value={beerFilter} onChange={(e) => setBeerFilter(e.target.value)}>
                <option value="">Všechna piva</option>
                {beers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.degree ? ` (${b.degree})` : ''}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="label">Obal</label>
              <select className="input" value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)}>
                <option value="">Všechny obaly</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.volume_l} L</option>)}
              </select>
            </div>
            {(beerFilter || packageFilter) && (
              <button className="btn-ghost !py-2 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200" onClick={() => { setBeerFilter(''); setPackageFilter(''); }}>Zrušit filtr</button>
            )}
          </div>

          {/* Month chips */}
          <div className="flex flex-wrap gap-2">
            {filteredData.map((d) => (
              <button
                key={d.month}
                onClick={() => toggleMonth(d.month)}
                className={`px-3.5 py-1.5 rounded-2xl text-xs font-black transition-all ${
                  selectedMonths.includes(d.month)
                    ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-300 scale-105'
                    : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-amber-50'
                }`}
              >
                {monthLabel(d.month)}
              </button>
            ))}
          </div>

          {/* Comparison cards + YoY Analytics */}
          {filteredSelected.length === 0 ? (
            <div className="card p-12 text-center text-neutral-500 bg-white">Vyber měsíce pro porovnání{beerFilter || packageFilter ? ' (žádná data neodpovídá filtru)' : '.'}</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredSelected.map((d) => {
                // YoY Výpočet (minulý rok stejný měsíc)
                const [currY, currMo] = d.month.split('-');
                const prevYearMonth = `${Number(currY) - 1}-${currMo}`;
                const prevMonthData = data.find((x) => x.month === prevYearMonth);

                const yoyBrewedDiff = prevMonthData ? d.brewed - prevMonthData.brewed : null;
                const yoyBrewedPct = prevMonthData && prevMonthData.brewed > 0 ? ((yoyBrewedDiff! / prevMonthData.brewed) * 100).toFixed(1) : null;

                const yoyFasovaniDiff = prevMonthData ? d.fasovani - prevMonthData.fasovani : null;
                const yoyFasovaniPct = prevMonthData && prevMonthData.fasovani > 0 ? ((yoyFasovaniDiff! / prevMonthData.fasovani) * 100).toFixed(1) : null;

                // Poměry Stáčení KEG vs Lahve
                const totalStaceno = d.kegged + d.bottled;
                const keggedPct = totalStaceno > 0 ? Math.round((d.kegged / totalStaceno) * 100) : 0;
                const bottledPct = totalStaceno > 0 ? Math.round((d.bottled / totalStaceno) * 100) : 0;

                return (
                  <div key={d.month} className="card p-5 bg-white border border-neutral-200 rounded-3xl shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                      <h3 className="font-display font-black text-xl text-neutral-900">{monthLabel(d.month)}</h3>
                      {prevMonthData && (
                        <div className="flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1 rounded-xl bg-neutral-900 text-amber-300">
                          <TrendingUp size={14} />
                          <span>YoY porovnáno s {monthLabel(prevYearMonth)}</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <Stat label="Stočeno" value={d.brewed} icon="🍺" tone="amber" />
                      <Stat label="Lahve" value={d.bottled} icon="🍾" />
                      <Stat label="Sudy" value={d.kegged} icon="🛢️" tone="amber" />
                      <div className="col-span-2 sm:col-span-4 rounded-2xl p-3 border shadow-2xs bg-white">
                        <div className="flex items-center gap-1.5 mb-1"><span className="w-6 h-6 rounded-lg grid place-items-center text-xs font-bold border text-amber-900 bg-amber-100/80 border-amber-300">💧</span><span className="text-[10px] font-black uppercase tracking-wider text-neutral-600 truncate">Stočeno celkem (hl)</span></div>
                        <div className="text-base font-display font-black text-neutral-900">{d.brewed_hl.toFixed(2)} hl</div>
                      </div>
                      <Stat label="Fasování" value={d.fasovani} icon="📦" />
                      <Stat label="Odpisy" value={d.writeoffs} icon="📉" tone="danger" />
                      <Stat label="Objednáno" value={d.ordered} icon="🧾" tone="amber" />
                      <Stat label="Akce odvezeno" value={d.akce_taken} icon="🎪" tone="warning" />
                      <Stat label="Akce vráceno" value={d.akce_returned} icon="↩️" tone="success" />
                    </div>

                    {/* 📦 KONKRÉTNÍ ROZPAS STOČENÝCH OBALŮ: 50, 30, 20, 15, 10, 1.5, 1, 0.5, 0.33 */}
                    {(() => {
                      const kegQtyMap: Record<number, number> = {};
                      const bottleQtyMap: Record<number, number> = {};
                      packages.forEach((pkg) => {
                        const qty = d.byPackage[pkg.id] || 0;
                        if (!qty) return;
                        const vol = Number(pkg.volume_l);
                        if (pkg.kind === 'keg') kegQtyMap[vol] = (kegQtyMap[vol] || 0) + qty;
                        else bottleQtyMap[vol] = (bottleQtyMap[vol] || 0) + qty;
                      });

                      return (
                        <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 shadow-2xs space-y-3">
                          <div className="text-xs font-black text-amber-950 flex items-center justify-between">
                            <span className="flex items-center gap-1.5 font-display">📦 Konkrétní stočené obaly</span>
                            <span className="text-xs font-mono font-black text-amber-800">Celkem: {d.brewed} ks</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* KEG Sudy */}
                            <div className="p-2.5 rounded-xl bg-white border border-amber-300 shadow-2xs space-y-1.5">
                              <div className="text-[10px] font-black uppercase text-amber-900 flex items-center justify-between border-b border-amber-100 pb-1">
                                <span>🛢️ KEG Sudy</span>
                                <span className="font-mono text-amber-800">{d.kegged} ks</span>
                              </div>
                              <div className="grid grid-cols-5 gap-1 text-center">
                                {[50, 30, 20, 15, 10].map((v) => {
                                  const qty = kegQtyMap[v] || 0;
                                  return (
                                    <div key={v} className={`p-1 rounded-lg border transition-all ${qty > 0 ? 'bg-amber-100/90 border-amber-400 text-amber-950 font-black shadow-2xs' : 'bg-neutral-50/80 border-neutral-200 text-neutral-400'}`}>
                                      <div className="text-[8px] font-black uppercase text-neutral-500">{v} L</div>
                                      <div className="font-mono text-[11px] font-black">{qty}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Lahve */}
                            <div className="p-2.5 rounded-xl bg-white border border-sky-300 shadow-2xs space-y-1.5">
                              <div className="text-[10px] font-black uppercase text-sky-900 flex items-center justify-between border-b border-sky-100 pb-1">
                                <span>🍾 Lahve / PET</span>
                                <span className="font-mono text-sky-800">{d.bottled} ks</span>
                              </div>
                              <div className="grid grid-cols-4 gap-1 text-center">
                                {[1.5, 1.0, 0.5, 0.33].map((v) => {
                                  const qty = bottleQtyMap[v] || 0;
                                  return (
                                    <div key={v} className={`p-1 rounded-lg border transition-all ${qty > 0 ? 'bg-sky-100/90 border-sky-400 text-sky-950 font-black shadow-2xs' : 'bg-neutral-50/80 border-neutral-200 text-neutral-400'}`}>
                                      <div className="text-[8px] font-black uppercase text-neutral-500">{v === 1 ? '1 L' : `${v} L`}</div>
                                      <div className="font-mono text-[11px] font-black">{qty}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {Object.keys(d.byBeerHl).length > 0 && (
                      <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-2">
                        <div className="text-xs font-black text-neutral-900">Rozpis stočených hl podle piva:</div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(d.byBeerHl).sort((a, b) => b[1] - a[1]).map(([beerId, hl]) => (
                            <div key={beerId} className="px-2.5 py-1 rounded-xl bg-white border border-neutral-200 text-xs font-bold shadow-2xs">
                              {beerName(beerId)}: <strong className="font-mono text-amber-700">{(hl / 100).toFixed(2)} hl</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Vizuální rozpad Stáčení: KEG vs Lahve */}
                    {totalStaceno > 0 && (
                      <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-2">
                        <div className="flex items-center justify-between text-xs font-black text-neutral-900">
                          <span className="flex items-center gap-1.5"><PieChartIcon size={14} className="text-amber-600" /> Poměr stáčení sudů a lahví</span>
                          <span>🛢️ {keggedPct}% Sudy vs 🍾 {bottledPct}% Lahve</span>
                        </div>
                        <div className="w-full h-3 bg-neutral-200 rounded-full overflow-hidden flex">
                          <div className="bg-amber-500 h-full transition-all" style={{ width: `${keggedPct}%` }} title={`KEG sudy: ${d.kegged} ks (${keggedPct}%)`} />
                          <div className="bg-sky-500 h-full transition-all" style={{ width: `${bottledPct}%` }} title={`Lahve: ${d.bottled} ks (${bottledPct}%)`} />
                        </div>
                      </div>
                    )}

                    {/* YoY Porovnání s minulým rokem */}
                    {prevMonthData && (
                      <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-1 text-xs">
                        <span className="font-extrabold text-amber-950 block">📅 Vývoj oproti minulému roku ({monthLabel(prevYearMonth)}):</span>
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-amber-200">
                            <span className="text-neutral-600 font-bold">Stáčení hl:</span>
                            <span className={`font-black ${yoyBrewedDiff! >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {yoyBrewedDiff! >= 0 ? `+${yoyBrewedDiff}` : yoyBrewedDiff} ks ({yoyBrewedPct != null ? `${yoyBrewedPct}%` : '—'})
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-amber-200">
                            <span className="text-neutral-600 font-bold">Fasování:</span>
                            <span className={`font-black ${yoyFasovaniDiff! >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                              {yoyFasovaniDiff! >= 0 ? `+${yoyFasovaniDiff}` : yoyFasovaniDiff} ks ({yoyFasovaniPct != null ? `${yoyFasovaniPct}%` : '—'})
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Ztráty: Stočeno (KEG) vs Fasováno/Objednáno */}
                    {d.kegged > 0 && (
                      <div className="p-3.5 rounded-2xl bg-rose-50/80 border border-rose-200 space-y-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="w-6 h-6 rounded-lg grid place-items-center text-xs font-bold border text-rose-900 bg-rose-100/80 border-rose-300">📊</span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-rose-800">Ztráty KEG</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2 rounded-xl bg-white border border-rose-200">
                            <span className="block text-[10px] font-bold text-neutral-500">Stočeno KEG (hl)</span>
                            <span className="font-black text-neutral-900">{(d.kegHl).toFixed(2)} hl</span>
                          </div>
                          <div className="p-2 rounded-xl bg-white border border-rose-200">
                            <span className="block text-[10px] font-bold text-neutral-500">Fasováno (ks)</span>
                            <span className="font-black text-neutral-900">{d.fasovani} ks</span>
                          </div>
                          <div className="p-2 rounded-xl bg-white border border-rose-200">
                            <span className="block text-[10px] font-bold text-neutral-500">Objednáno (ks)</span>
                            <span className="font-black text-neutral-900">{d.ordered} ks</span>
                          </div>
                          <div className="p-2 rounded-xl bg-white border border-rose-200">
                            <span className="block text-[10px] font-bold text-neutral-500">Odpisy (ks)</span>
                            <span className="font-black text-rose-700">{d.writeoffs} ks</span>
                          </div>
                        </div>
                        {(() => {
                          const rozdil = d.kegged - d.fasovani - d.writeoffs;
                          const rozdilPct = d.kegged > 0 ? ((rozdil / d.kegged) * 100) : 0;
                          return (
                            <div className={`p-2 rounded-xl border text-xs font-bold flex items-center justify-between ${rozdil > 0 ? 'bg-rose-100 border-rose-300 text-rose-800' : 'bg-emerald-100 border-emerald-300 text-emerald-800'}`}>
                              <span>{rozdil > 0 ? '⚠️ Nerozpočteno (ztráta)' : '✅ Vše pokryto'}</span>
                              <span className="font-mono font-black">{rozdil} ks ({rozdilPct.toFixed(1)}%)</span>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {d.akce_revenue > 0 && (
                      <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                        <span className="text-xs text-neutral-600 font-bold">💰 Vyděláno na akcích</span>
                        <span className="font-display font-black text-emerald-700 text-base">{d.akce_revenue.toLocaleString('cs-CZ')} Kč</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bar chart */}
          {filteredData.length > 0 && (
            <div className="card p-6 bg-white border border-neutral-200 rounded-3xl space-y-4 shadow-xs">
              <h3 className="font-display font-black text-lg text-neutral-900">Stočeno pivo — všechny měsíce{(beerFilter || packageFilter) ? ' (dle filtru)' : ''}</h3>
              <div className="space-y-2.5 relative">
                {filteredData.map((d) => (
                  <div key={d.month} className="flex items-center gap-3">
                    <div className="w-24 text-xs font-extrabold text-neutral-700 shrink-0">{monthLabel(d.month)}</div>
                    <div className="flex-1 bg-neutral-100 rounded-xl h-8 overflow-hidden border border-neutral-200/80">
                      <div
                        className="bg-gradient-to-r from-amber-500 to-amber-600 h-full rounded-xl flex items-center justify-end pr-2.5 transition-all shadow-2xs"
                        style={{ width: `${Math.max((d.brewed / maxBrewedFiltered) * 100, 2)}%` }}
                      >
                        <span className="text-xs font-black text-neutral-950">{d.brewed} ks</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: VÝSTAV (HL) & KEG/PET */}
      {activeTab === 'production' && (
        <div className="space-y-6">
          {/* Volba období */}
          <div className="card sticky top-[48px] sm:top-[56px] z-10 p-4 bg-white border border-neutral-200 rounded-3xl flex flex-wrap items-end gap-3 shadow-sm">
            <div>
              <label className="label">Období</label>
              <div className="flex flex-wrap gap-1.5">
                {(['week', 'month', 'year', 'all'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setProdPeriod(p)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${
                      prodPeriod === p ? 'bg-white text-amber-900 shadow-xs ring-2 ring-amber-300' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                    }`}
                  >
                    {p === 'week' ? 'Týden' : p === 'month' ? 'Měsíc' : p === 'year' ? 'Rok' : 'Vše'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Od</label>
              <input type="date" value={prodCustomFrom} onChange={(e) => setProdCustomFrom(e.target.value)} className="input !py-1.5 text-xs font-mono font-bold" />
            </div>
            <div>
              <label className="label">Do</label>
              <input type="date" value={prodCustomTo} onChange={(e) => setProdCustomTo(e.target.value)} className="input !py-1.5 text-xs font-mono font-bold" />
            </div>
          </div>

          {/* Výpočet dat pro výstav */}
          {(() => {
            // Určení rozsahu dat podle zvoleného období
            const today = todayISO();
            let fromDate: string, toDate: string;
            if (prodPeriod === 'week') { fromDate = addDaysISO(today, -6); toDate = today; }
            else if (prodPeriod === 'month') { fromDate = startOfMonthISO(today); toDate = today; }
            else if (prodPeriod === 'year') { fromDate = startOfYearISO(today); toDate = today; }
            else { fromDate = '2000-01-01'; toDate = today; }
            // Použijeme custom rozsah pokud je zadán
            const effectiveFrom = prodCustomFrom || fromDate;
            const effectiveTo = prodCustomTo || toDate;

            // Filtrování měsíců v rozsahu
            const monthsInRange = data.filter(d => {
              const [y, m] = d.month.split('-').map(Number);
              const monthStart = `${y}-${String(m).padStart(2, '0')}-01`;
              const monthEnd = new Date(y, m, 0).toISOString().slice(0, 10);
              return monthEnd >= effectiveFrom && monthStart <= effectiveTo;
            });

            // Celkové součty
            const totalHl = monthsInRange.reduce((s, d) => s + d.brewed_hl, 0);
            const totalKegHl = monthsInRange.reduce((s, d) => s + d.kegHl, 0);
            const totalBottleHl = monthsInRange.reduce((s, d) => s + d.bottleHl, 0);
            const totalKegPct = totalHl > 0 ? (totalKegHl / totalHl) * 100 : 0;
            const totalBottlePct = totalHl > 0 ? (totalBottleHl / totalHl) * 100 : 0;

            // Rozpad podle piv (celkem HL)
            const beerHlMap = new Map<string, number>();
            monthsInRange.forEach(d => {
              Object.entries(d.byBeerHl).forEach(([beerId, hl]) => {
                beerHlMap.set(beerId, (beerHlMap.get(beerId) ?? 0) + hl);
              });
            });
            const beerHlList = [...beerHlMap.entries()]
              .map(([id, hl]) => ({ id, name: beerName(id), hl: hl / 100 }))
              .sort((a, b) => b.hl - a.hl);

            // Rozpad KEG podle piv
            const beerKegHlMap = new Map<string, number>();
            monthsInRange.forEach(d => {
              Object.entries(d.byBeerKegHl).forEach(([beerId, hl]) => {
                beerKegHlMap.set(beerId, (beerKegHlMap.get(beerId) ?? 0) + hl);
              });
            });
            const beerKegHlList = [...beerKegHlMap.entries()]
              .map(([id, hl]) => ({ id, name: beerName(id), hl: hl / 100 }))
              .sort((a, b) => b.hl - a.hl);

            // Rozpad PET/Lahve podle piv
            const beerBottleHlMap = new Map<string, number>();
            monthsInRange.forEach(d => {
              Object.entries(d.byBeerBottleHl).forEach(([beerId, hl]) => {
                beerBottleHlMap.set(beerId, (beerBottleHlMap.get(beerId) ?? 0) + hl);
              });
            });
            const beerBottleHlList = [...beerBottleHlMap.entries()]
              .map(([id, hl]) => ({ id, name: beerName(id), hl: hl / 100 }))
              .sort((a, b) => b.hl - a.hl);

            // Rozpad podle druhu obalu (keg/bottle)
            const kindHlMap = new Map<string, { ks: number; hl: number }>();
            monthsInRange.forEach(d => {
              Object.entries(d.byPackageKind).forEach(([kind, data]) => {
                const prev = kindHlMap.get(kind) ?? { ks: 0, hl: 0 };
                kindHlMap.set(kind, { ks: prev.ks + data.ks, hl: prev.hl + data.hl });
              });
            });

            const maxHl = Math.max(...beerHlList.map(b => b.hl), 1);

            return (
              <>
                {/* Hlavní KPI karty */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-2xl p-4 bg-white border-2 border-amber-300 shadow-xs">
                    <div className="text-[10px] font-black uppercase tracking-wider text-amber-700">Celkový výstav</div>
                    <div className="text-2xl font-display font-black text-neutral-900">{totalHl.toFixed(2)} hl</div>
                    <div className="text-[11px] font-bold text-neutral-500">{monthsInRange.reduce((s, d) => s + d.brewed, 0)} ks</div>
                  </div>
                  <div className="rounded-2xl p-4 bg-white border-2 border-amber-500 shadow-xs">
                    <div className="text-[10px] font-black uppercase tracking-wider text-amber-800">🛢️ KEG sudy</div>
                    <div className="text-2xl font-display font-black text-neutral-900">{totalKegHl.toFixed(2)} hl</div>
                    <div className="text-[11px] font-bold text-neutral-500">{totalKegPct.toFixed(1)}% z celku</div>
                  </div>
                  <div className="rounded-2xl p-4 bg-white border-2 border-sky-300 shadow-xs">
                    <div className="text-[10px] font-black uppercase tracking-wider text-sky-700">🍾 Lahve / PET</div>
                    <div className="text-2xl font-display font-black text-neutral-900">{totalBottleHl.toFixed(2)} hl</div>
                    <div className="text-[11px] font-bold text-neutral-500">{totalBottlePct.toFixed(1)}% z celku</div>
                  </div>
                  <div className="rounded-2xl p-4 bg-white border-2 border-neutral-300 shadow-xs">
                    <div className="text-[10px] font-black uppercase tracking-wider text-neutral-600">Počet měsíců</div>
                    <div className="text-2xl font-display font-black text-neutral-900">{monthsInRange.length}</div>
                    <div className="text-[11px] font-bold text-neutral-500">Ø {(totalHl / Math.max(monthsInRange.length, 1)).toFixed(2)} hl/měsíc</div>
                  </div>
                </div>

                {/* Vizuální poměr KEG vs Lahve */}
                <div className="card p-5 bg-white border border-neutral-200 rounded-3xl space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                      <PieChartIcon size={18} className="text-amber-600" />
                      <span>Poměr stáčení: KEG vs Lahve</span>
                    </h3>
                    <span className="text-xs font-black text-neutral-600">
                      🛢️ {totalKegPct.toFixed(1)}% KEG · 🍾 {totalBottlePct.toFixed(1)}% Lahve
                    </span>
                  </div>
                  <div className="w-full h-5 bg-neutral-200 rounded-full overflow-hidden flex shadow-inner">
                    <div
                      className="bg-gradient-to-r from-amber-600 to-amber-500 h-full transition-all flex items-center justify-center text-[10px] font-black text-white"
                      style={{ width: `${Math.max(totalKegPct, 2)}%` }}
                    >
                      {totalKegPct > 10 ? `${totalKegPct.toFixed(0)}%` : ''}
                    </div>
                    <div
                      className="bg-gradient-to-r from-sky-500 to-sky-400 h-full transition-all flex items-center justify-center text-[10px] font-black text-white"
                      style={{ width: `${Math.max(totalBottlePct, 2)}%` }}
                    >
                      {totalBottlePct > 10 ? `${totalBottlePct.toFixed(0)}%` : ''}
                    </div>
                  </div>
                  {/* 📦 KONKRÉTNÍ ROZPAS VŠECH OBALŮ PRO ZVOLENÉ OBDOBÍ */}
                  {(() => {
                    const rangeKegQtyMap: Record<number, number> = {};
                    const rangeBottleQtyMap: Record<number, number> = {};
                    monthsInRange.forEach((d) => {
                      packages.forEach((pkg) => {
                        const qty = d.byPackage[pkg.id] || 0;
                        if (!qty) return;
                        const vol = Number(pkg.volume_l);
                        if (pkg.kind === 'keg') rangeKegQtyMap[vol] = (rangeKegQtyMap[vol] || 0) + qty;
                        else rangeBottleQtyMap[vol] = (rangeBottleQtyMap[vol] || 0) + qty;
                      });
                    });
                    const totalKegCount = Object.values(rangeKegQtyMap).reduce((a, b) => a + b, 0);
                    const totalBottleCount = Object.values(rangeBottleQtyMap).reduce((a, b) => a + b, 0);

                    return (
                      <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-3 pt-3">
                        <div className="text-xs font-black text-amber-950 flex items-center justify-between border-b border-amber-200/60 pb-2">
                          <span className="flex items-center gap-1.5 font-display text-sm">📦 Konkrétní stočené obaly za vybrané období</span>
                          <span className="text-xs font-mono font-black text-amber-800">Celkem: {totalKegCount + totalBottleCount} ks</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* KEG Sudy */}
                          <div className="p-3 rounded-xl bg-white border border-amber-300 shadow-2xs space-y-2">
                            <div className="text-xs font-black uppercase text-amber-900 flex items-center justify-between border-b border-amber-100 pb-1">
                              <span>🛢️ KEG Sudy (50, 30, 20, 15, 10 L)</span>
                              <span className="font-mono text-amber-800">{totalKegCount} ks</span>
                            </div>
                            <div className="grid grid-cols-5 gap-1.5 text-center">
                              {[50, 30, 20, 15, 10].map((v) => {
                                const qty = rangeKegQtyMap[v] || 0;
                                return (
                                  <div key={v} className={`p-1.5 rounded-xl border transition-all ${qty > 0 ? 'bg-amber-100/90 border-amber-400 text-amber-950 font-black shadow-2xs' : 'bg-neutral-50/80 border-neutral-200 text-neutral-400'}`}>
                                    <div className="text-[9px] font-black uppercase text-neutral-600">{v} L</div>
                                    <div className="font-mono text-xs font-black">{qty}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Lahve */}
                          <div className="p-3 rounded-xl bg-white border border-sky-300 shadow-2xs space-y-2">
                            <div className="text-xs font-black uppercase text-sky-900 flex items-center justify-between border-b border-sky-100 pb-1">
                              <span>🍾 Lahve (1,5 / 1 / 0,5 / 0,33 L)</span>
                              <span className="font-mono text-sky-800">{totalBottleCount} ks</span>
                            </div>
                            <div className="grid grid-cols-4 gap-1.5 text-center">
                              {[1.5, 1.0, 0.5, 0.33].map((v) => {
                                const qty = rangeBottleQtyMap[v] || 0;
                                return (
                                  <div key={v} className={`p-1.5 rounded-xl border transition-all ${qty > 0 ? 'bg-sky-100/90 border-sky-400 text-sky-950 font-black shadow-2xs' : 'bg-neutral-50/80 border-neutral-200 text-neutral-400'}`}>
                                    <div className="text-[9px] font-black uppercase text-neutral-600">{v === 1 ? '1 L' : `${v} L`}</div>
                                    <div className="font-mono text-xs font-black">{qty}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Rozpad podle piv - celkem */}
                <div className="card p-5 bg-white border border-neutral-200 rounded-3xl space-y-3 shadow-xs">
                  <h3 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                    <BeerIcon size={18} className="text-amber-600" />
                    <span>Výstav podle piv (HL)</span>
                  </h3>
                  {beerHlList.length === 0 ? (
                    <div className="text-xs font-bold text-neutral-500 py-4 text-center">Žádná data v tomto období.</div>
                  ) : (
                    <div className="space-y-2">
                      {beerHlList.map((b) => {
                        const beer = beers.find(be => be.id === b.id);
                        const bg = beer ? beerBg(beer) : '#fef3c7';
                        return (
                          <div key={b.id} className="flex items-center gap-3">
                            <div className="w-32 text-xs font-extrabold text-neutral-700 shrink-0 truncate">{b.name}</div>
                            <div className="flex-1 bg-neutral-100 rounded-xl h-7 overflow-hidden border border-neutral-200/80">
                              <div
                                className="h-full rounded-xl flex items-center justify-end pr-2.5 transition-all shadow-2xs"
                                style={{ width: `${Math.max((b.hl / maxHl) * 100, 2)}%`, backgroundColor: bg }}
                              >
                                <span className="text-[11px] font-black text-neutral-950">{b.hl.toFixed(2)} hl</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Rozpad KEG podle piv */}
                <div className="card p-5 bg-white border border-neutral-200 rounded-3xl space-y-3 shadow-xs">
                  <h3 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                    <span>🛢️</span>
                    <span>Výstav KEG podle piv (HL)</span>
                  </h3>
                  {beerKegHlList.length === 0 ? (
                    <div className="text-xs font-bold text-neutral-500 py-4 text-center">Žádná KEG data v tomto období.</div>
                  ) : (
                    <div className="space-y-2">
                      {beerKegHlList.map((b) => {
                        const beer = beers.find(be => be.id === b.id);
                        const bg = beer ? beerBg(beer) : '#fef3c7';
                        return (
                          <div key={b.id} className="flex items-center gap-3">
                            <div className="w-32 text-xs font-extrabold text-neutral-700 shrink-0 truncate">{b.name}</div>
                            <div className="flex-1 bg-neutral-100 rounded-xl h-7 overflow-hidden border border-neutral-200/80">
                              <div
                                className="h-full rounded-xl flex items-center justify-end pr-2.5 transition-all shadow-2xs"
                                style={{ width: `${Math.max((b.hl / Math.max(...beerKegHlList.map(x => x.hl), 1)) * 100, 2)}%`, backgroundColor: bg }}
                              >
                                <span className="text-[11px] font-black text-neutral-950">{b.hl.toFixed(2)} hl</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Rozpad Lahve/PET podle piv */}
                <div className="card p-5 bg-white border border-neutral-200 rounded-3xl space-y-3 shadow-xs">
                  <h3 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                    <span>🍾</span>
                    <span>Výstav lahví/PET podle piv (HL)</span>
                  </h3>
                  {beerBottleHlList.length === 0 ? (
                    <div className="text-xs font-bold text-neutral-500 py-4 text-center">Žádná data lahví/PET v tomto období.</div>
                  ) : (
                    <div className="space-y-2">
                      {beerBottleHlList.map((b) => {
                        const beer = beers.find(be => be.id === b.id);
                        const bg = beer ? beerBg(beer) : '#fef3c7';
                        return (
                          <div key={b.id} className="flex items-center gap-3">
                            <div className="w-32 text-xs font-extrabold text-neutral-700 shrink-0 truncate">{b.name}</div>
                            <div className="flex-1 bg-neutral-100 rounded-xl h-7 overflow-hidden border border-neutral-200/80">
                              <div
                                className="h-full rounded-xl flex items-center justify-end pr-2.5 transition-all shadow-2xs"
                                style={{ width: `${Math.max((b.hl / Math.max(...beerBottleHlList.map(x => x.hl), 1)) * 100, 2)}%`, backgroundColor: bg }}
                              >
                                <span className="text-[11px] font-black text-neutral-950">{b.hl.toFixed(2)} hl</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Měsíční vývojový graf */}
                <div className="card p-5 bg-white border border-neutral-200 rounded-3xl space-y-3 shadow-xs">
                  <h3 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                    <TrendingUp size={18} className="text-amber-600" />
                    <span>Měsíční vývoj výstavu (HL)</span>
                  </h3>
                  <div className="space-y-2">
                    {monthsInRange.map((d) => {
                      const maxHlInRange = Math.max(...monthsInRange.map(x => x.brewed_hl), 1);
                      return (
                        <div key={d.month} className="flex items-center gap-3">
                          <div className="w-20 text-xs font-extrabold text-neutral-700 shrink-0">{monthLabel(d.month)}</div>
                          <div className="flex-1 bg-neutral-100 rounded-xl h-7 overflow-hidden border border-neutral-200/80">
                            <div
                              className="bg-gradient-to-r from-amber-500 to-amber-600 h-full rounded-xl flex items-center justify-end pr-2.5 transition-all shadow-2xs"
                              style={{ width: `${Math.max((d.brewed_hl / maxHlInRange) * 100, 2)}%` }}
                            >
                              <span className="text-[11px] font-black text-neutral-950">{d.brewed_hl.toFixed(2)} hl</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* TAB 3: PODROBNÉ HLEDÁNÍ & FILTRY */}
      {activeTab === 'detail' && (
        <div className="space-y-6">
          <div className="card p-5 bg-white border border-neutral-200 rounded-3xl space-y-5 shadow-xs">
            {/* Uložené oblíbené filtry */}
            <div className="rounded-2xl border border-amber-300/80 bg-amber-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                  <span>⭐ Uložené filtry</span>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {savedFilters.length === 0 && <span className="text-xs text-neutral-500">Zatím žádné uložené filtry.</span>}
                {savedFilters.map((f) => (
                  <span key={f.name} className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-950 text-xs font-bold shadow-2xs flex items-center gap-2">
                    <button type="button" className="hover:underline" onClick={() => applyFilter(f)}>{f.name}</button>
                    <button type="button" className="text-rose-600 hover:text-rose-800 font-bold" onClick={() => deleteFilter(f.name)}>✕</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="input !py-1.5 text-xs font-semibold flex-1" placeholder="Název filtru (např. 12° lahve za tento měsíc)" value={newFilterName} onChange={(e) => setNewFilterName(e.target.value)} />
                <button type="button" className="px-3.5 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-amber-300 font-black text-xs shadow-xs" onClick={saveCurrentFilter}>💾 Uložit aktuální</button>
              </div>
            </div>

            {/* Zdroje aktivit + Date range — přilepené nahoře, ať jde měnit
                filtr i uprostřed prohlížení výsledků dole. */}
            <div className="sticky top-[48px] sm:top-[56px] z-10 bg-white space-y-3 py-1 -mx-5 px-5">
              <div>
                <label className="label mb-2">Aktivita / zdroj dat</label>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_SOURCES.map((s) => {
                    const active = selSources.has(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setSelSources((set) => toggleSet(set, s.key))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition ${active ? 'bg-white text-amber-900 shadow-2xs ring-2 ring-amber-300' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                      >
                        {s.icon} {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date range */}
              <div className="flex flex-wrap items-end gap-3 bg-neutral-50 p-3.5 rounded-2xl border border-neutral-200">
                <div>
                  <label className="block text-[11px] font-black uppercase text-neutral-600 mb-1">Od</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input !py-1.5 text-xs font-mono font-bold" />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase text-neutral-600 mb-1">Do</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input !py-1.5 text-xs font-mono font-bold" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button className="px-2.5 py-1.5 rounded-xl bg-white border border-neutral-300 text-xs font-bold" onClick={() => setQuickRange('week')}>Týden</button>
                  <button className="px-2.5 py-1.5 rounded-xl bg-white border border-neutral-300 text-xs font-bold" onClick={() => setQuickRange('month')}>Měsíc</button>
                  <button className="px-2.5 py-1.5 rounded-xl bg-white border border-neutral-300 text-xs font-bold" onClick={() => setQuickRange('year')}>Rok</button>
                  <button className="px-2.5 py-1.5 rounded-xl bg-white border border-neutral-300 text-xs font-bold" onClick={() => setQuickRange('all')}>Vše</button>
                </div>
              </div>
            </div>

            {/* Souhrn výsledků */}
            <div className="rounded-3xl bg-neutral-900 text-white p-5 flex flex-wrap items-center justify-between gap-6 shadow-md">
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-amber-400 font-extrabold">Celkem kusů</div>
                  <div className="font-display font-black text-2xl sm:text-3xl text-white">{detailTotals.totalQty.toLocaleString('cs-CZ')}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-amber-400 font-extrabold">Celkem litrů</div>
                  <div className="font-display font-black text-2xl sm:text-3xl text-white">{detailTotals.totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} l</div>
                </div>
              </div>
              <button
                type="button"
                onClick={exportDetailExcel}
                className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition flex items-center gap-2"
              >
                <Download size={16} />
                <span>Exportovat do Excelu</span>
              </button>
            </div>

            {/* Detail results table */}
            {detailLoading ? (
              <Spinner />
            ) : detailResults.length === 0 ? (
              <div className="p-8 text-center text-xs font-bold text-neutral-500">Žádné výsledky pro zvolené filtry.</div>
            ) : (
              <>
              {/* Mobilní karty */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {detailResultsSorted.map((r) => {
                  const beer = beers.find((b) => b.id === r.beer_id);
                  const matchingOrderIds = new Set(
                    delOrders
                      .filter(o => o.status !== 'storno')
                      .filter(o => (delItems[o.id] ?? []).some(i => i.beer_id === r.beer_id && i.package_id === r.package_id))
                      .map(o => o.id)
                  );
                  const hasOrders = matchingOrderIds.size > 0;
                  return (
                    <div
                      key={`${r.beer_id}__${r.package_id}`}
                      className={`rounded-2xl bg-white border-2 p-3 space-y-1.5 ${hasOrders ? 'cursor-pointer' : ''}`}
                      style={{ borderColor: beer ? beerBorder(beer) : '#e5e7eb' }}
                      onClick={() => { if (hasOrders) openEditOrder([...matchingOrderIds][0]); }}
                    >
                      <div className="flex items-center justify-between gap-2 font-black text-sm text-neutral-950">
                        <span>{r.beer_name} <span className="font-bold opacity-80">· {formatPackageLabel(r.package_label)}</span></span>
                        <span className="shrink-0 font-mono text-sm">{r.totalQty} ks</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-bold text-neutral-700">
                        {ACTIVITY_SOURCES.filter((s) => selSources.has(s.key)).map((s) => (
                          <span key={s.key}>{s.icon} {r.qtyBySource[s.key] || 0}</span>
                        ))}
                        <span>· {r.totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} l</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto scrollbar-thin">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th className="cursor-pointer select-none" onClick={() => onSortDetail('beer_name')}>Pivo<SortIcon active={detailSortKey === 'beer_name'} dir={detailSortDir} /></th>
                      <th className="cursor-pointer select-none" onClick={() => onSortDetail('package_label')}>Obal<SortIcon active={detailSortKey === 'package_label'} dir={detailSortDir} /></th>
                      {ACTIVITY_SOURCES.filter((s) => selSources.has(s.key)).map((s) => (
                        <th key={s.key} className="text-right">{s.icon} {s.label}</th>
                      ))}
                      <th className="text-right cursor-pointer select-none" onClick={() => onSortDetail('totalQty')}>Celkem<SortIcon active={detailSortKey === 'totalQty'} dir={detailSortDir} /></th>
                      <th className="text-right cursor-pointer select-none" onClick={() => onSortDetail('totalLiters')}>Litrů<SortIcon active={detailSortKey === 'totalLiters'} dir={detailSortDir} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailResultsSorted.map((r) => {
                      const beer = beers.find((b) => b.id === r.beer_id);
                      // Najdeme objednávky obsahující toto pivo+obal
                      const matchingOrderIds = new Set(
                        delOrders
                          .filter(o => o.status !== 'storno')
                          .filter(o => {
                            const oItems = delItems[o.id] ?? [];
                            return oItems.some(i => i.beer_id === r.beer_id && i.package_id === r.package_id);
                          })
                          .map(o => o.id)
                      );
                      const hasOrders = matchingOrderIds.size > 0;
                      return (
                        <tr
                          key={`${r.beer_id}__${r.package_id}`}
                          className={`transition-colors bg-white ${hasOrders ? 'cursor-pointer hover:bg-neutral-50' : 'hover:bg-neutral-50/60'}`}
                          style={{ borderLeft: `4px solid ${beer ? beerBorder(beer) : '#e5e7eb'}` }}
                          onClick={() => {
                            if (hasOrders) {
                              const firstOrderId = [...matchingOrderIds][0];
                              openEditOrder(firstOrderId);
                            }
                          }}
                          title={hasOrders ? 'Kliknutím upravíte objednávku' : undefined}
                        >
                          <td className="font-black text-[11px] text-neutral-950">{r.beer_name}</td>
                          <td className="font-extrabold text-neutral-950 text-[11px]">{formatPackageLabel(r.package_label)}</td>
                          {ACTIVITY_SOURCES.filter((s) => selSources.has(s.key)).map((s) => (
                            <td key={s.key} className="text-right font-bold text-neutral-900 text-[11px]">{r.qtyBySource[s.key] || '—'}</td>
                          ))}
                          <td className="text-right font-mono font-black text-neutral-950 text-[11px]">{r.totalQty} ks</td>
                          <td className="text-right font-black text-neutral-900 text-[11px]">{r.totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} l</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CYKLY TANKŮ & DIAGNOSTIKA ZTRÁT */}
      {activeTab === 'cycles' && (
        <div className="space-y-6">
          {/* Diagnostický přehled ztrát podle tanků */}
          <div className="card p-5 bg-white border border-neutral-200 rounded-3xl space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <ShieldAlert size={20} className="text-amber-600" />
                <span>Diagnostika průměrné ztrátovosti podle tanků</span>
              </h3>
              <span className="text-xs font-mono font-bold bg-neutral-100 px-3 py-1 rounded-xl text-neutral-600 border border-neutral-200">
                {tankLossDiagnostics.length} Tanků sledováno
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {tankLossDiagnostics.map((t) => {
                const isHighLoss = t.avgLossPct > 5.0;
                return (
                  <div
                    key={t.tank_label}
                    className={`p-3.5 rounded-2xl bg-white border-2 transition-all ${
                      isHighLoss ? 'border-rose-400' : 'border-neutral-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-base text-neutral-900">{t.tank_label}</span>
                      <span className={`font-mono font-black text-xs px-2 py-0.5 rounded-lg ${isHighLoss ? 'bg-rose-600 text-white' : 'bg-neutral-100 text-neutral-700'}`}>
                        {t.avgLossPct.toFixed(1)}% ztráta
                      </span>
                    </div>
                    <div className="text-[11px] text-neutral-500 flex justify-between">
                      <span>{t.count} cyklů</span>
                      <span>Celkem ztráta {t.totalLossL.toFixed(0)} l</span>
                    </div>
                    {isHighLoss && (
                      <div className="mt-2 text-[10px] font-bold text-rose-700 bg-rose-50 p-1.5 rounded-xl border border-rose-200">
                        ⚠️ Vyšší ztrátovost (kontrola hradícího ventilu & těsnění klapky)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-5 bg-white border border-neutral-200 rounded-3xl space-y-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <div>
                <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                  <Cylinder size={20} className="text-amber-600" />
                  <span>Detailní historie cyklů tanků</span>
                </h3>
                <p className="text-xs text-neutral-500 font-medium mt-0.5">Přehled stočeného objemu, sudů a procenta ztrát pro každý cyklus tanku</p>
              </div>
              <button
                type="button"
                onClick={exportCyclesExcel}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition flex items-center gap-1.5"
              >
                <Download size={15} />
                <span>Export cyklů</span>
              </button>
            </div>

            {tankCyclesLoading ? (
              <Spinner />
            ) : tankCycles.length === 0 ? (
              <div className="text-center text-xs font-bold text-neutral-500 py-8">Zatím žádné ukončené cykly tanků.</div>
            ) : (
              <>
              {/* Mobilní karty */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {tankCyclesSorted.map((c) => {
                  const beer = c.beer_name ? beers.find((b) => b.name === c.beer_name) : null;
                  const highLoss = Number(c.loss_pct) > 3;
                  return (
                    <div key={c.id} className="rounded-2xl bg-white border-2 p-3 space-y-1.5" style={{ borderColor: beer ? beerBorder(beer) : '#e5e7eb' }}>
                      <div className="flex items-center justify-between gap-2 font-black text-sm text-neutral-950">
                        <span>{c.tank_label} <span className="font-bold opacity-80">· {c.beer_name ?? '—'}</span></span>
                        <span className={`shrink-0 px-2 py-0.5 rounded-lg text-xs font-black ${highLoss ? 'bg-rose-600 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{Number(c.loss_pct).toFixed(1)}% ztráta</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-bold text-neutral-700">
                        <span>Poč. {(Number(c.initial_volume_l) / 100).toFixed(2)} hl</span>
                        <span>Stoč. {(Number(c.kegged_volume_l) / 100).toFixed(2)} hl</span>
                        <span>{c.keg_count} sudů</span>
                        <span>Ztr. {Number(c.loss_l).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} l</span>
                        <span>{fmtHoursShort(c.duration_hours)}</span>
                        <span>{new Date(c.ended_at).toLocaleDateString('cs-CZ')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto scrollbar-thin">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th className="cursor-pointer select-none" onClick={() => onSortCycle('tank_label')}>Tank<SortIcon active={cycleSortKey === 'tank_label'} dir={cycleSortDir} /></th>
                      <th className="cursor-pointer select-none" onClick={() => onSortCycle('beer_name')}>Pivo<SortIcon active={cycleSortKey === 'beer_name'} dir={cycleSortDir} /></th>
                      <th className="text-right cursor-pointer select-none" onClick={() => onSortCycle('initial_volume_l')}>Poč.<SortIcon active={cycleSortKey === 'initial_volume_l'} dir={cycleSortDir} /></th>
                      <th className="text-right cursor-pointer select-none" onClick={() => onSortCycle('kegged_volume_l')}>Stoč.<SortIcon active={cycleSortKey === 'kegged_volume_l'} dir={cycleSortDir} /></th>
                      <th className="text-right cursor-pointer select-none" onClick={() => onSortCycle('keg_count')}>Sudů<SortIcon active={cycleSortKey === 'keg_count'} dir={cycleSortDir} /></th>
                      <th className="text-right cursor-pointer select-none" onClick={() => onSortCycle('loss_l')}>Ztr.<SortIcon active={cycleSortKey === 'loss_l'} dir={cycleSortDir} /></th>
                      <th className="text-right cursor-pointer select-none" onClick={() => onSortCycle('loss_pct')}>Ztr.%<SortIcon active={cycleSortKey === 'loss_pct'} dir={cycleSortDir} /></th>
                      <th className="text-right cursor-pointer select-none" onClick={() => onSortCycle('duration_hours')}>Doba<SortIcon active={cycleSortKey === 'duration_hours'} dir={cycleSortDir} /></th>
                      <th className="cursor-pointer select-none" onClick={() => onSortCycle('ended_at')}>Konec<SortIcon active={cycleSortKey === 'ended_at'} dir={cycleSortDir} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tankCyclesSorted.map((c) => {
                      const beer = c.beer_name ? beers.find((b) => b.name === c.beer_name) : null;
                      return (
                        <tr key={c.id} className="hover:bg-neutral-50 transition-colors bg-white" style={{ borderLeft: `4px solid ${beer ? beerBorder(beer) : '#e5e7eb'}` }}>
                          <td className="font-black text-[11px] text-neutral-950">{c.tank_label}</td>
                          <td className="font-black text-[11px] text-neutral-950">{c.beer_name ?? '—'}</td>
                          <td className="text-right font-bold text-neutral-900 text-[11px]">{(Number(c.initial_volume_l) / 100).toFixed(2)} hl</td>
                          <td className="text-right font-black text-neutral-950 text-[11px]">{(Number(c.kegged_volume_l) / 100).toFixed(2)} hl</td>
                          <td className="text-right font-mono font-black text-neutral-950 text-[11px]">{c.keg_count} ks</td>
                          <td className={`text-right text-[11px] ${Number(c.loss_l) > 0 ? 'text-rose-700 font-black' : 'text-neutral-900 font-bold'}`}>{Number(c.loss_l).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} l</td>
                          <td className={`text-right text-[11px] ${Number(c.loss_pct) > 3 ? 'text-rose-700 font-black' : 'text-neutral-900 font-bold'}`}>{Number(c.loss_pct).toFixed(1)}%</td>
                          <td className="text-right text-neutral-900 font-bold text-[11px]">{fmtHoursShort(c.duration_hours)}</td>
                          <td className="text-neutral-900 font-bold whitespace-nowrap text-[11px]">{new Date(c.ended_at).toLocaleDateString('cs-CZ')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: TOP ŽEBRÍČKY & STATISTIKY */}
      {activeTab === 'stats' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {topStats.topBeer && (
            <div className="card p-5 bg-white border-2 border-amber-300 rounded-3xl space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <Trophy size={16} className="text-amber-600" />
                <span>Nejvíc stočené pivo</span>
              </div>
              <div className="font-display font-black text-xl text-neutral-900">{topStats.topBeer.beer_name}</div>
              <div className="text-xs font-bold text-neutral-600">{topStats.topBeer.totalQty} ks · {topStats.topBeer.package_label}</div>
            </div>
          )}

          {topStats.lowestLoss && (
            <div className="card p-5 bg-white border-2 border-emerald-300 rounded-3xl space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                <ArrowDownRight size={16} className="text-emerald-600" />
                <span>Nejnižší ztráta cyklu</span>
              </div>
              <div className="font-display font-black text-xl text-neutral-900">{topStats.lowestLoss.tank_label} — {topStats.lowestLoss.beer_name ?? '—'}</div>
              <div className="text-xs font-mono font-black text-emerald-700">{Number(topStats.lowestLoss.loss_pct).toFixed(1)}% ztráta</div>
            </div>
          )}

          {topStats.highestLoss && (
            <div className="card p-5 bg-white border-2 border-rose-300 rounded-3xl space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                <ArrowUpRight size={16} className="text-rose-600" />
                <span>Nejvyšší ztráta cyklu</span>
              </div>
              <div className="font-display font-black text-xl text-neutral-900">{topStats.highestLoss.tank_label} — {topStats.highestLoss.beer_name ?? '—'}</div>
              <div className="text-xs font-mono font-black text-rose-700">{Number(topStats.highestLoss.loss_pct).toFixed(1)}% ztráta</div>
            </div>
          )}

          {topStats.fastest && (
            <div className="card p-5 bg-white border-2 border-blue-300 rounded-3xl space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                <Zap size={16} className="text-blue-600" />
                <span>Nejrychlejší cyklus tanku</span>
              </div>
              <div className="font-display font-black text-xl text-neutral-900">{topStats.fastest.tank_label} — {topStats.fastest.beer_name ?? '—'}</div>
              <div className="text-xs font-mono font-black text-blue-700">{fmtHoursShort(topStats.fastest.duration_hours)}</div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: TÝDENNÍ PŘEHLED OBJEDNÁVEK */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <WeeklyOrderSummaryCard
            items={weeklyOrderItemsList}
            beers={beers}
            weekKey={ordWeekKey}
            onWeekChange={setOrdWeekKey}
            weekLabel={ordWr.label}
            title="Týdenní přehled objednávek"
            subtitle="Součet kusů z objednávek (bez storna) v daném týdnu — kliknutím na řádek upravíte objednávku"
            onItemClick={(beerId, packageId) => {
              // Najdeme objednávky v aktuálním týdnu, které obsahují toto pivo+obal
              const { start, end } = ordWr;
              const matchingOrders = delOrders
                .filter(o => o.status !== 'storno')
                .filter(o => { const target = o.delivery_date || o.order_date; const d = new Date(target + 'T00:00:00Z'); return d >= start && d <= end; })
                .filter(o => {
                  const oItems = delItems[o.id] ?? [];
                  return oItems.some(i => i.beer_id === beerId && i.package_id === packageId);
                });
              if (matchingOrders.length > 0) {
                openEditOrder(matchingOrders[0].id);
              }
            }}
          />
        </div>
      )}

      {/* TAB 6: HISTORIE A PŘEHLED TRAS (přesunuto z obrazovky Závoz) */}
      {activeTab === 'deliveries' && (
        <ZavozHistory />
      )}

      {/* 🖨️ MODAL PRO TISK MĚSÍČNÍ UZÁVĚRKY SLÁDKA */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <div>
                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-amber-600">Formátovaný protokol sládka</span>
                <h2 className="font-display font-black text-2xl text-neutral-900">Měsíční výrobně-skladová uzávěrka</h2>
                <p className="text-xs text-neutral-500 font-bold">Kynšperský pivovar s.r.o. — Výroba piva Zajíc</p>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="w-9 h-9 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-black grid place-items-center"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-neutral-800">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50 p-4 rounded-2xl border border-neutral-200">
                <div>
                  <span className="block text-[10px] uppercase font-black text-neutral-500">Měsíc uzávěrky</span>
                  <strong className="text-sm font-black text-neutral-900">{selectedMonths.length > 0 ? monthLabel(selectedMonths[0]) : 'Aktuální'}</strong>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-black text-neutral-500">Celkem stočeno</span>
                  <strong className="text-sm font-black text-neutral-900">{selected.reduce((sum, d) => sum + d.brewed, 0)} ks</strong>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-black text-neutral-500">Celkem fasováno</span>
                  <strong className="text-sm font-black text-neutral-900">{selected.reduce((sum, d) => sum + d.fasovani, 0)} ks</strong>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-black text-neutral-500">Datum tisku</span>
                  <strong className="text-sm font-black text-neutral-900">{new Date().toLocaleDateString('cs-CZ')}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-black text-sm text-neutral-900">Souhrn výroby a stáčení za měsíce:</h4>
                <table className="w-full border-collapse text-left border border-neutral-200">
                  <thead>
                    <tr className="bg-neutral-100 border-b border-neutral-200">
                      <th className="p-2 font-black">Měsíc</th>
                      <th className="p-2 font-black text-right">Stočeno celkem</th>
                      <th className="p-2 font-black text-right">Stočeno Sudy</th>
                      <th className="p-2 font-black text-right">Stočeno Lahve</th>
                      <th className="p-2 font-black text-right">Fasováno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map((d) => (
                      <tr key={d.month} className="border-b border-neutral-100 font-semibold">
                        <td className="p-2">{monthLabel(d.month)}</td>
                        <td className="p-2 text-right font-bold">{d.brewed} ks</td>
                        <td className="p-2 text-right">{d.kegged} ks</td>
                        <td className="p-2 text-right">{d.bottled} ks</td>
                        <td className="p-2 text-right">{d.fasovani} ks</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-8 border-t border-neutral-200 flex justify-between items-center text-xs font-bold text-neutral-600">
                <div>Podpis odpovědného sládka: ................................</div>
                <div>Schválil majitel: ................................</div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2.5 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold"
              >
                Zavřít
              </button>
              <button
                onClick={() => window.print()}
                className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md flex items-center gap-2"
              >
                <Printer size={16} />
                <span>Vytisknout / Uložit do PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ✎ MODAL PRO EDITACI OBJEDNÁVKY */}
      {editOrder && (
        <EditOrderModal
          order={editOrder}
          items={editItems}
          beers={beers}
          packages={packages}
          places={places}
          onClose={() => { setEditOrder(null); setEditItems([]); }}
          onSaved={() => { loadDeliveries(); }}
          onPlacesChanged={() => { loadDeliveries(); }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: string; tone?: string }) {
  const c = tone === 'amber' ? 'text-amber-900 bg-amber-100/80 border-amber-300'
    : tone === 'danger' ? 'text-rose-900 bg-rose-100/80 border-rose-300'
    : tone === 'success' ? 'text-emerald-900 bg-emerald-100/80 border-emerald-300'
    : tone === 'warning' ? 'text-amber-900 bg-amber-100/80 border-amber-300'
    : 'text-neutral-900 bg-neutral-100 border-neutral-200';
  return (
    <div className="rounded-2xl p-3 border shadow-2xs bg-white">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-6 h-6 rounded-lg grid place-items-center text-xs font-bold border ${c}`}>{icon}</span>
        <span className="text-[10px] font-black uppercase tracking-wider text-neutral-600 truncate">{label}</span>
      </div>
      <div className="text-base font-display font-black text-neutral-900">{value} ks</div>
    </div>
  );
}
