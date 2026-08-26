import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import { ChevronLeft, ChevronRight, Beer as BeerIcon, Factory, CalendarDays } from 'lucide-react';
import { isoWeekKey, weekRange, shiftWeek } from '../components/WeeklyOrderSummaryCard';

import { supabase, Beer, Package, CellarTank, CellarTransfer, CellarTankCycle, EntryRow, useRealtime, beerBorder } from '../lib/supabase';
import { Modal, Field, Spinner } from '../components/ui';
import { TankOccupancyPlanner } from '../components/TankOccupancyPlanner';
import { chyba, oznam, potvrd } from '../lib/toast';

const STATUS_LABELS: Record<CellarTank['status'], string> = {
  empty: 'Prázdný', filling: 'Plní se', active: 'Aktivní', emptying: 'Stáčí se',
  sanitizing: 'Po H2O', rinsing: 'Po Oplachu', cleaning: 'Po Louhu',
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

type OrderRow = { id: string; order_date: string; delivery_date: string | null; status: string };
type OrderItemRow = { order_id: string; beer_id: string | null; package_id: string | null; quantity: number };

function fmtHours(h: number | null | undefined): string {
  if (h == null) return '—';
  if (h < 24) return `${h.toFixed(1)} h`;
  const days = h / 24;
  return `${days.toFixed(1)} dní`;
}

export default function CellarScreen({ setPage, initialSubTab }: { setPage?: (p: any, sec?: string, sub?: string) => void; initialSubTab?: string } = {}) {
  const [activeTab, setActiveTab] = useState<'lezacke' | 'spilka' | 'planovac'>((initialSubTab as any) || 'lezacke');

  useEffect(() => {
    setActiveTab((initialSubTab as any) || 'lezacke');
  }, [initialSubTab]);

  function selectTab(t: 'lezacke' | 'spilka' | 'planovac') {
    if (setPage) setPage('cellar', undefined, t);
    else setActiveTab(t);
  }
  const [tanks, setTanks] = useState<CellarTank[]>([]);
  const [transfers, setTransfers] = useState<CellarTransfer[]>([]);
  const [cycles, setCycles] = useState<CellarTankCycle[]>([]);
  const [kegging, setKegging] = useState<EntryRow[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferFromId, setTransferFromId] = useState('');
  const [transferBeerId, setTransferBeerId] = useState('');
  const [transferVolume, setTransferVolume] = useState('');
  const [showStart, setShowStart] = useState<CellarTank | null>(null);
  const [editTank, setEditTank] = useState<CellarTank | null>(null);

  // Inline úprava piva a objemu přímo na kartě tanku (bez otevírání modalu)
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineBeerId, setInlineBeerId] = useState('');
  const [inlineVolume, setInlineVolume] = useState('');
  const [inlineBusy, setInlineBusy] = useState(false);

  // Objednávky (pro propojení: kolik kegů z aktuálního piva je objednáno)
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [weekKey, setWeekKey] = useState(isoWeekKey(new Date().toISOString().slice(0, 10)));

  async function load(silent = false) {
    if (!silent && !tanks.length) setLoading(true);
    const [t, tr, cy, kg, b, pkg] = await Promise.all([
      supabase.from('cellar_tanks').select('*').order('label'),
      supabase.from('cellar_transfers').select('*').order('transfer_date', { ascending: false }).order('created_at', { ascending: false }).limit(50),
      supabase.from('cellar_tank_cycles').select('*').order('ended_at', { ascending: false }).limit(200),
      supabase.from('kegging').select('id,entry_date,beer_id,beer_name,package_id,package_label,quantity,cellar_tank_id,source_volume_l,loss_l,tank_id,created_at').order('created_at', { ascending: false }),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
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
        capacity_l: targetCap,
        initial_volume_l: tk.initial_volume_l ? targetCap : targetCap,
      };
    });

    setTanks(adjustedTankList);
    setTransfers((tr.data as CellarTransfer[]) ?? []);
    setCycles((cy.data as CellarTankCycle[]) ?? []);
    setKegging((kg.data as EntryRow[]) ?? []);
    setBeers((b.data as Beer[]) ?? []);
    setPackages((pkg.data as Package[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['cellar_tanks', 'cellar_transfers', 'cellar_tank_cycles', 'kegging', 'beers'], () => load(true));

  // Objednávky bez storna — pro propojení s aktuálním pivem v tanku
  async function loadOrders() {
    const { data: ords } = await supabase.from('orders').select('id,order_date,delivery_date,status').neq('status', 'storno');
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

  // Celkový objem v hl (hektolitrech) daného piva, který je objednaný a nestočený pro zvolený týden
  const orderedHlByBeer = useMemo(() => {
    const beerJantar = beers.find(b => b.name.toLowerCase().includes('jantar'));
    const beer12Sv = beers.find(b => b.name.toLowerCase().includes('12° svět') || b.name.toLowerCase().includes('12sv'));
    const beerDark = beers.find(b => b.name.toLowerCase().includes('tmav'));

    const m = new Map<string, number>(); // beer_id -> liters
    const needsBottling = new Set<string>();

    // Filtrujeme objednávky patřící do vybraného týdne — podle data DOVOZU, ne
    // zadání (objednávka zadaná dřív s dovozem v tomto týdnu sem musí patřit).
    // Stornované objednávky se nepočítají — na rozdíl od zbytku appky tu dřív
    // chybělo vyloučení, takže zrušená objednávka zbytečně nafukovala potřebu.
    const activeOrderIds = new Set(
      orders
        .filter((o) => {
          if (o.status === 'storno') return false;
          const target = o.delivery_date || o.order_date;
          return !!target && isoWeekKey(target) === weekKey;
        })
        .map((o) => o.id)
    );

    orderItems.forEach((i) => {
      if (!i.beer_id || !activeOrderIds.has(i.order_id)) return;
      const pkg = packages.find((p) => p.id === i.package_id);
      if (!pkg) return;

      const volL = Number(pkg.volume_l) || 50;
      const liters = Number(i.quantity) * volL;

      if (pkg.kind === 'bottle' && Number(i.quantity) > 0) {
        needsBottling.add(i.beer_id);
      }

      m.set(i.beer_id, (m.get(i.beer_id) ?? 0) + liters);
    });

    // 1) Připočtení 50l za lahve (lahvování) PŘED rozdělením Jantaru
    // "pokud budou potreba stocit lahve tak pridej 50l danyh piva"
    needsBottling.forEach((beerId) => {
      m.set(beerId, (m.get(beerId) ?? 0) + 50);
    });

    // 2) Rozdělení Jantaru (80% do 12sv, 20% do tmavého)
    if (beerJantar) {
      const jantarLiters = m.get(beerJantar.id) ?? 0;
      if (jantarLiters > 0) {
        if (beer12Sv) {
          m.set(beer12Sv.id, (m.get(beer12Sv.id) ?? 0) + jantarLiters * 0.8);
        }
        if (beerDark) {
          m.set(beerDark.id, (m.get(beerDark.id) ?? 0) + jantarLiters * 0.2);
        }
        m.set(beerJantar.id, 0); // Jantar sám se ze sklepa přímo nestáčí (míchá se ze 12sv a tmavého)
      }
    }

    // 3) Zjištění již stočených sudů (kegging) pro vybraný týden
    // "od toho obednano vzdy odecitej stoceny sudy ten tyden, vzdy at je to na tyden objednavky vs staceni keg"
    const keggedLitersByBeer = new Map<string, number>();
    kegging.forEach((r) => {
      if (!r.beer_id || !r.entry_date || isoWeekKey(r.entry_date) !== weekKey) return;
      const sizeMatch = (r.package_label ?? '').match(/(\d+(?:[.,]\d+)?)\s*l/i);
      const size = sizeMatch ? Number(sizeMatch[1].replace(',', '.')) : 0;
      const vol = size > 0 ? size : 50; // fallback 50l
      const liters = Number(r.quantity ?? 0) * vol;
      keggedLitersByBeer.set(r.beer_id, (keggedLitersByBeer.get(r.beer_id) ?? 0) + liters);
    });

    // Rozdělení stáčení Jantaru (kegging) do 12sv a tmavého
    if (beerJantar) {
      const jantarKegged = keggedLitersByBeer.get(beerJantar.id) ?? 0;
      if (jantarKegged > 0) {
        if (beer12Sv) {
          keggedLitersByBeer.set(beer12Sv.id, (keggedLitersByBeer.get(beer12Sv.id) ?? 0) + jantarKegged * 0.8);
        }
        if (beerDark) {
          keggedLitersByBeer.set(beerDark.id, (keggedLitersByBeer.get(beerDark.id) ?? 0) + jantarKegged * 0.2);
        }
        keggedLitersByBeer.set(beerJantar.id, 0);
      }
    }

    // 4) Převod na hektolitry a odečtení stočeného piva (objem nemůže být záporný, minimum je 0 hl)
    const hlMap = new Map<string, number>();
    m.forEach((orderedLiters, beerId) => {
      const keggedLiters = keggedLitersByBeer.get(beerId) ?? 0;
      const remainingLiters = Math.max(0, orderedLiters - keggedLiters);
      hlMap.set(beerId, remainingLiters / 100);
    });

    return hlMap;
  }, [orderItems, orders, packages, weekKey, kegging, beers]);

  // Souhrn stáčení z tanku (kegging) — jen pro AKTUÁLNÍ (nedokončený) cyklus
  // daného tanku, ne kumulativně napříč všemi cykly, co kdy z tabulky kegging
  // přes daný cellar_tank_id prošly. Bez tohohle omezení se po opakovaném
  // použití tanku (nový cyklus, nové pivo) sčítalo stočené i ze VŠECH
  // předchozích cyklů — % vystočeno šplhalo přes 100 % a ztráta při
  // ukončení tanku vycházela vždy jako 0 (initialVol - kumulativníKeggedL
  // ořízlé Math.max na 0).
  const cycleStartByTank = useMemo(() => {
    const m = new Map<string, string>();
    tanks.forEach((t) => {
      if (t.started_at) m.set(t.id, t.started_at.slice(0, 10));
    });
    return m;
  }, [tanks]);
  const tankSummary = useMemo(() => {
    const m = new Map<string, { kegCount: number; sourceL: number; lossL: number; bySize: Record<number, number> }>();
    kegging.forEach((r) => {
      const id = r.cellar_tank_id ?? '_none';
      const cycleStart = cycleStartByTank.get(id);
      if (cycleStart && r.entry_date < cycleStart) return; // patří k předchozímu cyklu tanku
      if (!m.has(id)) m.set(id, { kegCount: 0, sourceL: 0, lossL: 0, bySize: {} });
      const s = m.get(id)!;
      s.kegCount += Number(r.quantity ?? 0);
      s.sourceL += Number(r.source_volume_l ?? 0);
      s.lossL += Number(r.loss_l ?? 0);
      const sizeMatch = (r.package_label ?? '').match(/(\d+(?:[.,]\d+)?)\s*l/i);
      const size = sizeMatch ? Number(sizeMatch[1].replace(',', '.')) : 0;
      if (size > 0) s.bySize[size] = (s.bySize[size] ?? 0) + Number(r.quantity ?? 0);
    });
    return m;
  }, [kegging, cycleStartByTank]);

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

  async function clearTank(t: CellarTank) {
    if (!potvrd(`Vyprázdnit ${t.label} (nastavit objem na 0 a stav na prázdný)?`)) return;
    await supabase.from('cellar_tanks').update({
      current_volume_l: 0, current_beer_id: null, current_beer_name: null, status: 'empty',
      started_at: null, initial_volume_l: null,
      kegging_active: false, kegging_ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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

    if (!potvrd(`Ukončit ${t.label}?\n\nStočeno: ${(keggedL / 100).toFixed(2)} hl\nZtráta (auto): ${lossL.toFixed(1)} l (${lossPct.toFixed(1)}%)\nDoba: ${durationHours != null ? fmtHours(durationHours) : '—'}\n\nTank přejde do stavu Sanitace.`)) return;

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
      kegging_active: false,
      kegging_ended_at: endedAt.toISOString(),
      updated_at: endedAt.toISOString(),
    }).eq('id', t.id);
    load();
  }

  const { profile, user } = useAuth();
  const userName = profile?.display_name || user?.email?.split('@')[0] || 'Obsluha';

  const getCurrentTimeStr = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const [sanitationModalTank, setSanitationModalTank] = useState<CellarTank | null>(null);
  const [sanitationMethod, setSanitationMethod] = useState<'louh' | 'kyselina_dusicna' | 'oplach_vodou' | 'persteril' | 'kombinovana'>('louh');
  const [sanitationTime, setSanitationTime] = useState(getCurrentTimeStr);
  const [sanitationDuration, setSanitationDuration] = useState<number | ''>(20);
  const [sanitationNote, setSanitationNote] = useState('');
  const [sanitationConcentration, setSanitationConcentration] = useState<number | ''>('');
  const [sanitationBusy, setSanitationBusy] = useState(false);

  const DEFAULT_CONCENTRATION: Record<string, number | null> = {
    louh: 2, kyselina_dusicna: 2, kombinovana: 2, oplach_vodou: null, persteril: 0.5,
  };
  // Výchozí doba trvání podle metody — oplach vodou je kratší krok než chemická sanitace.
  const DEFAULT_DURATION: Record<string, number> = {
    oplach_vodou: 10, louh: 20, kyselina_dusicna: 20, kombinovana: 20, persteril: 15,
  };

  async function recordSanitation(methodToSave: 'louh' | 'kyselina_dusicna' | 'oplach_vodou' | 'persteril' | 'kombinovana', targetTank: CellarTank, customNote?: string, concentrationPct?: number | '', durationMinutes?: number | '') {
    const labels: Record<string, string> = {
      louh: 'Louh (NaOH)',
      kyselina_dusicna: 'Kyselina dusičná',
      oplach_vodou: 'Oplach vodou',
      persteril: 'Persteril',
      kombinovana: 'Kombinovaná sanitace',
    };
    const effectiveDuration = durationMinutes !== undefined
      ? (durationMinutes !== '' ? Number(durationMinutes) : DEFAULT_DURATION[methodToSave])
      : (sanitationDuration !== '' ? Number(sanitationDuration) : DEFAULT_DURATION[methodToSave]);
    const logItem = {
      sanitation_date: new Date().toISOString().slice(0, 10),
      sanitation_time: sanitationTime || getCurrentTimeStr(),
      duration_minutes: effectiveDuration,
      tank_id: targetTank.id,
      tank_label: targetTank.label,
      method: methodToSave,
      method_label: labels[methodToSave] ?? methodToSave,
      concentration_pct: concentrationPct !== undefined && concentrationPct !== '' ? Number(concentrationPct) : DEFAULT_CONCENTRATION[methodToSave],
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

  // Inline uložení piva a počátečního objemu přímo z karty tanku
  async function saveInlineTank(t: CellarTank) {
    if (!inlineBeerId) { oznam('Vyber pivo.'); return; }
    const v = Number(inlineVolume);
    if (!v || v <= 0) { oznam('Zadej počáteční objem v litrech.'); return; }
    setInlineBusy(true);
    const beer = beers.find((b) => b.id === inlineBeerId);
    const now = new Date();
    await supabase.from('cellar_tanks').update({
      current_beer_id: inlineBeerId,
      current_beer_name: beer?.name ?? null,
      current_volume_l: v,
      initial_volume_l: v,
      started_at: t.started_at ?? now.toISOString(),
      status: 'active',
      kegging_date: now.toISOString().slice(0, 10),
      updated_at: now.toISOString(),
    }).eq('id', t.id);
    await supabase.from('cellar_transfers').insert({
      transfer_date: now.toISOString().slice(0, 10),
      to_tank_id: t.id,
      beer_id: inlineBeerId,
      beer_name: beer?.name ?? null,
      volume_l: v,
      loss_l: 0,
      note: 'Nastavení piva a objemu z karty tanku',
    });
    setInlineBusy(false);
    setInlineEditId(null);
    load();
  }

  // Zahájit stáčení z tanku — vypne stáčení na všech ostatních tancích se stejným pivem
  async function startKegging(t: CellarTank) {
    if (!t.current_beer_id) { oznam('Tank nemá přiřazené pivo — nejprve nastav pivo.'); return; }
    const now = new Date().toISOString();
    try {
      // Vypnout stáčení na ostatních tancích se stejným pivem (aby byl vždy jen jeden aktivní zdroj)
      const others = tanks.filter((x) => x.id !== t.id && x.current_beer_id === t.current_beer_id);
      if (others.length > 0) {
        const { error: errOthers } = await supabase.from('cellar_tanks')
          .update({ kegging_active: false, kegging_ended_at: now, updated_at: now })
          .in('id', others.map((x) => x.id));
        if (errOthers) throw errOthers;
      }
      // Zapnout stáčení na tomto tanku
      const { error } = await supabase.from('cellar_tanks').update({
        kegging_active: true,
        kegging_started_at: now,
        kegging_ended_at: null,
        updated_at: now,
      }).eq('id', t.id);
      if (error) throw error;
      load();
    } catch (e: any) {
      chyba(`Chyba při zahájení stáčení: ${e?.message ?? e}`);
    }
  }

  // Ukončit stáčení z tanku
  async function stopKegging(t: CellarTank) {
    const now = new Date().toISOString();
    try {
      const { error } = await supabase.from('cellar_tanks').update({
        kegging_active: false,
        kegging_ended_at: now,
        updated_at: now,
      }).eq('id', t.id);
      if (error) throw error;
      load();
    } catch (e: any) {
      chyba(`Chyba při ukončení stáčení: ${e?.message ?? e}`);
    }
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

        <div className="sticky top-0 z-20 bg-neutral-100 py-1 flex flex-wrap items-center gap-2 w-full">
          {/* Tab Selector: Ležácké vs Spilka vs Plánovač — přilepený nahoře. */}
          <div className="flex items-center gap-1.5 p-1 rounded w-full sm:w-fit overflow-x-auto scrollbar-none flex-nowrap shrink-0">
            <button
              type="button"
              onClick={() => selectTab('lezacke')}
              className={`px-3.5 py-2 rounded text-xs font-black transition shrink-0 min-h-[44px] ${
                activeTab === 'lezacke' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><BeerIcon size={14} /> Ležácké tanky (1–8)</span>
            </button>
            <button
              type="button"
              onClick={() => selectTab('spilka')}
              className={`px-3.5 py-2 rounded text-xs font-black transition shrink-0 min-h-[44px] ${
                activeTab === 'spilka' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><Factory size={14} /> Spilka (3 kvasné tanky)</span>
            </button>
            <button
              type="button"
              onClick={() => selectTab('planovac')}
              className={`px-3.5 py-2 rounded text-xs font-black transition shrink-0 min-h-[44px] ${
                activeTab === 'planovac' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> Plánovač obsazenosti & Zrání (Gantt)</span>
            </button>
          </div>

          {/* Týdenní selector pro výpočet objednávek */}
          <div className="flex items-center gap-1 bg-white p-1 rounded border border-neutral-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setWeekKey(shiftWeek(weekKey, -1))}
              className="p-1.5 rounded text-neutral-500 hover:bg-neutral-100"
              title="Předchozí týden"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="px-2 text-xs font-bold text-amber-800 text-center min-w-[90px]">
              Týden {weekKey.split('-')[1]}
              <div className="text-[10px] text-neutral-500 font-normal">
                ({weekRange(weekKey).label})
              </div>
            </div>
            <button
              type="button"
              onClick={() => setWeekKey(shiftWeek(weekKey, 1))}
              className="p-1.5 rounded text-neutral-500 hover:bg-neutral-100"
              title="Následující týden"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button className="btn-primary !rounded" onClick={() => setShowTransfer(true)}>⇄ Přetáčení (Přefuk ze Spilky)</button>
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
              // Aktuální objem v tanku — snižuje se při stáčení keg (Kegging.tsx odečítá z current_volume_l).
              // Fallback: pokud tank je aktivní/plní se a current_volume_l je 0, ale ještě se nic nestočilo,
              // použijeme počáteční objem (tank ještě nebyl stáčen, current_volume_l nebyl nastaven).
              const currentVol = Number(t.current_volume_l ?? 0);
              const remaining = currentVol > 0 || s.sourceL > 0
                ? Math.max(currentVol, 0)
                : Math.max(initialVol, 0);
              const pct = initialVol > 0 ? Math.min((s.sourceL / initialVol) * 100, 100) : 0;
              // Tank bez piva (prázdný nebo ve fázi sanitace) — grafika ukazuje 0 %
              const isEmpty = t.status === 'empty' || t.status === 'sanitizing' || t.status === 'rinsing' || t.status === 'cleaning';
              const sizeKeys = Object.keys(s.bySize).map(Number).sort((a, b) => b - a);
              const isLow = t.status === 'active' && remaining > 0 && remaining < LOW_VOLUME_THRESHOLD;
              const orderedHlForBeer = t.current_beer_id ? (orderedHlByBeer.get(t.current_beer_id) ?? 0) : 0;
              const recentCycles = (cyclesByTank.get(t.id) ?? []).slice(0, 3);

              return (
                <div key={t.id} className={`card border-2 p-4 flex flex-col ${isLow ? 'ring-2 ring-warning-400' : ''}`}
                  style={{
                    borderColor: beerBorder(t.current_beer_name ? beers.find((b) => b.name === t.current_beer_name) : null),
                  }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-display font-bold text-lg text-primary-900">{t.label}</div>
                      <div className="text-xs text-primary-500">Kapacita {t.capacity_l.toLocaleString('cs-CZ')} l</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`chip text-[10px] ${STATUS_COLORS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                      {t.kegging_active && (
                        <span className="chip text-[10px] bg-amber-100 text-amber-800 border border-amber-300">🛢️ Stáčení aktivní</span>
                      )}
                    </div>
                  </div>

                  {/* Fáze sanitace tanku — zvýraznění aktuálního kroku */}
                  {t.status === 'sanitizing' && (
                    <div className="mt-2 text-xs font-bold text-danger-700 bg-danger-50 rounded px-2.5 py-1.5 flex items-center gap-1.5 animate-pulse border border-danger-200">
                      ⚠️ Po uzavření tanku — MUSÍ SE OPLÁCHNOUT
                    </div>
                  )}
                  {t.status === 'rinsing' && (
                    <div className="mt-2 text-xs font-bold text-sky-800 bg-sky-50 rounded px-2.5 py-1.5 flex items-center gap-1.5 border border-sky-200">
                      💧 Po oplachu — další krok: <span className="underline">Louh (NaOH)</span>
                    </div>
                  )}
                  {t.status === 'cleaning' && (
                    <div className="mt-2 text-xs font-bold text-amber-800 bg-amber-50 rounded px-2.5 py-1.5 flex items-center gap-1.5 border border-amber-200">
                      🧼 Po louhu — další krok: <span className="underline">Kyselina dusičná</span>
                    </div>
                  )}

                  {/* Pivo + počáteční objem + zbývající objem (HL) — s možností přímé editace */}
                  {inlineEditId === t.id ? (
                    <div className="mt-2 space-y-2">
                      <div>
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-primary-400 mb-1">Pivo</div>
                        <select className="input" value={inlineBeerId} onChange={(e) => setInlineBeerId(e.target.value)}>
                          <option value="">— vyber pivo —</option>
                          {beers.map((b) => <option key={b.id} value={b.id}>{b.name}{b.degree ? ` (${b.degree})` : ''}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-primary-400 mb-1">Počáteční objem (l)</div>
                        <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" className="input" value={inlineVolume} onChange={(e) => setInlineVolume(e.target.value)} placeholder={`např. ${t.capacity_l}`} />
                      </div>
                      <div className="flex gap-1.5">
                        <button className="text-xs px-2.5 py-1 rounded bg-success-600 text-white font-bold hover:bg-success-500 disabled:opacity-50" disabled={inlineBusy} onClick={() => saveInlineTank(t)}>
                          {inlineBusy ? 'Ukládám…' : '💾 Uložit pivo'}
                        </button>
                        <button className="text-xs px-2.5 py-1 rounded bg-neutral-200 text-neutral-700 hover:bg-neutral-300 font-medium" onClick={() => setInlineEditId(null)}>Zrušit</button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-sm text-primary-700 min-w-0">
                        {t.current_beer_name ? <span className="font-semibold">{t.current_beer_name}</span> : <span className="text-primary-400">— prázdno —</span>}
                        {t.current_beer_name && (
                          <div className="text-[11px] text-primary-500 mt-0.5">
                            Počáteční objem: <span className="font-semibold text-primary-700">{(initialVol / 100).toFixed(2)} hl</span>
                            {' · '}Zbývá: <span className={`font-semibold ${remaining <= 0 ? 'text-danger-600' : 'text-success-700'}`}>{(remaining / 100).toFixed(2)} hl</span>
                          </div>
                        )}
                        {t.kegging_active && t.kegging_started_at && (
                          <div className="text-[11px] text-amber-700 mt-0.5">
                            🛢️ Stáčí se od {new Date(t.kegging_started_at).toLocaleDateString('cs-CZ')} {new Date(t.kegging_started_at).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                      <button
                        className="text-[11px] px-2 py-1 rounded bg-primary-100 text-primary-800 hover:bg-primary-200 font-bold shrink-0"
                        onClick={() => {
                          setInlineEditId(t.id);
                          setInlineBeerId(t.current_beer_id ?? '');
                          setInlineVolume(String(t.initial_volume_l ?? t.capacity_l));
                        }}
                      >
                        {t.current_beer_name ? '✏️ Změnit pivo' : '🍺 Nastavit pivo'}
                      </button>
                    </div>
                  )}

                  {t.started_at && (
                    <div className="mt-1.5 text-xs text-primary-600 flex items-center gap-1.5">
                      <span>🗓️</span><span>Spuštěno: {new Date(t.started_at).toLocaleDateString('cs-CZ')}</span>
                    </div>
                  )}

                  {isLow && (
                    <div className="mt-2 text-xs font-semibold text-warning-700 bg-warning-50 rounded px-2.5 py-1.5 flex items-center gap-1.5 animate-pulse">
                      ⚠️ Blíží se konec — zbývá {remaining.toFixed(0)} l
                    </div>
                  )}

                  {orderedHlForBeer > 0 && t.status === 'active' && (() => {
                    const remainingHl = remaining / 100;
                    const isDeficit = orderedHlForBeer > remainingHl;
                    const missingHl = orderedHlForBeer - remainingHl;
                    return isDeficit ? (
                      <div className="mt-2 text-xs text-rose-700 bg-rose-50 rounded px-2.5 py-1.5 font-bold border border-rose-200">
                        ⚠️ Objednáno {orderedHlForBeer.toFixed(1)} hl (v tanku chybí {missingHl.toFixed(1)} hl, nutno stočit z jiného tanku)
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-accent-700 bg-accent-50 rounded px-2.5 py-1.5 font-bold">
                        📋 Objednáno {orderedHlForBeer.toFixed(1)} hl tohoto piva (nestočeno)
                      </div>
                    );
                  })()}

                  {/* Grafické znázornění nerezového ležáckého tanku */}
                  <div className="my-3 p-3 bg-slate-900/90 rounded border border-slate-800 text-white flex items-center gap-4 shadow-inner">
                    {/* SVG 3D Tank Cylindrical Graphic */}
                    <div className="relative w-14 h-24 shrink-0 flex items-center justify-center">
                      <svg viewBox="0 0 60 100" className="w-full h-full drop-shadow-md">
                        {/* Outer Tank Steel Shell */}
                        <path d="M 10 20 C 10 5, 50 5, 50 20 L 50 80 L 30 95 L 10 80 Z" fill={remaining === 0 || isEmpty ? '#1e293b' : '#334155'} stroke="#94a3b8" strokeWidth="2.5" />
                        {/* Top Cap Curved Lines */}
                        <path d="M 10 20 C 10 10, 50 10, 50 20" fill="none" stroke="#64748b" strokeWidth="1.5" />
                        
                        {/* Beer Liquid Level Clip Area (Pokud zbývá 0 l nebo je tank prázdný, zůstane vnitřek průhledný / bílo-šedý) */}
                        {remaining > 0 && !isEmpty && (() => {
                          const liquidPct = Math.min(1, Math.max(0, remaining / initialVol));
                          const fillH = liquidPct * 65;
                          const fillY = 80 - fillH;
                          // Barva piva podle typu — tmavé = hnědá, světlé = jantarová
                          const isDark = t.current_beer_name?.toLowerCase().includes('tmav');
                          const baseColor = isDark ? '#78350f' : '#f59e0b';
                          // Intenzita barvy podle procenta naplnění — čím méně piva, tím světlejší
                          const intensity = 0.35 + liquidPct * 0.6; // 0.35 (málo) až 0.95 (plný)
                          return (
                            <g clipPath={`url(#tank-clip-${t.id})`}>
                              <rect
                                x="12"
                                y={fillY}
                                width="36"
                                height={fillH}
                                fill={baseColor}
                                opacity={intensity}
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
                      <span className={`absolute text-[10px] font-black font-mono px-1.5 py-0.5 rounded border ${remaining === 0 || isEmpty ? 'bg-slate-800 text-slate-300 border-slate-600' : 'bg-slate-950/90 text-amber-300 border-slate-700'}`}>
                        {isEmpty ? '0%' : `${Math.round((remaining / initialVol) * 100)}%`}
                      </span>
                    </div>

                    {/* Right details panel inside tank graphic */}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-medium">Stav náplně:</span>
                        <span className={`font-bold font-mono ${remaining === 0 || isEmpty ? 'text-slate-300' : 'text-amber-400'}`}>
                          {isEmpty ? '0 %' : `${Math.round((remaining / initialVol) * 100)} %`}
                          <span className="ml-1 text-slate-400">· {isEmpty ? '0 hl' : `${(remaining / 100).toFixed(2)} hl`}</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isEmpty ? 'bg-slate-600' : isLow ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: isEmpty ? '0%' : `${Math.max(Math.round((remaining / initialVol) * 100), 2)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-300 font-medium pt-0.5">
                        <span>Výstav {t.current_beer_name ? `${(initialVol / 100).toFixed(1)} hl` : `z ${t.capacity_l.toLocaleString('cs-CZ')} l`}</span>
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

                  {/* Hlavní akce — velké, snadno klepnutelné (stáčení, spuštění/ukončení tanku) */}
                  <div className="mt-3 space-y-2">
                    {(t.status === 'active' || t.status === 'emptying' || t.status === 'filling') && t.current_beer_id && (
                      t.kegging_active ? (
                        <button
                          className="w-full min-h-[48px] text-sm px-3 py-3 rounded bg-rose-600 text-white hover:bg-rose-500 font-black border border-rose-700 shadow-md flex items-center justify-center gap-2 transition-all"
                          onClick={() => stopKegging(t)}
                          title="Zastaví odebírání piva z tohoto tanku při stáčení keg"
                        >
                          <span>⏹</span>
                          <span>Ukončit stáčení</span>
                        </button>
                      ) : (
                        <button
                          className="w-full min-h-[48px] text-sm px-3 py-3 rounded bg-emerald-600 text-white hover:bg-emerald-500 font-black border border-emerald-700 shadow-md flex items-center justify-center gap-2 transition-all"
                          onClick={() => startKegging(t)}
                          title="Aktivuje tento tank jako zdroj pro stáčení keg — pivo se bude odebírat z něj"
                        >
                          <span>▶️</span>
                          <span>Zahájit stáčení</span>
                        </button>
                      )
                    )}

                    {t.status === 'empty' && (
                      <button className="w-full min-h-[48px] text-sm px-3 py-3 rounded bg-success-600 text-white hover:bg-success-500 font-black shadow-md flex items-center justify-center gap-2" onClick={() => setShowStart(t)}>
                        <span>🚀</span><span>Spustit tank</span>
                      </button>
                    )}
                    {(t.status === 'active' || t.status === 'emptying' || t.status === 'filling') && (
                      <button className="w-full min-h-[48px] text-sm px-3 py-3 rounded bg-danger-600 text-white hover:bg-danger-500 font-black shadow-md flex items-center justify-center gap-2" onClick={() => endTank(t)}>
                        <span>✓</span><span>Zavřít tank</span>
                      </button>
                    )}

                    {/* Sanitace tanku — postup: oplach → louh → kyselina */}
                    <div className="pt-1">
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400 mb-1">🧼 Sanitace tanku</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          className="min-h-[44px] text-xs px-1.5 py-2 rounded bg-sky-100 text-sky-900 font-bold hover:bg-sky-200 shadow-xs border border-sky-300 flex flex-col items-center justify-center gap-0.5"
                          onClick={async () => {
                            await recordSanitation('oplach_vodou', t, 'Rychlý oplach vodou z karty tanku', undefined, 10);
                            await supabase.from('cellar_tanks').update({ status: 'rinsing', updated_at: new Date().toISOString() }).eq('id', t.id);
                            load();
                            oznam(`💧 Oplach vodou pro ${t.label} byl zapsán (Provedl: ${userName})`);
                          }}
                        >
                          <span className="text-base leading-none">💧</span>
                          <span>Oplach</span>
                        </button>
                        <button
                          className="min-h-[44px] text-xs px-1.5 py-2 rounded bg-amber-100 text-amber-950 font-bold hover:bg-amber-200 shadow-xs border border-amber-300 flex flex-col items-center justify-center gap-0.5"
                          onClick={async () => {
                            await recordSanitation('louh', t, 'Sanitace louhem NaOH z karty tanku', 2, 20);
                            await supabase.from('cellar_tanks').update({ status: 'cleaning', updated_at: new Date().toISOString() }).eq('id', t.id);
                            load();
                            oznam(`🧼 Sanitace louhem pro ${t.label} byla zapsána (Provedl: ${userName})`);
                          }}
                        >
                          <span className="text-base leading-none">🧼</span>
                          <span>Louh</span>
                        </button>
                        <button
                          className="min-h-[44px] text-xs px-1.5 py-2 rounded bg-rose-100 text-rose-950 font-bold hover:bg-rose-200 shadow-xs border border-rose-300 flex flex-col items-center justify-center gap-0.5"
                          onClick={async () => {
                            // Tohle tlačítko kromě zápisu sanitace tank i VYPRÁZDNÍ
                            // (zahodí pivo, počáteční objem i začátek cyklu). Sousedí
                            // s Oplachem a Louhem, které tank nemažou — bez potvrzení
                            // stačilo jedno chybné klepnutí a data byla nenávratně pryč.
                            const varovani = t.current_beer_name
                              ? `\n\nPOZOR: tank ${t.label} se tím vyprázdní — zmizí přiřazené pivo (${t.current_beer_name}), počáteční objem i začátek cyklu. Nejde to vrátit zpět.`
                              : `\n\nTank ${t.label} se tím označí jako prázdný.`;
                            if (!(await potvrd(`Zapsat sanitaci kyselinou dusičnou?${varovani}`))) return;
                            await recordSanitation('kyselina_dusicna', t, 'Sanitace kyselinou dusičnou z karty tanku', 2, 20);
                            const { error } = await supabase.from('cellar_tanks').update({
                              status: 'empty', current_beer_id: null, current_beer_name: null,
                              started_at: null, initial_volume_l: null, updated_at: new Date().toISOString(),
                            }).eq('id', t.id);
                            if (error) {
                              chyba(`⚠️ Sanitace se zapsala, ale vyprázdnění tanku selhalo: ${error.message}`);
                              return;
                            }
                            load();
                            oznam(`🧪 Kyselina dusičná pro ${t.label} byla zapsána (Provedl: ${userName})`);
                          }}
                        >
                          <span className="text-base leading-none">🧪</span>
                          <span>Kyselina</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        className="mt-1.5 w-full min-h-[40px] text-xs px-3 py-2 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold border border-neutral-200 flex items-center justify-center gap-1.5"
                        onClick={() => {
                          setSanitationMethod('louh');
                          setSanitationTime(getCurrentTimeStr());
                          setSanitationDuration(20);
                          setSanitationNote('');
                          setSanitationConcentration('');
                          setSanitationModalTank(t);
                        }}
                        title="Zvolit metodu, čas, dobu trvání a poznámku ručně"
                      >
                        📝 Podrobný zápis sanitace (čas, doba, chemie)
                      </button>
                    </div>

                    {/* Vedlejší akce */}
                    <div className="pt-1 flex flex-wrap gap-1.5">
                      <button className="min-h-[40px] text-xs px-3 py-2 rounded bg-neutral-200/80 text-neutral-800 hover:bg-neutral-300 font-medium" onClick={() => setEditTank(t)}>Upravit</button>
                      {t.label.toLowerCase().includes('spilka') && (t.status === 'active' || t.status === 'filling' || Number(t.current_volume_l) > 0) && (
                        <button
                          className="min-h-[40px] text-xs px-3 py-2 rounded bg-sky-600 text-white font-black hover:bg-sky-500 shadow-xs flex items-center gap-1"
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
                    </div>
                  </div>
                </div>
              );
            })}
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

            <div className="grid grid-cols-2 gap-3">
              <Field label="Čas sanitace">
                <input type="time" className="input w-full font-bold" value={sanitationTime} onChange={(e) => setSanitationTime(e.target.value)} />
              </Field>
              <Field label="Doba trvání (minut)">
                <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} min={1} max={600} className="input w-full font-bold" value={sanitationDuration} onChange={(e) => setSanitationDuration(e.target.value === '' ? '' : Number(e.target.value))} />
              </Field>
            </div>

            <Field label="Koncentrace chemie (%) — nepovinné, jinak výchozí dle metody">
              <input
                type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" min={0} max={100}
                className="input w-full font-bold"
                placeholder={DEFAULT_CONCENTRATION[sanitationMethod] != null ? `výchozí ${DEFAULT_CONCENTRATION[sanitationMethod]} %` : 'bez chemie'}
                value={sanitationConcentration}
                onChange={(e) => setSanitationConcentration(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </Field>

            <Field label="Poznámka / Detaily (nepovinné)">
              <input type="text" className="input w-full" placeholder="např. Oplach na pH 7.0 chráněn" value={sanitationNote} onChange={(e) => setSanitationNote(e.target.value)} />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost !rounded" onClick={() => setSanitationModalTank(null)}>Zrušit</button>
              <button
                className="btn-primary !rounded font-black"
                disabled={sanitationBusy}
                onClick={async () => {
                  setSanitationBusy(true);
                  await recordSanitation(sanitationMethod, sanitationModalTank, sanitationNote, sanitationConcentration);
                  setSanitationBusy(false);
                  setSanitationModalTank(null);
                  setSanitationNote('');
                  setSanitationConcentration('');
                  oznam(`✅ Sanitace (${sanitationModalTank.label}) byla zapsána do Sanitačního deníku!`);
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
          <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" className="input" value={volume} onChange={(e) => setVolume(e.target.value)} />
        </Field>
        <Field label="Poznámka"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="poznámka" /></Field>
        {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded px-3 py-2">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost !rounded" onClick={onClose}>Zrušit</button>
          <button className="btn-primary !rounded" disabled={busy} onClick={save}>{busy ? 'Ukládám…' : '🚀 Spustit'}</button>
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
    const lossV = Number(loss) || 0;
    if (lossV < 0 || lossV > v) { setErr(`Ztráta musí být mezi 0 a ${v} l (přelévaný objem).`); return; }
    if (toId) {
      const toTank = tanks.find((t) => t.id === toId);
      const toNewVolCheck = Number(toTank?.current_volume_l ?? 0) + (v - lossV);
      if (toTank?.capacity_l && toNewVolCheck > toTank.capacity_l) {
        setErr(`Tank ${toTank.label} má kapacitu jen ${toTank.capacity_l} l (po přelití by měl ${toNewVolCheck} l).`);
        return;
      }
    }
    setBusy(true);
    const beer = beers.find((b) => b.id === beerId);
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
      // Počáteční objem cyklu zachováme, pokud už tank cyklus má; jinak nastavíme nový (začátek nového cyklu)
      const toInitialVol = toTank?.initial_volume_l ?? toNewVol;
      await supabase.from('cellar_tanks').update({
        current_volume_l: toNewVol,
        current_beer_id: beerId || (fromTank?.current_beer_id ?? null),
        current_beer_name: beer?.name ?? fromTank?.current_beer_name ?? null,
        status: 'filling',
        started_at: toTank?.started_at ?? new Date().toISOString(),
        initial_volume_l: toInitialVol,
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
          <Field label="Objem (l)"><input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" className="input" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder="např. 500" /></Field>
          <Field label="Ztráta (l)"><input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" className="input" value={loss} onChange={(e) => setLoss(e.target.value)} placeholder="např. 2" /></Field>
        </div>
        <Field label="Poznámka"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="poznámka" /></Field>
        {err && <div className="text-sm text-danger-600 bg-danger-500/10 rounded px-3 py-2">{err}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost !rounded" onClick={onClose}>Zrušit</button>
          <button className="btn-primary !rounded" disabled={busy} onClick={save}>{busy ? 'Ukládám…' : 'Uložit'}</button>
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
          <Field label="Kapacita (l)"><input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" className="input" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Aktuální objem (l)"><input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" className="input" value={volume} onChange={(e) => setVolume(e.target.value)} /></Field>
          <Field label="Počáteční objem cyklu (l)"><input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} step="0.1" className="input" value={initialVolume} onChange={(e) => setInitialVolume(e.target.value)} /></Field>
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
          <button className="btn-ghost !rounded" onClick={onClose}>Zrušit</button>
          <button className="btn-primary !rounded" disabled={busy} onClick={save}>{busy ? 'Ukládám…' : 'Uložit'}</button>
        </div>
      </div>
    </Modal>
  );
}
