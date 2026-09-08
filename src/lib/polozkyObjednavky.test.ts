import { describe, it, expect } from 'vitest';
import { vseHotovo, zbyvaHotovych, stoceneNepripravene } from './polozkyObjednavky';

const p = (bottled: boolean, prepared: boolean) => ({ is_bottled: bottled, is_prepared: prepared });

describe('vseHotovo', () => {
  it('hotové je, až když je odškrtnutá každá položka', () => {
    expect(vseHotovo([p(true, true), p(true, false)], 'is_prepared')).toBe(false);
    expect(vseHotovo([p(true, true), p(false, true)], 'is_prepared')).toBe(true);
    expect(vseHotovo([p(true, true), p(false, true)], 'is_bottled')).toBe(false);
  });

  it('objednávka bez položek hotová NENÍ', () => {
    // „Všechny položky jsou připravené" platí u nuly položek triviálně —
    // a prázdná objednávka by se tím označila za nachystanou a zmizela
    // z práce, aniž by se čehokoliv týkala.
    expect(vseHotovo([], 'is_prepared')).toBe(false);
    expect(vseHotovo([], 'is_bottled')).toBe(false);
  });

  it('chybějící příznak (starý řádek z databáze) se bere jako neodškrtnutý', () => {
    expect(vseHotovo([{ is_prepared: true }], 'is_bottled')).toBe(false);
    expect(vseHotovo([{ is_bottled: null }], 'is_bottled')).toBe(false);
  });
});

describe('zbyvaHotovych', () => {
  it('počítá neodškrtnuté', () => {
    expect(zbyvaHotovych([p(true, true), p(false, false), p(true, false)], 'is_prepared')).toBe(2);
    expect(zbyvaHotovych([p(true, true), p(false, false), p(true, false)], 'is_bottled')).toBe(1);
  });
});

describe('stoceneNepripravene', () => {
  it('vrátí to, co leží mezi sklepem a autem', () => {
    const polozky = [p(true, false), p(true, true), p(false, false)];
    expect(stoceneNepripravene(polozky)).toEqual([p(true, false)]);
  });
});
