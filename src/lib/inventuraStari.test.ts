import { describe, expect, it } from 'vitest';
import { NALEHAVE_PO_DNECH, PRIPOMENOUT_PO_DNECH, stariInventury } from './inventuraStari';

const DNES = '2026-09-01';
const predDny = (n: number) => new Date(Date.parse(`${DNES}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

describe('stariInventury', () => {
  it('čerstvá inventura se nepřipomíná', () => {
    const s = stariInventury([{ entry_date: predDny(10), note: 'Fyzická inventura' }], DNES);
    expect(s.dni).toBe(10);
    expect(s.pripomenout).toBe(false);
  });

  it('po 40 dnech se ozve', () => {
    const s = stariInventury([{ entry_date: predDny(PRIPOMENOUT_PO_DNECH), note: 'Fyzická inventura' }], DNES);
    expect(s.pripomenout).toBe(true);
    expect(s.naléhavé).toBe(false);
  });

  it('po 60 dnech je to naléhavé', () => {
    const s = stariInventury([{ entry_date: predDny(NALEHAVE_PO_DNECH), note: 'Schválená inventura' }], DNES);
    expect(s.naléhavé).toBe(true);
  });

  it('bere nejnovější, ne první nalezenou', () => {
    const s = stariInventury([
      { entry_date: predDny(90), note: 'Fyzická inventura' },
      { entry_date: predDny(5), note: 'Schválená inventura' },
      { entry_date: predDny(50), note: 'Fyzická inventura' },
    ], DNES);
    expect(s.posledni).toBe(predDny(5));
    expect(s.pripomenout).toBe(false);
  });

  it('POČÁTEČNÍ STAV se nepočítá — převádí se sám a nikdo u něj nic nespočítal', () => {
    // Tohle je jádro věci: kdyby se počítal, upozornění by umlčel automatický
    // převod z minulého měsíce a schodek by rostl dál v tichosti.
    const s = stariInventury([
      { entry_date: predDny(2), note: 'Počáteční stav' },
      { entry_date: predDny(80), note: 'Fyzická inventura' },
    ], DNES);
    expect(s.posledni).toBe(predDny(80));
    expect(s.naléhavé).toBe(true);
  });

  it('řádek bez poznámky se taky nepočítá', () => {
    const s = stariInventury([{ entry_date: predDny(1), note: null }], DNES);
    expect(s.posledni).toBeNull();
  });

  it('žádná inventura — připomene se, ale ne jako naléhavé', () => {
    const s = stariInventury([], DNES);
    expect(s.posledni).toBeNull();
    expect(s.dni).toBeNull();
    expect(s.pripomenout).toBe(true);
    expect(s.naléhavé).toBe(false);
  });

  it('poškozené datum nespadne', () => {
    const s = stariInventury([{ entry_date: 'nesmysl', note: 'Fyzická inventura' }], DNES);
    expect(s.dni).toBeNull();
    expect(s.pripomenout).toBe(false);
  });
});
