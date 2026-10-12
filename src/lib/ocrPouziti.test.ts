import { describe, it, expect } from 'vitest';
import { mesicOcr, ocrVarovani } from './ocrPouziti';

describe('Varování: přepis fotek Google Vision', () => {
  it('pod 900 mlčí, od 900 varuje', () => {
    expect(ocrVarovani(null).varovat).toBe(false);
    expect(ocrVarovani(899).varovat).toBe(false);
    expect(ocrVarovani(900).varovat).toBe(true);
    expect(ocrVarovani(900).popis).toMatch(/900 fotek z 1000 zdarma/);
  });

  it('nad 1 000 řekne, kolik se platí, ale přepis běží dál', () => {
    const v = ocrVarovani(1012);
    expect(v.varovat).toBe(true);
    expect(v.popis).toMatch(/12 nad bezplatných 1000/);
    expect(v.popis).toMatch(/Přepis běží dál/);
  });

  it('měsíc počítá v UTC jako databáze', () => {
    expect(mesicOcr(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10-01');
    expect(mesicOcr(new Date('2026-11-01T00:10:00Z'))).toBe('2026-11-01');
  });
});
