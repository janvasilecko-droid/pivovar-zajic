import { describe, it, expect } from 'vitest';
import { napocitaneMesice, jeMesicUzamcen } from './mesicUzamcen';

describe('napocitaneMesice', () => {
  it('pozná fyzickou i schválenou inventuru, ne obyčejný pohyb', () => {
    const mesice = napocitaneMesice([
      { entry_date: '2026-08-31', note: 'Fyzická inventura' },
      { entry_date: '2026-07-31', note: 'Schválená inventura' },
      { entry_date: '2026-09-05', note: 'Počáteční stav' },
    ]);
    expect(mesice.has('2026-08')).toBe(true);
    expect(mesice.has('2026-07')).toBe(true);
    expect(mesice.has('2026-09')).toBe(false);
  });
});

describe('jeMesicUzamcen', () => {
  const srpen = [{ entry_date: '2026-08-31', note: 'Fyzická inventura' }];

  it('zápis do měsíce se zapsanou inventurou je uzamčený — přesně případ Manea', () => {
    expect(jeMesicUzamcen(srpen, '2026-08-26')).toBe(true);
  });

  it('zápis do BUDOUCÍHO měsíce (ten se ještě nenapočítal) uzamčený není', () => {
    expect(jeMesicUzamcen(srpen, '2026-09-05')).toBe(false);
  });

  it('zápis do STARŠÍHO měsíce, než je nejnovější napočítaný, je taky uzamčený', () => {
    // I kdyby červenec sám o sobě inventuru neměl (přeskočila se) — zápis
    // do něj by změnil počáteční stav srpna, který už napočítaný je.
    expect(jeMesicUzamcen(srpen, '2026-07-15')).toBe(true);
  });

  it('bez jakékoli inventury není uzamčené nic', () => {
    expect(jeMesicUzamcen([], '2026-08-26')).toBe(false);
  });

  it('prázdné datum se nezhroutí, jen řekne "neuzamčeno"', () => {
    expect(jeMesicUzamcen(srpen, '')).toBe(false);
  });
});
