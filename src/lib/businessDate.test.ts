import { describe, expect, it } from 'vitest';
import { businessDateISO, businessHour, posunMesic } from './businessDate';

describe('business date (Europe/Prague)', () => {
  it('uses the next local day while UTC is still on the previous day in summer', () => {
    const instant = new Date('2026-08-16T22:30:00.000Z');
    expect(businessDateISO(instant)).toBe('2026-08-17');
    expect(businessHour(instant)).toBe(0);
  });

  it('handles the winter UTC offset', () => {
    const instant = new Date('2026-12-31T23:30:00.000Z');
    expect(businessDateISO(instant)).toBe('2027-01-01');
    expect(businessHour(instant)).toBe(0);
  });

  it('keeps a daytime instant on the same date', () => {
    const instant = new Date('2026-08-16T10:15:00.000Z');
    expect(businessDateISO(instant)).toBe('2026-08-16');
    expect(businessHour(instant)).toBe(12);
  });
});

describe('posunMesic', () => {
  // Funkce byla napsaná čtyřikrát (Objednávky, Inventura, KEG, Lahve),
  // pokaždé o kousek jinak. Testy hlídají to, na čem u posunu měsíce záleží:
  // přechod přes rok a to, že výsledek nezávisí na časové zóně zařízení.
  it('posune o měsíc dopředu i dozadu', () => {
    expect(posunMesic('2026-05', 1)).toBe('2026-06');
    expect(posunMesic('2026-05', -1)).toBe('2026-04');
  });

  it('přechod přes rok', () => {
    expect(posunMesic('2026-01', -1)).toBe('2025-12');
    expect(posunMesic('2026-12', 1)).toBe('2027-01');
  });

  it('posun o víc měsíců i o nulu', () => {
    expect(posunMesic('2026-03', -5)).toBe('2025-10');
    expect(posunMesic('2026-03', 0)).toBe('2026-03');
  });

  it('měsíc se vždy doplní na dvě číslice', () => {
    // „2026-9" místo „2026-09" by rozbilo porovnávání řetězcem, kterým
    // obrazovky filtrují záznamy podle měsíce.
    expect(posunMesic('2026-10', -1)).toBe('2026-09');
  });
});
