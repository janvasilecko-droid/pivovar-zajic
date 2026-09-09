import { describe, it, expect } from 'vitest';
import { cenaKeDni, hodnotaObjednavky, type CenaPolozky } from './hodnotaObjednavky';

const cena = (over: Partial<CenaPolozky> = {}): CenaPolozky => ({
  beer_id: 'b1', package_id: 'p1', price_per_unit: 25, currency: 'CZK',
  valid_from: null, valid_to: null, ...over,
});

describe('cenaKeDni', () => {
  it('najde platnou cenu bez časového omezení', () => {
    expect(cenaKeDni([cena()], 'b1', 'p1', '2026-09-01')?.price_per_unit).toBe(25);
  });

  it('cena platná jen OD určitého data se před ním nepoužije', () => {
    const c = cena({ valid_from: '2026-09-01', price_per_unit: 30 });
    expect(cenaKeDni([c], 'b1', 'p1', '2026-08-15')).toBeNull();
    expect(cenaKeDni([c], 'b1', 'p1', '2026-09-15')?.price_per_unit).toBe(30);
  });

  it('cena platná jen DO určitého data se po něm nepoužije — stará objednávka dostane starou cenu', () => {
    const stara = cena({ valid_to: '2026-08-31', price_per_unit: 20 });
    const nova = cena({ valid_from: '2026-09-01', price_per_unit: 22 });
    expect(cenaKeDni([stara, nova], 'b1', 'p1', '2026-08-20')?.price_per_unit).toBe(20);
    expect(cenaKeDni([stara, nova], 'b1', 'p1', '2026-09-05')?.price_per_unit).toBe(22);
  });

  it('víc platných záznamů naráz (chyba v datech) vybere nejnovější valid_from', () => {
    const stary = cena({ valid_from: '2026-01-01', price_per_unit: 20 });
    const novy = cena({ valid_from: '2026-06-01', price_per_unit: 24 });
    expect(cenaKeDni([stary, novy], 'b1', 'p1', '2026-09-01')?.price_per_unit).toBe(24);
  });

  it('jiné pivo nebo obal se nenajde', () => {
    expect(cenaKeDni([cena()], 'jine-pivo', 'p1', '2026-09-01')).toBeNull();
    expect(cenaKeDni([cena()], 'b1', 'jiny-obal', '2026-09-01')).toBeNull();
  });
});

describe('hodnotaObjednavky', () => {
  it('sečte cenu × množství přes všechny položky', () => {
    const cenik = [cena({ price_per_unit: 25 }), cena({ beer_id: 'b2', package_id: 'p2', price_per_unit: 40 })];
    const v = hodnotaObjednavky(
      [{ beer_id: 'b1', package_id: 'p1', quantity: 10 }, { beer_id: 'b2', package_id: 'p2', quantity: 5 }],
      cenik, '2026-09-01',
    );
    expect(v.celkem).toBe(250 + 200);
    expect(v.mena).toBe('CZK');
    expect(v.chybiCenaUPolozek).toBe(0);
  });

  it('položka bez ceny v ceníku se sečte jako 0, ale POČÍTÁ se jako chybějící — ne jako "zdarma"', () => {
    const v = hodnotaObjednavky(
      [{ beer_id: 'neznama', package_id: 'p1', quantity: 100 }],
      [cena()], '2026-09-01',
    );
    expect(v.celkem).toBe(0);
    expect(v.chybiCenaUPolozek).toBe(1);
  });

  it('položka bez piva nebo obalu (rozepsaný řádek) se počítá jako chybějící, ne jako pád', () => {
    const v = hodnotaObjednavky([{ beer_id: null, package_id: null, quantity: 1 }], [cena()], '2026-09-01');
    expect(v.chybiCenaUPolozek).toBe(1);
  });

  it('prázdná objednávka má hodnotu 0 a žádné chybějící', () => {
    const v = hodnotaObjednavky([], [], '2026-09-01');
    expect(v).toEqual({ celkem: 0, mena: null, chybiCenaUPolozek: 0 });
  });
});
