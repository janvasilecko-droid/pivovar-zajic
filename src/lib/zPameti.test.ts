// 📵 Odpověď z paměti telefonu se musí dát poznat — a neúplná data nesmí
// projít jako nuly.
import { beforeEach, describe, expect, it } from 'vitest';
import { chybejiciZdroje, dataZPametiOd, NeuplnaDataError, vycistiZPameti, zapisZPameti } from './zPameti';

beforeEach(() => vycistiZPameti());

describe('dataZPametiOd', () => {
  it('na začátku nic z paměti nebylo', () => {
    expect(dataZPametiOd(Date.now() - 1000)).toBe(false);
  });

  it('odpověď z paměti po zadaném čase se pozná', () => {
    const zacatek = 1000;
    zapisZPameti(1500);
    expect(dataZPametiOd(zacatek)).toBe(true);
  });

  it('odpověď z paměti PŘED zadaným časem se nezapočítá', () => {
    zapisZPameti(500);
    expect(dataZPametiOd(1000)).toBe(false);
  });

  it('shodná milisekunda se bere jako „z paměti" — radši varování než tichá chyba', () => {
    zapisZPameti(1000);
    expect(dataZPametiOd(1000)).toBe(true);
  });
});

describe('chybejiciZdroje', () => {
  it('vyjmenuje zdroje s chybou, bez dat nebo úplně chybějící', () => {
    expect(chybejiciZdroje({
      bottling: { data: [], error: null },
      kegging: { data: null, error: { message: 'timeout' } },
      inventory: { data: null },
      zavoz: undefined,
      orders: { data: [{ id: 1 }], error: null },
    })).toEqual(['kegging', 'inventory', 'zavoz']);
  });

  it('prázdná tabulka (prázdné pole) NENÍ chyba — jen zatím nic není', () => {
    expect(chybejiciZdroje({ akce: { data: [], error: null } })).toEqual([]);
  });

  it('chyba přebije i přítomná data', () => {
    expect(chybejiciZdroje({ a: { data: [1], error: { message: 'x' } } })).toEqual(['a']);
  });
});

describe('NeuplnaDataError', () => {
  it('řekne, co chybělo, a proč se nepočítá', () => {
    const e = new NeuplnaDataError(['bottling', 'inventory']);
    expect(e.zdroje).toEqual(['bottling', 'inventory']);
    expect(e.message).toContain('bottling, inventory');
    expect(e.message).toContain('neúplná');
    expect(e).toBeInstanceOf(Error);
  });
});
