// Pravidlo „předem objednaná“ — jedno pro pondělní upozornění i pro hlídání malých sudů (27. 11. 2026).
import { describe, expect, it } from 'vitest';
import { jePredemObjednana, PREDSTIH_DNI } from './predemDny';
import { PREDSTIH_DNI as PREDSTIH_Z_UPOZORNENI } from './predemObjednane';

describe('jePredemObjednana', () => {
  it('od 7 dní předem ano, 6 dní ne', () => {
    expect(PREDSTIH_DNI).toBe(7);
    expect(jePredemObjednana('2026-11-27', '2026-12-04')).toBe(true);
    expect(jePredemObjednana('2026-11-27', '2026-12-03')).toBe(false);
    expect(jePredemObjednana('2026-11-27', '2026-12-18')).toBe(true);
  });

  it('objednávka na dnešek nebo zpětně předem není', () => {
    expect(jePredemObjednana('2026-11-27', '2026-11-27')).toBe(false);
    expect(jePredemObjednana('2026-11-27', '2026-11-20')).toBe(false);
  });

  it('čas za datem se ořízne; chybějící nebo špatné datum = nikdy', () => {
    expect(jePredemObjednana('2026-11-27T22:30:00Z', '2026-12-18T00:00:00')).toBe(true);
    expect(jePredemObjednana(null, '2026-12-18')).toBe(false);
    expect(jePredemObjednana('2026-11-27', undefined)).toBe(false);
    expect(jePredemObjednana('27. 11.', '2026-12-18')).toBe(false);
  });

  it('přes přechod na zimní čas se dny počítají celé (UTC), ne po hodinách', () => {
    expect(jePredemObjednana('2026-10-24', '2026-10-31')).toBe(true);
    expect(jePredemObjednana('2026-10-25', '2026-10-31')).toBe(false);
  });

  it('upozornění z predemObjednane.ts používá stejnou konstantu', () => {
    expect(PREDSTIH_Z_UPOZORNENI).toBe(PREDSTIH_DNI);
  });
});
