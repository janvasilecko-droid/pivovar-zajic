import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase, Beer, Package, EntryRow, CellarTank, useRealtime, beerBg, beerText, beerName, pkgBg, pkgText, formatPackageLabel } from '../lib/supabase';
import { EmptyState, Spinner } from '../components/ui';
import { isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';
import { exportKeggingToExcel } from '../lib/excel';
import { VoiceRecorder } from '../components/VoiceRecorder';
import { parseFreeTextEntries, loadAliasMap, emptyAliasMap, type ParserAliasMap } from '../lib/orderParser';
import { Loader2 } from 'lucide-react';

type OrderRow = { id: string; order_date: string; status: string };
type OrderItemRow = { order_id: string; package_id: string | null; quantity: number; beer_id: string | null; beer_name: string | null };

const ROW_COUNT = 12;
type RowInput = { beerId: string; pkgId: string; qty: string };
const emptyItem = (): RowInput => ({ beerId: '', pkgId: '', qty: '' });
const emptyRows = (): RowInput[] => Array.from({ length: ROW_COUNT }, emptyItem);

export default function KeggingScreen({ setPage, mode = 'all' }: { setPage?: (p: any, sec?: string) => void; mode?: 'entry_only' | 'overviews_only' | 'all' } = {}) {
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [cellarTanks, setCellarTanks] = useState<CellarTank[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const loadCountRef = useRef(0);

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [cellarTankId, setCellarTankId] = useState('');
  const [entryRows, setEntryRows] = useState<RowInput[]>(emptyRows());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [aliasMap, setAliasMap] = useState<ParserAliasMap>(emptyAliasMap());
  useEffect(() => { loadAliasMap().then(setAliasMap).catch(() => {}); }, []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');

  // Zápis / Přehled / Potřeba stočit KEGy záložky
  const [tab, setTab] = useState<'zapis' | 'prehled' | 'potreba'>('zapis');

  // Datové sady pro výpočet potřeb KEG sudů (Objednávky vs. Sklad)
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [inventoryRows, setInventoryRows] = useState<any[]>([]);
  const [fasovaniRows, setFasovaniRows] = useState<any[]>([]);
  const [prodejnaRows, setProdejnaRows] = useState<any[]>([]);
  const [writeoffsRows, setWriteoffsRows] = useState<any[]>([]);

  // Filtry pro "Potřeba stočit KEGy"
  const [reqKegBeerFilter, setReqKegBeerFilter] = useState('');
  const [reqKegPkgFilter, setReqKegPkgFilter] = useState('');
  const [reqKegOnlyMissing, setReqKegOnlyMissing] = useState(true);

  // Přehled záznamů: filtr podle období (den/týden/měsíc) + filtr podle piva

  const [recordsView, setRecordsView] = useState<'day' | 'week' | 'month'>('month');
  const [recordsWeekKey, setRecordsWeekKey] = useState(() => isoWeekKey(new Date().toISOString().slice(0, 10)));
  const [recordsMonthKey, setRecordsMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const [recordsDay, setRecordsDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [beerFilter, setBeerFilter] = useState('');

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
    let result = rows;
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
    return result;
  }, [rows, recordsView, recordsMonthKey, recordsWeekKey, recordsDay, beerFilter]);


  const [weekKey, setWeekKey] = useState(isoWeekKey(new Date().toISOString().slice(0, 10)));
  const [weekOrders, setWeekOrders] = useState<OrderRow[]>([]);
  const [weekItems, setWeekItems] = useState<OrderItemRow[]>([]);
  // Období pro "Zbývá stočit keg": týden nebo celý měsíc
  const [kegPeriod, setKegPeriod] = useState<'week' | 'month'>('week');
  const [kegMonthKey, setKegMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  // Inventura (sklad sudů) pro vybraný měsíc — mapa `${beer_id}__${package_id}` → ks
  const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({});


  const kegPackages = useMemo(() => packages.filter((p) => p.kind === 'keg').sort((a, b) => b.volume_l - a.volume_l), [packages]);

  // Aktivní sklepní tanky (stáčí se z nich) — status active nebo emptying
  const activeCellarTanks = useMemo(() => cellarTanks.filter((t) => t.status === 'active' || t.status === 'emptying'), [cellarTanks]);
  const selectedCellarTank = cellarTanks.find((t) => t.id === cellarTankId);

  // Pro dané pivo najde aktivní/stáčecí tank, ve kterém toto pivo skutečně je.
  // Přednost má tank s aktivním stáčením (kegging_active = true) — odečítá se JEN z něj,
  // i kdyby měl jiný tank se stejným pivem větší objem. Pokud žádný tank nemá spuštěné
  // stáčení, spadne na fallback (největší objem) — dnešní chování.
  function findTankForBeer(beerId: string): CellarTank | undefined {
    if (!beerId) return undefined;
    const candidates = activeCellarTanks.filter((t) => t.current_beer_id === beerId);
    if (candidates.length === 0) return undefined;
    // JEN tank s aktivním stáčením (kegging_active = true) — pokud žádný není, neodečítá se z žádného tanku.
    // "Ukončit stáčení" v Cellar.tsx nastaví kegging_active = false, čímž se tank přestane odebírat.
    const activeSources = candidates.filter((t) => t.kegging_active === true);
    if (activeSources.length > 0) {
      return activeSources.reduce((best, t) => Number(t.current_volume_l) > Number(best.current_volume_l) ? t : best);
    }
    return undefined;
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

  // Souhrn odečtu podle skutečně nalezeného tanku pro pivo na každém řádku (ne podle globálního výběru).
  // Mapa tankId -> litry, které se z něj odečtou; a seznam řádků, pro které nebyl nalezen žádný tank.
  const rowTankPreview = useMemo(() => {
    const perTank = new Map<string, number>();
    let missingCount = 0;
    entryRows.forEach((r) => {
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      if (!pkg || !(n > 0) || !r.beerId) return;
      const tank = findTankForBeer(r.beerId);
      if (!tank) { missingCount++; return; }
      const l = n * Number(pkg.volume_l);
      perTank.set(tank.id, (perTank.get(tank.id) ?? 0) + l);
    });
    return { perTank, missingCount };
  }, [entryRows, packages, activeCellarTanks]);

  async function load(silent = false) {
    const loadId = ++loadCountRef.current;
    if (!silent && !rows.length) setLoading(true);
    const [kg, ct, b, p, ords, oi, inv, fa, fp, wo] = await Promise.all([
      supabase.from('kegging').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: true }).order('id'),
      supabase.from('cellar_tanks').select('*').order('label'),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('orders').select('id,order_date,status'),
      supabase.from('order_items').select('order_id,beer_id,package_id,quantity'),
      supabase.from('inventory').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('fasovani').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('fasovani_private').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('writeoffs').select('entry_date,beer_id,package_id,quantity'),
    ]);
    if (loadId !== loadCountRef.current) return;
    setRows((kg.data as EntryRow[]) ?? []);
    setCellarTanks((ct.data as CellarTank[]) ?? []);
    if (b.data) setBeers(b.data as Beer[]);
    if (p.data) setPackages(p.data as Package[]);
    if (ords.data) setOrders(ords.data);
    if (oi.data) setOrderItems(oi.data);
    if (inv.data) setInventoryRows(inv.data);
    if (fa.data) setFasovaniRows(fa.data);
    if (fp.data) setProdejnaRows(fp.data);
    if (wo.data) setWriteoffsRows(wo.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['kegging', 'cellar_tanks', 'beers', 'packages', 'orders', 'order_items', 'inventory', 'fasovani', 'fasovani_private', 'writeoffs'], () => load(true));

  // Výpočet potřeby stočení KEG sudů (Objednáno - Skladem)
  const kegRequirements = useMemo(() => {
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const kegPkgIds = new Set(packages.filter((p) => p.kind === 'keg').map((p) => p.id));
    const activeOrderIds = new Set(
      orders
        .filter((o) => {
          if (o.status === 'storno' || o.status === 'vyrizeno' || o.status === 'vyrizeno_zavoz') return false;
          const targetDate = o.delivery_date || o.order_date;
          return targetDate && targetDate.startsWith(curMonth);
        })
        .map((o) => o.id)
    );

    const orderedMap: Record<string, number> = {};
    orderItems.filter((item) => item.package_id && kegPkgIds.has(item.package_id) && activeOrderIds.has(item.order_id)).forEach((item) => {
      if (!item.beer_id || !item.package_id) return;
      const k = `${item.beer_id}__${item.package_id}`;
      orderedMap[k] = (orderedMap[k] || 0) + Number(item.quantity || 0);
    });

    // Počáteční inventura pouze pro aktuální měsíc (pokud neexistují záznamy pro curMonth, je počáteční stav 0 ks)
    const invMap: Record<string, number> = {};
    inventoryRows.filter((r) => r.entry_date?.startsWith(curMonth)).forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      invMap[k] = (invMap[k] || 0) + Number(r.quantity || 0);
    });

    // Pohyby vyfiltrované pro aktuální měsíc
    const bottledMap: Record<string, number> = {};
    rows.filter((r) => r.entry_date?.startsWith(curMonth)).forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      bottledMap[k] = (bottledMap[k] || 0) + Number(r.quantity || 0);
    });

    const outgoingMap: Record<string, number> = {};
    [...fasovaniRows, ...prodejnaRows, ...writeoffsRows].filter((r) => r.entry_date?.startsWith(curMonth)).forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      outgoingMap[k] = (outgoingMap[k] || 0) + Number(r.quantity || 0);
    });

    type ReqRow = {
      beer_id: string;
      beer_name: string;
      package_id: string;
      package_label: string;
      volume_l: number;
      invQty: number;
      bottledQty: number;
      outgoingQty: number;
      stockQty: number;
      orderedQty: number;
      neededQty: number;
    };

    const list: ReqRow[] = [];
    beers.forEach((b) => {
      packages.filter((p) => kegPkgIds.has(p.id)).forEach((p) => {
        const k = `${b.id}__${p.id}`;
        const invQty = Number(invMap[k] || 0);
        const bottledQty = Number(bottledMap[k] || 0);
        const outgoingQty = Number(outgoingMap[k] || 0);
        const stockQty = Math.max(0, invQty + bottledQty - outgoingQty);
        const orderedQty = Number(orderedMap[k] || 0);
        const neededQty = Math.max(0, orderedQty - stockQty);

        if (orderedQty > 0 || stockQty > 0 || invQty > 0 || bottledQty > 0) {
          list.push({
            beer_id: b.id,
            beer_name: b.name,
            package_id: p.id,
            package_label: p.label,
            volume_l: Number(p.volume_l || 0),
            invQty,
            bottledQty,
            outgoingQty,
            stockQty,
            orderedQty,
            neededQty,
          });
        }
      });
    });

    return list;
  }, [beers, packages, orders, orderItems, inventoryRows, rows, fasovaniRows, prodejnaRows, writeoffsRows]);

  const filteredKegRequirements = useMemo(() => {
    let list = kegRequirements;
    if (reqKegBeerFilter) list = list.filter((r) => r.beer_id === reqKegBeerFilter);
    if (reqKegPkgFilter) list = list.filter((r) => r.package_id === reqKegPkgFilter);
    if (reqKegOnlyMissing) list = list.filter((r) => r.neededQty > 0);
    return list;
  }, [kegRequirements, reqKegBeerFilter, reqKegPkgFilter, reqKegOnlyMissing]);

  const reqKegTotals = useMemo(() => {
    return filteredKegRequirements.reduce(
      (acc, r) => {
        acc.ordered += r.orderedQty;
        acc.stock += r.stockQty;
        acc.needed += r.neededQty;
        acc.neededLiters += r.neededQty * r.volume_l;
        return acc;
      },
      { ordered: 0, stock: 0, needed: 0, neededLiters: 0 }
    );
  }, [filteredKegRequirements]);

  // Pokud existuje přesně jeden aktivní tank, předvyplní se automaticky (jen jako výchozí pivo pro prázdné řádky)
  useEffect(() => {
    if (!cellarTankId && activeCellarTanks.length === 1) setCellarTankId(activeCellarTanks[0].id);
  }, [activeCellarTanks, cellarTankId]);

  // (zrušeno — pivo se nevyplňuje automaticky z tanku)


  // nacti objednavky + polozky pro dany tyden/mesic (kvuli prehledu objednanych kegu)
  useEffect(() => {
    (async () => {
      // Měsíc, ke kterému se vztahuje inventura (sklad sudů) — pro týden vezmeme měsíc začátku týdne
      const invMonth = kegPeriod === 'month' ? kegMonthKey : weekRange(weekKey).start.toISOString().slice(0, 7);
      const [{ data: ords }, { data: inv }] = await Promise.all([
        supabase.from('orders').select('id,order_date,status').order('order_date', { ascending: false }),
        supabase.from('inventory').select('beer_id,package_id,quantity,entry_date'),
      ]);
      const all = (ords as OrderRow[] ?? []).filter((o) => o.status !== 'storno');
      const wkOrders = kegPeriod === 'month'
        ? all.filter((o) => o.order_date?.startsWith(kegMonthKey))
        : all.filter((o) => isoWeekKey(o.order_date) === weekKey);
      setWeekOrders(wkOrders);

      // Inventura (sklad sudů) pro vybraný měsíc — mapa `${beer_id}__${package_id}` → ks
      const invAcc: Record<string, number> = {};
      ((inv as any[]) ?? []).filter((r) => r.entry_date?.startsWith(invMonth)).forEach((r) => {
        if (!r.beer_id || !r.package_id) return;
        const k = `${r.beer_id}__${r.package_id}`;
        invAcc[k] = (invAcc[k] || 0) + Number(r.quantity || 0);
      });
      setInventoryMap(invAcc);

      if (!wkOrders.length) { setWeekItems([]); return; }
      const { data: its } = await supabase.from('order_items').select('order_id,package_id,quantity,beer_id,beer_name').in('order_id', wkOrders.map((o) => o.id));
      setWeekItems((its as OrderItemRow[]) ?? []);
    })();
  }, [weekKey, kegPeriod, kegMonthKey]);


  const orderedKegCount = useMemo(() => {
    const kegPkgIds = new Set(packages.filter((p) => p.kind === 'keg').map((p) => p.id));
    return weekItems.filter((i) => i.package_id && kegPkgIds.has(i.package_id)).reduce((s, i) => s + Number(i.quantity), 0);
  }, [weekItems, packages]);
  const wr = weekRange(weekKey);

  // Měsíc, ke kterému se vztahuje "Zbývá stočit keg" (pro inventuru i stáčení tento měsíc)
  const kegInvMonth = useMemo(
    () => (kegPeriod === 'month' ? kegMonthKey : weekRange(weekKey).start.toISOString().slice(0, 7)),
    [kegPeriod, kegMonthKey, weekKey]
  );

  // Stočeno tento měsíc (kegging záznamy v daném měsíci) — mapa `${beerKey}|${volume}` → ks
  const keggedMonthMap = useMemo(() => {
    type Key = string; // `${beerKey}|${volume}`
    const keggedMap = new Map<Key, number>();
    rows.forEach((r) => {
      if (!r.entry_date?.startsWith(kegInvMonth)) return; // jen tento měsíc
      const pkg = kegPackages.find((p) => p.id === r.package_id);
      if (!pkg) return;
      const beerKey = r.beer_id ?? r.beer_name ?? '—';
      const key = `${beerKey}|${pkg.volume_l}`;
      keggedMap.set(key, (keggedMap.get(key) ?? 0) + Number(r.quantity));
    });
    return keggedMap;
  }, [rows, kegPackages, kegInvMonth]);

  // Rozpis objednaných sudů podle piva × velikost (za vybraný týden/měsíc) + kolik ještě zbývá stočit.
  // Zbývá = objednáno − (inventura/sklad na konci měsíce + stočeno tento měsíc).
  // Tedy sudy, které zbyly na skladě na konci měsíce, plus ty, co se tento měsíc stočily,
  // se započítají jako pokrytí objednávky.
  const orderedByBeerSize = useMemo(() => {
    type Key = string; // `${beerKey}|${volume}`
    const orderedMap = new Map<Key, { beerKey: string; beerName: string; volume: number; ordered: number }>();
    weekItems.forEach((i) => { // weekItems are all order items
      const pkg = kegPackages.find((p) => p.id === i.package_id);
      if (!pkg) return;
      const beerKey = i.beer_id ?? i.beer_name ?? '—';
      const beerName = i.beer_name ?? beers.find((b) => b.id === i.beer_id)?.name ?? '—';
      const key = `${beerKey}|${pkg.volume_l}`;
      const cur = orderedMap.get(key) ?? { beerKey, beerName, volume: Number(pkg.volume_l), ordered: 0 };
      cur.ordered += Number(i.quantity);
      orderedMap.set(key, cur);
    });

    const list = [...orderedMap.entries()].map(([key, v]) => {
      const tapped = keggedMonthMap.get(key) ?? 0; // stočeno tento měsíc
      // Inventura (sklad sudů) pro dané pivo+velikost — najdeme obal podle objemu
      const pkg = kegPackages.find((p) => Number(p.volume_l) === v.volume);
      const invKey = pkg ? `${v.beerKey}__${pkg.id}` : '';
      const stock = invKey && inventoryMap[invKey] ? Number(inventoryMap[invKey]) : 0;
      const covered = tapped + stock; // pokryto = stočeno tento měsíc + sklad na konci měsíce
      const remaining = Math.max(v.ordered - covered, 0);
      return { ...v, tapped, stock, remaining };
    });
    list.sort((a, b) => a.beerName.localeCompare(b.beerName, 'cs') || a.volume - b.volume);

    // Souhrn zbývá stočit celkem podle velikosti (bez ohledu na pivo)
    const remainingBySize = new Map<number, number>();
    list.forEach((r) => remainingBySize.set(r.volume, (remainingBySize.get(r.volume) ?? 0) + r.remaining));
    const remainingSizeList = [...remainingBySize.entries()]
      .map(([volume, remaining]) => ({ volume, remaining }))
      .filter((r) => r.remaining > 0)
      .sort((a, b) => b.volume - a.volume);

    return { list, remainingSizeList };
  }, [weekItems, keggedMonthMap, kegPackages, beers, inventoryMap]);



  // Souhrn stáčení z tanku (kegging) — sjednoceno s Cellar.tsx: % stočeno se počítá
  // ze skutečně zapsaných záznamů (source_volume_l), ne z current_volume_l tanku.
  const tankSummary = useMemo(() => {
    const m = new Map<string, { kegCount: number; sourceL: number }>();
    rows.forEach((r) => {
      const id = r.cellar_tank_id ?? '_none';
      if (!m.has(id)) m.set(id, { kegCount: 0, sourceL: 0 });
      const s = m.get(id)!;
      s.kegCount += Number(r.quantity) ?? 0;
      s.sourceL += Number(r.source_volume_l ?? 0);
    });
    return m;
  }, [rows]);

  function setRowField(i: number, field: keyof RowInput, value: string) {
    setEntryRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  // Hlasový zápis: přepis se rozparsuje a naplní se první volné prázdné řádky.
  // Pro KEG režim preferujeme obaly druhu 'keg'
  function handleVoiceResult(text: string) {
    // Nejprv zkusíme normální parser
    let parsed = parseFreeTextEntries(text, beers, packages, aliasMap);

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
                setEntryRows((rs) => rs.map((r, j) => j === idx ? { beerId: beer.id, pkgId: pkg.id, qty: String(qty) } : r));
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
        };
        cursor++;
      }
      return next;
    });
    setErr(null);
  }


  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    setErr(null);
    const filled = entryRows.filter((r) => r.pkgId && Number(r.qty) > 0);
    if (filled.length === 0) { setErr('Vyplň alespoň jeden řádek (obal a množství).'); return; }
    setSaving(true);

    // Každý řádek si najde svůj vlastní zdrojový tank podle piva na řádku (ne podle globálně
    // vybraného tanku). Pokud pro dané pivo není žádný aktivní tank, řádek se přesto uloží,
    // jen bez vazby na tank a bez odečtu objemu.
    const payloads = filled.map((r) => {
      const beer = beers.find((b) => b.id === r.beerId);
      const pkg = packages.find((p) => p.id === r.pkgId);
      const n = Number(r.qty);
      const tank = r.beerId ? findTankForBeer(r.beerId) : undefined;
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

    const { error } = await supabase.from('kegging').insert(payloads);
    setSaving(false);
    if (error) { setErr(error.message); return; }

    // odecti stoceny objem z kazdeho dotcenho tanku zvlast
    for (const [tankId, deductL] of deductByTank.entries()) {
      const tank = cellarTanks.find((t) => t.id === tankId);
      if (!tank) continue;
      const newVol = Math.max(Number(tank.current_volume_l) - deductL, 0);
      const newStatus = newVol <= 0 ? tank.status : 'emptying';
      await supabase.from('cellar_tanks').update({
        current_volume_l: newVol,
        status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', tankId);
    }

    setEntryRows(emptyRows()); setNote(''); setErr(null);
    setFlash(true); setTimeout(() => setFlash(false), 800);
    load(true);
  }

  async function del(id: string) {
    await supabase.from('kegging').delete().eq('id', id);
    setRows((r) => r.filter((x) => x.id !== id));
  }

  async function increment(id: string, delta: number) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const newQty = Number(row.quantity) + delta;
    if (newQty < 0) return;
    const { error } = await supabase.from('kegging').update({ quantity: newQty }).eq('id', id);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, quantity: newQty } : r));
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
    const { error } = await supabase.from('kegging').update({ quantity: newQty }).eq('id', editingId);
    if (error) { setErr(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === editingId ? { ...r, quantity: newQty } : r));
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

  return (
    <div className="space-y-6 pb-12">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl sm:rounded-3xl border border-neutral-200/90 shadow-2xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm sm:text-base font-display font-black text-amber-950 flex items-center gap-1.5 shrink-0">
            <span>🛢️</span>
            <span>{mode === 'entry_only' ? 'KEG (Stáčení)' : mode === 'overviews_only' ? 'KEG (Přehled)' : 'KEG (Stáčení & Přehled)'}</span>
          </span>
        </div>

        {/* Záložky: Zápis / Přehled / Potřeba stočit KEGy */}
        {mode === 'all' && (
          <div className="flex items-center gap-1.5 bg-neutral-100 p-1 rounded-xl border border-neutral-200 w-full sm:w-fit overflow-x-auto scrollbar-none flex-nowrap shrink-0">
            <button
              type="button"
              onClick={() => setTab('zapis')}
              className={`px-3.5 py-2 rounded-lg text-xs font-black transition shrink-0 min-h-[38px] ${tab === 'zapis' ? 'bg-amber-500 text-white shadow-xs' : 'text-neutral-700 hover:bg-amber-50'}`}
            >
              ✍️ Zápis
            </button>
            <button
              type="button"
              onClick={() => setTab('prehled')}
              className={`px-3.5 py-2 rounded-lg text-xs font-black transition shrink-0 min-h-[38px] ${tab === 'prehled' ? 'bg-amber-500 text-white shadow-xs' : 'text-neutral-700 hover:bg-amber-50'}`}
            >
              📊 Přehled
            </button>
            <button
              type="button"
              onClick={() => setTab('potreba')}
              className={`px-3.5 py-2 rounded-lg text-xs font-black transition flex items-center gap-1.5 shrink-0 min-h-[38px] ${tab === 'potreba' ? 'bg-rose-600 text-white shadow-xs' : 'text-neutral-700 hover:bg-rose-50'}`}
            >
              <span>🛢️ Potřeba stočit KEGy</span>
              {kegRequirements.some((r) => r.neededQty > 0) && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-300 text-amber-950 text-[10px] font-black animate-pulse">
                  {kegRequirements.filter((r) => r.neededQty > 0).length}
                </span>
              )}
            </button>
          </div>
        )}
          <div className="relative group">

            <button className="btn-ghost !bg-white border-amber-300 text-amber-950 font-extrabold text-xs shadow-xs" disabled={!rows.length}>📊 Export Excel ▾</button>
            {rows.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-neutral-200 rounded-xl shadow-lg py-1 min-w-[180px] hidden group-hover:block">
                <button className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-amber-50 hover:text-amber-950 transition" onClick={() => {
                  const now = new Date();
                  const m = now.toISOString().slice(0, 7);
                  const filtered = rows.filter((r) => r.entry_date?.startsWith(m));
                  exportKeggingToExcel(filtered.map((r) => ({ ...r, cellar_tank_label: cellarTanks.find((t) => t.id === r.cellar_tank_id)?.label ?? '', hl: ((Number(r.quantity) * (packages.find((p) => p.id === r.package_id)?.volume_l ?? 0)) / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) })), cellarTanks);
                }}>📅 Tento měsíc</button>
                <button className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-amber-50 hover:text-amber-950 transition" onClick={() => {
                  const d = new Date(); d.setMonth(d.getMonth() - 1);
                  const m = d.toISOString().slice(0, 7);
                  const filtered = rows.filter((r) => r.entry_date?.startsWith(m));
                  exportKeggingToExcel(filtered.map((r) => ({ ...r, cellar_tank_label: cellarTanks.find((t) => t.id === r.cellar_tank_id)?.label ?? '', hl: ((Number(r.quantity) * (packages.find((p) => p.id === r.package_id)?.volume_l ?? 0)) / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) })), cellarTanks);
                }}>📅 Minulý měsíc</button>
                <button className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-amber-50 hover:text-amber-950 transition" onClick={() => {
                  const wk = recordsView === 'week' ? recordsWeekKey : weekKey;
                  const filtered = rows.filter((r) => isoWeekKey(r.entry_date) === wk);
                  exportKeggingToExcel(filtered.map((r) => ({ ...r, cellar_tank_label: cellarTanks.find((t) => t.id === r.cellar_tank_id)?.label ?? '', hl: ((Number(r.quantity) * (packages.find((p) => p.id === r.package_id)?.volume_l ?? 0)) / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) })), cellarTanks);
                }}>📅 Tento týden</button>
                <button className="w-full text-left px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-amber-50 hover:text-amber-950 transition" onClick={() => {
                  exportKeggingToExcel(rows.map((r) => ({ ...r, cellar_tank_label: cellarTanks.find((t) => t.id === r.cellar_tank_id)?.label ?? '', hl: ((Number(r.quantity) * (packages.find((p) => p.id === r.package_id)?.volume_l ?? 0)) / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) })), cellarTanks);
                }}>📅 Všechno</button>
              </div>
            )}
          </div>
        </div>

      {/* Zápis stáčení — multi-row (12 řádků pivo+obal+množství najednou) */}
      {tab === 'zapis' && mode !== 'overviews_only' && (
        <form onSubmit={add} className={`card px-1 py-3 mb-5 transition-all duration-200 ${flash ? 'ring-4 ring-success-500/20' : ''}`}>

          <div className="grid grid-cols-2 gap-3 items-end mb-4">
          <div>
            <label className="label">Datum</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Tank</label>
            <select className="input text-xs" value={cellarTankId} onChange={(e) => setCellarTankId(e.target.value)}>
              <option value="">— nevyplňovat —</option>
              {activeCellarTanks.map((t) => (
                <option key={t.id} value={t.id}>{t.label}{t.current_beer_name ? ` (${t.current_beer_name})` : ''}</option>
              ))}
            </select>
          </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="text-left py-1.5 px-1 font-black text-neutral-700">Pivo</th>
                  <th className="text-left py-1.5 px-1 font-black text-neutral-700">Obal</th>
                  <th className="text-center py-1.5 px-1 font-black text-neutral-700">Ks</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody>
                {entryRows.map((r, i) => {
                  const pkg = packages.find((p) => p.id === r.pkgId);
                  const liters = pkg ? (Number(r.qty || 0) * pkg.volume_l) : 0;
                  const hl = pkg ? (liters / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) : '—';
                  return (
                    <tr key={i} className="border-b border-neutral-200/60">
                      <td className="py-1 pr-0 w-[40%]">
                        <select className="input text-[10px] w-full appearance-none pr-2" value={r.beerId} onChange={(e) => setEntryRows((rs) => rs.map((x, j) => j === i ? { ...x, beerId: e.target.value } : x))}>
                          <option value="">—</option>
                          {beers.filter((b) => b.is_active).map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-0 w-[35%]">
                        <select className="input text-[10px] w-full appearance-none pr-2" value={r.pkgId} onChange={(e) => setEntryRows((rs) => rs.map((x, j) => j === i ? { ...x, pkgId: e.target.value } : x))}>
                          <option value="">—</option>
                          {kegPackages.map((p) => (
                            <option key={p.id} value={p.id}>{p.volume_l} L</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 pr-0">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            type="button"
                            className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition disabled:opacity-30"
                            disabled={!r.qty || Number(r.qty) <= 0}
                            onClick={() => setEntryRows((rs) => rs.map((x, j) => j === i ? { ...x, qty: String(Math.max(0, Number(x.qty) - 1)) } : x))}
                          >−</button>
                                                    <span className="w-20 min-w-[4rem] text-lg font-black text-center text-neutral-900 bg-white border border-neutral-200 rounded-lg py-1.5">
                            {Number(r.qty) > 0 ? r.qty : '0'}
                          </span>



                          <button
                            type="button"
                            className="w-6 h-6 grid place-items-center rounded-lg bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition"
                            onClick={() => setEntryRows((rs) => rs.map((x, j) => j === i ? { ...x, qty: String(Number(x.qty || 0) + 1) } : x))}
                          >+</button>
                        </div>
                      </td>
                      <td className="py-1 pr-0 text-right whitespace-nowrap">
                        {pkg && Number(r.qty) > 0 ? (
                          <span className="text-xs font-bold text-neutral-700">
                            {liters.toLocaleString('cs-CZ', { maximumFractionDigits: 0 })} L
                            <span className="text-[10px] text-neutral-400 ml-1">({hl} HL)</span>
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">—</span>
                        )}
                      </td>
                      <td className="py-1">
                        <div className="flex items-center gap-1">
                          <button type="button" className="w-7 h-7 grid place-items-center rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold text-sm transition" onClick={add} title="Uložit vše">✓</button>
                          <button type="button" className="w-7 h-7 grid place-items-center rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-sm transition" onClick={() => setEntryRows((rs) => rs.map((x, j) => j === i ? emptyItem() : x))} title="Zrušit řádek">✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <button type="submit" disabled={saving} className="btn-primary text-xs font-black shadow-md">
                {saving ? '⏳ Ukládám…' : '💾 Uložit stáčení'}
              </button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setEntryRows([...entryRows, emptyItem()])}>➕ Přidat řádek</button>
              <button type="button" className="btn-ghost text-xs" onClick={() => setEntryRows(emptyRows())}>🗑️ Vymazat vše</button>
            </div>
            {err && <span className="text-xs font-bold text-rose-700">{err}</span>}
          </div>

        </form>
      )}

      {/* Voice recorder mimo form */}
      {tab === 'zapis' && mode !== 'overviews_only' && (
        <div className="flex justify-end -mt-4 mb-2">
          <VoiceRecorder onResult={handleVoiceResult} beerNames={beers.map((b) => b.name)} />
        </div>
      )}

      {/* Prehled: objednane kegy na dany tyden & tanky */}
      {tab === 'prehled' && mode !== 'entry_only' && (
        <>

          {/* Zbývá stočit keg — kompaktní */}
          <div className="card p-3 mb-4 border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/80 to-amber-100/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-display font-black text-amber-950 text-xs">🛢️ Zbývá stočit keg</span>
                <span className="text-[10px] text-amber-800/70">{kegPeriod === 'week' ? `týden ${wr.label}` : `měsíc ${kegMonthKey}`}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex items-center rounded-lg bg-amber-100 border border-amber-300/70 overflow-hidden mr-1">
                  <button onClick={() => setKegPeriod('week')} className={`px-2 py-1 text-[10px] font-bold transition ${kegPeriod === 'week' ? 'bg-amber-400 text-amber-950' : 'text-amber-800'}`}>Týden</button>
                  <button onClick={() => setKegPeriod('month')} className={`px-2 py-1 text-[10px] font-bold transition ${kegPeriod === 'month' ? 'bg-amber-400 text-amber-950' : 'text-amber-800'}`}>Měsíc</button>
                </div>
                <button onClick={() => kegPeriod === 'week' ? setWeekKey(shiftWeek(weekKey, -1)) : setKegMonthKey(shiftMonth(kegMonthKey, -1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">‹</button>
                <button onClick={() => kegPeriod === 'week' ? setWeekKey(shiftWeek(weekKey, 1)) : setKegMonthKey(shiftMonth(kegMonthKey, 1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">›</button>
              </div>
            </div>

            {orderedByBeerSize.remainingSizeList.length === 0 ? (
              <div className="text-xs text-emerald-800 bg-emerald-100/80 border border-emerald-200 rounded-xl px-3 py-2 font-bold flex items-center gap-1.5">
                <span>✅</span>
                <span>Všechny objednané sudy jsou již stočeny!</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {orderedByBeerSize.remainingSizeList.map((r) => (
                  <div key={r.volume} className="flex items-center gap-1 bg-amber-100/80 rounded-lg px-2.5 py-1.5 border border-amber-300/60 shadow-2xs">
                    <span className="text-[11px] font-bold text-amber-950 whitespace-nowrap">KEG {r.volume}L</span>
                    <span className="text-xs font-black text-rose-800">{r.remaining}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Tabulka: přehled zbývá stočit podle piv a velikostí */}
            {orderedByBeerSize.list.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-bold text-amber-800 mb-2">📋 Rozpis podle piv a velikostí</div>
                <div className="rounded-xl border border-amber-300/80 bg-amber-50/90">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-amber-300/80 bg-amber-100/80">
                        <th className="text-left py-1.5 px-2 font-black text-amber-950">Pivo</th>
                        <th className="text-right py-1.5 px-2 font-black text-amber-950">KEG</th>
                        <th className="text-right py-1.5 px-2 font-black text-amber-950">Obj.</th>
                        <th className="text-right py-1.5 px-2 font-black text-amber-950">Sklad</th>
                        <th className="text-right py-1.5 px-2 font-black text-amber-950">Stoč.</th>
                        <th className="text-right py-1.5 px-2 font-black text-amber-950">Zbývá</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderedByBeerSize.list.map((r) => {
                        const beerObj = beers.find((b) => b.id === r.beerKey || b.name === r.beerName);
                        return (
                          <tr key={`${r.beerKey}|${r.volume}`} className="border-b border-amber-200/60 hover:bg-amber-100/70">
                            <td className="py-1.5 px-2 font-bold text-amber-950 flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20" style={{ backgroundColor: beerBg(beerObj) }} />
                              <span className="truncate max-w-[100px]">{r.beerName}</span>
                            </td>
                            <td className="py-1.5 px-2 text-right font-semibold text-amber-900 whitespace-nowrap">{r.volume}L</td>
                            <td className="py-1.5 px-2 text-right font-bold text-amber-950">{r.ordered}</td>
                            <td className="py-1.5 px-2 text-right font-bold text-sky-800">{r.stock}</td>
                            <td className="py-1.5 px-2 text-right font-bold text-emerald-800">{r.tapped}</td>
                            <td className="py-1.5 px-2 text-right whitespace-nowrap">
                              {r.remaining > 0 ? (
                                <span className="font-black text-rose-800">{r.remaining}</span>
                              ) : (
                                <span className="font-black text-emerald-800">✅</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}

                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Stočeno KEG za týden — jednotlivé záznamy s +/−/✕ */}
          {rows.length > 0 && (() => {
            const weekRows = rows.filter((r) => isoWeekKey(r.entry_date) === weekKey);
            if (weekRows.length === 0) return null;
            const sorted = [...weekRows].sort((a, b) => {
              const dateCmp = (b.entry_date ?? '').localeCompare(a.entry_date ?? '');
              if (dateCmp !== 0) return dateCmp;
              return (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id);
            });
            const totalCount = sorted.reduce((s, r) => s + Number(r.quantity), 0);

            return (
              <div className="card p-4 mb-5 border-2 border-emerald-300/80 bg-gradient-to-br from-emerald-50/80 to-emerald-100/30">
                <h3 className="font-display font-black text-emerald-950 text-sm mb-3">🍺 Stočeno KEG za týden {weekKey}</h3>
                <div className="rounded-xl border border-emerald-300/80 bg-emerald-50/90 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-emerald-300/80 bg-emerald-100/80">
                        <th className="text-left py-1.5 px-2 font-black text-emerald-950">Datum</th>
                        <th className="text-left py-1.5 px-2 font-black text-emerald-950">Pivo</th>
                        <th className="text-right py-1.5 px-2 font-black text-emerald-950">KEG</th>
                        <th className="text-right py-1.5 px-2 font-black text-emerald-950">Ks</th>
                        <th className="text-right py-1.5 px-2 font-black text-emerald-950">Akce</th>
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
                                  type="number"
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
                                    className="px-2 h-6 grid place-items-center rounded-lg bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition"
                                    onClick={saveEdit}
                                    title="Uložit"
                                  >✓</button>
                                  <button
                                    type="button"
                                    className="px-2 h-6 grid place-items-center rounded-lg bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-bold text-xs transition"
                                    onClick={() => { setEditingId(null); setEditQty(''); }}
                                    title="Zrušit"
                                  >✕</button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    className="px-2 h-6 grid place-items-center rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-xs transition"
                                    onClick={() => startEdit(r.id)}
                                    title="Upravit"
                                  >✏️</button>
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-emerald-950 font-bold text-xs transition"
                                    onClick={() => increment(r.id, -1)}
                                    disabled={Number(r.quantity) <= 0}
                                    title="Odebrat 1 ks"
                                  >−</button>
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded-lg bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition"
                                    onClick={() => increment(r.id, 1)}
                                    title="Přidat 1 ks"
                                  >+</button>
                                  <button
                                    type="button"
                                    className="w-6 h-6 grid place-items-center rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs transition"
                                    onClick={() => {
                                      if (confirm(`Smazat záznam: ${r.beer_name ?? beer?.name ?? '—'} ${vol}L × ${r.quantity} ks?`)) {
                                        del(r.id);
                                      }
                                    }}
                                    title="Smazat záznam"
                                  >✕</button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {/* Souhrnný řádek */}
                      <tr className="bg-emerald-200/60 font-black">
                        <td className="py-1.5 px-2 font-black text-emerald-950"></td>
                        <td className="py-1.5 px-2 font-black text-emerald-950">📦 Celkem</td>
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

        <div className="flex items-center justify-between">
          <div className="text-xs font-black uppercase tracking-wider text-amber-950/60 flex items-center gap-2">
            <span>📋</span>
            <span>Všechny záznamy stáčení KEG</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {rows.length > 0 && (
              <>
                {/* Filtr podle piva */}
                <select
                  value={beerFilter}
                  onChange={(e) => setBeerFilter(e.target.value)}
                  className="input text-xs font-bold px-2 py-1 rounded-lg border border-neutral-200 bg-white text-neutral-700 max-w-[140px]"
                >
                  <option value="">🍺 Všechna piva</option>
                  {beers.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>

                {/* Přepínač období: Den / Týden / Měsíc */}
                <div className="flex items-center gap-1 bg-white border border-neutral-200 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setRecordsView('day')}
                    className={`text-xs font-bold px-2.5 py-1 rounded-md border transition ${
                      recordsView === 'day'
                        ? 'bg-amber-200 border-amber-300 text-amber-950'
                        : 'bg-white border-transparent text-neutral-600'
                    }`}
                  >
                    📅 Den
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordsView('week')}
                    className={`text-xs font-bold px-2.5 py-1 rounded-md border transition ${
                      recordsView === 'week'
                        ? 'bg-amber-200 border-amber-300 text-amber-950'
                        : 'bg-white border-transparent text-neutral-600'
                    }`}
                  >
                    📅 Týden
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordsView('month')}
                    className={`text-xs font-bold px-2.5 py-1 rounded-md border transition ${
                      recordsView === 'month'
                        ? 'bg-amber-200 border-amber-300 text-amber-950'
                        : 'bg-white border-transparent text-neutral-600'
                    }`}
                  >
                    📅 Měsíc
                  </button>
                </div>

                {/* Navigace podle zvoleného období */}
                {recordsView === 'day' && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setRecordsDay(shiftDay(recordsDay, -1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">‹</button>
                    <input
                      type="date"
                      value={recordsDay}
                      onChange={(e) => setRecordsDay(e.target.value)}
                      className="input text-xs font-bold px-2 py-1 rounded-lg border border-neutral-200 bg-white text-neutral-700"
                    />
                    <button onClick={() => setRecordsDay(shiftDay(recordsDay, 1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">›</button>
                  </div>
                )}
                {recordsView === 'week' && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, -1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">‹</button>
                    <span className="text-xs font-bold text-amber-950 px-1 whitespace-nowrap">{weekRange(recordsWeekKey).label}</span>
                    <button onClick={() => setRecordsWeekKey(shiftWeek(recordsWeekKey, 1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">›</button>
                  </div>
                )}
                {recordsView === 'month' && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setRecordsMonthKey(shiftMonth(recordsMonthKey, -1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">‹</button>
                    <span className="text-xs font-bold text-amber-950 px-1 whitespace-nowrap">{recordsMonthKey}</span>
                    <button onClick={() => setRecordsMonthKey(shiftMonth(recordsMonthKey, 1))} className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">›</button>
                  </div>
                )}
              </>
            )}
            {rows.length > 0 && <span className="chip bg-amber-100/60 text-amber-900/70 text-xs font-bold">{filteredRows.length} záznamů</span>}
          </div>

        </div>

        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState text="Zatím žádné záznamy. Přidej první výše." icon="📝" />
        ) : filteredRows.length === 0 ? (
          <EmptyState text="Žádné záznamy pro toto období." icon="📅" />
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
            <div className="card p-4 border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/80 to-amber-100/30">
              <h3 className="font-display font-black text-amber-950 text-sm mb-3">
                🍺 {recordsView === 'month' ? `Měsíc ${recordsMonthKey}` : recordsView === 'week' ? `Týden ${recordsWeekKey}` : `Den ${recordsDay}`}
              </h3>

              <div className="rounded-xl border border-amber-300/80 bg-amber-50/90 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-amber-300/80 bg-amber-100/80">
                      <th className="text-left py-1.5 px-2 font-black text-amber-950">Datum</th>
                      <th className="text-left py-1.5 px-2 font-black text-amber-950">Pivo</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">KEG</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Ks</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Litry</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">HL</th>
                      <th className="text-right py-1.5 px-2 font-black text-amber-950">Akce</th>
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
                                type="number"
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
                                  className="px-2 h-6 grid place-items-center rounded-lg bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition"
                                  onClick={saveEdit}
                                  title="Uložit"
                                >✓</button>
                                <button
                                  type="button"
                                  className="px-2 h-6 grid place-items-center rounded-lg bg-neutral-200 hover:bg-neutral-300 text-neutral-700 font-bold text-xs transition"
                                  onClick={() => { setEditingId(null); setEditQty(''); }}
                                  title="Zrušit"
                                >✕</button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="px-2 h-6 grid place-items-center rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold text-xs transition"
                                  onClick={() => startEdit(r.id)}
                                  title="Upravit"
                                >✏️</button>
                                <button
                                  type="button"
                                  className="w-6 h-6 grid place-items-center rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition"
                                  onClick={() => increment(r.id, -1)}
                                  disabled={Number(r.quantity) <= 0}
                                  title="Odebrat 1 ks"
                                >−</button>
                                <button
                                  type="button"
                                  className="w-6 h-6 grid place-items-center rounded-lg bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-bold text-xs transition"
                                  onClick={() => increment(r.id, 1)}
                                  title="Přidat 1 ks"
                                >+</button>
                                <button
                                  type="button"
                                  className="w-6 h-6 grid place-items-center rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-xs transition"
                                  onClick={() => {
                                    if (confirm(`Smazat záznam: ${r.beer_name ?? beer?.name ?? '—'} ${vol}L × ${r.quantity} ks?`)) {
                                      del(r.id);
                                    }
                                  }}
                                  title="Smazat záznam"
                                >✕</button>
                              </div>
                            )}
                          </td>

                        </tr>
                      );
                    })}
                    {/* Souhrnný řádek */}
                    <tr className="bg-amber-200/60 font-black">
                      <td className="py-1.5 px-2 font-black text-amber-950"></td>
                      <td className="py-1.5 px-2 font-black text-amber-950">📦 Celkem</td>
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
      {(mode === 'overviews_only' || (mode === 'all' && tab === 'potreba')) && (
        <div className="space-y-4">
          {/* Souhrnné karty */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-4 bg-white border border-neutral-200 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase text-neutral-500">Objednáno v KEG sudů</span>
              <div className="font-display font-black text-xl text-sky-700">{reqKegTotals.ordered} ks sudů</div>
              <span className="text-[11px] text-neutral-500">Aktivní neuplatněné KEG objednávky</span>
            </div>
            <div className="card p-4 bg-white border border-neutral-200 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase text-neutral-500">Sudů na skladě</span>
              <div className="font-display font-black text-xl text-emerald-700">{reqKegTotals.stock} ks sudů</div>
              <span className="text-[11px] text-neutral-500">Disponibilní KEG zásoby</span>
            </div>
            <div className={`card p-4 rounded-2xl space-y-1 ${reqKegTotals.needed > 0 ? 'bg-amber-600 text-white' : 'bg-neutral-900 text-white'}`}>
              <span className={`text-[10px] font-black uppercase ${reqKegTotals.needed > 0 ? 'text-amber-100' : 'text-amber-400'}`}>Potřeba stočit do KEGů (chybí)</span>
              <div className="font-display font-black text-xl">{reqKegTotals.needed} ks sudů ({(reqKegTotals.neededLiters / 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} hl / {reqKegTotals.neededLiters.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} L)</div>
              <span className="text-[11px] opacity-90">{reqKegTotals.needed > 0 ? '⚠️ Objednáno více sudů než je na skladě' : '✓ Všechny KEG objednávky pokryty'}</span>
            </div>
          </div>

          {/* Filtry & Tabulka */}
          <div className="card p-4 bg-white border border-neutral-200 rounded-3xl space-y-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display font-black text-base text-neutral-900 flex items-center gap-2">
                <span>🛢️</span>
                <span>KEGy které je potřeba stočit (Sklad vs. Objednané KEG sudy)</span>
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                {/* Filtr Pivo */}
                <select
                  value={reqKegBeerFilter}
                  onChange={(e) => setReqKegBeerFilter(e.target.value)}
                  className="input text-xs font-bold px-2.5 py-1.5 rounded-xl border border-neutral-200 bg-white text-neutral-800"
                >
                  <option value="">🍺 Všechna piva</option>
                  {beers.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>

                {/* Filtr KEG Obal */}
                <select
                  value={reqKegPkgFilter}
                  onChange={(e) => setReqKegPkgFilter(e.target.value)}
                  className="input text-xs font-bold px-2.5 py-1.5 rounded-xl border border-neutral-200 bg-white text-neutral-800"
                >
                  <option value="">🛢️ Všechny KEG obaly</option>
                  {packages.filter((p) => p.kind === 'keg').map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>

                {/* Přepínač: Jen chybějící */}
                <button
                  type="button"
                  onClick={() => setReqKegOnlyMissing(!reqKegOnlyMissing)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition border ${
                    reqKegOnlyMissing
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200'
                  }`}
                >
                  {reqKegOnlyMissing ? '⚠️ Jen chybějící (> 0)' : '📦 Všechny KEGy'}
                </button>
              </div>
            </div>

            {/* Tabulka */}
            {filteredKegRequirements.length === 0 ? (
              <EmptyState text={reqKegOnlyMissing ? 'Žádné chybějící KEGy! Všechny objednané KEG sudy jsou pokryté na skladě.' : 'Žádné položky k zobrazení.'} icon="🎉" />
            ) : (
              <div className="overflow-x-auto scrollbar-thin rounded-2xl border border-neutral-200">
                <table className="table text-xs w-full">
                  <thead>
                    <tr className="bg-neutral-100 border-b border-neutral-200">
                      <th className="p-2.5 text-left">Pivo</th>
                      <th className="p-2.5 text-left">KEG Obal</th>
                      <th className="p-2.5 text-right font-bold text-neutral-600">Poč. inv.</th>
                      <th className="p-2.5 text-right font-bold text-emerald-800">Stočeno (+)</th>
                      <th className="p-2.5 text-right font-bold text-amber-800">Výdeje (−)</th>
                      <th className="p-2.5 text-right font-bold text-emerald-900 bg-emerald-50">Skladem (=)</th>
                      <th className="p-2.5 text-right font-bold text-sky-800">Objednáno</th>
                      <th className="p-2.5 text-right font-black text-amber-900 bg-amber-50">Potřeba stočit (chybí)</th>
                      <th className="p-2.5 text-center font-bold">Stav</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredKegRequirements.map((r) => {
                      const beer = beers.find((b) => b.id === r.beer_id);
                      return (
                        <tr key={`${r.beer_id}__${r.package_id}`} className="border-b border-neutral-100 hover:bg-neutral-50/80 transition-colors">
                          <td className="p-2.5 font-black text-neutral-950 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/20" style={{ backgroundColor: beerBg(beer) }} />
                            <span>{r.beer_name}</span>
                          </td>
                          <td className="p-2.5 font-bold text-neutral-800">{r.package_label}</td>
                          <td className="p-2.5 text-right font-mono text-neutral-600">{r.invQty} ks</td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-700">+{r.bottledQty} ks</td>
                          <td className="p-2.5 text-right font-mono font-bold text-amber-700">−{r.outgoingQty} ks</td>
                          <td className="p-2.5 text-right font-mono font-black text-emerald-900 bg-emerald-50/50">{r.stockQty} ks</td>
                          <td className="p-2.5 text-right font-mono font-bold text-sky-700">{r.orderedQty} ks</td>
                          <td className={`p-2.5 text-right font-mono font-black bg-amber-50/50 ${r.neededQty > 0 ? 'text-amber-900 text-sm' : 'text-neutral-500'}`}>
                            {r.neededQty > 0 ? `${r.neededQty} ks (${(r.neededQty * r.volume_l / 100).toFixed(2)} hl)` : '0 ks'}
                          </td>
                          <td className="p-2.5 text-center">
                            {r.neededQty > 0 ? (
                              <span className="px-2.5 py-1 rounded-xl bg-amber-100 text-amber-900 font-black text-[11px] border border-amber-300 whitespace-nowrap">
                                ⚠️ Chybí {r.neededQty} ks sudů
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-[11px] border border-emerald-300 whitespace-nowrap">
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
            )}
          </div>
        </div>
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
