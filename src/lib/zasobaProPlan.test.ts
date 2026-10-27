import { describe, it, expect } from 'vitest';
import { computeKeggingPlan, mergeWeekPlan, zasobaProPlan } from './keggingPlan';
import { zbytekKeKonciTydne } from './tydenniZbytek';

// 🔴 Z provozu 22. 9. 2026: „ve skladě se mi ukazujou sudy správně, ale ve
// stáčení to, co chybí, ne… je objednáno 6×30 desítky a nejsou nastočený,
// přesto tam svítí fajfka."
//
// Příčina byla ve VOLAJÍCÍCH (Kegging.tsx, BottlingScreen.tsx,
// CoStocitOkno.tsx): zásobu pro plán stavěli BEZ `zavozDeductionRows` —
// jenže ne jen za tenhle týden, ale za CELOU HISTORII. Fond pak obsahoval
// každý sud, který kdy odjel, a plán tvrdil, že je vše pokryté.
//
// Správně (od 27. 10. 2026 jedno místo, `zasobaProPlan`): skladová kniha se
// všemi odpočty, jen bez odvozu objednávek TOHOTO týdne — ty jsou pořád
// v poptávce. Tenhle test hlídá celý ten řetěz, ne jen jeden jeho kus.

const packages = [{ id: 'p30', label: '30l', kind: 'keg', volume_l: 30 }];
const beers = [{ id: 'b-des', name: '10° Desítka' }];
const WEEK = '2026-35'; // po 24. 8. – ne 30. 8. 2026
const STREDA = '2026-08-26';

const zdroje = (over: any) => ({
  inventoryRows: [], bottlingRows: [], keggingRows: [], fasovaniRows: [], prodejnaRows: [],
  writeoffsRows: [], akceRows: [], prefukRows: [], adjustmentRows: [], packages,
  ...over,
});
/** Stav, jak ho ukazuje Sklad. */
const sklad = (over: any, den = STREDA) => zbytekKeKonciTydne(zdroje(over) as any, den);

describe('zásoba pro plán stáčení — staré odvozy nesmí dělat fantomovou zásobu', () => {
  it('všechno stočené už dávno odjelo → sklad 0, a plán chce stočit celou objednávku', () => {
    // V srpnu stočeno 100, postupně rozvezeno 100. Fyzicky není nic.
    const over = {
      keggingRows: [{ entry_date: '2026-08-03', beer_id: 'b-des', package_id: 'p30', quantity: 100 }],
      zavozDeductionRows: [
        { deduct_date: '2026-08-10', beer_id: 'b-des', package_id: 'p30', quantity: 60, order_id: 'stara1' },
        { deduct_date: '2026-08-17', beer_id: 'b-des', package_id: 'p30', quantity: 40, order_id: 'stara2' },
      ],
    };
    expect(sklad(over).get('b-des__p30')).toBe(0);

    const orders = [{ id: 'o1', delivery_date: STREDA, order_date: STREDA, status: 'nova', place_name: 'Maneo' }];
    const orderItems = [{ id: 'i1', order_id: 'o1', beer_id: 'b-des', package_id: 'p30', quantity: 6 }];
    const zasoba = zasobaProPlan(zdroje(over) as any, STREDA, orders, orderItems, WEEK);
    // Staré odvozy patří starým objednávkám — v zásobě zůstávají.
    expect(zasoba.get('b-des__p30')).toBe(0);

    const plans = computeKeggingPlan({
      beers, packages, orders, orderItems, keggingRows: [],
      zavozDeductionRows: over.zavozDeductionRows, weekKey: WEEK, currentStockMap: zasoba,
    });
    // Nic na skladě, nic nestočeno → chybí stočit všech 6.
    expect(plans.find((p) => p.day === 'st')!.totalMissing).toBe(6);
  });

  it('odvoz z TOHOTO týdne zásobu nesnižuje — jeho objednávka je pořád v poptávce', () => {
    // Stočeno 16, ve středu odvezeno 12 → Sklad ukazuje 4.
    const keggingRows = [{ entry_date: '2026-08-24', beer_id: 'b-des', package_id: 'p30', quantity: 16 }];
    const zavozDeductionRows = [{ deduct_date: STREDA, beer_id: 'b-des', package_id: 'p30', quantity: 12, order_id: 'o1' }];
    expect(sklad({ keggingRows, zavozDeductionRows }).get('b-des__p30')).toBe(4);

    const orders = [
      { id: 'o1', delivery_date: STREDA, order_date: STREDA, status: 'nova', place_name: 'A' },
      { id: 'o2', delivery_date: '2026-08-27', order_date: '2026-08-27', status: 'nova', place_name: 'B' },
    ];
    const orderItems = [
      { id: 'i1', order_id: 'o1', beer_id: 'b-des', package_id: 'p30', quantity: 12 },
      { id: 'i2', order_id: 'o2', beer_id: 'b-des', package_id: 'p30', quantity: 4 },
    ];
    const plans = computeKeggingPlan({
      beers, packages, orders, orderItems, keggingRows, zavozDeductionRows, weekKey: WEEK,
      currentStockMap: zasobaProPlan(zdroje({ keggingRows, zavozDeductionRows }) as any, STREDA, orders, orderItems, WEEK),
    });
    // 16 stočeno, 16 objednáno → nic nechybí (z provozu 16. 9. 2026:
    // „pokud mám na skladě 11×30, tak mi přece nemůže chybět 5×30").
    expect(plans.find((p) => p.day === 'st')!.totalMissing).toBe(0);
    expect(plans.find((p) => p.day === 'ct')!.totalMissing).toBe(0);
  });
});

describe('zásoba pro plán — odvoz se vrací jen tam, kde ho kniha počítá', () => {
  it('26. 10. 2026: inventura 80 a odvoz 14 týž den → zásoba 80, chybí 20 (ne 6)', () => {
    // Napočítaný stav je konec dne: odvoz z téhož dne v něm už je a kniha ho
    // za inventurou nepočítá. Vrátit ho by zásobu nafouklo na 94.
    const over = {
      inventoryRows: [{ entry_date: STREDA, beer_id: 'b-des', package_id: 'p30', quantity: 80, note: 'Fyzická inventura' }],
      zavozDeductionRows: [{ deduct_date: STREDA, beer_id: 'b-des', package_id: 'p30', quantity: 14, order_id: 'o1' }],
    };
    const orders = [{ id: 'o1', delivery_date: STREDA, order_date: STREDA, status: 'nova', place_name: 'Hospoda' }];
    const orderItems = [{ id: 'i1', order_id: 'o1', beer_id: 'b-des', package_id: 'p30', quantity: 100 }];
    const zasoba = zasobaProPlan(zdroje(over) as any, STREDA, orders, orderItems, WEEK);
    expect(zasoba.get('b-des__p30')).toBe(80);
    const plans = computeKeggingPlan({
      beers, packages, orders, orderItems, keggingRows: [], zavozDeductionRows: over.zavozDeductionRows,
      weekKey: WEEK, currentStockMap: zasoba,
    });
    expect(mergeWeekPlan(plans, 'týden').totalMissing).toBe(20);
  });

  it('27. 10. 2026: 10° 30 l — sklad 0, stočeno 8 na objednávku 8 → nechybí nic', () => {
    // „na skladě byla 0, dnes objednávka na 8, 8× 30 jsem stočil, mělo by zbývat 0."
    const keggingRows = [{ entry_date: STREDA, beer_id: 'b-des', package_id: 'p30', quantity: 8 }];
    const orders = [{ id: 'maneo', delivery_date: '2026-08-27', order_date: STREDA, status: 'nova', place_name: 'Maneo' }];
    const orderItems = [{ id: 'i-m', order_id: 'maneo', beer_id: 'b-des', package_id: 'p30', quantity: 8 }];
    const plans = computeKeggingPlan({
      beers, packages, orders, orderItems, keggingRows, weekKey: WEEK,
      currentStockMap: zasobaProPlan(zdroje({ keggingRows }) as any, STREDA, orders, orderItems, WEEK),
    });
    expect(mergeWeekPlan(plans, 'týden').totalMissing).toBe(0);
  });

  it('27. 10. 2026: zavezení dřívějších dnů týdne se neodečítá podruhé', () => {
    // Pondělí: stočen 1, odvezen 1 (petr). Úterý: stočeno 8, odvezen 1
    // (Restaurace). Sklad 7, čtvrtek Maneo 8 → chybí 1 (ne 3).
    const keggingRows = [
      { entry_date: '2026-08-24', beer_id: 'b-des', package_id: 'p30', quantity: 1 },
      { entry_date: '2026-08-25', beer_id: 'b-des', package_id: 'p30', quantity: 8 },
    ];
    const zavozDeductionRows = [
      { deduct_date: '2026-08-24', beer_id: 'b-des', package_id: 'p30', quantity: 1, order_id: 'petr' },
      { deduct_date: '2026-08-25', beer_id: 'b-des', package_id: 'p30', quantity: 1, order_id: 'restaurace' },
    ];
    const orders = [
      { id: 'petr', delivery_date: '2026-08-24', order_date: '2026-08-24', status: 'nova', place_name: 'petr', is_delivered: true },
      { id: 'restaurace', delivery_date: '2026-08-25', order_date: '2026-08-25', status: 'nova', place_name: 'Restaurace', is_delivered: true },
      { id: 'maneo', delivery_date: '2026-08-27', order_date: '2026-08-25', status: 'nova', place_name: 'Maneo' },
    ];
    const orderItems = [
      { id: 'i-p', order_id: 'petr', beer_id: 'b-des', package_id: 'p30', quantity: 1 },
      { id: 'i-r', order_id: 'restaurace', beer_id: 'b-des', package_id: 'p30', quantity: 1 },
      { id: 'i-m', order_id: 'maneo', beer_id: 'b-des', package_id: 'p30', quantity: 8 },
    ];
    expect(sklad({ keggingRows, zavozDeductionRows }, '2026-08-25').get('b-des__p30')).toBe(7);
    const plans = computeKeggingPlan({
      beers, packages, orders, orderItems, keggingRows, zavozDeductionRows, weekKey: WEEK,
      currentStockMap: zasobaProPlan(zdroje({ keggingRows, zavozDeductionRows }) as any, '2026-08-25', orders, orderItems, WEEK),
    });
    expect(plans.find((p) => p.day === 'ct')!.totalMissing).toBe(1);
    expect(mergeWeekPlan(plans, 'týden').totalMissing).toBe(1);
  });
});
