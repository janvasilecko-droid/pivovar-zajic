import { useEffect, useState } from 'react';
import { supabase, Beer, Package, useRealtime, beerBorder, fetchAllRows } from '../lib/supabase';
import { Spinner, EmptyState, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { AlertTriangle, ArrowRight, BarChart3, Beer as BeerIcon, Calculator, ClipboardList, Check, Layers, PackageCheck, Pin, Sparkles } from 'lucide-react';
import { AnnouncementManagerModal } from '../components/AnnouncementManagerModal';
import SkloPromoScreen from './SkloPromoScreen';
import { buildMovements, stockAsOf, stockKey } from '../lib/stockLedger';
import { QuickCountModal } from '../components/QuickCountModal';
import { fetchLabelBalances } from '../lib/labelStock';
import { zustatkyZavirek } from '../lib/materialSklad';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';
import { chyba, oznam } from '../lib/toast';
import { IkonaLahev, IkonaSud } from '../components/ikony';

type Row = {
  entry_date: string; beer_id: string | null; beer_name: string | null;
  package_id: string | null; package_label: string | null; quantity: number;
};

function monthKey(d: string): string { return d.slice(0, 7); }
function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function startOfMonthISO(iso: string): string { return iso.slice(0, 7) + '-01'; }

type StockByPkg = {
  package_id: string; label: string; quantity: number; volume_l: number; kind: string;
  fromInventory: number; brewedWeek: number;
  orderedWeek: number; writeoffsWeek: number; fasovaniWeek: number; prodejnaWeek: number; akTaken: number; akReturned: number;
  kegsUsedWeek: number; odpocet: number; remaining: number;
  /** Stav ze skladové knihy BEZ ořezání na nulu — záporný = evidence nesedí. */
  rawQuantity: number;
  /** Dorovnání inventury (manko/přebytek, ± z Inventura → Fyzická inventura). */
  adjWeek: number;
  /** Objednáno celkem mínus to, co už fyzicky odjelo (zavoz_deductions) tento měsíc — kolik ještě čeká na odvoz. */
  orderedRemaining: number;
  /**
   * Automatický odpočet závozu za tento měsíc (zavoz_deductions) — tedy to, co
   * už fyzicky odjelo k odběrateli. Je součástí `odpocet`, ale dlouho neměl
   * v tabulce vlastní sloupec, takže řádek nešlo sečíst: u 30l 12° Světlé
   * ukazoval „Odp. celkem −98", zatímco viditelné sloupce daly dohromady −1.
   */
  zavezenoWeek?: number;
  /** Objednáno s dovozem do konce TOHOTO týdne (ne celý měsíc) — základ pro "Zbyde". */
  orderedThisWeek: number;
};
type NesediRow = {
  key: string; beerName: string; pkgLabel: string;
  qty: number; baselineDate: string | null; baselineQty: number;
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

export default function Dashboard({ setPage, initialTab = 'sklad' }: { setPage?: (p: any) => void; initialTab?: 'sklad' | 'sklo_promo' }) {
  const [activeTab, setActiveTab] = useState<'sklad' | 'sklo_promo'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const { profile } = useAuth();
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [stats, setStats] = useState<StockStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<StockStat | null>(null);

  const [brewFrom, setBrewFrom] = useState<string>(startOfMonthISO(todayISO()));
  const [brewTo, setBrewTo] = useState<string>(todayISO());
  const [brewStats, setBrewStats] = useState<BrewStat[]>([]);
  const [brewLoading, setBrewLoading] = useState(true);
  const [showQuickCount, setShowQuickCount] = useState(false);
  // Položky, u kterých skladová kniha vychází záporně — evidence nesedí.
  const [nesedi, setNesedi] = useState<NesediRow[]>([]);
  const [showNesedi, setShowNesedi] = useState(false);

  async function handleConfirmQuickCount(items: { beerId: string; packageId: string; count: number }[]) {
    if (!items.length) return;
    const today = todayISO();
    const payloads = items.map((it) => {
      const beer = beers.find((b) => b.id === it.beerId);
      const pkg = packages.find((p) => p.id === it.packageId);
      return {
        entry_date: today,
        beer_id: it.beerId,
        beer_name: beer?.name ?? null,
        package_id: it.packageId,
        package_label: pkg?.label ?? null,
        quantity: it.count,
        note: 'Rychlé dotykové sčítadlo',
      };
    });

    const { error } = await supabase.from('inventory').insert(payloads);
    if (error) {
      chyba(`Chyba při ukládání inventury: ${error.message}`);
    } else {
      oznam(`Inventura (${items.length} položek) úspěšně uložena!`);
      load();
    }
  }

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const [{ data: b }, { data: pk }, { data: bt }, { data: kg }, { data: wo }, { data: inv }, { data: oi }, { data: ord }, { data: ak }, { data: fa }, { data: fp }, { data: zd }, { data: adj }, { data: pf }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      fetchAllRows('bottling', 'entry_date,beer_id,package_id,quantity,kegs_used,kegs_used_package_id,source_volume_l,note,created_at'),
      fetchAllRows('kegging', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('writeoffs', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('inventory', 'entry_date,beer_id,beer_name,package_id,package_label,quantity,note'),
      fetchAllRows('order_items', 'beer_id,package_id,quantity,order_id'),
      fetchAllRows('orders', 'id,order_date,delivery_date,status'),
      fetchAllRows('akce', 'entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
      fetchAllRows('fasovani', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('fasovani_private', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('zavoz_deductions', 'deduct_date,beer_id,package_id,quantity'),
      fetchAllRows('inventory_adjustments', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('keg_prefuk', 'entry_date,beer_id,from_package_id,from_count,to_package_id,to_count'),
    ]);
    const beerList = (b as Beer[]) ?? [];
    const pkgList = (pk as Package[]) ?? [];
    setBeers(beerList); setPackages(pkgList);
    type BtRow = Row & { kegs_used?: number | null; kegs_used_package_id?: string | null; source_volume_l?: number | null; note?: string | null; created_at?: string | null };
    const btRows = (bt as BtRow[]) ?? [];
    const kgRows = (kg as Row[]) ?? [];
    const woRows = (wo as Row[]) ?? [];
    const invRows = (inv as Row[]) ?? [];
    const oiRows = (oi as { beer_id: string | null; package_id: string | null; quantity: number; order_id: string }[]) ?? [];
    const ordRows = (ord as { id: string; order_date: string; delivery_date: string | null; status: string }[]) ?? [];
    const akRows = (ak as { entry_date: string; items: { beer_id: string | null; package_id: string | null; quantity_taken: number; quantity_returned: number }[] }[]) ?? [];
    const faRows = (fa as Row[]) ?? [];
    const fpRows = (fp as Row[]) ?? [];
    const zdRows = (zd as { deduct_date: string; beer_id: string | null; package_id: string | null; quantity: number }[]) ?? [];
    const adjRows = (adj as { entry_date: string; beer_id: string | null; package_id: string | null; quantity: number }[]) ?? [];
    const pfRows = (pf as any[]) ?? [];

    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastInvMonth = curMonth;

    // Podle DATA DOVOZU, ne data zadání objednávky — objednávka zadaná v jiném
    // měsíci, ale s dovozem v tomto měsíci, sem musí patřit (jinak by "Zbývá"
    // ignorovalo reálný odchod, který zavoz_deductions ten měsíc stejně odečte).
    const ordIdsThisMonth = new Set(
      ordRows
        .filter((o) => monthKey(o.delivery_date || o.order_date) === curMonth && o.status !== 'storno')
        .map((o) => o.id)
    );

    // "Zbyde" má smysl počítat jen proti objednávkám splatným DO KONCE TOHOTO
    // TÝDNE — objednávka s dovozem třeba za 10 dní ještě nemá smysl odečítat
    // z toho, co je aktuálně na skladě (to zkreslovalo "Zbyde" na 0, i když
    // fyzicky ještě nic neodešlo).
    const todayStr = todayISO();
    const weekKey = isoWeekKey(todayStr);
    const { start: weekStartDate, end: weekEndDate } = weekRange(weekKey);
    const weekStartStr = weekStartDate.toISOString().slice(0, 10);
    const weekEndStr = weekEndDate.toISOString().slice(0, 10);
    const isThisWeek = (dateStr: string | null | undefined) => !!dateStr && dateStr >= weekStartStr && dateStr <= weekEndStr;
    const ordIdsThisWeek = new Set(
      ordRows
        .filter((o) => isThisWeek(o.delivery_date || o.order_date) && o.status !== 'storno')
        .map((o) => o.id)
    );

    const getKegsUsed = (r: BtRow) => {
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


    // 📒 Skladová kniha — jediný zdroj pravdy o stavu skladu.
    const ledger = stockAsOf(buildMovements({
      inventoryRows: invRows,
      bottlingRows: btRows,
      keggingRows: kgRows,
      fasovaniRows: faRows,
      prodejnaRows: fpRows,
      writeoffsRows: woRows,
      zavozDeductionRows: zdRows,
      akceRows: akRows,
      prefukRows: pfRows,
      adjustmentRows: adjRows,
      packages: pkgList,
    }), todayISO());

    const result: StockStat[] = beerList.map((beer) => {
      const byPkg = new Map<string, StockByPkg>();
      const add = (rs: { beer_id: string | null; package_id: string | null; quantity: number }[], field: 'fromInventory' | 'brewedWeek' | 'orderedWeek' | 'orderedThisWeek' | 'writeoffsWeek' | 'fasovaniWeek' | 'prodejnaWeek' | 'akTaken' | 'akReturned') =>
        rs.forEach((r) => {
          if (r.beer_id !== beer.id || !r.package_id) return;
          const pkg = pkgList.find((p) => p.id === r.package_id);
          if (!pkg) return;
          let e = byPkg.get(r.package_id);
          if (!e) { e = { package_id: r.package_id, label: pkg.label, quantity: 0, volume_l: pkg.volume_l, kind: pkg.kind, fromInventory: 0, brewedWeek: 0, orderedWeek: 0, orderedThisWeek: 0, writeoffsWeek: 0, fasovaniWeek: 0, prodejnaWeek: 0, akTaken: 0, akReturned: 0, kegsUsedWeek: 0, odpocet: 0, remaining: 0, rawQuantity: 0, orderedRemaining: 0, adjWeek: 0 }; byPkg.set(r.package_id, e); }
          (e[field] as number) += Number(r.quantity);
        });
      
      pkgList.forEach((pkg) => {
        const k = `${beer.id}__${pkg.id}`;
        const qty = ledger.get(stockKey(beer.id, pkg.id))?.baselineQty || 0;
        if (qty > 0) {
          let e = byPkg.get(pkg.id);
          if (!e) { e = { package_id: pkg.id, label: pkg.label, quantity: 0, volume_l: pkg.volume_l, kind: pkg.kind, fromInventory: 0, brewedWeek: 0, orderedWeek: 0, orderedThisWeek: 0, writeoffsWeek: 0, fasovaniWeek: 0, prodejnaWeek: 0, akTaken: 0, akReturned: 0, kegsUsedWeek: 0, odpocet: 0, remaining: 0, rawQuantity: 0, orderedRemaining: 0, adjWeek: 0 }; byPkg.set(pkg.id, e); }
          e.fromInventory = qty;
        }
      });

      add(btRows.filter((r) => r.beer_id === beer.id && monthKey(r.entry_date) === curMonth && r.entry_date <= todayISO()), 'brewedWeek');
      add(kgRows.filter((r) => r.beer_id === beer.id && monthKey(r.entry_date) === curMonth && r.entry_date <= todayISO()), 'brewedWeek');
      add(oiRows.filter((i) => i.beer_id === beer.id && ordIdsThisMonth.has(i.order_id)), 'orderedWeek');
      add(oiRows.filter((i) => i.beer_id === beer.id && ordIdsThisWeek.has(i.order_id)), 'orderedThisWeek');
      add(woRows.filter((r) => r.beer_id === beer.id && monthKey(r.entry_date) === curMonth && r.entry_date <= todayISO()), 'writeoffsWeek');
      add(faRows.filter((r) => r.beer_id === beer.id && monthKey(r.entry_date) === curMonth && r.entry_date <= todayISO()), 'fasovaniWeek');
      add(fpRows.filter((r) => r.beer_id === beer.id && monthKey(r.entry_date) === curMonth && r.entry_date <= todayISO()), 'prodejnaWeek');
      const akFlat = akRows.flatMap((r) => (r.items ?? []).map((i) => ({ ...i, entry_date: r.entry_date })));
      add(akFlat.filter((i) => i.beer_id === beer.id && monthKey(i.entry_date) === curMonth && i.entry_date <= todayISO()).map((i) => ({ beer_id: i.beer_id, package_id: i.package_id, quantity: i.quantity_taken })), 'akTaken');
      add(akFlat.filter((i) => i.beer_id === beer.id && monthKey(i.entry_date) === curMonth && i.entry_date <= todayISO()).map((i) => ({ beer_id: i.beer_id, package_id: i.package_id, quantity: i.quantity_returned })), 'akReturned');

      const seenKegSource = new Set<string>();
      btRows.filter((r) => r.beer_id === beer.id && monthKey(r.entry_date) === curMonth && r.entry_date <= todayISO()).forEach((r) => {
        const res = getKegsUsed(r);
        if (res) {
          const key = `${r.entry_date}|${r.beer_id}|${res.kegsUsed}|${res.kegPkgId}|${r.created_at || r.note || ''}`;
          if (seenKegSource.has(key)) return;
          seenKegSource.add(key);
          const pkgId = res.kegPkgId;
          const pkg = pkgList.find((p) => p.id === pkgId);
          if (!pkg) return;
          let e = byPkg.get(pkgId);
          if (!e) {
            e = { package_id: pkgId, label: pkg.label, quantity: 0, volume_l: pkg.volume_l, kind: pkg.kind, fromInventory: 0, brewedWeek: 0, orderedWeek: 0, orderedThisWeek: 0, writeoffsWeek: 0, fasovaniWeek: 0, prodejnaWeek: 0, akTaken: 0, akReturned: 0, kegsUsedWeek: 0, odpocet: 0, remaining: 0, rawQuantity: 0, orderedRemaining: 0, adjWeek: 0 };
            byPkg.set(pkgId, e);
          }
          e.kegsUsedWeek += res.kegsUsed;
        }
      });

      const stockByPkg = [...byPkg.values()].map((p) => {
        const akceNet = Math.max(0, p.akTaken - p.akReturned);
        // Auto-odpočet závozu (zavoz_deductions) za aktuální měsíc
        const zdWeek = zdRows
          .filter((r) => r.beer_id === beer.id && r.package_id === p.package_id && monthKey(r.deduct_date) === curMonth && r.deduct_date <= todayISO())
          .reduce((s, r) => s + Number(r.quantity), 0);
        // Totéž, ale jen odpočty z TOHOTO týdne — pro "Zbyde" (viz níže).
        const zdThisWeek = zdRows
          .filter((r) => r.beer_id === beer.id && r.package_id === p.package_id && isThisWeek(r.deduct_date))
          .reduce((s, r) => s + Number(r.quantity), 0);
        p.zavezenoWeek = zdWeek;
        p.odpocet = p.writeoffsWeek + p.fasovaniWeek + p.prodejnaWeek + akceNet + (p.kegsUsedWeek || 0) + zdWeek;
        p.adjWeek = adjRows
          .filter((r) => r.beer_id === beer.id && r.package_id === p.package_id && monthKey(r.entry_date) === curMonth && r.entry_date <= todayISO())
          .reduce((s, r) => s + Number(r.quantity || 0), 0);
        // 📒 Stav bere ze skladové knihy (lib/stockLedger.ts) — stejné číslo
        // jako Sklad, Inventura i „co stočit". Rozpad výše (fromInventory,
        // brewedWeek, odpocet…) zůstává jen pro zobrazení, na výsledek nemá
        // vliv. Dřív si každá obrazovka počítala vlastní součet a kopie se
        // rozcházely; navíc se tady ořezávalo na nulu, takže schodek nebyl
        // vidět — viz komentář v stockLedger.ts.
        const line = ledger.get(stockKey(beer.id, p.package_id));
        p.rawQuantity = line?.qty ?? 0;
        p.quantity = Math.max(0, p.rawQuantity);
        // "Zbývá zavézt" a "Zbyde" se počítají jen proti objednávkám DO KONCE
        // TOHOTO TÝDNE, ne za celý měsíc — objednávka splatná až za týden a
        // víc by jinak "Zbyde" ukazovala jako 0, i když fyzicky ještě nic
        // neodešlo. Odečtené závozy z tohoto týdne jsou už v p.quantity, tak
        // je z orderedThisWeek odeber, ať se nepočítají dvakrát.
        const orderedEffective = Math.max(0, p.orderedThisWeek - zdThisWeek);
        p.orderedRemaining = orderedEffective;
        p.remaining = p.quantity - orderedEffective;
        return p;
      }).filter((p) => p.fromInventory > 0 || p.orderedWeek > 0 || p.brewedWeek > 0 || p.fasovaniWeek > 0 || p.prodejnaWeek > 0 || p.odpocet > 0).sort((a, b) => b.quantity - a.quantity);

      const stockBottles = stockByPkg.filter((p) => p.kind === 'bottle').reduce((s, p) => s + p.quantity, 0);
      const stockKegs = stockByPkg.filter((p) => p.kind === 'keg').reduce((s, p) => s + p.quantity, 0);
      const stockTotal = stockBottles + stockKegs;
      const stockLiters = stockByPkg.reduce((s, p) => s + p.quantity * p.volume_l, 0);
      const brewedWeek = [...btRows, ...kgRows].filter((r) => r.beer_id === beer.id && monthKey(r.entry_date) === curMonth && r.entry_date <= todayISO()).reduce((s, r) => s + Number(r.quantity), 0);
      const orderedWeek = oiRows.filter((i) => i.beer_id === beer.id && ordIdsThisMonth.has(i.order_id)).reduce((s, i) => s + Number(i.quantity), 0);
      const writeoffsWeek = woRows.filter((r) => r.beer_id === beer.id && monthKey(r.entry_date) === curMonth && r.entry_date <= todayISO()).reduce((s, r) => s + Number(r.quantity), 0);
      const remaining = stockByPkg.reduce((s, p) => s + p.remaining, 0);
      return { beer, stockByPkg, stockBottles, stockKegs, stockTotal, stockLiters, brewedWeek, orderedWeek, writeoffsWeek, remaining };
    });
    setStats(result);

    const nesediList: NesediRow[] = [];
    ledger.forEach((line) => {
      if (line.qty >= 0) return;
      const beer = beerList.find((x) => x.id === line.beer_id);
      const pkg = pkgList.find((x) => x.id === line.package_id);
      if (!beer || !pkg) return;
      nesediList.push({ key: line.key, beerName: beer.name, pkgLabel: String(pkg.label).trim(), qty: line.qty, baselineDate: line.baselineDate, baselineQty: line.baselineQty });
    });
    nesediList.sort((a, z) => a.qty - z.qty);
    setNesedi(nesediList);
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

  useEffect(() => { load(); }, [brewFrom, brewTo]);
  useRealtime(['bottling', 'kegging', 'fasovani', 'fasovani_private', 'writeoffs', 'inventory', 'orders', 'order_items', 'akce', 'akce_items', 'zavoz_deductions', 'inventory_adjustments', 'keg_prefuk'], () => load(true));

  const statusOf = (s: StockStat) => s.remaining < 0 ? 'deficit' : s.stockTotal === 0 ? 'empty' : s.remaining <= 10 ? 'low' : 'ok';

  const [showAnnouncementManager, setShowAnnouncementManager] = useState(false);

  const [materialAlerts, setMaterialAlerts] = useState<{ name: string; type: 'etiketa' | 'lahev' | 'zavirka'; balance: number }[]>([]);
  useEffect(() => {
    Promise.all([
      fetchLabelBalances(),
      supabase.from('packages').select('id,label,kind,volume_l'),
      fetchAllRows('bottling', 'beer_name,package_label,quantity,entry_date,package_id'),
      // Nákupy obalů a závěrek jsou v databázi — v localStorage tohohle
      // telefonu vídal každý jiný stav.
      supabase.from('obal_nakupy').select('package_label,quantity'),
    ]).then(([labelBalances, pRes, botRes, onRes]) => {
      const pkgs = (pRes.data as any[]) ?? [];
      const bot = (botRes.data as any[]) ?? [];
      const bottlePurchases = ((onRes.data as any[]) ?? []);

      const alerts: { name: string; type: 'etiketa' | 'lahev' | 'zavirka'; balance: number }[] = [];

      labelBalances.filter((l) => l.isLow).forEach((l) => {
        alerts.push({ name: `Etikety "${l.beer_name}"`, type: 'etiketa', balance: l.balance });
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

      // 🧴 Závěrky (korunky, PET víčka) — dochází stejně jako lahve, jen se
      // jejich spotřeba doteď nikde neodečítala. Hranice je obvyklé jedno
      // stáčení, ne pevné číslo.
      const objemPodleId = new Map(pkgs.map((p) => [p.id, Number(p.volume_l)]));
      zustatkyZavirek(
        bottlePurchases.map((bp) => ({ package_label: bp.package_label, quantity: bp.quantity })),
        bot.map((bd) => ({
          entry_date: bd.entry_date ?? null,
          package_label: bd.package_label ?? null,
          volume_l: bd.package_id ? objemPodleId.get(bd.package_id) ?? null : null,
          quantity: bd.quantity,
        })),
      ).filter((z) => z.malo).forEach((z) => {
        alerts.push({ name: z.nazev, type: 'zavirka', balance: z.zustatek });
      });

      setMaterialAlerts(alerts);
    });
  }, [brewStats]);

  if (loading && activeTab === 'sklad') return <Spinner />;

  return (
    <div>
      {/* Tab Navigation — přilepená nahoře, ať jde přepínat záložku i uprostřed scrollování.
          Stejný jazyk jako Objednávky: neoznačená záložka černá s bílým textem,
          označená se obrací na bílou s tmavým textem. */}
      <div className="sticky top-0 z-20 bg-neutral-100 pt-1 flex items-center gap-2 pb-2 overflow-x-auto scrollbar-thin mb-4">
        <button
          onClick={() => (setPage ? setPage('dashboard') : setActiveTab('sklad'))}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'sklad'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <BarChart3 size={16} />
          <span>Sklad</span>
        </button>

        <button
          onClick={() => (setPage ? setPage('sklo_promo') : setActiveTab('sklo_promo'))}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'sklo_promo'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Sparkles size={16} />
          <span>Sklo, Etikety, Podtáčky</span>
        </button>
      </div>

      {activeTab === 'sklad' ? (
        <>
          {showAnnouncementManager && <AnnouncementManagerModal onClose={() => setShowAnnouncementManager(false)} />}

      <div className="flex justify-end mb-3 items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowQuickCount(true)}
          className="btn-primary !rounded !py-2 !px-3.5 text-xs font-black shadow-sm"
        >
          <Calculator size={15} /> Rychlé sčítadlo skladu
        </button>
        <button
          onClick={() => setShowAnnouncementManager(true)}
          className="btn !rounded bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 !py-2 !px-3.5 text-xs font-black shadow-sm"
        >
          <AlertTriangle size={15} /> Spravovat Hlášení
        </button>
      </div>

      {showQuickCount && (
        <QuickCountModal
          isOpen={showQuickCount}
          onClose={() => setShowQuickCount(false)}
          beers={beers}
          packages={packages}
          onConfirmCount={handleConfirmQuickCount}
        />
      )}
      {/* Material (Labels & Bottles) Warning Banner */}
      {materialAlerts.length > 0 && (
        <div className="mb-6 p-4 rounded bg-gradient-to-r from-rose-500/20 via-rose-400/10 to-amber-500/10 border-2 border-rose-400 shadow-md flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded bg-rose-600 text-white flex items-center justify-center text-2xl font-black shadow-md shrink-0 animate-pulse">
              <AlertTriangle className="ikona-text" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-neutral-900 flex items-center gap-2">
                <span>VAROVÁNÍ SKLADU: DOCHÁZÍ ETIKETY, PRÁZDNÉ LAHVE NEBO ZÁVĚRKY</span>
                <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-black text-xs">{materialAlerts.length} Varování</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-1.5">
                {materialAlerts.map((a, i) => (
                  <span key={i} className="text-xs font-bold px-3 py-1 rounded shadow-xs bg-rose-600 text-white font-mono">
                    <strong>{a.name}</strong> — zbývá jen {a.balance} ks!
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => (setPage ? setPage('sklo_promo') : setActiveTab('sklo_promo'))}
            className="px-4 py-2.5 rounded bg-white text-amber-900 border border-amber-300 hover:bg-amber-50 font-extrabold text-xs shadow-md transition shrink-0"
          >
            Přejít do evidence etiket & lahví <ArrowRight className="ikona-text" />
          </button>
        </div>
      )}

      {/* Upozornění na STK/dálniční známku se přesunulo na domovskou obrazovku (HomeScreen.tsx). */}


      {/* ⚠️ Položky, u kterých evidence nesedí — ze skladu odešlo víc, než
          kolik aplikace zná. Dřív se každý takový schodek ořezal na nulu
          a nebyl vidět nikde. Viz lib/stockLedger.ts. */}
      {nesedi.length > 0 && (
        <div className="mb-5 rounded border-2 border-rose-300 bg-rose-50 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowNesedi((v) => !v)}
            className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-rose-100/60 transition"
          >
            <div className="flex items-center gap-3 min-w-0">
              <AlertTriangle size={20} className="text-rose-600 shrink-0" />
              <div className="min-w-0">
                <div className="font-display font-black text-rose-900 text-sm">
                  U {nesedi.length} položek nesedí evidence
                </div>
                <div className="text-xs text-rose-700 mt-0.5 font-bold">
                  Odešlo víc, než aplikace ví, že se stočilo nebo napočítalo v inventuře. Sklad u nich ukazuje 0.
                </div>
              </div>
            </div>
            <span className="text-rose-600 shrink-0 font-black text-lg">{showNesedi ? '−' : '+'}</span>
          </button>
          {showNesedi && (
            <div className="border-t border-rose-200 bg-white/70">
              <div className="divide-y divide-rose-100 max-h-72 overflow-y-auto">
                {nesedi.map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                    <span className="font-black text-neutral-800 min-w-0 truncate">
                      {r.beerName} <span className="text-neutral-500">{r.pkgLabel}</span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="hidden sm:inline text-[11px] font-bold text-neutral-500">
                        {r.baselineDate ? `inventura ${r.baselineDate} = ${r.baselineQty}` : 'nikdy nebyla inventura'}
                      </span>
                      <span className="text-rose-700 font-black text-sm font-mono tabular-nums">{r.qty} ks</span>
                    </span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 text-[11px] font-bold text-neutral-600 bg-rose-50/60 border-t border-rose-100">
                Nejčastější příčina: položka se v inventuře nenapočítala (chybí v seznamu), nebo se nezapsalo stáčení.
                Srovná to fyzická inventura — nastaví stav napevno a dál se počítá od ní.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bez bílé "karty" kolem — nadpis sedí přímo na pozadí stránky. */}
      <div className="text-center mb-6">
        <div className="font-display font-black text-neutral-900 text-xl sm:text-2xl">
          Aktuální skladové zásoby
        </div>
        <div className="text-sm sm:text-base font-extrabold text-amber-700 mt-1">Stav k {todayISO()}</div>
      </div>

      {/* Legend explaining the stock icons */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-semibold text-neutral-500 mb-4 px-1">
        <span className="flex items-center gap-1.5"><PackageCheck size={13} className="text-neutral-900" /> Stav = aktuální sklad</span>
        <span className="flex items-center gap-1.5"><AlertTriangle size={13} className="text-neutral-900" /> Odejde = objednáno tento měsíc</span>
        <span className="flex items-center gap-1.5"><Layers size={13} className="text-neutral-900" /> Zbude = zůstane po odebrání</span>
      </div>

      {/* Beer cards with package breakdown */}
      {stats.length === 0 ? <EmptyState text="Žádná piva v evidenci." icon={BeerIcon} /> : (
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
                className="card-hover !rounded p-5 flex flex-col relative overflow-hidden group border-2"
                style={{ borderColor: beerBorder(s.beer) }}
              >
                <div className="flex items-start justify-between mb-3.5">
                  <div>
                    <div className="font-display font-extrabold text-lg sm:text-xl text-neutral-900">{s.beer.name}</div>
                  </div>
                  <span className={`chip ${badgeClass}`}>
                    {st === 'deficit' ? 'Deficit' : st === 'empty' ? 'Vyprodáno' : st === 'low' ? 'Nízký stav' : <><Check className="ikona-text" /> Skladem</>}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  {kegs.length > 0 && (
                    <div className="bg-white/70 backdrop-blur-xs rounded-xl p-3 border border-neutral-200/50">
                      <div className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1.5 flex items-center gap-1"><IkonaSud className="ikona-text" /> Sudy</div>
                      <table className="w-full text-sm font-semibold border-collapse">
                        <thead>
                          {/* Slova, ne jen ikony: legenda nad kartami se na
                              telefonu odroluje a tooltip na dotyku neexistuje,
                              takže ze sloupců zůstaly tři obrázky. */}
                          <tr className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                            <th className="text-left pb-1 pr-2">Obal</th>
                            <th className="text-center pb-1 px-2">Stav</th>
                            <th className="text-center pb-1 px-2">Odejde</th>
                            <th className="text-center pb-1 pl-2">Zbude</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kegs.map((p) => (
                            <tr key={p.package_id}>
                              <td className="py-1 pr-2 whitespace-nowrap text-neutral-500 text-xs font-bold">{p.label}</td>
                              <td className="py-1 px-2 text-center font-extrabold text-sky-900 bg-sky-100 rounded-md">{p.quantity}{p.rawQuantity < 0 && <span className="block text-[11px] font-black text-rose-600" title="Vydáno víc, než evidence zná — schodek">chybí {Math.abs(p.rawQuantity)}</span>}</td>
                              <td className={`py-1 px-2 text-center font-extrabold rounded-md ${p.orderedRemaining > 0 ? 'bg-rose-50 text-rose-700' : 'bg-neutral-50 text-neutral-600'}`}>{p.orderedRemaining > 0 ? `-${p.orderedRemaining}` : '0'}</td>
                              <td className={`py-1 pl-2 text-center font-extrabold rounded-md ${p.remaining < 0 ? 'bg-rose-50 text-rose-700' : p.remaining === 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{p.remaining}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {bottles.length > 0 && (
                    <div className="bg-white/70 backdrop-blur-xs rounded-xl p-3 border border-neutral-200/50">
                      <div className="text-xs font-bold uppercase tracking-wider text-primary-700 mb-1.5 flex items-center gap-1"><IkonaLahev className="ikona-text" /> Lahve</div>
                      <table className="w-full text-sm font-semibold border-collapse">
                        <thead>
                          {/* Slova, ne jen ikony: legenda nad kartami se na
                              telefonu odroluje a tooltip na dotyku neexistuje,
                              takže ze sloupců zůstaly tři obrázky. */}
                          <tr className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                            <th className="text-left pb-1 pr-2">Obal</th>
                            <th className="text-center pb-1 px-2">Stav</th>
                            <th className="text-center pb-1 px-2">Odejde</th>
                            <th className="text-center pb-1 pl-2">Zbude</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bottles.map((p) => (
                            <tr key={p.package_id}>
                              <td className="py-1 pr-2 whitespace-nowrap text-neutral-500 text-xs font-bold">{p.label}</td>
                              <td className="py-1 px-2 text-center font-extrabold text-sky-900 bg-sky-100 rounded-md">{p.quantity}{p.rawQuantity < 0 && <span className="block text-[11px] font-black text-rose-600" title="Vydáno víc, než evidence zná — schodek">chybí {Math.abs(p.rawQuantity)}</span>}</td>
                              <td className={`py-1 px-2 text-center font-extrabold rounded-md ${p.orderedRemaining > 0 ? 'bg-rose-50 text-rose-700' : 'bg-neutral-50 text-neutral-600'}`}>{p.orderedRemaining > 0 ? `-${p.orderedRemaining}` : '0'}</td>
                              <td className={`py-1 pl-2 text-center font-extrabold rounded-md ${p.remaining < 0 ? 'bg-rose-50 text-rose-700' : p.remaining === 0 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{p.remaining}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {s.stockByPkg.length === 0 && <p className="text-xs text-neutral-400 py-3 italic">Žádné volné obaly na skladě.</p>}

                <button className="w-full text-sm text-neutral-950 font-extrabold mt-2 py-1.5 rounded bg-amber-500 hover:bg-amber-400 flex items-center justify-center gap-1.5 transition" onClick={() => setDetail(s)}>
                  <ClipboardList size={16} /> Detailní přehled
                </button>
              </div>
            );
          })}
        </div>
      )}

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`${detail.beer.name} — detail skladu po obalech`} wide>
          <div className="space-y-4">
            {/* Mobilní karty — čitelné bez vodorovného scrollování */}
            <div className="grid grid-cols-1 gap-2.5 md:hidden">
              {detail.stockByPkg.map((p) => {
                const akceNet = Math.max(0, p.akTaken - p.akReturned);
                return (
                  <div key={p.package_id} className="rounded-2xl border border-neutral-200 bg-white p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-sm text-neutral-900">{p.label}</span>
                      <span className={`px-2.5 py-1 rounded-xl font-black text-xs whitespace-nowrap ${p.remaining < 0 ? 'bg-rose-100 text-rose-700' : p.remaining === 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        Zbyde {p.remaining} ks
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-center">
                      <div className="rounded-lg bg-sky-100 py-1.5 border border-sky-300">
                        <div className="text-[11px] font-black uppercase text-sky-700">Sklad (AKT)</div>
                        <div className="text-sm font-black text-sky-900">{p.quantity}</div>
                      </div>
                      <div className="rounded-lg bg-rose-50 py-1.5">
                        <div className="text-[11px] font-black uppercase text-rose-600">Objednáno celkem</div>
                        <div className="text-sm font-black text-rose-700">{p.orderedWeek || 0}</div>
                      </div>
                      <div className="rounded-lg bg-rose-100 py-1.5">
                        <div className="text-[11px] font-black uppercase text-rose-700">Zbývá zavézt</div>
                        <div className="text-sm font-black text-rose-800">{p.orderedRemaining || 0}</div>
                      </div>
                      <div className="rounded-lg bg-amber-50 py-1.5">
                        <div className="text-[11px] font-black uppercase text-amber-700">Odpočet celkem</div>
                        <div className="text-sm font-black text-amber-800">{p.odpocet || 0}</div>
                      </div>
                    </div>
                    <div className="text-[11px] text-neutral-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>Poč. {p.fromInventory || 0}</span>
                      <span>Stoč. +{p.brewedWeek || 0}</span>
                      <span>Stáč. lahví −{p.kegsUsedWeek || 0}</span>
                      <span>Fasování −{p.fasovaniWeek || 0}</span>
                      <span>Prodejna −{p.prodejnaWeek || 0}</span>
                      <span>Akce −{akceNet}</span>
                      <span>Odpis −{p.writeoffsWeek || 0}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto scrollbar-thin">
              <table className="table text-[11px] w-full border-collapse">
                <thead>
                  <tr className="bg-neutral-100 border-b border-neutral-200">
                    <th className="p-2 text-left">Obal</th>
                    <th className="p-2 text-right text-sky-800" title="Počáteční stav k 1. dni v měsíci">Poč.</th>
                    <th className="p-2 text-right text-emerald-700" title="Stáčení (příjem)">Stoč.</th>
                    <th className="p-2 text-right text-sky-900 font-black" title="Aktuální fyzický stav na skladě (Poč. + Stoč. − vše, co už fyzicky odešlo)">AKT</th>
                    <th className="p-2 text-right text-rose-700 font-bold" title="Objednávky celkem tento měsíc">OBJ</th>
                    <th className="p-2 text-right text-rose-800 font-bold" title="Objednáno − co už fyzicky odjelo (zavoz) = ještě čeká na odvoz">ZBÝVÁ ZAVÉZT</th>
                    <th className="p-2 text-right text-rose-700 font-bold" title="Už fyzicky odvezeno k odběrateli (automatický odpočet závozu). Bývá to největší část sloupce „Odp. celkem“.">Zavezeno</th>
                    <th className="p-2 text-right text-violet-700 font-bold" title="Sudy spotřebované na plnění lahví">Stáč. lahví</th>
                    <th className="p-2 text-right text-rose-600" title="Fasování zaměstnanců / privátní">Fasování</th>
                    <th className="p-2 text-right text-rose-600" title="Prodejna (výdej prodejny)">Prodejna</th>
                    <th className="p-2 text-right text-rose-600" title="Čisté vyfasování na akce (odvezeno - vráceno)">Akce</th>
                    <th className="p-2 text-right text-rose-600" title="Odpisy (vylití/zkažené)">Odpis</th>
                    <th className="p-2 text-right text-amber-800 font-bold" title="Součet všech odpočtů mimo objednávky">Odp. celkem</th>
                    <th className="p-2 text-right bg-amber-50 text-amber-950 font-black">ZBYDE</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.stockByPkg.map((p) => {
                    const akceNet = Math.max(0, p.akTaken - p.akReturned);
                    return (
                      <tr key={p.package_id} className="border-b border-neutral-100 hover:bg-neutral-50/80">
                        <td className="p-2 font-bold text-neutral-900 whitespace-nowrap">{p.label}</td>
                        <td className="p-2 text-right font-semibold text-neutral-700">{p.fromInventory || '—'}</td>
                        <td className="p-2 text-right font-black text-emerald-600">{p.brewedWeek ? `+${p.brewedWeek}` : '—'}</td>
                        <td className="p-2 text-right font-black text-sky-900 bg-sky-100">{p.quantity}</td>
                        <td className="p-2 text-right font-bold text-rose-700">{p.orderedWeek ? `-${p.orderedWeek}` : '—'}</td>
                        <td className="p-2 text-right font-bold text-rose-800 bg-rose-50/50">{p.orderedRemaining ? `-${p.orderedRemaining}` : '—'}</td>
                        <td className="p-2 text-right font-bold text-rose-700">{p.zavezenoWeek ? `-${p.zavezenoWeek}` : '—'}</td>
                        <td className="p-2 text-right font-bold text-violet-700">{p.kegsUsedWeek ? `-${p.kegsUsedWeek}` : '—'}</td>
                        <td className="p-2 text-right font-medium text-neutral-600">{p.fasovaniWeek ? `-${p.fasovaniWeek}` : '—'}</td>
                        <td className="p-2 text-right font-medium text-neutral-600">{p.prodejnaWeek ? `-${p.prodejnaWeek}` : '—'}</td>
                        <td className="p-2 text-right font-medium text-neutral-600">{akceNet ? `-${akceNet}` : '—'}</td>
                        <td className="p-2 text-right font-medium text-neutral-600">{p.writeoffsWeek ? `-${p.writeoffsWeek}` : '—'}</td>
                        <td className="p-2 text-right font-bold text-amber-700">{p.odpocet ? `-${p.odpocet}` : '—'}</td>
                        <td className={`p-2 text-right font-mono font-black bg-amber-50/80 ${p.remaining < 0 ? 'text-rose-600 font-extrabold' : p.remaining === 0 ? 'text-amber-600' : 'text-emerald-700'}`}>
                          {p.remaining} ks
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 text-[11px] text-neutral-600 space-y-1">
              <p className="font-bold text-neutral-800"><Pin className="ikona-text" /> Vysvětlivky výpočtu:</p>
              <p>• <strong>AKT (Sklad)</strong> = Poč. + Stoč. − Odp. celkem (+ dorovnání z inventury)</p>
              <p>• <strong>Odp. celkem</strong> = Zavezeno + Stáč. lahví + Fasování + Prodejna + Akce + Odpisy</p>
              <p>• <strong>ZBYDE</strong> = AKT − objednávky tohoto týdne, které ještě NEodjely. Objednávky, co už odjely, se neodečítají znovu — jsou započítané v „Zavezeno“, tedy už v AKT.</p>
              <p className="text-neutral-500">Proto se <strong>OBJ</strong> (objednávky za celý měsíc) nerovná tomu, co se odečítá: OBJ je informace „kolik se toho tento měsíc má odvézt“, kdežto do AKT vstupuje jen skutečně odvezené.</p>
              </div>
          </div>
        </Modal>
      )}

          <p className="text-xs text-primary-400 mt-4">
            Sklad = počáteční stav k 1. dni v měsíci + stočeno do dnešního dne. Zbude = sklad − objednávky (mimo storno) − odpočet (odpisy, akce, sudy na stáčení lahví, obchod) do dnešního dne.
          </p>
        </>
      ) : (
        <SkloPromoScreen setPage={setPage} />
      )}
    </div>
  );
}
