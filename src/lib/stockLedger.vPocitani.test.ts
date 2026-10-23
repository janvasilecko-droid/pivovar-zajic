import { describe, expect, it } from 'vitest';
import { buildMovements, ZNACKA_V_POCITANI, jeVPocitani } from './stockLedger';

// 23. 10. 2026: lahve napočítané jako 0 (už odešly) a fasování zapsané minutu po uložení
// počítání — sklad by je odečetl podruhé. Se značkou zůstává záznam ve výdeji, sklad se nemění.
describe('výdej označený jako „už v napočítaném stavu"', () => {
  const radek = (note: string | null) => ({ entry_date: '2026-10-20', beer_id: 'b', package_id: 'p', quantity: 20, note });

  it('značku pozná', () => {
    expect(jeVPocitani(`Poznámka · ${ZNACKA_V_POCITANI}`)).toBe(true);
    expect(jeVPocitani(null)).toBe(false);
  });
  it('fasování se značkou sklad nesnižuje, bez ní ano', () => {
    const s = (note: string | null) => buildMovements({ fasovaniRows: [radek(note)] } as any).filter((m) => m.kind === 'fasovani');
    expect(s(ZNACKA_V_POCITANI)).toHaveLength(0);
    expect(s(null)).toHaveLength(1);
    expect(s(null)[0].qty).toBe(-20);
  });
  it('totéž u prodejny', () => {
    const m = buildMovements({ prodejnaRows: [radek(ZNACKA_V_POCITANI), radek(null)] } as any).filter((x) => x.kind === 'prodejna');
    expect(m).toHaveLength(1);
  });
});
