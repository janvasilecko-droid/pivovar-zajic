import { describe, expect, it } from 'vitest';
import { normalizujCislo } from './cisloVstup';

describe('normalizace zadaného čísla', () => {
  it('bere českou čárku jako desetinnou tečku', () => {
    // type="number" by „1,5" zahodilo a v hodnotě by zůstalo prázdno.
    expect(normalizujCislo('1,5', true)).toBe('1.5');
    expect(normalizujCislo('12,75', true)).toBe('12.75');
  });

  it('u kusů zahodí desetinnou část i písmena', () => {
    expect(normalizujCislo('12 ks', false)).toBe('12');
    expect(normalizujCislo('1,5', false)).toBe('15');
  });

  it('nechá jen jednu tečku a mínus jen na začátku', () => {
    expect(normalizujCislo('1.2.3', true)).toBe('1.23');
    expect(normalizujCislo('-5', true)).toBe('-5');
    expect(normalizujCislo('5-3', true)).toBe('53');
  });

  it('zvládne prázdný a nesmyslný vstup', () => {
    expect(normalizujCislo('', false)).toBe('');
    expect(normalizujCislo('abc', false)).toBe('');
  });
});
