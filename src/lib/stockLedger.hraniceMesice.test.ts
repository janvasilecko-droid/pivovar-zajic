// Hranice měsíce v inventuře.
//
// Inventura za srpen je od 1. do 31. srpna — nic z července ani ze září se do
// pohybů měsíce nesmí přičíst ani odečíst. Kontroluje se to tady, protože
// z obrazovky se to pozná až tím, že „nesedí sudy", a hledá se to pak hodinu.
//
// Počáteční stav je věc jiná a schválně: ten se PŘENÁŠÍ z konce předchozího
// měsíce (bez něj by inventura začínala na nule). Test proto hlídá obojí —
// základ se přenést musí, pohyby ne.
import { describe, it, expect } from 'vitest';
import { stockForMonth, expectedForMonth, type Movement } from './stockLedger';

const PIVO = 'pivo-11';
const OBAL = 'keg-15';

const pohyb = (date: string, qty: number, kind: Movement['kind'] = 'zavoz'): Movement => ({
  date, beer_id: PIVO, package_id: OBAL, qty, kind,
} as Movement);

const pohyby: Movement[] = [
  pohyb('2026-07-31', -5),   // minulý měsíc
  pohyb('2026-08-01', -1),   // první den měsíce
  pohyb('2026-08-19', -3),
  pohyb('2026-08-26', -1),
  pohyb('2026-08-31', -2),   // poslední den měsíce
  pohyb('2026-09-01', -7),   // následující měsíc
  pohyb('2026-09-02', -1),   // ta patnáctka, co jede na závoz až v září
];

const klic = `${PIVO}__${OBAL}`;

describe('stockForMonth — srpen je 1.–31. 8.', () => {
  it('sečte jen srpnové pohyby, zářijové ani červencové ne', () => {
    const radek = stockForMonth(pohyby, '2026-08').get(klic)!;
    expect(radek.byKind.zavoz).toBe(-7); // 1 + 3 + 1 + 2
  });

  it('první a poslední den měsíce se počítají', () => {
    const jenKraje = [pohyb('2026-08-01', -1), pohyb('2026-08-31', -2)];
    expect(stockForMonth(jenKraje, '2026-08').get(klic)!.byKind.zavoz).toBe(-3);
  });

  it('počáteční stav se z minulého měsíce PŘENÁŠÍ (jinak by měsíc začínal na nule)', () => {
    const radek = stockForMonth([pohyb('2026-07-31', 20, 'staceni'), pohyb('2026-08-19', -3)], '2026-08').get(klic)!;
    expect(radek.baselineQty).toBe(20);
    expect(radek.qty).toBe(17);
  });

  it('zářijový pohyb nesníží srpnový výsledek', () => {
    const bezZari = pohyby.filter((m) => !m.date.startsWith('2026-09'));
    expect(stockForMonth(pohyby, '2026-08').get(klic)!.qty)
      .toBe(stockForMonth(bezZari, '2026-08').get(klic)!.qty);
  });
});

describe('expectedForMonth — očekávaný stav ke konci srpna', () => {
  it('taky nebere nic ze září', () => {
    const sZarim = expectedForMonth(
      [...pohyby, { date: '2026-08-01', beer_id: PIVO, package_id: OBAL, qty: 30, kind: 'inventura', note: null } as Movement],
      '2026-08',
    ).get(klic)!;
    expect(sZarim.byKind.zavoz).toBe(-7);
  });
});
