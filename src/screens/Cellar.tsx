import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';

import { supabase, Beer, CellarTank, CellarTransfer, CellarTankCycle, EntryRow, useRealtime, beerBg, beerBorder } from '../lib/supabase';
import { Modal, Field, EmptyState, Spinner } from '../components/ui';
import { TankOccupancyPlanner } from '../components/TankOccupancyPlanner';

const STATUS_LABELS: Record<CellarTank['status'], string> = {
  empty: 'Prázdný', filling: 'Plní se', active: 'Aktivní', emptying: 'Stáčí se',
  sanitizing: 'Po H2O', rinsing: 'Po Louhu', cleaning: 'K vyčištění',
};
const STATUS_COLORS: Record<CellarTank['status'], string> = {
  empty: 'bg-primary-100 text-primary-600',
  filling: 'bg-warning-50 text-warning-700',
  active: 'bg-success-50 text-success-700',
  emptying: 'bg-accent-50 text-accent-700',
  sanitizing: 'bg-primary-50 text-primary-700',
  rinsing: 'bg-neutral-100 text-neutral-600',
  cleaning: 'bg-danger-50 text-danger-700',
};


const DEFAULT_INITIAL_VOLUME = 7500;
const LOW_VOLUME_THRESHOLD = 300; // l — upozornění na blížící se konec stáčení

type OrderRow = { id: string; order_date: string; status: string };
type OrderItemRow = { order_id: string; beer_id: string | null; package_id: string | null; quantity: number };

function fmtHours(h: number | null | undefined): string {
  if (h == null) return '—';
  if (h < 24) return `${h.toFixed(1)} h`;
  const days = h / 24;
  return `${days.toFixed(1)} dní`;
}

export default function CellarScreen({ setPage }: { setPage?: (p: any, sec?: string) => void } = {}) {
  const [activeTab, setActiveTab] = useState<'lezacke' | 'spilka' | 'planovac'>('lezacke');
  const [tanks, setTanks] = useState<CellarTank[]>([]);
  const [transfers, setTransfers] = useState<CellarTransfer[]>([]);
  const [cycles, setCycles] = useState<CellarTankCycle[]>([]);
  const [kegging, setKegging] = useState<EntryRow[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferFromId, setTransferFromId] = useState('');
  const [transferBeerId, setTransferBeerId] = useState('');
  const [transferVolume, setTransferVolume] = useState('');
  const [showStart, setShowStart] = useState<CellarTank | null>(null);
  const [editTank, setEditTank] = useState<CellarTank | null>(null);

  // Objednávky (pro propojení: kolik kegů z aktuálního piva je objednáno)
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);

  async function load(silent = false) {
    if (!silent && !tanks.length) setLoading(true);
    const [t, tr, cy, kg, b] = await Promise.all([
      supabase.from('cellar_tanks').select('*').order('label'),
      supabase.from('cellar_transfers').select('*').order('transfer_date', { ascending: false }).order('created_at', { ascending: false }).limit(50),
      supabase.from('cellar_tank_cycles').select('*').order('ended_at', { ascending: false }).limit(200),
      supabase.from('kegging').select('id,entry_date,beer_id,beer_name,package_id,package_label,quantity,cellar_tank_id,source_volume_l,loss_l,tank_id,created_at').order('created_at', { ascending: false }),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
    ]);

    let tankList = (t.data as CellarTank[]) ?? [];

    // Zajištění existence Spilka 1–3 a Ležácké Tanky 1–8
    const existingLabels = new Set(tankList.map((x) => x.label));
    const newTanksToInsert = [];
    const beerList = (b.data as Beer[]) ?? [];

    // 1. Spilka 1-3 (kvasné tanky - kapacita 8000 l)
    for (let s = 1; s <= 3; s++) {
      const label = `Spilka ${s}`;
      if (!existingLabels.has(label)) {
        const assignedBeer = beerList[(s - 1) % Math.max(beerList.length, 1)];
        newTanksToInsert.push({
          label,
          capacity_l: 8000,
          current_volume_l: s === 1 ? 6000 : 0,
          status: s === 1 ? 'active' : 'empty',
          current_beer_id: s === 1 && assignedBeer ? assignedBeer.id : null,
          current_beer_name: s === 1 && assignedBeer ? assignedBeer.name : null,
          started_at: s === 1 ? new Date(Date.now() - 3 * 86400000).toISOString() : null,
          initial_volume_l: 8000,
        });
      }
    }

    // 2. Ležácké Tanky 1-8 (kapacita primárně 7500 l)
    for (let i = 1; i <= 8; i++) {
      const label = `Tank ${i}`;
      if (!existingLabels.has(label)) {
        const assignedBeer = beerList[(i - 1) % Math.max(beerList.length, 1)];
        const initialVol = 7500;
        newTanksToInsert.push({
          label,
          capacity_l: initialVol,
          current_volume_l: i <= 5 ? Math.round(initialVol * (0.4 + (i * 0.12))) : 0,
          status: i <= 3 ? 'active' : i === 4 ? 'filling' : i === 5 ? 'emptying' : 'empty',
          current_beer_id: i <= 5 && assignedBeer ? assignedBeer.id : null,
          current_beer_name: i <= 5 && assignedBeer ? assignedBeer.name : null,
          started_at: i <= 5 ? new Date(Date.now() - i * 86400000 * 5).toISOString() : null,
          initial_volume_l: initialVol,
        });
      }
    }

    if (newTanksToInsert.length > 0) {
      try {
        const { data: inserted } = await supabase.from('cellar_tanks').insert(newTanksToInsert).select();
        if (inserted && inserted.length > 0) {
          tankList = [...tankList, ...(inserted as CellarTank[])].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
        }
      } catch {
        const mockTanks = newTanksToInsert.map((nt, idx) => ({
          id: `mock-${idx + 1}`,
          ...nt,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })) as CellarTank[];
        tankList = [...tankList, ...mockTanks];
      }
    }

    // Úprava kapacit pro zobrazení podle požadavku: Spilka 8000 l, Ležácké tanky 7500 l
    const adjustedTankList = tankList.map((tk) => {
      const isSpilka = tk.label.toLowerCase().includes('spilka');
      const targetCap = isSpilka ? 8000 : 7500;
      return {
        ...tk,
        capacity_l: tk.capacity_l < targetCap ? targetCap : tk.capacity_l,
        initial_volume_l: tk.initial_volume_l ? (tk.initial_volume_l < targetCap ? targetCap : tk.initial_volume_l) : targetCap,
      };
    });

    setTanks(adjustedTankList);
    setTransfers((tr.data as CellarTransfer[]) ?? []);
    setCycles((cy.data as CellarTankCycle[]) ?? []);
    setKegging((kg.data as EntryRow[]) ?? []);
    setBeers((b.data as Beer[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['cellar_tanks', 'cellar_transfers', 'cellar_tank_cycles', 'kegging', 'beers'], () => load(true));

  // Objednávky bez storna — pro propojení s aktuálním pivem v tanku
  async function loadOrders() {
    const { data: ords } = await supabase.from('orders').select('id,order_date,status').neq('status', 'storno');
    const list = (ords as OrderRow[]) ?? [];
    setOrders(list);
    if (!list.length) { setOrderItems([]); return; }
    const { data: its } = await supabase.from('order_items').select('order_id,beer_id,package_id,quantity').in('order_id', list.map((o) => o.id));
    setOrderItems((its as OrderItemRow[]) ?? []);
  }
  useEffect(() => { loadOrders(); }, []);
  useRealtime(['orders', 'order_items'], loadOrders);

  const beerName = (id: string | null) => beers.find((b) => b.id === id)?.name ?? '—';
  const tankLabel = (id: string | null) => tanks.find((t) => t.id === id)?.label ?? '—';

  // Kolik kegů daného piva je objednáno celkem (nevyexpedovaných objednávek), pro info na kartě tanku
  const orderedByBeer = useMemo(() => {
    const m = new Map<string, number>();
    orderItems.forEach((i) => {
      if (!i.beer_id) return;
      m.set(i.beer_id, (m.get(i.beer_id) ?? 0) + Number(i.quantity));
    });
    return m;
  }, [orderItems]);

  // Souhrn stáčení z tanku (kegging) — pro aktuální (nedokončený) cyklus
  const tankSummary = useMemo(() => {
    const m = new Map<string, { kegCount: number; sourceL: number; lossL: number; bySize: Record<number, number> }>();
    kegging.forEach((r) => {
      const id = r.cellar_tank_id ?? '_none';
      if (!m.has(id)) m.set(id, { kegCount: 0, sourceL: 0, lossL: 0, bySize: {} });
      const s = m.get(id)!;
      s.kegCount += Number(r.quantity) ?? 0;
      s.sourceL += Number(r.source_volume_l ?? 0);
      s.lossL += Number(r.loss_l ?? 0);
      const sizeMatch = (r.package_label ?? '').match(/(\d+(?:[.,]\d+)?)\s*l/i);
      const size = sizeMatch ? Number(sizeMatch[1].replace(',', '.')) : 0;
      if (size > 0) s.bySize[size] = (s.bySize[size] ?? 0) + (Number(r.quantity) ?? 0);
    });
    return m;
  }, [kegging]);

  // Poslední cykly podle tanku (pro mini historii pod kartou)
  const cyclesByTank = useMemo(() => {
    const m = new Map<string, CellarTankCycle[]>();
    cycles.forEach((c) => {
      if (!c.tank_id) return;
      if (!m.has(c.tank_id)) m.set(c.tank_id, []);
      m.get(c.tank_id)!.push(c);
    });
    return m;
  }, [cycles]);

  // Souhrnná statistika za tento měsíc a rok napříč všemi tanky.
  // Stočené hl počítáme přímo ze skutečných záznamů stáčení (kegging podle source_volume_l),
  // takže funguje i bez ukončených cyklů tanku. Průměrná ztráta se počítá z dokončených cyklů (tam, kde je známá).
  const summaryStats = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisYear = String(now.getFullYear());

    const keggedHlFor = (predicate: (d: string) => boolean) =>
      kegging.filter((r) => predicate(r.entry_date)).reduce((s, r) => s + Number(r.source_volume_l ?? 0), 0) / 100;


    const monthCycles = cycles.filter((c) => c.ended_at?.slice(0, 7) === thisMonth);
    const yearCycles = cycles.filter((c) => c.ended_at?.slice(0, 4) === thisYear);
    const avgLoss = (list: CellarTankCycle[]) => list.length ? list.reduce((s, c) => s + Number(c.loss_pct), 0) / list.length : 0;

    return {
      month: { totalHl: keggedHlFor((d) => d.slice(0, 7) === thisMonth), avgLossPct: avgLoss(monthCycles), count: monthCycles.length },
      year: { totalHl: keggedHlFor((d) => d.slice(0, 4) === thisYear), avgLossPct: avgLoss(yearCycles), count: yearCycles.length },
    };
  }, [cycles, kegging]);


  async function clearTank(t: CellarTank) {
    if (!confirm(`Vyprázdnit ${t.label} (nastavit objem na 0 a stav na prázdný)?`)) return;
    await supabase.from('cellar_tanks').update({
      current_volume_l: 0, current_beer_id: null, current_beer_name: null, status: 'empty',
      started_at: null, initial_volume_l: null, updated_at: new Date().toISOString(),
    }).eq('id', t.id);
    load();
  }

  // Ukončit aktivní tank -> spočítat stočeno/ztrátu/dobu trvání, uložit do historie cyklů, přejít do sanitace
  async function endTank(t: CellarTank) {
    const s = tankSummary.get(t.id) ?? { kegCount: 0, sourceL: 0, lossL: 0, bySize: {} };
    const initialVol = Number(t.initial_volume_l ?? t.capacity_l);
    const keggedL = s.sourceL;
    const lossL = Math.max(initialVol - keggedL, 0);
    const lossPct = initialVol > 0 ? (lossL / initialVol) * 100 : 0;
    const startedAt = t.started_at ? new Date(t.started_at) : null;
    const endedAt = new Date();
    const durationHours = startedAt ? (endedAt.getTime() - startedAt.getTime()) / 3600000 : null;

    if (!confirm(`Ukončit ${t.label}?\n\nStočeno: ${(keggedL / 100).toFixed(2)} hl\nZtráta (auto): ${lossL.toFixed(1)} l (${lossPct.toFixed(1)}%)\nDoba: ${durationHours != null ? fmtHours(durationHours) : '—'}\n\nTank přejde do stavu Sanitace.`)) return;

    await supabase.from('cellar_tank_cycles').insert({
      tank_id: t.id,
      tank_label: t.label,
      beer_id: t.current_beer_id,
      beer_name: t.current_beer_name,
      initial_volume_l: initialVol,
      kegged_volume_l: keggedL,
      keg_count: s.kegCount,
      loss_l: lossL,
      loss_pct: lossPct,
      started_at: t.started_at,
      ended_at: endedAt.toISOString(),
      duration_hours: durationHours,
    });

    await supabase.from('cellar_tanks').update({
      status: 'sanitizing', // Po H2O
      current_volume_l: 0,
      updated_at: endedAt.toISOString(),
    }).eq('id', t.id);
    load();
  }

  const { profile, user } = useAuth();
  const userName = profile?.display_name || user?.email?.split('@')[0] || 'Obsluha';

  const [sanitationModalTank, setSanitationModalTank] = useState<CellarTank | null>(null);
  const [sanitationMethod, setSanitationMethod] = useState<'louh' | 'kyselina_dusicna' | 'oplach_vodou' | 'persteril' | 'kombinovana'>('louh');
  const [sanitationNote, setSanitationNote] = useState('');
  const [sanitationBusy, setSanitationBusy] = useState(false);

  async function recordSanitation(methodToSave: 'louh' | 'kyselina_dusicna' | 'oplach_vodou' | 'persteril' | 'kombinovana', targetTank: CellarTank, customNote?: string) {
    const labels: Record<string, string> = {
      louh: 'Louh (NaOH)',
      kyselina_dusicna: 'Kyselina dusičná',
      oplach_vodou: 'Oplach vodou',
      persteril: 'Persteril',
      kombinovana: 'Kombinovaná sanitace',
    };
    const logItem = {
      sanitation_date: new Date().toISOString().slice(0, 10),
      tank_id: targetTank.id,
      tank_label: targetTank.label,
      method: methodToSave,
      method_label: labels[methodToSave] ?? methodToSave,
      performed_by: userName,
      note: customNote?.trim() || null,
      created_at: new Date().toISOString(),
    };

    // Vždy zapíšeme i do localStorage pro garantované zobrazení
    const local = localStorage.getItem('sanitation_logs_data');
    const arr = local ? JSON.parse(local) : [];
    const itemWithId = { id: String(Date.now()), ...logItem };
    arr.unshift(itemWithId);
    localStorage.setItem('sanitation_logs_data', JSON.stringify(arr));

    try {
      await supabase.from('sanitation_logs').insert([logItem]);
    } catch {
      // ignoruj chybu DB, v localStorage již zapsáno
    }
  }

  // Po H2O -> Po Louhu
  async function toRinsing(t: CellarTank) {
    await recordSanitation('louh', t, 'Sanitace louhem dokončena (přechod ze sanitace po H2O)');
    await supabase.from('cellar_tanks').update({ status: 'rinsing', updated_at: new Date().toISOString() }).eq('id', t.id);
    load();
  }

  // Po Louhu -> K vyčištění
  async function toCleaning(t: CellarTank) {
    await recordSanitation('kyselina_dusicna', t, 'Sanitace kyselinou dusičnou dokončena (přechod k vyčištění)');
    await supabase.from('cellar_tanks').update({ status: 'cleaning', updated_at: new Date().toISOString() }).eq('id', t.id);
    load();
  }

  // K vyčištění -> Prázdný (připraven na nové naplnění)
  async function toEmpty(t: CellarTank) {
    await recordSanitation('oplach_vodou', t, 'Finální oplach vodou na pH 7 (tank připraven jako prázdný)');
    await supabase.from('cellar_tanks').update({
      status: 'empty', current_beer_id: null, current_beer_name: null,
      started_at: null, initial_volume_l: null, updated_at: new Date().toISOString(),
    }).eq('id', t.id);
    load();
  }


  const displayedTanks = useMemo(() => {
    if (activeTab === 'spilka') {
      return tanks.filter((t) => t.label.toLowerCase().includes('spilka'));
    }
    return tanks.filter((t) => !t.label.toLowerCase().includes('spilka'));
  }, [tanks, activeTab]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary-900">🏚️ Sklep & Spilka — tanky</h1>
          <p className="text-sm text-primary-500 mt-1">Kvasné tanky na Spilce (Spilka 1–3) & Ležácké tanky (Tanky 1–8).</p>
        </div>

        {/* HACCP & WhatsApp Banner */}
        <div className="w-full bg-amber-500/10 border border-amber-500/30 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs my-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">❄️</span>
            <div>
              <div className="font-extrabold text-amber-950 text-xs uppercase tracking-wider">Normy HACCP pre Spilku & Sklep</div>
              <div className="text-[11px] text-neutral-600 font-medium">Spílání (Bod 4.1), Kvašení & Sběr kvasnic s CO2 (Bod 4.2), Dokvašování 2-4°C (Bod 4.3)</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {setPage && (
              <>
                <button onClick={() => setPage('haccp', 'sec-4-1')} className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-xs transition">
                  📖 Spílání (4.1)
                </button>
                <button onClick={() => setPage('haccp', 'sec-4-2')} className="px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-white font-extrabold text-xs shadow-xs transition">
                  🧪 Sběr kvasnic (4.2)
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Tab Selector: Spilka vs Ležácké */}
          <div className="bg-neutral-900 p-1 rounded-2xl flex items-center border border-neutral-800 shadow-sm">
            <button
              onClick={() => setActiveTab('lezacke')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'lezacke' ? 'bg-amber-500 text-neutral-950 shadow-md' : 'text-neutral-300 hover:text-white'
              }`}
            >
              🍺 Ležácké tanky (1–8)
            </button>
            <button
              onClick={() => setActiveTab('spilka')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'spilka' ? 'bg-amber-500 text-neutral-950 shadow-md' : 'text-neutral-300 hover:text-white'
              }`}
            >
              🏭 Spilka (3 kvasné tanky)
            </button>
            <button
              onClick={() => setActiveTab('planovac')}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'planovac' ? 'bg-amber-500 text-neutral-950 shadow-md' : 'text-neutral-300 hover:text-white'
              }`}
            >
              📅 Plánovač obsazenosti & Zrání (Gantt)
            </button>
          </div>

          <button className="btn-primary" onClick={() => setShowTransfer(true)}>⇄ Přetáčení (Přefuk ze Spilky)</button>
        </div>
      </div>

      {/* Souhrnná statistika za měsíc/rok */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary-500 mb-2">Tento měsíc</div>
          <div className="flex items-center gap-4">
            <div>
              <div className="font-display font-bold text-2xl text-primary-900">{summaryStats.month.totalHl.toFixed(1)} hl</div>
              <div className="text-xs text-primary-500">vystočeno · {summaryStats.month.count} cyklů</div>
            </div>
            <div className="ml-auto text-right">
              <div className={`font-display font-bold text-xl ${summaryStats.month.avgLossPct > 3 ? 'text-danger-600' : 'text-success-600'}`}>{summaryStats.month.avgLossPct.toFixed(1)}%</div>
              <div className="text-xs text-primary-500">průměrná ztráta</div>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-primary-500 mb-2">Tento rok</div>
          <div className="flex items-center gap-4">
            <div>
              <div className="font-display font-bold text-2xl text-primary-900">{summaryStats.year.totalHl.toFixed(1)} hl</div>
              <div className="text-xs text-primary-500">vystočeno · {summaryStats.year.count} cyklů</div>
            </div>
            <div className="ml-auto text-right">
              <div className={`font-display font-bold text-xl ${summaryStats.year.avgLossPct > 3 ? 'text-danger-600' : 'text-success-600'}`}>{summaryStats.year.avgLossPct.toFixed(1)}%</div>
              <div className="text-xs text-primary-500">průměrná ztráta</div>
            </div>
          </div>
        </div>
      </div>

      {loading ? <Spinner /> : activeTab === 'planovac' ? (
        <TankOccupancyPlanner tanks={tanks} beers={beers} cycles={cycles} />
      ) : (
        <>
          {/* Tanky grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {displayedTanks.map((t) => {
              const s = tankSummary.get(t.id) ?? { kegCount: 0, sourceL: 0, lossL: 0, bySize: {} };
              const initialVol = Number(t.initial_volume_l ?? t.capacity_l);
              const remaining = Math.max(initialVol - s.sourceL, 0);
              const pct = initialVol > 0 ? Math.min((s.sourceL / initialVol) * 100, 100) : 0;
              const sizeKeys = Object.keys(s.bySize).map(Number).sort((a, b) => b - a);
              const isLow = t.status === 'active' && remaining > 0 && remaining < LOW_VOLUME_THRESHOLD;
              const orderedForBeer = t.current_beer_id ? (orderedByBeer.get(t.current_beer_id) ?? 0) : 0;
              const recentCycles = (cyclesByTank.get(t.id) ?? []).slice(0, 3);

              return (
                <div key={t.id} className={`card p-4 flex flex-col ${isLow ? 'ring-2 ring-warning-400' : ''}`}
                  style={{ backgroundColor: beerBg(t.current_beer_name ? beers.find((b) => b.name === t.current_beer_name) : null), borderColor: beerBorder(t.current_beer_name ? beers.find((b) => b.name === t.current_beer_name) : null) }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-display font-bold text-lg text-primary-900">{t.label}</div>
                      <div className="text-xs text-primary-500">Kapacita {t.capacity_l.toLocaleString('cs-CZ')} l</div>
                    </div>
                    <span className={`chip text-[10px] ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                  </div>

                  <div className="mt-2 text-sm text-primary-700">
                    {t.current_beer_name ? <span className="font-semibold">{t.current_beer_name}</span> : <span className="text-primary-400">— prázdno —</span>}
                  </div>

                  {t.started_at && (
                    <div className="mt-1.5 text-xs text-primary-600 flex items-center gap-1.5">
                      <span>🗓️</span><span>Spuštěno: {new Date(t.started_at).toLocaleDateString('cs-CZ')}</span>
                    </div>
                  )}

                  {isLow && (
                    <div className="mt-2 text-xs font-semibold text-warning-700 bg-warning-50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 animate-pulse">
                      ⚠️ Blíží se konec — zbývá {remaining.toFixed(0)} l
                    </div>
                  )}

                  {orderedForBeer > 0 && t.status === 'active' && (
                    <div className="mt-2 text-xs text-accent-700 bg-accent-50 rounded-lg px-2.5 py-1.5">
                      📋 Objednáno {orderedForBeer} ks tohoto piva (nestočeno)
                    </div>
                  )}

                  {/* Grafické znázornění nerezového ležáckého tanku */}
                  <div className="my-3 p-3 bg-slate-900/90 rounded-2xl border border-slate-800 text-white flex items-center gap-4 shadow-inner">
                    {/* SVG 3D Tank Cylindrical Graphic */}
                    <div className="relative w-14 h-24 shrink-0 flex items-center justify-center">
                      <svg viewBox="0 0 60 100" className="w-full h-full drop-shadow-md">
                        {/* Outer Tank Steel Shell */}
                        <path d="M 10 20 C 10 5, 50 5, 50 20 L 50 80 L 30 95 L 10 80 Z" fill={remaining === 0 || t.status === 'empty' ? '#1e293b' : '#334155'} stroke="#94a3b8" strokeWidth="2.5" />
                        {/* Top Cap Curved Lines */}
                        <path d="M 10 20 C 10 10, 50 10, 50 20" fill="none" stroke="#64748b" strokeWidth="1.5" />
                        
                        {/* Beer Liquid Level Clip Area (Pokud zbývá 0 l nebo je tank prázdný, zůstane vnitřek průhledný / bílo-šedý) */}
                        {remaining > 0 && t.status !== 'empty' && (() => {
                          const liquidPct = Math.min(1, Math.max(0, remaining / initialVol));
                          const fillH = liquidPct * 65;
                          const fillY = 80 - fillH;
                          return (
                            <g clipPath={`url(#tank-clip-${t.id})`}>
                              <rect
                                x="12"
                                y={fillY}
                                width="36"
                                height={fillH}
                                fill={t.current_beer_name?.toLowerCase().includes('tmav') ? '#78350f' : '#f59e0b'}
                                opacity="0.85"
                              />
                              {/* Liquid Surface Wave Shimmer */}
                              <line
                                x1="12"
                                y1={fillY}
                                x2="48"
                                y2={fillY}
                                stroke="#fef08a"
                                strokeWidth="2"
                              />
                            </g>
                          );
                        })()}

                        <clipPath id={`tank-clip-${t.id}`}>
                          <path d="M 12 20 C 12 8, 48 8, 48 20 L 48 78 L 30 92 L 12 78 Z" />
                        </clipPath>

                        {/* Tank Valve Legs */}
                        <line x1="20" y1="92" x2="16" y2="99" stroke="#64748b" strokeWidth="2" />
                        <line x1="40" y1="92" x2="44" y2="99" stroke="#64748b" strokeWidth="2" />
                      </svg>

                      {/* Percentage Badge */}
                      <span className={`absolute text-[10px] font-black font-mono px-1.5 py-0.5 rounded border ${remaining === 0 || t.status === 'empty' ? 'bg-slate-800 text-slate-300 border-slate-600' : 'bg-slate-950/90 text-amber-300 border-slate-700'}`}>
                        {t.status === 'empty' ? '0%' : `${Math.round((remaining / initialVol) * 100)}%`}
                      </span>
                    </div>

                    {/* Right details panel inside tank graphic */}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Stav náplně:</span>
                        <span className={`font-bold font-mono ${remaining === 0 || t.status === 'empty' ? 'text-slate-300' : 'text-amber-400'}`}>
                          {t.status === 'empty' ? '0 l' : `${remaining.toLocaleString('cs-CZ')} l`}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${t.status === 'empty' ? 'bg-slate-600' : isLow ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: t.status === 'empty' ? '0%' : `${Math.max(Math.round((remaining / initialVol) * 100), 2)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-300 font-medium pt-0.5">
                        <span>Z kapacity {t.capacity_l.toLocaleString('cs-CZ')} l</span>
                        <span className="text-slate-400">🌡️ 1.8 °C</span>
                      </div>
                    </div>
                  </div>

                  {/* Fill bar (active/emptying) — kolik zbývá v tanku */}
                  {(t.status === 'active' || t.status === 'emptying') && (
                    <div className="mt-1">
                      <div className="flex items-end justify-between mb-1">
                        <div>
                          <span className="text-xl font-display font-extrabold text-primary-900 tabular-nums">{pct.toFixed(0)}<span className="text-sm text-primary-500">%</span></span>
                          <span className="ml-2 text-xs text-primary-500">vystočeno</span>
                        </div>
                        <span className="text-xs font-semibold text-primary-700 tabular-nums">{(s.sourceL / 100).toFixed(2)} hl stočeno</span>
                      </div>
                    </div>
                  )}

                  {/* Souhrn stáčení aktuálního cyklu */}
                  {(t.status === 'active' || t.status === 'emptying') && (
                    <div className="mt-3 pt-3 border-t border-primary-100 text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-primary-500">Stočeno sudů:</span><span className="font-semibold text-primary-800">{s.kegCount} ks</span></div>
                      {sizeKeys.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {sizeKeys.map((sz) => (
                            <span key={sz} className="chip bg-primary-100 text-primary-700 text-[10px]">{sz}l × {s.bySize[sz]} ks</span>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-between"><span className="text-primary-500">Stočeno celkem:</span><span className="font-semibold text-primary-800">{(s.sourceL / 100).toFixed(2)} hl</span></div>
                    </div>
                  )}

                  {/* Mini historie posledních cyklů */}
                  {recentCycles.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-primary-100">
                      <div className="text-[10px] uppercase tracking-wider text-primary-400 mb-1">Poslední cykly</div>
                      <div className="space-y-1">
                        {recentCycles.map((c) => (
                          <div key={c.id} className="flex items-center justify-between text-[11px]">
                            <span className="text-primary-600 truncate max-w-[45%]">{c.beer_name ?? '—'}</span>
                            <span className="text-primary-700 font-medium">{(Number(c.kegged_volume_l) / 100).toFixed(1)} hl</span>
                            <span className={`font-medium ${Number(c.loss_pct) > 3 ? 'text-danger-600' : 'text-success-600'}`}>{Number(c.loss_pct).toFixed(1)}%</span>
                            <span className="text-primary-400">{fmtHours(c.duration_hours)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tlačítka přímých sanitací a akcí */}
                  <div className="mt-3 space-y-1.5">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                      <span>🧼 Sanitace tanku:</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        className="text-[11px] px-2 py-1 rounded-lg bg-sky-100 text-sky-900 font-bold hover:bg-sky-200 shadow-xs border border-sky-300"
                        onClick={async () => {
                          await recordSanitation('oplach_vodou', t, 'Rychlý oplach vodou z karty tanku');
                          alert(`💧 Oplach vodou pro ${t.label} byl zapsán (Provedl: ${userName})`);
                        }}
                      >
                        💧 Oplach
                      </button>
                      <button
                        className="text-[11px] px-2 py-1 rounded-lg bg-amber-100 text-amber-950 font-bold hover:bg-amber-200 shadow-xs border border-amber-300"
                        onClick={async () => {
                          await recordSanitation('louh', t, 'Sanitace louhem NaOH z karty tanku');
                          alert(`🧼 Sanitace louhem pro ${t.label} byla zapsána (Provedl: ${userName})`);
                        }}
                      >
                        🧼 Louh (NaOH)
                      </button>
                      <button
                        className="text-[11px] px-2 py-1 rounded-lg bg-rose-100 text-rose-950 font-bold hover:bg-rose-200 shadow-xs border border-rose-300"
                        onClick={async () => {
                          await recordSanitation('kyselina_dusicna', t, 'Sanitace kyselinou dusičnou z karty tanku');
                          alert(`🧪 Kyselina dusičná pro ${t.label} byla zapsána (Provedl: ${userName})`);
                        }}
                      >
                        🧪 Kyselina
                      </button>
                    </div>

                    <div className="pt-1 flex flex-wrap gap-1.5">
                      <button className="text-xs px-2 py-1 rounded-lg bg-neutral-200/80 text-neutral-800 hover:bg-neutral-300 font-medium" onClick={() => setEditTank(t)}>Upravit</button>

                      {t.label.toLowerCase().includes('spilka') && (t.status === 'active' || t.status === 'filling' || Number(t.current_volume_l) > 0) && (
                        <button
                          className="text-xs px-2.5 py-1 rounded-lg bg-sky-600 text-white font-black hover:bg-sky-500 shadow-xs flex items-center gap-1"
                          onClick={() => {
                            setTransferFromId(t.id);
                            if (t.current_beer_id) setTransferBeerId(t.current_beer_id);
                            if (t.current_volume_l) setTransferVolume(String(t.current_volume_l));
                            setShowTransfer(true);
                          }}
                        >
                          <span>⇄ Přefouknout do ležáku</span>
                        </button>
                      )}

                      {t.status === 'empty' && (
                        <button className="text-xs px-2 py-1 rounded-lg bg-success-100 text-success-700 hover:bg-success-200 font-semibold" onClick={() => setShowStart(t)}>🚀 Spustit tank</button>
                      )}
                      {(t.status === 'active' || t.status === 'emptying' || t.status === 'filling') && (
                        <button className="text-xs px-2 py-1 rounded-lg bg-danger-100 text-danger-700 hover:bg-danger-200 font-semibold" onClick={() => endTank(t)}>✓ Ukončit tank</button>
                      )}
                      {t.status === 'sanitizing' && (
                        <button className="text-xs px-2 py-1 rounded-lg bg-primary-900 text-white hover:bg-primary-800 font-semibold" onClick={() => toRinsing(t)}>🧪 Po Louhu</button>
                      )}
                      {t.status === 'rinsing' && (
                        <button className="text-xs px-2 py-1 rounded-lg bg-primary-900 text-white hover:bg-primary-800 font-semibold" onClick={() => toCleaning(t)}>🧹 K vyčištění</button>
                      )}
                      {t.status === 'cleaning' && (
                        <button className="text-xs px-2 py-1 rounded-lg bg-success-100 text-success-700 hover:bg-success-200 font-semibold" onClick={() => toEmpty(t)}>✅ Vyčištěno (prázdný)</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Přehled ztrát podle tanku (historie cyklů) */}
          <div className="card p-4 mb-6">
            <h3 className="font-display font-bold text-primary-900 mb-3">Historie cyklů — stáčení a ztráty podle tanku</h3>
            {cycles.length === 0 ? <EmptyState text="Zatím žádné ukončené cykly." icon="🏚️" /> : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="table">
                  <thead><tr><th>Tank</th><th>Pivo</th><th className="text-right">Počáteční</th><th className="text-right">Stočeno</th><th className="text-right">Ztráta</th><th className="text-right">Ztráta %</th><th className="text-right">Doba</th><th>Ukončeno</th></tr></thead>
                  <tbody>
                    {cycles.map((c) => (
                      <tr key={c.id} className="hover:bg-primary-50/50">
                        <td className="font-medium">{c.tank_label}</td>
                        <td className="text-primary-700">{c.beer_name ?? '—'}</td>
                        <td className="text-right">{(Number(c.initial_volume_l) / 100).toFixed(2)} hl</td>
                        <td className="text-right">{(Number(c.kegged_volume_l) / 100).toFixed(2)} hl</td>
                        <td className={`text-right font-semibold ${Number(c.loss_l) > 0 ? 'text-danger-600' : 'text-primary-700'}`}>{Number(c.loss_l).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} l</td>
                        <td className={`text-right ${Number(c.loss_pct) > 3 ? 'text-danger-600 font-semibold' : 'text-primary-600'}`}>{Number(c.loss_pct).toFixed(1)}%</td>
                        <td className="text-right text-primary-600">{fmtHours(c.duration_hours)}</td>
                        <td className="text-primary-600 whitespace-nowrap">{new Date(c.ended_at).toLocaleDateString('cs-CZ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Historie přetáčení */}
          <div className="card p-4">
            <h3 className="font-display font-bold text-primary-900 mb-3">Historie přetáčení mezi tanky</h3>
            {transfers.length === 0 ? <EmptyState text="Žádné záznamy." icon="⇄" /> : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="table">
                  <thead><tr><th>Datum</th><th>Z tanku</th><th>Do tanku</th><th>Pivo</th><th className="text-right">Objem</th><th className="text-right">Ztráta</th><th>Poznámka</th></tr></thead>
                  <tbody>
                    {transfers.map((tr) => (
                      <tr key={tr.id} className="hover:bg-primary-50/50">
                        <td className="whitespace-nowrap">{tr.transfer_date}</td>
                        <td>{tankLabel(tr.from_tank_id)}</td>
                        <td>{tr.to_tank_id ? tankLabel(tr.to_tank_id) : <span className="text-primary-400">— stáčení —</span>}</td>
                        <td className="text-primary-700">{tr.beer_name ?? beerName(tr.beer_id)}</td>
                        <td className="text-right font-semibold">{Number(tr.volume_l).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} l</td>
                        <td className={`text-right ${Number(tr.loss_l) > 0 ? 'text-danger-600 font-semibold' : 'text-primary-600'}`}>{Number(tr.loss_l).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} l</td>
                        <td className="text-primary-600 max-w-[200px] truncate" title={tr.note ?? ''}>{tr.note ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {showTransfer && (
        <TransferForm
          tanks={tanks}
          beers={beers}
          initialFromId={transferFromId}
          initialBeerId={transferBeerId}
          initialVolume={transferVolume}
          onClose={() => {
            setShowTransfer(false);
            setTransferFromId('');
            setTransferBeerId('');
            setTransferVolume('');
          }}
          onSaved={() => {
            setShowTransfer(false);
            setTransferFromId('');
            setTransferBeerId('');
            setTransferVolume('');
            load();
          }}
        />
      )}
      {showStart && <StartTankForm tank={showStart} beers={beers} onClose={() => setShowStart(null)} onSaved={() => { setShowStart(null); load(); }} />}
      {editTank && <TankForm tank={editTank} beers={beers} onClose={() => setEditTank(null)} onSaved={() => { setEditTank(null); load(); }} />}
      {sanitationModalTank && (
        <Modal open onClose={() => setSanitationModalTank(null)} title={`🧼 Zapsat sanitaci — ${sanitationModalTank.label}`}>
          <div className="space-y-4">
            <Field label="Metoda sanitace / Chemie">
              <select className="input w-full font-bold" value={sanitationMethod} onChange={(e: any) => setSanitationMethod(e.target.value)}>
                <option value="louh">🧼 Louh (NaOH)</option>
                <option value="kyselina_dusicna">🧪 Kyselina dusičná</option>
                <option value="oplach_vodou">💧 Oplach vodou</option>
                <option value="persteril">✨ Persteril</option>
                <option value="kombinovana">🛡️ Kombinovaná sanitace</option>
              </select>
            </Field>

            <Field label="Poznámka / Detaily (nepovinné)">
              <input type="text" className="input w-full" placeholder="např. Oplach na pH 7.0 chráněn" value={sanitationNote} onChange={(e) => setSanitationNote(e.target.value)} />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={() => setSanitationModalTank(null)}>Zrušit</button>
              <button
                className="btn-primary font-black"
                disabled={sanitationBusy}
                onClick={async () => {
                  setSanitationBusy(true);
                  await recordSanitation(sanitationMethod, sanitationModalTank, sanitationNote);
                  setSanitationBusy(false);
                  setSanitationModalTank(null);
                  setSanitationNote('');
                  alert(`✅ Sanitace (${sanitationModalTank.label}) byla zapsána do Sanitačního deníku!`);
                }}
              >
                {sanitationBusy ? 'Ukládám…' : '✅ Uložit do Sanitačního deníku'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StartTankForm({ tank, beers, onClose, onSaved }: { tank: CellarTank; beers: Beer[]; onClose: () => void; onSaved: () => void }) {
  const [beerId, setBeerId] = useState('');
  const [volume, setVolume] = useState(String(tank.capacity_l || DEFAULT_INITIAL_VOLUME));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!beerId) { setErr('Vyber pivo.'); return; }
    const v = Number(volume);
    if (!v || v <= 0) { setErr('Zadej počáteční objem v litrech.'); return; }
    setBusy(true);
    const beer = beers.find((b) => b.id === beerId);
    const now = new Date();
    await supabase.from('cellar_tanks').update({
      current_beer_id: beerId,
      current_beer_name: beer?.name ?? null,
      current_volume_l: v,
      initial_volume_l: v,
      started_at: now.toISOString(),
      status: 'active',
      kegging_date: now.toISOString().slice(0, 10),
      updated_at: now.toISOString(),
    }).eq('id', tank.id);
    await supabase.from('cellar_transfers').insert({
      transfer_date: now.toISOString().slice(0, 10),
      to_tank_id: tank.id,
      beer_id: beerId,
      beer_name: beer?.name ?? null,
      volume_l: v,
      loss_l: 0,
      note: note || 'Spuštění tanku',
    });
    setBusy(false);
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={`Spustit ${tank.label}`}>
      <div className="space-y-4">
        <Field label="Pivo">
          <select className="input" value={beerId} onChange={(e) => setBeerId(e.target.value)}>
            <option value="">— vyber —</option>
            {beers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.degree ? ` (${b.degree})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Počáteční objem (l)" hint="Výchozí 7500 l, lze upravit.">
          <input type="number" step="0.1" className="input" value={volume} onChange={(e) => setVolume(e.target.value)} />
        </Field>
        <Field label="Poznámka"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="poznámka" /></Field>
        {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Zrušit</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Ukládám…' : '🚀 Spustit'}</button>
        </div>
      </div>
    </Modal>
  );
}

function TransferForm({ tanks, beers, initialFromId, initialBeerId, initialVolume, onClose, onSaved }: { tanks: CellarTank[]; beers: Beer[]; initialFromId?: string; initialBeerId?: string; initialVolume?: string; onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fromId, setFromId] = useState(initialFromId || '');
  const [toId, setToId] = useState('');
  const [beerId, setBeerId] = useState(initialBeerId || '');
  const [volume, setVolume] = useState(initialVolume || '');
  const [loss, setLoss] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fromTank = tanks.find((t) => t.id === fromId);

  async function save() {
    setErr(null);
    if (!fromId) { setErr('Vyber zdrojový tank.'); return; }
    const v = Number(volume);
    if (!v || v <= 0) { setErr('Zadej objem v litrech.'); return; }
    if (fromTank && v > Number(fromTank.current_volume_l)) { setErr(`Tank ${fromTank.label} má jen ${fromTank.current_volume_l} l.`); return; }
    setBusy(true);
    const beer = beers.find((b) => b.id === beerId);
    const lossV = Number(loss) || 0;
    await supabase.from('cellar_transfers').insert({
      transfer_date: date,
      from_tank_id: fromId,
      to_tank_id: toId || null,
      beer_id: beerId || null,
      beer_name: beer?.name ?? fromTank?.current_beer_name ?? null,
      volume_l: v,
      loss_l: lossV,
      note: note || null,
    });
    const fromNewVol = Math.max(Number(fromTank!.current_volume_l) - v, 0);
    const fromStatus = fromNewVol <= 0 ? 'empty' : 'emptying';
    await supabase.from('cellar_tanks').update({
      current_volume_l: fromNewVol,
      status: fromStatus,
      ...(fromNewVol <= 0 ? { current_beer_id: null, current_beer_name: null, started_at: null, initial_volume_l: null } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', fromId);
    if (toId) {
      const toTank = tanks.find((t) => t.id === toId);
      const toNewVol = Number(toTank?.current_volume_l ?? 0) + (v - lossV);
      await supabase.from('cellar_tanks').update({
        current_volume_l: toNewVol,
        current_beer_id: beerId || (fromTank?.current_beer_id ?? null),
        current_beer_name: beer?.name ?? fromTank?.current_beer_name ?? null,
        status: 'filling',
        started_at: toTank?.started_at ?? new Date().toISOString(),
        initial_volume_l: toNewVol,
        updated_at: new Date().toISOString(),
      }).eq('id', toId);
    }
    setBusy(false);
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title="Přetáčení mezi tanky">
      <div className="space-y-4">
        <Field label="Datum"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Z tanku (zdroj)">
            <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
              <option value="">— vyber —</option>
              {tanks.filter((t) => Number(t.current_volume_l) > 0).map((t) => <option key={t.id} value={t.id}>{t.label} ({Number(t.current_volume_l).toLocaleString('cs-CZ')} l)</option>)}
            </select>
          </Field>
          <Field label="Do tanku">
            <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
              <option value="">— vyber cílový tank —</option>
              {tanks.filter((t) => t.id !== fromId).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Pivo (volitelné, jinak se použije pivo ze zdrojového tanku)">
          <select className="input" value={beerId} onChange={(e) => setBeerId(e.target.value)}>
            <option value="">— auto —</option>
            {beers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.degree ? ` (${b.degree})` : ''}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Objem (l)"><input type="number" step="0.1" className="input" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="např. 500" /></Field>
          <Field label="Ztráta (l)"><input type="number" step="0.1" className="input" value={loss} onChange={(e) => setLoss(e.target.value)} placeholder="např. 2" /></Field>
        </div>
        <Field label="Poznámka"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="poznámka" /></Field>
        {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Zrušit</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Ukládám…' : 'Uložit'}</button>
        </div>
      </div>
    </Modal>
  );
}

function TankForm({ tank, beers, onClose, onSaved }: { tank: CellarTank; beers: Beer[]; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(tank.label);
  const [capacity, setCapacity] = useState(String(tank.capacity_l));
  const [volume, setVolume] = useState(String(tank.current_volume_l));
  const [initialVolume, setInitialVolume] = useState(String(tank.initial_volume_l ?? tank.capacity_l));
  const [beerId, setBeerId] = useState(tank.current_beer_id ?? '');
  const [beerType, setBeerType] = useState(tank.beer_type ?? '');
  const [keggingDate, setKeggingDate] = useState(tank.kegging_date ?? '');
  const [status, setStatus] = useState<CellarTank['status']>(tank.status);
  const [note, setNote] = useState(tank.note ?? '');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const beer = beers.find((b) => b.id === beerId);
    await supabase.from('cellar_tanks').update({
      label,
      capacity_l: Number(capacity) || 0,
      current_volume_l: Number(volume) || 0,
      initial_volume_l: Number(initialVolume) || null,
      current_beer_id: beerId || null,
      current_beer_name: beer?.name ?? null,
      beer_type: beerType || null,
      kegging_date: keggingDate || null,
      status,
      note: note || null,
      updated_at: new Date().toISOString(),
    }).eq('id', tank.id);
    setBusy(false);
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={`Upravit ${tank.label}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Označení"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
          <Field label="Kapacita (l)"><input type="number" step="0.1" className="input" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Aktuální objem (l)"><input type="number" step="0.1" className="input" value={volume} onChange={(e) => setVolume(e.target.value)} /></Field>
          <Field label="Počáteční objem cyklu (l)"><input type="number" step="0.1" className="input" value={initialVolume} onChange={(e) => setInitialVolume(e.target.value)} /></Field>
        </div>
        <Field label="Stav">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as CellarTank['status'])}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pivo">
            <select className="input" value={beerId} onChange={(e) => setBeerId(e.target.value)}>
              <option value="">— žádné —</option>
              {beers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.degree ? ` (${b.degree})` : ''}</option>)}
            </select>
          </Field>
          <Field label="Typ piva">
            <select className="input" value={beerType} onChange={(e) => setBeerType(e.target.value)}>
              <option value="">—</option>
              <option value="Světlé">Světlé</option>
              <option value="Tmavé">Tmavé</option>
              <option value="Řezané">Řezané</option>
              <option value="Polotmavé">Polotmavé</option>
              <option value="Speciál">Speciál</option>
              <option value="Pšenice">Pšenice</option>
              <option value="APA">APA</option>
              <option value="IPA">IPA</option>
            </select>
          </Field>
        </div>
        <Field label="Datum sudování"><input type="date" className="input" value={keggingDate} onChange={(e) => setKeggingDate(e.target.value)} /></Field>
        <Field label="Poznámka"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>Zrušit</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Ukládám…' : 'Uložit'}</button>
        </div>
      </div>
    </Modal>
  );
}
