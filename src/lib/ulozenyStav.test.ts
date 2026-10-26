import { describe, it, expect } from 'vitest';
import { buildMovements, stockAsOf } from './stockLedger';
import { zbytekKeKonciTydne } from './tydenniZbytek';
import { computeKeggingPlan, mergeWeekPlan } from './keggingPlan';
import { computePackageNeeds } from './packageNeeds';
import { computeBottlingNeeds } from './bottlingNeeds';
import { radkyRozboru } from './rozbor';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';

// 26. 10. 2026: uložený stav skladu je reset. Od té chvíle ho ukáže Sklad,
// Rozbor i „chybí stočit". Odvoz ze stejného dne v napočítaných 80 už je —
// druhý sklad (80 + 14) z toho dělal „chybí 6".

const DEN = '2026-10-26';
const BEER = { id: 'b12', name: '12° Světlá' };
const PKG = { id: 'p033', label: '0,33 l', kind: 'bottle', volume_l: 0.33 };
const inventoryRows = [{ entry_date: DEN, beer_id: 'b12', package_id: 'p033', quantity: 80, note: 'Fyzická inventura' }];
const zavozDeductionRows = [{ deduct_date: DEN, beer_id: 'b12', package_id: 'p033', quantity: 14, order_id: 'o1', order_item_id: 'i1' }];
const orders = [{ id: 'o1', delivery_date: DEN, order_date: DEN, status: 'nova', place_name: 'Hospoda' }];
const orderItems = [{ id: 'i1', order_id: 'o1', beer_id: 'b12', package_id: 'p033', quantity: 100 }];

describe('uložený stav skladu platí všude', () => {
  it('80× 0,33 l 12° Světlá: sklad i rozbor 80, objednávka 100 → chybí 20', () => {
    const pohyby = buildMovements({ inventoryRows, zavozDeductionRows, packages: [PKG] });
    expect(stockAsOf(pohyby, DEN).get('b12__p033')!.qty).toBe(80);

    const zasoba = zbytekKeKonciTydne({
      inventoryRows, zavozDeductionRows, packages: [PKG],
      bottlingRows: [], keggingRows: [], fasovaniRows: [], prodejnaRows: [],
      writeoffsRows: [], akceRows: [], prefukRows: [], adjustmentRows: [],
    }, DEN);
    expect(zasoba.get('b12__p033')).toBe(80);

    const tyden = mergeWeekPlan(computeKeggingPlan({
      beers: [BEER], packages: [PKG], orders, orderItems, keggingRows: [],
      zavozDeductionRows, weekKey: isoWeekKey(DEN),
      jeCilovyObal: (kind) => kind !== 'keg',
      currentStockMap: zasoba,
    }), 'týden');
    expect(tyden.items.find((it) => it.package_id === 'p033')!.missing).toBe(20);

    const rozbor = radkyRozboru({
      planSudy: [], planLahve: tyden.items, kegging: [], bottling: [],
      od: DEN, doDne: DEN, zasoba, piva: [BEER], obaly: [PKG],
    });
    const radek = rozbor.find((r) => r.package_id === 'p033')!;
    expect(radek.skladem).toBe(80);
    expect(radek.stocit).toBe(20);
    expect(radek.objednano).toBe(100);

    const potreba = computePackageNeeds({
      beers: [BEER], packages: [PKG], orders, orderItems, inventoryRows,
      bottlingRows: [], keggingRows: [], fasovaniRows: [], prodejnaRows: [],
      writeoffsRows: [], zavozDeductionRows, weekKey: isoWeekKey(DEN), todayStr: DEN,
    }, (kind) => kind !== 'keg');
    expect(potreba[0].stockQty).toBe(80);
    expect(potreba[0].neededQty).toBe(20);

    const potrebaStaceni = computeBottlingNeeds({
      beers: [BEER], packages: [PKG], plans: [], orders, orderItems, inventoryRows,
      bottlingRows: [], keggingRows: [], fasovaniRows: [], prodejnaRows: [],
      writeoffsRows: [], zavozDeductionRows, weekKey: isoWeekKey(DEN), todayStr: DEN,
    });
    expect(potrebaStaceni[0].stock).toBe(80);
    expect(potrebaStaceni[0].missing).toBe(20);
  });
});
