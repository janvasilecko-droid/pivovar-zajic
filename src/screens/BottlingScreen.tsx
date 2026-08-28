import { BottlingChecklistModal, DEFAULT_ITEMS, isStartChecklistCompleteForDate, isMonthlyChecklistCompleteForDate, MONTHLY_CATEGORY } from '../components/BottlingChecklistModal';
import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase, Beer, Package, EntryRow, useRealtime, beerBg, beerName, beerText, formatPackageLabel, fetchAllRows } from '../lib/supabase';
import { EmptyState, Spinner, Modal } from '../components/ui';
import { isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';
import { ImportBottlingFromImage } from '../components/ImportBottlingFromImage';
import { AlertTriangle, ArrowRight, BarChart3, Beer as BeerIcon, Calendar, CalendarDays, Camera, ClipboardList, Copy, Cylinder, Lightbulb, ListChecks, Package as PackageIcon, Pencil, Plus, RefreshCw, Sparkles, Trash2, Wine } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { BottlingPlan, getPlanSeenAt, markPlanSeenAt, isPlanUnseen, isBottlingManager, setPlanStatus } from '../lib/bottlingPlans';
import { BottlingPlanPlanner } from '../components/BottlingPlanPlanner';
import { BottlingPlanBottler } from '../components/BottlingPlanBottler';
import { isLastWeekOfMonth } from '../lib/monthlyCleanup';
import { businessDateISO } from '../lib/businessDate';
import { autoLogBottleSanitationFromChecklist } from '../lib/bottleSanitation';
import { requestOrdersItemFilter } from '../lib/ordersFilter';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { parseFreeTextEntries, loadAliasMap, emptyAliasMap, type ParserAliasMap } from '../lib/orderParser';
import { BeerTileGrid, BeerTilePanel } from '../components/BeerTileGrid';
import { stackingQuickQtys } from '../lib/quickQty';
import { computePackageNeeds } from '../lib/packageNeeds';
import { computeKeggingPlan } from '../lib/keggingPlan';
import KeggingDayPlan from '../components/KeggingDayPlan';
import { chyba, potvrd, toastZpet } from '../lib/toast';
import { zavibruj } from '../lib/haptika';
import { podezreleMnozstvi } from '../lib/kontrolaZadani';
import { IkonaLahev, IkonaSud } from '../components/ikony';


const ROW_COUNT = 12;
type RowInput = { beerId: string; pkgId: string; pkg2Id: string; pkg3Id: string; kegPkgId: string; kegQty: string; qty: string; qty2: string; qty3: string };
const emptyItem = (): RowInput => ({ beerId: '', pkgId: '', pkg2Id: '', pkg3Id: '', kegPkgId: '', kegQty: '', qty: '', qty2: '', qty3: '' });
const emptyRows = (): RowInput[] => Array.from({ length: ROW_COUNT }, emptyItem);


// Povolené velikosti lahví v dropdownu
const ALLOWED_BOTTLE_VOLUMES = [1.5, 1, 0.5, 0.33];
// Velikosti KEG sudů
const KEG_SIZES = [50, 30, 20, 15, 10];


export default function BottlingScreen({
  setPage,
  mode = 'all',
  initialTab,
  initialSubTab,
}: {
  setPage?: (p: any, sec?: string, sub?: string) => void;
  mode?: 'entry_only' | 'overviews_only' | 'all';
  initialTab?: 'zapis' | 'prehled' | 'potreba';
  initialSubTab?: string;
} = {}) {
  const pageValue = mode === 'entry_only' ? 'bottling_entry' : mode === 'overviews_only' ? 'bottling_overview' : 'bottling';
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<EntryRow | null>(null);
  const loadCountRef = useRef(0);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [entryRows, setEntryRows] = useState<RowInput[]>(emptyRows());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const [showImageImport, setShowImageImport] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  // Při automatickém otevření (povinná brána) se modal nesmí zavřít, dokud
  // není splněná sekce „1. Začátek stáčení"; ruční otevření z lišty neblokuje.
  const [checklistGate, setChecklistGate] = useState(false);
  // Fáze checklistu — 'start' = příprava pracoviště PŘED stáčením, 'end' =
  // konec stáčení (úklid), který se vyplňuje až po ukončení stáčení.
  const [checklistPhase, setChecklistPhase] = useState<'start' | 'end' | 'monthly'>('start');
  // Zaměření otevřeného checklistu na konkrétní sekci (např. měsíční údržba).
  const [checklistInitialCategory, setChecklistInitialCategory] = useState<string | null>(null);

  // Záložky: Stáčení / Přehled / Potřeba stočit lahve
  // Z menu se otevře nejprve Přehled stočených; tlačítko „Stáčení lahví" otevře zápis stáčení.
  const defaultTab: 'zapis' | 'prehled' | 'potreba' | 'plan' = mode === 'all' ? 'prehled' : 'zapis';
  const [tab, setTab] = useState<'zapis' | 'prehled' | 'potreba' | 'plan'>((initialSubTab as any) || initialTab || defaultTab);

  useEffect(() => {
    setTab((initialSubTab as any) || initialTab || defaultTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubTab, initialTab]);

  // Přepnutí záložky zapíšeme do historie stránek (setPage), ne jen do
  // lokálního stavu — jinak tlačítko Zpět z téhle obrazovky nevrátí
  // předchozí záložku, ale rovnou vyskočí do menu.
  function selectTab(t: 'zapis' | 'prehled' | 'potreba' | 'plan') {
    if (setPage) setPage(pageValue, undefined, t);
    else setTab(t);
  }

  const { profile } = useAuth();
  const isManager = isBottlingManager(profile?.role);

  // Plánování stáčení („co je potřeba stočit") — úkoly zadává admin/sládek/šéf
  const [plans, setPlans] = useState<BottlingPlan[]>([]);
  // Úkol naplněný do formuláře zápisu → po uložení se automaticky označí za hotový
  const filledPlanRef = useRef<BottlingPlan | null>(null);

  const [planSeenAt, setPlanSeenAt] = useState(getPlanSeenAt);
  const unseenCount = useMemo(
    () => plans.filter((p) => isPlanUnseen(p, planSeenAt)).length,
    [plans, planSeenAt]
  );

  const [aliasMap, setAliasMap] = useState<ParserAliasMap>(emptyAliasMap());
  useEffect(() => { loadAliasMap().then(setAliasMap).catch(() => {}); }, []);

  // --- Dlaždicové zadávání stáčení (vzor z Orders) ---
  // Klik na dlaždici piva (2 vedle sebe) otevře plnoobrazovkový panel pro
  // výběr obalů a množství; výsledek se zapíše do stávajících entryRows a uloží
  // se běžným tlačítkem "Uložit stáčení lahví" (stejná add() logika).
  const [tileBeer, setTileBeer] = useState<Beer | null>(null);
  // Sloty pro zadání až 3 druhů lahví v dlaždicovém panelu.
  const tileSlots = [
    { pkg: 'pkgId', qty: 'qty', key: 1 },
    { pkg: 'pkg2Id', qty: 'qty2', key: 2 },
    { pkg: 'pkg3Id', qty: 'qty3', key: 3 },
  ] as const;
  const [tileDraft, setTileDraft] = useState<{ pkgId: string; qty: string; pkg2Id: string; qty2: string; pkg3Id: string; qty3: string; kegPkgId: string; kegQty: string }>({
    pkgId: '', qty: '', pkg2Id: '', qty2: '', pkg3Id: '', qty3: '', kegPkgId: '', kegQty: '',
  });
  const openTile = (b: Beer) => {
    // Předvyplnění z řádku, který už tohle pivo má (snadné doladění počtu).
    const existing = entryRows.find((r) => r.beerId === b.id && (r.qty || r.qty2 || r.qty3 || r.kegQty));
    setTileDraft(existing ? {
      pkgId: existing.pkgId, qty: existing.qty, pkg2Id: existing.pkg2Id, qty2: existing.qty2,
      pkg3Id: existing.pkg3Id, qty3: existing.qty3, kegPkgId: existing.kegPkgId, kegQty: existing.kegQty,
    } : { pkgId: '', qty: '', pkg2Id: '', qty2: '', pkg3Id: '', qty3: '', kegPkgId: '', kegQty: '' });
    setTileBeer(b);
  };
  const closeTile = () => setTileBeer(null);
  const setTile = (field: keyof typeof tileDraft, value: string) =>
    setTileDraft((d) => ({ ...d, [field]: value }));
  const bumpTile = (field: 'qty' | 'qty2' | 'qty3' | 'kegQty', delta: number) =>
    setTileDraft((d) => {
      const cur = Number(d[field] || 0);
      const next = Math.max(0, cur + delta);
      return { ...d, [field]: next === 0 ? '' : String(next) };
    });
  // Kolik kusů (lahve + KEG) už je v zápisu pro dané pivo — pro popisek na dlaždici.
  const tileQtyFor = (beerId: string) =>
    entryRows
      .filter((r) => r.beerId === beerId)
      .reduce((s, r) => s + Number(r.qty || 0) + Number(r.qty2 || 0) + Number(r.qty3 || 0) + Number(r.kegQty || 0), 0);
  // Zápis z dlaždicového overlaye do seznamu řádků zápisu.
  const applyTile = () => {
    if (!tileBeer) return;
    const hasAny = tileDraft.qty || tileDraft.qty2 || tileDraft.qty3 || tileDraft.kegQty;
    if (!hasAny) { setErr('Zadej aspoň jedno množství (láhev nebo KEG) v dlaždici.'); return; }
    setErr(null);
    const row: RowInput = {
      beerId: tileBeer.id,
      pkgId: tileDraft.pkgId, qty: tileDraft.qty,
      pkg2Id: tileDraft.pkg2Id, qty2: tileDraft.qty2,
      pkg3Id: tileDraft.pkg3Id, qty3: tileDraft.qty3,
      kegPkgId: tileDraft.kegPkgId, kegQty: tileDraft.kegQty,
    };
    setEntryRows((prev) => {
      const next = [...prev];
      // Zapíšeme do prvního řádku s tímto pivem; jinak do příštího prázdného řádku.
      const idx = next.findIndex((r) => r.beerId === tileBeer.id);
      if (idx >= 0) { next[idx] = row; return next; }
      const emptyIdx = next.findIndex((r) => !r.beerId && !r.qty && !r.qty2 && !r.qty3 && !r.kegQty);
      if (emptyIdx >= 0) { next[emptyIdx] = row; return next; }
      return [...next, row];
    });
    setTileBeer(null);
  };

  const handleVoiceResult = (text: string) => {
    const parsed = parseFreeTextEntries(text, beers, packages, aliasMap);
    if (!parsed.length) {
      setErr('Nerozpoznal jsem žádnou položku z hlasu. Zkuste to znovu.');
      return;
    }
    setEntryRows((prev) => {
      const next = [...prev];
      let cursor = 0;
      for (const p of parsed) {
        while (cursor < next.length && (next[cursor].beerId || next[cursor].qty)) cursor++;
        if (cursor >= next.length) {
          next.push({ beerId: p.beer_id ?? '', pkgId: p.package_id ?? '', pkg2Id: '', pkg3Id: '', kegPkgId: '', kegQty: '', qty: p.quantity != null ? String(p.quantity) : '', qty2: '', qty3: '' });
        } else {
          next[cursor] = { ...next[cursor], beerId: p.beer_id ?? '', pkgId: p.package_id ?? '', qty: p.quantity != null ? String(p.quantity) : '' };
          cursor++;
        }
      }
      return next;
    });
  };

  const handleApplyPhotoRows = (parsedRows: RowInput[], dateVal?: string, photoNote?: string) => {
    setEntryRows((prev) => {
      const next = [...prev];
      parsedRows.forEach((pRow, idx) => {
        if (idx < next.length) {
          next[idx] = { ...pRow };
        } else {
          next.push({ ...pRow });
        }
      });
      return next;
    });
    if (dateVal) setDate(dateVal);
    if (photoNote) {
      setNote((prev) => (prev ? prev + ' | ' + photoNote : photoNote));
    }
  };

  // Datové sady pro výpočet potřeb stáčení (Objednávky vs. Sklad)
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [inventoryRows, setInventoryRows] = useState<any[]>([]);
  const [planCheckRows, setPlanCheckRows] = useState<any[]>([]);
  const [keggingRows, setKeggingRows] = useState<any[]>([]);
  const [fasovaniRows, setFasovaniRows] = useState<any[]>([]);
  const [prodejnaRows, setProdejnaRows] = useState<any[]>([]);
  const [writeoffsRows, setWriteoffsRows] = useState<any[]>([]);
  const [zavozDeductionRows, setZavozDeductionRows] = useState<any[]>([]);
  const [adjustmentRows, setAdjustmentRows] = useState<any[]>([]);
  const [akceRows, setAkceRows] = useState<any[]>([]);

  // Filtry pro "Potřeba stočit lahve"
  const [reqBeerFilter, setReqBeerFilter] = useState('');
  const [reqPkgFilter, setReqPkgFilter] = useState('');
  const [reqOnlyMissing, setReqOnlyMissing] = useState(true);

  const [recordsView, setRecordsView] = useState<'month' | 'week'>('month');
  const [recordsMonthKey, setRecordsMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [recordsWeekKey, setRecordsWeekKey] = useState(() => isoWeekKey(new Date().toISOString().slice(0, 10)));
  // Aktuální týden pro „Potřeba stočit lahve" (objednávky se počítají za týden, ne za měsíc)
  const [weekKey, setWeekKey] = useState(() => isoWeekKey(new Date().toISOString().slice(0, 10)));
  const weekLabel = weekRange(weekKey).label;
  // Posun měsíce o delta měsíců (vrací YYYY-MM)
  function shiftMonth(monthKey: string, delta: number): string {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  // Záložka záznamů: lahve / KEG / vše
  const [recordsTab, setRecordsTab] = useState<'lahve' | 'keg' | 'vse'>('lahve');
  const [recordsBeerFilter, setRecordsBeerFilter] = useState('');
  const [recordsPkgFilter, setRecordsPkgFilter] = useState('');

  const filteredRows = useMemo(() => {
    let result = rows;
    if (recordsView === 'month') {
      result = result.filter((r) => r.entry_date?.startsWith(recordsMonthKey));
    } else {
      result = result.filter((r) => isoWeekKey(r.entry_date) === recordsWeekKey);
    }
    if (recordsTab === 'lahve') {
      result = result.filter((r) => {
        const pkg = packages.find((p) => p.id === r.package_id);
        return !pkg || pkg.kind !== 'keg';
      });
    } else if (recordsTab === 'keg') {
      result = result.filter((r) => {
        const pkg = packages.find((p) => p.id === r.package_id);
        return pkg && pkg.kind === 'keg';
      });
    }
    if (recordsBeerFilter) {
      result = result.filter((r) => r.beer_id === recordsBeerFilter);
    }
    if (recordsPkgFilter) {
      result = result.filter((r) => r.package_id === recordsPkgFilter);
    }
    return result;
  }, [rows, recordsView, recordsMonthKey, recordsWeekKey, recordsTab, recordsBeerFilter, recordsPkgFilter, packages]);

  // Záznamy omezené jen na zvolené období (měsíc/týden) — bez filtru lahve/KEG,
  // piva a obalu. Slouží pro souhrnné karty "Přehled stočených..." nahoře,
  // aby respektovaly stejné období jako výběr týdne/měsíce níže.
  const periodRows = useMemo(() => {
    if (recordsView === 'month') {
      return rows.filter((r) => r.entry_date?.startsWith(recordsMonthKey));
    }
    return rows.filter((r) => isoWeekKey(r.entry_date) === recordsWeekKey);
  }, [rows, recordsView, recordsMonthKey, recordsWeekKey]);

  // Filtrované obaly: pouze lahve povolených velikostí
  const bottlePackages = useMemo(() =>
    packages
      .filter((p) => p.kind === 'bottle' && ALLOWED_BOTTLE_VOLUMES.some((v) => Math.abs(Number(p.volume_l) - v) < 0.01))
      .sort((a, b) => b.volume_l - a.volume_l),
  [packages]);

  // KEG obaly
  const kegPackages = useMemo(() =>
    packages
      .filter((p) => p.kind === 'keg' && KEG_SIZES.includes(Number(p.volume_l)))
      .sort((a, b) => b.volume_l - a.volume_l),
  [packages]);

  // Výpočet potřeby stočení lahví — objednávky AKTUÁLNÍHO TÝDNE vs. sklad
  // (stav v pondělí ráno + stočeno tento týden − výdej tento týden). Sdílená
  // logika s KEGy — viz packageNeeds.ts.
  // 🗓️ „Co stočit na který den" — stejná tabule jako u sudů (KEG), jen pro
  // lahve a PET. Počítá se JEN z dat aktuálního týdne, takže se každý zápis
  // stáčení projeví okamžitě (viz lib/keggingPlan.ts).
  const dennniPlanLahvi = useMemo(() => computeKeggingPlan({
    beers,
    packages,
    orders,
    orderItems,
    keggingRows: rows,          // u lahví jsou „výrobní" řádky z bottling
    zavozDeductionRows,
    fasovaniRows,
    prodejnaRows,
    writeoffsRows,
    checkRows: planCheckRows,
    weekKey,
    jeCilovyObal: (kind) => kind !== 'keg',
  }), [beers, packages, orders, orderItems, rows, zavozDeductionRows, fasovaniRows, prodejnaRows, writeoffsRows, planCheckRows, weekKey]);

  // ✅ Odškrtnutí NEZAPISUJE stáčení — je to pracovní pomůcka. Skutečné
  // stáčení se dál zapisuje v „Zápis". S doloženým stavem se skládá přes MAX,
  // aby se odškrtnutá a poté poctivě zapsaná položka nepočítala dvakrát.
  async function togglePlanCheck(day: string, beerId: string, pkgId: string, qty: number) {
    const { error } = await supabase
      .from('kegging_plan_checks')
      .upsert(
        { week_key: weekKey, day, beer_id: beerId, package_id: pkgId, qty: Math.max(0, qty), updated_at: new Date().toISOString(), updated_by: profile?.display_name ?? null },
        { onConflict: 'week_key,day,beer_id,package_id' }
      );
    if (error) { setErr(`Odškrtnutí se nepodařilo uložit: ${error.message}`); return; }
    await load(true);
  }

  const bottleRequirements = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return computePackageNeeds(
      {
        beers,
        packages,
        orders,
        orderItems,
        inventoryRows,
        bottlingRows: rows,
        keggingRows,
        fasovaniRows,
        prodejnaRows,
        writeoffsRows,
        zavozDeductionRows,
        adjustmentRows,
        akceRows,
        weekKey,
        todayStr,
      },
      (kind) => kind !== 'keg'
    );
  }, [beers, packages, orders, orderItems, inventoryRows, rows, fasovaniRows, prodejnaRows, writeoffsRows, keggingRows, zavozDeductionRows, adjustmentRows, akceRows, weekKey]);

  const filteredRequirements = useMemo(() => {
    let list = bottleRequirements;
    if (reqBeerFilter) list = list.filter((r) => r.beer_id === reqBeerFilter);
    if (reqPkgFilter) list = list.filter((r) => r.package_id === reqPkgFilter);
    if (reqOnlyMissing) list = list.filter((r) => r.neededQty > 0);
    return list;
  }, [bottleRequirements, reqBeerFilter, reqPkgFilter, reqOnlyMissing]);

  const reqTotals = useMemo(() => {
    return filteredRequirements.reduce(
      (acc, r) => {
        acc.ordered += r.orderedQty;
        acc.stock += r.stockQty;
        acc.needed += r.neededQty;
        acc.neededLiters += r.neededQty * r.volume_l;
        return acc;
      },
      { ordered: 0, stock: 0, needed: 0, neededLiters: 0 }
    );
  }, [filteredRequirements]);

  // Souhrn zapisovaných řádků
  const rowsSummary = useMemo(() => {
    let totalQty = 0;
    let totalL = 0;
    entryRows.forEach((r) => {
      const pkg1 = packages.find((p) => p.id === r.pkgId || p.id === r.kegPkgId);
      const pkg2 = packages.find((p) => p.id === r.pkg2Id);
      const pkg3 = packages.find((p) => p.id === r.pkg3Id);
      const n1 = Number(r.qty || 0);
      const n2 = Number(r.qty2 || 0);
      const n3 = Number(r.qty3 || 0);
      if (pkg1 && n1 > 0) { totalQty += n1; totalL += n1 * Number(pkg1.volume_l); }
      if (pkg2 && n2 > 0) { totalQty += n2; totalL += n2 * Number(pkg2.volume_l); }
      if (pkg3 && n3 > 0) { totalQty += n3; totalL += n3 * Number(pkg3.volume_l); }
    });
    return { totalQty, totalL };
  }, [entryRows, packages]);

  async function saveEditedRow(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRow) return;
    try {
      const selectedBeer = beers.find(b => b.id === editingRow.beer_id);
      const selectedPkg = packages.find(p => p.id === editingRow.package_id);

      const { error } = await supabase
        .from('bottling')
        .update({
          entry_date: editingRow.entry_date,
          beer_id: editingRow.beer_id,
          beer_name: selectedBeer?.name || null,
          package_id: editingRow.package_id,
          package_label: selectedPkg?.label || null,
          quantity: Number(editingRow.quantity),
          kegs_used: editingRow.kegs_used ? Number(editingRow.kegs_used) : null,
          kegs_used_package_id: editingRow.kegs_used_package_id || null,
          note: editingRow.note || null
        })
        .eq('id', editingRow.id);

      if (error) throw error;
      setEditingRow(null);
      load(true);
    } catch (err: any) {
      console.error(err);
      chyba('Chyba při ukládání změn: ' + err.message);
    }
  }

  // Naplnění vybraného úkolu stáčení do formuláře zápisu
  function fillFromPlan(plan: BottlingPlan) {
    filledPlanRef.current = plan;
    setDate(plan.planned_date);
    // „Naplnit“ přepíše CELÝ formulář zápisu vybraným úkolem (pivo + obaly + KEG):
    // úkol se naplní do řádku 1 a ostatní řádky se vyprázdní — zápis je pak
    // vždy jen o jednom úkolu a stáčeč v něm jen doladí počty (rychlá volba ks).
    setEntryRows((prev) => {
      const next = emptyRows();
      const row = {
        beerId: plan.beer_id || '',
        kegPkgId: plan.keg_pkg_id || '',
        kegQty: plan.keg_qty > 0 ? String(plan.keg_qty) : '',
        pkgId: plan.pkg_id || '',
        qty: plan.qty > 0 ? String(plan.qty) : '',
        pkg2Id: plan.pkg2_id || '',
        qty2: plan.qty2 > 0 ? String(plan.qty2) : '',
        pkg3Id: plan.pkg3_id || '',
        qty3: plan.qty3 > 0 ? String(plan.qty3) : '',
      };
      next[0] = row;
      return next;
    });
    markPlanSeenAt();
    setPlanSeenAt(Date.now());
    selectTab('zapis');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function load(silent = false) {
    const loadId = ++loadCountRef.current;
    if (!silent && !rows.length) setLoading(true);
    const [bt, b, p, ords, oi, inv, fa, fp, wo, kg, pl, zd, adj, ak, checks] = await Promise.all([
      fetchAllRows('bottling', '*').order('entry_date', { ascending: false }).order('created_at', { ascending: true }).order('id'),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      fetchAllRows('orders', 'id,order_date,delivery_date,delivery_day,place_name,status,is_delivered'),
      fetchAllRows('order_items', 'id,order_id,beer_id,package_id,quantity'),
      fetchAllRows('inventory', 'entry_date,beer_id,package_id,quantity,note'),
      fetchAllRows('fasovani', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('fasovani_private', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('writeoffs', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('kegging', 'entry_date,beer_id,package_id,quantity'),
      supabase.from('bottling_plans').select('*').order('planned_date'),
      fetchAllRows('zavoz_deductions', 'deduct_date,beer_id,package_id,quantity,order_item_id'),
      fetchAllRows('inventory_adjustments', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('akce', 'entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
      fetchAllRows('kegging_plan_checks', 'week_key,day,beer_id,package_id,qty'),
    ]);
    if (loadId !== loadCountRef.current) return;
    setRows((bt.data as EntryRow[]) ?? []);
    if (b.data) setBeers(b.data as Beer[]);
    if (p.data) setPackages(p.data as Package[]);
    if (ords.data) setOrders(ords.data);
    if (oi.data) setOrderItems(oi.data);
    if (inv.data) setInventoryRows(inv.data);
    setPlanCheckRows((checks.data as any[]) ?? []);
    if (fa.data) setFasovaniRows(fa.data);
    if (fp.data) setProdejnaRows(fp.data);
    if (wo.data) setWriteoffsRows(wo.data);
    if (kg.data) setKeggingRows(kg.data);
    if (pl.data) setPlans(pl.data);
    if (zd.data) setZavozDeductionRows(zd.data);
    if (adj.data) setAdjustmentRows(adj.data);
    if (ak.data) setAkceRows(ak.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['bottling', 'beers', 'packages', 'orders', 'order_items', 'inventory', 'fasovani', 'fasovani_private', 'writeoffs', 'kegging', 'bottling_plans', 'zavoz_deductions', 'inventory_adjustments', 'akce', 'akce_items', 'kegging_plan_checks'], () => load(true));

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    // Stejná brána jako u KEGů (Kegging.tsx) — checklist se váže na SKUTEČNÉ
    // dnešní datum (businessDateISO), ne na editovatelné pole "Datum" (`date`),
    // aby ho nešlo obejít přepnutím data na den, kde už dřív (na tomhle
    // zařízení) proběhl. Dřív tahle druhá (submit-time) kontrola u lahví
    // chyběla úplně — spoléhalo se jen na to, že formulář je schovaný za
    // branou v UI.
    if (!isStartChecklistCompleteForDate(businessDateISO())) {
      setErr('Před uložením stáčení je nutné vyplnit checklist přípravy pracoviště!');
      setChecklistPhase('start');
      setChecklistGate(true);
      setShowChecklistModal(true);
      return;
    }
    // Bez vybraného piva se záznam sice uloží, ale všechny skladové výpočty
    // ho přeskočí (filtrují `if (!beer_id || !package_id) return`) — stočené
    // lahve by tedy nikde nepřibyly a nikdo by nezjistil proč.
    const bezPiva = entryRows.filter(
      (r) => !r.beerId && (r.pkgId || r.pkg2Id || r.pkg3Id || r.kegPkgId) && (Number(r.qty) > 0 || Number(r.qty2) > 0 || Number(r.qty3) > 0)
    );
    if (bezPiva.length > 0) {
      setErr('U každého vyplněného řádku vyberte pivo — bez něj by se stočení nepromítlo do skladu.');
      return;
    }
    const filled = entryRows.filter((r) => r.beerId && (r.pkgId || r.pkg2Id || r.pkg3Id || r.kegPkgId) && (Number(r.qty) > 0 || Number(r.qty2) > 0 || Number(r.qty3) > 0));
    if (filled.length === 0) { setErr('Vyplň alespoň jeden řádek (obal a množství).'); return; }

    // Přehmat o řád (60 → 600) se jinak najde až u inventury. Neblokuje se.
    for (const r of filled) {
      const dvojice: [string | null, unknown][] = [[r.pkgId, r.qty], [r.pkg2Id, r.qty2], [r.pkg3Id, r.qty3]];
      for (const [pkgId, qty] of dvojice) {
        if (!pkgId || !(Number(qty) > 0)) continue;
        const historie = rows
          .filter((x) => x.beer_id === r.beerId && x.package_id === pkgId)
          .map((x) => Number(x.quantity || 0));
        const popis = `${beers.find((b) => b.id === r.beerId)?.name ?? 'Pivo'} · ${packages.find((p) => p.id === pkgId)?.label ?? 'obal'}`;
        const dotaz = podezreleMnozstvi(Number(qty), historie, popis);
        if (dotaz && !(await potvrd(dotaz, { titulek: 'Zkontrolujte množství', potvrdit: 'Ano, uložit' }))) return;
      }
    }

    setSaving(true);

    // Z každého řádku vytvoříme 1–3 záznamy (Lahve 1, Lahve 2 a/nebo Lahve 3).
    // Všechny sdílí stejný zdroj ze sudů (kegs_used + source_volume_l), takže
    // je možné stočit z jednoho sudu více druhů obalů najednou.
    const payloads: any[] = [];
    filled.forEach((r) => {
      const beer = beers.find((b) => b.id === r.beerId);
      const kegsUsed = Number(r.kegQty || 0);
      const kegPkg = r.kegPkgId ? packages.find((p) => p.id === r.kegPkgId) : null;
      // Zdrojový objem = počet sudů × objem sudu (např. 6×50L = 300L).
      const sourceL = kegsUsed > 0 && kegPkg ? kegsUsed * Number(kegPkg.volume_l) : 0;
      const base = {
        entry_date: date, beer_id: r.beerId || null, beer_name: beer?.name ?? null,
        kegs_used: kegsUsed > 0 ? kegsUsed : null,
        kegs_used_package_id: kegsUsed > 0 && kegPkg ? kegPkg.id : null,
        source_volume_l: sourceL > 0 ? sourceL : null,
        note: note || null,
      };
      // Lahve 1 (nebo KEG, pokud není vybrána lahev)
      const pkgId = r.pkgId || r.kegPkgId;
      const pkg = packages.find((p) => p.id === pkgId);
      const n = Number(r.qty);
      if (pkg && n > 0) {
        payloads.push({ ...base, package_id: pkgId, package_label: pkg?.label ?? null, quantity: n });
      }
      // Lahve 2 (druhý obal ze stejného sudu)
      const pkg2 = r.pkg2Id ? packages.find((p) => p.id === r.pkg2Id) : null;
      const n2 = Number(r.qty2);
      if (pkg2 && n2 > 0) {
        payloads.push({ ...base, package_id: r.pkg2Id, package_label: pkg2?.label ?? null, quantity: n2 });
      }
      // Lahve 3 (třetí obal ze stejného sudu)
      const pkg3 = r.pkg3Id ? packages.find((p) => p.id === r.pkg3Id) : null;
      const n3 = Number(r.qty3);
      if (pkg3 && n3 > 0) {
        payloads.push({ ...base, package_id: r.pkg3Id, package_label: pkg3?.label ?? null, quantity: n3 });
      }
    });

    if (payloads.length === 0) { setErr('Vyplň alespoň jeden řádek (obal a množství).'); setSaving(false); return; }

    const { error } = await supabase.from('bottling').insert(payloads);
    setSaving(false);
    if (error) { setErr(error.message); return; }

    // Auto-označení naplněného úkolu za hotový (pokud se stočilo skutečně vše, co bylo naplánované)
    const fp = filledPlanRef.current;
    if (fp) {
      filledPlanRef.current = null;
      const lineOk = (pkgId: string | null, qty: number) =>
        !pkgId || qty <= 0 ||
        payloads.some((pl) => pl.beer_id === fp.beer_id && pl.package_id === pkgId && Number(pl.quantity) >= qty);
      const kegOk =
        !fp.keg_pkg_id || fp.keg_qty <= 0 ||
        payloads.some((pl) =>
          pl.beer_id === fp.beer_id &&
          (pl.package_id === fp.keg_pkg_id
            ? Number(pl.quantity) >= fp.keg_qty
            : Number(pl.kegs_used || 0) >= fp.keg_qty)
        );
      if (lineOk(fp.pkg_id, fp.qty) && lineOk(fp.pkg2_id, fp.qty2) && lineOk(fp.pkg3_id, fp.qty3) && kegOk) {
        setPlanStatus(fp.id, 'done').then(({ error }) => {
          if (error) console.warn('Nepodařilo se automaticky označit úkol jako hotový:', error.message);
        });
      }
    }

    setEntryRows(emptyRows()); setNote(''); setErr(null);
    setFlash(true); setTimeout(() => setFlash(false), 800);
    load(true);
    setShowEndConfirm(true);
  }




  async function del(id: string) {
    // Křížek sousedí s „+" a tužkou, takže jedno chybné klepnutí smaže zápis.
    // Dřív se proto před smazáním ptalo. Ptát se pokaždé je ale otrava —
    // spolehlivější i rychlejší je smazat a pár vteřin nabídnout návrat.
    const row = rows.find((r) => r.id === id);
    const { error } = await supabase.from('bottling').delete().eq('id', id);
    if (error) {
      setErr('Smazání se nepovedlo: ' + error.message);
      return;
    }
    setRows((r) => r.filter((x) => x.id !== id));
    if (!row) return;

    zavibruj('odskrtnuto');
    toastZpet(
      `Smazáno: ${row.beer_name ?? 'pivo'} ${row.package_label ?? ''} × ${row.quantity} ks`,
      async () => {
        const { error: chybaVraceni } = await supabase.from('bottling').insert(row);
        if (chybaVraceni) throw chybaVraceni;
        setRows((r) => [row, ...r]);
        load(true);
      },
    );
  }

  async function increment(id: string, delta: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const newQty = Number(row.quantity) + delta;
    if (newQty < 0) return;
    const { error } = await supabase.from('bottling').update({ quantity: newQty }).eq('id', id);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, quantity: newQty } : r));
  }

  // Uloží počet stočených sudů (kegs_used) pro daný záznam.
  // Zároveň přepočítá zdrojový objem (source_volume_l = počet sudů × objem sudu),
  // aby vytrata (ztráta ze sudů) zůstala konzistentní.
  async function updateKegs(id: string, value: string) {
    const newKegs = Number(value);
    if (isNaN(newKegs) || newKegs < 0) return;
    const kegs = newKegs > 0 ? newKegs : null;
    const row = rows.find((r) => r.id === id);
    const kegPkg = row?.kegs_used_package_id ? packages.find((p) => p.id === row.kegs_used_package_id) : null;
    const sourceL = kegs && kegPkg ? kegs * Number(kegPkg.volume_l) : null;
    const { error } = await supabase.from('bottling').update({ kegs_used: kegs, source_volume_l: sourceL }).eq('id', id);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, kegs_used: kegs, source_volume_l: sourceL } : r));
  }

  // Identifikátor šarže (skupina záznamů ze stejného zdroje sudů).
  // Záznamy vložené najednou sdílí stejné created_at.
  function getBatchId(r: EntryRow): string {
    if (r.created_at) {
      return `${r.entry_date}_${r.beer_id}_${r.created_at.slice(0, 19)}`;
    }
    return `${r.entry_date}_${r.beer_id}_${r.kegs_used}_${r.kegs_used_package_id}`;
  }

  // Zvýší/sníží počet stočených sudů (kegs_used) pro celou šarži (všechny řádky
  // se stejným zdrojem). Zároveň přepočítá zdrojový objem (source_volume_l).
  async function incrementKegs(id: string, delta: number) {

    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const current = Number(row.kegs_used || 0);
    const newKegs = current + delta;
    if (newKegs < 0) return;
    const kegs = newKegs > 0 ? newKegs : null;
    const kegPkg = row.kegs_used_package_id ? packages.find((p) => p.id === row.kegs_used_package_id) : null;
    const sourceL = kegs && kegPkg ? kegs * Number(kegPkg.volume_l) : null;

    // Najdeme všechny řádky stejné šarže (stejný zdroj ze sudů)
    const batchId = getBatchId(row);
    const batchRows = rows.filter((r) => getBatchId(r) === batchId);
    const batchIds = batchRows.map((r) => r.id);

    const { error } = await supabase.from('bottling').update({ kegs_used: kegs, source_volume_l: sourceL }).in('id', batchIds);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => batchIds.includes(r.id) ? { ...r, kegs_used: kegs, source_volume_l: sourceL } : r));
  }

  // Změní velikost (typ) KEG sudu, ze kterého bylo stočeno, pro celou šarži.
  // Přepočítá zdrojový objem (source_volume_l = počet sudů × nový objem sudu).
  async function updateKegPackage(id: string, packageId: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const newPkg = packages.find((p) => p.id === packageId);
    if (!newPkg) return;
    const kegs = Number(row.kegs_used || 0);
    const sourceL = kegs > 0 ? kegs * Number(newPkg.volume_l) : null;

    // Najdeme všechny řádky stejné šarže (stejný zdroj ze sudů)
    const batchId = getBatchId(row);
    const batchRows = rows.filter((r) => getBatchId(r) === batchId);
    const batchIds = batchRows.map((r) => r.id);

    const { error } = await supabase.from('bottling').update({ kegs_used_package_id: packageId, source_volume_l: sourceL }).in('id', batchIds);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => batchIds.includes(r.id) ? { ...r, kegs_used_package_id: packageId, source_volume_l: sourceL } : r));
  }



  // Přehled podle velikosti lahví

  const BOTTLE_SIZES = [1.5, 1, 0.5, 0.33];

  const sizeBuckets = BOTTLE_SIZES.map((size) => {
    const sizeRows = periodRows.filter((r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return pkg && Math.abs(Number(pkg.volume_l) - size) < 0.01;
    });
    const count = sizeRows.reduce((s, r) => s + Number(r.quantity), 0);
    const liters = sizeRows.reduce((s, r) => s + Number(r.quantity) * size, 0);
    return { size, count, liters };
  });

  // Přehled podle velikosti KEG
  const kegBuckets = KEG_SIZES.map((size) => {
    const sizeRows = periodRows.filter((r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return pkg && Number(pkg.volume_l) === size;
    });
    const count = sizeRows.reduce((s, r) => s + Number(r.quantity), 0);
    const liters = sizeRows.reduce((s, r) => s + Number(r.quantity) * size, 0);
    return { size, count, liters };
  });

  // Výpočet ztráty ze sudů (vytrata) — zahrnuje:
  // 1) přímé stáčení do KEG (package je sud)
  // 2) stáčení do lahví ze sudů (kegs_used) — např. 6×50L = 300L zdroj
  const kegLossSummary = useMemo(() => {
    let totalKegCount = 0;   // počet stočených sudů (přímé KEG)
    let totalKegLiters = 0;  // litry stočené do sudů
    let totalSourceL = 0;    // celkový zdrojový objem z tanku (litry)
    let totalBottledL = 0;   // litry stočené do lahví ze sudů

    // Když se z jednoho sudu stáčí do více druhů obalů (Lahve 1 + Lahve 2),
    // vznikne více záznamů se stejným zdrojem (kegs_used). Zdroj započítáme jen jednou.
    const seenSource = new Set<string>();

    periodRows.forEach((r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      // Přímé stáčení do KEG
      if (pkg && pkg.kind === 'keg' && KEG_SIZES.includes(Number(pkg.volume_l))) {
        totalKegCount += Number(r.quantity);
        totalKegLiters += Number(r.quantity) * Number(pkg.volume_l);
        totalSourceL += Number(r.source_volume_l ?? 0);
      }
      // Stáčení do lahví ze sudů (kegs_used)
      if (r.kegs_used && r.kegs_used > 0) {
        const kegPkg = r.kegs_used_package_id ? packages.find((p) => p.id === r.kegs_used_package_id) : null;
        const sourceL = Number(r.source_volume_l ?? 0) || (kegPkg ? Number(r.kegs_used) * Number(kegPkg.volume_l) : 0);
        // Deduplikace zdroje: stejný (datum, pivo, sudy, typ sudu) = jeden zdroj
        const key = `${r.entry_date}|${r.beer_id}|${r.kegs_used}|${r.kegs_used_package_id}`;
        if (!seenSource.has(key)) {
          seenSource.add(key);
          totalSourceL += sourceL;
        }
        if (pkg) totalBottledL += Number(r.quantity) * Number(pkg.volume_l);
      }
    });

    const lossL = totalSourceL > 0 ? Math.max(totalSourceL - (totalKegLiters + totalBottledL), 0) : 0;
    const lossPct = totalSourceL > 0 ? (lossL / totalSourceL * 100) : 0;
    return { totalKegCount, totalKegLiters, totalSourceL, totalBottledL, lossL, lossPct };
  }, [periodRows, packages]);



  const otherRows = periodRows.filter((r) => {
    const pkg = packages.find((p) => p.id === r.package_id);
    return !pkg || (!BOTTLE_SIZES.some((s) => Math.abs(Number(pkg.volume_l) - s) < 0.01) && !KEG_SIZES.includes(Number(pkg.volume_l)));
  });
  const otherCount = otherRows.reduce((s, r) => s + Number(r.quantity), 0);
  const otherLiters = otherRows.reduce((s, r) => {
    const pkg = packages.find((p) => p.id === r.package_id);
    return s + (pkg ? Number(r.quantity) * Number(pkg.volume_l) : 0);
  }, 0);
  const totalCount = sizeBuckets.reduce((s, b) => s + b.count, 0) + kegBuckets.reduce((s, b) => s + b.count, 0) + otherCount;
  const totalLiters = sizeBuckets.reduce((s, b) => s + b.liters, 0) + kegBuckets.reduce((s, b) => s + b.liters, 0) + otherLiters;
  // Celkový počet použitých sudů (kegs_used) — deduplikace zdroje (jeden sud může plnit více druhů obalů)
  const totalKegs = (() => {
    const seen = new Set<string>();
    return periodRows.reduce((s, r) => {
      if (r.kegs_used && r.kegs_used > 0) {
        const key = `${r.entry_date}|${r.beer_id}|${r.kegs_used}|${r.kegs_used_package_id}`;
        if (!seen.has(key)) { seen.add(key); return s + Number(r.kegs_used); }
      }
      return s;
    }, 0);
  })();


  return (
    <div className="space-y-6 pb-12">
      {/* Top Action Bar — přilepený nahoře, ať jde přepínat záložku i uprostřed scrollování. */}
      <div className="sticky top-0 z-20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded border border-neutral-200/90 shadow-2xs">
        <div className="hidden sm:flex items-center justify-between gap-2">
          <span className="text-sm sm:text-base font-display font-black text-amber-950 flex items-center gap-1.5 shrink-0">
            <span><IkonaLahev className="ikona-text" /></span>
            <span>{mode === 'entry_only' ? 'Lahve (Stáčení)' : mode === 'overviews_only' ? 'Lahve (Přehled)' : 'Lahve (Stáčení & Přehled)'}</span>
          </span>
        </div>

        {/* Záložky: Stáčení / Přehled / Potřeba stočit lahve / Potřeba stočit KEGy */}
        {mode === 'all' && (
          <div className="flex items-center gap-1.5 p-1 rounded w-full sm:w-fit overflow-x-auto scrollbar-none flex-nowrap shrink-0">
            <button
              type="button"
              onClick={() => selectTab('zapis')}
              className={`px-3.5 py-2 rounded text-xs font-black transition shrink-0 min-h-[44px] ${tab === 'zapis' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'}`}
            >
              <span className="inline-flex items-center gap-1.5"><IkonaLahev size={14} /> Začátek stáčení</span>
              {unseenCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[11px] font-black animate-pulse">{unseenCount}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => selectTab('prehled')}
              className={`px-3.5 py-2 rounded text-xs font-black transition shrink-0 min-h-[44px] ${tab === 'prehled' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'}`}
            >
              <span className="inline-flex items-center gap-1.5"><BarChart3 size={14} /> Přehled</span>
            </button>
            <button
              type="button"
              onClick={() => selectTab('potreba')}
              className={`px-3.5 py-2 rounded text-xs font-black transition flex items-center gap-1.5 shrink-0 min-h-[44px] ${tab === 'potreba' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'}`}
            >
              <span className="inline-flex items-center gap-1.5"><ListChecks size={14} /> Potřeba stočit lahve</span>
              {bottleRequirements.some((r) => r.neededQty > 0) && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-300 text-amber-950 text-[11px] font-black animate-pulse">
                  {bottleRequirements.filter((r) => r.neededQty > 0).length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setChecklistPhase('start'); setChecklistGate(false); setShowChecklistModal(true); }}
              className="px-3.5 py-2 rounded text-xs font-black transition shrink-0 min-h-[44px] bg-amber-500 hover:bg-amber-600 text-neutral-950 flex items-center gap-1.5 shadow-2xs"
            >
              <ClipboardList size={14} />
              <span>Příprava (Checklist)</span>
            </button>
            <button
              type="button"
              onClick={() => { setChecklistPhase('end'); setChecklistGate(false); setShowChecklistModal(true); }}
              className="px-3.5 py-2 rounded text-xs font-black transition shrink-0 min-h-[44px] bg-amber-500 hover:bg-amber-600 text-neutral-950 flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles size={14} />
              <span>Konec stáčení (úklid)</span>
            </button>
            {isManager && (
              <button
                type="button"
                onClick={() => selectTab('plan')}
                className={`px-3.5 py-2 rounded text-xs font-black transition shrink-0 min-h-[44px] ${tab === 'plan' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'}`}
              >
                <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> Zadat stáčení</span>
              </button>
            )}
          </div>
        )}

          {/* Export do Excelu — vedle názvu */}
          <div className="flex items-center gap-1.5 flex-wrap">

          {(mode === 'entry_only' || (mode === 'all' && tab === 'zapis')) && isStartChecklistCompleteForDate(businessDateISO()) && (
            <>
              <button
                type="button"
                onClick={() => setShowImageImport(true)}
                className="btn-ghost !rounded !bg-white border-amber-300 text-amber-950 font-extrabold text-xs shadow-xs flex items-center gap-1.5"
              >
                <Camera size={14} /> Číst z fotky
              </button>
              <VoiceRecorder onResult={handleVoiceResult} beerNames={beers.map((b) => b.name)} />
            </>
          )}
          </div>
        </div>

      {/* Zápis stáčení — multi-row (12 řádků pivo+obal+množství najednou) */}
      {(mode === 'entry_only' || (mode === 'all' && tab === 'zapis')) && (
        <>
        <BottlingPlanBottler
          plans={plans}
          beers={beers}
          packages={packages}
          isManager={isManager}
          onChanged={() => load(true)}
          onFill={fillFromPlan}
        />
        {unseenCount > 0 && (
          <div className="card p-3 mb-4 border-2 border-rose-300 bg-rose-50/90 flex items-center justify-between gap-3">
            <span className="text-xs font-black text-rose-900">📣 {unseenCount} {unseenCount === 1 ? 'nový úkol' : 'nové úkoly'} ke stočení</span>
            <button
              type="button"
              onClick={() => { markPlanSeenAt(); setPlanSeenAt(Date.now()); }}
              className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition"
            >
              ✓ Vím
            </button>
          </div>
        )}
        {!isStartChecklistCompleteForDate(businessDateISO()) ? (
          <div className="card p-8 sm:p-12 mb-5 text-center space-y-5 border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/40">
            <div className="text-6xl"><IkonaLahev className="ikona-text" /></div>
            <div>
              <h2 className="font-display font-black text-xl sm:text-2xl text-amber-950">Začátek stáčení lahví</h2>
              <p className="text-sm text-amber-800/80 font-medium max-w-md mx-auto mt-1.5">
                Před zahájením je nutné proklikat checklist přípravy pracoviště. Pak se odemkne zadávání.
              </p>
            </div>
            <div className="max-w-xs mx-auto">
              <label className="label text-left">Datum stáčení</label>
              <input type="date" className="input text-center font-black" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <button
              type="button"
              onClick={() => { setChecklistPhase('start'); setChecklistGate(true); setShowChecklistModal(true); }}
              className="mx-auto flex items-center gap-3 px-8 py-5 sm:px-10 sm:py-6 rounded bg-amber-500 hover:bg-amber-600 text-neutral-950 font-black text-lg sm:text-xl shadow-xl active:scale-[0.97] transition"
            >
              🚀 Zahájit stáčení
            </button>
          </div>
        ) : (
        <form onSubmit={add} className={`card px-2 py-3 mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-emerald-500/20' : ''}`}>
          <div className="flex items-center gap-2 mb-4">
            <label className="label !mb-0 shrink-0">Datum</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {/* 🍺 Piva — dlaždice (klikni na pivo → obaly a množství) */}
          <div className="mb-2">
            <span className="text-[11px] text-neutral-400 font-medium">klepni na dlaždici a zadej obaly a množství</span>
          </div>
          <div className="mb-4">
            <BeerTileGrid
              beers={beers.filter((b) => b.is_active)}
              onSelect={openTile}
              summaryFor={(b) => {
                const row = entryRows.find((r) => r.beerId === b.id);
                if (!row) return { filled: false, label: '' };
                const parts: string[] = [];
                const addPart = (pkgId: string, qtyStr: string) => {
                  const n = Number(qtyStr);
                  if (!pkgId || !(n > 0)) return;
                  const pkg = packages.find((p) => p.id === pkgId);
                  if (pkg) parts.push(`${n}×${Math.round(Number(pkg.volume_l) * 100) / 100}`);
                };
                addPart(row.pkgId, row.qty);
                addPart(row.pkg2Id, row.qty2);
                addPart(row.pkg3Id, row.qty3);
                addPart(row.kegPkgId, row.kegQty);
                return { filled: parts.length > 0, label: parts.join(', ') };
              }}
            />
          </div>

          {/* 🔲 Plnoobrazovkový panel — výběr obalů a množství pro zvolené pivo */}
          {tileBeer && (
            <BeerTilePanel
              beer={tileBeer}
              onClose={closeTile}
              headerRight={tileDraft.kegPkgId ? (
                <span className="text-xs font-bold text-white/90 bg-black/20 rounded-full px-2 py-0.5 shrink-0">
                  <IkonaSud className="ikona-text" /> zdroj: {kegPackages.find((p) => p.id === tileDraft.kegPkgId)?.label || 'KEG'}
                </span>
              ) : undefined}
              footer={
                <div className="flex items-center gap-2 pt-1">
                  <button type="button" onClick={applyTile} className="btn-primary !rounded flex-1 text-xs font-black shadow-md min-h-[44px]"><Plus className="ikona-text" /> Přidat do zápisu</button>
                  <button type="button" onClick={closeTile} className="btn-ghost !rounded text-xs font-bold min-h-[44px] px-3">Zpět</button>
                </div>
              }
            >
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-neutral-500 mb-1.5"><IkonaLahev className="ikona-text" /> Lahve (až 3 druhy)</div>
                <div className="space-y-2">
                  {tileSlots.map((slot) => {
                    const pkgId = tileDraft[slot.pkg];
                    const qtyStr = tileDraft[slot.qty];
                    const quickQtys = stackingQuickQtys(bottlePackages.find((p) => p.id === pkgId));
                    return (
                      <div key={slot.key} className="flex items-center justify-between gap-2 rounded border border-neutral-200 dark:border-neutral-700 py-1.5 px-2 flex-wrap">
                        <select
                          className="input text-xs font-bold w-28 p-1.5 rounded border border-amber-300 bg-white"
                          value={pkgId}
                          onChange={(e) => setTile(slot.pkg, e.target.value)}
                        >
                          <option value="">— obal {slot.key} —</option>
                          {bottlePackages.map((p) => (
                            <option key={p.id} value={p.id}>{p.label || `${p.volume_l}L`}</option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1">
                          {quickQtys.map((q) => (
                            <button
                              key={q}
                              type="button"
                              onClick={() => setTile(slot.qty, String(q))}
                              title="Rychlá volba množství"
                              className={`h-7 min-w-[1.75rem] px-1.5 rounded text-[11px] font-black transition ${Number(qtyStr) === q ? 'bg-emerald-500 text-white' : 'bg-neutral-100 dark:bg-neutral-700 hover:bg-emerald-200 text-neutral-600 dark:text-neutral-200 hover:text-emerald-950'}`}
                            >
                              {q}
                            </button>
                          ))}
                          <button type="button" onClick={() => bumpTile(slot.qty, -1)} className="w-9 h-9 grid place-items-center rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-black text-xl transition select-none">−</button>
                          <input
                            type="number" onWheel={(e) => e.currentTarget.blur()}
                            min={0}
                            inputMode="numeric"
                            className="w-16 h-9 text-center bg-white dark:bg-neutral-900/60 border border-amber-300 dark:border-neutral-700 text-neutral-950 dark:text-neutral-100 font-black text-sm rounded"
                            value={qtyStr}
                            onChange={(e) => setTile(slot.qty, e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="0"
                          />
                          <button type="button" onClick={() => bumpTile(slot.qty, 1)} className="w-9 h-9 grid place-items-center rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-black text-xl transition select-none">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* KEG zdroj — odečet sudů */}
              <div className="rounded border border-sky-200 bg-sky-50/70 p-2.5 space-y-1.5">
                <div className="text-[11px] font-black uppercase tracking-wider text-sky-900"><IkonaSud className="ikona-text" /> Zdrojový KEG (odečet sudů)</div>
                <select
                  className="input text-xs font-bold w-full p-1.5 rounded border border-sky-300 bg-white"
                  value={tileDraft.kegPkgId}
                  onChange={(e) => setTile('kegPkgId', e.target.value)}
                >
                  <option value="">— žádný —</option>
                  {kegPackages.map((p) => (
                    <option key={p.id} value={p.id}>KEG {p.volume_l}L</option>
                  ))}
                </select>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold uppercase text-neutral-500">Počet sudů</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => bumpTile('kegQty', -1)} className="w-9 h-9 grid place-items-center rounded bg-sky-100 hover:bg-sky-200 text-sky-800 font-black text-xl transition select-none">−</button>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      min={0}
                      inputMode="numeric"
                      className="w-16 h-9 text-center bg-white border border-sky-300 text-neutral-950 font-black text-sm rounded"
                      value={tileDraft.kegQty}
                      onChange={(e) => setTile('kegQty', e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="0"
                    />
                    <button type="button" onClick={() => bumpTile('kegQty', 1)} className="w-9 h-9 grid place-items-center rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-black text-xl transition select-none">+</button>
                  </div>
                </div>
              </div>
            </BeerTilePanel>
          )}

          {/* 📋 Souhrn zápisu — pod dlaždicemi, editovatelný jako dlaždice */}
          {(() => {
            type SummaryLine = { rowIndex: number; field: 'qty' | 'qty2' | 'qty3' | 'kegQty'; beerId: string; label: string; qty: number };
            const lines: SummaryLine[] = [];
            entryRows.forEach((r, i) => {
              if (!r.beerId) return;
              const beer = beers.find((b) => b.id === r.beerId);
              const pushLine = (field: SummaryLine['field'], pkgId: string, qtyStr: string, isKeg: boolean) => {
                const qty = Number(qtyStr);
                if (!pkgId || !(qty > 0)) return;
                const pkg = (isKeg ? kegPackages : bottlePackages).find((p) => p.id === pkgId);
                lines.push({ rowIndex: i, field, beerId: r.beerId, label: `${formatPackageLabel(pkg?.label)} · ${beerName(beer)}`, qty });
              };
              pushLine('qty', r.pkgId, r.qty, false);
              pushLine('qty2', r.pkg2Id, r.qty2, false);
              pushLine('qty3', r.pkg3Id, r.qty3, false);
              pushLine('kegQty', r.kegPkgId, r.kegQty, true);
            });
            if (lines.length === 0) return null;
            const updateQty = (rowIndex: number, field: SummaryLine['field'], value: string) =>
              setEntryRows((rs) => rs.map((row, idx) => (idx === rowIndex ? { ...row, [field]: value } : row)));
            return (
              <div className="mt-4 border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-neutral-800 p-3">
                <div className="text-xs font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300 mb-2">
                  <ClipboardList className="ikona-text" /> Zápis stáčení ({lines.reduce((s, l) => s + l.qty, 0)} ks)
                </div>
                <ul className="space-y-1.5">
                  {lines.map((l, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-2 bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/70 dark:border-neutral-700 px-2.5 py-1.5">
                      <button
                        type="button"
                        onClick={() => { const b = beers.find((bb) => bb.id === l.beerId); if (b) openTile(b); }}
                        className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-100 text-left truncate"
                        title="Klikni pro úpravu v dlaždici"
                      >
                        <span className="shrink-0">{l.qty}×</span>
                        <span className="truncate">{l.label}</span>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => updateQty(l.rowIndex, l.field, String(Math.max(0, l.qty - 1)))} className="w-10 h-10 grid place-items-center rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-black text-xl transition disabled:opacity-30 select-none" disabled={l.qty <= 1}>−</button>
                        <input
                          type="number" onWheel={(e) => e.currentTarget.blur()}
                          min={0}
                          inputMode="numeric"
                          value={l.qty}
                          placeholder="0"
                          onChange={(e) => updateQty(l.rowIndex, l.field, e.target.value.replace(/[^0-9]/g, ''))}
                          className="w-14 h-10 text-center text-base font-black text-neutral-800 dark:text-neutral-100 bg-white dark:bg-neutral-900/60 border-2 border-amber-200 dark:border-neutral-700 rounded"
                          title="Napiš počet ručně"
                        />
                        <button type="button" onClick={() => updateQty(l.rowIndex, l.field, String(l.qty + 1))} className="w-10 h-10 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-black text-xl transition select-none">+</button>
                        <button type="button" onClick={() => updateQty(l.rowIndex, l.field, '0')} className="w-10 h-10 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-black text-xl transition select-none" title="Odebrat položku">✕</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-2 border-t border-neutral-100">
            <div className="flex items-center gap-2 flex-wrap">
              <button type="submit" disabled={saving} className="btn-primary !rounded !from-emerald-600 !to-emerald-700 hover:!from-emerald-500 hover:!to-emerald-600 !shadow-emerald-600/30 text-xs font-black shadow-md min-h-[44px] px-5">
                {saving ? 'Ukládám…' : 'Uložit stáčení lahví'}
              </button>
              <button type="button" className="btn-ghost !rounded text-xs font-bold min-h-[44px] px-3.5" onClick={() => setEntryRows(emptyRows())}><Trash2 className="ikona-text" /> Vymazat vše</button>
            </div>
            {err && <span className="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded border border-rose-200">{err}</span>}
          </div>
        </form>
        )}
        </>
      )}

      {/* Plánování stáčení — zadání úkolů „co je potřeba stočit" (admin/sládek/šéf) */}
      {mode === 'all' && tab === 'plan' && (
        isManager ? (
          <BottlingPlanPlanner
            plans={plans}
            beers={beers}
            packages={packages}
            orders={orders}
            orderItems={orderItems}
            inventoryRows={inventoryRows}
            rows={rows}
            fasovaniRows={fasovaniRows}
            prodejnaRows={prodejnaRows}
            writeoffsRows={writeoffsRows}
            keggingRows={keggingRows}
            onChanged={() => load(true)}
          />
        ) : (
          <div className="card p-4 text-sm text-neutral-600">Nemáte oprávnění k plánování stáčení.</div>
        )
      )}

      {/* Přehled: Stočeno lahví — velikosti */}
      {(mode === 'overviews_only' || (mode === 'all' && tab === 'prehled')) && rows.length > 0 && (
        <div className="card p-3 mb-4 border-2 border-emerald-300/80 bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display font-black text-amber-950 text-xs"><IkonaLahev className="ikona-text" /> Přehled stočených lahví</span>
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">
              {recordsView === 'week' ? weekRange(recordsWeekKey).label : recordsMonthKey}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {sizeBuckets.map((b) => (
              <div key={b.size} className="flex items-center gap-1 bg-emerald-100/80 rounded px-2.5 py-1.5 border border-emerald-300/60 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-950 whitespace-nowrap">{b.size}L</span>
                <span className="text-xs font-black text-emerald-800">{b.count} ks</span>
                <span className="text-[11px] text-emerald-700/70">({b.liters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
              </div>
            ))}
            {otherCount > 0 && (
              <div className="flex items-center gap-1 bg-emerald-100/80 rounded px-2.5 py-1.5 border border-emerald-300/60 shadow-2xs">
                <span className="text-[11px] font-bold text-emerald-950 whitespace-nowrap">Ostatní</span>
                <span className="text-xs font-black text-emerald-800">{otherCount} ks</span>
              </div>
            )}
            <div className="flex items-center gap-1 bg-emerald-200/80 rounded px-2.5 py-1.5 border border-emerald-400/60 shadow-2xs">
              <span className="text-[11px] font-bold text-emerald-950 whitespace-nowrap"><PackageIcon className="ikona-text" /> Celkem</span>
              <span className="text-xs font-black text-emerald-800">{totalCount} ks</span>
              <span className="text-[11px] text-emerald-700/70">({totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
            </div>
          </div>
        </div>
      )}

      {/* Přehled: Stočeno KEG — velikosti + ztráta */}
      {(mode === 'overviews_only' || (mode === 'all' && tab === 'prehled')) && rows.length > 0 && kegBuckets.some((b) => b.count > 0) && (
        <div className="card p-3 mb-4 border-2 border-amber-300/80 bg-white">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display font-black text-amber-950 text-xs"><IkonaSud className="ikona-text" /> Přehled stočených KEG</span>
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">
              {recordsView === 'week' ? weekRange(recordsWeekKey).label : recordsMonthKey}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {kegBuckets.filter((b) => b.count > 0).map((b) => (
              <div key={b.size} className="flex items-center gap-1 bg-amber-100/80 rounded px-2.5 py-1.5 border border-amber-300/60 shadow-2xs">
                <span className="text-[11px] font-bold text-amber-950 whitespace-nowrap">KEG {b.size}L</span>
                <span className="text-xs font-black text-amber-800">{b.count} ks</span>
                <span className="text-[11px] text-amber-700/70">({b.liters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
              </div>
            ))}
          </div>

          {/* Ztráta ze sudů (vytrata) — přímé KEG + stáčení do lahví ze sudů */}
          {kegLossSummary.totalSourceL > 0 && (
            <div className="rounded border border-rose-300/80 bg-rose-50/90 p-3">
              <div className="text-xs font-black text-rose-800 mb-2 flex items-center gap-1.5">
                <span><BarChart3 className="ikona-text" /></span>
                <span>Vytrata (ze sudů vs. stočeno)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-white/80 rounded px-2.5 py-1.5 border border-rose-200/60">
                  <span className="text-rose-600 font-semibold">Stočeno do KEG</span>
                  <div className="font-black text-rose-900">{kegLossSummary.totalKegCount} ks ({kegLossSummary.totalKegLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</div>
                </div>
                <div className="bg-white/80 rounded px-2.5 py-1.5 border border-rose-200/60">
                  <span className="text-rose-600 font-semibold">Stočeno do lahví ze sudů</span>
                  <div className="font-black text-rose-900">{kegLossSummary.totalBottledL.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L</div>
                </div>
                <div className="bg-white/80 rounded px-2.5 py-1.5 border border-rose-200/60">
                  <span className="text-rose-600 font-semibold">Ze sudů (zdroj)</span>
                  <div className="font-black text-rose-900">{kegLossSummary.totalSourceL.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L</div>
                </div>

                <div className="bg-white/80 rounded px-2.5 py-1.5 border border-rose-200/60">
                  <span className="text-rose-600 font-semibold">Ztráta</span>
                  <div className="font-black text-rose-900">{kegLossSummary.lossL.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L ({kegLossSummary.lossPct.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %)</div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Všechny záznamy stáčení lahví / KEG */}
      {(mode === 'overviews_only' || (mode === 'all' && tab === 'prehled')) && (
        <div className="mt-0 space-y-3">
        {/* Přilepeno pod hlavní listou záložek, ať jde přepínat obdobi/filtry i uprostřed scrollování dlouhé tabulky níže. */}
        <div className="sticky top-0 z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-neutral-100 py-1.5 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="text-xs font-black uppercase tracking-wider text-amber-950/60 flex items-center gap-2">
            <span><ClipboardList className="ikona-text" /></span>
            <span>
              {recordsTab === 'lahve'
                ? 'Všechny záznamy stáčení lahví'
                : recordsTab === 'keg'
                ? 'Všechny záznamy stáčení KEG sudů'
                : 'Všechny záznamy stáčení (Lahve & KEG)'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {rows.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setRecordsTab('lahve')}
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded border transition ${
                    recordsTab === 'lahve'
                      ? 'bg-emerald-200 border-emerald-300 text-emerald-950'
                      : 'bg-white border-neutral-200 text-neutral-600'
                  }`}
                >
                  <Wine size={13} /> Lahve
                </button>
                <button
                  type="button"
                  onClick={() => setRecordsTab('keg')}
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded border transition ${
                    recordsTab === 'keg'
                      ? 'bg-amber-200 border-amber-300 text-amber-950'
                      : 'bg-white border-neutral-200 text-neutral-600'
                  }`}
                >
                  <Cylinder size={13} /> KEG
                </button>
                <button
                  type="button"
                  onClick={() => setRecordsTab('vse')}
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded border transition ${
                    recordsTab === 'vse'
                      ? 'bg-amber-200 border-amber-300 text-amber-950'
                      : 'bg-white border-neutral-200 text-neutral-600'
                  }`}
                >
                  <PackageIcon size={13} /> Vše
                </button>
                <button
                  type="button"
                  onClick={() => setRecordsView('month')}
                  className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded border transition ${
                    recordsView === 'month'
                      ? 'bg-amber-200 border-amber-300 text-amber-950'
                      : 'bg-white border-neutral-200 text-neutral-600'
                  }`}
                >
                  <CalendarDays size={13} /> Měsíc
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setRecordsView('week')}
                    className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded border transition ${
                      recordsView === 'week'
                        ? 'bg-amber-200 border-amber-300 text-amber-950'
                        : 'bg-white border-neutral-200 text-neutral-600'
                    }`}
                  >
                    <CalendarDays size={13} /> Týden
                  </button>
                  {recordsView === 'week' ? (
                    <>
                      <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, -1))} className="w-11 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-base transition shrink-0">‹</button>
                      <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, 1))} className="w-11 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-base transition shrink-0">›</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setRecordsMonthKey(shiftMonth(recordsMonthKey, -1))} className="w-11 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-base transition shrink-0">‹</button>
                      <span className="text-xs font-bold text-amber-950 px-1 whitespace-nowrap">{recordsMonthKey}</span>
                      <button onClick={() => setRecordsMonthKey(shiftMonth(recordsMonthKey, 1))} className="w-11 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-base transition shrink-0">›</button>
                    </>
                  )}
                </div>
              </>
            )}
            {rows.length > 0 && <span className="chip bg-amber-100/60 text-amber-900/70 text-xs font-bold">{filteredRows.length} záznamů</span>}
          </div>
        </div>

        {/* Filtr Druh piva a Obal */}
        {rows.length > 0 && (
          <div className="sticky top-[32px] z-10 flex flex-wrap items-center gap-2.5 bg-amber-100/60 p-2.5 rounded border border-amber-200/90 shadow-2xs">
            <div className="flex items-center gap-1.5 shrink-0 min-w-[150px] max-w-[240px]">
              <span className="text-xs font-bold text-amber-950/80 shrink-0"><BeerIcon className="ikona-text" /> Pivo:</span>
              <select
                value={recordsBeerFilter}
                onChange={(e) => setRecordsBeerFilter(e.target.value)}
                className="input text-xs font-bold py-1 px-2 rounded bg-white border-amber-300 text-amber-950 focus:border-amber-500 shadow-2xs w-full"
              >
                <option value="">Všechna piva</option>
                {beers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 min-w-[150px] max-w-[240px]">
              <span className="text-xs font-bold text-amber-950/80 shrink-0"><PackageIcon className="ikona-text" /> Obal:</span>
              <select
                value={recordsPkgFilter}
                onChange={(e) => setRecordsPkgFilter(e.target.value)}
                className="input text-xs font-bold py-1 px-2 rounded bg-white border-amber-300 text-amber-950 focus:border-amber-500 shadow-2xs w-full"
              >
                <option value="">Všechny obaly</option>
                {(recordsTab === 'lahve'
                  ? bottlePackages
                  : recordsTab === 'keg'
                  ? kegPackages
                  : packages
                ).map((p) => (
                  <option key={p.id} value={p.id}>{p.label || `${p.volume_l}L`}</option>
                ))}
              </select>
            </div>

            {(recordsBeerFilter || recordsPkgFilter) && (
              <button
                type="button"
                onClick={() => { setRecordsBeerFilter(''); setRecordsPkgFilter(''); }}
                className="text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded transition shrink-0 ml-auto whitespace-nowrap"
              >
                ✕ Vymazat filtry
              </button>
            )}
          </div>
        )}

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState text="Zatím žádné záznamy. Přidej první výše." icon="📝" />
        ) : filteredRows.length === 0 ? (
          <EmptyState text="Žádné záznamy pro toto období." icon="📅" />
        ) : (() => {
          const sortedRows = [...filteredRows].sort((a, b) => {
            const dateCmp = (b.entry_date ?? '').localeCompare(a.entry_date ?? '');
            if (dateCmp !== 0) return dateCmp;
            return (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id);
          });
          const totalCount = sortedRows.reduce((s, r) => s + Number(r.quantity), 0);
          const totalLiters = sortedRows.reduce((s, r) => {
            const pkg = packages.find((p) => p.id === r.package_id);
            return s + (pkg ? Number(r.quantity) * Number(pkg.volume_l) : 0);
          }, 0);
          const seenKegsTotal = new Set<string>();
          const totalKegs = sortedRows.reduce((s, r) => {
            if (r.kegs_used && r.kegs_used > 0) {
              const bId = r.created_at
                ? `${r.entry_date}_${r.beer_id}_${r.created_at.slice(0, 19)}`
                : `${r.entry_date}_${r.beer_id}_${r.kegs_used}_${r.kegs_used_package_id}`;
              if (!seenKegsTotal.has(bId)) { seenKegsTotal.add(bId); return s + Number(r.kegs_used); }
            }
            return s;
          }, 0);
          const seenKegBatches = new Set<string>();
          // Samostatná sada pro mobilní karty — jinak by sdílený stav se
          // desktop tabulkou způsobil, že by po vykreslení karet byly
          // všechny dávky v tabulce mylně označené jako "stejná dávka".
          const seenKegBatchesMobile = new Set<string>();

          function formatDate(d: string | null | undefined) {
            if (!d) return '—';
            const parts = d.split('-');
            if (parts.length < 3) return d;
            return `${parts[2]}.${parts[1]}.`;
          }

          return (

            <div className="card p-4 border-2 border-amber-300/80 bg-white">
              <h3 className="font-display font-black text-amber-950 text-sm mb-3">
                <IkonaLahev className="ikona-text" /> {recordsView === 'month' ? `Měsíc ${recordsMonthKey}` : `Týden ${recordsWeekKey}`}
              </h3>

              {/* Mobilní karty */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {sortedRows.map((r) => {
                  const beer = beers.find((b) => b.id === r.beer_id);
                  const pkg = packages.find((p) => p.id === r.package_id);
                  const kegPkg = r.kegs_used_package_id ? packages.find((p) => p.id === r.kegs_used_package_id) : null;
                  const vol = pkg ? Number(pkg.volume_l) : 0;
                  const liters = Number(r.quantity) * vol;
                  const bId = getBatchId(r);
                  const isFirstInBatch = !seenKegBatchesMobile.has(bId);
                  if (r.kegs_used && r.kegs_used > 0) seenKegBatchesMobile.add(bId);
                  return (
                    <div key={r.id} className="rounded border border-amber-300/80 bg-white p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                          <span className="font-black text-sm text-amber-950 truncate">{r.beer_name ?? beer?.name ?? '—'}</span>
                        </div>
                        <span className="shrink-0 font-mono font-bold text-xs text-amber-800">{formatDate(r.entry_date)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-amber-700">{pkg?.label ?? '—'}</span>
                        <span className="font-display font-black text-xl text-amber-950">{r.quantity} ks</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-center">
                        <div className="rounded bg-amber-100/70 py-1.5">
                          <div className="text-[11px] font-black uppercase text-amber-700">Litry</div>
                          <div className="text-sm font-black text-amber-900">{liters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}</div>
                        </div>
                        <div className="rounded bg-amber-100/70 py-1.5 flex items-center justify-center gap-1">
                          {isFirstInBatch ? (
                            <>
                              <button type="button" onClick={() => incrementKegs(r.id, -1)} className="w-7 h-7 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-800 font-black text-sm transition">−</button>
                              <span className="text-sm font-black text-amber-900">{r.kegs_used && r.kegs_used > 0 ? r.kegs_used : 0} <IkonaSud className="ikona-text" /></span>
                              <button type="button" onClick={() => incrementKegs(r.id, 1)} className="w-7 h-7 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-900 font-black text-sm transition">+</button>
                            </>
                          ) : (
                            <span className="text-[11px] font-bold text-amber-600">〃 stejná dávka</span>
                          )}
                        </div>
                      </div>
                      {isFirstInBatch && (
                        <select
                          value={kegPkg?.id ?? ''}
                          onChange={(e) => updateKegPackage(r.id, e.target.value)}
                          className="input !py-1.5 text-xs font-bold w-full"
                          title="Změnit velikost KEG sudu"
                        >
                          <option value="">— Zdrojový KEG —</option>
                          {kegPackages.map((p) => (<option key={p.id} value={p.id}>KEG {p.volume_l}L</option>))}
                        </select>
                      )}
                      <div className="flex items-center gap-1.5 pt-1 border-t border-amber-100">
                        <button type="button" onClick={() => increment(r.id, -1)} className="w-11 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-lg transition">−</button>
                        <button type="button" onClick={() => increment(r.id, 1)} className="w-11 min-h-[44px] grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-black text-lg transition">+</button>
                        <button type="button" onClick={() => setEditingRow(r)} className="flex-1 min-h-[44px] rounded bg-sky-100 hover:bg-sky-200 text-sky-800 font-black text-xs transition"><Pencil className="ikona-text" /> Upravit</button>
                        <button type="button" onClick={() => del(r.id)} className="w-11 min-h-[44px] grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-black text-lg transition">✕</button>
                      </div>
                    </div>
                  );
                })}
                <div className="rounded bg-amber-200/60 p-3 space-y-1 font-black text-amber-950 text-sm">
                  <div className="flex items-center justify-between"><span><PackageIcon className="ikona-text" /> Celkem</span><span>{totalCount} ks</span></div>
                  <div className="flex items-center justify-between text-xs font-bold text-amber-800">
                    <span>{totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L</span>
                    <span>{totalKegs > 0 ? `${totalKegs} sudů` : '—'}</span>
                  </div>
                </div>
              </div>

              <div className="hidden md:block rounded border border-amber-300/80 bg-amber-50/90 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-amber-300/80 bg-amber-100/80">
                      <th className="text-left py-1.5 px-2 font-black text-amber-950">Datum</th>
                      <th className="text-left py-1.5 px-2 font-black text-amber-950">Pivo</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Lahve</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Ks</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">KEG</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950"><IkonaSud className="ikona-text" /> Sudů</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Litry</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r, index) => {
                      const beer = beers.find((b) => b.id === r.beer_id);
                      const pkg = packages.find((p) => p.id === r.package_id);
                      const kegPkg = r.kegs_used_package_id ? packages.find((p) => p.id === r.kegs_used_package_id) : null;
                      const vol = pkg ? Number(pkg.volume_l) : 0;
                      const liters = Number(r.quantity) * vol;

                      const bId = getBatchId(r);
                      const isFirstInBatch = !seenKegBatches.has(bId);
                      if (r.kegs_used && r.kegs_used > 0) {
                        seenKegBatches.add(bId);
                      }

                      // Zjistíme, zda předchozí řádek patřil do stejné šarže
                      const prevRow = index > 0 ? sortedRows[index - 1] : null;
                      const isSameBatchAsPrev = prevRow && getBatchId(prevRow) === bId;

                      return (
                        <tr
                          key={r.id}
                          className={`border-b transition-colors ${
                            isSameBatchAsPrev
                              ? 'border-amber-200/40 bg-amber-50/40 hover:bg-amber-100/60'
                              : 'border-amber-300/70 bg-amber-100/20 hover:bg-amber-100/70'
                          }`}
                        >
                          <td className="py-1.5 px-2 font-mono font-bold text-amber-950 whitespace-nowrap">
                            {!isSameBatchAsPrev ? formatDate(r.entry_date) : <span className="text-neutral-400 font-normal">〃</span>}
                          </td>
                          <td className="py-1.5 px-2 font-bold text-amber-950 flex items-center gap-1.5">
                            {!isSameBatchAsPrev ? (
                              <>
                                <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                                <span className="truncate max-w-[120px]">{r.beer_name ?? beer?.name ?? '—'}</span>
                              </>
                            ) : (
                              <span className="text-amber-800/60 pl-3 font-mono text-[11px]">└─ <span className="truncate max-w-[100px] inline-block align-bottom text-amber-950 font-bold">{r.beer_name ?? beer?.name ?? '—'}</span></span>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right font-semibold text-amber-900 whitespace-nowrap">{pkg?.label ?? '—'}</td>
                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">{r.quantity}</td>
                          <td className="py-1.5 px-2 text-right font-semibold text-amber-900 whitespace-nowrap">
                            {isFirstInBatch ? (
                              <select
                                value={kegPkg?.id ?? ''}
                                onChange={(e) => updateKegPackage(r.id, e.target.value)}
                                className="text-xs font-bold py-0.5 px-1 rounded bg-white border border-amber-300 text-amber-950 focus:border-amber-500 shadow-2xs"
                                title="Změnit velikost KEG sudu"
                              >
                                <option value="">— Vyber KEG —</option>
                                {kegPackages.map((p) => (
                                  <option key={p.id} value={p.id}>KEG {p.volume_l}L</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-neutral-400 font-normal">—</span>
                            )}
                          </td>

                          <td className="py-1.5 px-2 text-right">
                            {isFirstInBatch ? (
                              <div className="inline-flex items-center gap-0.5 justify-end">
                                <button
                                  type="button"
                                  onClick={() => incrementKegs(r.id, -1)}
                                  className="w-6 h-6 grid place-items-center rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-xs transition"
                                  title="Snížit počet sudů"
                                >−</button>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-950 border border-amber-400/60 text-xs font-black shadow-2xs min-w-[24px] justify-center">
                                  {r.kegs_used && r.kegs_used > 0 ? r.kegs_used : 0}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => incrementKegs(r.id, 1)}
                                  className="w-6 h-6 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold text-xs transition"
                                  title="Zvýšit počet sudů"
                                >+</button>
                              </div>
                            ) : (
                              <span className="text-neutral-400 font-normal">—</span>
                            )}
                          </td>


                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">{liters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}</td>
                          <td className="py-1.5 px-2 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <button type="button" onClick={() => increment(r.id, -1)} className="w-6 h-6 grid place-items-center rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold text-xs transition">−</button>
                              <button type="button" onClick={() => increment(r.id, 1)} className="w-6 h-6 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold text-xs transition">+</button>
                              <button type="button" onClick={() => setEditingRow(r)} className="w-6 h-6 grid place-items-center rounded bg-sky-100 hover:bg-sky-200 text-sky-700 font-bold text-xs transition" title="Upravit detail"><Pencil size={11} /></button>
                              <button type="button" onClick={() => del(r.id)} className="w-6 h-6 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs transition">✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Souhrnný řádek */}
                    <tr className="bg-amber-200/60 font-black">
                      <td className="py-1.5 px-2 font-black text-amber-950"></td>
                      <td className="py-1.5 px-2 font-black text-amber-950"><PackageIcon className="ikona-text" /> Celkem</td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950"></td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalCount}</td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950"></td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalKegs > 0 ? totalKegs : '—'}</td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}</td>
                      <td className="py-1.5 px-2 text-right"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
        </div>
      )}

      {/* TAB 3: POTŘEBA STOČIT LAHVE */}
      {(mode === 'overviews_only' || (mode === 'all' && tab === 'potreba')) && (
        <div className="space-y-4">
          {/* Tabule po dnech — stejná jako u sudů. Odpovídá na „co stočit
              dnes", ne jen „kolik chybí za celý týden". */}
          <KeggingDayPlan
            plans={dennniPlanLahvi}
            weekLabel={weekLabel}
            todayISO={businessDateISO()}
            onCheck={togglePlanCheck}
            canEdit
            jednotka="lahví"
            onShowOrders={(beerId, packageId) => { requestOrdersItemFilter({ beerId, packageId }); setPage?.('orders'); }}
          />

          {/* Souhrnné karty */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-4 bg-white border border-neutral-200 rounded space-y-1">
              <span className="text-[11px] font-black uppercase text-neutral-500">Objednáno tento týden</span>
              <div className="font-display font-black text-xl text-sky-700">{reqTotals.ordered} ks</div>
              <span className="text-[11px] text-neutral-500">Aktivní objednávky s dovozem {weekLabel}</span>
            </div>
            <div className="card p-4 bg-white border border-neutral-200 rounded space-y-1">
              <span className="text-[11px] font-black uppercase text-neutral-500">Na skladě</span>
              <div className="font-display font-black text-xl text-emerald-700">{reqTotals.stock} ks</div>
              <span className="text-[11px] text-neutral-500">Disponibilní zásoby</span>
            </div>
            <div className="card p-4 bg-white border border-neutral-200 rounded space-y-1">
              <span className="text-[11px] font-black uppercase text-neutral-500">Potřeba stočit tento týden (chybí)</span>
              <div className="font-display font-black text-xl text-neutral-900 flex items-baseline gap-1.5">
                {reqTotals.needed > 0 ? (
                  <span className="px-2 py-0.5 rounded bg-rose-600 text-white">{reqTotals.needed} ks</span>
                ) : (
                  <span className="text-emerald-700">0 ks</span>
                )}
                <span className="text-sm font-bold text-neutral-500">({reqTotals.neededLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</span>
              </div>
              <span className="text-[11px] text-neutral-500">{reqTotals.needed > 0 ? 'Objednáno víc, než je na skladě' : '✓ Všechny objednávky týdne pokryty'}</span>
            </div>
          </div>

          {/* Filtry & Tabulka */}
          <div className="card p-4 bg-white border border-neutral-200 rounded space-y-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                <span><IkonaLahev className="ikona-text" /></span>
                <span>Lahve k dotočení tento týden ({weekLabel})</span>
              </h3>
              <p className="text-[11px] text-neutral-500 w-full sm:w-auto">
                Počítá se vždy pro aktuální týden: objednávky s dovozem {weekLabel} − lahve na skladě
                (stav v pondělí ráno + stočeno tento týden − výdej tento týden). Čerstvé stočení se
                projeví okamžitě po uložení, v novém týdnu se počítá znovu z nových objednávek.
              </p>

            </div>

            <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 bg-white py-2 -mx-4 px-4 border-b border-neutral-200/70 sm:mx-0 sm:px-0 sm:border-b-0">
                {/* Filtr Pivo */}
                <select
                  value={reqBeerFilter}
                  onChange={(e) => setReqBeerFilter(e.target.value)}
                  className="input text-xs font-bold px-2.5 py-1.5 rounded border border-neutral-200 bg-white text-neutral-800 shrink-0"
                >
                  <option value="">Všechna piva</option>
                  {beers.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>

                {/* Filtr Obal */}
                <select
                  value={reqPkgFilter}
                  onChange={(e) => setReqPkgFilter(e.target.value)}
                  className="input text-xs font-bold px-2.5 py-1.5 rounded border border-neutral-200 bg-white text-neutral-800 shrink-0"
                >
                  <option value="">Všechny obaly</option>
                  {packages.filter((p) => p.kind !== 'keg').map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>

                {/* Přepínač: Jen chybějící */}
                <button
                  type="button"
                  onClick={() => setReqOnlyMissing(!reqOnlyMissing)}
                  className={`px-3 py-1.5 rounded text-xs font-black transition border shrink-0 whitespace-nowrap ${
                    reqOnlyMissing
                      ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                      : 'bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200'
                  }`}
                >
                {reqOnlyMissing ? 'Jen chybějící (> 0)' : 'Všechny položky'}
              </button>
            </div>

            {/* Tabulka */}
            {filteredRequirements.length === 0 ? (
              <EmptyState text={reqOnlyMissing ? 'Žádné chybějící lahve! Všechny objednané lahve jsou pokryté na skladě.' : 'Žádné položky k zobrazení.'} icon="🎉" />
            ) : (
              <>
              {/* Na telefonu karty: osm sloupců se do 375 px nevejde a
                  vodorovné rolování v tabulce znamená, že „kolik stočit"
                  je schované za okrajem — přitom je to jediné číslo,
                  kvůli kterému se sem chodí. */}
              <ul className="sm:hidden space-y-2">
                {filteredRequirements.map((r) => {
                  const beer = beers.find((b) => b.id === r.beer_id);
                  const chybi = r.neededQty > 0;
                  return (
                    <li
                      key={`m-${r.beer_id}__${r.package_id}`}
                      className={`rounded border p-3 ${chybi ? 'border-rose-300 bg-rose-50/60' : 'border-neutral-200 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-display font-black text-sm text-neutral-950 flex items-center gap-1.5 flex-wrap">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                            <span>{r.beer_name}</span>
                            <span className="px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-800 font-black text-xs">{r.package_label}</span>
                          </div>
                          <div className="text-[11px] font-bold text-neutral-600 mt-1">
                            Skladem <span className="font-mono text-emerald-800">{r.stockQty}</span>
                            {' · '}objednáno <span className="font-mono text-sky-800">{r.orderedQty}</span>
                          </div>
                          <div className="text-[11px] font-bold text-neutral-400 mt-0.5 font-mono">
                            {r.invQty} poč. +{r.bottledQty} stočeno −{r.outgoingQty} výdej
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-mono font-black text-2xl leading-none ${chybi ? 'text-rose-700' : 'text-emerald-600'}`}>
                            {chybi ? r.neededQty : '✓'}
                          </div>
                          {chybi && <div className="text-[11px] font-black text-rose-700 uppercase mt-0.5">stočit</div>}
                        </div>
                      </div>
                      {chybi && (
                        <button
                          type="button"
                          onClick={() => {
                            requestOrdersItemFilter({ beerId: r.beer_id, packageId: r.package_id });
                            setPage?.('orders');
                          }}
                          className="w-full mt-2.5 min-h-[44px] rounded bg-rose-100 text-rose-800 font-black text-xs border border-rose-300 hover:bg-rose-200 active:bg-rose-300 inline-flex items-center justify-center gap-1.5"
                        >
                          Kam to jde — zobrazit objednávky
                          <ArrowRight size={14} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <div className="hidden sm:block overflow-x-auto scrollbar-thin rounded border border-neutral-200">
                <table className="table text-xs w-full">
                  <thead>
                    <tr className="bg-neutral-100 border-b border-neutral-200 shadow-xs">
                      <th className="p-2.5 text-left">Pivo (obal)</th>
                      <th className="p-2.5 text-right font-bold text-neutral-600">Poč. stav</th>
                      <th className="p-2.5 text-right font-bold text-emerald-800">Stočeno (+)</th>
                      <th className="p-2.5 text-right font-bold text-amber-800">Výdeje (−)</th>
                      <th className="p-2.5 text-right font-bold text-emerald-900 bg-emerald-50">Skladem (=)</th>
                      <th className="p-2.5 text-right font-bold text-sky-800">Objednáno (týden)</th>
                      <th className="p-2.5 text-right font-black text-rose-800 bg-rose-50">Potřeba stočit</th>
                      <th className="p-2.5 text-center font-bold">Stav</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequirements.map((r) => {
                      const beer = beers.find((b) => b.id === r.beer_id);
                      return (
                        <tr
                          key={`${r.beer_id}__${r.package_id}`}
                          onClick={r.neededQty > 0 ? () => {
                            requestOrdersItemFilter({ beerId: r.beer_id, packageId: r.package_id });
                            setPage?.('orders');
                          } : undefined}
                          title={r.neededQty > 0 ? `Zobrazit v přehledu objednávek objednávky s ${r.beer_name} (${r.package_label})` : undefined}
                          className={`border-b border-neutral-100 transition-colors ${r.neededQty > 0 ? 'cursor-pointer hover:bg-rose-50' : 'hover:bg-neutral-50/80'}`}
                        >
                          <td className="p-2.5 font-black text-neutral-950">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                              <span>{r.beer_name}</span>
                              <span className="px-1.5 py-0.5 rounded-md bg-neutral-100 text-neutral-800 font-black text-xs">{r.package_label}</span>
                            </div>
                          </td>
                          <td className="p-2.5 text-right font-mono text-neutral-600">{r.invQty} ks</td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-700">+{r.bottledQty} ks</td>
                          <td className="p-2.5 text-right font-mono font-bold text-amber-700">−{r.outgoingQty} ks</td>
                          <td className="p-2.5 text-right font-mono font-black text-emerald-900 bg-emerald-50/50">{r.stockQty} ks</td>
                          <td className="p-2.5 text-right font-mono font-bold text-sky-700">{r.orderedQty} ks</td>
                          <td className={`p-2.5 text-right font-mono font-black bg-rose-50/50 ${r.neededQty > 0 ? 'text-rose-700 text-sm' : 'text-neutral-500'}`}>
                            {r.neededQty > 0 ? `${r.neededQty} ks` : '0 ks'}
                          </td>
                          <td className="p-2.5 text-center">
                            {r.neededQty > 0 ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requestOrdersItemFilter({ beerId: r.beer_id, packageId: r.package_id });
                                  setPage?.('orders');
                                }}
                                title={`Zobrazit v přehledu objednávek objednávky s ${r.beer_name} (${r.package_label})`}
                                className="px-2.5 py-1 rounded bg-rose-100 text-rose-800 font-black text-[11px] border border-rose-300 whitespace-nowrap transition cursor-pointer hover:bg-rose-200 active:bg-rose-300"
                              >
                                <AlertTriangle className="ikona-text" /> Chybí {r.neededQty} ks →
                              </button>
                            ) : (
                              <span className="px-2.5 py-1 rounded bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300 whitespace-nowrap">
                                ✓ Pokryto
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
            {filteredRequirements.length > 0 && (
              <p className="text-[11px] text-neutral-500 pt-1">
                <Lightbulb className="ikona-text" /> Kliknutím na řádek s chybějícími položkami se přepnete do <b>Přehledu objednávek</b> filtrovaného na dané pivo + obal — uvidíte, kam objednávky jdou.
              </p>
            )}
          </div>
        </div>
      )}
      <BottlingChecklistModal
        isOpen={showChecklistModal}
        onClose={() => {
          setChecklistGate(false);
          setChecklistInitialCategory(null);
          setShowChecklistModal(false);
          // Po splnění brány „1. Začátek stáčení" se v posledním týdnu měsíce
          // automaticky otevře okno s měsíčním checklistem („4. Měsíční údržba"),
          // dokud není pro dané datum kompletně odškrtnutý.
          if (checklistGate && checklistPhase === 'start' && isLastWeekOfMonth(businessDateISO())) {
            if (!isMonthlyChecklistCompleteForDate(businessDateISO())) {
              setChecklistPhase('monthly');
              setChecklistInitialCategory(MONTHLY_CATEGORY);
              setShowChecklistModal(true);
            }
          }
          // Automatický zápis do „Sanitárního deníku lahví" po dokončení
          // checklistu „Začátek stáčení" (příprava pracoviště, louh/oplach),
          // „Konec stáčení" (denní proplach/louh) a „Měsíční údržba" (louh na
          // cestách): odškrtnuté položky se promítnou do deníku.
          if (checklistPhase === 'end' || checklistPhase === 'monthly' || checklistPhase === 'start') {
            let checkedMap: Record<string, boolean> = {};
            try {
              const raw = localStorage.getItem('bottling_checklist_' + businessDateISO());
              if (raw) checkedMap = JSON.parse(raw);
            } catch {}
            const checkedItems = DEFAULT_ITEMS.filter((it) => checkedMap[it.id]).map((it) => ({
              id: it.id,
              text: it.text,
            }));
            if (checkedItems.length > 0) {
              void autoLogBottleSanitationFromChecklist({
                dateStr: businessDateISO(),
                checkedItems,
                performedBy: profile?.display_name || '',
              });
            }
          }
        }}
        dateStr={businessDateISO()}
        phase={checklistPhase}
        blockCloseUntilStartDone={checklistGate}
        initialCategory={checklistInitialCategory ?? undefined}
        onApplyNote={(nText: string) => setNote((prev) => (prev ? prev + ' | ' + nText : nText))}
        showSkip={isManager}
      />
      {showImageImport && (
        
      <ImportBottlingFromImage
          isOpen={showImageImport}
          onClose={() => setShowImageImport(false)}
          beers={beers}
          packages={packages}
          onImport={handleApplyPhotoRows}
        />
      )}
      {editingRow && (
        <Modal open={true} onClose={() => setEditingRow(null)} title="Upravit záznam stáčení lahví">
          <form onSubmit={saveEditedRow} className="space-y-4">
            <div>
              <label className="label">Datum</label>
              <input
                type="date"
                value={editingRow.entry_date}
                onChange={(e) => setEditingRow({ ...editingRow, entry_date: e.target.value })}
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Pivo</label>
              <select
                value={editingRow.beer_id || ''}
                onChange={(e) => setEditingRow({ ...editingRow, beer_id: e.target.value })}
                className="input"
                required
              >
                <option value="">— Vyber pivo —</option>
                {beers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Obal</label>
              <select
                value={editingRow.package_id || ''}
                onChange={(e) => setEditingRow({ ...editingRow, package_id: e.target.value })}
                className="input"
                required
              >
                <option value="">— Vyber obal —</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Množství (ks)</label>
              <input
                type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                value={editingRow.quantity}
                onChange={(e) => setEditingRow({ ...editingRow, quantity: Number(e.target.value) })}
                className="input"
                min="0"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Odpis z tanku (KEG)</label>
                <select
                  value={editingRow.kegs_used_package_id || ''}
                  onChange={(e) => setEditingRow({ ...editingRow, kegs_used_package_id: e.target.value || null })}
                  className="input"
                >
                  <option value="">— Vyber KEG —</option>
                  {packages.filter(p => p.kind === 'keg').map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Počet sudů</label>
                <input
                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                  value={editingRow.kegs_used || ''}
                  onChange={(e) => setEditingRow({ ...editingRow, kegs_used: e.target.value ? Number(e.target.value) : null })}
                  className="input"
                  min="0"
                />
              </div>
            </div>
            <div>
              <label className="label">Poznámka</label>
              <input
                type="text"
                value={editingRow.note || ''}
                onChange={(e) => setEditingRow({ ...editingRow, note: e.target.value })}
                className="input"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditingRow(null)} className="btn-secondary">Zrušit</button>
              <button type="submit" className="btn-primary !rounded">Uložit změny</button>
            </div>
          </form>
        </Modal>
      )}
      {showEndConfirm && (
        <Modal open onClose={() => setShowEndConfirm(false)} title="Dokončeno stáčení lahví">
          <div className="space-y-4 text-center py-2">
            <p className="text-sm font-semibold text-neutral-700">
              Stáčení lahví bylo úspěšně uloženo do databáze.
            </p>
            <h3 className="font-display font-black text-base text-neutral-900">
              Budete dnes ještě pokračovat ve stáčení lahví, nebo končíte?
            </h3>
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-3">
              <button
                onClick={() => {
                  setShowEndConfirm(false);
                }}
                className="px-5 py-3 rounded bg-amber-500 hover:bg-amber-600 text-neutral-950 font-black text-xs transition shadow-md"
              >
                <RefreshCw className="ikona-text" /> Budu pokračovat ve stáčení
              </button>
              <button
                onClick={() => {
                  setShowEndConfirm(false);
                  setChecklistPhase('end');
                  setChecklistGate(false);
                  setShowChecklistModal(true);
                }}
                className="px-5 py-3 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-300 font-black text-xs transition shadow-md"
              >
                🧹 Končím (otevřít Úklidový checklist)
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
