// ⚙️ Výpočet potřeby stáčení — „co je potřeba stočit".
// ---------------------------------------------------------------------------
// Sdílená logika pro sekci „Zadávání stáčení lahví" v Nastavení (admin).
// Sestaví řádek pivo × obal s těmito sloupci (VŠE ZA AKTUÁLNÍ TÝDEN, od
// pondělí do teď — ne za celý měsíc):
//   • stock         – sklad TEĎ = sklad v pondělí ráno (počátek měsíce
//                     s převodem z předchozího měsíce + pohyby od 1. dne
//                     měsíce do pondělí) + stočeno/kegováno OD PONDĚLÍ −
//                     výdej (fasování/prodejna/odpisy/Akce-festivaly/zavezené
//                     objednávky) OD PONDĚLÍ
//   • ordered       – VŠECHNY objednávky v daném týdnu (i už zavezené, ať je
//                     vidět celková týdenní potřeba na středeční/čtvrteční/
//                     páteční zavoz, ne jen zbytek)
//   • fasovani      – odhad fasování pro ZBÝVAJÍCÍ dny týdne (průměr 30 dní)
//                     — dny od pondělí do teď už jsou ve „stock" jako
//                     skutečný výdej, tady jen odhad pro dny, co teprve přijdou
//   • planned       – naplánované stáčení v týdnu (jen 1. stáčení piva)
//   • afterBottling – sklad + naplánováno
//   • missing       – chybí stočit do konce týdne = max(0, objednávky + fasování − po stočení)
//   • afterOutgoing – konec týdne = po stočení − objednávky − fasování
//
// Čerstvé stočení se tak projeví v „chybí stočit" OKAMŽITĚ (počítá se do
// „stock" hned po uložení), bez čekání na to, až se nějaká JINÁ objednávka
// označí jako zavezená.
import { AkceRow } from './inventoryHelper';
import { buildMovements, stockAsOf } from './stockLedger';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';
import type { BottlingPlan } from './bottlingPlans';

export type NeedsRow = {
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

export type BottlingNeedsInput = {
  beers: { id: string; name: string }[];
  packages: { id: string; label: string; kind: string; volume_l: number }[];
  plans: BottlingPlan[];
  orders: any[];
  orderItems: any[];
  inventoryRows: any[];
  bottlingRows: any[];
  keggingRows: any[];
  fasovaniRows: any[];
  prodejnaRows: any[];
  writeoffsRows: any[];
  /** Automatický odpočet závozu (stejný zdroj jako Sklad/Inventura — viz zavoz_deductions). */
  zavozDeductionRows?: any[];
  /** Spotřeba na Akcích/festivalech (odvezeno − vráceno), stejný zdroj jako Sklad (Stock.tsx). */
  akceRows?: AkceRow[];
  /** Přefuk sudů — přelití mezi objemy. Bez něj se plán rozešel se Skladem. */
  prefukRows?: any[];
  /** Dorovnání inventury (manko/přebytek, ± ks). */
  adjustmentRows?: any[];
  weekKey: string;
  todayStr: string;
};
export function computeBottlingNeeds(input: BottlingNeedsInput): NeedsRow[] {
  const {
    beers,
    packages,
    plans,
    orders,
    orderItems,
    inventoryRows,
    bottlingRows,
    keggingRows,
    fasovaniRows,
    prodejnaRows,
    writeoffsRows,
    zavozDeductionRows = [],
    akceRows = [],
    prefukRows = [],
    adjustmentRows = [],
    weekKey,
    todayStr,
  } = input;

  const weekEndStr = weekRange(weekKey).end.toISOString().slice(0, 10);
  const isThisWeek = (dateStr: string | null | undefined) => !!dateStr && isoWeekKey(dateStr) === weekKey;

  // 📒 Sklad ke KONCI TÝDNE — ze skladové knihy (lib/stockLedger.ts), stejné
  // číslo jako Sklad, Inventura i plánovač stáčení.
  //
  // Dřív se tady sčítalo ručně: sklad v pondělí ráno + pohyby tohoto týdne.
  // Ten součet se s knihou rozcházel ve třech situacích:
  //   • v týdnu, do kterého padne 1. den měsíce — inventura (počáteční stav)
  //     je nový výchozí bod a ruční součet od pondělí ji do konce týdne
  //     ignoroval, zatímco Sklad i Inventura s ní počítaly hned,
  //   • přefuk a dorovnání inventury zadané tento týden se nezapočítaly vůbec,
  //   • sud spotřebovaný na stáčení lahví (kegs_used) taky ne.
  const stockMap: Record<string, number> = {};
  stockAsOf(
    buildMovements({
      inventoryRows, bottlingRows, keggingRows, fasovaniRows, prodejnaRows,
      writeoffsRows, zavozDeductionRows, akceRows, prefukRows, adjustmentRows, packages,
    }),
    weekEndStr,
  ).forEach((line, k) => { stockMap[k] = Math.max(0, line.qty); });

  // Objednávky v daném týdnu (ks na pivo + obal) — VŠECHNY, i už zavezené.
  const activeIds = new Set(
    orders
      .filter((o) => {
        if (o.status === 'storno' || o.status === 'vyrizeno' || o.status === 'vyrizeno_zavoz') return false;
        const target = o.delivery_date || o.order_date;
        return isThisWeek(target);
      })
      .map((o) => o.id)
  );
  const weekOrdered: Record<string, number> = {};
  orderItems.filter((item) => item.package_id && activeIds.has(item.order_id)).forEach((item) => {
    if (!item.beer_id || !item.package_id) return;
    const k = `${item.beer_id}__${item.package_id}`;
    weekOrdered[k] = (weekOrdered[k] || 0) + Number(item.quantity || 0);
  });

  // Odhad fasování pro ZBÝVAJÍCÍ dny týdne (průměr za posledních 30 dní ×
  // dny PO dnešku do konce týdne) — dny od pondělí do dneška už jsou ve
  // „stock" jako skutečný výdej, tady jen odhad budoucna.
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
    Math.floor((weekRange(weekKey).end.getTime() - new Date(todayStr + 'T00:00:00Z').getTime()) / 86400000)
  );
  const fasovaniEstimate: Record<string, number> = {};
  Object.entries(per).forEach(([k, total]) => {
    fasovaniEstimate[k] = (total / 30) * remainingDays;
  });

  // Naplánované stáčení v daném týdnu (jen „planned" — hotové už je ve skladu).
  // Bere se JEN první stáčení piva v týdnu (nejbližší planned_date), další úkoly
  // téhož piva později v tomtéž týdnu se nepočítají.
  const firstDateByBeer = new Map<string, string>();
  plans
    .filter((p) => p.beer_id && p.status !== 'cancelled' && isoWeekKey(p.planned_date) === weekKey)
    .forEach((p) => {
      const cur = firstDateByBeer.get(p.beer_id!);
      if (!cur || p.planned_date < cur) firstDateByBeer.set(p.beer_id!, p.planned_date);
    });
  const plannedMap: Record<string, number> = {};
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
        plannedMap[k] = (plannedMap[k] || 0) + qty;
      };
      add(p.pkg_id, p.qty);
      add(p.pkg2_id, p.qty2);
      add(p.pkg3_id, p.qty3);
      add(p.keg_pkg_id, p.keg_qty);
    });

  const list: NeedsRow[] = [];
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
}
