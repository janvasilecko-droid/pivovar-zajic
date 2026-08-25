// 🗓️ Plánování stáčení — „Co je potřeba stočit" (pouze admin/sládek/šéf).
// Zadání úkolu (pivo + lahve až 3 velikosti + KEG sudy + datum), přehled
// naplánovaných úkolů v týdnu a tabulky potřeby (objednávky týdne vs. sklad
// vs. naplánováno vs. odhad fasování).
import { useEffect, useMemo, useState } from 'react';
import { Beer, Package, beerBg, supabase, useRealtime } from '../lib/supabase';
import { isoWeekKey, weekRange, shiftWeek } from './WeeklyOrderSummaryCard';
import { getStartingStockMap, flattenAkceNet } from '../lib/inventoryHelper';
import {
  BottlingPlan,
  BottlingPlanInput,
  saveBottlingPlan,
  updateBottlingPlan,
  deleteBottlingPlan,
  setPlanStatus,
  planLines,
} from '../lib/bottlingPlans';

type Props = {
  plans: BottlingPlan[];
  beers: Beer[];
  packages: Package[];
  orders: any[];
  orderItems: any[];
  inventoryRows: any[];
  rows: any[];
  fasovaniRows: any[];
  prodejnaRows: any[];
  writeoffsRows: any[];
  keggingRows: any[];
  onChanged: () => void;
};

type PlanRow = {
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  volume_l: number;
  ordered: number;
  stock: number;
  planned: number;
  fasovani: number;
  afterBottling: number;
  missing: number;
  afterOutgoing: number;
};

type FormState = {
  beerId: string;
  kegPkgId: string;
  kegQty: string;
  pkgId: string;
  qty: string;
  pkg2Id: string;
  qty2: string;
  pkg3Id: string;
  qty3: string;
  plannedDate: string;
  note: string;
};

const emptyForm = (): FormState => ({
  beerId: '',
  kegPkgId: '',
  kegQty: '',
  pkgId: '',
  qty: '',
  pkg2Id: '',
  qty2: '',
  pkg3Id: '',
  qty3: '',
  plannedDate: new Date().toISOString().slice(0, 10),
  note: '',
});

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

function fmt(n: number): string {
  return Math.round(n).toLocaleString('cs-CZ');
}

export function BottlingPlanPlanner({
  plans,
  beers,
  packages,
  orders,
  orderItems,
  inventoryRows,
  rows,
  fasovaniRows,
  prodejnaRows,
  writeoffsRows,
  keggingRows,
  onChanged,
}: Props) {
  const [weekKey, setWeekKey] = useState(() => isoWeekKey(new Date().toISOString().slice(0, 10)));
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  // Automatický odpočet závozu (stejný zdroj jako Sklad/Potřeba stočit lahve) — potřebný,
  // aby „sklad" i „objednáno" v tomto plánovacím přehledu nepočítaly už fyzicky zavezené
  // objednávky (viz komentáře u stockMap a weekOrdered níže).
  const [zavozDeductionRows, setZavozDeductionRows] = useState<any[]>([]);
  useEffect(() => {
    supabase
      .from('zavoz_deductions')
      .select('deduct_date,beer_id,package_id,quantity,order_item_id')
      .then(({ data }) => setZavozDeductionRows(data ?? []));
  }, []);
  useRealtime(['zavoz_deductions'], () => {
    supabase
      .from('zavoz_deductions')
      .select('deduct_date,beer_id,package_id,quantity,order_item_id')
      .then(({ data }) => setZavozDeductionRows(data ?? []));
  });

  // Spotřeba na Akcích/festivalech (odvezeno − vráceno) — stejný zdroj jako
  // Sklad (Stock.tsx), aby „sklad" v tomhle plánovacím přehledu nepovažoval
  // pivo odvezené na akci pořád za dostupné.
  const [akceRows, setAkceRows] = useState<any[]>([]);
  useEffect(() => {
    supabase
      .from('akce')
      .select('entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)')
      .then(({ data }) => setAkceRows(data ?? []));
  }, []);
  useRealtime(['akce', 'akce_items'], () => {
    supabase
      .from('akce')
      .select('entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)')
      .then(({ data }) => setAkceRows(data ?? []));
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const curMonth = todayStr.slice(0, 7);
  const weekLabel = weekRange(weekKey).label;

  const bottlePackages = useMemo(
    () => packages.filter((p) => p.kind === 'bottle').sort((a, b) => Number(b.volume_l) - Number(a.volume_l)),
    [packages]
  );
  const kegPackages = useMemo(
    () => packages.filter((p) => p.kind === 'keg').sort((a, b) => Number(b.volume_l) - Number(a.volume_l)),
    [packages]
  );

  // Aktuální sklad (měsíční model — shodný s „Potřeba stočit lahve")
  const stockMap = useMemo(() => {
    const invMap = getStartingStockMap(curMonth, inventoryRows, rows, keggingRows, fasovaniRows, prodejnaRows, writeoffsRows, 0, zavozDeductionRows, akceRows);
    const inMap: Record<string, number> = {};
    [...rows, ...keggingRows].filter((r) => r.entry_date?.startsWith(curMonth)).forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      inMap[k] = (inMap[k] || 0) + Number(r.quantity || 0);
    });
    const outMap: Record<string, number> = {};
    [...fasovaniRows, ...prodejnaRows, ...writeoffsRows].filter((r) => r.entry_date?.startsWith(curMonth)).forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      outMap[k] = (outMap[k] || 0) + Number(r.quantity || 0);
    });
    // Skutečně zavezené objednávky (automatický odpočet ráno v 01:00) — bez tohohle by
    // „sklad" zahrnoval i pivo, které už fyzicky odjelo k odběratelům. Stejný zdroj jako
    // Sklad (Stock.tsx) a Potřeba stočit lahve/KEGy.
    zavozDeductionRows.filter((r) => r.deduct_date?.startsWith(curMonth)).forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      outMap[k] = (outMap[k] || 0) + Number(r.quantity || 0);
    });
    flattenAkceNet(akceRows).filter((r) => r.entry_date?.startsWith(curMonth)).forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      outMap[k] = (outMap[k] || 0) + Number(r.quantity || 0);
    });
    const map: Record<string, number> = {};
    new Set([...Object.keys(invMap), ...Object.keys(inMap), ...Object.keys(outMap)]).forEach((k) => {
      map[k] = Math.max(0, Number(invMap[k] || 0) + Number(inMap[k] || 0) - Number(outMap[k] || 0));
    });
    return map;
  }, [curMonth, inventoryRows, rows, keggingRows, fasovaniRows, prodejnaRows, writeoffsRows, zavozDeductionRows, akceRows]);

  // Položky, které už mají svůj vlastní odpočet závozu — ty jsou fyzicky odečtené ze
  // skladu už jednou přes stockMap výše, takže se nesmí počítat i do weekOrdered
  // (dvojí odpočet). Odděleně od `is_delivered`, protože se nastavuje samostatně
  // (řidič odklikne objednávku až po dojetí trasy) a může chvíli zaostávat za ranním
  // odpočtem.
  const deductedItemIds = useMemo(
    () => new Set(zavozDeductionRows.map((r) => r.order_item_id).filter(Boolean)),
    [zavozDeductionRows]
  );

  // Objednávky v daném týdnu (ks na pivo + obal)
  const weekOrdered = useMemo(() => {
    const activeIds = new Set(
      orders
        .filter((o) => {
          if (o.status === 'storno' || o.status === 'vyrizeno' || o.status === 'vyrizeno_zavoz') return false;
          if (o.is_delivered) return false;
          const target = o.delivery_date || o.order_date;
          return !!target && isoWeekKey(target) === weekKey;
        })
        .map((o) => o.id)
    );
    const map: Record<string, number> = {};
    orderItems.filter((item) => item.package_id && activeIds.has(item.order_id) && !deductedItemIds.has(item.id)).forEach((item) => {
      if (!item.beer_id || !item.package_id) return;
      const k = `${item.beer_id}__${item.package_id}`;
      map[k] = (map[k] || 0) + Number(item.quantity || 0);
    });
    return map;
  }, [orders, orderItems, weekKey, deductedItemIds]);

  // Odhad fasování do konce vybraného týdne (průměr za posledních 30 dní × zbývající dny)
  const fasovaniEstimate = useMemo(() => {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 29);
    const from = cutoff.toISOString().slice(0, 10);
    const per: Record<string, number> = {};
    fasovaniRows
      .filter((r) => r.entry_date && r.beer_id && r.package_id && r.entry_date >= from && r.entry_date <= todayStr)
      .forEach((r) => {
        const k = `${r.beer_id}__${r.package_id}`;
        per[k] = (per[k] || 0) + Number(r.quantity || 0);
      });
    const remainingDays = Math.max(
      0,
      Math.floor((weekRange(weekKey).end.getTime() - new Date(todayStr + 'T00:00:00Z').getTime()) / 86400000) + 1
    );
    const out: Record<string, number> = {};
    Object.entries(per).forEach(([k, total]) => {
      out[k] = (total / 30) * remainingDays;
    });
    return out;
  }, [fasovaniRows, weekKey, todayStr]);

  // Naplánované stáčení v daném týdnu (jen „planned" — hotové už je zahrnuté ve skladu).
  // Bod c.2: do „Naplánováno" se bere JEN první stáčení piva v týdnu (nejbližší
  // planned_date) — další úkoly téhož piva později v tomtéž týdnu se nepočítají.
  const plannedMap = useMemo(() => {
    // Pro každé pivo určíme nejbližší datum stáčení v daném týdnu (první stáčení).
    const firstDateByBeer = new Map<string, string>();
    plans
      .filter((p) => p.beer_id && p.status !== 'cancelled' && isoWeekKey(p.planned_date) === weekKey)
      .forEach((p) => {
        const cur = firstDateByBeer.get(p.beer_id!);
        if (!cur || p.planned_date < cur) firstDateByBeer.set(p.beer_id!, p.planned_date);
      });

    const map: Record<string, number> = {};
    plans
      .filter(
        (p) =>
          p.status === 'planned' &&
          p.beer_id &&
          isoWeekKey(p.planned_date) === weekKey &&
          firstDateByBeer.get(p.beer_id) === p.planned_date
      )
      .forEach((p) => {
        const add = (pkgId: string | null, qty: number) => {
          if (!pkgId || qty <= 0) return;
          const k = `${p.beer_id}__${pkgId}`;
          map[k] = (map[k] || 0) + qty;
        };
        add(p.pkg_id, p.qty);
        add(p.pkg2_id, p.qty2);
        add(p.pkg3_id, p.qty3);
        add(p.keg_pkg_id, p.keg_qty);
      });
    return map;
  }, [plans, weekKey]);


  const allRows = useMemo(() => {
    const list: PlanRow[] = [];
    beers.forEach((b) => {
      packages.forEach((p) => {
        const k = `${b.id}__${p.id}`;
        const ordered = weekOrdered[k] || 0;
        const stock = stockMap[k] || 0;
        const planned = plannedMap[k] || 0;
        const fasovani = fasovaniEstimate[k] || 0;
        if (ordered === 0 && stock === 0 && planned === 0 && fasovani === 0) return;
        const afterBottling = stock + planned;
        list.push({
          beer_id: b.id,
          beer_name: b.name,
          package_id: p.id,
          package_label: p.label,
          volume_l: Number(p.volume_l || 0),
          ordered,
          stock,
          planned,
          fasovani,
          afterBottling,
          missing: Math.max(0, ordered + fasovani - afterBottling),
          afterOutgoing: afterBottling - ordered - fasovani,
        });
      });
    });
    return list;
  }, [beers, packages, weekOrdered, stockMap, plannedMap, fasovaniEstimate]);

  const bottleRows = useMemo(
    () => allRows.filter((r) => packages.find((p) => p.id === r.package_id)?.kind !== 'keg'),
    [allRows, packages]
  );
  const kegRows = useMemo(
    () => allRows.filter((r) => packages.find((p) => p.id === r.package_id)?.kind === 'keg'),
    [allRows, packages]
  );

  const weekPlans = useMemo(
    () =>
      plans
        .filter((p) => p.status !== 'cancelled' && isoWeekKey(p.planned_date) === weekKey)
        .sort((a, b) => a.planned_date.localeCompare(b.planned_date)),
    [plans, weekKey]
  );


  function setField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.beerId) {
      setErr('Vyberte pivo.');
      return;
    }
    if (!form.plannedDate) {
      setErr('Vyberte datum stáčení.');
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
      if (editingId) {
        const { error } = await updateBottlingPlan(editingId, input);
        if (error) throw error;
      } else {
        const { error } = await saveBottlingPlan(input);
        if (error) throw error;
      }
      setEditingId(null);
      setForm(emptyForm());
      setErr(null);
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
      onChanged();
    } catch (err: any) {
      setErr(err?.message || 'Chyba při ukládání úkolu.');
    }
    setSaving(false);
  }

  function startEdit(plan: BottlingPlan) {
    setEditingId(plan.id);
    setErr(null);
    setForm({
      beerId: plan.beer_id || '',
      kegPkgId: plan.keg_pkg_id || '',
      kegQty: plan.keg_qty > 0 ? String(plan.keg_qty) : '',
      pkgId: plan.pkg_id || '',
      qty: plan.qty > 0 ? String(plan.qty) : '',
      pkg2Id: plan.pkg2_id || '',
      qty2: plan.qty2 > 0 ? String(plan.qty2) : '',
      pkg3Id: plan.pkg3_id || '',
      qty3: plan.qty3 > 0 ? String(plan.qty3) : '',
      plannedDate: plan.planned_date,
      note: plan.note || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(plan: BottlingPlan) {
    if (!window.confirm('Smazat tento úkol stáčení?')) return;
    const { error } = await deleteBottlingPlan(plan.id);
    if (error) alert(error.message);
    else onChanged();
  }

  async function handleStatus(plan: BottlingPlan, status: BottlingPlan['status']) {
    const { error } = await setPlanStatus(plan.id, status);
    if (error) alert(error.message);
    else onChanged();
  }

  // Rychlé zadání úkolu z tabulky potřeby — předvyplní formulář (návrh = chybějící množství)
  function quickAdd(row: PlanRow, isKeg: boolean) {
    const suggested = row.missing > 0 ? row.missing : row.ordered;
    setEditingId(null);
    setErr(null);
    setForm({
      beerId: row.beer_id,
      kegPkgId: isKeg ? row.package_id : '',
      kegQty: isKeg ? (suggested > 0 ? String(suggested) : '') : '',
      pkgId: isKeg ? '' : row.package_id,
      qty: isKeg ? '' : (suggested > 0 ? String(suggested) : ''),
      pkg2Id: '',
      qty2: '',
      pkg3Id: '',
      qty3: '',
      plannedDate: new Date().toISOString().slice(0, 10),
      note: '',
    });
    setFlash(true);
    setTimeout(() => setFlash(false), 1500);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }


  function renderTable(rows: PlanRow[], isKeg: boolean) {
    const totals = rows.reduce(
      (a, r) => {
        a.ordered += r.ordered;
        a.stock += r.stock;
        a.planned += r.planned;
        a.fasovani += r.fasovani;
        a.afterBottling += r.afterBottling;
        a.missing += r.missing;
        a.afterOutgoing += r.afterOutgoing;
        return a;
      },
      { ordered: 0, stock: 0, planned: 0, fasovani: 0, afterBottling: 0, missing: 0, afterOutgoing: 0 }
    );
    if (rows.length === 0) {
      return (
        <p className="text-xs text-neutral-500 py-1">
          {isKeg
            ? 'Žádné KEG sudy v tomto týdnu nejsou potřeba ani naplánované.'
            : 'Žádné lahve v tomto týdnu nejsou potřeba ani naplánované.'}
        </p>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[920px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-neutral-500">
              <th className="text-left font-black px-2 py-1.5">Pivo</th>
              <th className="text-left font-black px-2 py-1.5">Obal</th>
              <th className="text-right font-black px-2 py-1.5">🛒 Objednáno</th>
              <th className="text-right font-black px-2 py-1.5">📦 Sklad</th>
              <th className="text-right font-black px-2 py-1.5">📋 Naplánováno</th>
              <th className="text-right font-black px-2 py-1.5">🍾 Po stočení</th>
              <th className="text-right font-black px-2 py-1.5">⚠️ Chybí</th>
              <th className="text-right font-black px-2 py-1.5">🧮 Po odchodu</th>
              <th className="text-right font-black px-2 py-1.5">🗓️ Úkol</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const beer = beers.find((b) => b.id === r.beer_id);
              return (
                <tr key={`${r.beer_id}-${r.package_id}`} className={`border-t ${i % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}`}>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1.5 font-bold text-neutral-900">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: beer ? beerBg(beer) : '#a8a29e' }} />
                      {r.beer_name}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-neutral-700 whitespace-nowrap">
                    {r.package_label} {isKeg ? '' : `(${r.volume_l} L)`}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-neutral-800">{fmt(r.ordered)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-neutral-800">{fmt(r.stock)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-amber-800">{fmt(r.planned)}</td>
                  <td className={`px-2 py-1.5 text-right font-black ${r.afterBottling < r.ordered ? 'text-rose-700' : 'text-emerald-800'}`}>{fmt(r.afterBottling)}</td>
                  <td className={`px-2 py-1.5 text-right font-black ${r.missing > 0 ? 'bg-rose-100 text-rose-800' : 'text-neutral-600 font-semibold'}`}>{r.missing > 0 ? `${fmt(r.missing)} ⚠️` : '0'}</td>
                  <td className={`px-2 py-1.5 text-right font-black ${r.afterOutgoing < 0 ? 'bg-rose-100 text-rose-800' : 'text-neutral-900'}`}>{fmt(r.afterOutgoing)}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => quickAdd(r, isKeg)}
                      title={r.missing > 0 ? 'Vytvořit úkol na pokrytí chybějícího množství' : 'Vytvořit úkol (pokrytí objednávek)'}
                      className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-black transition"
                    >
                      + Úkol
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-neutral-300 bg-amber-50">
              <td colSpan={3} className="px-2 py-1.5 font-black text-amber-950">Celkem</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(totals.ordered)}</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(totals.stock)}</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(totals.planned)}</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(totals.afterBottling)}</td>
              <td className={`px-2 py-1.5 text-right font-black ${totals.missing > 0 ? 'text-rose-800' : 'text-amber-950'}`}>{fmt(totals.missing)}</td>
              <td className={`px-2 py-1.5 text-right font-black ${totals.afterOutgoing < 0 ? 'text-rose-800' : 'text-amber-950'}`}>{fmt(totals.afterOutgoing)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    );
  }


  return (
    <div className="space-y-5">
      {/* Hlavička + výběr týdne */}
      <div className="card p-3.5 border-2 border-amber-300/80 bg-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="font-display font-black text-amber-950 text-sm">🗓️ Co je potřeba stočit</div>
            <div className="text-[11px] text-amber-900/70 mt-0.5">
              Plánování na týden <b>{weekLabel}</b> — stáčeč to vidí zvýrazněné v zápisu stáčení.
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => setWeekKey(shiftWeek(weekKey, -1))} className="w-7 h-7 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-sm transition">‹</button>
            <span className="text-xs font-black text-amber-950 px-2 whitespace-nowrap">{weekLabel}</span>
            <button type="button" onClick={() => setWeekKey(shiftWeek(weekKey, 1))} className="w-7 h-7 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-sm transition">›</button>
            <button type="button" onClick={() => setWeekKey(isoWeekKey(new Date().toISOString().slice(0, 10)))} className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-600 text-neutral-950 text-[11px] font-black transition">Tento týden</button>
          </div>
        </div>
      </div>

      {/* Formulář zadání úkolu */}
      <form onSubmit={handleSubmit} className={`card p-3.5 border-2 border-amber-300/70 transition-all duration-200 ${flash ? 'ring-4 ring-success-500/20' : ''}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-display font-black text-amber-950 text-xs">{editingId ? '✏️ Upravit úkol' : '➕ Zadat nový úkol'}</span>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm(emptyForm()); setErr(null); }} className="text-[10px] font-black text-neutral-500 hover:text-neutral-800 underline">
              zrušit úpravu
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div className="col-span-2 md:col-span-1">
            <label className="label">Pivo *</label>
            <select className="input" value={form.beerId} onChange={(e) => setField('beerId', e.target.value)}>
              <option value="">— vyberte pivo —</option>
              {beers.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Datum *</label>
            <input type="date" className="input" value={form.plannedDate} onChange={(e) => setField('plannedDate', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="label">Poznámka</label>
            <input className="input text-xs" value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="nepovinná poznámka pro stáčeče" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          {(
            [
              ['pkgId', 'qty', 'Lahve 1'],
              ['pkg2Id', 'qty2', 'Lahve 2'],
              ['pkg3Id', 'qty3', 'Lahve 3'],
            ] as const
          ).map(([pkgField, qtyField, l]) => (
            <div key={l} className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="label">{l}</label>
                <select className="input" value={form[pkgField]} onChange={(e) => setField(pkgField, e.target.value)}>
                  <option value="">— obal —</option>
                  {bottlePackages.map((p) => (
                    <option key={p.id} value={p.id}>{p.label} ({p.volume_l} L)</option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <label className="label">ks</label>
                <input type="number" min={0} className="input text-right" value={form[qtyField]} onChange={(e) => setField(qtyField, e.target.value)} placeholder="0" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-end mt-3">
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
            <input type="number" min={0} className="input text-right" value={form.kegQty} onChange={(e) => setField('kegQty', e.target.value)} placeholder="0" />
          </div>
        </div>
        {err && <p className="text-[11px] font-black text-rose-700 mt-2">{err}</p>}
        <div className="flex items-center justify-end gap-2 mt-3">
          <button type="submit" disabled={saving} className="btn-primary !rounded px-5 py-2.5 text-xs font-black shadow-md">
            {saving ? 'Ukládám…' : editingId ? '💾 Uložit změny' : '➕ Přidat úkol'}
          </button>
        </div>
      </form>


      {/* Tabulky potřeby */}
      <div className="card p-3.5">
        <div className="text-xs font-black text-neutral-800 mb-2">🍾 Potřeba lahví (týden {weekLabel})</div>
        {renderTable(bottleRows, false)}
      </div>
      <div className="card p-3.5">
        <div className="text-xs font-black text-neutral-800 mb-2">🛢️ Potřeba KEG sudů (týden {weekLabel})</div>
        {renderTable(kegRows, true)}
        <p className="text-[10px] text-neutral-400 mt-1.5">
          Sklad = měsíční model (inventura + stočeno − výdej). „Po odchodu" = po stočení − objednávky − odhad
          fasování do konce týdne (průměr za posledních 30 dní). Tlačítko „+ Úkol" předvyplní formulář
          pro dané pivo a obal (návrh = chybějící množství).
        </p>
      </div>

      {/* Přehled úkolů v týdnu */}
      <div className="card p-3.5">
        <div className="text-xs font-black text-neutral-800 mb-2">📋 Úkoly v tomto týdnu ({weekPlans.length})</div>
        {weekPlans.length === 0 && <p className="text-xs text-neutral-500">V tomto týdnu nejsou žádné naplánované úkoly.</p>}
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
                      {plan.note && <span className="text-[10px] text-neutral-500">💬 {plan.note}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => startEdit(plan)} className="px-2.5 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-[11px] font-black transition">
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
    </div>
  );
}

