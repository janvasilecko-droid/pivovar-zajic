import { describe, it, expect } from 'vitest';
import { computeInventoryReconciliation, getStartingStockMap, flattenAkceNet } from './inventoryHelper';

describe('computeInventoryReconciliation', () => {
  it('bez dorovnání se manko počítá jako Skutečnost − Očekávání', () => {
    const r = computeInventoryReconciliation(100, 95, 0);
    expect(r.diffQty).toBe(-5);
    expect(r.reconciledQty).toBe(100);
    expect(r.diffAfterQty).toBe(-5);
  });

  it('dorovnáním manka (záporné ±) se manko vynuluje a teoretický stav sedne na skutečnost', () => {
    // Očekáváno 100, fyzicky 95 → manko −5 → dorovnáme −5
    const r = computeInventoryReconciliation(100, 95, -5);
    expect(r.reconciledQty).toBe(95);
    expect(r.diffAfterQty).toBe(0);
    // Původní manko zůstává zachované (NEpočítá se do stáčení ani odpočtů)
    expect(r.diffQty).toBe(-5);
  });

  it('přidává (+), když je fyzicky více, než očekává tabulka', () => {
    const r = computeInventoryReconciliation(100, 108, 8);
    expect(r.reconciledQty).toBe(108);
    expect(r.diffAfterQty).toBe(0);
  });

  it('částečné dorovnání manko jen zmenší, ale nevynuluje', () => {
    const r = computeInventoryReconciliation(100, 95, -3);
    expect(r.reconciledQty).toBe(97);
    expect(r.diffAfterQty).toBe(-2);
    expect(r.diffQty).toBe(-5);
  });

  it('dorovnání navíc (přebytek oproti manku) vytvoří kladný rozdíl po dorovnání', () => {
    const r = computeInventoryReconciliation(100, 95, 2);
    expect(r.reconciledQty).toBe(102);
    expect(r.diffAfterQty).toBe(-7);
  });
});

describe('getStartingStockMap — přefuk KEGů v převodu z minulého měsíce', () => {
  // Přefuk (přelití piva mezi objemy sudů) počítal jen Sklad. Dashboard,
  // Inventura ani "potřeba stočit" o něm nevěděly, takže po přefuku
  // 20× 50l → 33× 30l ukazovaly o 20 padesátek víc a o 33 třicítek míň —
  // v inventuře to vypadalo jako manko u jedné velikosti a přebytek u druhé.
  const inventoryRows = [
    { entry_date: '2026-06-01', beer_id: 'b1', package_id: 'keg50', quantity: 20, note: 'Počáteční stav' },
    { entry_date: '2026-06-01', beer_id: 'b1', package_id: 'keg30', quantity: 0, note: 'Počáteční stav' },
  ];
  const prefukRows = [
    { entry_date: '2026-06-10', beer_id: 'b1', from_package_id: 'keg50', from_count: 20, to_package_id: 'keg30', to_count: 33 },
  ];

  it('odečte sudy, ze kterých se přefukovalo, a přičte ty, do kterých se přefouklo', () => {
    const map = getStartingStockMap(
      '2026-07', inventoryRows, [], [], [], [], [], 0, [], [], prefukRows
    );
    expect(map['b1__keg50']).toBe(0);
    expect(map['b1__keg30']).toBe(33);
  });

  it('bez předaného přefuku zůstane starý (nesprávný) stav — potvrzuje, že to dělá právě přefuk', () => {
    const map = getStartingStockMap('2026-07', inventoryRows, [], [], [], [], [], 0, [], []);
    expect(map['b1__keg50']).toBe(20);
    expect(map['b1__keg30'] ?? 0).toBe(0);
  });
});

describe('flattenAkceNet — čistý odběr z Akcí', () => {
  const akce = (odvezeno: number, vraceno: number) => [{
    entry_date: '2026-08-10',
    items: [{ beer_id: 'b1', package_id: 'keg30', quantity_taken: odvezeno, quantity_returned: vraceno }],
  }];

  it('odvezeno víc než vráceno → výdej v kladných kusech', () => {
    expect(flattenAkceNet(akce(10, 4))).toEqual([
      { entry_date: '2026-08-10', beer_id: 'b1', package_id: 'keg30', quantity: 6 },
    ]);
  });

  it('všechno se vrátilo → žádný pohyb', () => {
    expect(flattenAkceNet(akce(5, 5))).toEqual([]);
  });

  it('vráceno víc, než se odvezlo → záporný výdej, tedy příjem zpátky na sklad', () => {
    // Sudy vrácené z minulé akce. Dřív se řádek zahazoval, takže Sklad
    // (skladová kniha) o ně věděl a "co je potřeba stočit" ne — dvě čísla
    // pro jednu věc.
    expect(flattenAkceNet(akce(2, 5))).toEqual([
      { entry_date: '2026-08-10', beer_id: 'b1', package_id: 'keg30', quantity: -3 },
    ]);
  });
});
