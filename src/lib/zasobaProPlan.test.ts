import { describe, it, expect } from 'vitest';
import { computeKeggingPlan } from './keggingPlan';
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
// Správně: do zásoby patří VŠECHNY odpočty (stejné číslo jako ukazuje
// Sklad). Odpočty TOHOTO týdne si pak `computeKeggingPlan` vrací sám
// (`vracenoZaZavozy`), protože jejich objednávky pořád počítá do poptávky.
// Tenhle test hlídá celý ten řetěz, ne jen jeden jeho kus.

const packages = [{ id: 'p30', label: '30l', kind: 'keg', volume_l: 30 }];
const beers = [{ id: 'b-des', name: '10° Desítka' }];
const WEEK = '2026-35'; // po 24. 8. – ne 30. 8. 2026
const STREDA = '2026-08-26';

/** Zásoba přesně tak, jak ji staví obrazovky (a jak ji ukazuje Sklad). */
const zasobaProPlan = (over: any) => zbytekKeKonciTydne({
  inventoryRows: [], bottlingRows: [], keggingRows: [], fasovaniRows: [], prodejnaRows: [],
  writeoffsRows: [], akceRows: [], prefukRows: [], adjustmentRows: [], packages,
  ...over,
} as any, STREDA);

describe('zásoba pro plán stáčení — staré odvozy nesmí dělat fantomovou zásobu', () => {
  it('všechno stočené už dávno odjelo → sklad 0, a plán chce stočit celou objednávku', () => {
    // V srpnu stočeno 100, postupně rozvezeno 100. Fyzicky není nic.
    const stock = zasobaProPlan({
      keggingRows: [{ entry_date: '2026-08-03', beer_id: 'b-des', package_id: 'p30', quantity: 100 }],
      zavozDeductionRows: [
        { deduct_date: '2026-08-10', beer_id: 'b-des', package_id: 'p30', quantity: 60 },
        { deduct_date: '2026-08-17', beer_id: 'b-des', package_id: 'p30', quantity: 40 },
      ],
    });
    expect(stock.get('b-des__p30')).toBe(0);

    const plans = computeKeggingPlan({
      beers, packages,
      orders: [{ id: 'o1', delivery_date: STREDA, order_date: STREDA, status: 'nova', place_name: 'Maneo' }],
      orderItems: [{ id: 'i1', order_id: 'o1', beer_id: 'b-des', package_id: 'p30', quantity: 6 }],
      keggingRows: [],
      zavozDeductionRows: [
        { deduct_date: '2026-08-10', beer_id: 'b-des', package_id: 'p30', quantity: 60 },
        { deduct_date: '2026-08-17', beer_id: 'b-des', package_id: 'p30', quantity: 40 },
      ],
      weekKey: WEEK,
      currentStockMap: stock,
    });
    // Nic na skladě, nic nestočeno → chybí stočit všech 6.
    expect(plans.find((p) => p.day === 'st')!.totalMissing).toBe(6);
  });

  it('odvoz z TOHOTO týdne zásobu nesnižuje — jeho objednávka je pořád v poptávce', () => {
    // Stočeno 16, ve středu odvezeno 12 → Sklad ukazuje 4.
    const stock = zasobaProPlan({
      keggingRows: [{ entry_date: '2026-08-24', beer_id: 'b-des', package_id: 'p30', quantity: 16 }],
      zavozDeductionRows: [{ deduct_date: STREDA, beer_id: 'b-des', package_id: 'p30', quantity: 12 }],
    });
    expect(stock.get('b-des__p30')).toBe(4);

    const plans = computeKeggingPlan({
      beers, packages,
      orders: [
        { id: 'o1', delivery_date: STREDA, order_date: STREDA, status: 'nova', place_name: 'A' },
        { id: 'o2', delivery_date: '2026-08-27', order_date: '2026-08-27', status: 'nova', place_name: 'B' },
      ],
      orderItems: [
        { id: 'i1', order_id: 'o1', beer_id: 'b-des', package_id: 'p30', quantity: 12 },
        { id: 'i2', order_id: 'o2', beer_id: 'b-des', package_id: 'p30', quantity: 4 },
      ],
      keggingRows: [{ entry_date: '2026-08-24', beer_id: 'b-des', package_id: 'p30', quantity: 16 }],
      zavozDeductionRows: [{ deduct_date: STREDA, beer_id: 'b-des', package_id: 'p30', quantity: 12 }],
      weekKey: WEEK,
      currentStockMap: stock,
    });
    // 16 stočeno, 16 objednáno → nic nechybí (z provozu 16. 9. 2026:
    // „pokud mám na skladě 11×30, tak mi přece nemůže chybět 5×30").
    expect(plans.find((p) => p.day === 'st')!.totalMissing).toBe(0);
    expect(plans.find((p) => p.day === 'ct')!.totalMissing).toBe(0);
  });
});
