import { synchronizuj } from '../lib/checklistData';
import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase, Beer, Package, EntryRow, CellarTank, KegPrefuk, useRealtime, beerBg, beerText, beerName, pkgBg, pkgText, formatPackageLabel, fetchAllRows } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { KeggingChecklistModal, KeggingChecklistBody, isStartChecklistCompleteForKeg, isMonthlyChecklistCompleteForKeg } from '../components/KeggingChecklistModal';
import { autoLogKegSanitationFromChecklist, isLastWeekOfMonth } from '../lib/kegSanitation';
import { getMonthKey, writeMonthlyCleanupStage, isMonthlyLineDone, markMonthlyLineDone } from '../lib/monthlyCleanup';
import { businessDateISO } from '../lib/businessDate';
import { EmptyState, Spinner, Modal } from '../components/ui';
import { isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';
import { exportKeggingToExcel } from '../lib/excel';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { parseFreeTextEntries, loadAliasMap, emptyAliasMap, type ParserAliasMap } from '../lib/orderParser';
import { requestOrdersItemFilter } from '../lib/ordersFilter';
import { computeKeggingPlan } from '../lib/keggingPlan';
import { BottlingPlanBottler } from '../components/BottlingPlanBottler';
import { markPlanSeenAt, type BottlingPlan } from '../lib/bottlingPlans';
import KeggingDayPlan from '../components/KeggingDayPlan';
import { AlertTriangle, BarChart3, Beer as BeerIcon, Brush, Calendar, CalendarDays, Camera, Check, ClipboardList, Copy, Cylinder, Loader2, Minus, Package as PackageIcon, PenLine, Pencil, Play, Plus, RefreshCw, Scroll, Sparkles, Trash2, X } from 'lucide-react';
import { ImportKeggingFromImage } from '../components/ImportKeggingFromImage';
import { BeerTileGrid, BeerTilePanel } from '../components/BeerTileGrid';
import { chyba, potvrd, toastZpet } from '../lib/toast';
import { nejvetsiTank, radkyBezTanku, tankRadku, tankyProPivo } from '../lib/tankUZapisu';
import { podezreleMnozstvi } from '../lib/kontrolaZadani';
import { IkonaSud } from '../components/ikony';
import { zavibruj } from '../lib/haptika';
import { consumeKegFixRequest } from '../lib/stockFixSignal';
import { klicVyberu, nactiNaposled, zapamatujVyber, serazPodleNaposled } from '../lib/naposledyPouzite';
import { usePosledniNacteni, prvniChyba } from '../lib/nacitani';


const ROW_COUNT = 12;
type RowInput = { beerId: string; pkgId: string; qty: string; tankId: string };
const emptyItem = (): RowInput => ({ beerId: '', pkgId: '', qty: '', tankId: '' });
const emptyRows = (): RowInput[] => Array.from({ length: ROW_COUNT }, emptyItem);

// Rychlé hodnoty počtu sudů v rozbalovacím poli (6/12/18/24/30/36 ks)
const QUICK_KEG_QTY = [6, 12, 18, 24];

export default function KeggingScreen({ setPage, mode = 'all', initialSubTab }: { setPage?: (p: any, sec?: string, sub?: string) => void; mode?: 'entry_only' | 'overviews_only' | 'all'; initialSubTab?: string } = {}) {
  const [rows, setRows] = useState<EntryRow[]>([]);
  // Úkoly zadané sládkem/šéfem (tabulka bottling_plans). Dřív je viděli jen
  // stáčeči lahví — u sudů se zadaná práce nikde neukazovala, i když v úkolu
  // sudová část byla.
  const [plany, setPlany] = useState<BottlingPlan[]>([]);
  const [cellarTanks, setCellarTanks] = useState<CellarTank[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRow, setEditingRow] = useState<EntryRow | null>(null);

  const { profile } = useAuth();
  const isManager = profile?.role === 'admin' || (profile?.role as any) === 'sladek' || (profile?.role as any) === 'sef';
  // 🔁 Naposledy použitá piva u TOHOTO člověka jdou v dlaždicích dopředu
  // (viz lib/naposledyPouzite.ts). Zbytek zůstává v pořadí číselníku, ať
  // se pivo, které naposledy nepoužil, hledá tam, kde ho vždycky měl.
  const klicPiv = klicVyberu('kegging', profile?.id);
  const [naposledPiva, setNaposledPiva] = useState<string[]>(() => nactiNaposled(klicPiv));


  // Zápis / Přehled / Potřeba stočit KEGy / Přefuk KEG / Checklist záložky
  const [tab, setTab] = useState<'zapis' | 'prehled' | 'plan' | 'prefuk' | 'checklist'>((initialSubTab as any) || 'zapis');

  // Sync ze subTab v historii (viz App.tsx) — jinak tlačítko Zpět z téhle
  // záložky nevrátí předchozí záložku, ale rovnou vyskočí do menu.
  useEffect(() => {
    setTab((initialSubTab as any) || 'zapis');
  }, [initialSubTab]);

  function selectTab(t: 'zapis' | 'prehled' | 'plan' | 'prefuk' | 'checklist') {
    if (setPage) setPage('kegging', undefined, t);
    else setTab(t);
  }

  // 📋 Checklist states
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [checklistGate, setChecklistGate] = useState(false);
  const [checklistPhase, setChecklistPhase] = useState<'start' | 'end' | 'monthly'>('start');
  const [checklistInitialCategory, setChecklistInitialCategory] = useState<string | null>(null);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');

  const [entryRows, setEntryRows] = useState<RowInput[]>(emptyRows());
  // ✅ Brána „bez checklistu nezapíšeš stáčení" čte lokální zrcadlo synchronně.
  // Bez tohohle srovnání by na zařízení, kde dnes checklist nikdo neotevřel,
  // tvrdila, že chybí — i když ho kolega proklikal jinde.
  const [checklistSrovnan, setChecklistSrovnan] = useState(0);
  useEffect(() => {
    void synchronizuj('kegy', businessDateISO()).then(() => setChecklistSrovnan((n) => n + 1));
  }, []);

  const [expandedKegBeerId, setExpandedKegBeerId] = useState<string | null>(null);
  const expandedKegBeer = beers.find((b) => b.id === expandedKegBeerId) ?? null;
  const [saving, setSaving] = useState(false);

  // 🔀 „Sklad" → „Nesedí evidence" → „Doplnit stočení" (Stock.tsx). Rovnou
  // rozbalí to pivo v dlaždicové mřížce, ať ho člověk nemusí sám hledat.
  useEffect(() => {
    const beerId = consumeKegFixRequest();
    if (beerId) setExpandedKegBeerId(beerId);
     
  }, []);
  const [err, setErr] = useState<string | null>(null);
  /** Nepodařilo se načíst data (na rozdíl od „data jsou, ale žádná"). */
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [showImageImport, setShowImageImport] = useState(false);
  const [aliasMap, setAliasMap] = useState<ParserAliasMap>(emptyAliasMap());
  useEffect(() => { loadAliasMap().then(setAliasMap).catch(() => {}); }, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');



  // Datové sady pro výpočet potřeb KEG sudů (Objednávky vs. Sklad)
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [fasovaniRows, setFasovaniRows] = useState<any[]>([]);
  const [prodejnaRows, setProdejnaRows] = useState<any[]>([]);
  const [writeoffsRows, setWriteoffsRows] = useState<any[]>([]);
  const [zavozDeductionRows, setZavozDeductionRows] = useState<any[]>([]);
  // Jen kvůli poli kegs_used (KEGy spotřebované jako zdroj stáčení lahví) —
  // viz komentář u KegNeedsInput.bottlingRows v kegNeeds.ts.
  const [bottlingRows, setBottlingRows] = useState<any[]>([]);
  // Ruční odškrtnutí v plánu stáčení — pracovní pomůcka, ne evidence stáčení.
  const [planCheckRows, setPlanCheckRows] = useState<any[]>([]);

  // Filtry pro "Potřeba stočit KEGy"

  // Přefuk KEG sudů (přelití ze sudů jedné velikosti do jiných)
  const [prefukRows, setPrefukRows] = useState<KegPrefuk[]>([]);
  const [pfDate, setPfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pfBeerId, setPfBeerId] = useState('');
  const [pfFromPkgId, setPfFromPkgId] = useState('');
  const [pfFromCount, setPfFromCount] = useState('');
  const [pfToPkgId, setPfToPkgId] = useState('');
  const [pfToCount, setPfToCount] = useState('');
  const [pfNote, setPfNote] = useState('');
  const [pfSaving, setPfSaving] = useState(false);
  const [pfErr, setPfErr] = useState<string | null>(null);

  // Přehled záznamů: filtr podle období (den/týden/měsíc) + filtr podle piva

  // Výchozí je TÝDEN — v jednom dni často není nic stočené (stáčí se v cyklech),
  // takže „den" by se otvíral prázdný. Den a měsíc jsou o klik vedle.
  const [recordsView, setRecordsView] = useState<'day' | 'week' | 'month'>('week');
  const [recordsWeekKey, setRecordsWeekKey] = useState(() => isoWeekKey(new Date().toISOString().slice(0, 10)));
  const [recordsMonthKey, setRecordsMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [recordsDay, setRecordsDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [beerFilter, setBeerFilter] = useState('');
  const [recordPkgFilter, setRecordPkgFilter] = useState('');
  // Filtr piva a obalu pro souhrn "Stočeno KEG za týden" v záložce Zápis (nezávislý na beerFilter/recordPkgFilter v Přehledu).
  const [weekBeerFilter, setWeekBeerFilter] = useState('');
  const [weekPkgFilter, setWeekPkgFilter] = useState('');

  // Posun měsíce o delta měsíců (vrací YYYY-MM)
  function shiftMonth(monthKey: string, delta: number): string {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return d.toISOString().slice(0, 7);
  }

  // Posun dne o delta dní (vrací YYYY-MM-DD)
  function shiftDay(day: string, delta: number): string {
    const d = new Date(day + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
  }

  const filteredRows = useMemo(() => {
    // Minusové položky (ruční opravy přepočtu) se v přehledu stáčení
    // nezobrazují — je to seznam toho, co se stočilo, ne účetní deník oprav.
    let result = rows.filter((r) => Number(r.quantity) > 0);
    if (recordsView === 'month') {
      result = result.filter((r) => r.entry_date?.startsWith(recordsMonthKey));
    } else if (recordsView === 'week') {
      result = result.filter((r) => isoWeekKey(r.entry_date) === recordsWeekKey);
    } else {
      result = result.filter((r) => r.entry_date === recordsDay);
    }
    if (beerFilter) {
      result = result.filter((r) => r.beer_id === beerFilter || r.beer_name === beerFilter);
    }
    if (recordPkgFilter) {
      result = result.filter((r) => r.package_id === recordPkgFilter || r.package_label === recordPkgFilter);
    }
    return result;
  }, [rows, recordsView, recordsMonthKey, recordsWeekKey, recordsDay, beerFilter, recordPkgFilter]);


  const [weekKey, setWeekKey] = useState(isoWeekKey(new Date().toISOString().slice(0, 10)));
  const weekLabel = weekRange(weekKey).label;


  const kegPackages = useMemo(() => packages.filter((p) => p.kind === 'keg').sort((a, b) => b.volume_l - a.volume_l), [packages]);

  // Aktivní sklepní tanky (stáčí se z nich) — status active nebo emptying
  const activeCellarTanks = useMemo(() => cellarTanks.filter((t) => t.status === 'active' || t.status === 'emptying'), [cellarTanks]);

  // Tanky, na kterých bylo zahájeno stáčení (kegging_active = true) — jediné,
  // které se nabízejí v poli "Číslo tanku" (stáčení se odečítá JEN z nich).
  const keggingActiveTanks = useMemo(() => cellarTanks.filter((t) => t.kegging_active === true), [cellarTanks]);

  // Pravidlo „ze kterého tanku se stáčí" bydlí v lib/tankUZapisu.ts — obrazovka
  // ho jen volá. Bylo rozepsané na dvou místech a rozejít se nesmí: podle něj
  // se řádku přiřadí tank A ZÁROVEŇ se z tanku odečte objem.
  function activeTanksForBeer(beerId: string): CellarTank[] {
    return tankyProPivo(cellarTanks, beerId);
  }
  function largestTank(tanks: CellarTank[]): CellarTank | undefined {
    return nejvetsiTank(tanks);
  }

  // Zadávání přes dlaždice piv: čte/zapisuje do stejného pole entryRows (fixní
  // řádky) jako tabulka níže — najde existující řádek pro dané pivo+obal, jinak
  // použije první prázdný slot. Tabulka pod dlaždicemi zůstává pro ruční úpravy
  // (např. dva řádky stejného piva/obalu z různých tanků).
  function tileQtyFor(beerId: string, pkgId: string): number {
    const row = entryRows.find((r) => r.beerId === beerId && r.pkgId === pkgId);
    return row ? Number(row.qty || 0) : 0;
  }
  function setTileRow(beerId: string, pkgId: string, patch: Partial<RowInput>) {
    setEntryRows((rs) => {
      const idx = rs.findIndex((r) => r.beerId === beerId && r.pkgId === pkgId);
      if (idx >= 0) return rs.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      const emptyIdx = rs.findIndex((r) => !r.beerId && !r.pkgId);
      const base: RowInput = { beerId, pkgId, qty: '', tankId: '' };
      if (emptyIdx >= 0) return rs.map((r, i) => (i === emptyIdx ? { ...base, ...patch } : r));
      return [...rs, { ...base, ...patch }];
    });
  }

  // Souhrn zapisovaných řádků: celkový počet ks a litrů podle vyplněných řádků formuláře
  const rowsSummary = useMemo(() => {
    let totalQty = 0;
    let totalL = 0;
    entryRows.forEach((r) => {
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      if (pkg && n > 0) { totalQty += n; totalL += n * Number(pkg.volume_l); }
    });
    return { totalQty, totalL };
  }, [entryRows, packages]);

  // Souhrn odečtu podle tanku pro pivo na každém řádku. Řádek použije buď ručně vybraný
  // tank (r.tankId), nebo automaticky největší aktivní tank s tímto pivem.
  const rowTankPreview = useMemo(() => {
    const perTank = new Map<string, number>();
    let missingCount = 0;
    let ambiguousCount = 0;
    entryRows.forEach((r) => {
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      if (!pkg || !(n > 0) || !r.beerId) return;
      const rowTanks = activeTanksForBeer(r.beerId);
      if (rowTanks.length === 0) { missingCount++; return; }
      if (rowTanks.length > 1) ambiguousCount++;
      const tank = (r.tankId ? rowTanks.find((t) => t.id === r.tankId) : undefined) ?? largestTank(rowTanks);
      if (!tank) { missingCount++; return; }
      const l = n * Number(pkg.volume_l);
      perTank.set(tank.id, (perTank.get(tank.id) ?? 0) + l);
    });
    return { perTank, missingCount, ambiguousCount };
  }, [entryRows, packages, activeCellarTanks]);

  async function saveEditedRow(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRow) return;
    try {
      const selectedBeer = beers.find(b => b.id === editingRow.beer_id);
      const selectedPkg = packages.find(p => p.id === editingRow.package_id);
      const newQty = Number(editingRow.quantity);
      const newTankId = editingRow.cellar_tank_id || null;
      // Nový zdrojový objem stejným vzorcem jako při vzniku záznamu (add()) —
      // bez tanku se objem neváže na nic a needeukuje se.
      const newSourceL = selectedPkg && newTankId ? newQty * Number(selectedPkg.volume_l) : 0;

      // Původní stav záznamu (před úpravou) — potřeba pro vrácení objemu
      // starému tanku, pokud se tank/množství/obal změnily. Dřív se objem
      // tanku při plné úpravě záznamu vůbec nepřepočítal (ani starému, ani
      // novému tanku), takže se natrvalo rozjel.
      const original = rows.find((r) => r.id === editingRow.id);
      const oldTankId = original?.cellar_tank_id || null;
      const oldSourceL = Number(original?.source_volume_l ?? 0);

      const { error } = await supabase
        .from('kegging')
        .update({
          entry_date: editingRow.entry_date,
          beer_id: editingRow.beer_id,
          beer_name: selectedBeer?.name || null,
          package_id: editingRow.package_id,
          package_label: selectedPkg?.label || null,
          quantity: newQty,
          cellar_tank_id: newTankId,
          source_volume_l: newSourceL || null,
          note: editingRow.note || null
        })
        .eq('id', editingRow.id);

      if (error) throw error;

      if (oldTankId && oldSourceL) await adjustTankVolume(oldTankId, oldSourceL);
      if (newTankId && newSourceL) await adjustTankVolume(newTankId, -newSourceL);

      setEditingRow(null);
      load(true);
    } catch (err: any) {
      console.error(err);
      chyba('Chyba při ukládání změn: ' + err.message);
    }
  }

  // Zámek proti zápisu ze zastaralého načtení — viz lib/nacitani.ts.
  const zacniNacteni = usePosledniNacteni();
  async function load(silent = false) {
    const smiZapsat = zacniNacteni();
    if (!silent && !rows.length) setLoading(true);
    // 🚚 Co se tady načítá, se musí i používat. Do 5. 9. 2026 se tahaly
    // navíc `inventory`, `inventory_adjustments` a `akce` — jejich výsledek
    // se uložil do stavu, který nikdo nikdy nepřečetl. Byly to tři z
    // sedmnácti dotazů při každém otevření obrazovky A při každém přenačtení
    // z realtime, tedy i pokaždé, když někdo jiný cokoliv uložil.
    const [kg, ct, b, p, ords, oi, fa, fp, wo, pf, zd, bt, pc, ukoly] = await Promise.all([
      fetchAllRows('kegging', '*').order('entry_date', { ascending: false }).order('created_at', { ascending: true }).order('id'),
      supabase.from('cellar_tanks').select('*').order('label'),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      // delivery_day + place_name potřebuje denní plán stáčení (keggingPlan.ts):
      // bez delivery_day by všechny objednávky spadly na den podle delivery_date
      // a ručně přehozený den závozu by se ignoroval.
      fetchAllRows('orders', 'id,order_date,delivery_date,delivery_day,place_name,status,is_delivered'),
      fetchAllRows('order_items', 'id,order_id,beer_id,package_id,quantity'),
      fetchAllRows('fasovani', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('fasovani_private', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('writeoffs', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('keg_prefuk', '*').order('entry_date', { ascending: false }).order('created_at', { ascending: true }).order('id'),
      fetchAllRows('zavoz_deductions', 'deduct_date,beer_id,package_id,quantity,order_item_id'),
      fetchAllRows('bottling', 'entry_date,beer_id,package_id,quantity,kegs_used,kegs_used_package_id,source_volume_l,note,created_at'),
      fetchAllRows('kegging_plan_checks', 'week_key,day,beer_id,package_id,qty'),
      supabase.from('bottling_plans').select('*').order('planned_date'),
    ]);
    // Mezitím mohlo začít novější načtení (realtime po cizím zápisu),
    // nebo už obrazovka není vidět. Výsledek se pak zahodí.
    if (!smiZapsat()) return;
    // Selhaný dotaz se dřív tvářil jako prázdný seznam — `?? []` chybu
    // spolklo a obrazovka řekla „zatím žádné stočení", i když se jen
    // nepodařilo načíst. Teď se rozliší.
    setChybaNacteni(prvniChyba(kg, ct, b, p, ords, oi));
    setRows((kg.data as EntryRow[]) ?? []);
    setPlany((ukoly.data as BottlingPlan[]) ?? []);
    setCellarTanks((ct.data as CellarTank[]) ?? []);
    if (b.data) setBeers(b.data as Beer[]);
    if (p.data) setPackages(p.data as Package[]);
    if (ords.data) setOrders(ords.data);
    if (oi.data) setOrderItems(oi.data);
    if (fa.data) setFasovaniRows(fa.data);
    if (fp.data) setProdejnaRows(fp.data);
    if (wo.data) setWriteoffsRows(wo.data);
    if (pf.data) setPrefukRows(pf.data as KegPrefuk[]);
    if (zd.data) setZavozDeductionRows(zd.data);
    if (bt.data) setBottlingRows(bt.data);
    if (pc.data) setPlanCheckRows(pc.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  // Odběr musí sedět s tím, co se načítá — jinak přenačítáme kvůli datům,
  // která obrazovka nikde nepoužije. `inventory`, `inventory_adjustments`,
  // `akce` a `akce_items` odsud vypadly spolu s dotazy na ně.
  useRealtime(['kegging', 'cellar_tanks', 'beers', 'packages', 'orders', 'order_items', 'fasovani', 'fasovani_private', 'writeoffs', 'keg_prefuk', 'zavoz_deductions', 'bottling', 'kegging_plan_checks'], () => load(true));


  // 🗓️ Plán stáčení po dnech — „co stočit na středu". Na rozdíl od
  // kegRequirements výše nestojí na měsíčním skladovém modelu, takže se do něj
  // nepromítne schodek z minulých měsíců a čerstvé stáčení se odečte přesně
  // o zapsané množství (viz lib/keggingPlan.ts).
  const keggingPlan = useMemo(() => computeKeggingPlan({
    beers,
    packages,
    orders,
    orderItems,
    keggingRows: rows,
    zavozDeductionRows,
    fasovaniRows,
    prodejnaRows,
    writeoffsRows,
    checkRows: planCheckRows,
    weekKey,
  }), [beers, packages, orders, orderItems, rows, zavozDeductionRows, fasovaniRows, prodejnaRows, writeoffsRows, planCheckRows, weekKey]);

  const planMissingTotal = useMemo(() => keggingPlan.reduce((s, p) => s + p.totalMissing, 0), [keggingPlan]);

  // „Naplnit do zápisu" — sudová část úkolu se předepíše do prvního řádku
  // a ostatní se vyprázdní, ať je zápis vždycky jen o jednom úkolu.
  function naplnZUkolu(plan: BottlingPlan) {
    if (plan.planned_date) setDate(plan.planned_date);
    setEntryRows(() => {
      const dalsi = emptyRows();
      dalsi[0] = {
        beerId: plan.beer_id || '',
        pkgId: plan.keg_pkg_id || '',
        qty: plan.keg_qty > 0 ? String(plan.keg_qty) : '',
        tankId: '',
      };
      return dalsi;
    });
    markPlanSeenAt();
    zavibruj('hotovo');
  }

  // ✅ Odškrtnutí v denním plánu. POZOR: NEZAPISUJE stáčení — je to jen
  // pracovní pomůcka, aby stáčeč viděl, co už má hotové. Skutečné stáčení se
  // dál zapisuje v záložce "Začátek stáčení"; kdyby ho odškrtnutí zakládalo
  // taky, vznikl by při běžném zápisu duplicitní záznam a sklad i objem tanku
  // by se nafoukly o každý odškrtnutý sud. V plánu se odškrtnutí a doložené
  // stočení skládají přes MAX (viz keggingPlan.ts).
  async function togglePlanCheck(day: string, beerId: string, pkgId: string, qty: number) {
    setErr(null);
    const { error } = await supabase
      .from('kegging_plan_checks')
      .upsert(
        { week_key: weekKey, day, beer_id: beerId, package_id: pkgId, qty: Math.max(0, qty), updated_at: new Date().toISOString(), updated_by: profile?.display_name ?? null },
        { onConflict: 'week_key,day,beer_id,package_id' }
      );
    if (error) { setErr(`Odškrtnutí se nepodařilo uložit: ${error.message}`); return; }
    await load(true);
  }



  // (zrušeno — pivo se nevyplňuje automaticky z tanku)




  // POZNÁMKA: tady stál `cycleStartByTank` + `tankSummary` — dva useMemo, které
  // při každém překreslení projely všechny řádky stáčení, ale jejich výsledek
  // se nikde nevykresloval. Odstraněno 5. 9. 2026; ESLint u nich zároveň našel
  // `Number(r.quantity) ?? 0`, což je vždycky `Number(...)` — u chybějícího
  // množství by z toho vyšlo NaN a celý součet tanku by zmizel. Kdyby se
  // souhrn stáčení z tanku někdy hodil, počítá totéž Cellar.tsx.

  function setRowField(i: number, field: keyof RowInput, value: string) {
    setEntryRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  // Hlasový zápis: přepis se rozparsuje a naplní se první volné prázdné řádky.
  // Pro KEG režim preferujeme obaly druhu 'keg'
  function handleVoiceResult(text: string) {
    // Nejprv zkusíme normální parser
    const parsed = parseFreeTextEntries(text, beers, packages, aliasMap);

    // Pokud parser nenašel nic, zkusíme jednodušší přístup pro kegy
    if (!parsed.length) {
      // Zkusíme extrahovat vzory jako "6x jantar 30" nebo "5x 12sv 50"
      const kegPatterns = text.match(/(\d{1,4})\s*x\s*([a-záčďéěíňóřšťúůýž]+[a-záčďéěíňóřšťúůýž\s]*?)\s*(\d{1,2})\b/gi);
      if (kegPatterns) {
        for (const match of kegPatterns) {
          const parts = match.match(/(\d{1,4})\s*x\s*([a-záčďéěíňóřšťúůýž]+[a-záčďéěíňóřšťúůýž\s]*?)\s*(\d{1,2})\b/i);
          if (parts) {
            const qty = parseInt(parts[1], 10);
            const beerName = parts[2].trim();
            const volStr = parts[3];
            // Najdi pivo podle názvu
            const beer = beers.find((b) => b.name.toLowerCase().includes(beerName.toLowerCase()) || beerName.toLowerCase().includes(b.name.toLowerCase()));
            // Najdi KEG obal podle objemu
            const pkg = kegPackages.find((p) => Math.abs(p.volume_l - parseInt(volStr)) < 2);
            if (beer && pkg && qty > 0) {
              const idx = entryRows.findIndex((r) => !r.beerId && !r.pkgId && !r.qty);
              if (idx >= 0) {
                setEntryRows((rs) => rs.map((r, j) => j === idx ? { beerId: beer.id, pkgId: pkg.id, qty: String(qty), tankId: '' } : r));
              }
            }
          }
        }
        setErr(null);
        return;
      }
    }

    if (!parsed.length) { setErr('Nerozpoznal jsem žádnou položku z hlasu. Zkus to znovu, např. "6x jantar 30" nebo "5x 12sv 50".'); return; }
    setEntryRows((rs) => {
      const next = [...rs];
      let cursor = 0;
      for (const p of parsed) {
        while (cursor < next.length && (next[cursor].beerId || next[cursor].pkgId || next[cursor].qty)) cursor++;
        if (cursor >= next.length) break;
        // Pro KEG režim: pokud parser nenašel obal, ale je to keg, zkusíme dohledat
        let pkgId = p.package_id ?? '';
        if (!pkgId && p.quantity) {
          // Zkusíme najít keg podle kontextu v hlasu
          const kegPkg = kegPackages.find((kp) => text.toLowerCase().includes(String(kp.volume_l)));
          if (kegPkg) pkgId = kegPkg.id;
        }
        next[cursor] = {
          beerId: p.beer_id ?? '',
          pkgId,
          qty: p.quantity != null ? String(p.quantity) : '',
          tankId: '',
        };
        cursor++;
      }
      return next;
    });
    setErr(null);
  }


  // Zpracování položek načtených z fotky — naplní prvních volných 12 řádků.
  function handleApplyPhotoRows(photoRows: { beerId: string; pkgId: string; qty: string }[], dateVal?: string, photoNote?: string) {
    setEntryRows((prev) => {
      const next = [...prev];
      photoRows.forEach((pRow, idx) => {
        if (idx < next.length) {
          next[idx] = { beerId: pRow.beerId, pkgId: pRow.pkgId, qty: pRow.qty, tankId: '' };
        } else {
          next.push({ beerId: pRow.beerId, pkgId: pRow.pkgId, qty: pRow.qty, tankId: '' });
        }
      });
      return next;
    });
    if (dateVal) setDate(dateVal);
    if (photoNote) setNote((prev) => (prev ? prev + ' | ' + photoNote : photoNote));
  }
  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    // Checklist se váže na SKUTEČNÉ dnešní datum (businessDateISO), ne na
    // editovatelné pole "Datum stáčení" (`date`) — jinak by šlo bránu obejít
    // přepnutím data na libovolný den, kde už checklist dřív (na tomhle
    // zařízení) proběhl, aniž by se dnešní příprava pracoviště skutečně udělala.
    if (!isStartChecklistCompleteForKeg(businessDateISO())) {
      setErr('Před uložením stáčení je nutné vyplnit checklist přípravy pracoviště!');
      setChecklistPhase('start');
      setChecklistGate(true);
      setShowChecklistModal(true);
      return;
    }

    // Kontroluje se i PIVO — bez něj se stočení sice uloží a je vidět
    // v seznamu, ale všechny skladové výpočty ho přeskočí (filtrují
    // `if (!beer_id || !package_id) return`), takže stočená šarže nikde
    // nepřibude a sklad zůstane trvale podhodnocený.
    const bezPiva = entryRows.filter((r) => !r.beerId && (r.pkgId || Number(r.qty) > 0));
    if (bezPiva.length > 0) {
      setErr('U každého vyplněného řádku vyberte pivo — bez něj by se stočení nepromítlo do skladu.');
      return;
    }
    const filled = entryRows.filter((r) => r.beerId && r.pkgId && Number(r.qty) > 0);
    if (filled.length === 0) { setErr('Vyplň alespoň jeden řádek (pivo, obal a množství).'); return; }

    // Přehmat o řád (12 → 120) se jinak najde až u inventury, kdy se těžko
    // dohledává, kde vznikl. Neblokuje se — velká várka je legitimní.
    for (const r of filled) {
      const historie = rows
        .filter((x) => x.beer_id === r.beerId && x.package_id === r.pkgId)
        .map((x) => Number(x.quantity || 0));
      const popis = `${beers.find((b) => b.id === r.beerId)?.name ?? 'Pivo'} · ${packages.find((p) => p.id === r.pkgId)?.label ?? 'obal'}`;
      const dotaz = podezreleMnozstvi(Number(r.qty), historie, popis);
      if (dotaz && !(await potvrd(dotaz, { titulek: 'Zkontrolujte množství', potvrdit: 'Ano, uložit' }))) return;
    }

    // 🛢️ Zápis bez tanku se dřív uložil TIŠE — a spolu s číslem tanku zmizel
    // i odečet objemu ze sklepa. Takhle se ztratil tank u 82 ze 198 zápisů
    // stáčení a Spilka 1 s Tankem 6 se rozešly o 2 000 a 5 400 litrů. Nikde to
    // nesvítilo: řádek vypadal uloženě, protože uložený byl.
    const bezTanku = radkyBezTanku(filled, cellarTanks, (r) => r.tankId);
    if (bezTanku.length > 0) {
      const seznam = bezTanku
        .map((r) => `• ${beers.find((b) => b.id === r.beerId)?.name ?? 'Pivo'} ${packages.find((p) => p.id === r.pkgId)?.label ?? ''} — ${r.qty} ks`)
        .join('\n');
      const dotaz =
        `Tyhle řádky nemají tank, ze kterého se stáčelo:\n\n${seznam}\n\n` +
        'Uloží se bez čísla tanku a ze žádného tanku se neodečte objem — sklep pak ukazuje víc piva, než v něm je.\n\n' +
        'Stáčelo se z tanku? Zavři tohle, ve Sklepě u něj dej „Zahájit stáčení" a ulož znovu.';
      if (!(await potvrd(dotaz, { titulek: 'Chybí tank', potvrdit: 'Uložit bez tanku' }))) return;
    }

    setSaving(true);

    // Každý řádek si najde svůj vlastní zdrojový tank podle piva na řádku (ne podle globálně
    // vybraného tanku): přednost má ručně zvolený tank (r.tankId), jinak se automaticky
    // přiřadí největší aktivní tank s daným pivem. Pokud pro dané pivo není žádný aktivní
    // tank, řádek se přesto uloží, jen bez vazby na tank a bez odečtu objemu.
    const payloads = filled.map((r) => {
      const beer = beers.find((b) => b.id === r.beerId);
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      // Zdrojový tank řádku: přednost má ručně vybraný (r.tankId), jinak se automaticky
      // přiřadí největší aktivní tank se stejným pivem (largestTank).
      const tank = tankRadku(cellarTanks, r.beerId, r.tankId);
      const sourceL = pkg && tank ? n * Number(pkg.volume_l) : 0;
      return {
        entry_date: date, beer_id: r.beerId || null, beer_name: beer?.name ?? null,
        package_id: r.pkgId, package_label: pkg?.label ?? null, quantity: n,
        note: note || null,
        cellar_tank_id: tank?.id ?? null,
        source_volume_l: sourceL || null,
      };
    });

    // Souhrn odečtu podle tanku (více řádků může brát ze stejného, nebo i z různých tanků)
    const deductByTank = new Map<string, number>();
    payloads.forEach((p) => {
      if (p.cellar_tank_id && p.source_volume_l) {
        deductByTank.set(p.cellar_tank_id, (deductByTank.get(p.cellar_tank_id) ?? 0) + p.source_volume_l);
      }
    });

    // `.select('id')` je tu kvůli vrácení zpět níž. Bez něj se id právě
    // vložených řádků zahodilo a vracení je muselo dohledávat podle hodnot
    // (datum + pivo + obal + počet, nejnovější) — což při dvou lidech, kteří
    // týž den stočí totéž, smazalo CIZÍ zápis a vrátilo objem do jiného tanku.
    const { data: vlozeneRadky, error } = await supabase
      .from('kegging')
      .insert(payloads)
      .select('id');
    if (error) { setSaving(false); setErr(error.message); return; }
    const vlozenaIds = ((vlozeneRadky as { id: string }[]) ?? []).map((r) => r.id);

    // Odečti stočený objem z každého dotčeného tanku. RELATIVNĚ přes RPC —
    // dřív se počítala absolutní hodnota z React state, takže když stáčeli
    // dva lidé ze stejného tanku naráz, druhý zápis přepsal první.
    for (const [tankId, deductL] of deductByTank.entries()) {
      const tank = cellarTanks.find((t) => t.id === tankId);
      if (!tank) continue;
      const { error: tankErr } = await supabase.rpc('adjust_tank_volume', {
        p_tank_id: tankId,
        p_delta_l: -deductL,
      });
      if (tankErr) {
        // Stočení je uložené, ale tank se nesnížil — na to uživatele
        // upozorníme, ať to nezůstane tiše rozjeté.
        setErr(`Stáčení uloženo, ale objem tanku ${tank.label} se nepodařilo snížit: ${tankErr.message}`);
        continue;
      }
      if (tank.status !== 'emptying') {
        await supabase.from('cellar_tanks').update({ status: 'emptying', updated_at: new Date().toISOString() }).eq('id', tankId);
      }
    }

    // Odemknout tlačítko až TEĎ — dřív se odemklo hned po vložení stáčení,
    // takže dvojklik stihl uložit zápis dvakrát.
    setSaving(false);
    setEntryRows(emptyRows()); setNote(''); setErr(null);
    setFlash(true); setTimeout(() => setFlash(false), 800);
    load(true);

    // ↩️ Vrátit zpět i po ULOŽENÍ, ne jen po smazání. Nebezpečný překlep je
    // ten, který něco PŘIDÁ: omylem uložené stočení přičte sudy do skladu
    // A ubere pivo z tanku, a najde se to až u inventury.
    //
    // Vrací se OBOJÍ — řádky i objem do tanku, přesně opačně, než se to
    // právě provedlo (deductByTank). Půlka vrácení by byla horší než žádné.
    const kusuCelkem = payloads.reduce((a, p) => a + Number(p.quantity), 0);
    const vraceniTanku = [...deductByTank.entries()];
    toastZpet(
      `Uloženo ${payloads.length} ${payloads.length === 1 ? 'řádek' : 'řádky'} — ${kusuCelkem} ks.`,
      async () => {
        // Maže se PŘESNĚ to, co se vložilo — podle id z `.select('id')` výš,
        // jedním dotazem. Dohledávání podle hodnot tu bylo dřív a umělo
        // sáhnout na cizí řádek se stejným datem, pivem, obalem a počtem.
        if (vlozenaIds.length) {
          const { error: chybaMazani } = await supabase.from('kegging').delete().in('id', vlozenaIds);
          if (chybaMazani) throw chybaMazani;
        }
        for (const [tankId, odectenoL] of vraceniTanku) {
          await adjustTankVolume(tankId, odectenoL);
        }
        load(true);
      },
    );

    setShowEndConfirm(true);
  }

  // Vrátí (nebo odebere) objem u zdrojového tanku záznamu — volá se při
  // smazání/úpravě množství, ať cellar_tanks.current_volume_l nezůstane
  // navždy posunutý (dřív se odečítalo jen jednou při vzniku záznamu v add(),
  // úprava/smazání objem tanku vůbec nereflektovaly).
  async function adjustTankVolume(tankId: string | null | undefined, addL: number) {
    if (!tankId || !addL) return;
    // RELATIVNÍ úprava přímo v databázi. Dřív se aktuální objem četl z React
    // state a posílala se hotová absolutní hodnota — jenže úprava záznamu volá
    // tuhle funkci dvakrát po sobě (vrátit starý objem, odečíst nový) a stav
    // se mezi await voláními neobnoví, takže obě volání vyšla ze stejné
    // hodnoty a druhé přepsalo první. Oprava překlepu „35 → 36 sudů" tak
    // ubrala z tanku 1800 l místo padesáti. Zároveň to řeší případ, kdy
    // stáčejí dva lidé ze stejného tanku naráz.
    const { error } = await supabase.rpc('adjust_tank_volume', {
      p_tank_id: tankId,
      p_delta_l: addL,
    });
    if (error) setErr(`Úprava objemu tanku se nepovedla: ${error.message}`);
  }

  // Sdílená logika pro increment/setQty/saveEdit: dopočítá nový
  // source_volume_l úměrně staré hodnotě (objem na kus × nové množství) a
  // rozdíl promítne do zdrojového tanku (víc kusů = víc odebráno, míň = vráceno).
  async function updateKeggingQty(id: string, newQty: number): Promise<string | null> {
    const row = rows.find((r) => r.id === id);
    if (!row) return 'Záznam nenalezen.';
    const oldQty = Number(row.quantity);
    const oldSourceL = Number(row.source_volume_l ?? 0);
    const patch: Record<string, unknown> = { quantity: newQty };
    let deltaL = 0;
    if (row.cellar_tank_id && oldQty > 0 && oldSourceL > 0) {
      const perUnit = oldSourceL / oldQty;
      const newSourceL = perUnit * newQty;
      deltaL = newSourceL - oldSourceL;
      patch.source_volume_l = newSourceL;
    }
    const { error } = await supabase.from('kegging').update(patch).eq('id', id);
    if (error) return error.message;
    if (deltaL !== 0) await adjustTankVolume(row.cellar_tank_id, -deltaL);
    load(true);
    return null;
  }

  async function del(id: string) {
    const row = rows.find((r) => r.id === id);
    const { error } = await supabase.from('kegging').delete().eq('id', id);
    if (error) { chyba(error); return; }
    setRows((r) => r.filter((x) => x.id !== id));
    if (row?.cellar_tank_id && row.source_volume_l) {
      await adjustTankVolume(row.cellar_tank_id, Number(row.source_volume_l));
      load(true);
    }
    if (!row) return;

    // Místo ptaní se předem: smaž a pár vteřin nabídni návrat. Na telefonu je
    // to o klepnutí míň pokaždé, i když se člověk nespletl.
    zavibruj('odskrtnuto');
    toastZpet(
      `Smazáno: ${row.beer_name ?? 'pivo'} ${row.package_label ?? ''} × ${row.quantity} ks`,
      async () => {
        const { error: chybaVraceni } = await supabase.from('kegging').insert(row);
        if (chybaVraceni) throw chybaVraceni;
        // Objem, který se mazáním vrátil do tanku, se musí zase odečíst —
        // jinak by tank po smazání a vrácení ukazoval víc, než v něm je.
        if (row.cellar_tank_id && row.source_volume_l) {
          await adjustTankVolume(row.cellar_tank_id, -Number(row.source_volume_l));
        }
        load(true);
      },
    );
  }

  async function increment(id: string, delta: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const newQty = Number(row.quantity) + delta;
    if (newQty < 0) return;
    const errMsg = await updateKeggingQty(id, newQty);
    if (errMsg) { setErr(errMsg); return; }
  }

  // Rychlé nastavení počtu sudů z rozbalovacího pole (6/12/18/24)
  async function setQty(id: string, qty: number) {
    const newQty = Math.max(0, Math.round(qty));
    const errMsg = await updateKeggingQty(id, newQty);
    if (errMsg) { setErr(errMsg); return; }
  }

  // Spustí editaci záznamu — naplní pole pro úpravu
  function startEdit(id: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    setEditingId(id);
    setEditQty(String(row.quantity));
  }

  // Uloží upravené množství záznamu
  async function saveEdit() {
    if (!editingId) return;
    const newQty = Number(editQty);
    if (!(newQty >= 0)) { setErr('Zadej platné množství.'); return; }
    const errMsg = await updateKeggingQty(editingId, newQty);
    if (errMsg) { setErr(errMsg); return; }
    setEditingId(null);
    setEditQty('');
    setErr(null);
  }


  // Prehled podle velikosti kegu (50/30/20/15/10 l + ostatni)
  const KEG_SIZES = [50, 30, 20, 15, 10];
  const sizeBuckets = KEG_SIZES.map((size) => {
    const sizeRows = rows.filter((r) => {
      const pkg = packages.find((p) => p.id === r.package_id);
      return pkg && Number(pkg.volume_l) === size;
    });
    const count = sizeRows.reduce((s, r) => s + Number(r.quantity), 0);
    const liters = sizeRows.reduce((s, r) => s + Number(r.quantity) * size, 0);
    return { size, count, liters };
  });
  const otherRows = rows.filter((r) => {
    const pkg = packages.find((p) => p.id === r.package_id);
    return !pkg || !KEG_SIZES.includes(Number(pkg.volume_l));
  });
  const otherCount = otherRows.reduce((s, r) => s + Number(r.quantity), 0);
  const otherLiters = otherRows.reduce((s, r) => {
    const pkg = packages.find((p) => p.id === r.package_id);
    return s + (pkg ? Number(r.quantity) * Number(pkg.volume_l) : 0);
  }, 0);
  const totalCount = sizeBuckets.reduce((s, b) => s + b.count, 0) + otherCount;
  const totalLiters = sizeBuckets.reduce((s, b) => s + b.liters, 0) + otherLiters;

  // Uložení přefuku KEG sudů — sudy ZE se odečtou ze skladu, sudy DO se přičtou
  async function addPrefuk(e: React.FormEvent) {
    e.preventDefault();
    if (!pfBeerId) { setPfErr('Vyber druh piva.'); return; }
    if (!pfFromPkgId) { setPfErr('Vyber velikost sudu ZE (odečítá se ze skladu).'); return; }
    if (!pfToPkgId) { setPfErr('Vyber velikost sudu DO (přičítá se na sklad).'); return; }
    const fromCount = Number(pfFromCount);
    const toCount = Number(pfToCount);
    if (!Number.isFinite(fromCount) || fromCount <= 0) { setPfErr('Zadej počet sudů ZE (větší než 0).'); return; }
    if (!Number.isFinite(toCount) || toCount <= 0) { setPfErr('Zadej počet sudů DO (větší než 0).'); return; }
    if (pfFromPkgId === pfToPkgId) { setPfErr('Velikost sudu ZE a DO nemůže být stejná.'); return; }
    const fromPkg = packages.find((p) => p.id === pfFromPkgId);
    const toPkg = packages.find((p) => p.id === pfToPkgId);
    const beer = beers.find((b) => b.id === pfBeerId);
    setPfSaving(true);
    setPfErr(null);
    const { error } = await supabase.from('keg_prefuk').insert({
      entry_date: pfDate,
      beer_id: pfBeerId,
      beer_name: beer?.name ?? null,
      from_package_id: pfFromPkgId,
      from_package_label: fromPkg?.label ?? null,
      from_count: fromCount,
      to_package_id: pfToPkgId,
      to_package_label: toPkg?.label ?? null,
      to_count: toCount,
      note: pfNote || null,
    });
    setPfSaving(false);
    if (error) { setPfErr('Chyba při ukládání: ' + error.message); return; }
    setPfBeerId('');
    setPfFromPkgId('');
    setPfFromCount('');
    setPfToPkgId('');
    setPfToCount('');
    setPfNote('');
    setPfDate(new Date().toISOString().slice(0, 10));
    load(true);
  }

  // Smazání přefuku — sklad se vrátí do stavu před přefukem.
  //
  // Bez modálu, stejně jako mazání zápisu stáčení výš: akce je VRATNÁ, tak
  // se udělá hned a pár vteřin se nabídne návrat. Ptát se předem na něco,
  // co jde vzít zpět, je klepnutí navíc pokaždé — i tomu, kdo se nespletl —
  // a nic to nechrání.
  async function deletePrefuk(id: string) {
    const row = prefukRows.find((r) => r.id === id);
    const { error } = await supabase.from('keg_prefuk').delete().eq('id', id);
    if (error) { chyba('Chyba při mazání: ' + error.message); return; }
    load(true);
    if (!row) return;

    zavibruj('odskrtnuto');
    toastZpet('Přefuk smazán.', async () => {
      const { error: chybaVraceni } = await supabase.from('keg_prefuk').insert(row);
      if (chybaVraceni) throw chybaVraceni;
      load(true);
    });
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Action Bar — přilepený nahoře, ať jde přepínat záložku i uprostřed scrollování.
          Export Excel a foto/hlas jsou schválně MIMO tuhle sticky listu (viz níže) - jinak by
          na mobilu (kde se lišta zalamuje na víc řádků) nesedel top offset dalších sticky lišt pod ní. */}
      <div className="sticky top-0 z-20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded border border-neutral-200/90 shadow-2xs">
        <div className="hidden sm:flex items-center justify-between gap-2">
          <span className="text-sm sm:text-base font-display font-black text-amber-950 flex items-center gap-1.5 shrink-0">
            <span><IkonaSud className="ikona-text" /></span>
            <span>{mode === 'entry_only' ? 'KEG (Stáčení)' : mode === 'overviews_only' ? 'KEG (Přehled)' : 'KEG (Stáčení & Přehled)'}</span>
          </span>
        </div>

        {/* Záložky: Zápis / Přehled / Potřeba stočit KEGy */}
        {mode === 'all' && (
          <div className="flex items-center gap-1.5 p-1 rounded w-full sm:w-fit overflow-x-auto scrollbar-none flex-nowrap shrink-0">
            <button
              type="button"
              onClick={() => selectTab('zapis')}
              className={`px-3.5 py-2 rounded text-xs font-black transition shrink-0 min-h-[44px] ${tab === 'zapis' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'}`}
            >
              <span className="inline-flex items-center gap-1.5"><IkonaSud size={14} /> Začátek stáčení</span>
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
              onClick={() => selectTab('plan')}
              className={`px-3.5 py-2 rounded text-xs font-black transition flex items-center gap-1.5 shrink-0 min-h-[44px] ${tab === 'plan' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'}`}
            >
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> Co stočit na který den</span>
              {planMissingTotal > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-300 text-amber-950 text-udaj font-black">
                  {planMissingTotal}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => selectTab('prefuk')}
              className={`px-3.5 py-2 rounded text-xs font-black transition flex items-center gap-1.5 shrink-0 min-h-[44px] ${tab === 'prefuk' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'}`}
            >
              <span className="inline-flex items-center gap-1.5"><RefreshCw size={14} /> Přefuk KEG</span>
              {prefukRows.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-sky-200 text-sky-900 text-udaj font-black">{prefukRows.length}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => selectTab('checklist')}
              className={`px-3.5 py-2 rounded text-xs font-black transition flex items-center gap-1.5 shrink-0 min-h-[44px] ${tab === 'checklist' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'}`}
            >
              <span className="inline-flex items-center gap-1.5"><ClipboardList size={14} /> Checklist</span>
              {isLastWeekOfMonth() && !isMonthlyChecklistCompleteForKeg(businessDateISO()) && (
                <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-udaj font-black animate-pulse">1</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setChecklistPhase('start'); setChecklistGate(false); setShowChecklistModal(true); }}
              className="px-3.5 py-2 rounded text-xs font-black transition shrink-0 min-h-[44px] bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center gap-1.5 shadow-2xs"
            >
              <ClipboardList size={14} />
              <span>Příprava (Checklist)</span>
            </button>
            <button
              type="button"
              onClick={() => { setChecklistPhase('end'); setChecklistGate(false); setShowChecklistModal(true); }}
              className="px-3.5 py-2 rounded text-xs font-black transition shrink-0 min-h-[44px] bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles size={14} />
              <span>Konec stáčení</span>
            </button>
          </div>
        )}
      </div>

      {/* Export Excel a foto/hlas — schválně NEUKOTVENO (viz komentář u sticky lišty výše). */}
      <div className="flex items-center gap-1.5 flex-wrap">

          {tab === 'zapis' && mode !== 'overviews_only' && isStartChecklistCompleteForKeg(businessDateISO()) && (
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

      {/* Začátek stáčení — dokud není splněný checklist přípravy pracoviště pro
          zvolené datum, dlaždice pro zadávání se vůbec nezobrazí. Až po jeho
          splnění (velké tlačítko níže) se odemkne zápis stáčení. */}
      {tab === 'zapis' && mode !== 'overviews_only' && !isStartChecklistCompleteForKeg(businessDateISO()) && (
        <div className="card p-8 sm:p-12 mb-5 text-center space-y-5 border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-amber-100/40">
          <div className="text-6xl"><IkonaSud className="ikona-text" /></div>
          <div>
            <h2 className="font-display font-black text-xl sm:text-2xl text-amber-950">Začátek stáčení KEG</h2>
            <p className="text-sm text-amber-800/80 font-medium max-w-md mx-auto mt-1.5">
              Před zahájením je nutné proklikat checklist přípravy pracoviště (proplach cest, klapky, stáčeček). Pak se odemkne zadávání.
            </p>
          </div>
          <div className="max-w-xs mx-auto">
            <label className="label text-left">Datum stáčení</label>
            <input type="date" className="input text-center font-black" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <button
            type="button"
            onClick={() => { setChecklistPhase('start'); setChecklistGate(true); setShowChecklistModal(true); }}
            className="mx-auto flex items-center gap-3 px-8 py-5 sm:px-10 sm:py-6 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-lg sm:text-xl shadow-xl active:scale-[0.97] transition"
          >
            <Play className="ikona-text" /> Zahájit stáčení
          </button>
        </div>
      )}

      {/* Úkoly zadané sládkem — stejná tabule jako u lahví, jen sudová část. */}
      {(mode === 'entry_only' || (mode === 'all' && tab === 'zapis')) && (
        <BottlingPlanBottler
          plans={plany}
          beers={beers}
          packages={packages}
          isManager={isManager}
          onChanged={() => load(true)}
          onFill={naplnZUkolu}
          druh="kegy"
        />
      )}

      {/* Zápis stáčení — multi-row (12 řádků pivo+obal+množství najednou) */}
      {tab === 'zapis' && mode !== 'overviews_only' && isStartChecklistCompleteForKeg(businessDateISO()) && (
        <form onSubmit={add} className={`card px-1 py-3 mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-emerald-500/20' : ''}`}>

          <div className="grid grid-cols-2 gap-3 items-end mb-4">
          <div className="flex items-center gap-2">
            <label className="label !mb-0 shrink-0">Datum</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label"><IkonaSud className="ikona-text" /> Tank číslo:</label>
            <div className="rounded border border-neutral-200 bg-neutral-50 p-2.5 min-h-[44px] flex flex-wrap items-center gap-1.5">
              {rowTankPreview.perTank.size > 0 ? (
                [...rowTankPreview.perTank.entries()].map(([tankId, liters]) => {
                  const t = cellarTanks.find((x) => x.id === tankId);
                  return (
                    <span key={tankId} className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-900 text-udaj font-black whitespace-nowrap">
                      <IkonaSud className="ikona-text" /> {t?.label ?? 'Tank'} · {liters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} L
                    </span>
                  );
                })
              ) : (
                <span className="text-xs text-neutral-400 font-semibold">
                  {keggingActiveTanks.length === 0
                    ? 'Žádný aktivní tank (Sklep → „Zahájit stáčení“)'
                    : 'Vyplň řádky s pivem — tanky se přiřadí automaticky'}
                </span>
              )}
            </div>
            {rowTankPreview.ambiguousCount > 0 && (
              <p className="text-udaj font-black text-amber-700 mt-1">
                <AlertTriangle className="ikona-text" /> {rowTankPreview.ambiguousCount}× řádek: 2+ aktivní tanky se stejným pivem — vyber správný v řádku
              </p>
            )}
            {rowTankPreview.missingCount > 0 && (
              <p className="text-udaj font-semibold text-neutral-500 mt-1">
                {rowTankPreview.missingCount}× řádek bez aktivního tanku s daným pivem — objem se neodečte
              </p>
            )}
          </div>
          </div>

          <div className="mb-2">
            <span className="text-udaj text-neutral-400 font-medium">klepni na dlaždici a zadej obaly a množství sudů</span>
          </div>
          <div className="mb-4">
            <BeerTileGrid
              beers={serazPodleNaposled(beers.filter((b) => b.is_active), (b) => b.id, naposledPiva)}
              onSelect={(b) => { setNaposledPiva(zapamatujVyber(klicPiv, b.id)); setExpandedKegBeerId(b.id); }}
              summaryFor={(b) => {
                const beerRows = entryRows.filter((r) => r.beerId === b.id && Number(r.qty) > 0);
                const label = beerRows
                  .map((r) => {
                    const pkg = packages.find((p) => p.id === r.pkgId);
                    return pkg ? `${r.qty}×${Math.round(Number(pkg.volume_l))}` : null;
                  })
                  .filter(Boolean)
                  .join(', ');
                return { filled: beerRows.length > 0, label };
              }}
            />
          </div>

          {expandedKegBeer && (
            <BeerTilePanel beer={expandedKegBeer} onClose={() => setExpandedKegBeerId(null)}>
              {kegPackages.map((p) => {
                const qty = tileQtyFor(expandedKegBeer.id, p.id);
                const rowTanks = activeTanksForBeer(expandedKegBeer.id);
                const currentTankId = entryRows.find((r) => r.beerId === expandedKegBeer.id && r.pkgId === p.id)?.tankId || '';
                const quickQtys = QUICK_KEG_QTY;
                return (
                  <div key={p.id} className="rounded border border-neutral-200 dark:border-neutral-700 py-1.5 px-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-bold text-neutral-700 dark:text-neutral-200 truncate">{formatPackageLabel(p.label)}</span>
                      <div className="flex items-center gap-1">
                        {quickQtys.map((q) => (
                          <button
                            key={q}
                            type="button"
                            onClick={() => setTileRow(expandedKegBeer.id, p.id, { qty: String(q) })}
                            title="Rychlá volba množství"
                            className={`tap h-7 min-w-[1.75rem] px-1.5 rounded text-udaj font-black transition ${qty === q ? 'bg-emerald-700 text-white' : 'bg-neutral-100 dark:bg-neutral-700 hover:bg-emerald-200 text-neutral-600 dark:text-neutral-200 hover:text-emerald-950'}`}
                          >
                            {q}
                          </button>
                        ))}
                        <button type="button" onClick={() => setTileRow(expandedKegBeer.id, p.id, { qty: String(Math.max(0, qty - 1)) })} className="w-11 h-11 grid place-items-center rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-black text-xl transition disabled:opacity-30 select-none" disabled={qty <= 0}>−</button>
                        <input
                          type="number" onWheel={(e) => e.currentTarget.blur()}
                          min={0}
                          inputMode="numeric"
                          value={qty || ''}
                          placeholder="0"
                          onChange={(e) => setTileRow(expandedKegBeer.id, p.id, { qty: e.target.value.replace(/[^0-9]/g, '') })}
                          className="w-14 h-10 text-center text-lg font-black text-neutral-800 dark:text-neutral-100 bg-white dark:bg-neutral-900/60 border-2 border-amber-200 dark:border-neutral-700 rounded"
                        />
                        <button type="button" onClick={() => setTileRow(expandedKegBeer.id, p.id, { qty: String(qty + 1) })} className="w-11 h-11 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-black text-xl transition select-none">+</button>
                        {/* +5: po jednom se přidává jen zbytek, celé pády sudů
                            jdou po pěti. Dvě klepnutí místo deseti. */}
                        <button type="button" onClick={() => setTileRow(expandedKegBeer.id, p.id, { qty: String(qty + 5) })} className="w-11 h-11 grid place-items-center rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-black text-sm transition select-none">+5</button>
                      </div>
                    </div>
                    {qty > 0 && rowTanks.length > 1 && (
                      <div>
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-udaj font-black whitespace-nowrap"><AlertTriangle className="ikona-text" /> {rowTanks.length} aktivní tanky — vyber</span>
                        <select
                          className="input !py-1 !px-1.5 text-xs font-bold w-full mt-1"
                          value={currentTankId}
                          onChange={(e) => setTileRow(expandedKegBeer.id, p.id, { tankId: e.target.value })}
                        >
                          <option value="">{largestTank(rowTanks)?.label}</option>
                          {rowTanks.map((t) => (
                            <option key={t.id} value={t.id}>{t.label} ({Number(t.current_volume_l).toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} L)</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {qty > 0 && rowTanks.length === 1 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-900 text-udaj font-black whitespace-nowrap"><IkonaSud className="ikona-text" /> {rowTanks[0].label}</span>
                    )}
                    {qty > 0 && rowTanks.length === 0 && (
                      <span className="text-udaj text-neutral-400 font-semibold">žádný aktivní tank — objem se neodečte</span>
                    )}
                  </div>
                );
              })}
            </BeerTilePanel>
          )}

          {/* 📋 Souhrn zápisu — pod dlaždicemi, editovatelný jako dlaždice */}
          {(() => {
            const filled = entryRows.filter((r) => r.beerId && r.pkgId && Number(r.qty) > 0);
            if (filled.length === 0) return null;
            return (
              <div className="mt-4 border border-amber-200 dark:border-amber-800/60 bg-white dark:bg-neutral-800 p-3">
                <div className="text-xs font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300 mb-2">
                  <ClipboardList className="ikona-text" /> Zápis stáčení ({filled.reduce((s, r) => s + Number(r.qty || 0), 0)} ks)
                </div>
                <ul className="space-y-1.5">
                  {filled.map((r, i) => {
                    const beer = beers.find((b) => b.id === r.beerId);
                    const pkg = packages.find((p) => p.id === r.pkgId);
                    return (
                      <li key={`${r.beerId}-${r.pkgId}-${i}`} className="flex items-center justify-between gap-2 bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/70 dark:border-neutral-700 px-2.5 py-1.5">
                        <button
                          type="button"
                          onClick={() => setExpandedKegBeerId(r.beerId)}
                          className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-100 text-left truncate"
                          title="Klikni pro úpravu v dlaždici"
                        >
                          <span className="shrink-0">{r.qty}×</span>
                          <span className="truncate">{formatPackageLabel(pkg?.label)} · {beerName(beer)}</span>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => setTileRow(r.beerId, r.pkgId, { qty: String(Math.max(0, Number(r.qty) - 1)) })} className="w-11 h-11 grid place-items-center rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-black text-xl transition disabled:opacity-30 select-none" disabled={Number(r.qty) <= 1}>−</button>
                          <input
                            type="number" onWheel={(e) => e.currentTarget.blur()}
                            min={0}
                            inputMode="numeric"
                            value={r.qty}
                            placeholder="0"
                            onChange={(e) => setTileRow(r.beerId, r.pkgId, { qty: e.target.value.replace(/[^0-9]/g, '') })}
                            className="w-14 h-10 text-center text-base font-black text-neutral-800 dark:text-neutral-100 bg-white dark:bg-neutral-900/60 border-2 border-amber-200 dark:border-neutral-700 rounded"
                            title="Napiš počet ručně"
                          />
                          <button type="button" onClick={() => setTileRow(r.beerId, r.pkgId, { qty: String(Number(r.qty) + 1) })} className="w-11 h-11 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-black text-xl transition select-none">+</button>
                          <button type="button" onClick={() => setTileRow(r.beerId, r.pkgId, { qty: '0' })} className="w-10 h-10 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-black text-xl transition select-none tap" title="Odebrat položku" aria-label="Odebrat položku"><X size={18} /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}

          <div className="flex items-center justify-between mt-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving || !isStartChecklistCompleteForKeg(businessDateISO())}
                className="btn-primary !rounded !from-emerald-600 !to-emerald-700 hover:!from-emerald-500 hover:!to-emerald-600 !shadow-emerald-600/30 text-xs font-black shadow-md disabled:opacity-40 min-h-[44px]"
              >
                {saving ? 'Ukládám…' : 'Uložit stáčení'}
              </button>
              {!isStartChecklistCompleteForKeg(businessDateISO()) && (
                <span className="text-udaj font-bold text-amber-700 animate-pulse bg-amber-50 border border-amber-200 rounded px-2.5 py-1">
                  <AlertTriangle className="ikona-text" /> Před uložením musíte splnit checklist přípravy!
                </span>
              )}
              <button type="button" className="btn-ghost !rounded text-xs min-h-[44px]" onClick={() => setEntryRows(emptyRows())}><Trash2 className="ikona-text" /> Vymazat vše</button>
            </div>
            {err && <span className="text-xs font-bold text-rose-700">{err}</span>}
          </div>

        </form>
      )}

      {/* „Stočeno KEG za týden" patří POD ZADÁVÁNÍ (záložka Začátek stáčení),
          ať je při zápisu hned vidět, co už se tento týden stočilo. V Přehledu
          je jen jeden filtrovatelný seznam „Všechny záznamy" (níž). */}
      {tab === 'zapis' && mode !== 'entry_only' && (
        <>

          {/* Stočeno KEG za týden — jednotlivé záznamy s +/−/✕ */}
          {rows.length > 0 && (() => {
            // Minusové položky (ruční opravy) se nezobrazují — je to seznam
            // stočeného, ne účetní deník oprav.
            const weekRowsAll = rows.filter((r) => isoWeekKey(r.entry_date) === weekKey && Number(r.quantity) > 0);
            if (weekRowsAll.length === 0) return null;
            const weekRows = weekRowsAll.filter((r) =>
              (!weekBeerFilter || r.beer_id === weekBeerFilter) &&
              (!weekPkgFilter || r.package_id === weekPkgFilter)
            );
            const sorted = [...weekRows].sort((a, b) => {
              const dateCmp = (b.entry_date ?? '').localeCompare(a.entry_date ?? '');
              if (dateCmp !== 0) return dateCmp;
              return (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id);
            });
            const totalCount = sorted.reduce((s, r) => s + Number(r.quantity), 0);
            const weekBeerIds = new Set(weekRowsAll.map((r) => r.beer_id));
            const weekBeers = beers.filter((b) => weekBeerIds.has(b.id));
            const weekPkgIds = new Set(weekRowsAll.map((r) => r.package_id));
            const weekPkgs = packages.filter((p) => weekPkgIds.has(p.id));

            return (
              <div className="card p-4 mb-5 border-2 border-emerald-300/80 bg-white">
                <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 mb-3 bg-white py-1.5 -mx-4 px-4 rounded-t-2xl">
                  <h3 className="font-display font-black text-emerald-950 text-sm"><BeerIcon className="ikona-text" /> Stočeno KEG za týden {weekKey}</h3>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {weekBeers.length > 0 && (
                      <select
                        value={weekBeerFilter}
                        onChange={(e) => setWeekBeerFilter(e.target.value)}
                        className="input text-xs font-bold py-1 px-2 rounded bg-white border-emerald-300 text-emerald-950 shrink-0"
                      >
                        <option value="">Všechna piva</option>
                        {weekBeers.map((b) => (
                          <option key={b.id} value={b.id}>{beerName(b)}</option>
                        ))}
                      </select>
                    )}
                    {weekPkgs.length > 0 && (
                      <select
                        value={weekPkgFilter}
                        onChange={(e) => setWeekPkgFilter(e.target.value)}
                        className="input text-xs font-bold py-1 px-2 rounded bg-white border-emerald-300 text-emerald-950 shrink-0"
                      >
                        <option value="">Všechny obaly</option>
                        {weekPkgs.map((p) => (
                          <option key={p.id} value={p.id}>{formatPackageLabel(p.label)}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Mobilní karty — čitelné a ovladatelné bez vodorovného scrollování */}
                <div className="grid grid-cols-1 gap-2.5 md:hidden">
                  {sorted.map((r) => {
                    const beer = beers.find((b) => b.id === r.beer_id);
                    const pkg = packages.find((p) => p.id === r.package_id);
                    const vol = pkg ? Number(pkg.volume_l) : 0;
                    const isEditing = editingId === r.id;
                    return (
                      <div key={r.id} className="rounded border border-emerald-300/80 bg-white p-3 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 font-mono font-bold text-xs text-emerald-800">
                            {r.entry_date ? r.entry_date.slice(8, 10) + '.' + r.entry_date.slice(5, 7) + '.' : '—'}
                          </span>
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                          <span className="font-black text-sm text-emerald-950 truncate min-w-0">{r.beer_name ?? beer?.name ?? '—'}</span>
                          <span className="shrink-0 text-xs font-bold text-emerald-700">{vol > 0 ? `KEG ${vol}L` : '—'}</span>
                          <span className="ml-auto shrink-0">
                            {isEditing ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} min="0" step="1" autoFocus
                                  className="input text-base font-black w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={editQty}
                                  onChange={(e) => setEditQty(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') { setEditingId(null); setEditQty(''); } }}
                                />
                                <button type="button" onClick={saveEdit} className="px-3 h-10 rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-black text-xs transition tap"><Check size={14} /></button>
                                <button type="button" onClick={() => { setEditingId(null); setEditQty(''); }} className="px-3 h-10 rounded bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-black text-xs transition tap"><X size={14} /></button>
                              </div>
                            ) : (
                              <span className="font-display font-black text-xl text-emerald-950">{r.quantity} ks</span>
                            )}
                          </span>
                        </div>
                        {!isEditing && (
                          <div className="flex items-center gap-1.5 pt-2 border-t border-emerald-100">
                            <button type="button" onClick={() => setEditingRow(r)} className="btn-ghost !flex-none !w-11 !px-0 !min-h-[44px]" title="Upravit záznam" aria-label="Upravit záznam"><Pencil size={16} /></button>
                            <button type="button" onClick={() => increment(r.id, -1)} disabled={Number(r.quantity) <= 0} className="btn-pocet !min-h-[44px]" aria-label="Ubrat sud">−</button>
                            <button type="button" onClick={() => increment(r.id, 1)} className="btn-pocet !min-h-[44px]" aria-label="Přidat sud">+</button>
                            <input type="number" inputMode="numeric" min="0" onWheel={(e) => e.currentTarget.blur()} key={r.quantity} defaultValue={r.quantity} onBlur={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); if (v !== Number(r.quantity)) setQty(r.id, v); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="min-h-[44px] rounded bg-white border border-neutral-200 text-neutral-800 font-bold text-xs px-1.5 cursor-pointer transition !w-14 text-center tabular-nums" title="Napiš počet ks (libovolné číslo)" />
                            {/* Mazání je jediná barva v řádku a stojí za
                                mezerou od plusu — na dotyk jsou to sousedi
                                a záměna maže zápis. */}
                            <button
                              type="button"
                              onClick={() => del(r.id)}
                              className="btn-danger !flex-none !w-11 !px-0 !min-h-[44px] ml-2"
                              aria-label="Smazat záznam"
                            ><X size={18} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="rounded bg-emerald-200/60 p-3 flex items-center justify-between font-black text-emerald-950 text-sm">
                    <span><PackageIcon className="ikona-text" /> Celkem</span>
                    <span>{totalCount} ks</span>
                  </div>
                </div>

                <div className="hidden md:block rounded border border-emerald-300/80 bg-emerald-50/90 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-emerald-300/80 bg-emerald-100/80">
                        <th scope="col" className="text-left py-1.5 px-2 font-black text-emerald-950">Datum</th>
                        <th scope="col" className="text-left py-1.5 px-2 font-black text-emerald-950">Pivo</th>
                        <th scope="col" className="text-right py-1.5 px-2 font-black text-emerald-950">KEG</th>
                        <th scope="col" className="text-right py-1.5 px-2 font-black text-emerald-950">Ks</th>
                        <th scope="col" className="text-right py-1.5 px-2 font-black text-emerald-950">Akce</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r) => {
                        const beer = beers.find((b) => b.id === r.beer_id);
                        const pkg = packages.find((p) => p.id === r.package_id);
                        const vol = pkg ? Number(pkg.volume_l) : 0;
                        return (
                          <tr key={r.id} className="border-b border-emerald-200/60 hover:bg-emerald-100/70 transition-colors">
                            <td className="py-1.5 px-2 font-mono font-bold text-emerald-950 whitespace-nowrap">
                              {r.entry_date ? r.entry_date.slice(8, 10) + '.' + r.entry_date.slice(5, 7) + '.' : '—'}
                            </td>
                            <td className="py-1.5 px-2 font-bold text-emerald-950 flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                              <span className="truncate max-w-[120px]">{r.beer_name ?? beer?.name ?? '—'}</span>
                            </td>
                            <td className="py-1.5 px-2 text-right font-semibold text-emerald-900 whitespace-nowrap">{vol > 0 ? `${vol}L` : '—'}</td>
                            <td className="py-1.5 px-2 text-right font-bold text-emerald-950">
                              {editingId === r.id ? (
                                <input
                                  type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                                  min="0"
                                  step="1"
                                  autoFocus
                                  className="input text-base font-black w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={editQty}
                                  onChange={(e) => setEditQty(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') { setEditingId(null); setEditQty(''); } }}
                                />
                              ) : (
                                r.quantity
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-right whitespace-nowrap">
                              {editingId === r.id ? (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    className="px-2 h-6 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition tap"
                                    onClick={saveEdit}
                                    title="Uložit" aria-label="Uložit"
                                  ><Check size={14} /></button>
                                  <button
                                    type="button"
                                    className="px-2 h-6 grid place-items-center rounded bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-bold text-xs transition tap"
                                    onClick={() => { setEditingId(null); setEditQty(''); }}
                                    title="Zrušit" aria-label="Zrušit"
                                  ><X size={14} /></button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    className="px-2 h-6 grid place-items-center rounded bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-xs transition tap"
                                    onClick={() => setEditingRow(r)}
                                    title="Upravit detail" aria-label="Upravit detail"
                                  ><Pencil className="ikona-text" /></button>
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-emerald-950 font-bold text-xs transition tap"
                                    onClick={() => increment(r.id, -1)}
                                    disabled={Number(r.quantity) <= 0}
                                    title="Odebrat 1 ks" aria-label="Odebrat 1 ks"
                                  >−</button>
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition tap"
                                    onClick={() => increment(r.id, 1)}
                                    title="Přidat 1 ks" aria-label="Přidat 1 ks"
                                  >+</button>
                                  <input type="number" inputMode="numeric" min="0" onWheel={(e) => e.currentTarget.blur()} key={r.quantity} defaultValue={r.quantity} onBlur={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); if (v !== Number(r.quantity)) setQty(r.id, v); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="h-6 rounded bg-white border border-amber-300 text-emerald-950 font-bold text-udaj px-1 cursor-pointer transition !w-14 text-center tabular-nums" title="Napiš počet ks (libovolné číslo)" />
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs transition tap"
                                    onClick={() => del(r.id)}
                                    title="Smazat záznam" aria-label="Smazat záznam"
                                  ><X size={14} /></button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Souhrnný řádek */}
                      <tr className="bg-emerald-200/60 font-black">
                        <td className="py-1.5 px-2 font-black text-emerald-950"></td>
                        <td className="py-1.5 px-2 font-black text-emerald-950"><PackageIcon className="ikona-text" /> Celkem</td>
                        <td className="py-1.5 px-2 text-right font-black text-emerald-950"></td>
                        <td className="py-1.5 px-2 text-right font-black text-emerald-950">{totalCount}</td>
                        <td className="py-1.5 px-2 text-right font-black text-emerald-950"></td>
                      </tr>

                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

        </>
      )}

      {/* Všechny záznamy stáčení KEG — seskupená tabulka jako "Stočeno za týden" */}
      {tab === 'prehled' && mode !== 'entry_only' && (
      <div className="mt-0 space-y-3">

        {/* Přilepeno pod hlavní listou záložek, ať jde přepínat obdobi/filtry i uprostřed scrollování dlouhé tabulky níže. */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-neutral-100 py-1.5 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="text-xs font-black uppercase tracking-wider text-amber-950/60 flex items-center gap-2">
            <span><ClipboardList className="ikona-text" /></span>
            <span>Všechny záznamy stáčení KEG</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {rows.length > 0 && (
              <>
                {/* Filtr podle piva */}
                <select
                  value={beerFilter}
                  onChange={(e) => setBeerFilter(e.target.value)}
                  className="input text-xs font-bold px-2 py-1 rounded border border-neutral-200 bg-white text-neutral-700 max-w-[140px]"
                >
                  <option value="">Všechna piva</option>
                  {beers.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>

                {/* Filtr podle obalu */}
                <select
                  value={recordPkgFilter}
                  onChange={(e) => setRecordPkgFilter(e.target.value)}
                  className="input text-xs font-bold px-2 py-1 rounded border border-neutral-200 bg-white text-neutral-700 max-w-[140px]"
                >
                  <option value="">Všechny obaly</option>
                  {kegPackages.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>

                {/* Přepínač období: Den / Týden / Měsíc */}
                <div className="flex items-center gap-1 bg-white border border-neutral-200 rounded p-0.5">
                  <button
                    type="button"
                    onClick={() => setRecordsView('day')}
                    className={`tap text-xs font-bold px-2.5 py-1 rounded-md border transition ${
                      recordsView === 'day'
                        ? 'bg-amber-200 border-amber-300 text-amber-950'
                        : 'bg-white border-transparent text-neutral-600'
                    }`}
                  >
                    <Calendar className="ikona-text" /> Den
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordsView('week')}
                    className={`tap text-xs font-bold px-2.5 py-1 rounded-md border transition ${
                      recordsView === 'week'
                        ? 'bg-amber-200 border-amber-300 text-amber-950'
                        : 'bg-white border-transparent text-neutral-600'
                    }`}
                  >
                    <Calendar className="ikona-text" /> Týden
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordsView('month')}
                    className={`tap text-xs font-bold px-2.5 py-1 rounded-md border transition ${
                      recordsView === 'month'
                        ? 'bg-amber-200 border-amber-300 text-amber-950'
                        : 'bg-white border-transparent text-neutral-600'
                    }`}
                  >
                    <Calendar className="ikona-text" /> Měsíc
                  </button>
                </div>

                {/* Navigace podle zvoleného období */}
                {recordsView === 'day' && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setRecordsDay(shiftDay(recordsDay, -1))} className="w-11 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-base transition shrink-0">‹</button>
                    <input
                      type="date"
                      value={recordsDay}
                      onChange={(e) => setRecordsDay(e.target.value)}
                      className="input text-xs font-bold px-2 py-1 rounded border border-neutral-200 bg-white text-neutral-700"
                    />
                    <button onClick={() => setRecordsDay(shiftDay(recordsDay, 1))} className="w-11 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-base transition shrink-0">›</button>
                  </div>
                )}
                {recordsView === 'week' && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, -1))} className="w-11 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-base transition shrink-0">‹</button>
                    <span className="text-xs font-bold text-amber-950 px-1 whitespace-nowrap">{weekRange(recordsWeekKey).label}</span>
                    <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, 1))} className="w-11 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-base transition shrink-0">›</button>
                  </div>
                )}
                {recordsView === 'month' && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setRecordsMonthKey(shiftMonth(recordsMonthKey, -1))} className="w-11 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-base transition shrink-0">‹</button>
                    <span className="text-xs font-bold text-amber-950 px-1 whitespace-nowrap">{recordsMonthKey}</span>
                    <button onClick={() => setRecordsMonthKey(shiftMonth(recordsMonthKey, 1))} className="w-11 min-h-[44px] grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-base transition shrink-0">›</button>
                  </div>
                )}
              </>
            )}
            {rows.length > 0 && (
              <span className="chip bg-amber-100/60 text-amber-900/70 text-xs font-bold">
                {filteredRows.length} záznamů · <span className="text-amber-950 font-black tabular-nums">{filteredRows.reduce((s, r) => s + Number(r.quantity || 0), 0)} ks</span>
              </span>
            )}
          </div>

        </div>

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          chybaNacteni ? (
            <EmptyState
              varianta="chyba"
              text={`Stáčení se nepodařilo načíst: ${chybaNacteni}`}
              akce={{ popis: 'Zkusit znovu', onClick: () => load() }}
            />
          ) : <EmptyState text="Zatím žádné stočení do sudů." icon={PenLine} akce={{ popis: 'Zapsat stočení', onClick: () => setTab('zapis') }} />
        ) : filteredRows.length === 0 ? (
          <EmptyState text="Žádné záznamy pro toto období." icon={CalendarDays} />
        ) : (() => {
          // Jednotlivé záznamy s datem (den a měsíc)
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

          function formatDate(d: string | null | undefined) {
            if (!d) return '—';
            const parts = d.split('-');
            if (parts.length < 3) return d;
            return `${parts[2]}.${parts[1]}.`; // DD.MM.
          }

          return (
            <div className="card p-4 border-2 border-amber-300/80 bg-white">
              <h3 className="font-display font-black text-amber-950 text-sm mb-3">
                <BeerIcon className="ikona-text" /> {recordsView === 'month' ? `Měsíc ${recordsMonthKey}` : recordsView === 'week' ? `Týden ${recordsWeekKey}` : `Den ${recordsDay}`}
              </h3>

              {/* Mobilní karty — čitelné a ovladatelné bez vodorovného scrollování */}
              <div className="grid grid-cols-1 gap-1.5 md:hidden">
                {sortedRows.map((r) => {
                  const beer = beers.find((b) => b.id === r.beer_id);
                  const pkg = packages.find((p) => p.id === r.package_id);
                  const vol = pkg ? Number(pkg.volume_l) : 0;
                  const liters = Number(r.quantity) * vol;
                  const isEditing = editingId === r.id;
                  return (
                    <div key={r.id} className="rounded border border-amber-300/80 bg-white p-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 font-mono font-bold text-xs text-amber-800">{formatDate(r.entry_date)}</span>
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                        <span className="font-black text-sm text-amber-950 truncate min-w-0">{r.beer_name ?? beer?.name ?? '—'}</span>
                        <span className="shrink-0 text-xs font-bold text-amber-700">{pkg ? `KEG ${vol}L` : '—'}</span>
                        <span className="ml-auto shrink-0">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} min="0" step="1" autoFocus
                                className="input text-base font-black w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={editQty}
                                onChange={(e) => setEditQty(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') { setEditingId(null); setEditQty(''); } }}
                              />
                              <button type="button" onClick={saveEdit} className="px-3 h-10 rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-black text-xs transition tap"><Check size={14} /></button>
                              <button type="button" onClick={() => { setEditingId(null); setEditQty(''); }} className="px-3 h-10 rounded bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-black text-xs transition tap"><X size={14} /></button>
                            </div>
                          ) : (
                            <span className="font-display font-black text-xl text-amber-950">{r.quantity} ks</span>
                          )}
                        </span>
                      </div>
                      {/* Litry/HL zhuštěné do jednoho řádku (dřív dvě velké
                          dlaždice na záznam) — na telefon se tak vejde víc
                          záznamů a pořád je to čitelné. */}
                      <div className="text-udaj font-bold text-amber-700 tabular-nums">
                        {liters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} l · {(liters / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} hl
                      </div>
                      {!isEditing && (
                        <div className="flex items-center gap-1.5 pt-1.5 border-t border-amber-100">
                          <button type="button" onClick={() => setEditingRow(r)} className="btn-ghost !flex-none !w-11 !px-0 !min-h-[44px]" title="Upravit záznam" aria-label="Upravit záznam"><Pencil size={16} /></button>
                          <button type="button" onClick={() => increment(r.id, -1)} disabled={Number(r.quantity) <= 0} className="btn-pocet !min-h-[44px]" aria-label="Ubrat sud">−</button>
                          <button type="button" onClick={() => increment(r.id, 1)} className="btn-pocet !min-h-[44px]" aria-label="Přidat sud">+</button>
                          <input type="number" inputMode="numeric" min="0" onWheel={(e) => e.currentTarget.blur()} key={r.quantity} defaultValue={r.quantity} onBlur={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); if (v !== Number(r.quantity)) setQty(r.id, v); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="min-h-[44px] rounded bg-white border border-neutral-200 text-neutral-800 font-bold text-xs px-1.5 cursor-pointer transition !w-14 text-center tabular-nums" title="Napiš počet ks (libovolné číslo)" />
                          <button
                            type="button"
                            onClick={() => del(r.id)}
                            className="btn-danger !flex-none !w-11 !px-0 !min-h-[44px] ml-2"
                            aria-label="Smazat záznam"
                          ><X size={18} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="rounded bg-amber-200/60 p-3 space-y-1 font-black text-amber-950 text-sm">
                  <div className="flex items-center justify-between"><span><PackageIcon className="ikona-text" /> Celkem</span><span>{totalCount} ks</span></div>
                  <div className="flex items-center justify-between text-xs font-bold text-amber-800">
                    <span>{totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} L</span>
                    <span>{(totalLiters / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} hl</span>
                  </div>
                </div>
              </div>

              <div className="hidden md:block rounded border border-amber-300/80 bg-amber-50/90 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-amber-300/80 bg-amber-100/80">
                      <th scope="col" className="text-left py-1.5 px-2 font-black text-amber-950">Datum</th>
                      <th scope="col" className="text-left py-1.5 px-2 font-black text-amber-950">Pivo</th>
                      <th scope="col" className="text-right py-1.5 px-2 font-black text-amber-950">KEG</th>
                      <th scope="col" className="text-right py-1.5 px-2 font-black text-amber-950">Ks</th>
                      <th scope="col" className="text-right py-1.5 px-2 font-black text-amber-950">Litry</th>
                      <th scope="col" className="text-right py-1.5 px-2 font-black text-amber-950">HL</th>
                      <th scope="col" className="text-right py-1.5 px-2 font-black text-amber-950">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r) => {
                      const beer = beers.find((b) => b.id === r.beer_id);
                      const pkg = packages.find((p) => p.id === r.package_id);
                      const vol = pkg ? Number(pkg.volume_l) : 0;
                      const liters = Number(r.quantity) * vol;
                      return (
                        <tr key={r.id} className="border-b border-amber-200/60 hover:bg-amber-100/70 transition-colors">
                          <td className="py-1.5 px-2 font-mono font-bold text-amber-950 whitespace-nowrap">{formatDate(r.entry_date)}</td>
                          <td className="py-1.5 px-2 font-bold text-amber-950 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                            <span className="truncate max-w-[120px]">{r.beer_name ?? beer?.name ?? '—'}</span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-semibold text-amber-900 whitespace-nowrap">{pkg ? `${vol}L` : '—'}</td>
                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">
                            {editingId === r.id ? (
                              <input
                                type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                                min="0"
                                step="1"
                                autoFocus
                                className="input text-base font-black w-16 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                value={editQty}
                                onChange={(e) => setEditQty(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') { setEditingId(null); setEditQty(''); } }}
                              />
                            ) : (
                              r.quantity
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">{liters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })}</td>
                          <td className="py-1.5 px-2 text-right font-bold text-amber-950">{(liters / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })}</td>
                          <td className="py-1.5 px-2 text-right whitespace-nowrap">
                            {editingId === r.id ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="px-2 h-6 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition tap"
                                  onClick={saveEdit}
                                  title="Uložit" aria-label="Uložit"
                                ><Check size={14} /></button>
                                <button
                                  type="button"
                                  className="px-2 h-6 grid place-items-center rounded bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-bold text-xs transition tap"
                                  onClick={() => { setEditingId(null); setEditQty(''); }}
                                  title="Zrušit" aria-label="Zrušit"
                                ><X size={14} /></button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="px-2 h-6 grid place-items-center rounded bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-xs transition tap"
                                  onClick={() => setEditingRow(r)}
                                  title="Upravit" aria-label="Upravit"
                                ><Pencil className="ikona-text" /></button>
                                <button
                                  type="button"
                                  className="w-6 h-6 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition tap"
                                  onClick={() => increment(r.id, -1)}
                                  disabled={Number(r.quantity) <= 0}
                                  title="Odebrat 1 ks" aria-label="Odebrat 1 ks"
                                >−</button>
                                <button
                                  type="button"
                                  className="w-6 h-6 grid place-items-center rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition tap"
                                  onClick={() => increment(r.id, 1)}
                                  title="Přidat 1 ks" aria-label="Přidat 1 ks"
                                >+</button>
                                <input type="number" inputMode="numeric" min="0" onWheel={(e) => e.currentTarget.blur()} key={r.quantity} defaultValue={r.quantity} onBlur={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); if (v !== Number(r.quantity)) setQty(r.id, v); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} className="h-6 rounded bg-white border border-amber-300 text-emerald-950 font-bold text-udaj px-1 cursor-pointer transition !w-14 text-center tabular-nums" title="Napiš počet ks (libovolné číslo)" />
                                <button
                                  type="button"
                                  className="w-6 h-6 grid place-items-center rounded bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs transition tap"
                                  onClick={() => del(r.id)}
                                  title="Smazat záznam" aria-label="Smazat záznam"
                                ><X size={14} /></button>
                              </div>
                            )}
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
                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{totalLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })}</td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950">{(totalLiters / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })}</td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-950"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>
      )}

      {/* TAB 3: POTŘEBA STOČIT KEGY */}
      {mode === 'all' && tab === 'plan' && (
        <div className="space-y-4">
          {err && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">{err}</div>
          )}
          <KeggingDayPlan
            plans={keggingPlan}
            weekLabel={weekLabel}
            todayISO={businessDateISO()}
            onCheck={togglePlanCheck}
            canEdit
            onShowOrders={(beerId, packageId) => { requestOrdersItemFilter({ beerId, packageId }); setPage?.('orders'); }}
          />
        </div>
      )}

      {/* Režim "jen přehledy" ukazuje rovnou plán stáčení — bývalá záložka
          "Potřeba stočit KEGy" byla odstraněna (počítala z měsíčního skladu,
          který se rozešel s realitou; podrobně viz lib/keggingPlan.ts). */}
      {mode === 'overviews_only' && (
        <div className="space-y-4">
          {err && (
            <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">{err}</div>
          )}
          <KeggingDayPlan
            plans={keggingPlan}
            weekLabel={weekLabel}
            todayISO={businessDateISO()}
            onCheck={togglePlanCheck}
            canEdit={false}
            onShowOrders={(beerId, packageId) => { requestOrdersItemFilter({ beerId, packageId }); setPage?.('orders'); }}
          />
        </div>
      )}
      {/* TAB 4: PŘEFUK KEG SUDŮ — přelití ze sudů jedné velikosti do jiných */}
      {(mode === 'all' && tab === 'prefuk') && (
        <div className="space-y-4">
          {/* Formulář přefuku */}
          <form onSubmit={addPrefuk} className="card p-4 sm:p-5">
            <div className="text-sm font-display font-black text-amber-950 mb-1"><RefreshCw className="ikona-text" /> Přefuk KEG sudů</div>
            <p className="text-xs text-neutral-500 mb-4">
              Přelití piva ze sudů jedné velikosti do jiných — ze skladu se <b>odečtou</b> sudy „ZE" a <b>přičtou</b> sudy „DO" (např. 3×50 l → 4×30 l).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label className="label">Datum</label>
                <input
                  type="date"
                  className="input"
                  value={pfDate}
                  onChange={(e) => setPfDate(e.target.value)}
                  required
                />
              </div>
              <div className="sm:col-span-1 lg:col-span-2">
                <label className="label">Druh piva</label>
                <select className="input" value={pfBeerId} onChange={(e) => setPfBeerId(e.target.value)} required>
                  <option value="">— vyber pivo —</option>
                  {beers.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Poznámka (nepovinné)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="např. na akci, na výčep…"
                  value={pfNote}
                  onChange={(e) => setPfNote(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
              {/* ZE — odečet */}
              <div className="rounded border-2 border-rose-300 bg-white p-3">
                <div className="text-udaj font-black text-rose-700 uppercase tracking-wider mb-2">
                  <Minus className="ikona-text" /> ZE sudů <span className="normal-case font-bold">(odečte se ze skladu)</span>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="label">Velikost sudu</label>
                    <select className="input" value={pfFromPkgId} onChange={(e) => setPfFromPkgId(e.target.value)} required>
                      <option value="">— vyber —</option>
                      {kegPackages.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Počet sudů</label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      min={1}
                      step={1}
                      inputMode="numeric"
                      className="input"
                      placeholder="ks"
                      value={pfFromCount}
                      onChange={(e) => setPfFromCount(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
              {/* DO — příčet */}
              <div className="rounded border-2 border-emerald-300 bg-white p-3">
                <div className="text-udaj font-black text-emerald-700 uppercase tracking-wider mb-2">
                  <Plus className="ikona-text" /> DO sudů <span className="normal-case font-bold">(přičte se na sklad)</span>
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <label className="label">Velikost sudu</label>
                    <select className="input" value={pfToPkgId} onChange={(e) => setPfToPkgId(e.target.value)} required>
                      <option value="">— vyber —</option>
                      {kegPackages.map((p) => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Počet sudů</label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      min={1}
                      step={1}
                      inputMode="numeric"
                      className="input"
                      placeholder="ks"
                      value={pfToCount}
                      onChange={(e) => setPfToCount(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
            {/* Náhled pohybu */}
            {pfFromPkgId && pfToPkgId && Number(pfFromCount) > 0 && Number(pfToCount) > 0 && (
              <div className="mt-4 rounded bg-white border border-neutral-200 p-3 text-sm">
                <div className="text-xs font-bold text-neutral-500 mb-1.5"><ClipboardList className="ikona-text" /> Přehled pohybu na skladě:</div>
                <div className="flex flex-wrap items-center gap-2 font-black">
                  <span className="text-rose-700">
                    − {pfFromCount} × {kegPackages.find((p) => p.id === pfFromPkgId)?.label ?? '?'}
                  </span>
                  <span className="text-neutral-400">→</span>
                  <span className="text-emerald-700">
                    + {pfToCount} × {kegPackages.find((p) => p.id === pfToPkgId)?.label ?? '?'}
                  </span>
                  <span className="text-neutral-400 font-semibold text-xs">
                    ({Number(pfFromCount) * Number(kegPackages.find((p) => p.id === pfFromPkgId)?.volume_l || 0)} l → {Number(pfToCount) * Number(kegPackages.find((p) => p.id === pfToPkgId)?.volume_l || 0)} l)
                  </span>
                </div>
              </div>
            )}

            {pfErr && <p className="text-xs text-rose-600 font-bold mt-3">{pfErr}</p>}

            <div className="flex justify-end mt-4">
              <button type="submit" className="btn-primary !rounded" disabled={pfSaving}>
                {pfSaving ? 'Ukládám…' : 'Uložit přefuk'}
              </button>
            </div>
          </form>

          {/* Historie přefuků */}
          <div className="card p-4">
            <div className="text-sm font-display font-black text-amber-950 mb-3">
              <Scroll className="ikona-text" /> Historie přefuků ({prefukRows.length})
            </div>
            {prefukRows.length === 0 ? (
              <EmptyState text="Zatím žádný přefuk. Přefukem se ze skladu odečtou sudy ZE a přičtou sudy DO." icon={RefreshCw} />
            ) : (
              <div className="overflow-x-auto scrollbar-thin rounded border border-neutral-200">
                <table className="table text-xs w-full">
                  <thead>
                    <tr className="bg-neutral-100 border-b border-neutral-200">
                      <th scope="col" className="p-2.5 text-left">Datum</th>
                      <th scope="col" className="p-2.5 text-left">Pivo</th>
                      <th scope="col" className="p-2.5 text-left">ZE sudů (odečet)</th>
                      <th scope="col" className="p-2.5 text-left">DO sudů (přičet)</th>
                      <th scope="col" className="p-2.5 text-left">Poznámka</th>
                      <th scope="col" className="p-2.5 text-center">Smazat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prefukRows.map((r) => {
                      const beer = beers.find((b) => b.id === r.beer_id);
                      return (
                        <tr key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50/80 transition-colors">
                          <td className="p-2.5 font-bold text-neutral-700 whitespace-nowrap">{r.entry_date}</td>
                          <td className="p-2.5 font-black text-neutral-950">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                              <span>{r.beer_name ?? beer?.name ?? '—'}</span>
                            </div>
                          </td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-black text-udaj border border-rose-200 whitespace-nowrap">
                              − {r.from_count} × {r.from_package_label ?? '?'}
                            </span>
                          </td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-black text-udaj border border-emerald-200 whitespace-nowrap">
                              + {r.to_count} × {r.to_package_label ?? '?'}
                            </span>
                          </td>
                          <td className="p-2.5 text-neutral-500">{r.note ?? ''}</td>
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => deletePrefuk(r.id)}
                              className="px-2 py-1 rounded text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition tap"
                              title="Smazat přefuk" aria-label="Smazat přefuk"
                            >
                              <Trash2 className="ikona-text" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: CHECKLIST — celý checklist (začátek, konec, měsíční údržba) na jedné stránce k nahlédnutí */}
      {(mode === 'all' && tab === 'checklist') && (
        <div className="card p-4 sm:p-5">
          <div className="text-sm font-display font-black text-amber-950 mb-4"><ClipboardList className="ikona-text" /> Checklist stáčení KEG — kompletní přehled</div>
          <KeggingChecklistBody
            dateStr={date}
            phase="all"
            isLastWeekOfMonth={isLastWeekOfMonth()}
          />
        </div>
      )}

      {editingRow && (
        <Modal open={true} onClose={() => setEditingRow(null)} title="Upravit záznam stáčení KEG">
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
                {kegPackages.map((p) => (
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
            <div>
              <label className="label">Číslo tanku</label>
              <select
                value={editingRow.cellar_tank_id || ''}
                onChange={(e) => setEditingRow({ ...editingRow, cellar_tank_id: e.target.value || null })}
                className="input"
              >
                <option value="">— Vyber tank —</option>
                {/* Kromě tanků se zahájeným stáčením i ty, které tohle pivo
                    DRŽÍ — bez nich by u staršího zápisu nešlo tank doplnit,
                    protože stáčení už na něm dávno skončilo. */}
                {Array.from(
                  new Map(
                    [...keggingActiveTanks,
                     ...cellarTanks.filter((t) => editingRow.beer_id && t.current_beer_id === editingRow.beer_id),
                     ...(editingRow.cellar_tank_id ? cellarTanks.filter((t) => t.id === editingRow.cellar_tank_id) : [])]
                      .map((t) => [t.id, t] as const)
                  ).values()
                ).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}{t.kegging_active === true ? '' : ' (bez zahájeného stáčení)'}
                  </option>
                ))}
              </select>
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
      {showImageImport && (
        <ImportKeggingFromImage
          isOpen={showImageImport}
          onClose={() => setShowImageImport(false)}
          beers={beers}
          packages={packages}
          onImport={handleApplyPhotoRows}
        />
      )}
      <KeggingChecklistModal
        isOpen={showChecklistModal}
        onClose={() => {
          setChecklistGate(false);
          setChecklistInitialCategory(null);
          setShowChecklistModal(false);

          // Měsíčně, ne denně — viz stejné místo v BottlingScreen.
          if (checklistGate && checklistPhase === 'start' && isLastWeekOfMonth()) {
            if (!isMonthlyLineDone('keg') && !isMonthlyChecklistCompleteForKeg(businessDateISO())) {
              setChecklistPhase('monthly');
              setChecklistInitialCategory('4. Měsíční údržba (1x měsíčně)');
              setShowChecklistModal(true);
            }
          }

          if (checklistPhase === 'end' || checklistPhase === 'monthly' || checklistPhase === 'start') {
            let checkedMap: Record<string, boolean> = {};
            try {
              const raw = localStorage.getItem('keg_checklist_' + businessDateISO());
              if (raw) checkedMap = JSON.parse(raw);
            } catch {}

            void autoLogKegSanitationFromChecklist({
              dateStr: businessDateISO(),
              checkedMap,
              performedBy: profile?.display_name || '',
              phase: checklistPhase,
            });
            // Viz stejné místo v BottlingScreen: hotová měsíční údržba umlčí
            // upozornění na měsíční úklid i dlaždici na Domů do dalšího měsíce.
            if (isMonthlyChecklistCompleteForKeg(businessDateISO())) {
              markMonthlyLineDone('keg');
              writeMonthlyCleanupStage(getMonthKey(), 'done');
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
      {showEndConfirm && (
        <Modal open onClose={() => setShowEndConfirm(false)} title="Dokončeno stáčení KEG">
          <div className="space-y-4 text-center py-2">
            <p className="text-sm font-semibold text-neutral-700">
              Stáčení KEGů bylo úspěšně uloženo do databáze.
            </p>
            <h3 className="font-display font-black text-base text-neutral-900">
              Budete dnes ještě pokračovat ve stáčení KEGů, nebo končíte?
            </h3>
            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-3">
              <button
                onClick={() => {
                  setShowEndConfirm(false);
                }}
                className="px-5 py-3 rounded bg-amber-500 hover:bg-amber-400 text-neutral-900 font-black text-xs transition shadow-md"
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
                className="px-5 py-3 rounded bg-sky-700 hover:bg-sky-800 text-white font-black text-xs transition shadow-md"
              >
                <Brush className="ikona-text" /> Končím (otevřít Úklidový checklist)
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}


function Field2({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder="poznámka" />
    </div>
  );
}
