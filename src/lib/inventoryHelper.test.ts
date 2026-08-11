import { describe, it, expect } from 'vitest';
import { computeInventoryReconciliation } from './inventoryHelper';

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
