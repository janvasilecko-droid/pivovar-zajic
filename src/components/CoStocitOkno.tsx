// 🍺 Tabulka „Co stočit" na úvodní stránce — co je potřeba stočit dnes, na
// vybraný den nebo za celý týden. Sudy (KEG) i lahve najednou, pod sebou,
// ať se nemusí přepínat.
// ---------------------------------------------------------------------------
// Čísla jsou z téhož výpočtu jako „Co stočit na který den" na obrazovkách
// Sudy a Lahve (lib/keggingPlan.ts) — plocha a obrazovka stáčení se tak
// nemůžou rozejít. Načítá se jen aktuální týden, ne celá historie: plocha se
// otevírá nejčastěji ze všech obrazovek.
//
// Volba týden/dnes a sbalení okna se pamatuje v telefonu.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase, fetchAllRows, useRealtime, beerBg } from '../lib/supabase';
import { businessDateISO } from '../lib/businessDate';
import { isoWeekKey, weekRange } from './WeeklyOrderSummaryCard';
import { computeKeggingPlan, dayKeyFromISO, BEZ_TERMINU, type DayPlan, type PlanItem } from '../lib/keggingPlan';
import { planProVyber } from '../lib/coStocit';
import { DAYS } from '../lib/shared';
import { uloz } from '../lib/uloziste';
import { IkonaSud, IkonaLahev } from './ikony';
import type { Page } from './Layout';

type Druh = 'sudy' | 'lahve';
const KLIC_OBDOBI = 'pivovar_costocit_obdobi';
const KLIC_SBALENO = 'pivovar_costocit_sbaleno';

const cti = (klic: string) => { try { return localStorage.getItem(klic); } catch { return null; } };

type Data = {
  beers: any[]; packages: any[]; orders: any[]; orderItems: any[];
  kegging: any[]; bottling: any[]; fasovani: any[]; prodejna: any[]; writeoffs: any[]; checks: any[];
};

/** Všechno objednané v období — nejdřív to, kde něco chybí (nejvíc nahoře), stočené dole. */
function radkyTabulky(plan: DayPlan): PlanItem[] {
  return plan.items
    .filter((it) => it.ordered > 0)
    .sort((a, z) => z.missing - a.missing || a.beer_name.localeCompare(z.beer_name, 'cs') || z.volume_l - a.volume_l);
}

export default function CoStocitOkno({ setPage, sudy, lahve }: {
  setPage: (p: Page, targetSection?: string, subTab?: string) => void;
  /** Smí uživatel vidět stáčení sudů / lahví. */
  sudy: boolean;
  lahve: boolean;
}) {
  const dnes = businessDateISO();
  const weekKey = isoWeekKey(dnes);
  const { start, label: weekLabel } = weekRange(weekKey);
  const zacatekTydne = start.toISOString().slice(0, 10);
  const dnesniDen = dayKeyFromISO(dnes);

  // 'tyden' nebo den v týdnu. Pamatuje se jen týden/dnes — konkrétní jiný
  // den by příští otevření ukázalo jako „dnes" a mátlo by to.
  const [obdobi, setObdobi] = useState<string>(() => (cti(KLIC_OBDOBI) === 'tyden' ? 'tyden' : dnesniDen));
  const [sbaleno, setSbaleno] = useState(() => cti(KLIC_SBALENO) === '1');
  const [data, setData] = useState<Data | null>(null);
  const [chyba, setChyba] = useState(false);

  async function nacti() {
    try {
      const [b, p, o, k, bt, fa, fp, wo, pc] = await Promise.all([
        supabase.from('beers').select('id,name,beer_color'),
        supabase.from('packages').select('id,label,kind,volume_l'),
        // Objednávka patří do týdne podle data dovozu, a když chybí, podle
        // data zadání — obojí musí být od pondělí dál.
        fetchAllRows('orders', 'id,order_date,delivery_date,delivery_day,place_name,status,is_delivered')
          .or(`delivery_date.gte.${zacatekTydne},order_date.gte.${zacatekTydne}`),
        fetchAllRows('kegging', 'entry_date,beer_id,package_id,quantity').gte('entry_date', zacatekTydne),
        fetchAllRows('bottling', 'entry_date,beer_id,package_id,quantity').gte('entry_date', zacatekTydne),
        fetchAllRows('fasovani', 'entry_date,beer_id,package_id,quantity').gte('entry_date', zacatekTydne),
        fetchAllRows('fasovani_private', 'entry_date,beer_id,package_id,quantity').gte('entry_date', zacatekTydne),
        fetchAllRows('writeoffs', 'entry_date,beer_id,package_id,quantity').gte('entry_date', zacatekTydne),
        fetchAllRows('kegging_plan_checks', 'week_key,day,beer_id,package_id,qty').eq('week_key', weekKey),
      ]);
      const orders = (o.data as any[]) ?? [];
      const ids = orders.map((x) => x.id);
      // `*`: delivery_day položky nemusí na starší databázi existovat (viz Kegging.tsx).
      const oi = ids.length ? await fetchAllRows('order_items', '*').in('order_id', ids) : { data: [], error: null };
      if (b.error || p.error || o.error || oi.error) { setChyba(true); return; }
      setChyba(false);
      setData({
        beers: b.data ?? [], packages: p.data ?? [], orders, orderItems: oi.data ?? [],
        kegging: k.data ?? [], bottling: bt.data ?? [], fasovani: fa.data ?? [], prodejna: fp.data ?? [],
        writeoffs: wo.data ?? [], checks: pc.data ?? [],
      });
    } catch {
      setChyba(true);
    }
  }
  useEffect(() => { void nacti(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [weekKey]);
  useRealtime(['orders', 'order_items', 'kegging', 'bottling', 'fasovani', 'fasovani_private', 'writeoffs', 'kegging_plan_checks'], () => { void nacti(); });

  const planyDruhu = (druh: Druh): DayPlan[] => {
    if (!data) return [];
    return computeKeggingPlan({
      beers: data.beers,
      packages: data.packages,
      orders: data.orders,
      orderItems: data.orderItems,
      keggingRows: druh === 'sudy' ? data.kegging : data.bottling,
      fasovaniRows: data.fasovani,
      prodejnaRows: data.prodejna,
      writeoffsRows: data.writeoffs,
      checkRows: data.checks,
      weekKey,
      jeCilovyObal: druh === 'sudy' ? (kind) => kind === 'keg' : (kind) => kind !== 'keg',
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const planySudy = useMemo(() => (sudy ? planyDruhu('sudy') : []), [data, sudy, weekKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const planyLahve = useMemo(() => (lahve ? planyDruhu('lahve') : []), [data, lahve, weekKey]);

  const planSudy = useMemo(() => planProVyber(planySudy, obdobi, weekLabel), [planySudy, obdobi, weekLabel]);
  const planLahve = useMemo(() => planProVyber(planyLahve, obdobi, weekLabel), [planyLahve, obdobi, weekLabel]);
  const barvaPiva = useMemo(() => new Map((data?.beers ?? []).map((b) => [b.id, b])), [data]);

  const oddily = [
    ...(sudy ? [{ druh: 'sudy' as Druh, nazev: 'Sudy (KEG)', jednotka: 'sudů', plan: planSudy, plany: planySudy }] : []),
    ...(lahve ? [{ druh: 'lahve' as Druh, nazev: 'Lahve', jednotka: 'ks', plan: planLahve, plany: planyLahve }] : []),
  ];
  const chybiCelkem = planSudy.totalMissing + planLahve.totalMissing;
  const objednanoCelkem = planSudy.totalOrdered + planLahve.totalOrdered;

  const nazevObdobi = obdobi === 'tyden'
    ? `tento týden (${weekLabel})`
    : obdobi === dnesniDen ? 'dnes' : `na ${DAYS.find((d) => d.v === obdobi)?.label ?? obdobi}`;

  function zvolObdobi(o: string) {
    setObdobi(o);
    if (o === 'tyden' || o === dnesniDen) uloz(KLIC_OBDOBI, o === 'tyden' ? 'tyden' : 'dnes');
  }
  function prepniSbaleni() {
    setSbaleno((s) => { uloz(KLIC_SBALENO, s ? '0' : '1'); return !s; });
  }

  const tlacitko = (aktivni: boolean) =>
    `px-3 py-1.5 rounded font-black text-xs shrink-0 flex items-center gap-1.5 min-h-[36px] transition ${
      aktivni ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-white text-neutral-700 border border-neutral-200 hover:bg-amber-50'
    }`;

  return (
    <section className="bg-white rounded border border-neutral-200/90 shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={prepniSbaleni}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left bg-neutral-50/60"
        aria-expanded={!sbaleno}
      >
        <span className="font-display font-black text-neutral-950 flex items-center gap-2 min-w-0">
          <IkonaSud className="shrink-0" />
          <span className="truncate">Co stočit {nazevObdobi}</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {data && (chybiCelkem > 0 ? oddily.filter((o) => o.plan.totalMissing > 0).map((o) => (
            <span key={o.druh} className="px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-xs tabular-nums flex items-center gap-1">
              {o.druh === 'sudy' ? <IkonaSud size={12} /> : <IkonaLahev size={12} />}
              {o.plan.totalMissing}
            </span>
          )) : objednanoCelkem > 0 ? (
            <span className="px-2 py-0.5 rounded-full bg-emerald-700 text-white font-black text-xs"><Check size={12} className="inline" /> hotovo</span>
          ) : null)}
          {sbaleno ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {!sbaleno && (
        <div className="px-3.5 pb-3 pt-2 space-y-2.5">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            <button type="button" className={tlacitko(obdobi === 'tyden')} onClick={() => zvolObdobi('tyden')}>
              <CalendarDays size={14} /> Týden
            </button>
            {DAYS.map((d) => {
              const chybi = (planySudy.find((x) => x.day === d.v)?.totalMissing ?? 0)
                + (planyLahve.find((x) => x.day === d.v)?.totalMissing ?? 0);
              return (
                <button key={d.v} type="button" className={tlacitko(obdobi === d.v)} onClick={() => zvolObdobi(d.v)}>
                  {d.v === dnesniDen ? 'Dnes' : d.label}
                  {chybi > 0 && (
                    <span className={`px-1.5 rounded-full text-udaj font-black ${obdobi === d.v ? 'bg-neutral-950 text-amber-300' : 'bg-amber-300 text-amber-950'}`}>
                      {chybi}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {chyba && !data ? (
            <p className="text-udaj font-bold text-rose-700">Plán stáčení se nepodařilo načíst.</p>
          ) : !data ? (
            <p className="text-udaj font-bold text-neutral-500">Načítám…</p>
          ) : objednanoCelkem === 0 ? (
            <p className="text-sm font-bold text-emerald-700">Nic k stočení — žádné objednávky.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-udaj font-black uppercase text-neutral-500 border-b border-neutral-200">
                    <th className="text-left py-1 pr-2">Pivo</th>
                    <th className="text-left py-1 pr-2">Obal</th>
                    <th className="text-right py-1 pr-2">Objednáno</th>
                    <th className="text-right py-1">Stočit</th>
                  </tr>
                </thead>
                <tbody>
                  {oddily.map((o) => {
                    const radky = radkyTabulky(o.plan);
                    const bezTerminu = obdobi === 'tyden' ? o.plany.find((p) => p.day === BEZ_TERMINU)?.totalMissing ?? 0 : 0;
                    return (
                      <Fragment key={o.druh}>
                        <tr className="bg-neutral-50">
                          <td colSpan={4} className="py-1.5 px-1">
                            <button
                              type="button"
                              onClick={() => setPage(o.druh === 'sudy' ? 'kegging' : 'bottling', undefined, 'plan')}
                              className="w-full flex items-center justify-between gap-2 font-display font-black text-neutral-950 min-h-[44px]"
                            >
                              <span className="flex items-center gap-1.5">
                                {o.druh === 'sudy' ? <IkonaSud /> : <IkonaLahev />} {o.nazev}
                              </span>
                              <span className={`text-xs tabular-nums ${o.plan.totalMissing > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
                                {o.plan.totalMissing > 0 ? `chybí ${o.plan.totalMissing} ${o.jednotka} →` : radky.length ? 'hotovo →' : 'nic →'}
                              </span>
                            </button>
                          </td>
                        </tr>
                        {radky.map((it) => (
                          <tr key={it.key} className={`border-b border-neutral-100 ${it.missing > 0 ? '' : 'text-neutral-400'}`}>
                            <td className="py-1.5 pr-2 max-w-0 w-full">
                              <span className="flex items-center gap-2 min-w-0">
                                <span className="w-3 h-3 rounded-full shrink-0 border border-neutral-300" style={{ background: beerBg(barvaPiva.get(it.beer_id)) }} />
                                <span className={`truncate font-bold ${it.missing > 0 ? 'text-neutral-900' : ''}`}>{it.beer_name}</span>
                              </span>
                            </td>
                            <td className="py-1.5 pr-2 whitespace-nowrap text-udaj font-bold">{it.package_label}</td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">{it.ordered}</td>
                            <td className="py-1.5 text-right tabular-nums font-display font-black">
                              {it.missing > 0
                                ? <span className="text-amber-700">{it.missing}×</span>
                                : <Check size={14} className="inline text-emerald-700" aria-label="stočeno" />}
                            </td>
                          </tr>
                        ))}
                        {bezTerminu > 0 && (
                          <tr>
                            <td colSpan={4} className="py-1 text-udaj font-bold text-neutral-500">
                              Včetně {bezTerminu} {o.jednotka} z objednávek bez dne dovozu.
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
