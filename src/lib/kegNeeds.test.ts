import { describe, it, expect, beforeEach } from 'vitest';
import { computeKegNeeds, KegNeedsInput } from './kegNeeds';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';

const todayStr = '2026-08-12';
const weekKey = isoWeekKey(todayStr);

const BEER = { id: 'b1', name: 'Světlý ležák 11°' };
const PKG_KEG = { id: 'p-keg', label: 'KEG 50L', kind: 'keg', volume_l: 50 };
const PKG_BOTTLE = { id: 'p-bottle', label: 'Lahve 0,5L', kind: 'bottle', volume_l: 0.5 };

function makeInput(patch: Partial<KegNeedsInput> = {}): KegNeedsInput {
  return {
    beers: [BEER],
    packages: [PKG_KEG, PKG_BOTTLE],
    orders: [],
    orderItems: [],
    inventoryRows: [],
    keggingRows: [],
    fasovaniRows: [],
    prodejnaRows: [],
    writeoffsRows: [],
    prefukRows: [],
    weekKey,
    todayStr,
    ...patch,
  };
}

beforeEach(() => {
  localStorage.clear(); // getStartingStockMap má localStorage fallbacky — ať testy nezávisí na okolí
});

describe('computeKegNeeds', () => {
  it('prázdná data → žádné řádky potřeby', () => {
    expect(computeKegNeeds(makeInput())).toEqual([]);
  });

  it('počítají se jen objednávky AKTUÁLNÍHO TÝDNE (starší/budoucí týden se nepočítá)', () => {
    const rows = computeKegNeeds(
      makeInput({
        orders: [
          { id: 'o1', order_date: '2026-08-05', delivery_date: '2026-08-05', status: 'nova', is_delivered: false },       // starý týden → NE
          { id: 'o2', order_date: '2026-08-05', delivery_date: '2026-08-19', status: 'nova', is_delivered: false },       // budoucí týden → NE
          { id: 'o3', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false },               // aktuální týden → ANO
        ],
        orderItems: [
          { order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 10 },
          { order_id: 'o2', beer_id: 'b1', package_id: 'p-keg', quantity: 20 },
          { order_id: 'o3', beer_id: 'b1', package_id: 'p-keg', quantity: 5 },
        ],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    expect(row).toBeDefined();
    expect(row!.orderedQty).toBe(5); // jen o3 (aktuální týden)
    expect(row!.neededQty).toBe(5);  // sklad 0
  });

  it('už zavezené objednávky (is_delivered) se do "potřeba stočit" nepočítají, i když jsou v aktuálním týdnu', () => {
    const rows = computeKegNeeds(
      makeInput({
        orders: [
          { id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: true },   // zavezeno → NE
          { id: 'o2', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false },  // nezavezeno → ANO
        ],
        orderItems: [
          { order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 99 },
          { order_id: 'o2', beer_id: 'b1', package_id: 'p-keg', quantity: 7 },
        ],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    expect(row!.orderedQty).toBe(7);
  });

  it('počáteční sklad se převezme z konce předchozího měsíce (Fyzická inventura)', () => {
    const rows = computeKegNeeds(
      makeInput({
        inventoryRows: [{ entry_date: '2026-07-31', beer_id: 'b1', package_id: 'p-keg', quantity: 8, note: 'Fyzická' }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 20 }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    expect(row!.invQty).toBe(8);      // převod z předchozího měsíce
    expect(row!.stockQty).toBe(8);
    expect(row!.orderedQty).toBe(20);
    expect(row!.neededQty).toBe(12);  // 20 − 8
  });

  it('stočené sudy se rovnou počítají do skladu', () => {
    const rows = computeKegNeeds(
      makeInput({
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 10 }],
        keggingRows: [{ entry_date: todayStr, beer_id: 'b1', package_id: 'p-keg', quantity: 10 }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    expect(row!.bottledQty).toBe(10);
    expect(row!.stockQty).toBe(10);
    expect(row!.neededQty).toBe(0);   // 10 − 10 → pokryto
  });

  it('chybí stočit = max(0, objednáno − sklad); při dostatečném skladu je 0', () => {
    const rows = computeKegNeeds(
      makeInput({
        inventoryRows: [{ entry_date: '2026-08-01', beer_id: 'b1', package_id: 'p-keg', quantity: 5, note: 'Počáteční' }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 3 }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    expect(row!.stockQty).toBe(5);
    expect(row!.orderedQty).toBe(3);
    expect(row!.neededQty).toBe(0);   // sklad ≥ objednávky → pokryto
  });

  it('přefuk: sudy ZE se odečtou, sudy DO se přičtou ke skladu', () => {
    const rows = computeKegNeeds(
      makeInput({
        inventoryRows: [{ entry_date: '2026-08-01', beer_id: 'b1', package_id: 'p-keg', quantity: 10, note: 'Počáteční' }],
        prefukRows: [
          { entry_date: '2026-08-10', beer_id: 'b1', from_package_id: 'p-keg', from_count: 4, to_package_id: 'p-bottle', to_count: 0 },
        ],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    expect(row!.stockQty).toBe(6); // 10 − 4 (přefuk ZE)
  });

  it('položka se svým vlastním odpočtem závozu (order_item_id) se nepočítá do orderedQty, i když objednávka ještě nemá is_delivered', () => {
    const rows = computeKegNeeds(
      makeInput({
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [
          { id: 'i1', order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 6 }, // ráno odečteno
          { id: 'i2', order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 4 }, // ještě čeká
        ],
        zavozDeductionRows: [{ deduct_date: todayStr, beer_id: 'b1', package_id: 'p-keg', quantity: 6, order_item_id: 'i1' }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    expect(row!.orderedQty).toBe(4); // jen i2 — i1 už je fyzicky odečtená
  });

  it('zavezené objednávky (zavoz_deductions) se odečtou z FYZICKÉHO skladu — stejný zdroj jako Sklad/Inventura', () => {
    const rows = computeKegNeeds(
      makeInput({
        inventoryRows: [{ entry_date: '2026-08-01', beer_id: 'b1', package_id: 'p-keg', quantity: 11, note: 'Počáteční' }],
        keggingRows: [{ entry_date: '2026-08-10', beer_id: 'b1', package_id: 'p-keg', quantity: 58 }],
        zavozDeductionRows: [{ deduct_date: '2026-08-11', beer_id: 'b1', package_id: 'p-keg', quantity: 3 }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    // 11 (počátek) + 58 (stočeno) − 3 (fyzicky zavezeno) = 66 skladem.
    expect(row!.stockQty).toBe(66);
  });

  it('lahve se do KEG potřeby nepočítají (jen obaly kind === "keg")', () => {
    const rows = computeKegNeeds(
      makeInput({
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 100 }],
      })
    );
    expect(rows).toEqual([]); // žádný pohyb/objednávka KEG
  });
});
