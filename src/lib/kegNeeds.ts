// ⚙️ Výpočet potřeby stáčení KEG sudů — „co je potřeba stočit“.
// ---------------------------------------------------------------------------
// Sestaví řádek pivo × KEG obal s těmito sloupci:
//   • invQty      – počáteční sklad měsíce (inventura s převodem z předchozího
//                   měsíce — pokud pro aktuální měsíc není „Počáteční“ záznam,
//                   vezme se koncový stav předchozího měsíce)
//   • bottledQty  – stočeno do KEGů v aktuálním měsíci
//   • outgoingQty – výdej v aktuálním měsíci (fašování + prodejna + odpisy + zavezené objednávky)
//   • stockQty    – sklad = max(0, inv + stočeno − výdej − přefuk ZE + přefuk DO)
//   • orderedQty  – objednávky v AKTUÁLNÍM TÝDNU (nový týden = nové objednávky),
//                   bez ohledu na to jestli mezitím byly zavezené
//   • neededQty   – chybí stočit = max(0, objednáno − sklad)
//
// Objednávky se počítají ZA TÝDEN (ne kumulativně za celou historii) — stáčení
// probíhá týdně, po dotočení týdne je potřeba 0 a v novém týdnu se počítá znovu
// z nových objednávek. Sklad se počítá shodně se Skladem (Stock.tsx), aby „sudy
// v plusu“ odpovídaly tomu, co je fyzicky na skladě.
import { getStartingStockMap } from './inventoryHelper';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';

export type KegNeedsRow = {
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

export type KegNeedsInput = {
  beers: { id: string; name: string }[];
  packages: { id: string; label: string; kind: string; volume_l: number }[];
  orders: any[];
  orderItems: any[];
  inventoryRows: any[];
  keggingRows: any[];
  fasovaniRows: any[];
  prodejnaRows: any[];
  writeoffsRows: any[];
  prefukRows: any[];
  /** Automatický odpočet závozu (stejný zdroj jako Sklad/Inventura — viz zavoz_deductions). */
  zavozDeductionRows?: any[];
  weekKey: string;
  todayStr: string;
};

export function computeKegNeeds(input: KegNeedsInput): KegNeedsRow[] {
  const {
    beers,
    packages,
    orders,
    orderItems,
    inventoryRows,
    keggingRows,
    fasovaniRows,
    prodejnaRows,
    writeoffsRows,
    prefukRows,
    zavozDeductionRows = [],
    weekKey,
    todayStr,
  } = input;
  const curMonth = todayStr.slice(0, 7);

  const kegPkgIds = new Set(packages.filter((p) => p.kind === 'keg').map((p) => p.id));

  // Objednávky v AKTUÁLNÍM TÝDNU (storno/vyřízené/už zavezené se nepočítají)
  const activeOrderIds = new Set(
    orders
      .filter((o) => {
        if (o.status === 'storno' || o.status === 'vyrizeno' || o.status === 'vyrizeno_zavoz') return false;
        if (o.is_delivered) return false;
        const targetDate = o.delivery_date || o.order_date;
        return !!targetDate && isoWeekKey(targetDate) === weekKey;
      })
      .map((o) => o.id)
  );

  const orderedMap: Record<string, number> = {};
  orderItems
    .filter((item) => item.package_id && kegPkgIds.has(item.package_id) && activeOrderIds.has(item.order_id))
    .forEach((item) => {
      if (!item.beer_id || !item.package_id) return;
      const k = `${item.beer_id}__${item.package_id}`;
      orderedMap[k] = (orderedMap[k] || 0) + Number(item.quantity || 0);
    });

  // Počáteční sklad měsíce — inventura s automatickým převodem z předchozího měsíce.
  // (bottlingRows = [] — lahve nejsou KEG zásoba; KEGy se berou z keggingRows.)
  const invMap = getStartingStockMap(curMonth, inventoryRows, [], keggingRows, fasovaniRows, prodejnaRows, writeoffsRows);

  // Pohyby v aktuálním měsíci
  const bottledMap: Record<string, number> = {};
  keggingRows.filter((r) => r.entry_date?.startsWith(curMonth)).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    bottledMap[k] = (bottledMap[k] || 0) + Number(r.quantity || 0);
  });

  const outgoingMap: Record<string, number> = {};
  [...fasovaniRows, ...prodejnaRows, ...writeoffsRows].filter((r) => r.entry_date?.startsWith(curMonth)).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    outgoingMap[k] = (outgoingMap[k] || 0) + Number(r.quantity || 0);
  });

  // Skutečně zavezené objednávky (automatický odpočet ráno v 01:00) — bez tohohle
  // by "sklad" jen rostl s každým stočením a nikdy se nesnížil o to, co už fyzicky
  // odjelo k odběratelům. Stejný zdroj jako Sklad (Stock.tsx) a Inventura.
  zavozDeductionRows.filter((r) => r.deduct_date?.startsWith(curMonth)).forEach((r) => {
    if (!r.beer_id || !r.package_id) return;
    const k = `${r.beer_id}__${r.package_id}`;
    outgoingMap[k] = (outgoingMap[k] || 0) + Number(r.quantity || 0);
  });

  // Přefuky: sudy ZE (from_package_id) se odečtou ze skladu, sudy DO (to_package_id) se přičtou
  const prefukFromMap: Record<string, number> = {};
  const prefukToMap: Record<string, number> = {};
  prefukRows.filter((r) => r.entry_date?.startsWith(curMonth)).forEach((r) => {
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

  const list: KegNeedsRow[] = [];
  beers.forEach((b) => {
    packages.filter((p) => kegPkgIds.has(p.id)).forEach((p) => {
      const k = `${b.id}__${p.id}`;
      const invQty = Number(invMap[k] || 0);
      const bottledQty = Number(bottledMap[k] || 0);
      const outgoingQty = Number(outgoingMap[k] || 0);
      const prefukFromQty = Number(prefukFromMap[k] || 0);
      const prefukToQty = Number(prefukToMap[k] || 0);
      const stockQty = Math.max(0, invQty + bottledQty - outgoingQty - prefukFromQty + prefukToQty);
      const orderedQty = Number(orderedMap[k] || 0);
      const neededQty = Math.max(0, orderedQty - stockQty);

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
