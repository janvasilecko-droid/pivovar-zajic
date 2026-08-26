// 📝 Zadávání stáčení lahví — admin sekce v Nastavení.
// ---------------------------------------------------------------------------
// Přehled potřeby stáčení pro zvolený týden:
//   • 🍾 lahve na skladě / 🛢️ sudy na skladě (měsíční model inventury)
//   • 🛒 objednávky týdne + 📦 odhad fašování
//   • ⚠️ „chybí stočit“  a  📅 „na konci týdne“
// Tlačítko „🍾 Stočit“ otevře menu, kde se nastaví datum, velikosti obalů
// (až 3) + počet KEG sudů a poznámka. Úkol se uloží do bottling_plans a
// automaticky se propíše do formuláře stáčení (Lahve) — stáčeč ho tam vidí
// jako „Úkoly ke stočení“ a jediným klikem „Naplnit“ doplní jen počty lahví.
import { useEffect, useMemo, useState } from 'react';
import { supabase, useRealtime, Beer, Package, beerBg, fetchAllRows } from '../lib/supabase';
import { isoWeekKey, weekRange, shiftWeek } from './WeeklyOrderSummaryCard';
import { computeBottlingNeeds, NeedsRow } from '../lib/bottlingNeeds';
import {
  BottlingPlan,
  BottlingPlanInput,
  saveBottlingPlan,
  updateBottlingPlan,
  deleteBottlingPlan,
  setPlanStatus,
  planLines,
} from '../lib/bottlingPlans';
import { Modal } from './ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { chyba, potvrd } from '../lib/toast';

// Povolené velikosti lahví v dropdownu (shodné se zápisem stáčení)
const ALLOWED_BOTTLE_VOLUMES = [1.5, 1, 0.5, 0.33];
// Velikosti KEG sudů
const KEG_SIZES = [50, 30, 20, 15, 10];

const STATUS_CHIP: Record<string, string> = {
  planned: 'bg-amber-100 text-amber-900 border-amber-300',
  done: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  cancelled: 'bg-neutral-100 text-neutral-500 border-neutral-300',
};

const STATUS_TEXT: Record<string, string> = {
  planned: '⏳ Naplánováno',
  done: '✓ Hotovo',
  cancelled: '✕ Zrušeno',
};

type StocitForm = {
  plannedDate: string;
  beerId: string;
  pkgId: string;
  qty: string;
  pkg2Id: string;
  qty2: string;
  pkg3Id: string;
  qty3: string;
  kegPkgId: string;
  kegQty: string;
  note: string;
};

function defaultForm(dateStr: string): StocitForm {
  return {
    plannedDate: dateStr,
    beerId: '',
    pkgId: '',
    qty: '',
    pkg2Id: '',
    qty2: '',
    pkg3Id: '',
    qty3: '',
    kegPkgId: '',
    kegQty: '',
    note: '',
  };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('cs-CZ');
}

export function BottlingTasksSettings() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [weekKey, setWeekKey] = useState(() => isoWeekKey(todayStr));
  const weekLabel = weekRange(weekKey).label;
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [plans, setPlans] = useState<BottlingPlan[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [inventoryRows, setInventoryRows] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [keggingRows, setKeggingRows] = useState<any[]>([]);
  const [fasovaniRows, setFasovaniRows] = useState<any[]>([]);
  const [prodejnaRows, setProdejnaRows] = useState<any[]>([]);
  const [writeoffsRows, setWriteoffsRows] = useState<any[]>([]);
  const [zavozDeductionRows, setZavozDeductionRows] = useState<any[]>([]);
  const [akceRows, setAkceRows] = useState<any[]>([]);
  // Přefuk a dorovnání inventury — bez nich plán lahví ukazoval jiná čísla než Sklad.
  const [prefukRows, setPrefukRows] = useState<any[]>([]);
  const [adjustmentRows, setAdjustmentRows] = useState<any[]>([]);

  async function load() {
    const [b, p, pl, ords, oi, inv, bt, kg, fa, fp, wo, zd, ak, pf, adj] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('bottling_plans').select('*').order('planned_date'),
      fetchAllRows('orders', 'id,order_date,delivery_date,status,is_delivered'),
      fetchAllRows('order_items', 'id,order_id,beer_id,package_id,quantity'),
      fetchAllRows('inventory', 'entry_date,beer_id,package_id,quantity,note'),
      fetchAllRows('bottling', 'entry_date,beer_id,package_id,quantity,kegs_used,kegs_used_package_id,source_volume_l,note,created_at'),
      fetchAllRows('kegging', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('fasovani', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('fasovani_private', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('writeoffs', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('zavoz_deductions', 'deduct_date,beer_id,package_id,quantity,order_item_id'),
      supabase.from('akce').select('entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
      fetchAllRows('keg_prefuk', 'entry_date,beer_id,from_package_id,from_count,to_package_id,to_count'),
      fetchAllRows('inventory_adjustments', 'entry_date,beer_id,package_id,quantity'),
    ]);
    if (b.data) setBeers(b.data as Beer[]);
    if (p.data) setPackages(p.data as Package[]);
    if (pl.data) setPlans(pl.data);
    if (ords.data) setOrders(ords.data);
    if (oi.data) setOrderItems(oi.data);
    if (inv.data) setInventoryRows(inv.data);
    if (bt.data) setRows(bt.data);
    if (kg.data) setKeggingRows(kg.data);
    if (fa.data) setFasovaniRows(fa.data);
    if (fp.data) setProdejnaRows(fp.data);
    if (wo.data) setWriteoffsRows(wo.data);
    if (zd.data) setZavozDeductionRows(zd.data);
    if (ak.data) setAkceRows(ak.data);
    if (pf.data) setPrefukRows(pf.data);
    if (adj.data) setAdjustmentRows(adj.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(
    ['bottling', 'beers', 'packages', 'orders', 'order_items', 'inventory', 'fasovani', 'fasovani_private', 'writeoffs', 'kegging', 'bottling_plans', 'zavoz_deductions', 'akce', 'akce_items', 'keg_prefuk', 'inventory_adjustments'],
    () => load()
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<BottlingPlan | null>(null);
  const [form, setForm] = useState<StocitForm>(defaultForm(todayStr));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ---- Přehled potřeby (sklad vs. objednávky vs. fašování vs. plán) ----
  const needs = useMemo(
    () =>
      computeBottlingNeeds({
        beers,
        packages,
        plans,
        orders,
        orderItems,
        inventoryRows,
        bottlingRows: rows,
        keggingRows,
        fasovaniRows,
        prodejnaRows,
        writeoffsRows,
        zavozDeductionRows,
        akceRows,
        prefukRows,
        adjustmentRows,
        weekKey,
        todayStr,
      }),
    [beers, packages, plans, orders, orderItems, inventoryRows, rows, keggingRows, fasovaniRows, prodejnaRows, writeoffsRows, zavozDeductionRows, akceRows, prefukRows, adjustmentRows, weekKey, todayStr]
  );

  const isKegPkg = (pkgId: string) => packages.find((p) => p.id === pkgId)?.kind === 'keg';
  const bottleRows = useMemo(() => needs.filter((r) => !isKegPkg(r.package_id)), [needs, packages]);
  const kegRows = useMemo(() => needs.filter((r) => isKegPkg(r.package_id)), [needs, packages]);

  const sum = (list: NeedsRow[], f: (r: NeedsRow) => number) => list.reduce((a, r) => a + f(r), 0);

  const totals = {
    bottleStock: sum(bottleRows, (r) => r.stock),
    kegStock: sum(kegRows, (r) => r.stock),
    bottleOutgoing: sum(bottleRows, (r) => r.ordered + r.fasovani),
    bottleMissing: sum(bottleRows, (r) => r.missing),
    bottleEndWeek: sum(bottleRows, (r) => r.afterOutgoing),
  };

  const weekPlans = useMemo(
    () =>
      plans
        .filter((p) => p.status !== 'cancelled' && isoWeekKey(p.planned_date) === weekKey)
        .sort((a, b) => a.planned_date.localeCompare(b.planned_date)),
    [plans, weekKey]
  );

  const bottlePackages = useMemo(
    () =>
      packages
        .filter((p) => p.kind === 'bottle' && ALLOWED_BOTTLE_VOLUMES.some((v) => Math.abs(Number(p.volume_l) - v) < 0.01))
        .sort((a, b) => Number(b.volume_l) - Number(a.volume_l)),
    [packages]
  );
  const kegPackages = useMemo(
    () =>
      packages
        .filter((p) => p.kind === 'keg' && KEG_SIZES.includes(Number(p.volume_l)))
        .sort((a, b) => Number(b.volume_l) - Number(a.volume_l)),
    [packages]
  );

  // ---- Tlačítko „🍾 Stočit“ — otevře menu s velikostmi obalů + KEG ----
  function openStocit(row: NeedsRow) {
    setEditPlan(null);
    setErr(null);
    const isKeg = isKegPkg(row.package_id);
    const suggested = row.missing > 0 ? row.missing : row.ordered;
    setForm({
      plannedDate: todayStr,
      beerId: row.beer_id,
      kegPkgId: isKeg ? row.package_id : '',
      kegQty: isKeg ? (suggested > 0 ? String(suggested) : '') : '',
      pkgId: isKeg ? '' : row.package_id,
      qty: isKeg ? '' : (suggested > 0 ? String(suggested) : ''),
      pkg2Id: '',
      qty2: '',
      pkg3Id: '',
      qty3: '',
      note: '',
    });
    setModalOpen(true);
  }

  function openEdit(plan: BottlingPlan) {
    setEditPlan(plan);
    setErr(null);
    setForm({
      plannedDate: plan.planned_date,
      beerId: plan.beer_id || '',
      kegPkgId: plan.keg_pkg_id || '',
      kegQty: plan.keg_qty > 0 ? String(plan.keg_qty) : '',
      pkgId: plan.pkg_id || '',
      qty: plan.qty > 0 ? String(plan.qty) : '',
      pkg2Id: plan.pkg2_id || '',
      qty2: plan.qty2 > 0 ? String(plan.qty2) : '',
      pkg3Id: plan.pkg3_id || '',
      qty3: plan.qty3 > 0 ? String(plan.qty3) : '',
      note: plan.note || '',
    });
    setModalOpen(true);
  }

  function setField<K extends keyof StocitForm>(field: K, value: StocitForm[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.beerId) {
      setErr('Vyberte pivo.');
      return;
    }
    if (!form.plannedDate) {
      setErr('Vyberte datum stáčení.');
      return;
    }
    if (!form.pkgId && !form.pkg2Id && !form.pkg3Id && !form.kegPkgId) {
      setErr('Zadejte aspoň jeden obal (velikost lahví nebo KEG sud).');
      return;
    }
    const input: BottlingPlanInput = {
      beer_id: form.beerId,
      keg_pkg_id: form.kegPkgId || null,
      keg_qty: Number(form.kegQty || 0),
      pkg_id: form.pkgId || null,
      qty: Number(form.qty || 0),
      pkg2_id: form.pkg2Id || null,
      qty2: Number(form.qty2 || 0),
      pkg3_id: form.pkg3Id || null,
      qty3: Number(form.qty3 || 0),
      planned_date: form.plannedDate,
      note: form.note || null,
    };
    if (!input.keg_pkg_id && !input.pkg_id && !input.pkg2_id && !input.pkg3_id) {
      setErr('Zadejte aspoň jeden obal s počtem kusů.');
      return;
    }
    setSaving(true);
    try {
      const { error } = editPlan
        ? await updateBottlingPlan(editPlan.id, input)
        : await saveBottlingPlan(input);
      if (error) throw error;
      setModalOpen(false);
      setEditPlan(null);
      setFlash(true);
      setMsg('✅ Úkol stáčení uložen — automaticky se propíše do formuláře stáčení (Lahve), kde ho stáčeč „Naplní“.');
      setTimeout(() => setFlash(false), 2500);
      load();
    } catch (e: any) {
      setErr(e?.message || 'Chyba při ukládání úkolu.');
    }
    setSaving(false);
  }

  async function handleStatus(plan: BottlingPlan, status: BottlingPlan['status']) {
    const { error } = await setPlanStatus(plan.id, status);
    if (error) chyba(error.message);
    else load();
  }

  async function handleDelete(plan: BottlingPlan) {
    if (!(await potvrd('Smazat tento úkol stáčení?'))) return;
    const { error } = await deleteBottlingPlan(plan.id);
    if (error) chyba(error.message);
    else load();
  }

  function renderTable(list: NeedsRow[], isKeg: boolean) {
    const t = list.reduce(
      (a, r) => {
        a.ordered += r.ordered;
        a.stock += r.stock;
        a.planned += r.planned;
        a.fasovani += r.fasovani;
        a.missing += r.missing;
        a.afterOutgoing += r.afterOutgoing;
        return a;
      },
      { ordered: 0, stock: 0, planned: 0, fasovani: 0, missing: 0, afterOutgoing: 0 }
    );
    if (list.length === 0) {
      return (
        <p className="text-xs text-neutral-500 py-1">
          {isKeg ? 'Žádné KEG sudy v tomto týdnu nejsou potřeba ani naplánované.' : 'Žádné lahve v tomto týdnu nejsou potřeba ani naplánované.'}
        </p>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[880px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-neutral-500">
              <th className="text-left font-black px-2 py-1.5">Pivo</th>
              <th className="text-left font-black px-2 py-1.5">Obal</th>
              <th className="text-right font-black px-2 py-1.5">🛒 Objednávky</th>
              <th className="text-right font-black px-2 py-1.5">📦 Fašování</th>
              <th className="text-right font-black px-2 py-1.5">📋 Naplánováno</th>
              <th className="text-right font-black px-2 py-1.5">{isKeg ? '🛢️ Sudy na skladě' : '🍾 Lahve na skladě'}</th>
              <th className="text-right font-black px-2 py-1.5">⚠️ Chybí stočit</th>
              <th className="text-right font-black px-2 py-1.5">📅 Konec týdne</th>
              <th className="text-right font-black px-2 py-1.5">🍾 Stočit</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => {
              const beer = beers.find((b) => b.id === r.beer_id);
              return (
                <tr key={`${r.beer_id}-${r.package_id}`} className={`border-t ${i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}`}>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1.5 font-bold text-neutral-900">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: beer ? beerBg(beer) : '#a8a29e' }} />
                      {r.beer_name}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-neutral-700 whitespace-nowrap">{r.package_label} {isKeg ? '' : `(${r.volume_l} L)`}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-neutral-800">{fmt(r.ordered)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-neutral-800">{fmt(r.fasovani)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-amber-800">{fmt(r.planned)}</td>
                  <td className="px-2 py-1.5 text-right font-black text-emerald-800">{fmt(r.stock)}</td>
                  <td className={`px-2 py-1.5 text-right font-black ${r.missing > 0 ? 'bg-rose-100 text-rose-800' : 'text-neutral-600 font-semibold'}`}>
                    {r.missing > 0 ? `${fmt(r.missing)} ⚠️` : '0'}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-black ${r.afterOutgoing < 0 ? 'bg-rose-100 text-rose-800' : 'text-neutral-900'}`}>
                    {fmt(r.afterOutgoing)}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openStocit(r)}
                      title={r.missing > 0 ? 'Stočit chybějící množství' : 'Stočit (pokrytí objednávek)'}
                      className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-neutral-950 text-[11px] font-black transition shadow-xs"
                    >
                      🍾 Stočit
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-neutral-300 bg-amber-50">
              <td colSpan={2} className="px-2 py-1.5 font-black text-amber-950">Celkem</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(t.ordered)}</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(t.fasovani)}</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(t.planned)}</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(t.stock)}</td>
              <td className={`px-2 py-1.5 text-right font-black ${t.missing > 0 ? 'text-rose-800' : 'text-amber-950'}`}>{fmt(t.missing)}</td>
              <td className={`px-2 py-1.5 text-right font-black ${t.afterOutgoing < 0 ? 'text-rose-800' : 'text-amber-950'}`}>{fmt(t.afterOutgoing)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (loading && beers.length === 0) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-sm font-bold text-neutral-600">
          <span className="w-5 h-5 border-2 border-neutral-200 border-t-primary-600 rounded-full animate-spin" />
          Načítám přehled stáčení…
        </div>
      </div>
    );
  }

  return (
    <div className={`card p-6 border-2 border-amber-400/60 bg-gradient-to-br from-amber-50/80 to-white rounded shadow-md transition-all duration-200 ${flash ? 'ring-4 ring-success-500/20' : ''}`}>
      {/* Hlavička */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-display font-bold text-lg flex items-center gap-2">
          <span className="text-xl">🍾</span>
          <span>Zadávání stáčení lahví</span>
          <span className="ml-1 px-2.5 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-[10px] uppercase tracking-wider">ADMIN</span>
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWeekKey(shiftWeek(weekKey, -1))}
            className="w-8 h-8 grid place-items-center rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition"
            title="Předchozí týden"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-black text-neutral-800 bg-white border border-neutral-200 rounded px-3 py-1.5 whitespace-nowrap">
            📅 Týden {weekKey} ({weekLabel})
          </span>
          <button
            type="button"
            onClick={() => setWeekKey(shiftWeek(weekKey, 1))}
            className="w-8 h-8 grid place-items-center rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 transition"
            title="Další týden"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <p className="text-xs text-neutral-600 mt-1.5 leading-relaxed">
        Přehled potřeby stáčení pro vybraný týden. Tlačítkem <strong>„🍾 Stočit“</strong> otevřete menu, kde
        nastavíte velikosti obalů a počet KEG sudů — úkol se uloží a <strong>automaticky propíše do formuláře
        stáčení</strong> (Lahve → „Úkoly ke stočení“ → „Naplnit“).
      </p>

      {msg && <div className="mt-3 p-3 rounded bg-emerald-100 text-emerald-900 font-bold text-xs border border-emerald-300">{msg}</div>}

      {/* Souhrn */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <div className="p-3 rounded bg-white border border-emerald-200 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-emerald-700">🍾 Lahve na skladě</div>
          <div className="text-xl font-display font-black text-emerald-900 mt-0.5">{fmt(totals.bottleStock)}</div>
        </div>
        <div className="p-3 rounded bg-white border border-neutral-200 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-neutral-500">🛢️ Sudy na skladě</div>
          <div className="text-xl font-display font-black text-neutral-900 mt-0.5">{fmt(totals.kegStock)}</div>
        </div>
        <div className="p-3 rounded bg-white border border-sky-200 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-sky-700">🛒 Objednávky + fašování</div>
          <div className="text-xl font-display font-black text-sky-900 mt-0.5">{fmt(totals.bottleOutgoing)}</div>
        </div>
        <div className="p-3 rounded bg-rose-50 border border-rose-200 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-rose-700">⚠️ Chybí stočit</div>
          <div className="text-xl font-display font-black text-rose-900 mt-0.5">{fmt(totals.bottleMissing)}</div>
        </div>
        <div className="p-3 rounded bg-amber-50 border border-amber-200 shadow-xs">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-800">📅 Konec týdne</div>
          <div className={`text-xl font-display font-black mt-0.5 ${totals.bottleEndWeek < 0 ? 'text-rose-800' : 'text-amber-900'}`}>
            {fmt(totals.bottleEndWeek)}
          </div>
        </div>
      </div>

      {/* Naplánované úkoly v týdnu */}
      <div className="mt-4">
        <div className="text-xs font-black text-neutral-800 mb-2">📋 Úkoly stáčení v tomto týdnu ({weekPlans.length})</div>
        {weekPlans.length === 0 && (
          <p className="text-xs text-neutral-500">Žádné úkoly. Pomocí „🍾 Stočit“ přidáte úkol pro konkrétní pivo a obal.</p>
        )}
        <div className="space-y-2">
          {weekPlans.map((plan) => {
            const beer = beers.find((b) => b.id === plan.beer_id);
            const lines = planLines(plan, packages);
            return (
              <div key={plan.id} className="rounded border border-neutral-200 bg-white p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: beer ? beerBg(beer) : '#a8a29e' }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-neutral-950">{beer?.name || '—'}</span>
                      <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded px-2 py-0.5 whitespace-nowrap">📅 {plan.planned_date}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${STATUS_CHIP[plan.status] || ''}`}>{STATUS_TEXT[plan.status] || plan.status}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {lines.map((l, i) => (
                        <span key={i} className="text-[10px] font-bold bg-neutral-50 border border-neutral-200 rounded px-1.5 py-0.5 text-neutral-700 whitespace-nowrap">
                          {l.label} × {l.qty}
                        </span>
                      ))}
                      {lines.length === 0 && <span className="text-[10px] text-neutral-400 italic">bez obalů</span>}
                      {plan.note && <span className="text-[10px] text-neutral-500">💬 {plan.note}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => openEdit(plan)} className="px-2.5 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[11px] font-black transition">
                    ✏️ Upravit
                  </button>
                  {plan.status === 'planned' && (
                    <button type="button" onClick={() => handleStatus(plan, 'done')} className="px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black transition">
                      ✓ Hotovo
                    </button>
                  )}
                  {plan.status !== 'planned' && (
                    <button type="button" onClick={() => handleStatus(plan, 'planned')} className="px-2.5 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[11px] font-black transition">
                      ↩️ Zpět
                    </button>
                  )}
                  <button type="button" onClick={() => handleDelete(plan)} className="px-2.5 py-1.5 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-black transition">
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabulky potřeby */}
      <div className="mt-4">
        <div className="text-xs font-black text-neutral-800 mb-2">🍾 Potřeba lahví (týden {weekLabel})</div>
        {renderTable(bottleRows, false)}
      </div>
      <div className="mt-4">
        <div className="text-xs font-black text-neutral-800 mb-2">🛢️ Potřeba KEG sudů (týden {weekLabel})</div>
        {renderTable(kegRows, true)}
        <p className="text-[10px] text-neutral-400 mt-1.5">
          Sklad = měsíční model (inventura + stočeno − výdej). „Konec týdne“ = sklad + naplánováno − objednávky − odhad
          fašování (průměr za posledních 30 dní). „Chybí stočit“ = objednávky + fašování − sklad − naplánováno.
        </p>
      </div>



      {/* Menu „🍾 Stočit“ — velikosti obalů + KEG sudy */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editPlan ? '✏️ Upravit úkol stáčení' : '🍾 Stočit — nastavení obalů'}
        wide
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Datum stáčení *</label>
              <input type="date" className="input w-full" value={form.plannedDate} onChange={(e) => setField('plannedDate', e.target.value)} />
            </div>
            <div>
              <label className="label">Pivo *</label>
              <select className="input w-full" value={form.beerId} onChange={(e) => setField('beerId', e.target.value)}>
                <option value="">— vyberte pivo —</option>
                {beers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(
              [
                ['pkgId', 'qty', 'Lahve 1'],
                ['pkg2Id', 'qty2', 'Lahve 2'],
                ['pkg3Id', 'qty3', 'Lahve 3'],
              ] as const
            ).map(([pkgField, qtyField, label]) => (
              <div key={label} className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="label">{label}</label>
                  <select className="input" value={form[pkgField]} onChange={(e) => setField(pkgField, e.target.value)}>
                    <option value="">— obal —</option>
                    {bottlePackages.map((p) => (
                      <option key={p.id} value={p.id}>{p.label} ({p.volume_l} L)</option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="label">ks</label>
                  <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} min={0} className="input text-right" value={form[qtyField]} onChange={(e) => setField(qtyField, e.target.value)} placeholder="0" />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="label">KEG sudy</label>
              <select className="input" value={form.kegPkgId} onChange={(e) => setField('kegPkgId', e.target.value)}>
                <option value="">— KEG obal —</option>
                {kegPackages.map((p) => (
                  <option key={p.id} value={p.id}>{p.label} ({p.volume_l} L)</option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="label">ks</label>
              <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} min={0} className="input text-right" value={form.kegQty} onChange={(e) => setField('kegQty', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div>
            <label className="label">Poznámka pro stáčeče</label>
            <input className="input w-full text-xs" value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="nepovinná (např. kterou šarži stočit, kolik nechat v rezervě…)" />
          </div>

          {err && <p className="text-[11px] font-black text-rose-700">{err}</p>}

          <p className="text-[11px] text-neutral-500 bg-amber-50 border border-amber-200 rounded p-2.5 leading-relaxed">
            💡 Uložený úkol se automaticky objeví ve formuláři stáčení (Lahve → „📋 Úkoly ke stočení“).
            Stáčeč ho jediným klikem <strong>„Naplnit“</strong> vloží do zápisu — doplní se jen počty lahví,
            obaly a pivo už jsou přednastavené.
          </p>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost !rounded text-sm font-black">Zrušit</button>
            <button type="submit" disabled={saving} className="btn-primary !rounded px-5 py-2.5 text-xs font-black shadow-md">
              {saving ? 'Ukládám…' : editPlan ? '💾 Uložit změny' : '✅ Uložit úkol'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
