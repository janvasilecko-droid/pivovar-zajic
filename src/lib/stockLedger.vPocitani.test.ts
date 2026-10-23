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

// 23. 10. 2026: napočítáno 3 (Úprava skladu uprostřed měsíce), Sklad ukazoval 17. Měsíční rozpad
// (stockForMonth) týdenní počítání nezná — stav na skladě proto bere stockAsOf (Stock.tsx).
import { stockAsOf, stockForMonth, stockKey } from './stockLedger';
import { tydenniJakoInventura } from './tydenniInventura';

describe('stav na skladě po počítání uprostřed měsíce', () => {
  const B = 'b'; const P = 'p';
  const pocitani = tydenniJakoInventura([
    { tyden_od: '2026-10-19', tyden_do: '2026-10-25', beer_id: B, package_id: P, napocitano: 3, updated_at: '2026-10-23T07:19:00Z' },
  ]);
  const pohyby = buildMovements({
    packages: [{ id: P, label: '1l', kind: 'bottle', volume_l: 1 }],
    inventoryRows: [{ entry_date: '2026-10-01', beer_id: B, package_id: P, quantity: 17, note: 'Počáteční stav' }, ...(pocitani as any)],
  } as any);
  it('stockAsOf ukáže napočítané číslo', () => {
    expect(stockAsOf(pohyby, '2026-10-23').get(stockKey(B, P))?.qty).toBe(3);
  });
  it('měsíční rozpad počítání uprostřed měsíce nebere — proto Sklad bere stockAsOf', () => {
    expect(stockForMonth(pohyby, '2026-10').get(stockKey(B, P))?.qty).not.toBe(3);
  });
});
