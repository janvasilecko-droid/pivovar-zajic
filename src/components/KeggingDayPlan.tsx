// 🗓️ „Co stočit na který den" — tabule stáčení uspořádaná jako Závoz.
// ---------------------------------------------------------------------------
// Kliknu na den → vidím, co a kolik sudů je na ten den potřeba, kolik už mám
// hotovo a kolik ještě chybí. Používá se stejně pro KEGy i pro lahve.
//
// Stáčí se u linky s telefonem v ruce, takže se to skládá odshora dolů, ne
// do sloupců: nejdřív co dělat (přepínač dnů zůstává nahoře i při rolování),
// pak seznam, kde je na každé položce vidět velké číslo „kolik zbývá" a pod
// ním tlačítka na odškrtnutí. Vedle sebe zůstávají věci až od šířky tabletu.
//
// ⚠️ Odškrtávátko NEZAPISUJE stáčení. Je to pracovní pomůcka, aby stáčeč
// viděl, co už má hotové; skutečné stáčení se dál zapisuje v „Začátek
// stáčení". Kdyby odškrtnutí zakládalo záznam do `kegging`, vznikl by při
// běžném zápisu duplicitní řádek a sklad i objem tanku by se nafoukly.
// Odškrtnutí se ukládá do kegging_plan_checks a s doloženým stavem se skládá
// přes MAX — viz lib/keggingPlan.ts.
import { useMemo, useState } from 'react';
import { CalendarDays, Check, Beer, Truck, ChevronDown, ArrowRight, Search, X } from 'lucide-react';
import type { DayPlan, PlanItem } from '../lib/keggingPlan';
import { dayKeyFromISO, mergeWeekPlan } from '../lib/keggingPlan';
import { IkonaSud } from './ikony';

type Props = {
  plans: DayPlan[];
  /** Jak se říká kusům — „sudů" u KEGů, „ks" u lahví. */
  jednotka?: string;
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

/** Porovnání bez diakritiky — hledá se jedním prstem, háčky nikdo nepíše. */
const bezDiakritiky = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function KeggingDayPlan({ plans, weekLabel, todayISO, onCheck, canEdit, onShowOrders, jednotka = 'sudů' }: Props) {
  const todayDay = dayKeyFromISO(todayISO);
  // Otevře se rovnou nejbližší den, kde ještě něco chybí — stáčeč většinou
  // řeší ten, ne pondělí.
  const firstOpen = plans.find((p) => p.totalMissing > 0)?.day;
  const [selected, setSelected] = useState<string>(firstOpen ?? todayDay);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hledat, setHledat] = useState('');
  const [jenChybi, setJenChybi] = useState(false);

  // Souhrn za celý týden — sečtený z těch samých denních dat, takže se s nimi
  // nemůže rozejít (bývalá záložka „Potřeba stočit KEGy" ho počítala jinou
  // cestou a ukazovala jiná čísla).
  const weekPlan = useMemo(() => mergeWeekPlan(plans, weekLabel), [plans, weekLabel]);
  const weekTotals = {
    missing: weekPlan.totalMissing,
    ordered: weekPlan.totalOrdered,
    liters: weekPlan.missingLiters,
  };
  const hotovoCelkem = weekTotals.ordered - weekTotals.missing;
  const procenta = weekTotals.ordered > 0 ? Math.round((hotovoCelkem / weekTotals.ordered) * 100) : 0;

  const active = selected === 'tyden' ? weekPlan : (plans.find((p) => p.day === selected) ?? plans[0]);
  const isWeek = active.day === 'tyden';

  // Filtrování běží až nad vybraným dnem, ne nad celým týdnem — čísla
  // v hlavičce dne proto zůstávají pravdivá i při zapnutém filtru.
  const dotaz = bezDiakritiky(hledat.trim());
  const polozky = active.items.filter((it) => {
    if (jenChybi && it.missing === 0) return false;
    if (!dotaz) return true;
    return bezDiakritiky(`${it.beer_name} ${it.package_label}`).includes(dotaz);
  });
  const skryto = active.items.length - polozky.length;

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
    <div className="space-y-3">
      {/* ── Souhrn za týden ─────────────────────────────────────────────
          Na telefonu jeden proužek: tři karty pod sebou by zabraly celou
          obrazovku dřív, než by bylo vidět, co se má vlastně stočit.
          Od tabletu výš zůstávají karty. */}
      <div className="sm:hidden rounded border border-neutral-200/90 bg-white px-3.5 py-2.5 shadow-xs">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-display font-black text-neutral-900">
            {weekTotals.missing > 0 ? (
              <>Zbývá <span className="text-amber-700">{weekTotals.missing}</span> {jednotka}</>
            ) : (
              <span className="text-emerald-700">Celý týden je stočený</span>
            )}
          </div>
          <div className="text-[11px] font-black text-neutral-500 shrink-0">
            {hotovoCelkem} / {weekTotals.ordered}
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden mt-1.5">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${procenta}%` }} />
        </div>
      </div>

      <div className="hidden sm:grid grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded border border-neutral-200/90 shadow-xs">
          <div className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Objednáno tento týden</div>
          <div className="font-display font-black text-2xl text-neutral-900 mt-0.5">{weekTotals.ordered} <span className="text-sm font-bold text-neutral-500">ks {jednotka}</span></div>
          <div className="text-[11px] font-bold text-neutral-500 mt-0.5">{weekLabel}</div>
        </div>
        <div className={`p-4 rounded border shadow-xs ${weekTotals.missing > 0 ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-300'}`}>
          <div className={`text-[11px] font-black uppercase tracking-wide ${weekTotals.missing > 0 ? 'text-amber-800' : 'text-emerald-800'}`}>Zbývá stočit</div>
          <div className={`font-display font-black text-2xl mt-0.5 ${weekTotals.missing > 0 ? 'text-amber-900' : 'text-emerald-900'}`}>
            {weekTotals.missing} <span className="text-sm font-bold opacity-70">ks {jednotka}</span>
          </div>
          <div className={`text-[11px] font-bold mt-0.5 ${weekTotals.missing > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {weekTotals.missing > 0 ? `${(weekTotals.liters / 100).toFixed(1)} hl / ${weekTotals.liters} L` : 'Všechno je stočené'}
          </div>
        </div>
        <div className="bg-white p-4 rounded border border-neutral-200/90 shadow-xs">
          <div className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Hotovo</div>
          <div className="font-display font-black text-2xl text-emerald-700 mt-0.5">
            {hotovoCelkem}<span className="text-sm font-bold text-neutral-500"> / {weekTotals.ordered}</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-200 overflow-hidden mt-2">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${procenta}%` }} />
          </div>
        </div>
      </div>

      {/* ── Přepínač dnů — drží se nahoře ───────────────────────────────
          Seznam položek bývá delší než obrazovka a při rolování se ztrácelo,
          na který den se člověk vlastně dívá. Podklad musí být neprůhledný,
          jinak pod pruhem prosvítá seznam. */}
      <div className="sticky top-0 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 bg-neutral-50 py-2 border-b border-neutral-200/70 sm:border-b-0">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setSelected('tyden')}
            className={`px-3.5 py-2 rounded font-black text-xs shrink-0 transition-all flex items-center gap-1.5 shadow-xs min-h-[46px] ${
              isWeek
                ? 'bg-amber-500 text-neutral-950'
                : 'bg-white text-amber-900 border border-amber-200 hover:bg-amber-50'
            }`}
          >
            <CalendarDays size={14} />
            <span>Celý týden</span>
            {weekTotals.missing > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-black ${isWeek ? 'bg-neutral-950 text-amber-300' : 'bg-amber-300 text-amber-950'}`}>
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
                    ? 'bg-amber-500 text-neutral-950'
                    : p.totalMissing > 0
                    ? 'bg-white text-amber-900 border border-amber-200 hover:bg-amber-50'
                    : hotovo
                    ? 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
                    : 'bg-neutral-200 text-neutral-600'
                }`}
              >
                <div className="flex flex-col items-start leading-tight">
                  <span className="flex items-center gap-1">
                    {p.day === todayDay && <span className="w-1.5 h-1.5 rounded-full bg-current" title="Dnes" />}
                    {p.label}
                  </span>
                  <span className="text-[11px] font-bold opacity-70">{fmtDate(p.date)}</span>
                </div>
                {p.totalMissing > 0 ? (
                  <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-black ${isSel ? 'bg-neutral-950 text-amber-300' : 'bg-amber-300 text-amber-950'}`}>
                    {p.totalMissing}
                  </span>
                ) : hotovo ? (
                  <Check size={14} className="shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Seznam na vybraný den ───────────────────────────────────────── */}
      <div className="bg-white rounded border border-neutral-200/90 shadow-xs overflow-hidden">
        <div className="p-3.5 border-b border-neutral-200/80 bg-neutral-50/60 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-display font-black text-neutral-950 flex items-center gap-2">
                <CalendarDays size={17} className="text-amber-600 shrink-0" />
                <span className="min-w-0">{isWeek ? `Stočit za celý týden ${active.label}` : `Stočit na ${active.label} ${fmtDate(active.date)}`}</span>
              </h3>
              <p className="text-[11px] font-bold text-neutral-500 mt-0.5">
                {active.totalOrdered === 0
                  ? isWeek ? 'Tenhle týden zatím není žádná objednávka.' : 'Na tenhle den není žádná objednávka.'
                  : active.totalMissing === 0
                  ? isWeek ? 'Hotovo — celý týden je stočený.' : 'Hotovo — všechno na tenhle den je stočené.'
                  : `Chybí ${active.totalMissing} ks (${active.missingLiters} L).${isWeek ? '' : ' Odškrtávátko je jen přehled — stáčení se zapisuje v „Začátek stáčení".'}`}
              </p>
            </div>
            {active.totalOrdered > 0 && (
              <span className={`px-3 py-1 rounded-full font-mono font-black text-sm shrink-0 ${active.totalMissing > 0 ? 'bg-amber-500 text-neutral-950' : 'bg-emerald-700 text-white'}`}>
                {active.totalMissing > 0 ? `${active.totalMissing} ks` : <Check className="ikona-text" />}
              </span>
            )}
          </div>

          {/* Hledání a filtr. Denní seznam má běžně přes deset položek
              a odscrollovat se k jednomu pivu na telefonu trvá dýl,
              než ho napsat. */}
          {active.items.length > 3 && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  value={hledat}
                  onChange={(e) => setHledat(e.target.value)}
                  placeholder="Hledat pivo nebo obal…"
                  className="input w-full text-xs font-bold pl-8 pr-8 min-h-[44px] rounded border border-neutral-200"
                />
                {hledat && (
                  <button
                    type="button"
                    onClick={() => setHledat('')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded text-neutral-600 hover:bg-neutral-100"
                    title="Zrušit hledání"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setJenChybi(!jenChybi)}
                className={`px-3 min-h-[44px] rounded font-black text-xs shrink-0 border transition ${
                  jenChybi
                    ? 'bg-amber-500 text-neutral-950 border-amber-600'
                    : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'
                }`}
                title="Schovat položky, které jsou hotové"
              >
                Jen co chybí
              </button>
            </div>
          )}
        </div>

        {active.items.length === 0 ? (
          <div className="p-8 text-center text-neutral-400 font-bold text-sm">
            <Beer size={30} className="mx-auto mb-2 opacity-40" />
            Na {active.label} nejsou žádné objednávky.
          </div>
        ) : polozky.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 font-bold text-sm">
            {jenChybi && !dotaz
              ? 'Na tenhle den je všechno stočené.'
              : `Hledání „${hledat}" nic nenašlo.`}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => { setHledat(''); setJenChybi(false); }}
                className="px-3 min-h-[44px] rounded border border-neutral-200 bg-white font-black text-xs hover:bg-neutral-50"
              >
                Zrušit filtr
              </button>
            </div>
          </div>
        ) : (
          <>
            {skryto > 0 && (
              <div className="px-3.5 py-1.5 text-[11px] font-bold text-neutral-500 bg-neutral-50/80 border-b border-neutral-100">
                Filtr schoval {skryto} {skryto === 1 ? 'položku' : skryto < 5 ? 'položky' : 'položek'}.
              </div>
            )}
            <ul className="divide-y divide-neutral-100">
              {polozky.map((it) => {
                const hotovo = it.missing === 0;
                const isOpen = !!expanded[it.key];
                return (
                  <li key={it.key} className={hotovo ? 'bg-emerald-50/40' : ''}>
                    {/* Řádek 1: co stočit + kolik zbývá.
                        Na telefonu jsou to dva bloky vedle sebe a nic víc —
                        tlačítka jsou pod tím na celou šířku, aby se do nich
                        dalo trefit palcem. */}
                    <div className="flex items-start gap-3 p-3.5 pb-2.5">
                      <div className={`w-10 h-10 rounded grid place-items-center shrink-0 ${hotovo ? 'bg-emerald-700 text-white' : 'bg-amber-100 text-amber-700'}`}>
                        {hotovo ? <Check size={20} /> : <IkonaSud size={19} />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-display font-black text-sm text-neutral-900 leading-tight">
                          {it.beer_name} <span className="text-neutral-500">{it.package_label.trim()}</span>
                        </div>
                        <div className="text-[11px] font-bold text-neutral-500 mt-0.5">
                          {it.done} / {it.ordered} ks hotovo
                          {it.checked > 0 && (
                            <span className="text-emerald-700" title="Ručně odškrtnuto — nezapisuje se do stáčení">
                              {' '}· <Check className="ikona-text" /> {it.checked} odškrtnuto
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className={`font-mono font-black text-2xl leading-none ${hotovo ? 'text-emerald-600' : 'text-amber-700'}`}>
                          {hotovo ? <Check className="ikona-text" /> : it.missing}
                        </div>
                        {!hotovo && <div className="text-[11px] font-black text-neutral-400 uppercase mt-0.5">zbývá</div>}
                      </div>
                    </div>

                    <div className="sm:flex sm:items-center sm:gap-2 sm:pb-3">
                    {/* Řádek 2: odškrtávání. „Mám vše" zabere zbytek šířky,
                        −1 a +1 jsou čtverce 44×44 — dají se trefit prstem.
                        U hotové položky, kterou nikdo neodškrtával ručně, se
                        řádek NEKRESLÍ vůbec: −, + i „Hotovo" jsou tam všechny
                        tři neaktivní a hotovo už říká zelený čtvereček vlevo
                        a zelená fajfka vpravo. Trojí „hotovo" na jednom řádku
                        znamená 44 px na položku, u dvaceti stočených položek
                        téměř celou obrazovku mrtvého místa. */}
                    {canEdit && !isWeek && !(hotovo && it.checked === 0) && (
                      <div className="flex items-stretch gap-1.5 px-3.5 pb-2.5 sm:pb-0 sm:flex-1 sm:max-w-xs">
                        <button
                          type="button"
                          disabled={busy === it.key || it.checked === 0}
                          onClick={() => setCheck(it, it.checked - 1)}
                          className="w-11 min-h-[44px] grid place-items-center rounded border border-neutral-200 bg-white text-neutral-700 font-black hover:bg-neutral-50 disabled:opacity-30 shrink-0"
                          title="Ubrat jeden odškrtnutý kus"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          disabled={busy === it.key || hotovo}
                          onClick={() => setCheck(it, it.checked + 1)}
                          className="w-11 min-h-[44px] grid place-items-center rounded border border-neutral-200 bg-white text-neutral-700 font-black hover:bg-neutral-50 disabled:opacity-30 shrink-0"
                          title="Odškrtnout jeden kus"
                        >
                          +
                        </button>
                        {!hotovo ? (
                          <button
                            type="button"
                            disabled={busy === it.key}
                            onClick={() => setCheck(it, it.ordered)}
                            className="flex-1 min-h-[44px] rounded bg-emerald-700 text-white font-black text-xs hover:bg-emerald-800 disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
                            title="Odškrtnout celou položku — nezapisuje se do stáčení"
                          >
                            <Check size={15} />
                            {busy === it.key ? 'Ukládám…' : `Mám všech ${it.missing}`}
                          </button>
                        ) : it.checked > 0 ? (
                          <button
                            type="button"
                            disabled={busy === it.key}
                            onClick={() => setCheck(it, 0)}
                            className="flex-1 min-h-[44px] rounded border border-emerald-300 bg-emerald-50 text-emerald-800 font-black text-xs hover:bg-emerald-100 disabled:opacity-40"
                            title="Zrušit odškrtnutí"
                          >
                            Zrušit odškrtnutí
                          </button>
                        ) : null}
                      </div>
                    )}

                    {/* Řádek 3: pro koho to je. Celá šířka, ať se dá otevřít
                        prstem — dřív to byl jedenáctibodový text vedle textu. */}
                    <div className="flex items-stretch gap-1.5 px-3.5 pb-3 sm:pb-0 sm:flex-1 sm:max-w-xs">
                      <button
                        type="button"
                        onClick={() => setExpanded((p) => ({ ...p, [it.key]: !p[it.key] }))}
                        className="flex-1 min-h-[44px] px-3 rounded border border-neutral-200 bg-neutral-50 text-neutral-600 font-bold text-[11px] inline-flex items-center justify-between gap-1.5 hover:bg-neutral-100"
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Truck size={12} />
                          {it.orders.length} {it.orders.length === 1 ? 'odběratel' : it.orders.length < 5 ? 'odběratelé' : 'odběratelů'}
                        </span>
                        <ChevronDown size={13} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {onShowOrders && (
                        <button
                          type="button"
                          onClick={() => onShowOrders(it.beer_id, it.package_id)}
                          className="min-h-[44px] px-3 rounded border border-neutral-200 bg-neutral-50 text-neutral-600 font-bold text-[11px] inline-flex items-center gap-1.5 hover:bg-neutral-100 shrink-0"
                        >
                          Objednávky
                          <ArrowRight size={12} />
                        </button>
                      )}
                    </div>

                    </div>

                    {isOpen && (
                      <ul className="px-3.5 pb-3 -mt-1 space-y-1">
                        {it.orders.map((o, i) => (
                          <li key={`${o.order_id}-${i}`} className="flex items-center justify-between gap-2 text-[11px] font-bold px-3 py-2 rounded bg-neutral-50 border border-neutral-100">
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
          </>
        )}
      </div>
    </div>
  );
}
