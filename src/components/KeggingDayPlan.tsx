// 🗓️ „Co stočit na který den" — tabule stáčení uspořádaná jako Závoz.
// ---------------------------------------------------------------------------
// Kliknu na den → vidím, co a kolik sudů je na ten den potřeba, kolik už mám
// hotovo a kolik ještě chybí.
//
// ⚠️ Odškrtávátko NEZAPISUJE stáčení. Je to pracovní pomůcka, aby stáčeč
// viděl, co už má hotové; skutečné stáčení se dál zapisuje v „Začátek
// stáčení". Kdyby odškrtnutí zakládalo záznam do `kegging`, vznikl by při
// běžném zápisu duplicitní řádek a sklad i objem tanku by se nafoukly.
// Odškrtnutí se ukládá do kegging_plan_checks a s doloženým stavem se skládá
// přes MAX — viz lib/keggingPlan.ts.
import { useMemo, useState } from 'react';
import { CalendarDays, Check, Cylinder, Beer, Truck, ChevronDown, ArrowRight } from 'lucide-react';
import type { DayPlan, PlanItem } from '../lib/keggingPlan';
import { dayKeyFromISO, mergeWeekPlan } from '../lib/keggingPlan';

type Props = {
  plans: DayPlan[];
  weekLabel: string;
  todayISO: string;
  /**
   * Uloží ruční odškrtnutí (kolik kusů má stáčeč hotových). NEZAPISUJE
   * stáčení — to se dál dělá v záložce „Začátek stáčení".
   */
  onCheck: (day: string, beerId: string, packageId: string, qty: number) => Promise<void> | void;
  canEdit: boolean;
  /** Otevře Objednávky vyfiltrované na tohle pivo a obal. */
  onShowOrders?: (beerId: string, packageId: string) => void;
};

const fmtDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'UTC' });

export default function KeggingDayPlan({ plans, weekLabel, todayISO, onCheck, canEdit, onShowOrders }: Props) {
  const todayDay = dayKeyFromISO(todayISO);
  // Otevře se rovnou nejbližší den, kde ještě něco chybí — stáčeč většinou
  // řeší ten, ne pondělí.
  const firstOpen = plans.find((p) => p.totalMissing > 0)?.day;
  const [selected, setSelected] = useState<string>(firstOpen ?? todayDay);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Souhrn za celý týden — sečtený z těch samých denních dat, takže se s nimi
  // nemůže rozejít (bývalá záložka „Potřeba stočit KEGy" ho počítala jinou
  // cestou a ukazovala jiná čísla).
  const weekPlan = useMemo(() => mergeWeekPlan(plans, weekLabel), [plans, weekLabel]);
  const weekTotals = {
    missing: weekPlan.totalMissing,
    ordered: weekPlan.totalOrdered,
    liters: weekPlan.missingLiters,
  };

  const active = selected === 'tyden' ? weekPlan : (plans.find((p) => p.day === selected) ?? plans[0]);
  const isWeek = active.day === 'tyden';

  // Odškrtnutí se ukládá jako ABSOLUTNÍ počet hotových kusů, ne jako přírůstek
  // — dva lidé u jednoho seznamu si tak navzájem nepřičtou navíc.
  async function setCheck(item: PlanItem, qty: number) {
    if (!canEdit || isWeek) return;
    setBusy(item.key);
    try {
      await onCheck(active.day, item.beer_id, item.package_id, Math.max(0, Math.min(item.ordered, qty)));
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
        <button
          type="button"
          onClick={() => setSelected('tyden')}
          className={`px-3.5 py-2 rounded font-black text-xs shrink-0 transition-all flex items-center gap-1.5 shadow-xs min-h-[46px] ${
            isWeek
              ? 'bg-amber-500 text-neutral-950 scale-105'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <CalendarDays size={14} />
          <span>Celý týden</span>
          {weekTotals.missing > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${isWeek ? 'bg-neutral-950 text-amber-300' : 'bg-amber-300 text-amber-950'}`}>
              {weekTotals.missing}
            </span>
          )}
        </button>
        <span className="w-px h-8 bg-neutral-300 shrink-0 mx-0.5" />
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
              {isWeek ? `Stočit za celý týden ${active.label}` : `Stočit na ${active.label} ${fmtDate(active.date)}`}
            </h3>
            <p className="text-[11px] font-bold text-neutral-500 mt-0.5">
              {active.totalOrdered === 0
                ? isWeek ? 'Tenhle týden zatím není žádná KEG objednávka.' : 'Na tenhle den není žádná objednávka.'
                : active.totalMissing === 0
                ? isWeek ? 'Hotovo — celý týden je stočený.' : 'Hotovo — všechno na tenhle den je stočené.'
                : `Chybí ${active.totalMissing} ks (${active.missingLiters} L).${isWeek ? '' : ' Odškrtávátko je jen přehled — stáčení se zapisuje v „Začátek stáčení".'}`}
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
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setExpanded((p) => ({ ...p, [it.key]: !p[it.key] }))}
                          className="text-[11px] font-bold text-neutral-500 hover:text-amber-700 inline-flex items-center gap-1"
                        >
                          <Truck size={11} />
                          {it.orders.length} {it.orders.length === 1 ? 'odběratel' : it.orders.length < 5 ? 'odběratelé' : 'odběratelů'}
                          <ChevronDown size={11} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {onShowOrders && (
                          <button
                            type="button"
                            onClick={() => onShowOrders(it.beer_id, it.package_id)}
                            className="text-[11px] font-bold text-neutral-500 hover:text-amber-700 inline-flex items-center gap-1"
                          >
                            Zobrazit objednávky
                            <ArrowRight size={11} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0 w-[100px]">
                      <div className={`font-mono font-black text-xl leading-none ${hotovo ? 'text-emerald-600' : 'text-amber-700'}`}>
                        {hotovo ? '✓' : it.missing}
                      </div>
                      <div className="text-[10px] font-bold text-neutral-500 mt-1">
                        {it.done} / {it.ordered} ks
                      </div>
                      {it.checked > 0 && (
                        <div className="text-[10px] font-bold text-emerald-700 mt-0.5" title="Ručně odškrtnuto — nezapisuje se do stáčení">
                          ✓ {it.checked} odškrtnuto
                        </div>
                      )}
                    </div>

                    {canEdit && !isWeek && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {it.checked > 0 && (
                          <button
                            type="button"
                            disabled={busy === it.key}
                            onClick={() => setCheck(it, it.checked - 1)}
                            className="px-2.5 py-2 rounded border border-neutral-200 bg-white text-neutral-700 font-black text-xs hover:bg-neutral-50 disabled:opacity-40 min-h-[38px]"
                            title="Ubrat jeden odškrtnutý sud"
                          >
                            −1
                          </button>
                        )}
                        {!hotovo && (
                          <button
                            type="button"
                            disabled={busy === it.key}
                            onClick={() => setCheck(it, it.checked + 1)}
                            className="px-2.5 py-2 rounded border border-neutral-200 bg-white text-neutral-700 font-black text-xs hover:bg-neutral-50 disabled:opacity-40 min-h-[38px]"
                            title="Odškrtnout jeden sud"
                          >
                            +1
                          </button>
                        )}
                        {!hotovo ? (
                          <button
                            type="button"
                            disabled={busy === it.key}
                            onClick={() => setCheck(it, it.ordered)}
                            className="px-3 py-2 rounded bg-emerald-600 text-white font-black text-xs hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1.5 min-h-[38px]"
                            title="Odškrtnout celou položku — nezapisuje se do stáčení"
                          >
                            <Check size={14} />
                            {busy === it.key ? 'Ukládám…' : `Mám (${it.missing})`}
                          </button>
                        ) : it.checked > 0 ? (
                          <button
                            type="button"
                            disabled={busy === it.key}
                            onClick={() => setCheck(it, 0)}
                            className="px-3 py-2 rounded border border-emerald-300 bg-emerald-50 text-emerald-800 font-black text-xs hover:bg-emerald-100 disabled:opacity-40 min-h-[38px]"
                            title="Zrušit odškrtnutí"
                          >
                            Zrušit ✓
                          </button>
                        ) : null}
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
