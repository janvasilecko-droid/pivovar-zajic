// 🍺 Plán stáčení na týden — JEDNO místo, odkud se bere „co stočit".
// ---------------------------------------------------------------------------
// Zadání 28. 9. 2026: „ať se data ukazují správně … ať znova nemusíme řešit,
// že všude se ukazuje co stočit jinak."
//
// Načte data týdne a spočítá plán sudů i lahví stejným výpočtem
// (lib/keggingPlan.ts → computeKeggingPlan), jaký mají obrazovky KEG a Lahve.
// Dřív si to okno „Co stočit" na ploše načítalo samo a Sklep počítal vlastním
// vzorcem (objednáno − stočeno tento týden) — a každé místo pak hlásilo něco
// jiného. Teď ho používá okno „Co stočit" (components/CoStocitOkno.tsx)
// i Sklep (screens/Cellar.tsx).
import { useEffect, useMemo, useState } from 'react';
import { supabase, fetchAllRows, useRealtime } from './supabase';
import { nactiSdilenouTabulku } from './sdilenaData';
import { businessDateISO } from './businessDate';
import { jeSud } from './inventoryFix';
import { computeKeggingPlan, type DayPlan } from './keggingPlan';
import { buildMovements, MOVEMENT_LABELS } from './stockLedger';
import { zbytekKeKonciTydne } from './tydenniZbytek';
import { weekRange } from '../components/WeeklyOrderSummaryCard';

export type DataPlanu = {
  beers: any[]; packages: any[]; orders: any[]; orderItems: any[];
  kegging: any[]; bottling: any[]; fasovani: any[]; prodejna: any[]; writeoffs: any[]; checks: any[];
  // Skutečná zásoba skladem (currentStockMap, viz keggingPlan.ts) — potřebuje
  // CELOU historii + inventuru, ne jen aktuální týden.
  inventory: any[]; adjustments: any[]; akce: any[]; prefuk: any[]; zavozDeductions: any[];
};

export type PlanStaceni = {
  data: DataPlanu | null;
  chyba: boolean;
  /** Plán sudů po dnech (+ přihrádka bez termínu). */
  planySudy: DayPlan[];
  /** Plán lahví po dnech (+ přihrádka bez termínu). */
  planyLahve: DayPlan[];
  nacti: () => Promise<void>;
  /**
   * Odkud je mínus ve skladu: pohyby toho piva a obalu od poslední inventury
   * (30. 9. 2026: „furt tu vidím Osma 2×" — ať je vidět, co ten mínus dělá).
   */
  puvodMinusu: (beerId: string, packageId: string) => { datum: string; popis: string; kusu: number }[];
  /** Stav skladem teď (skladová kniha), klíč `beer_id__package_id`. */
  zasoba?: Map<string, number>;
};

/**
 * Načte a spočítá plán stáčení pro týden `weekKey` (`RRRR-TT`).
 * `sudy` / `lahve` = smí uživatel vidět stáčení sudů / lahví.
 */
export function usePlanStaceni(weekKey: string, { sudy = true, lahve = true }: { sudy?: boolean; lahve?: boolean } = {}): PlanStaceni {
  const zacatekTydne = weekRange(weekKey).start.toISOString().slice(0, 10);
  const [data, setData] = useState<DataPlanu | null>(null);
  const [chyba, setChyba] = useState(false);

  async function nacti() {
    try {
      // 📦 Kegging/bottling/fasování/prodejna/odpisy se čtou BEZ omezení na
      // týden — currentStockMap (skutečná zásoba skladem, viz níž) potřebuje
      // celou historii, jinak by neviděla nic stočeného dřív než tenhle týden
      // (z provozu 15. 9. 2026: „mám na skladě 9× 30l, appka mi stejně píše,
      // že musím stočit další").
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
        // sdílené paměti.
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

  // Nezávisí na druhu (sudy/lahve) — zásoba pro VŠECHNA pivo×obal, spočítá
  // se jednou pro oba plány. Včetně odpočtů závozu, stejně jako v Kegging.tsx
  // a BottlingScreen.tsx (viz smlouva `currentStockMap` v keggingPlan.ts).
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
      zavozDeductionRows: data.zavozDeductions,
    }, businessDateISO());
  }, [data]);

  const planyDruhu = (druh: 'sudy' | 'lahve'): DayPlan[] => {
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
  const planySudy = useMemo(() => (sudy ? planyDruhu('sudy') : []), [data, sudy, weekKey, currentStockMap]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const planyLahve = useMemo(() => (lahve ? planyDruhu('lahve') : []), [data, lahve, weekKey, currentStockMap]);

  // Pohyby skladu ze stejných zdrojů jako currentStockMap.
  const pohyby = useMemo(() => {
    if (!data) return [];
    return buildMovements({
      inventoryRows: data.inventory, bottlingRows: data.bottling, keggingRows: data.kegging,
      fasovaniRows: data.fasovani, prodejnaRows: data.prodejna, writeoffsRows: data.writeoffs,
      akceRows: data.akce, prefukRows: data.prefuk, adjustmentRows: data.adjustments,
      packages: data.packages, zavozDeductionRows: data.zavozDeductions,
    });
  }, [data]);
  const puvodMinusu = (beerId: string, packageId: string) => {
    const dnes = businessDateISO();
    const moje = pohyby
      .filter((m) => m.beer_id === beerId && m.package_id === packageId && m.date <= dnes)
      .sort((a, z) => a.date.localeCompare(z.date));
    // Od poslední inventury (reset stavu) — tam začíná to, co dnes sklad ukazuje.
    let od = 0;
    moje.forEach((m, i) => { if (m.kind === 'inventura') od = i; });
    const mistoObjednavky = new Map((data?.orders ?? []).map((o: any) => [o.id, o.place_name as string | null]));
    return moje.slice(od).map((m) => ({
      datum: m.date,
      kusu: m.qty,
      popis: m.kind === 'inventura'
        ? `inventura = ${m.qty}`
        : m.kind === 'zavoz'
          ? `závoz${m.orderId && mistoObjednavky.get(m.orderId) ? ` ${mistoObjednavky.get(m.orderId)}` : ''}`
          : MOVEMENT_LABELS[m.kind].toLowerCase(),
    }));
  };

  return { data, chyba, planySudy, planyLahve, nacti, puvodMinusu, zasoba: currentStockMap };
}
