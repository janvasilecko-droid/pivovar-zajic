import { describe, it, expect } from 'vitest';
import { computeInventoryReconciliation, flattenAkceNet } from './inventoryHelper';

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
