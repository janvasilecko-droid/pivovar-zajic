import { useEffect, useState } from 'react';
import { supabase, Beer, Package, Vehicle, useRealtime, beerBg, beerText, beerBorder, beerName } from '../lib/supabase';
import { Spinner, EmptyState, Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { getVehicleExpiryStatus } from './Catalogs';
import { AlertTriangle, ClipboardList, PackageCheck, Layers, Beer as BeerIcon, BarChart3, Sparkles, Calculator } from 'lucide-react';
import { AnnouncementManagerModal } from '../components/AnnouncementManagerModal';
import SkloPromoScreen from './SkloPromoScreen';
import { getStartingStockMap } from '../lib/inventoryHelper';
import { QuickCountModal } from '../components/QuickCountModal';
import { fetchLabelBalances } from '../lib/labelStock';
import { AppLauncher } from '../components/AppLauncher';

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
      alert(`Chyba při ukládání inventury: ${error.message}`);
    } else {
      alert(`✅ Inventura (${items.length} položek) úspěšně uložena!`);
      load();
    }
  }

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const [{ data: b }, { data: pk }, { data: bt }, { data: kg }, { data: wo }, { data: inv }, { data: oi }, { data: ord }, { data: ak }, { data: fa }, { data: fp }, { data: zd }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('bottling').select('entry_date,beer_id,package_id,quantity,kegs_used,kegs_used_package_id,source_volume_l,note,created_at'),
      supabase.from('kegging').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('writeoffs').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('inventory').select('entry_date,beer_id,beer_name,package_id,package_label,quantity,note'),
      supabase.from('order_items').select('beer_id,package_id,quantity,order_id'),
      supabase.from('orders').select('id,order_date,delivery_date,status'),
      supabase.from('akce').select('entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
      supabase.from('fasovani').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('fasovani_private').select('entry_date,beer_id,package_id,quantity'),
      supabase.from('zavoz_deductions').select('deduct_date,beer_id,package_id,quantity'),
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

    const invMap = getStartingStockMap(
      lastInvMonth,
      invRows,
      btRows,
      kgRows,
      faRows,
      fpRows,
      woRows
    );

    const result: StockStat[] = beerList.map((beer) => {
      const byPkg = new Map<string, StockByPkg>();
      const add = (rs: { beer_id: string | null; package_id: string | null; quantity: number }[], field: 'fromInventory' | 'brewedWeek' | 'orderedWeek' | 'writeoffsWeek' | 'fasovaniWeek' | 'prodejnaWeek' | 'akTaken' | 'akReturned') =>
        rs.forEach((r) => {
          if (r.beer_id !== beer.id || !r.package_id) return;
          const pkg = pkgList.find((p) => p.id === r.package_id);
          if (!pkg) return;
          let e = byPkg.get(r.package_id);
          if (!e) { e = { package_id: r.package_id, label: pkg.label, quantity: 0, volume_l: pkg.volume_l, kind: pkg.kind, fromInventory: 0, brewedWeek: 0, orderedWeek: 0, writeoffsWeek: 0, fasovaniWeek: 0, prodejnaWeek: 0, akTaken: 0, akReturned: 0, kegsUsedWeek: 0, odpocet: 0, remaining: 0 }; byPkg.set(r.package_id, e); }
          (e[field] as number) += Number(r.quantity);
        });
      
      pkgList.forEach((pkg) => {
        const k = `${beer.id}__${pkg.id}`;
        const qty = invMap[k] || 0;
        if (qty > 0) {
          let e = byPkg.get(pkg.id);
          if (!e) { e = { package_id: pkg.id, label: pkg.label, quantity: 0, volume_l: pkg.volume_l, kind: pkg.kind, fromInventory: 0, brewedWeek: 0, orderedWeek: 0, writeoffsWeek: 0, fasovaniWeek: 0, prodejnaWeek: 0, akTaken: 0, akReturned: 0, kegsUsedWeek: 0, odpocet: 0, remaining: 0 }; byPkg.set(pkg.id, e); }
          e.fromInventory = qty;
        }
      });

      add(btRows.filter((r) => r.beer_id === beer.id && monthKey(r.entry_date) === curMonth && r.entry_date <= todayISO()), 'brewedWeek');
      add(kgRows.filter((r) => r.beer_id === beer.id && monthKey(r.entry_date) === curMonth && r.entry_date <= todayISO()), 'brewedWeek');
      add(oiRows.filter((i) => i.beer_id === beer.id && ordIdsThisMonth.has(i.order_id)), 'orderedWeek');
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
            e = { package_id: pkgId, label: pkg.label, quantity: 0, volume_l: pkg.volume_l, kind: pkg.kind, fromInventory: 0, brewedWeek: 0, orderedWeek: 0, writeoffsWeek: 0, fasovaniWeek: 0, prodejnaWeek: 0, akTaken: 0, akReturned: 0, kegsUsedWeek: 0, odpocet: 0, remaining: 0 };
            byPkg.set(pkgId, e);
          }
          e.kegsUsedWeek += res.kegsUsed;
        }
      });

      const stockByPkg = [...byPkg.values()].map((p) => {
        p.quantity = p.fromInventory + p.brewedWeek;
        const akceNet = Math.max(0, p.akTaken - p.akReturned);
        // Auto-odpočet závozu (zavoz_deductions) za aktuální měsíc
        const zdWeek = zdRows
          .filter((r) => r.beer_id === beer.id && r.package_id === p.package_id && monthKey(r.deduct_date) === curMonth && r.deduct_date <= todayISO())
          .reduce((s, r) => s + Number(r.quantity), 0);
        p.odpocet = p.writeoffsWeek + p.fasovaniWeek + p.prodejnaWeek + akceNet + (p.kegsUsedWeek || 0) + zdWeek;
        // Odečtené závozy jsou již v odpocet — z orderedWeek odeber aby nedošlo k dvojímu odečtu
        const orderedEffective = Math.max(0, p.orderedWeek - zdWeek);
        p.remaining = p.quantity - orderedEffective - p.odpocet;
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
  useRealtime(['bottling', 'kegging', 'fasovani', 'fasovani_private', 'writeoffs', 'inventory', 'orders', 'order_items', 'akce', 'akce_items', 'zavoz_deductions'], () => load(true));

  const statusOf = (s: StockStat) => s.remaining < 0 ? 'deficit' : s.stockTotal === 0 ? 'empty' : s.remaining <= 10 ? 'low' : 'ok';

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
      fetchLabelBalances(),
      supabase.from('packages').select('label,kind'),
      supabase.from('bottling').select('beer_name,package_label,quantity'),
    ]).then(([labelBalances, pRes, botRes]) => {
      const pkgs = (pRes.data as any[]) ?? [];
      const bot = (botRes.data as any[]) ?? [];

      let bottlePurchases: any[] = [];
      try {
        bottlePurchases = JSON.parse(localStorage.getItem('bottles_purchases') || '[]');
      } catch {}

      const alerts: { name: string; type: 'etiketa' | 'lahev'; balance: number }[] = [];

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

      setMaterialAlerts(alerts);
    });
  }, [brewStats]);

  if (loading && activeTab === 'sklad') return <Spinner />;

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin mb-4">
        <button
          onClick={() => setActiveTab('sklad')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'sklad'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <BarChart3 size={16} />
          <span>Sklad</span>
        </button>

        <button
          onClick={() => setActiveTab('sklo_promo')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'sklo_promo'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Sparkles size={16} />
          <span>Sklo, Etikety, Podtáčky</span>
        </button>
      </div>

      {setPage && <AppLauncher setPage={setPage} />}

      {activeTab === 'sklad' ? (
        <>
          {showAnnouncementManager && <AnnouncementManagerModal onClose={() => setShowAnnouncementManager(false)} />}

      <div className="flex justify-end mb-3 items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowQuickCount(true)}
          className="btn-primary !py-2 !px-3.5 text-xs font-black shadow-sm transition flex items-center gap-1.5"
        >
          <Calculator size={15} /> 📦 Rychlé sčítadlo skladu
        </button>
        <button
          onClick={() => setShowAnnouncementManager(true)}
          className="px-3.5 py-2 rounded-2xl bg-neutral-900 hover:bg-neutral-800 text-amber-300 font-black text-xs shadow-sm transition flex items-center gap-1.5"
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
            onClick={() => setActiveTab('sklo_promo')}
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
        {/* Big current date label */}
        <div className="text-center">
          <div className="font-display font-black text-neutral-900 text-xl sm:text-2xl">
            Aktuální skladové zásoby
          </div>
          <div className="text-sm sm:text-base font-extrabold text-amber-700 mt-1">Stav k {todayISO()}</div>
        </div>
      </div>

      {/* Legend explaining the stock icons */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-semibold text-neutral-500 mb-4 px-1">
        <span className="flex items-center gap-1.5"><PackageCheck size={13} className="text-neutral-900" /> Stav = aktuální sklad</span>
        <span className="flex items-center gap-1.5"><AlertTriangle size={13} className="text-neutral-900" /> Odejde = objednáno tento měsíc</span>
        <span className="flex items-center gap-1.5"><Layers size={13} className="text-neutral-900" /> Zbude = zůstane po odebrání</span>
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
                  </div>
                  <span className={`chip ${badgeClass}`}>
                    {st === 'deficit' ? '⚠️ Deficit' : st === 'empty' ? 'Vyprodáno' : st === 'low' ? 'Nízký stav' : '✓ Skladem'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                  {kegs.length > 0 && (
                    <div className="bg-white/70 backdrop-blur-xs rounded-xl p-3 border border-neutral-200/50">
                      <div className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1.5 flex items-center gap-1">🛢️ Sudy</div>
                      <table className="w-full text-sm font-semibold border-collapse">
                        <thead>
                          <tr className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                            <th className="text-left pb-1 pr-2" title="Obal"><BeerIcon size={13} className="text-neutral-900" /></th>
                            <th className="text-center pb-1 px-2" title="Stav"><PackageCheck size={13} className="text-neutral-900 mx-auto" /></th>
                            <th className="text-center pb-1 px-2" title="Odejde"><AlertTriangle size={13} className="text-neutral-900 mx-auto" /></th>
                            <th className="text-center pb-1 pl-2" title="Zbude"><Layers size={13} className="text-neutral-900 mx-auto" /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {kegs.map((p) => (
                            <tr key={p.package_id}>
                              <td className="py-1 pr-2 whitespace-nowrap text-neutral-500 text-xs font-bold">{p.label}</td>
                              <td className="py-1 px-2 text-center font-extrabold text-neutral-900 bg-neutral-100 rounded-md">{p.quantity}</td>
                              <td className={`py-1 px-2 text-center font-extrabold rounded-md ${p.orderedWeek > 0 ? 'bg-rose-50 text-rose-600' : 'bg-neutral-50 text-neutral-400'}`}>{p.orderedWeek > 0 ? `-${p.orderedWeek}` : '0'}</td>
                              <td className={`py-1 pl-2 text-center font-extrabold rounded-md ${p.remaining < 0 ? 'bg-rose-50 text-rose-600' : p.remaining === 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{p.remaining}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {bottles.length > 0 && (
                    <div className="bg-white/70 backdrop-blur-xs rounded-xl p-3 border border-neutral-200/50">
                      <div className="text-xs font-bold uppercase tracking-wider text-primary-700 mb-1.5 flex items-center gap-1">🍾 Lahve</div>
                      <table className="w-full text-sm font-semibold border-collapse">
                        <thead>
                          <tr className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">
                            <th className="text-left pb-1 pr-2" title="Obal"><BeerIcon size={13} className="text-neutral-900" /></th>
                            <th className="text-center pb-1 px-2" title="Stav"><PackageCheck size={13} className="text-neutral-900 mx-auto" /></th>
                            <th className="text-center pb-1 px-2" title="Odejde"><AlertTriangle size={13} className="text-neutral-900 mx-auto" /></th>
                            <th className="text-center pb-1 pl-2" title="Zbude"><Layers size={13} className="text-neutral-900 mx-auto" /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {bottles.map((p) => (
                            <tr key={p.package_id}>
                              <td className="py-1 pr-2 whitespace-nowrap text-neutral-500 text-xs font-bold">{p.label}</td>
                              <td className="py-1 px-2 text-center font-extrabold text-neutral-900 bg-neutral-100 rounded-md">{p.quantity}</td>
                              <td className={`py-1 px-2 text-center font-extrabold rounded-md ${p.orderedWeek > 0 ? 'bg-rose-50 text-rose-600' : 'bg-neutral-50 text-neutral-400'}`}>{p.orderedWeek > 0 ? `-${p.orderedWeek}` : '0'}</td>
                              <td className={`py-1 pl-2 text-center font-extrabold rounded-md ${p.remaining < 0 ? 'bg-rose-50 text-rose-600' : p.remaining === 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{p.remaining}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {s.stockByPkg.length === 0 && <p className="text-xs text-neutral-400 py-3 italic">Žádné volné obaly na skladě.</p>}

                <button className="w-full text-sm text-primary-700 hover:text-primary-900 font-extrabold mt-2 py-1.5 rounded-lg bg-primary-50 hover:bg-primary-100 flex items-center justify-center gap-1.5 transition" onClick={() => setDetail(s)}>
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
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                      <div className="rounded-lg bg-neutral-50 py-1.5">
                        <div className="text-[9px] font-black uppercase text-neutral-500">Sklad (AKT)</div>
                        <div className="text-sm font-black text-neutral-900">{p.quantity}</div>
                      </div>
                      <div className="rounded-lg bg-rose-50 py-1.5">
                        <div className="text-[9px] font-black uppercase text-rose-600">Objednáno</div>
                        <div className="text-sm font-black text-rose-700">{p.orderedWeek || 0}</div>
                      </div>
                      <div className="rounded-lg bg-amber-50 py-1.5">
                        <div className="text-[9px] font-black uppercase text-amber-700">Odpočet celkem</div>
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
              <table className="table text-[10px] w-full border-collapse">
                <thead>
                  <tr className="bg-neutral-100 border-b border-neutral-200">
                    <th className="p-2 text-left">Obal</th>
                    <th className="p-2 text-right text-sky-800" title="Počáteční stav k 1. dni v měsíci">Poč.</th>
                    <th className="p-2 text-right text-emerald-700" title="Stáčení (příjem)">Stoč.</th>
                    <th className="p-2 text-right text-emerald-950 font-black" title="Aktuální stav na skladě (Poč. + Stoč.)">AKT</th>
                    <th className="p-2 text-right text-rose-700 font-bold" title="Objednávky">OBJ</th>
                    <th className="p-2 text-right text-purple-700 font-bold" title="Sudy spotřebované na plnění lahví">Stáč. lahví</th>
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
                        <td className="p-2 text-right font-black text-neutral-950 bg-neutral-50">{p.quantity}</td>
                        <td className="p-2 text-right font-bold text-rose-700">{p.orderedWeek ? `-${p.orderedWeek}` : '—'}</td>
                        <td className="p-2 text-right font-bold text-purple-700">{p.kegsUsedWeek ? `-${p.kegsUsedWeek}` : '—'}</td>
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
              <p className="font-bold text-neutral-800">📌 Vysvětlivky výpočtu:</p>
              <p>• <strong>AKT (Sklad)</strong> = Počáteční stav na začátku měsíce (Poč.) + Stočeno v měsíci (Stoč.)</p>
              <p>• <strong>Odp. celkem</strong> = Sudy spotřebované na stáčení lahví + Fasování + Prodejna + Akce + Odpisy</p>
              <p>• <strong>ZBYDE</strong> = AKT (Sklad) − OBJ (Objednávky) − Odp. celkem</p>
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
