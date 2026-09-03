import { describe, it, expect } from 'vitest';
import { plnostTanku, popisPlnosti, PRAH_DOJEZD, PRAH_PLNY } from './tankPlnost';

describe('plnostTanku', () => {
  it('spočítá podíl a procenta', () => {
    expect(plnostTanku(2000, 4000)).toMatchObject({ podil: 0.5, procent: 50, stav: 'stred' });
  });

  it('rozlišuje čtyři stavy podle prahů', () => {
    expect(plnostTanku(0, 4000).stav).toBe('prazdny');
    expect(plnostTanku(4000 * (PRAH_DOJEZD - 0.01), 4000).stav).toBe('dojezd');
    expect(plnostTanku(4000 * PRAH_DOJEZD, 4000).stav).toBe('stred');
    expect(plnostTanku(4000 * PRAH_PLNY, 4000).stav).toBe('plny');
    expect(plnostTanku(4000, 4000).stav).toBe('plny');
  });

  it('nad kapacitu nejde — 110 % tank neumí', () => {
    // Objem nad kapacitou se v datech objevit umí (ruční oprava, dolití);
    // ukazatel by se pak vykreslil za rámeček.
    expect(plnostTanku(9000, 4000)).toMatchObject({ podil: 1, procent: 100 });
  });

  it('záporný zbytek je prázdný tank, ne obrácený ukazatel', () => {
    expect(plnostTanku(-500, 4000)).toMatchObject({ podil: 0, stav: 'prazdny' });
  });

  it('bez kapacity vrací prázdno, nikdy NaN', () => {
    // „nevím" se má kreslit jako nic, ne jako NaN % šířky.
    for (const kapacita of [0, null, undefined, 'nesmysl', NaN]) {
      const p = plnostTanku(1000, kapacita as any);
      expect(p.procent).toBe(0);
      expect(Number.isNaN(p.podil)).toBe(false);
    }
    expect(plnostTanku(null, 4000).procent).toBe(0);
  });

  it('popis mluví česky a nese procenta tam, kde pomůžou', () => {
    expect(popisPlnosti(plnostTanku(0, 4000))).toBe('prázdný');
    expect(popisPlnosti(plnostTanku(200, 4000))).toContain('dojezd');
    expect(popisPlnosti(plnostTanku(2000, 4000))).toBe('50 % objemu');
    expect(popisPlnosti(plnostTanku(3800, 4000))).toContain('skoro plný');
  });
});
