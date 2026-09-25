import { useEffect, useMemo, useState } from 'react';
import { Beer, beerBorder, fetchAllRows, formatPackageLabel, Package, Place, supabase, useRealtime } from '../lib/supabase';
import { Kostra, Spinner, EmptyState } from '../components/ui';
import { exportHistoryDetailToExcel } from '../lib/excel';

import { AlertTriangle, ChevronDown, ChevronUp, ArrowDownRight, ArrowUpRight, ChevronsUpDown, Download, Package as PackageIcon, Printer, Receipt, Save, Search, ShieldAlert, Snowflake, Star, Store, TrendingDown, TrendingUp, Trophy, Truck, X, Zap, type LucideIcon } from 'lucide-react';
import { EditOrderModal } from '../components/EditOrderModal';
import { TabBar, type TabBarItem } from '../components/TabBar';
import ZavozHistory from '../components/ZavozHistory';
import { IkonaLahev, IkonaSud } from '../components/ikony';
import StatistikaVystav from '../components/StatistikaVystav';
import type { Obdobi, VyrobniRadek } from '../lib/statistika';
import { kdoPrestalObjednavat, podilPodleObalu, rozsahObdobi, denObdobi, objednanoPoMesicich, prvniObjednavkaPodlePolozky } from '../lib/statistika';
import { rozpadSuduVCyklech, popisRozpaduSudu, type StaceniRadek } from '../lib/cyklyTanku';
import { usePosledniNacteni } from '../lib/nacitani';
import { useChovaniDialogu } from '../lib/zavriNaZpet';
import { businessDateISO } from '../lib/businessDate';
import { uloz } from '../lib/uloziste';
import { nactiSdilenouTabulku } from '../lib/sdilenaData';

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
// businessDateISO(), NE new Date().toISOString() (vždycky UTC) — jinak kolem
// půlnoci "dnešní" rozsah (týden/měsíc/rok) počítal s jiným dnem než reálně
// v Praze je. Stejná chyba jako u weekKey v Kegging.tsx.
function todayISO(): string { return businessDateISO(); }
function startOfYearISO(iso: string): string { return iso.slice(0, 4) + '-01-01'; }
function startOfMonthISO(iso: string): string { return iso.slice(0, 7) + '-01'; }
function addDaysISO(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ---- Detailní hledání: definice zdrojů aktivit ----
type ActivitySourceKey = 'bottling' | 'kegging' | 'fasovani' | 'fasovani_private' | 'writeoffs' | 'order_items';
const ACTIVITY_SOURCES: { key: ActivitySourceKey; label: string; icon: LucideIcon; dateField: 'entry_date' | 'order_date'; hasVolume: boolean }[] = [
  { key: 'bottling', label: 'Stáčení lahví', icon: IkonaLahev, dateField: 'entry_date', hasVolume: true },
  { key: 'kegging', label: 'Stáčení kegů', icon: IkonaSud, dateField: 'entry_date', hasVolume: true },
  { key: 'fasovani', label: 'Fasování', icon: PackageIcon, dateField: 'entry_date', hasVolume: true },
  { key: 'fasovani_private', label: 'Prodejna', icon: Store, dateField: 'entry_date', hasVolume: true },
  { key: 'writeoffs', label: 'Odpisy', icon: TrendingDown, dateField: 'entry_date', hasVolume: true },
  { key: 'order_items', label: 'Objednávky', icon: Receipt, dateField: 'order_date', hasVolume: true },
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
  /** Tank, kterému cyklus patří — podle něj se k cyklu dohledá stáčení. */
  tank_id: string | null;
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

/** Popis období pro nadpis karty v žebříčcích — bere se z volby na Výstavu. */
const POPIS_OBDOBI_ZEBRICEK: Record<Obdobi, string> = {
  tyden: 'tento týden', mesic: 'tento měsíc', rok: 'letos', vse: 'za celou dobu',
};

function fmtHoursShort(h: number | null | undefined): string {
  if (h == null) return '—';
  if (h < 24) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} dní`;
}

type SortDir = 'asc' | 'desc';
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown size={14} className="inline text-neutral-300 ml-1" />;
  const Sipka = dir === 'asc' ? ChevronUp : ChevronDown;
  return <Sipka size={14} className="inline text-neutral-900 ml-1" />;
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

// „Objednávky" (týdenní součet kusů podle piva a obalu) se zrušila 25. 9. 2026
// — ukazovala totéž co Objednávky → Celkem, která navíc umí měsíc i vše.
// Starý odkaz na ni skončí na Výstavu (zalozkaZAdresy níž).
type Zalozka = 'vystav' | 'detail' | 'cycles' | 'stats' | 'deliveries';
const ZALOZKY: Zalozka[] = ['vystav', 'detail', 'cycles', 'stats', 'deliveries'];

const LISTA_ZALOZEK: (TabBarItem & { id: Zalozka })[] = [
  { id: 'vystav', label: 'Výstav', icon: TrendingUp, color: '#f59f00' },
  { id: 'detail', label: 'Hledání', icon: Search, color: '#4dabf7' },
  { id: 'cycles', label: 'Cykly tanků', icon: IkonaSud, color: '#ffa94d' },
  { id: 'stats', label: 'Žebříčky', icon: Trophy, color: '#38d9a9' },
  { id: 'deliveries', label: 'Trasy', icon: Truck, color: '#7c5cff' },
];

/**
 * Záložka z adresy se musí ověřit, ne jen přetypovat.
 *
 * `selectTab` si název záložky ukládá do adresy, takže na ni existují
 * uložené odkazy — a dvě záložky („overview" a „production") se zrušily.
 * Bez tohohle by takový odkaz otevřel obrazovku, na které se nevykreslí
 * vůbec nic: `activeTab` by se rovnalo hodnotě, kterou žádný blok netestuje.
 */
function zalozkaZAdresy(sub: string | undefined): Zalozka {
  return ZALOZKY.includes(sub as Zalozka) ? (sub as Zalozka) : 'vystav';
}

export default function History({ setPage, initialSubTab }: { setPage?: (p: any, sec?: string, sub?: string) => void; initialSubTab?: string } = {}) {
  const [activeTab, setActiveTab] = useState<Zalozka>(() => zalozkaZAdresy(initialSubTab));

  useEffect(() => {
    setActiveTab(zalozkaZAdresy(initialSubTab));
  }, [initialSubTab]);

  function selectTab(t: Zalozka) {
    if (setPage) setPage('history', undefined, t);
    else setActiveTab(t);
  }
  // ---- Výstav (production) state ----

  const [data, setData] = useState<MonthData[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  // Nový přehled „Výstav" potřebuje řádky tak, jak jsou — z měsíčních součtů
  // se týden ani odběratel dopočítat nedá.
  const [vyrobaLahve, setVyrobaLahve] = useState<VyrobniRadek[]>([]);
  const [vyrobaSudy, setVyrobaSudy] = useState<VyrobniRadek[]>([]);
  const [fasovaniStat, setFasovaniStat] = useState<VyrobniRadek[]>([]);
  const [odpisyStat, setOdpisyStat] = useState<VyrobniRadek[]>([]);
  const [objednavkyStat, setObjednavkyStat] = useState<any[]>([]);
  const [polozkyStat, setPolozkyStat] = useState<any[]>([]);
  const [obdobiStat, setObdobiStat] = useState<Obdobi>('mesic');
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  // Modal pro tisk uzávěrky
  const [showPrintModal, setShowPrintModal] = useState(false);
  // Zpět zavře tiskový náhled místo odchodu z historie.
  useChovaniDialogu(showPrintModal, () => setShowPrintModal(false));

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
  const [staceniProCykly, setStaceniProCykly] = useState<StaceniRadek[]>([]);

  // ---- Historie nákladek (přesunuto z původní obrazovky Závoz) ----
  const [delOrders, setDelOrders] = useState<DeliveryOrder[]>([]);
  const [delItems, setDelItems] = useState<Record<string, DeliveryItem[]>>({});

  // ---- Editace objednávek z přehledu ----
  const [editOrder, setEditOrder] = useState<DeliveryOrder | null>(null);
  const [editItems, setEditItems] = useState<DeliveryItem[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);

  async function loadDeliveries() {
    const [{ data: o }, { data: pl }, { data: vsechnyPolozky }] = await Promise.all([
      fetchAllRows('orders', '*').neq('status', 'storno').order('order_date', { ascending: false }),
      supabase.from('places').select('*').order('name'),
      // Položky současně s objednávkami, ne až po nich přes .in() (druhé kolo).
      nactiSdilenouTabulku('order_items'),
    ]);
    const ords = (o as DeliveryOrder[]) ?? [];
    setDelOrders(ords);
    setPlaces((pl as Place[]) ?? []);
    if (ords.length) {
      const ids = new Set(ords.map((x) => x.id));
      const map: Record<string, DeliveryItem[]> = {};
      ((vsechnyPolozky as DeliveryItem[]) ?? []).forEach((i) => { if (ids.has(i.order_id)) (map[i.order_id] ??= []).push(i); });
      setDelItems(map);
    }
  }

  async function openEditOrder(orderId: string) {
    const order = delOrders.find((o) => o.id === orderId);
    if (!order) return;
    const items = delItems[orderId] ?? [];
    setEditOrder(order);
    setEditItems(items);
  }

  // Všechny objednávky i s položkami potřebuje jen Hledání (kam vede
  // klepnutí na řádek). Dřív se stahovaly při KAŽDÉM otevření
  // Statistiky, i když se člověk podíval jen na Výstav.
  const potrebujeObjednavky = activeTab === 'detail';
  const [objednavkyNacteny, setObjednavkyNacteny] = useState(false);
  useEffect(() => {
    if (potrebujeObjednavky && !objednavkyNacteny) {
      setObjednavkyNacteny(true);
      loadDeliveries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [potrebujeObjednavky]);
  useRealtime(['orders', 'order_items', 'places'], () => { if (objednavkyNacteny) loadDeliveries(); });



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

  // Zámek proti zápisu ze zastaralého načtení — viz lib/nacitani.ts.
  const zacniNacteni = usePosledniNacteni();
  async function load(tiche = false) {
    const smiZapsat = zacniNacteni();
    if (!tiche) setLoading(true);
    const [{ data: bt }, { data: kg }, { data: fa }, { data: wo }, { data: ak }, { data: oi }, { data: ord }, { data: b }, { data: pk }, { data: faPriv }] = await Promise.all([
      nactiSdilenouTabulku('bottling'),
      nactiSdilenouTabulku('kegging'),
      nactiSdilenouTabulku('fasovani'),
      nactiSdilenouTabulku('writeoffs'),
      fetchAllRows('akce', 'entry_date,revenue,items:akce_items(beer_id,quantity_taken,quantity_returned,quantity)'),
      nactiSdilenouTabulku('order_items'),
      nactiSdilenouTabulku('orders'),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      // Pro Podrobné hledání — dřív se dotahovalo až ve druhém kole.
      nactiSdilenouTabulku('fasovani_private'),
    ]);
    // Mezitím mohlo začít novější načtení, nebo už obrazovka není vidět.
    if (!smiZapsat()) return;
    const beerList = (b as Beer[]) ?? [];
    setBeers(beerList);
    setVyrobaLahve((bt as VyrobniRadek[]) ?? []);
    setVyrobaSudy((kg as VyrobniRadek[]) ?? []);
    setFasovaniStat((fa as VyrobniRadek[]) ?? []);
    setOdpisyStat((wo as VyrobniRadek[]) ?? []);
    setObjednavkyStat((ord as any[]) ?? []);
    setPolozkyStat((oi as any[]) ?? []);
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
    // Obal podle id z mapy, ne `pkList.find` pro každý řádek pohybu.
    const obalPodleId = new Map(pkList.map((p) => [p.id, p] as const));
    const aggLiters = (rows: FilterableEntry[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => {
        const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
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
      const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
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
    // Dřív pro každou objednávku průchod VŠEMI položkami (viz lib/statistika).
    const ordM = objednanoPoMesicich(ordRows, oiRows);

    // Výpočet rozpadu KEG vs PET podle druhů obalů
    const calcKegHl = (rows: FilterableEntry[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => {
        const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
        if (!pkg || pkg.kind !== 'keg') return;
        m.set(monthKey(r.entry_date), (m.get(monthKey(r.entry_date)) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
      });
      return m;
    };
    const calcBottleHl = (rows: FilterableEntry[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => {
        const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
        if (!pkg || pkg.kind !== 'bottle') return;
        m.set(monthKey(r.entry_date), (m.get(monthKey(r.entry_date)) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
      });
      return m;
    };
    const calcByBeerKindHl = (rows: FilterableEntry[], kind: 'keg' | 'bottle') => {
      const m = new Map<string, Map<string, number>>();
      rows.forEach((r) => {
        const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
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
        const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
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
    // Rozpad sudů podle velikosti si tabulka cyklů nepamatuje (má jen
    // `keg_count`), takže se dopočítá z řádků stáčení — viz lib/cyklyTanku.
    const [{ data: cy }, { data: kg }] = await Promise.all([
      supabase.from('cellar_tank_cycles').select('*').order('ended_at', { ascending: false }).limit(300),
      nactiSdilenouTabulku('kegging'),
    ]);
    setTankCycles((cy as TankCycleRow[]) ?? []);
    setStaceniProCykly((kg as StaceniRadek[]) ?? []);
    setTankCyclesLoading(false);
  }

  useEffect(() => { load(); loadTankCycles(); }, []);
  // 🔇 Realtime přenačítá TIŠE. Bez toho zavolá loadData() bez parametru,
  // rozsvítí se spinner přes celou obrazovku (`if (loading) return <Kostra/>`),
  // obsah se odmountuje — a s ním spadne odrolování na nulu. Z provozu:
  // „když kliknu odečíst, vrací mě to vždycky nahoru." Vlastní zápis stránku
  // srovná kotvou (lib/drzPozici.ts), jenže 400 ms po něm dorazí realtime
  // událost o tomtéž zápisu a celou práci zahodí.
  useRealtime(['bottling', 'kegging', 'fasovani', 'fasovani_private', 'writeoffs', 'orders', 'order_items', 'akce', 'akce_items', 'beers', 'packages'], () => load(true));
  useRealtime(['cellar_tank_cycles'], loadTankCycles);

  function toggleMonth(m: string) {
    setSelectedMonths((s) => s.includes(m) ? s.filter((x) => x !== m) : [...s, m].sort().reverse());
  }

  const selected = data.filter((d) => selectedMonths.includes(d.month));


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

  // Kam vede klepnutí na řádek Podrobného hledání — spočítané jednou, ne při
  // vykreslení každého řádku (viz prvniObjednavkaPodlePolozky).
  const objednavkaProRadek = useMemo(
    () => prvniObjednavkaPodlePolozky(delOrders, delItems),
    [delOrders, delItems],
  );

  const detailResultsSorted = useMemo(() => sortRows(detailResults, detailSortKey, detailSortDir), [detailResults, detailSortKey, detailSortDir]);
  const tankCyclesSorted = useMemo(() => sortRows(tankCycles, cycleSortKey, cycleSortDir), [tankCycles, cycleSortKey, cycleSortDir]);

  // 🛢️ Do jakých velikostí sudů se v jednotlivých cyklech stáčelo.
  // Samotné „Sudů: 12" ztrátovost nevysvětlí — dvanáct desítek je šestkrát
  // víc stáčení (a šestkrát víc příležitostí něco ztratit) než dvanáct
  // padesátek.
  const sudyVCyklech = useMemo(
    () => rozpadSuduVCyklech(tankCycles, staceniProCykly, new Map(packages.map((p) => [p.id, { label: p.label }]))),
    [tankCycles, staceniProCykly, packages],
  );

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

  // 📦 Nejvíc stáčený OBAL za zvolené období — ne „nejvíc kusů dohromady".
  // Jde o to, do čeho se nejvíc stáčí, tedy čeho mít doma nejvíc.
  const nejcastejsiObal = useMemo(() => {
    const { od, do: doKdy } = rozsahObdobi(obdobiStat, denObdobi(obdobiStat, todayISO(), 0));
    const mapaObalu = new Map(packages.map((p) => [p.id, p as any]));
    return podilPodleObalu(vyrobaSudy, mapaObalu, od, doKdy)[0] ?? null;
  }, [vyrobaSudy, packages, obdobiStat]);

  // 💤 Kdo dřív bral a teď mlčí. Jediné číslo ve Statistice, které mluví
  // o ztracených penězích — všechno ostatní ukazuje, co se stalo.
  const utichliOdberatele = useMemo(
    () => kdoPrestalObjednavat(objednavkyStat, polozkyStat, new Map(packages.map((p) => [p.id, p as any])), todayISO()),
    [objednavkyStat, polozkyStat, packages],
  );

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
      keg_rozpad: popisRozpaduSudu(sudyVCyklech.get(c.id)),
      loss_l: Number(c.loss_l).toFixed(1), loss_pct: Number(c.loss_pct).toFixed(1),
      duration: fmtHoursShort(c.duration_hours), ended_at: new Date(c.ended_at).toLocaleDateString('cs-CZ'),
    }));
    exportHistoryDetailToExcel(
      rows,
      ['Tank', 'Pivo', 'Počáteční (hl)', 'Stočeno (hl)', 'Sudů', 'Do jakých sudů', 'Ztráta (l)', 'Ztráta (%)', 'Doba', 'Ukončeno'],
      ['tank_label', 'beer_name', 'initial_hl', 'kegged_hl', 'keg_count', 'keg_rozpad', 'loss_l', 'loss_pct', 'duration', 'ended_at'],
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
    uloz('history_saved_filters', JSON.stringify(next));
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
    uloz('history_saved_filters', JSON.stringify(next));
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




  // Kostra místo kolečka: obsah se neodmountuje do prázdna, takže se
  // stránka po načtení neposkočí. Viz Kostra v components/ui.tsx.
  if (loading) return <Kostra radku={6} />;

  return (
    <div className="space-y-6 pb-12">
      {/* Stejná lišta záložek jako zbytek appky (components/TabBar.tsx) —
          dřív tu byla vlastní kopie s dlouhými popisky a nad ní osm barevných
          dlaždic za rok, které byly vidět na každé záložce. Ty jsou teď jako
          karta „Letos v kusech" na Výstavu, kam patří. */}
      <TabBar items={LISTA_ZALOZEK} activeId={activeTab} onSelect={(id) => selectTab(id as Zalozka)} />

      {/* ZÁLOŽKA 1: VÝSTAV
          Pohltila dřívější „Měsíční přehledy & Porovnání" a „Výstav (HL) &
          KEG/PET". Ty tři záložky ukazovaly z velké části totéž — tři různé
          rozpisy obalů, dva měsíční grafy, dvě sady dlaždic — jen každá
          trochu jinak, a na telefonu zabíral zalomený pruh osmi záložek
          třetinu displeje. Co tam bylo navíc (ztráty KEG), je teď karta
          „Rozpočet sudů"; vlastní rozsah dat zůstal v „Podrobném hledání". */}
      {activeTab === 'vystav' && (
        <div className="space-y-4">
        {/* 🖨️ Tisková uzávěrka pro sládka — počítá se z měsíčních součtů,
            takže patří k Výstavu, ne na každou záložku. */}
        <div className="flex justify-end">
          <button onClick={() => setShowPrintModal(true)} className="btn-ghost !rounded text-xs flex items-center gap-1.5">
            <Printer size={16} /> Měsíční uzávěrka (tisk)
          </button>
        </div>
        <StatistikaVystav
          bottlingRows={vyrobaLahve}
          keggingRows={vyrobaSudy}
          fasovaniRows={fasovaniStat}
          writeoffRows={odpisyStat}
          obaly={packages as any}
          piva={beers as any}
          orders={objednavkyStat}
          orderItems={polozkyStat}
          dnes={todayISO()}
          obdobi={obdobiStat}
          onObdobi={setObdobiStat}
        />

        {/* 📋 Letos v kusech. Dřív osm barevných dlaždic nad záložkami, na
            každé záložce — a první se jmenovala „Uvařeno", i když sčítá
            stočené kusy (lahve + sudy). Výstav výš počítá jen sudy
            v hektolitrech, takže se čísla liší; poznámka to říká rovnou. */}
        <section className="card p-3.5 sm:p-5">
          <h3 className="font-display font-black text-base text-neutral-900">Letos v kusech ({currentYear})</h3>
          <p className="text-udaj font-semibold text-neutral-500 mt-0.5 mb-3">
            Všechny obaly dohromady, v kusech. Výstav výš počítá jen sudy v hektolitrech — proto se čísla liší.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            {([
              ['Stočeno (lahve + sudy)', `${yearData.totalBrewed} ks`, `${yearData.totalBrewedHl.toFixed(1)} hl`],
              ['Do lahví', `${yearData.totalBottled} ks`, null],
              ['Do sudů', `${yearData.totalKegged} ks`, null],
              ['Ø stočeno za měsíc', `${yearData.avgMonthlyBrewed} ks`, `z ${yearData.monthCount} měsíců`],
              ['Objednáno', `${yearData.totalOrdered} ks`, null],
              ['Fasováno', `${yearData.totalFasovani} ks`, null],
              ['Odpisy', `${yearData.totalWriteoffs} ks`, null],
              ['Tržby z akcí', `${yearData.totalAkceRevenue.toLocaleString('cs-CZ')} Kč`, null],
            ] as const).map(([popis, hodnota, pod]) => (
              <div key={popis}>
                <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">{popis}</div>
                <div className="text-lg font-display font-black text-neutral-900 tabular-nums">{hodnota}</div>
                {pod && <div className="text-udaj font-bold text-neutral-500">{pod}</div>}
              </div>
            ))}
          </div>
        </section>
        </div>
      )}



      {/* TAB 3: PODROBNÉ HLEDÁNÍ & FILTRY */}
      {activeTab === 'detail' && (
        <div className="space-y-6">
          <div className="card p-5 bg-white border border-neutral-200 rounded space-y-5 shadow-xs">
            {/* Zdroje aktivit + období + pivo/obal — přilepené nahoře, ať jde
                měnit filtr i uprostřed prohlížení výsledků dole. Na telefonu
                ne: blok je vysoký a zakryl by půlku displeje. */}
            <div className="sm:sticky sm:top-0 sm:z-10 bg-white space-y-3 py-1 -mx-5 px-5">
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
                        className={`tap px-3 py-1.5 rounded text-xs font-black transition ${active ? 'bg-amber-500 text-neutral-950 shadow-md' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'}`}
                      >
                        <s.icon className="ikona-text" /> {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date range */}
              <div className="flex flex-wrap items-end gap-3 bg-neutral-50 p-3.5 rounded border border-neutral-200">
                <div>
                  <label className="block text-udaj font-black uppercase text-neutral-600 mb-1">Od</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input !py-1.5 text-xs font-mono font-bold" />
                </div>
                <div>
                  <label className="block text-udaj font-black uppercase text-neutral-600 mb-1">Do</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input !py-1.5 text-xs font-mono font-bold" />
                </div>
                {/* Pivo a obal — stav filtru tu byl odjakživa (a ukládal se i do
                    uložených filtrů), jen ho nešlo nikde nastavit. */}
                <div>
                  <label htmlFor="hledani-pivo" className="block text-udaj font-black uppercase text-neutral-600 mb-1">Pivo</label>
                  <select
                    id="hledani-pivo"
                    className="input !py-1.5 text-xs font-bold"
                    value={selBeers.size === 1 ? [...selBeers][0] : ''}
                    onChange={(e) => setSelBeers(e.target.value ? new Set([e.target.value]) : new Set())}
                  >
                    <option value="">Všechna piva</option>
                    {beers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="hledani-obal" className="block text-udaj font-black uppercase text-neutral-600 mb-1">Obal</label>
                  <select
                    id="hledani-obal"
                    className="input !py-1.5 text-xs font-bold"
                    value={selPackages.size === 1 ? [...selPackages][0] : ''}
                    onChange={(e) => setSelPackages(e.target.value ? new Set([e.target.value]) : new Set())}
                  >
                    <option value="">Všechny obaly</option>
                    {packages.map((p) => <option key={p.id} value={p.id}>{formatPackageLabel(p.label)}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button className="px-2.5 py-1.5 rounded bg-white border border-neutral-300 text-xs font-bold tap" onClick={() => setQuickRange('week')}>Týden</button>
                  <button className="px-2.5 py-1.5 rounded bg-white border border-neutral-300 text-xs font-bold tap" onClick={() => setQuickRange('month')}>Měsíc</button>
                  <button className="px-2.5 py-1.5 rounded bg-white border border-neutral-300 text-xs font-bold tap" onClick={() => setQuickRange('year')}>Rok</button>
                  <button className="px-2.5 py-1.5 rounded bg-white border border-neutral-300 text-xs font-bold tap" onClick={() => setQuickRange('all')}>Vše</button>
                </div>
              </div>
            </div>


            {/* Uložené filtry — pod filtry a sbalené: používají se občas,
                dřív ale zabíraly celý vršek záložky před samotnými filtry. */}
            <details className="rounded border border-amber-300/80 bg-amber-50/50 p-4 space-y-3">
              <summary className="text-xs font-black uppercase tracking-wider text-amber-950 cursor-pointer select-none">
                <Star className="ikona-text" /> Uložené filtry ({savedFilters.length})
              </summary>
              <div className="flex flex-wrap gap-2">
                {savedFilters.length === 0 && <span className="text-xs text-neutral-500">Zatím žádné uložené filtry.</span>}
                {savedFilters.map((f) => (
                  <span key={f.name} className="px-3 py-1.5 rounded bg-white border border-amber-300 text-amber-950 text-xs font-bold shadow-2xs flex items-center gap-2">
                    <button type="button" className="hover:underline" onClick={() => applyFilter(f)}>{f.name}</button>
                    <button type="button" className="text-rose-600 hover:text-rose-800 font-bold" onClick={() => deleteFilter(f.name)} title="Smazat filtr" aria-label="Smazat filtr"><X size={14} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="input !py-1.5 text-xs font-semibold flex-1" placeholder="Název filtru (např. 12° lahve za tento měsíc)" value={newFilterName} onChange={(e) => setNewFilterName(e.target.value)} />
                <button type="button" className="px-3.5 py-1.5 rounded bg-neutral-900 hover:bg-neutral-800 text-amber-300 font-black text-xs shadow-xs tap" onClick={saveCurrentFilter}><Save className="ikona-text" /> Uložit aktuální</button>
              </div>
            </details>

            {/* Souhrn výsledků */}
            <div className="rounded bg-neutral-900 text-white p-5 flex flex-wrap items-center justify-between gap-6 shadow-md">
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-udaj uppercase tracking-wider text-amber-400 font-extrabold">Celkem kusů</div>
                  <div className="font-display font-black text-2xl sm:text-3xl text-white">{detailTotals.totalQty.toLocaleString('cs-CZ')}</div>
                </div>
                <div>
                  <div className="text-udaj uppercase tracking-wider text-amber-400 font-extrabold">Celkem litrů</div>
                  <div className="font-display font-black text-2xl sm:text-3xl text-white">{detailTotals.totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} l</div>
                </div>
              </div>
              <button
                type="button"
                onClick={exportDetailExcel}
                className="px-4 py-2.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-md transition flex items-center gap-2"
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
                  const idObjednavky = objednavkaProRadek.get(`${r.beer_id}__${r.package_id}`);
                  const hasOrders = !!idObjednavky;
                  return (
                    <div
                      key={`${r.beer_id}__${r.package_id}`}
                      className={`rounded bg-white border-2 p-3 space-y-1.5 ${hasOrders ? 'cursor-pointer' : ''}`}
                      style={{ borderColor: beerBorder(beer) }}
                      onClick={() => { if (idObjednavky) openEditOrder(idObjednavky); }}
                    >
                      <div className="flex items-center justify-between gap-2 font-black text-sm text-neutral-950">
                        <span>{r.beer_name} <span className="font-bold opacity-80">· {formatPackageLabel(r.package_label)}</span></span>
                        <span className="shrink-0 font-mono text-sm">{r.totalQty} ks</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-bold text-neutral-700">
                        {ACTIVITY_SOURCES.filter((s) => selSources.has(s.key)).map((s) => (
                          <span key={s.key}><s.icon className="ikona-text" /> {r.qtyBySource[s.key] || 0}</span>
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
                      <th scope="col" className="cursor-pointer select-none" onClick={() => onSortDetail('beer_name')}>Pivo<SortIcon active={detailSortKey === 'beer_name'} dir={detailSortDir} /></th>
                      <th scope="col" className="cursor-pointer select-none" onClick={() => onSortDetail('package_label')}>Obal<SortIcon active={detailSortKey === 'package_label'} dir={detailSortDir} /></th>
                      {ACTIVITY_SOURCES.filter((s) => selSources.has(s.key)).map((s) => (
                        <th scope="col" key={s.key} className="text-right"><s.icon className="ikona-text" /> {s.label}</th>
                      ))}
                      <th scope="col" className="text-right cursor-pointer select-none" onClick={() => onSortDetail('totalQty')}>Celkem<SortIcon active={detailSortKey === 'totalQty'} dir={detailSortDir} /></th>
                      <th scope="col" className="text-right cursor-pointer select-none" onClick={() => onSortDetail('totalLiters')}>Litrů<SortIcon active={detailSortKey === 'totalLiters'} dir={detailSortDir} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailResultsSorted.map((r) => {
                      const beer = beers.find((b) => b.id === r.beer_id);
                      const idObjednavky = objednavkaProRadek.get(`${r.beer_id}__${r.package_id}`);
                      const hasOrders = !!idObjednavky;
                      return (
                        <tr
                          key={`${r.beer_id}__${r.package_id}`}
                          className={`transition-colors bg-white ${hasOrders ? 'cursor-pointer hover:bg-neutral-50' : 'hover:bg-neutral-50/60'}`}
                          style={{ borderLeft: `4px solid ${beerBorder(beer)}` }}
                          onClick={() => { if (idObjednavky) openEditOrder(idObjednavky); }}
                          title={hasOrders ? 'Kliknutím upravíte objednávku' : undefined}
                        >
                          <td className="font-black text-udaj text-neutral-950">{r.beer_name}</td>
                          <td className="font-extrabold text-neutral-950 text-udaj">{formatPackageLabel(r.package_label)}</td>
                          {ACTIVITY_SOURCES.filter((s) => selSources.has(s.key)).map((s) => (
                            <td key={s.key} className="text-right font-bold text-neutral-900 text-udaj">{r.qtyBySource[s.key] || '—'}</td>
                          ))}
                          <td className="text-right font-mono font-black text-neutral-950 text-udaj">{r.totalQty} ks</td>
                          <td className="text-right font-black text-neutral-900 text-udaj">{r.totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} l</td>
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
          <div className="card p-5 bg-white border border-neutral-200 rounded space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <ShieldAlert size={18} className="text-amber-600" />
                <span>Diagnostika průměrné ztrátovosti podle tanků</span>
              </h3>
              <span className="text-xs font-mono font-bold bg-neutral-100 px-3 py-1 rounded text-neutral-600 border border-neutral-200">
                {tankLossDiagnostics.length} Tanků sledováno
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {tankLossDiagnostics.map((t) => {
                const isHighLoss = t.avgLossPct > 5.0;
                return (
                  <div
                    key={t.tank_label}
                    className={`p-3.5 rounded bg-white border-2 transition-all ${
                      isHighLoss ? 'border-rose-400' : 'border-neutral-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-base text-neutral-900">{t.tank_label}</span>
                      <span className={`font-mono font-black text-xs px-2 py-0.5 rounded ${isHighLoss ? 'bg-rose-600 text-white' : 'bg-neutral-100 text-neutral-700'}`}>
                        {t.avgLossPct.toFixed(1)}% ztráta
                      </span>
                    </div>
                    <div className="text-udaj text-neutral-500 flex justify-between">
                      <span>{t.count} cyklů</span>
                      <span>Celkem ztráta {t.totalLossL.toFixed(0)} l</span>
                    </div>
                    {isHighLoss && (
                      <div className="mt-2 text-udaj font-bold text-rose-700 bg-rose-50 p-1.5 rounded border border-rose-200">
                        <AlertTriangle className="ikona-text" /> Vyšší ztrátovost (kontrola hradícího ventilu & těsnění klapky)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card p-5 bg-white border border-neutral-200 rounded space-y-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <div>
                <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                  <IkonaSud size={18} className="text-amber-600" />
                  <span>Detailní historie cyklů tanků</span>
                </h3>
                <p className="text-xs text-neutral-500 font-medium mt-0.5">Přehled stočeného objemu, sudů a procenta ztrát pro každý cyklus tanku</p>
              </div>
              <button
                type="button"
                onClick={exportCyclesExcel}
                className="px-3.5 py-2 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black shadow-md transition flex items-center gap-1.5"
              >
                <Download size={16} />
                <span>Export cyklů</span>
              </button>
            </div>

            {tankCyclesLoading ? (
              <Spinner />
            ) : tankCycles.length === 0 ? (
              <EmptyState text="Zatím žádné ukončené cykly tanků." icon={Snowflake} />
            ) : (
              <>
              {/* Mobilní karty */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {tankCyclesSorted.map((c) => {
                  const beer = c.beer_name ? beers.find((b) => b.name === c.beer_name) : null;
                  const highLoss = Number(c.loss_pct) > 3;
                  return (
                    <div key={c.id} className="rounded bg-white border-2 p-3 space-y-1.5" style={{ borderColor: beerBorder(beer) }}>
                      <div className="flex items-center justify-between gap-2 font-black text-sm text-neutral-950">
                        <span>{c.tank_label} <span className="font-bold opacity-80">· {c.beer_name ?? '—'}</span></span>
                        <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-black ${highLoss ? 'bg-rose-600 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{Number(c.loss_pct).toFixed(1)}% ztráta</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs font-bold text-neutral-700">
                        <span>Poč. {(Number(c.initial_volume_l) / 100).toFixed(2)} hl</span>
                        <span>Stoč. {(Number(c.kegged_volume_l) / 100).toFixed(2)} hl</span>
                        <span>{c.keg_count} sudů</span>
                        <span>Ztr. {Number(c.loss_l).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} l</span>
                        <span>{fmtHoursShort(c.duration_hours)}</span>
                        <span>{new Date(c.ended_at).toLocaleDateString('cs-CZ')}</span>
                      </div>
                      {/* 🛢️ Do jakých velikostí — „12 sudů" samo ztrátovost
                          nevysvětlí, dvanáct desítek je šestkrát víc stáčení
                          než dvanáct padesátek. */}
                      {popisRozpaduSudu(sudyVCyklech.get(c.id)) && (
                        <div className="text-udaj font-semibold text-neutral-500">
                          {popisRozpaduSudu(sudyVCyklech.get(c.id))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto scrollbar-thin">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th scope="col" className="cursor-pointer select-none" onClick={() => onSortCycle('tank_label')}>Tank<SortIcon active={cycleSortKey === 'tank_label'} dir={cycleSortDir} /></th>
                      <th scope="col" className="cursor-pointer select-none" onClick={() => onSortCycle('beer_name')}>Pivo<SortIcon active={cycleSortKey === 'beer_name'} dir={cycleSortDir} /></th>
                      <th scope="col" className="text-right cursor-pointer select-none" onClick={() => onSortCycle('initial_volume_l')}>Poč.<SortIcon active={cycleSortKey === 'initial_volume_l'} dir={cycleSortDir} /></th>
                      <th scope="col" className="text-right cursor-pointer select-none" onClick={() => onSortCycle('kegged_volume_l')}>Stoč.<SortIcon active={cycleSortKey === 'kegged_volume_l'} dir={cycleSortDir} /></th>
                      <th scope="col" className="text-right cursor-pointer select-none" onClick={() => onSortCycle('keg_count')}>Sudů<SortIcon active={cycleSortKey === 'keg_count'} dir={cycleSortDir} /></th>
                      <th scope="col" className="text-right cursor-pointer select-none" onClick={() => onSortCycle('loss_l')}>Ztr.<SortIcon active={cycleSortKey === 'loss_l'} dir={cycleSortDir} /></th>
                      <th scope="col" className="text-right cursor-pointer select-none" onClick={() => onSortCycle('loss_pct')}>Ztr.%<SortIcon active={cycleSortKey === 'loss_pct'} dir={cycleSortDir} /></th>
                      <th scope="col" className="text-right cursor-pointer select-none" onClick={() => onSortCycle('duration_hours')}>Doba<SortIcon active={cycleSortKey === 'duration_hours'} dir={cycleSortDir} /></th>
                      <th scope="col" className="cursor-pointer select-none" onClick={() => onSortCycle('ended_at')}>Konec<SortIcon active={cycleSortKey === 'ended_at'} dir={cycleSortDir} /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tankCyclesSorted.map((c) => {
                      const beer = c.beer_name ? beers.find((b) => b.name === c.beer_name) : null;
                      return (
                        <tr key={c.id} className="hover:bg-neutral-50 transition-colors bg-white" style={{ borderLeft: `4px solid ${beerBorder(beer)}` }}>
                          <td className="font-black text-udaj text-neutral-950">{c.tank_label}</td>
                          <td className="font-black text-udaj text-neutral-950">{c.beer_name ?? '—'}</td>
                          <td className="text-right font-bold text-neutral-900 text-udaj">{(Number(c.initial_volume_l) / 100).toFixed(2)} hl</td>
                          <td className="text-right font-black text-neutral-950 text-udaj">{(Number(c.kegged_volume_l) / 100).toFixed(2)} hl</td>
                          <td className="text-right font-mono font-black text-neutral-950 text-udaj">
                            {c.keg_count} ks
                            {popisRozpaduSudu(sudyVCyklech.get(c.id)) && (
                              <span className="block font-sans font-semibold text-neutral-500 whitespace-nowrap">
                                {popisRozpaduSudu(sudyVCyklech.get(c.id))}
                              </span>
                            )}
                          </td>
                          <td className={`text-right text-udaj ${Number(c.loss_l) > 0 ? 'text-rose-700 font-black' : 'text-neutral-900 font-bold'}`}>{Number(c.loss_l).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} l</td>
                          <td className={`text-right text-udaj ${Number(c.loss_pct) > 3 ? 'text-rose-700 font-black' : 'text-neutral-900 font-bold'}`}>{Number(c.loss_pct).toFixed(1)}%</td>
                          <td className="text-right text-neutral-900 font-bold text-udaj">{fmtHoursShort(c.duration_hours)}</td>
                          <td className="text-neutral-900 font-bold whitespace-nowrap text-udaj">{new Date(c.ended_at).toLocaleDateString('cs-CZ')}</td>
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
            <div className="card p-5 bg-white border-2 border-amber-300 rounded space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <Trophy size={16} className="text-amber-600" />
                <span>Nejvíc stočené pivo</span>
              </div>
              <div className="font-display font-black text-xl text-neutral-900">{topStats.topBeer.beer_name}</div>
              <div className="text-xs font-bold text-neutral-600">{topStats.topBeer.totalQty} ks · {topStats.topBeer.package_label}</div>
            </div>
          )}

          {topStats.lowestLoss && (
            <div className="card p-5 bg-white border-2 border-emerald-300 rounded space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                <ArrowDownRight size={16} className="text-emerald-600" />
                <span>Nejnižší ztráta cyklu</span>
              </div>
              <div className="font-display font-black text-xl text-neutral-900">{topStats.lowestLoss.tank_label} — {topStats.lowestLoss.beer_name ?? '—'}</div>
              <div className="text-xs font-mono font-black text-emerald-700">{Number(topStats.lowestLoss.loss_pct).toFixed(1)}% ztráta</div>
            </div>
          )}

          {topStats.highestLoss && (
            <div className="card p-5 bg-white border-2 border-rose-300 rounded space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                <ArrowUpRight size={16} className="text-rose-600" />
                <span>Nejvyšší ztráta cyklu</span>
              </div>
              <div className="font-display font-black text-xl text-neutral-900">{topStats.highestLoss.tank_label} — {topStats.highestLoss.beer_name ?? '—'}</div>
              <div className="text-xs font-mono font-black text-rose-700">{Number(topStats.highestLoss.loss_pct).toFixed(1)}% ztráta</div>
            </div>
          )}

          {topStats.fastest && (
            <div className="card p-5 bg-white border-2 border-sky-300 rounded space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-sky-900 flex items-center gap-1.5">
                <Zap size={16} className="text-sky-600" />
                <span>Nejrychlejší cyklus tanku</span>
              </div>
              <div className="font-display font-black text-xl text-neutral-900">{topStats.fastest.tank_label} — {topStats.fastest.beer_name ?? '—'}</div>
              <div className="text-xs font-mono font-black text-sky-700">{fmtHoursShort(topStats.fastest.duration_hours)}</div>
            </div>
          )}

          {/* 📦 Nejvíc stáčený obal — čeho mít doma nejvíc umytého.
              Schválně za období zvolené na záložce Výstav, ne „za celou
              dobu": co se stáčelo před třemi lety, dnešní přípravu neřídí. */}
          {nejcastejsiObal && (
            <div className="card p-5 bg-white border-2 border-amber-300 rounded space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <IkonaSud size={16} className="text-amber-600" />
                <span>Nejvíc stáčený obal ({POPIS_OBDOBI_ZEBRICEK[obdobiStat]})</span>
              </div>
              <div className="font-display font-black text-xl text-neutral-900">{nejcastejsiObal.nazev}</div>
              <div className="text-xs font-bold text-neutral-600">
                {nejcastejsiObal.kusy} ks · {(nejcastejsiObal.litry / 100).toFixed(1)} hl · {(nejcastejsiObal.podil * 100).toFixed(0)} % výstavu
              </div>
            </div>
          )}

          {/* 💤 Kdo přestal objednávat. Tohle je jediná karta, která mluví
              o penězích, co přestaly chodit — zbytek Statistiky ukazuje, co
              se stalo, tahle ukazuje, co se přestalo dít. */}
          <div className="card p-5 bg-white border-2 border-neutral-300 rounded space-y-2 sm:col-span-2">
            <div className="text-xs font-black uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
              <Store size={16} className="text-neutral-500" />
              <span>Kdo přestal objednávat</span>
            </div>
            {utichliOdberatele.length === 0 ? (
              <p className="text-xs font-bold text-neutral-600">Nikdo — všichni stálí odběratelé brali za posledních 60 dní.</p>
            ) : (
              <>
                <p className="text-udaj font-semibold text-neutral-500">
                  Bez závozu 60 dní a víc; jednorázoví odběratelé se nepočítají. Řazeno podle toho, kolik u nich za celou dobu proteklo.
                </p>
                <div className="space-y-1">
                  {utichliOdberatele.slice(0, 8).map((o) => (
                    <div key={o.nazev} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-bold text-neutral-900 truncate">{o.nazev}</span>
                      <span className="text-xs font-bold text-neutral-600 shrink-0 tabular-nums">
                        {(o.litry / 100).toFixed(1)} hl · {o.objednavek}× · naposled {new Date(o.posledni).toLocaleDateString('cs-CZ')} ({o.dnu} dní)
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: HISTORIE A PŘEHLED TRAS (přesunuto z obrazovky Závoz) */}
      {activeTab === 'deliveries' && (
        <ZavozHistory />
      )}

      {/* 🖨️ MODAL PRO TISK MĚSÍČNÍ UZÁVĚRKY SLÁDKA */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="tisk-oblast bg-white rounded max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <div>
                <span className="text-udaj font-mono font-black uppercase tracking-widest text-amber-600">Formátovaný protokol sládka</span>
                <h2 className="font-display font-black text-2xl text-neutral-900">Měsíční výrobně-skladová uzávěrka</h2>
                <p className="text-xs text-neutral-500 font-bold">Kynšperský pivovar s.r.o. — Výroba piva Zajíc</p>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="tisk-skryt w-9 h-9 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-black grid place-items-center tap"
                title="Zavřít" aria-label="Zavřít"
              >
                <X size={18} />
              </button>
            </div>

            {/* 🗓️ Výběr měsíců. Dřív visel na záložce „Měsíční přehledy",
                která se zrušila — patří ale stejně sem: měsíce se vybírají
                ve chvíli, kdy se uzávěrka tiskne, ne o dvě obrazovky dřív.
                `tisk-skryt` drží přepínač mimo papír. */}
            {data.length > 0 && (
              <div className="tisk-skryt space-y-1.5">
                <span className="block text-udaj uppercase font-black text-neutral-500">Měsíce v uzávěrce</span>
                <div className="flex flex-wrap gap-2">
                  {data.slice(0, 24).map((d) => (
                    <button
                      key={d.month}
                      onClick={() => toggleMonth(d.month)}
                      aria-pressed={selectedMonths.includes(d.month)}
                      className={`tap px-3.5 py-1.5 rounded text-xs font-black transition-all border ${
                        selectedMonths.includes(d.month)
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-md'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-amber-50'
                      }`}
                    >
                      {monthLabel(d.month)}
                    </button>
                  ))}
                </div>
                {selected.length === 0 && (
                  <p className="text-udaj font-bold text-rose-700">Vyber aspoň jeden měsíc — jinak je uzávěrka prázdná.</p>
                )}
              </div>
            )}

            <div className="space-y-4 text-xs text-neutral-800">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50 p-4 rounded border border-neutral-200">
                <div>
                  <span className="block text-udaj uppercase font-black text-neutral-500">Měsíc uzávěrky</span>
                  <strong className="text-sm font-black text-neutral-900">{selectedMonths.length > 0 ? monthLabel(selectedMonths[0]) : 'Aktuální'}</strong>
                </div>
                <div>
                  <span className="block text-udaj uppercase font-black text-neutral-500">Celkem stočeno</span>
                  <strong className="text-sm font-black text-neutral-900">{selected.reduce((sum, d) => sum + d.brewed, 0)} ks</strong>
                </div>
                <div>
                  <span className="block text-udaj uppercase font-black text-neutral-500">Celkem fasováno</span>
                  <strong className="text-sm font-black text-neutral-900">{selected.reduce((sum, d) => sum + d.fasovani, 0)} ks</strong>
                </div>
                <div>
                  <span className="block text-udaj uppercase font-black text-neutral-500">Datum tisku</span>
                  <strong className="text-sm font-black text-neutral-900">{new Date().toLocaleDateString('cs-CZ')}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-black text-sm text-neutral-900">Souhrn výroby a stáčení za měsíce:</h4>
                <table className="w-full border-collapse text-left border border-neutral-200">
                  <thead>
                    <tr className="bg-neutral-100 border-b border-neutral-200">
                      <th scope="col" className="p-2 font-black">Měsíc</th>
                      <th scope="col" className="p-2 font-black text-right">Stočeno celkem</th>
                      <th scope="col" className="p-2 font-black text-right">Stočeno Sudy</th>
                      <th scope="col" className="p-2 font-black text-right">Stočeno Lahve</th>
                      <th scope="col" className="p-2 font-black text-right">Fasováno</th>
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
                className="tisk-skryt px-4 py-2.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold"
              >
                Zavřít
              </button>
              <button
                onClick={() => window.print()}
                className="tisk-skryt px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md flex items-center gap-2"
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

