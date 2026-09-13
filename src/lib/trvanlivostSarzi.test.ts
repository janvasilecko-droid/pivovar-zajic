import { describe, it, expect } from 'vitest';
import { trvanlivostSkladu } from './trvanlivostSarzi';

const DNES = '2026-09-13';

describe('trvanlivost lahví na skladě (FIFO odhad)', () => {
  it('na skladě zůstává nejnovější lahvování, když ho pokryje', () => {
    const t = trvanlivostSkladu(50, [
      { entry_date: '2026-05-01', quantity: 200 },
      { entry_date: '2026-09-01', quantity: 100 },
    ], 90, DNES)!;
    expect(t.lahvovano).toBe('2026-09-01');
    expect(t.stav).toBe('ok');
  });

  it('když stav přesahuje poslední lahvování, sahá do starší šarže', () => {
    const t = trvanlivostSkladu(150, [
      { entry_date: '2026-06-20', quantity: 200 },
      { entry_date: '2026-09-01', quantity: 100 },
    ], 90, DNES)!;
    expect(t.lahvovano).toBe('2026-06-20');
    expect(t.trvanlivostDo).toBe('2026-09-18');
    expect(t.dni).toBe(5);
    expect(t.stav).toBe('blizi-se');
  });

  it('prošlá trvanlivost', () => {
    const t = trvanlivostSkladu(10, [{ entry_date: '2026-01-01', quantity: 10 }], 90, DNES)!;
    expect(t.stav).toBe('prosla');
    expect(t.dni).toBeLessThan(0);
  });

  it('stav vyšší než všechna lahvování (třeba z inventury) → nejstarší známé', () => {
    const t = trvanlivostSkladu(500, [{ entry_date: '2026-08-01', quantity: 100 }], 90, DNES)!;
    expect(t.lahvovano).toBe('2026-08-01');
  });

  it('bez trvanlivosti, bez skladu nebo bez lahvování se nehlídá', () => {
    expect(trvanlivostSkladu(10, [{ entry_date: '2026-08-01', quantity: 10 }], null, DNES)).toBeNull();
    expect(trvanlivostSkladu(0, [{ entry_date: '2026-08-01', quantity: 10 }], 90, DNES)).toBeNull();
    expect(trvanlivostSkladu(10, [], 90, DNES)).toBeNull();
  });
});
