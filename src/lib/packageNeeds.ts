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
//                   Akce/festivaly (odvezeno − vráceno) + fyzicky zavezené objednávky)
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
import { flattenAkceNet, AkceRow } from './inventoryHelper';
import { buildMovements, stockAsOf, stockAtStartOfDay } from './stockLedger';
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
  /** Dorovnání inventury — manko/přebytek (± ks), stejný zdroj jako Sklad/Dashboard (inventory_adjustments). */
  adjustmentRows?: any[];
  /** Spotřeba na Akcích/festivalech (odvezeno − vráceno), stejný zdroj jako Sklad (Stock.tsx). */
  akceRows?: AkceRow[];
  weekKey: string;
  todayStr: string;
};

// KEGy spotřebované jako zdroj pro stáčení lahví (bottling.kegs_used) —
// stejná logika jako v Stock.tsx/Dashboard.tsx/InventoryScreen.tsx (odsud
// zkopírováno), jen sdílená napříč potřebami KEG/lahví, aby "co ještě chybí
// stočit" nepovažovalo tyhle KEGy pořád za dostupné.
function resolveKegsUsed(
  row: any,
  packages: { id: string; kind: string; volume_l: number }[]
): { kegPkgId: string; kegsUsed: number } | null {
  const kegsUsed = Number(row.kegs_used || 0);
  if (kegsUsed <= 0) return null;
  if (row.kegs_used_package_id) return { kegPkgId: row.kegs_used_package_id, kegsUsed };
  const sourceL = Number(row.source_volume_l || 0);
  if (sourceL > 0) {
    const singleVol = sourceL / kegsUsed;
    const matched = packages.find((p) => p.kind === 'keg' && Number(p.volume_l) === singleVol);
    if (matched) return { kegPkgId: matched.id, kegsUsed };
  }
  const pkg = packages.find((p) => p.id === row.package_id);
  if (pkg && pkg.kind === 'keg') return { kegPkgId: pkg.id, kegsUsed };
  return null;
}

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
    adjustmentRows = [],
    akceRows = [],
    weekKey,
  } = input;

  const akceOutRows = flattenAkceNet(akceRows);

  const targetPkgIds = new Set(packages.filter((p) => isTargetPkg(p.kind)).map((p) => p.id));

  // Pondělí aktuálního týdne — hranice mezi "sklad na začátku týdne" a
  // "pohyby tento týden".
  const weekStartStr = weekRange(weekKey).start.toISOString().slice(0, 10);
  const weekEndStr = weekRange(weekKey).end.toISOString().slice(0, 10);
  const isThisWeek = (dateStr: string | null | undefined) => !!dateStr && isoWeekKey(dateStr) === weekKey;

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

  // 📒 Sklad v PONDĚLÍ RÁNO — ze skladové knihy (lib/stockLedger.ts).
  // Dřív se tady stav dopočítával vlastní cestou: počátek měsíce z
  // getStartingStockMap + ručně sečtené pohyby od 1. dne měsíce do pondělí,
  // rozepsané na šedesát řádků. Ta kopie se rozcházela s ostatními
  // obrazovkami a hlavně ořezávala výsledek na nulu, takže schodek z
  // minulých měsíců zmizel a čerstvé stáčení pak umazávalo neexistující dluh.
  const pohyby = buildMovements({
    inventoryRows,
    bottlingRows,
    keggingRows,
    fasovaniRows,
    prodejnaRows,
    writeoffsRows,
    zavozDeductionRows,
    akceRows,
    prefukRows,
    adjustmentRows,
    packages,
  });
  const weekStartStockMap: Record<string, number> = {};
  stockAtStartOfDay(pohyby, weekStartStr).forEach((line, k) => { weekStartStockMap[k] = line.qty; });

  // 📒 Sklad ke KONCI TÝDNE — taky z knihy, ne ručním součtem pohybů od
  // pondělí. Ten součet se s knihou rozcházel v týdnu, do kterého padne
  // 1. den měsíce: inventura (počáteční stav) je nový výchozí bod a ruční
  // součet od pondělí ji do konce týdne ignoroval, zatímco Sklad i Inventura
  // s ní počítaly hned — dvě různá čísla pro tentýž sklad.
  const weekEndStockMap: Record<string, number> = {};
  stockAsOf(pohyby, weekEndStr).forEach((line, k) => { weekEndStockMap[k] = line.qty; });

  // Totéž, ale BEZ závozů tohoto týdne — kolik by bylo k dispozici, kdyby
  // objednávky ještě nevyjely. Proti tomuhle se počítá "chybí stočit",
  // protože orderedQty níž zahrnuje i zavezené objednávky (jinak by se
  // tytéž kusy odečetly dvakrát).
  const weekEndBezZavozuMap: Record<string, number> = {};
  stockAsOf(pohyby.filter((m) => !(m.kind === 'zavoz' && isThisWeek(m.date))), weekEndStr)
    .forEach((line, k) => { weekEndBezZavozuMap[k] = line.qty; });

  const producedRows = [...bottlingRows, ...keggingRows];

  // Pohyby OD PONDĚLÍ DO TEĎ (tento týden) — stočeno hned zvyšuje sklad,
  // bez ohledu na to, jak je na tom kterákoli konkrétní objednávka.
  const bottledMap: Record<string, number> = {};
  producedRows.filter((r) => isThisWeek(r.entry_date)).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    bottledMap[k] = (bottledMap[k] || 0) + Number(r.quantity || 0);
  });
  const outgoingMap: Record<string, number> = {};
  [...fasovaniRows, ...prodejnaRows, ...writeoffsRows, ...akceOutRows].filter((r) => isThisWeek(r.entry_date)).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    outgoingMap[k] = (outgoingMap[k] || 0) + Number(r.quantity || 0);
  });
  {
    const seen = new Set<string>();
    bottlingRows.filter((r) => isThisWeek(r.entry_date)).forEach((r) => {
      const res = resolveKegsUsed(r, packages);
      if (!res || !r.beer_id) return;
      const key = `${r.entry_date}|${r.beer_id}|${res.kegsUsed}|${res.kegPkgId}|${r.created_at || r.note || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      const k = `${r.beer_id}__${res.kegPkgId}`;
      outgoingMap[k] = (outgoingMap[k] || 0) + res.kegsUsed;
    });
  }
  const list: PackageNeedsRow[] = [];
  beers.forEach((b) => {
    packages.filter((p) => targetPkgIds.has(p.id)).forEach((p) => {
      const k = `${b.id}__${p.id}`;
      const invQty = Number(weekStartStockMap[k] || 0);
      const bottledQty = Number(bottledMap[k] || 0);
      const outgoingQty = Number(outgoingMap[k] || 0);
      // Fyzický sklad ke konci týdne (sloupec "Sklad") — zavezené objednávky
      // už fyzicky odešly a skladová kniha je má odečtené.
      const stockQty = Math.max(0, Number(weekEndStockMap[k] || 0));
      const orderedQty = Number(orderedMap[k] || 0);
      // Kolik ještě chybí dotočit do konce týdne — porovnává CELKOVOU
      // týdenní poptávku (orderedQty, viz výše) s tím, co bylo k dispozici
      // BEZ odečtení zavezených (ty už jsou v orderedQty zahrnuté jako
      // součást poptávky, viz komentář u weekEndBezZavozuMap).
      const neededQty = Math.max(0, orderedQty - Math.max(0, Number(weekEndBezZavozuMap[k] || 0)));

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
