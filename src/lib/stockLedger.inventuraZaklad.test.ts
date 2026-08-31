// Očekávaný stav měsíce se NESMÍ počítat z inventury, se kterou se porovnává.
// ---------------------------------------------------------------------------
// Fyzická i schválená inventura se ukládá k PRVNÍMU dni měsíce — na stejné
// datum jako počáteční stav. Dokud se obojí slévalo do jednoho pohybu,
// napočítaný stav počáteční přebil a očekávaný stav po uložení inventury
// poskočil přesně o pohyby za daný měsíc. V produkčních datech to nastalo u
// června 2026 („Fyzická inventura" k 1. 6.) i července („Schválená inventura"
// k 1. 7. vedle „Počátečního stavu (převod z inventury)").
import { describe, expect, it } from 'vitest';
import { buildMovements, expectedForMonth, stockAsOf } from './stockLedger';

const PACKAGES = [{ id: 'pkg', kind: 'bottle', volume_l: 0.5 }];

// Počáteční stav 100 ks k 1. 8., v srpnu stočeno 50, vydáno 30.
// Očekávaný stav ke konci srpna = 100 + 50 − 30 = 120.
const zaklad = {
  inventoryRows: [
    { beer_id: 'b', package_id: 'pkg', entry_date: '2026-08-01', quantity: 100, note: 'Počáteční stav' },
  ],
  bottlingRows: [{ beer_id: 'b', package_id: 'pkg', entry_date: '2026-08-10', quantity: 50 }],
  fasovaniRows: [{ beer_id: 'b', package_id: 'pkg', entry_date: '2026-08-20', quantity: 30 }],
  packages: PACKAGES,
};

const sNapocitanym = (note: string, quantity: number) => ({
  ...zaklad,
  inventoryRows: [
    ...zaklad.inventoryRows,
    { beer_id: 'b', package_id: 'pkg', entry_date: '2026-08-01', quantity, note },
  ],
});

describe('expectedForMonth — základ vs napočítaný stav na stejném datu', () => {
  it('bez uložené inventury vyjde 120', () => {
    expect(expectedForMonth(buildMovements(zaklad), '2026-08').get('b__pkg')?.qty).toBe(120);
  });

  it('uložená FYZICKÁ inventura očekávaný stav nezmění', () => {
    const exp = expectedForMonth(buildMovements(sNapocitanym('Fyzická inventura', 111)), '2026-08');
    expect(exp.get('b__pkg')?.qty).toBe(120);
  });

  it('ani SCHVÁLENÁ inventura — případ července 2026', () => {
    const exp = expectedForMonth(buildMovements(sNapocitanym('Schválená inventura', 111)), '2026-08');
    expect(exp.get('b__pkg')?.qty).toBe(120);
  });

  it('manko tedy sedí a po uložení se nehne', () => {
    const napocitano = 111;
    const pred = expectedForMonth(buildMovements(zaklad), '2026-08').get('b__pkg')!.qty;
    const po = expectedForMonth(buildMovements(sNapocitanym('Fyzická inventura', napocitano)), '2026-08').get('b__pkg')!.qty;
    expect(napocitano - pred).toBe(-9);
    expect(napocitano - po).toBe(-9);
  });

  it('základ zůstává počáteční stav, ne napočítaný', () => {
    const line = expectedForMonth(buildMovements(sNapocitanym('Fyzická inventura', 111)), '2026-08').get('b__pkg')!;
    expect(line.baselineQty).toBe(100);
    expect(line.baselineDate).toBe('2026-08-01');
  });
});

describe('expectedForMonth — dorovnání se nesmí započítat dvakrát', () => {
  // Obrazovka Inventura přičítá dorovnání k očekávanému stavu sama
  // („Po dorovnání" = INVENTURA − (Oček. + dorovnání)). Kdyby ho započítala
  // i skladová kniha, po uložení a načtení by rozdíl vyskočil přesně o tolik,
  // o kolik se dorovnávalo — a dorovnání by se nikdy nedopočítalo k nule.
  const sDorovnanim = {
    ...zaklad,
    adjustmentRows: [{ beer_id: 'b', package_id: 'pkg', entry_date: '2026-08-15', quantity: -10 }],
  };

  it('očekávaný stav zůstává čistá teorie, bez dorovnání', () => {
    expect(expectedForMonth(buildMovements(sDorovnanim), '2026-08').get('b__pkg')?.qty).toBe(120);
  });

  it('po dorovnání rozdíl sedí na nulu — a drží i po uložení', () => {
    const exp = expectedForMonth(buildMovements(sDorovnanim), '2026-08').get('b__pkg')!.qty;
    const napocitano = 110;
    const dorovnat = -10;
    // INVENTURA − (Oček. + dorovnání) = 110 − (120 − 10) = 0
    expect(napocitano - (exp + dorovnat)).toBe(0);
  });

  it('ale do skutečného skladu se dorovnání promítne', () => {
    expect(stockAsOf(buildMovements(sDorovnanim), '2026-08-31').get('b__pkg')?.qty).toBe(110);
  });

  it('a v dalším měsíci se počítá normálně', () => {
    const line = expectedForMonth(buildMovements(sDorovnanim), '2026-09').get('b__pkg')!;
    expect(line.byKind.dorovnani).toBe(-10);
  });
});

describe('stockAsOf — aktuální sklad se chová dál stejně', () => {
  it('pro skutečný stav rozhoduje napočítaná inventura, ne počáteční základ', () => {
    // Sklad musí vycházet ze skutečnosti: 111 napočítáno + 50 − 30 = 131.
    const line = stockAsOf(buildMovements(sNapocitanym('Fyzická inventura', 111)), '2026-08-31').get('b__pkg')!;
    expect(line.baselineQty).toBe(111);
    expect(line.qty).toBe(131);
  });

  it('a nezáleží na pořadí řádků z databáze', () => {
    const prohozene = {
      ...zaklad,
      inventoryRows: [
        { beer_id: 'b', package_id: 'pkg', entry_date: '2026-08-01', quantity: 111, note: 'Fyzická inventura' },
        { beer_id: 'b', package_id: 'pkg', entry_date: '2026-08-01', quantity: 100, note: 'Počáteční stav' },
      ],
    };
    expect(stockAsOf(buildMovements(prohozene), '2026-08-31').get('b__pkg')?.baselineQty).toBe(111);
  });

  it('inventura se nikdy nezapočítá jako pohyb (žádné dvojité sčítání)', () => {
    const line = stockAsOf(buildMovements(sNapocitanym('Fyzická inventura', 111)), '2026-08-31').get('b__pkg')!;
    expect(line.byKind.inventura).toBeUndefined();
    expect(line.byKind.staceni).toBe(50);
    expect(line.byKind.fasovani).toBe(-30);
  });
});
