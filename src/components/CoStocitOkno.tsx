// 🍺 Přehled „Co stočit" na úvodní stránce — co je potřeba stočit dnes, na
// vybraný den nebo za celý týden, sudy (KEG) i lahve najednou.
// ---------------------------------------------------------------------------
// Tvar je MATICE: jeden řádek = jedno pivo, sloupce = obaly (nejdřív sudy,
// pak lahve), v buňce kolik ještě chybí. Z provozu 14. 9. 2026: seznam
// „pivo × obal" pod sebou zabral při deseti pivech tři obrazovky a na
// telefonu byl vidět jen nadpis. Jde o přehled, proto se stočená piva
// nevypisují — jen se sečtou do řádku pod tabulkou.
//
// Čísla jsou z téhož výpočtu jako „Co stočit na který den" na obrazovkách
// Sudy a Lahve (lib/keggingPlan.ts) — plocha a obrazovka stáčení se tak
// nemůžou rozejít. Načítá se jen aktuální týden, ne celá historie.
//
// Volba týden/dnes a sbalení okna se pamatuje v telefonu.
import { useEffect, useMemo, useRef, useState } from 'react';
import { jeSud } from '../lib/inventoryFix';
import { AlertTriangle, CalendarDays, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase, fetchAllRows, useRealtime, beerBg, beerName } from '../lib/supabase';
import { businessDateISO } from '../lib/businessDate';
import { isoWeekKey, weekRange } from './WeeklyOrderSummaryCard';
import { computeKeggingPlan, dayKeyFromISO, BEZ_TERMINU, type DayPlan } from '../lib/keggingPlan';
import { zbytekKeKonciTydne } from '../lib/tydenniZbytek';
import { planProVyber, vychoziDenCoStocit, chybiMimoVyber as spoctiChybiMimoVyber } from '../lib/coStocit';
import { DAYS } from '../lib/shared';
import { uloz } from '../lib/uloziste';
import { IkonaSud, IkonaLahev } from './ikony';
import type { Page } from './Layout';
import { nactiSdilenouTabulku } from '../lib/sdilenaData';

type Druh = 'sudy' | 'lahve';
const KLIC_OBDOBI = 'pivovar_costocit_obdobi';
const KLIC_SBALENO = 'pivovar_costocit_sbaleno';

const cti = (klic: string) => { try { return localStorage.getItem(klic); } catch { return null; } };

type Data = {
  beers: any[]; packages: any[]; orders: any[]; orderItems: any[];
  kegging: any[]; bottling: any[]; fasovani: any[]; prodejna: any[]; writeoffs: any[]; checks: any[];
  // Skutečná zásoba skladem (currentStockMap, viz keggingPlan.ts) — na rozdíl
  // od výše (jen aktuální týden) potřebuje CELOU historii + inventuru.
  inventory: any[]; adjustments: any[]; akce: any[]; prefuk: any[]; zavozDeductions: any[];
};

type Sloupec = { package_id: string; label: string; druh: Druh; volume_l: number };
type Radek = { beer_id: string; chybi: Map<string, number>; objednano: Set<string>; celkem: number };

/** Popisek obalu do úzkého sloupce: „KEG 50l" → „50l", „Lahev 0,5l" → „0,5l". */
function kratkyObal(label: string): string {
  const m = label.match(/\d+(?:[,.]\d+)?\s*l\b/i);
  return m ? m[0].replace(/\s+/g, '') : label;
}

/**
 * Sestaví matici z plánu sudů a lahví za vybrané období. Sloupce jen pro
 * obaly, které někdo objednal; řádky jen pro piva, kde ještě něco chybí.
 */
export function sestavMatici(plany: { druh: Druh; plan: DayPlan }[]) {
  const sloupce = new Map<string, Sloupec>();
  const radky = new Map<string, Radek>();
  const hotovaPiva = new Set<string>();
  for (const { druh, plan } of plany) {
    for (const it of plan.items) {
      if (it.ordered <= 0) continue;
      if (!sloupce.has(it.package_id)) {
        sloupce.set(it.package_id, { package_id: it.package_id, label: kratkyObal(it.package_label), druh, volume_l: it.volume_l });
      }
      const r = radky.get(it.beer_id) ?? { beer_id: it.beer_id, chybi: new Map(), objednano: new Set(), celkem: 0 };
      r.objednano.add(it.package_id);
      if (it.missing > 0) {
        r.chybi.set(it.package_id, (r.chybi.get(it.package_id) ?? 0) + it.missing);
        r.celkem += it.missing;
      }
      radky.set(it.beer_id, r);
    }
  }
  for (const r of radky.values()) if (r.celkem === 0) hotovaPiva.add(r.beer_id);
  const serazeneSloupce = [...sloupce.values()].sort((a, z) =>
    (a.druh === z.druh ? 0 : a.druh === 'sudy' ? -1 : 1) || z.volume_l - a.volume_l);
  const serazeneRadky = [...radky.values()].filter((r) => r.celkem > 0).sort((a, z) => z.celkem - a.celkem);
  const soucty = new Map(serazeneSloupce.map((s) => [
    s.package_id, serazeneRadky.reduce((n, r) => n + (r.chybi.get(s.package_id) ?? 0), 0),
  ]));
  return { sloupce: serazeneSloupce, radky: serazeneRadky, soucty, hotovaPiva };
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
  //
  // Když si uživatel nic nezapamatoval, výchozí není dnešek, ale ZÍTŘEK
  // (vychoziDenCoStocit) — co jede zítra na zavoz, se musí stočit dneska.
  // Výslovná volba „Dnes"/„Týden" (uložená v localStorage) má přednost.
  const [obdobi, setObdobi] = useState<string>(() => {
    const ulozeno = cti(KLIC_OBDOBI);
    if (ulozeno === 'tyden') return 'tyden';
    if (ulozeno === 'dnes') return dnesniDen;
    return vychoziDenCoStocit(dnes);
  });
  const [sbaleno, setSbaleno] = useState(() => cti(KLIC_SBALENO) === '1');
  const [data, setData] = useState<Data | null>(null);
  const [chyba, setChyba] = useState(false);
  /** Klepl si uživatel sám na den? Pak mu ho automatika nesmí přehodit. */
  const rucniVyber = useRef(false);

  async function nacti() {
    try {
      // 📦 Kegging/bottling/fasování/prodejna/odpisy se čtou BEZ omezení na
      // aktuální týden — currentStockMap (skutečná zásoba skladem, viz níž)
      // potřebuje celou historii, jinak by neviděla nic stočeného dřív než
      // tenhle týden (z provozu 15. 9. 2026: „mám na skladě 9× 30l, appka
      // mi stejně píše, že musím stočit další").
      const [b, p, o, k, bt, fa, fp, wo, pc, inv, adj, ak, pf, zd, vsechnyPolozky] = await Promise.all([
        supabase.from('beers').select('*'),
        supabase.from('packages').select('id,label,kind,volume_l'),
        // Objednávka patří do týdne podle data dovozu, a když chybí, podle
        // data zadání — obojí musí být od pondělí dál.
        fetchAllRows('orders', 'id,order_date,delivery_date,delivery_day,place_name,status,is_delivered')
          .or(`delivery_date.gte.${zacatekTydne},order_date.gte.${zacatekTydne}`),
        nactiSdilenouTabulku('kegging'),
        nactiSdilenouTabulku('bottling'),
        nactiSdilenouTabulku('fasovani'),
        nactiSdilenouTabulku('fasovani_private'),
        nactiSdilenouTabulku('writeoffs'),
        fetchAllRows('kegging_plan_checks', 'week_key,day,beer_id,package_id,qty').eq('week_key', weekKey),
        nactiSdilenouTabulku('inventory'),
        nactiSdilenouTabulku('inventory_adjustments'),
        nactiSdilenouTabulku('akce'),
        nactiSdilenouTabulku('keg_prefuk'),
        nactiSdilenouTabulku('zavoz_deductions'),
        // Položky současně s objednávkami (bez druhého kola přes .in()) a ze
        // sdílené paměti — okno se otevírá ze Stáčení, kde už načtené jsou.
        nactiSdilenouTabulku('order_items'),
      ]);
      const orders = (o.data as any[]) ?? [];
      const ids = new Set(orders.map((x) => x.id));
      const oi = { data: ((vsechnyPolozky.data as any[]) ?? []).filter((i) => ids.has(i.order_id)), error: vsechnyPolozky.error };
      if (b.error || p.error || o.error || oi.error) { setChyba(true); return; }
      setChyba(false);
      setData({
        beers: b.data ?? [], packages: p.data ?? [], orders, orderItems: oi.data ?? [],
        kegging: k.data ?? [], bottling: bt.data ?? [], fasovani: fa.data ?? [], prodejna: fp.data ?? [],
        writeoffs: wo.data ?? [], checks: pc.data ?? [],
        inventory: inv.data ?? [], adjustments: adj.data ?? [], akce: ak.data ?? [], prefuk: pf.data ?? [],
        zavozDeductions: zd.data ?? [],
      });
    } catch {
      setChyba(true);
    }
  }
  useEffect(() => { void nacti(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [weekKey]);
  useRealtime(['orders', 'order_items', 'kegging', 'bottling', 'fasovani', 'fasovani_private', 'writeoffs', 'kegging_plan_checks', 'inventory', 'inventory_adjustments', 'akce', 'akce_items', 'keg_prefuk', 'zavoz_deductions'], () => { void nacti(); });

  // Nezávisí na `druh` (sudy/lahve) — vrací zásobu pro VŠECHNA pivo×obal,
  // stačí spočítat jednou a použít pro oba plány níž.
  //
  // ⚠️ BEZ zavozDeductionRows — jde jen do keggingPlan.ts jako `pool` (viz
  // stejný komentář v Kegging.tsx/BottlingScreen.tsx). Ten odpočet ze
  // skladu sám o sobě nepovažuje za stočení; kdyby ho tahle zásoba
  // zahrnula, ubraly by se tytéž kusy dvakrát u objednávky, kterou nikdo
  // v Závozu neoznačil, a připravily by o zásobu jiný den (z provozu
  // 15. 9. 2026: „stočil jsem 21×30, appka mi přesto píše, že 4 chybí").
  const currentStockMap = useMemo(() => {
    if (!data) return undefined;
    return zbytekKeKonciTydne({
      inventoryRows: data.inventory,
      bottlingRows: data.bottling,
      keggingRows: data.kegging,
      fasovaniRows: data.fasovani,
      prodejnaRows: data.prodejna,
      writeoffsRows: data.writeoffs,
      akceRows: data.akce,
      prefukRows: data.prefuk,
      adjustmentRows: data.adjustments,
      packages: data.packages,
      // Viz Kegging.tsx — skutečná zásoba včetně odpočtů závozu.
      zavozDeductionRows: data.zavozDeductions,
    }, businessDateISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const planyDruhu = (druh: Druh): DayPlan[] => {
    if (!data) return [];
    return computeKeggingPlan({
      beers: data.beers,
      packages: data.packages,
      orders: data.orders,
      orderItems: data.orderItems,
      keggingRows: druh === 'sudy' ? data.kegging : data.bottling,
      // Bez nich by se už zavezené objednávky odečetly dvakrát — viz
      // keggingPlan.ts (vrácení závozů do zásoby u currentStockMap).
      zavozDeductionRows: data.zavozDeductions,
      fasovaniRows: data.fasovani,
      prodejnaRows: data.prodejna,
      writeoffsRows: data.writeoffs,
      checkRows: data.checks,
      weekKey,
      jeCilovyObal: druh === 'sudy'
        ? (kind, label) => jeSud(kind, label)
        : (kind, label) => !jeSud(kind, label),
      currentStockMap,
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const planySudy = useMemo(() => (sudy ? planyDruhu('sudy') : []), [data, sudy, weekKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const planyLahve = useMemo(() => (lahve ? planyDruhu('lahve') : []), [data, lahve, weekKey]);

  // 🔜 Přehled na ploše má ukazovat, co chybí stočit na NEJBLIŽŠÍ den — z
  // provozu 16. 9. 2026: „na hlavní straně nahoře ten přehled má ukazovat, co
  // chybí stočit na další den“. Dokud si uživatel den nepřepne sám (nebo nemá
  // uložený týden), vybere se první den od dneška, kde ještě něco chybí.
  useEffect(() => {
    if (rucniVyber.current || cti(KLIC_OBDOBI) === 'tyden' || !data) return;
    const poradi: string[] = DAYS.map((d) => d.v);
    const odDneska = poradi.slice(poradi.indexOf(dnesniDen)).concat(poradi.slice(0, poradi.indexOf(dnesniDen)));
    const chybiVDen = (den: string) => (planySudy.find((p) => p.day === den)?.totalMissing ?? 0)
      + (planyLahve.find((p) => p.day === den)?.totalMissing ?? 0);
    const nejblizsi = odDneska.find((d) => chybiVDen(d) > 0);
    if (nejblizsi && nejblizsi !== obdobi) setObdobi(nejblizsi);
  }, [data, planySudy, planyLahve, dnesniDen, obdobi]);

  const planSudy = useMemo(() => planProVyber(planySudy, obdobi, weekLabel), [planySudy, obdobi, weekLabel]);
  const planLahve = useMemo(() => planProVyber(planyLahve, obdobi, weekLabel), [planyLahve, obdobi, weekLabel]);
  const matice = useMemo(() => sestavMatici([
    ...(sudy ? [{ druh: 'sudy' as Druh, plan: planSudy }] : []),
    ...(lahve ? [{ druh: 'lahve' as Druh, plan: planLahve }] : []),
  ]), [sudy, lahve, planSudy, planLahve]);
  const pivoPodleId = useMemo(() => new Map((data?.beers ?? []).map((b) => [b.id, b])), [data]);

  const objednanoCelkem = planSudy.totalOrdered + planLahve.totalOrdered;
  const sloupceSudu = matice.sloupce.filter((s) => s.druh === 'sudy').length;
  const sloupceLahvi = matice.sloupce.length - sloupceSudu;
  // ⚠️ Kolik chybí za CELÝ týden — i když se kouká na jeden den.
  //
  // Z provozu 22. 9. 2026: „na skladě mi to ukazuje −1×30 12sv, ale Co stočit
  // na středu mi ukazuje, že je vše stočené". Obojí byla pravda: středa
  // opravdu pokrytá byla, jenže ten chybějící sud visel na JINÉM dni (nebo
  // na objednávce bez dne dovozu) a denní pohled o něm mlčel — dokonce
  // svítil zelené „hotovo". Sklad počítá celý týden, plán jen vybraný den,
  // takže si navzájem odporovaly. Schodek mimo vybraný den se proto ukazuje
  // vždycky.
  // ✍️ Jen ODŠKRTNUTÉ, ale ve stáčení nezapsané.
  //
  // Tlačítko „Mám všech X" v plánu zapisuje do kegging_plan_checks —
  // je to pracovní odškrtávátko, ne evidence stáčení (a samo to říká).
  // Jenže tím položce spadne „chybí" na nulu a z plochy BEZE STOPY
  // zmizí: ve stáčení není zápis, ve skladu pořád nula, a nikdo už
  // neví, že se na to má sáhnout. Z provozu 22. 9. 2026: „klikl jsem
  // u 5×30 desítky na ‚vše mám‘, zmizely z hlavní plochy, ale nejsou
  // zapsané ve stáčení". Proto se to tady přizná.
  const jenOdskrtnuto = [...planSudy.items, ...planLahve.items]
    .reduce((s, it) => s + Math.max(0, Math.min(it.checked, it.ordered) - it.autoDone), 0);
  const chybiVeVyberu = planSudy.totalMissing + planLahve.totalMissing;
  const chybiMimoVyber = spoctiChybiMimoVyber(planySudy, obdobi) + spoctiChybiMimoVyber(planyLahve, obdobi);
  const bezTerminu = (planySudy.find((p) => p.day === BEZ_TERMINU)?.totalMissing ?? 0)
    + (planyLahve.find((p) => p.day === BEZ_TERMINU)?.totalMissing ?? 0);

  const nazevObdobi = obdobi === 'tyden'
    ? `tento týden (${weekLabel})`
    : obdobi === dnesniDen ? 'dnes' : `na ${DAYS.find((d) => d.v === obdobi)?.label ?? obdobi}`;

  function zvolObdobi(o: string) {
    rucniVyber.current = true;
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
  // 🧱 Řádky i sloupce potřebovaly víc kontrastu — z provozu 15. 9. 2026:
  // „ať jsou vidět řádky i sloupce líp, hodně to splívá". Každá datová
  // buňka teď má tenkou svislou linku vlevo (oddělí ji od sousedního
  // obalu) a sudý řádek má sytější podklad než dřív skoro neviditelné
  // neutral-50/70.
  const bunka = 'px-1 py-1 text-center tabular-nums w-11 border-l border-neutral-200';
  /** Přechod ze sudů na lahve dostane sytější linku — pokračování barevného
   * předělu z hlavičky (border-sky-300) dolů přes celou tabulku. */
  const hranicaSkupiny = (i: number) =>
    i > 0 && matice.sloupce[i].druh === 'lahve' && matice.sloupce[i - 1].druh === 'sudy' ? 'border-l-2 border-sky-300' : '';

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
          {data && (planSudy.totalMissing + planLahve.totalMissing > 0 ? (
            <>
              {planSudy.totalMissing > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-xs tabular-nums flex items-center gap-1">
                  <IkonaSud size={12} /> {planSudy.totalMissing}
                </span>
              )}
              {planLahve.totalMissing > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-xs tabular-nums flex items-center gap-1">
                  <IkonaLahev size={12} /> {planLahve.totalMissing}
                </span>
              )}
            </>
          ) : chybiMimoVyber > 0 ? (
            /* Na vybraný den je hotovo, ale TÝDEN chybí — zelené „hotovo" by
               tady lhalo (viz komentář u chybiMimoVyber). */
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-xs tabular-nums flex items-center gap-1">
              <AlertTriangle size={12} /> týden {chybiMimoVyber}
            </span>
          ) : objednanoCelkem > 0 ? (
            <span className="px-2 py-0.5 rounded-full bg-emerald-700 text-white font-black text-xs"><Check size={12} className="inline" /> hotovo</span>
          ) : null)}
          {sbaleno ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {!sbaleno && (
        <div className="px-3.5 pb-3 pt-2 space-y-2">
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
          ) : matice.radky.length === 0 ? (
            <p className="text-sm font-bold text-emerald-700"><Check size={14} className="inline" /> Všechno je stočené.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm border-collapse">
                <thead>
                  {sloupceSudu > 0 && sloupceLahvi > 0 && (
                    <tr className="text-udaj font-black text-neutral-500">
                      <th />
                      <th colSpan={sloupceSudu} className="px-1 pt-0.5 text-center border-b-2 border-amber-300">
                        <span className="inline-flex items-center gap-1"><IkonaSud size={12} /> Sudy</span>
                      </th>
                      <th colSpan={sloupceLahvi} className="px-1 pt-0.5 text-center border-b-2 border-sky-300">
                        <span className="inline-flex items-center gap-1"><IkonaLahev size={12} /> Lahve</span>
                      </th>
                    </tr>
                  )}
                  <tr className="text-udaj font-black text-neutral-600 border-b border-neutral-200">
                    <th className="text-left px-1 py-1">Pivo</th>
                    {matice.sloupce.map((s, i) => (
                      <th key={s.package_id} className={`${bunka} whitespace-nowrap ${hranicaSkupiny(i)}`}>{s.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matice.radky.map((r) => {
                    const pivo = pivoPodleId.get(r.beer_id);
                    return (
                      <tr key={r.beer_id} className="border-b border-neutral-200 even:bg-neutral-100/80">
                        <td className="px-1 py-1 max-w-0 w-full">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-neutral-300" style={{ background: beerBg(pivo) }} />
                            <span className="truncate font-bold text-neutral-900">{pivo ? beerName(pivo) : '?'}</span>
                          </span>
                        </td>
                        {matice.sloupce.map((s, i) => {
                          const n = r.chybi.get(s.package_id) ?? 0;
                          return (
                            <td key={s.package_id} className={`${bunka} ${hranicaSkupiny(i)}`}>
                              {n > 0
                                ? <span className="font-display font-black text-amber-800">{n}</span>
                                : r.objednano.has(s.package_id)
                                  // "Pokryto", ne "stočeno" — od zapojení skutečné zásoby
                                  // skladem (currentStockMap, 15. 9. 2026) to nemusí
                                  // znamenat stočení TENTO týden, ale i starší zásobu.
                                  ? <span title="Objednávka je pokrytá — stočením nebo zásobou skladem"><Check size={12} className="inline text-emerald-700" aria-label="pokryto" /></span>
                                  : <span className="text-neutral-300">·</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-neutral-300 font-black">
                    <td className="px-1 py-1 text-udaj text-neutral-600">Celkem</td>
                    {matice.sloupce.map((s, i) => (
                      <td key={s.package_id} className={`${bunka} ${hranicaSkupiny(i)} font-display text-neutral-950`}>{matice.soucty.get(s.package_id) || ''}</td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ⚠️ Schodek, který na vybraný den nevidíš. Bez tohohle řádku
              tvrdil denní pohled „vše stočeno", zatímco Sklad ukazoval
              mínus — a chybějící sud se našel až u závozu. */}
          {data && chybiMimoVyber > 0 && (
            <p className="text-udaj font-black text-amber-900 bg-amber-50 border border-amber-300 rounded px-2 py-1.5 flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>
                {chybiVeVyberu === 0
                  ? `Na ${nazevObdobi} je vše stočené, ale tento týden ještě chybí ${chybiMimoVyber} ks`
                  : `Mimo ${nazevObdobi} chybí tento týden ještě ${chybiMimoVyber} ks`}
                {bezTerminu > 0 ? ` (z toho ${bezTerminu} ks u objednávek bez dne dovozu)` : ' (na jiný den)'}
                {' — přepni na Týden.'}
              </span>
            </p>
          )}

          {/* ✍️ Odškrtnuté, ale nezapsané — viz komentář u jenOdskrtnuto. */}
          {data && jenOdskrtnuto > 0 && (
            <p className="text-udaj font-black text-amber-900 bg-amber-50 border border-amber-300 rounded px-2 py-1.5 flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>
                {jenOdskrtnuto} ks je jen odškrtnuto v plánu, ale ve stáčení nezapsáno — ve skladu se to neprojeví.
                {' '}Zapiš je v „Začátek stáčení", nebo odškrtnutí zruš.
              </span>
            </p>
          )}

          {data && (matice.hotovaPiva.size > 0 || (bezTerminu > 0 && obdobi === 'tyden')) && (
            <p className="text-udaj font-bold text-neutral-500">
              {matice.hotovaPiva.size > 0 && <><Check size={11} className="inline text-emerald-700" /> Už pokryto: {matice.hotovaPiva.size} {matice.hotovaPiva.size === 1 ? 'pivo' : matice.hotovaPiva.size < 5 ? 'piva' : 'piv'} (stočením nebo zásobou skladem). </>}
              {bezTerminu > 0 && obdobi === 'tyden' && <>Včetně {bezTerminu} ks z objednávek bez dne dovozu.</>}
            </p>
          )}

          <div className="flex gap-3">
            {sudy && (
              <button type="button" onClick={() => setPage('kegging', undefined, 'plan')} className="text-xs font-black text-amber-800 hover:underline min-h-[44px]">
                Plán sudů →
              </button>
            )}
            {lahve && (
              <button type="button" onClick={() => setPage('bottling', undefined, 'potreba')} className="text-xs font-black text-amber-800 hover:underline min-h-[44px]">
                Plán lahví →
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
