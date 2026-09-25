import { describe, it, expect, vi, afterEach } from 'vitest';
import { oznacVlastniObjednavku, jeVlastniObjednavka } from './mojeObjednavky';

describe('mojeObjednavky — potlačení notifikace na vlastní právě zapsanou objednávku', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('objednávka označená tímhle zařízením se pozná', () => {
    oznacVlastniObjednavku('obj-1');
    expect(jeVlastniObjednavka('obj-1')).toBe(true);
  });

  it('neoznačená objednávka (od jiného zařízení/kolegy) se nepotlačí', () => {
    expect(jeVlastniObjednavka('cizi-objednavka')).toBe(false);
  });

  it('kontrola je jednorázová — druhý dotaz na stejné ID už vrátí false', () => {
    oznacVlastniObjednavku('obj-2');
    expect(jeVlastniObjednavka('obj-2')).toBe(true);
    expect(jeVlastniObjednavka('obj-2')).toBe(false);
  });

  it('po uplynutí platnosti se objednávka přestane počítat jako vlastní', () => {
    vi.useFakeTimers();
    oznacVlastniObjednavku('obj-3');
    vi.advanceTimersByTime(61_000);
    expect(jeVlastniObjednavka('obj-3')).toBe(false);
  });

  it('null/undefined/prázdné ID nikdy nespadne', () => {
    expect(() => oznacVlastniObjednavku(null)).not.toThrow();
    expect(() => oznacVlastniObjednavku(undefined)).not.toThrow();
    expect(jeVlastniObjednavka(null)).toBe(false);
    expect(jeVlastniObjednavka(undefined)).toBe(false);
    expect(jeVlastniObjednavka('')).toBe(false);
  });
});
