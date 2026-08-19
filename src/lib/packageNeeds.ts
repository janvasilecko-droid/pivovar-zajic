// ⚙️ Sdílený výpočet potřeby stáčení podle druhu obalu — „co je potřeba stočit".
// ---------------------------------------------------------------------------
// Stejná logika pro KEGy (kegNeeds.ts) i lahve (BottlingScreen.tsx „Lahve k
// dotočení tento týden"), jen parametrizovaná podle druhu obalu. Sestaví
// řádek pivo × obal s těmito sloupci (VŠE ZA AKTUÁLNÍ TÝDEN, od pondělí do
// teď — ne za celý měsíc):
//   • invQty      – sklad v PONDĚLÍ RÁNO (počátek týdne): počáteční stav
//                   měsíce (inventura s převodem z předchozího měsíce) +
//                   pohyby od 1. dne měsíce do pondělí (stočeno − fasování/
//                   prodejna/odpisy/zavezené objednávky ± přefuk)
//   • bottledQty  – stočeno OD PONDĚLÍ DO TEĎ (tento týden)
//   • outgoingQty – výdej OD PONDĚLÍ DO TEĎ (fasování + prodejna + odpisy +
//                   fyzicky zavezené objednávky)
//   • stockQty    – sklad TEĎ = max(0, invQty + bottledQty − outgoingQty − přefuk ZE + přefuk DO)
//   • orderedQty  – VŠECHNY objednávky v AKTUÁLNÍM TÝDNU — bez ohledu na to,
//                   jestli jsou už zavezené, ať je vidět celková týdenní
//                   potřeba, ne jen to, co ještě nevyjelo
//   • neededQty   – chybí stočit do konce týdne = max(0, objednáno − sklad)
//
// Sklad se na začátku týdne (pondělí ráno) přebírá z měsíčního modelu
// (stejný zdroj jako Sklad/Inventura), ale VŠECHNO, co se stočí/vydá OD
// PONDĚLÍ, se počítá zvlášť za tento týden — tak se čerstvé stočení hned
// projeví v "co ještě chybí do konce týdne", bez čekání na to, až se
// nějaká JINÁ objednávka označí jako zavezená.
import { getStartingStockMap } from './inventoryHelper';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';

export type PackageNeedsRow = {
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  volume_l: number;
  invQty: number;
  bottledQty: number;
  outgoingQty: number;
  stockQty: number;
  orderedQty: number;
  neededQty: number;
};

export type PackageNeedsInput = {
  beers: { id: string; name: string }[];
  packages: { id: string; label: string; kind: string; volume_l: number }[];
  orders: any[];
  orderItems: any[];
  inventoryRows: any[];
  /** Stočení lahví (bottling) — pro KEG potřebu se předává prázdné pole. */
  bottlingRows: any[];
  /** Stočení KEGů (kegging) — pro potřebu lahví se předává prázdné pole. */
  keggingRows: any[];
  fasovaniRows: any[];
  prodejnaRows: any[];
  writeoffsRows: any[];
  prefukRows?: any[];
  /** Automatický odpočet závozu (stejný zdroj jako Sklad/Inventura — viz zavoz_deductions). */
  zavozDeductionRows?: any[];
  weekKey: string;
  todayStr: string;
};

export function computePackageNeeds(input: PackageNeedsInput, isTargetPkg: (kind: string) => boolean): PackageNeedsRow[] {
  const {
    beers,
    packages,
    orders,
    orderItems,
    inventoryRows,
    bottlingRows,
    keggingRows,
    fasovaniRows,
    prodejnaRows,
    writeoffsRows,
    prefukRows = [],
    zavozDeductionRows = [],
    weekKey,
  } = input;

  const targetPkgIds = new Set(packages.filter((p) => isTargetPkg(p.kind)).map((p) => p.id));

  // Pondělí aktuálního týdne — hranice mezi "sklad na začátku týdne" a
  // "pohyby tento týden".
  const weekStartStr = weekRange(weekKey).start.toISOString().slice(0, 10);
  const weekStartMonth = weekStartStr.slice(0, 7);
  const isThisWeek = (dateStr: string | null | undefined) => !!dateStr && isoWeekKey(dateStr) === weekKey;
  const isBeforeThisWeek = (dateStr: string | null | undefined) =>
    !!dateStr && dateStr.startsWith(weekStartMonth) && dateStr < weekStartStr;

  // Objednávky v AKTUÁLNÍM TÝDNU — VŠECHNY (i už zavezené), ať je vidět
  // celková týdenní potřeba na středu/čtvrtek/pátek zavoz, ne jen zbytek.
  const activeOrderIds = new Set(
    orders
      .filter((o) => {
        if (o.status === 'storno' || o.status === 'vyrizeno' || o.status === 'vyrizeno_zavoz') return false;
        const targetDate = o.delivery_date || o.order_date;
        return isThisWeek(targetDate);
      })
      .map((o) => o.id)
  );

  const orderedMap: Record<string, number> = {};
  orderItems
    .filter((item) => item.package_id && targetPkgIds.has(item.package_id) && activeOrderIds.has(item.order_id))
    .forEach((item) => {
      if (!item.beer_id || !item.package_id) return;
      const k = `${item.beer_id}__${item.package_id}`;
      orderedMap[k] = (orderedMap[k] || 0) + Number(item.quantity || 0);
    });

  // Sklad v PONDĚLÍ RÁNO: počátek měsíce (s převodem z předchozího měsíce,
  // včetně zavezených objednávek) + pohyby od 1. dne měsíce do pondělí.
  const invMap = getStartingStockMap(weekStartMonth, inventoryRows, bottlingRows, keggingRows, fasovaniRows, prodejnaRows, writeoffsRows, 0, zavozDeductionRows);

  const producedRows = [...bottlingRows, ...keggingRows];

  const preWeekIn: Record<string, number> = {};
  producedRows.filter((r) => isBeforeThisWeek(r.entry_date)).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    preWeekIn[k] = (preWeekIn[k] || 0) + Number(r.quantity || 0);
  });
  const preWeekOut: Record<string, number> = {};
  [...fasovaniRows, ...prodejnaRows, ...writeoffsRows].filter((r) => isBeforeThisWeek(r.entry_date)).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    preWeekOut[k] = (preWeekOut[k] || 0) + Number(r.quantity || 0);
  });
  zavozDeductionRows.filter((r) => isBeforeThisWeek(r.deduct_date)).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    preWeekOut[k] = (preWeekOut[k] || 0) + Number(r.quantity || 0);
  });
  const prefukFromPreWeek: Record<string, number> = {};
  const prefukToPreWeek: Record<string, number> = {};
  prefukRows.filter((r) => isBeforeThisWeek(r.entry_date)).forEach((r) => {
    if (!r.beer_id) return;
    if (r.from_package_id) {
      const k = `${r.beer_id}__${r.from_package_id}`;
      prefukFromPreWeek[k] = (prefukFromPreWeek[k] || 0) + Number(r.from_count || 0);
    }
    if (r.to_package_id) {
      const k = `${r.beer_id}__${r.to_package_id}`;
      prefukToPreWeek[k] = (prefukToPreWeek[k] || 0) + Number(r.to_count || 0);
    }
  });
  const weekStartStockMap: Record<string, number> = {};
  new Set([...Object.keys(invMap), ...Object.keys(preWeekIn), ...Object.keys(preWeekOut), ...Object.keys(prefukFromPreWeek), ...Object.keys(prefukToPreWeek)]).forEach((k) => {
    weekStartStockMap[k] = Math.max(
      0,
      Number(invMap[k] || 0) + Number(preWeekIn[k] || 0) - Number(preWeekOut[k] || 0) - Number(prefukFromPreWeek[k] || 0) + Number(prefukToPreWeek[k] || 0)
    );
  });

  // Pohyby OD PONDĚLÍ DO TEĎ (tento týden) — stočeno hned zvyšuje sklad,
  // bez ohledu na to, jak je na tom kterákoli konkrétní objednávka.
  const bottledMap: Record<string, number> = {};
  producedRows.filter((r) => isThisWeek(r.entry_date)).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    bottledMap[k] = (bottledMap[k] || 0) + Number(r.quantity || 0);
  });
  const outgoingMap: Record<string, number> = {};
  [...fasovaniRows, ...prodejnaRows, ...writeoffsRows].filter((r) => isThisWeek(r.entry_date)).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    outgoingMap[k] = (outgoingMap[k] || 0) + Number(r.quantity || 0);
  });
  // Skutečně zavezené objednávky tento týden — stejný zdroj jako Sklad/Inventura.
  // POZOR: do zvlášť mapy, NE do outgoingMap — orderedQty níže už počítá
  // VŠECHNY objednávky tento týden (i zavezené), takže kdyby se zavezené
  // odečetly ještě jednou od skladu při výpočtu "chybí stočit", ta samá
  // zavezená objednávka by se odečetla dvakrát a "chybí" by bylo uměle
  // vyšší, než kolik se má skutečně dotočit do konce týdne. Do stockQty
  // (fyzický sklad TEĎ, sloupec "Sklad") se ale zavezené odečíst MUSÍ.
  const zavozThisWeekMap: Record<string, number> = {};
  zavozDeductionRows.filter((r) => isThisWeek(r.deduct_date)).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    zavozThisWeekMap[k] = (zavozThisWeekMap[k] || 0) + Number(r.quantity || 0);
  });
  const prefukFromMap: Record<string, number> = {};
  const prefukToMap: Record<string, number> = {};
  prefukRows.filter((r) => isThisWeek(r.entry_date)).forEach((r) => {
    if (!r.beer_id) return;
    if (r.from_package_id) {
      const fk = `${r.beer_id}__${r.from_package_id}`;
      prefukFromMap[fk] = (prefukFromMap[fk] || 0) + Number(r.from_count || 0);
    }
    if (r.to_package_id) {
      const tk = `${r.beer_id}__${r.to_package_id}`;
      prefukToMap[tk] = (prefukToMap[tk] || 0) + Number(r.to_count || 0);
    }
  });

  const list: PackageNeedsRow[] = [];
  beers.forEach((b) => {
    packages.filter((p) => targetPkgIds.has(p.id)).forEach((p) => {
      const k = `${b.id}__${p.id}`;
      const invQty = Number(weekStartStockMap[k] || 0);
      const bottledQty = Number(bottledMap[k] || 0);
      const outgoingQty = Number(outgoingMap[k] || 0);
      const zavozThisWeekQty = Number(zavozThisWeekMap[k] || 0);
      const prefukFromQty = Number(prefukFromMap[k] || 0);
      const prefukToQty = Number(prefukToMap[k] || 0);
      // Fyzický sklad TEĎ (sloupec "Sklad") — zavezené objednávky tento
      // týden už fyzicky odešly, proto se odečítají i tady.
      const stockQty = Math.max(0, invQty + bottledQty - outgoingQty - zavozThisWeekQty - prefukFromQty + prefukToQty);
      const orderedQty = Number(orderedMap[k] || 0);
      // Kolik ještě chybí dotočit do konce týdne — porovnává CELKOVOU
      // týdenní poptávku (orderedQty, viz výše) s tím, co bylo tento týden
      // k dispozici BEZ odečtení zavezených (ty už jsou v orderedQty
      // zahrnuté jako součást poptávky, viz komentář u zavozThisWeekMap).
      const neededQty = Math.max(0, orderedQty - Math.max(0, invQty + bottledQty - outgoingQty - prefukFromQty + prefukToQty));

      if (orderedQty > 0 || stockQty > 0 || invQty > 0 || bottledQty > 0) {
        list.push({
          beer_id: b.id,
          beer_name: b.name,
          package_id: p.id,
          package_label: p.label,
          volume_l: Number(p.volume_l || 0),
          invQty,
          bottledQty,
          outgoingQty,
          stockQty,
          orderedQty,
          neededQty,
        });
      }
    });
  });

  return list;
}
