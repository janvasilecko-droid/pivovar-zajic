import { describe, it, expect, beforeEach } from 'vitest';
import { computeKegNeeds, KegNeedsInput } from './kegNeeds';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';

// Středa 2026-08-12 — aktuální týden; 2026-08-19 je další týden (stejný den v týdnu).
const todayStr = '2026-08-12';
const weekKey = isoWeekKey(todayStr);
const nextWeekStr = '2026-08-19';
const nextWeekKey = isoWeekKey(nextWeekStr);

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

  it('počítají se JEN objednávky aktuálního týdne (ne celý měsíc) — budoucí týdny ne', () => {
    const rows = computeKegNeeds(
      makeInput({
        orders: [
          { id: 'o1', order_date: '2026-08-05', delivery_date: todayStr, status: 'nova' },            // tento týden
          { id: 'o2', order_date: '2026-08-05', delivery_date: nextWeekStr, status: 'nova' },          // příští týden → NE
          { id: 'o3', order_date: todayStr, delivery_date: null, status: 'nova' },                     // bez dovozu → order_date
        ],
        orderItems: [
          { order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 10 },
          { order_id: 'o2', beer_id: 'b1', package_id: 'p-keg', quantity: 99 },
          { order_id: 'o3', beer_id: 'b1', package_id: 'p-keg', quantity: 5 },
        ],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    expect(row).toBeDefined();
    expect(row!.orderedQty).toBe(15); // 10 (tento týden) + 5 (bez dovozu, order_date v tomto týdnu)
    expect(row!.neededQty).toBe(15);  // sklad 0
  });

  it('počáteční sklad se převezme z konce předchozího měsíce (Fyzická inventura)', () => {
    const rows = computeKegNeeds(
      makeInput({
        inventoryRows: [{ entry_date: '2026-07-31', beer_id: 'b1', package_id: 'p-keg', quantity: 8, note: 'Fyzická' }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova' }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 20 }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    expect(row!.invQty).toBe(8);      // převod z předchozího měsíce
    expect(row!.stockQty).toBe(8);
    expect(row!.orderedQty).toBe(20);
    expect(row!.neededQty).toBe(12);  // 20 − 8
  });

  it('o víkendu po dotočení týdne je potřeba 0 (stočené sudy jsou na skladě)', () => {
    const rows = computeKegNeeds(
      makeInput({
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova' }],
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
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova' }],
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

  it('zavezené objednávky (zavoz_deductions) se odečtou ze skladu — stejný zdroj jako Sklad/Inventura', () => {
    const rows = computeKegNeeds(
      makeInput({
        inventoryRows: [{ entry_date: '2026-08-01', beer_id: 'b1', package_id: 'p-keg', quantity: 11, note: 'Počáteční' }],
        keggingRows: [{ entry_date: '2026-08-10', beer_id: 'b1', package_id: 'p-keg', quantity: 58 }],
        zavozDeductionRows: [{ deduct_date: '2026-08-11', beer_id: 'b1', package_id: 'p-keg', quantity: 3 }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    // 11 (počátek) + 58 (stočeno) − 3 (zavezeno) = 66 — bez tohohle odpočtu by
    // sklad jen rostl s každým stočením a nikdy neodrážel to, co už fyzicky
    // odjelo k odběratelům (přesně tenhle typ chyby nahlásil uživatel).
    expect(row!.stockQty).toBe(66);
  });

  it('lahve se do KEG potřeby nepočítají (jen obaly kind === "keg")', () => {
    const rows = computeKegNeeds(
      makeInput({
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova' }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 100 }],
      })
    );
    expect(rows).toEqual([]); // žádný pohyb/objednávka KEG
  });
});
