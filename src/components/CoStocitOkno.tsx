// 🍺 Okno „Co stočit" na úvodní stránce — co je potřeba stočit dnes, na
// vybraný den nebo za celý týden, zvlášť pro sudy (KEG) a pro lahve.
// ---------------------------------------------------------------------------
// Čísla jsou z téhož výpočtu jako „Co stočit na který den" na obrazovkách
// Sudy a Lahve (lib/keggingPlan.ts) — plocha a obrazovka stáčení se tak
// nemůžou rozejít. Načítá se jen aktuální týden, ne celá historie: plocha se
// otevírá nejčastěji ze všech obrazovek.
//
// Volba sudy/lahve, týden/dnes a sbalení okna se pamatuje v telefonu.
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase, fetchAllRows, useRealtime, beerBg } from '../lib/supabase';
import { businessDateISO } from '../lib/businessDate';
import { isoWeekKey, weekRange } from './WeeklyOrderSummaryCard';
import { computeKeggingPlan, dayKeyFromISO, rozpadPoObalech, BEZ_TERMINU, type DayPlan } from '../lib/keggingPlan';
import { planProVyber, coZbyvaStocit } from '../lib/coStocit';
import { DAYS } from '../lib/shared';
import { uloz } from '../lib/uloziste';
import { IkonaSud, IkonaLahev } from './ikony';
import type { Page } from './Layout';

type Druh = 'sudy' | 'lahve';
const KLIC_DRUH = 'pivovar_costocit_druh';
const KLIC_OBDOBI = 'pivovar_costocit_obdobi';
const KLIC_SBALENO = 'pivovar_costocit_sbaleno';

const cti = (klic: string) => { try { return localStorage.getItem(klic); } catch { return null; } };

type Data = {
  beers: any[]; packages: any[]; orders: any[]; orderItems: any[];
  kegging: any[]; bottling: any[]; fasovani: any[]; prodejna: any[]; writeoffs: any[]; checks: any[];
};

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

  const [druh, setDruh] = useState<Druh>(() => {
    const ulozeny = cti(KLIC_DRUH);
    if (ulozeny === 'lahve' && lahve) return 'lahve';
    return sudy ? 'sudy' : 'lahve';
  });
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

  const plans: DayPlan[] = useMemo(() => {
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
  }, [data, druh, weekKey]);

  const plan = useMemo(() => planProVyber(plans, obdobi, weekLabel), [plans, obdobi, weekLabel]);
  const zbyva = useMemo(() => coZbyvaStocit(plan), [plan]);
  const rozpad = useMemo(() => rozpadPoObalech(plan).filter((r) => r.missing > 0), [plan]);
  const barvaPiva = useMemo(() => new Map((data?.beers ?? []).map((b) => [b.id, b])), [data]);

  const jednotka = druh === 'sudy' ? 'sudů' : 'ks';
  const nazevObdobi = obdobi === 'tyden'
    ? `tento týden (${weekLabel})`
    : obdobi === dnesniDen ? 'dnes' : `na ${DAYS.find((d) => d.v === obdobi)?.label ?? obdobi}`;

  function zvolDruh(d: Druh) { setDruh(d); uloz(KLIC_DRUH, d); }
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
          {druh === 'sudy' ? <IkonaSud className="shrink-0" /> : <IkonaLahev className="shrink-0" />}
          <span className="truncate">Co stočit {nazevObdobi}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          {data && (plan.totalMissing > 0 ? (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-xs tabular-nums">
              {plan.totalMissing} {jednotka}
            </span>
          ) : plan.totalOrdered > 0 ? (
            <span className="px-2 py-0.5 rounded-full bg-emerald-700 text-white font-black text-xs"><Check size={12} className="inline" /> hotovo</span>
          ) : null)}
          {sbaleno ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {!sbaleno && (
        <div className="px-3.5 pb-3 pt-2 space-y-2.5">
          {sudy && lahve && (
            <div className="flex gap-1.5">
              <button type="button" className={tlacitko(druh === 'sudy')} onClick={() => zvolDruh('sudy')}>
                <IkonaSud /> Sudy (KEG)
              </button>
              <button type="button" className={tlacitko(druh === 'lahve')} onClick={() => zvolDruh('lahve')}>
                <IkonaLahev /> Lahve
              </button>
            </div>
          )}

          <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
            <button type="button" className={tlacitko(obdobi === 'tyden')} onClick={() => zvolObdobi('tyden')}>
              <CalendarDays size={14} /> Týden
            </button>
            {DAYS.map((d) => {
              const p = plans.find((x) => x.day === d.v);
              return (
                <button key={d.v} type="button" className={tlacitko(obdobi === d.v)} onClick={() => zvolObdobi(d.v)}>
                  {d.v === dnesniDen ? 'Dnes' : d.label}
                  {p && p.totalMissing > 0 && (
                    <span className={`px-1.5 rounded-full text-udaj font-black ${obdobi === d.v ? 'bg-neutral-950 text-amber-300' : 'bg-amber-300 text-amber-950'}`}>
                      {p.totalMissing}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {chyba && !data ? (
            <p className="text-udaj font-bold text-red-700">Plán stáčení se nepodařilo načíst.</p>
          ) : !data ? (
            <p className="text-udaj font-bold text-neutral-500">Načítám…</p>
          ) : zbyva.length === 0 ? (
            <p className="text-sm font-bold text-emerald-700">
              {plan.totalOrdered > 0 ? 'Všechno je stočené.' : 'Nic k stočení — žádné objednávky.'}
            </p>
          ) : (
            <>
              {rozpad.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {rozpad.map((r) => (
                    <span key={r.package_id} className="chip bg-amber-100 text-amber-950 border-amber-300 font-black">
                      {r.package_label}
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-neutral-950 tabular-nums">{r.missing}</span>
                    </span>
                  ))}
                </div>
              )}
              <ul className="divide-y divide-neutral-100">
                {zbyva.map((it) => (
                  <li key={it.key} className="flex items-center gap-2 py-1.5">
                    <span className="w-3 h-3 rounded-full shrink-0 border border-neutral-300" style={{ background: beerBg(barvaPiva.get(it.beer_id)) }} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-900">{it.beer_name}</span>
                    <span className="text-udaj font-bold text-neutral-500 shrink-0">{it.package_label}</span>
                    <span className="font-display font-black text-amber-700 tabular-nums shrink-0 w-10 text-right">{it.missing}×</span>
                  </li>
                ))}
              </ul>
              {obdobi === 'tyden' && plans.find((p) => p.day === BEZ_TERMINU)?.totalMissing ? (
                <p className="text-udaj font-bold text-neutral-500">
                  Včetně {plans.find((p) => p.day === BEZ_TERMINU)!.totalMissing} {jednotka} z objednávek bez dne dovozu.
                </p>
              ) : null}
            </>
          )}

          <button
            type="button"
            onClick={() => setPage(druh === 'sudy' ? 'kegging' : 'bottling', undefined, 'plan')}
            className="text-xs font-black text-amber-800 hover:underline"
          >
            Otevřít plán stáčení →
          </button>
        </div>
      )}
    </section>
  );
}
