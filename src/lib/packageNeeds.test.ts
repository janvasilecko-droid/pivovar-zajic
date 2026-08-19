// Test sdílené logiky packageNeeds.ts na příkladu LAHVÍ (kind !== 'keg') —
// stejný scénář, jaký uživatel reportoval na BottlingScreen.tsx: čerstvé
// stočení dnes musí hned pokrýt dnešní objednávku, i když jiná objednávka
// týdne byla dřív zavezena. KEG případ je pokrytý v kegNeeds.test.ts (ten
// je jen tenký wrapper nad touto sdílenou funkcí).
import { describe, it, expect, beforeEach } from 'vitest';
import { computePackageNeeds, PackageNeedsInput } from './packageNeeds';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';

const todayStr = '2026-08-12';
const weekKey = isoWeekKey(todayStr);
const weekMonday = weekRange(weekKey).start.toISOString().slice(0, 10);

const BEER = { id: 'b1', name: 'Světlý ležák 11°' };
const PKG_BOTTLE = { id: 'p-bottle', label: 'Lahve 0,5L', kind: 'bottle', volume_l: 0.5 };
const PKG_KEG = { id: 'p-keg', label: 'KEG 50L', kind: 'keg', volume_l: 50 };

function makeInput(patch: Partial<PackageNeedsInput> = {}): PackageNeedsInput {
  return {
    beers: [BEER],
    packages: [PKG_BOTTLE, PKG_KEG],
    orders: [],
    orderItems: [],
    inventoryRows: [],
    bottlingRows: [],
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

const bottleFilter = (kind: string) => kind !== 'keg';

beforeEach(() => {
  localStorage.clear();
});

describe('computePackageNeeds — lahve (kind !== "keg")', () => {
  it('KEGy se do potřeby lahví nepočítají', () => {
    const rows = computePackageNeeds(
      makeInput({
        keggingRows: [{ entry_date: todayStr, beer_id: 'b1', package_id: 'p-keg', quantity: 50 }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 10 }],
      }),
      bottleFilter
    );
    expect(rows).toEqual([]);
  });

  it('čerstvé stočení TENTO TÝDEN hned pokryje novou objednávku, i když jiná dřívější objednávka týdne už byla zavezena', () => {
    const rows = computePackageNeeds(
      makeInput({
        bottlingRows: [
          { entry_date: weekMonday, beer_id: 'b1', package_id: 'p-bottle', quantity: 90 },
          { entry_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 20 },
        ],
        zavozDeductionRows: [{ deduct_date: weekMonday, beer_id: 'b1', package_id: 'p-bottle', quantity: 70 }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 20 }],
      }),
      bottleFilter
    );
    const row = rows.find((r) => r.package_id === 'p-bottle');
    // 0 (počátek týdne) + 90 + 20 (stočeno tento týden) − 70 (zavezeno tento týden) = 40 skladem.
    expect(row!.stockQty).toBe(40);
    expect(row!.orderedQty).toBe(20);
    expect(row!.neededQty).toBe(0);
  });

  it('zavezená objednávka tento týden se neodečítá dvakrát — nenafukuje neededQty', () => {
    // Reálný případ: v pondělí 2ks skladem, tento týden stočeno 19ks (=21
    // k dispozici). Objednáno celkem 20ks, z toho 6ks (Kiosek 5 + Malešice 1)
    // už dnes fyzicky zavezeno (zavozDeductionRows). orderedQty (20) tuhle
    // zavezenou část UŽ obsahuje — kdyby stockQty odečetlo zavezené znovu,
    // "chybí" by vyšlo 5 místo správné 0 (a 1ks by mělo zbýt na skladě).
    const rows = computePackageNeeds(
      makeInput({
        keggingRows: [{ entry_date: todayStr, beer_id: 'b1', package_id: 'p-keg', quantity: 19 }],
        inventoryRows: [{ entry_date: weekMonday, beer_id: 'b1', package_id: 'p-keg', quantity: 2, note: 'Počáteční stav' }],
        zavozDeductionRows: [{ deduct_date: todayStr, beer_id: 'b1', package_id: 'p-keg', quantity: 6 }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 20 }],
      }),
      (kind: string) => kind === 'keg'
    );
    const row = rows.find((r) => r.package_id === 'p-keg');
    expect(row!.stockQty).toBe(15); // fyzicky teď: 2 + 19 − 6 (zavezeno)
    expect(row!.neededQty).toBe(0); // 2 + 19 − 20 (objednáno, zavezené v tom už je) = 1 zbyde, ne chybí
  });

  it('orderedQty počítá VŠECHNY objednávky týdne (i už zavezené is_delivered)', () => {
    const rows = computePackageNeeds(
      makeInput({
        orders: [
          { id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: true },
          { id: 'o2', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false },
        ],
        orderItems: [
          { order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 99 },
          { order_id: 'o2', beer_id: 'b1', package_id: 'p-bottle', quantity: 7 },
        ],
      }),
      bottleFilter
    );
    const row = rows.find((r) => r.package_id === 'p-bottle');
    expect(row!.orderedQty).toBe(106);
  });
});
