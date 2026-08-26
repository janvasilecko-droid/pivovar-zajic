// 🗓️ „Co stočit na který den" — tabule stáčení uspořádaná jako Závoz.
// ---------------------------------------------------------------------------
// Kliknu na den → vidím, co a kolik sudů je na ten den potřeba, kolik už mám
// hotovo a kolik ještě chybí. Odškrtnutí („mám to") zapíše skutečné stáčení,
// takže se nikde nevede druhá evidence — číslo „chybí" klesne okamžitě.
// Výpočet viz lib/keggingPlan.ts.
import { useMemo, useState } from 'react';
import { CalendarDays, Check, Cylinder, Beer, Truck, ChevronDown } from 'lucide-react';
import type { DayPlan, PlanItem } from '../lib/keggingPlan';
import { dayKeyFromISO } from '../lib/keggingPlan';

type Props = {
  plans: DayPlan[];
  weekLabel: string;
  todayISO: string;
  /** Zapíše stáčení daného piva/obalu — používá se pro odškrtnutí. */
  onFill: (beerId: string, packageId: string, qty: number) => Promise<void> | void;
  canEdit: boolean;
};

const fmtDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });

export default function KeggingDayPlan({ plans, weekLabel, todayISO, onFill, canEdit }: Props) {
  const todayDay = dayKeyFromISO(todayISO);
  // Otevře se rovnou nejbližší den, kde ještě něco chybí — stáčeč většinou
  // řeší ten, ne pondělí.
  const firstOpen = plans.find((p) => p.totalMissing > 0)?.day;
  const [selected, setSelected] = useState<string>(firstOpen ?? todayDay);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const weekTotals = useMemo(() => ({
    missing: plans.reduce((s, p) => s + p.totalMissing, 0),
    ordered: plans.reduce((s, p) => s + p.totalOrdered, 0),
    liters: plans.reduce((s, p) => s + p.missingLiters, 0),
  }), [plans]);

  const active = plans.find((p) => p.day === selected) ?? plans[0];

  async function fill(item: PlanItem, qty: number) {
    if (!canEdit || qty <= 0) return;
    setBusy(item.key);
    try {
      await onFill(item.beer_id, item.package_id, qty);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Souhrn za týden */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded border border-neutral-200/90 shadow-xs">
          <div className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Objednáno tento týden</div>
          <div className="font-display font-black text-2xl text-neutral-900 mt-0.5">{weekTotals.ordered} <span className="text-sm font-bold text-neutral-500">ks sudů</span></div>
          <div className="text-[11px] font-bold text-neutral-500 mt-0.5">{weekLabel}</div>
        </div>
        <div className={`p-4 rounded border shadow-xs ${weekTotals.missing > 0 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
          <div className={`text-[11px] font-black uppercase tracking-wide ${weekTotals.missing > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>Zbývá stočit</div>
          <div className={`font-display font-black text-2xl mt-0.5 ${weekTotals.missing > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
            {weekTotals.missing} <span className="text-sm font-bold opacity-70">ks sudů</span>
          </div>
          <div className={`text-[11px] font-bold mt-0.5 ${weekTotals.missing > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {weekTotals.missing > 0 ? `${(weekTotals.liters / 100).toFixed(1)} hl / ${weekTotals.liters} L` : 'Všechno je stočené'}
          </div>
        </div>
        <div className="bg-white p-4 rounded border border-neutral-200/90 shadow-xs">
          <div className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Hotovo</div>
          <div className="font-display font-black text-2xl text-emerald-700 mt-0.5">
            {weekTotals.ordered - weekTotals.missing}<span className="text-sm font-bold text-neutral-500"> / {weekTotals.ordered}</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-200 overflow-hidden mt-2">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${weekTotals.ordered > 0 ? Math.round(((weekTotals.ordered - weekTotals.missing) / weekTotals.ordered) * 100) : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Dny v týdnu — stejné ovládání jako v Závozu */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
        {plans.map((p) => {
          const isSel = p.day === selected;
          const hotovo = p.totalOrdered > 0 && p.totalMissing === 0;
          return (
            <button
              key={p.day}
              type="button"
              onClick={() => setSelected(p.day)}
              className={`px-3.5 py-2 rounded font-black text-xs shrink-0 transition-all flex items-center gap-1.5 shadow-xs min-h-[46px] ${
                isSel
                  ? 'bg-amber-500 text-neutral-950 scale-105'
                  : p.totalMissing > 0
                  ? 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
                  : hotovo
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                  : 'bg-neutral-200 text-neutral-400'
              }`}
            >
              <div className="flex flex-col items-start leading-tight">
                <span className="flex items-center gap-1">
                  {p.day === todayDay && <span className="w-1.5 h-1.5 rounded-full bg-current" title="Dnes" />}
                  {p.label}
                </span>
                <span className="text-[10px] font-bold opacity-70">{fmtDate(p.date)}</span>
              </div>
              {p.totalMissing > 0 ? (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${isSel ? 'bg-neutral-950 text-amber-300' : 'bg-amber-300 text-amber-950'}`}>
                  {p.totalMissing}
                </span>
              ) : hotovo ? (
                <Check size={14} className="shrink-0" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Seznam na vybraný den */}
      <div className="bg-white rounded border border-neutral-200/90 shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-neutral-200/80 bg-neutral-50/60">
          <div>
            <h3 className="font-display font-black text-neutral-950 flex items-center gap-2">
              <CalendarDays size={17} className="text-amber-600" />
              Stočit na {active.label.toLowerCase() === 'ne' ? 'neděli' : active.label} {fmtDate(active.date)}
            </h3>
            <p className="text-[11px] font-bold text-neutral-500 mt-0.5">
              {active.totalOrdered === 0
                ? 'Na tenhle den není žádná objednávka.'
                : active.totalMissing === 0
                ? 'Hotovo — všechno na tenhle den je stočené.'
                : `Chybí ${active.totalMissing} ks (${active.missingLiters} L). Odškrtnutím se zapíše stáčení.`}
            </p>
          </div>
          {active.totalOrdered > 0 && (
            <span className={`px-3 py-1 rounded-full font-mono font-black text-sm shrink-0 ${active.totalMissing > 0 ? 'bg-amber-500 text-neutral-950' : 'bg-emerald-500 text-white'}`}>
              {active.totalMissing > 0 ? `${active.totalMissing} ks` : '✓'}
            </span>
          )}
        </div>

        {active.items.length === 0 ? (
          <div className="p-8 text-center text-neutral-400 font-bold text-sm">
            <Beer size={30} className="mx-auto mb-2 opacity-40" />
            Na {active.label} nejsou žádné KEG objednávky.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {active.items.map((it) => {
              const hotovo = it.missing === 0;
              const isOpen = !!expanded[it.key];
              return (
                <li key={it.key} className={hotovo ? 'bg-emerald-50/40' : ''}>
                  <div className="flex items-center gap-3 p-3.5 flex-wrap sm:flex-nowrap">
                    <div className={`w-10 h-10 rounded grid place-items-center shrink-0 ${hotovo ? 'bg-emerald-500 text-white' : 'bg-amber-100 text-amber-700'}`}>
                      {hotovo ? <Check size={20} /> : <Cylinder size={19} />}
                    </div>

                    <div className="flex-1 min-w-[140px]">
                      <div className="font-display font-black text-sm text-neutral-900">
                        {it.beer_name} <span className="text-neutral-500">{it.package_label.trim()}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpanded((p) => ({ ...p, [it.key]: !p[it.key] }))}
                        className="text-[11px] font-bold text-neutral-500 hover:text-amber-700 inline-flex items-center gap-1 mt-0.5"
                      >
                        <Truck size={11} />
                        {it.orders.length} {it.orders.length === 1 ? 'odběratel' : it.orders.length < 5 ? 'odběratelé' : 'odběratelů'}
                        <ChevronDown size={11} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    <div className="text-right shrink-0 w-[92px]">
                      <div className={`font-mono font-black text-xl leading-none ${hotovo ? 'text-emerald-600' : 'text-amber-700'}`}>
                        {hotovo ? '✓' : it.missing}
                      </div>
                      <div className="text-[10px] font-bold text-neutral-500 mt-1">
                        {it.done} / {it.ordered} ks
                      </div>
                    </div>

                    {canEdit && !hotovo && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={busy === it.key}
                          onClick={() => fill(it, 1)}
                          className="px-2.5 py-2 rounded border border-neutral-200 bg-white text-neutral-700 font-black text-xs hover:bg-neutral-50 disabled:opacity-40 min-h-[38px]"
                          title="Zapsat jeden stočený sud"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          disabled={busy === it.key}
                          onClick={() => fill(it, it.missing)}
                          className="px-3 py-2 rounded bg-emerald-600 text-white font-black text-xs hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1.5 min-h-[38px]"
                        >
                          <Check size={14} />
                          {busy === it.key ? 'Ukládám…' : `Mám (${it.missing})`}
                        </button>
                      </div>
                    )}
                  </div>

                  {isOpen && (
                    <ul className="px-3.5 pb-3 -mt-1 space-y-1">
                      {it.orders.map((o, i) => (
                        <li key={`${o.order_id}-${i}`} className="flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-1.5 rounded bg-neutral-50 border border-neutral-100">
                          <span className={o.delivered ? 'text-neutral-400 line-through' : 'text-neutral-700'}>{o.place_name}</span>
                          <span className="font-mono text-neutral-600 shrink-0">
                            {o.quantity} ks{o.delivered ? ' · zavezeno' : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
