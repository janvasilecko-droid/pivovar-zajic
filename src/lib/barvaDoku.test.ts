// Z provozu 7. 10. 2026: spodní lišta v barvách dlaždic, aktivní stránka
// vyplněná — bílé podbarvení na bílé liště nebylo vidět.
import { describe, it, expect } from 'vitest';
import { citelnaNaPodkladu, kontrast, pismoNaBarve, PODKLAD_SVETLY, PODKLAD_TMAVY } from './barvaDoku';
import { COLOR_HEX } from './homeLayout';

describe('barvy spodní lišty', () => {
  it('tmavá barva dlaždice zůstane, jak je', () => {
    expect(citelnaNaPodkladu('#1864ab', PODKLAD_SVETLY)).toBe('#1864ab');
  });

  it('každá barva dlaždice je na liště čitelná ve světlém i tmavém režimu', () => {
    for (const hex of Object.values(COLOR_HEX)) {
      expect(kontrast(citelnaNaPodkladu(hex, PODKLAD_SVETLY), PODKLAD_SVETLY)).toBeGreaterThanOrEqual(4.5);
      expect(kontrast(citelnaNaPodkladu(hex, PODKLAD_TMAVY), PODKLAD_TMAVY)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('žlutá se jen ztmaví, nezčerná', () => {
    const v = citelnaNaPodkladu(COLOR_HEX.citrus, PODKLAD_SVETLY);
    expect(v).not.toBe('#000000');
    expect(kontrast(v, PODKLAD_SVETLY)).toBeGreaterThanOrEqual(4.5);
  });

  it('na plné barvě dlaždice vybere čitelnější písmo', () => {
    expect(pismoNaBarve(COLOR_HEX.navy)).toBe('#ffffff');
    expect(pismoNaBarve(COLOR_HEX.citrus)).toBe('#111827');
  });

  it('nečitelná vlastní barva nespadne', () => {
    expect(citelnaNaPodkladu('rgba(1,2,3,0.5)', PODKLAD_SVETLY)).toBe('#374151');
    expect(pismoNaBarve('nesmysl')).toBe('#ffffff');
  });
});
