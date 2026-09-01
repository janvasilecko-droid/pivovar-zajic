import { describe, expect, it } from 'vitest';
import { srovnaniPoUprave, type PolozkaObjednavky } from './zavozSync';

const polozka: PolozkaObjednavky = {
  id: 'oi-1',
  beer_id: 'summer',
  package_id: 'keg30',
  quantity: 15,
};

describe('srovnaniPoUprave', () => {
  it('snížení množství pošle nové množství (přesně případ Radek 20. 8.)', () => {
    // Odpočet byl zapsaný na 15 ks, v objednávce se opravilo na 9 — sklad
    // zůstal odepsaný o 6 sudů, které nikdo neodvezl.
    expect(srovnaniPoUprave(polozka, { quantity: 9 })).toEqual({
      p_order_item_id: 'oi-1',
      p_beer_id: 'summer',
      p_package_id: 'keg30',
      p_quantity: 9,
    });
  });

  it('zvýšení množství taky (případ Jona 3. 7.: odpočet 10, objednávka 30)', () => {
    expect(srovnaniPoUprave({ ...polozka, quantity: 10 }, { quantity: 30 })?.p_quantity).toBe(30);
  });

  it('u změny piva posílá i nezměněný obal a množství', () => {
    // Funkce v databázi přepisuje řádek celý; půlka hodnot by ho rozhodila víc.
    expect(srovnaniPoUprave(polozka, { beer_id: 'osma' })).toEqual({
      p_order_item_id: 'oi-1',
      p_beer_id: 'osma',
      p_package_id: 'keg30',
      p_quantity: 15,
    });
  });

  it('u změny obalu taky', () => {
    expect(srovnaniPoUprave(polozka, { package_id: 'keg50' })).toEqual({
      p_order_item_id: 'oi-1',
      p_beer_id: 'summer',
      p_package_id: 'keg50',
      p_quantity: 15,
    });
  });

  it('přepsání na stejnou hodnotu RPC nevolá', () => {
    expect(srovnaniPoUprave(polozka, { quantity: 15 })).toBeNull();
    expect(srovnaniPoUprave(polozka, { beer_id: 'summer' })).toBeNull();
    expect(srovnaniPoUprave(polozka, {})).toBeNull();
  });

  it('textové množství z formuláře se porovná jako číslo', () => {
    expect(srovnaniPoUprave({ ...polozka, quantity: '15' as any }, { quantity: 15 })).toBeNull();
    expect(srovnaniPoUprave({ ...polozka, quantity: '15' as any }, { quantity: 9 })?.p_quantity).toBe(9);
  });

  it('nula a záporné množství se nesrovnává — na to je smazání položky', () => {
    expect(srovnaniPoUprave(polozka, { quantity: 0 })).toBeNull();
    expect(srovnaniPoUprave(polozka, { quantity: -3 })).toBeNull();
    expect(srovnaniPoUprave(polozka, { quantity: NaN })).toBeNull();
  });

  it('položka bez id (ještě neuložená) odpočet mít nemůže', () => {
    expect(srovnaniPoUprave({ ...polozka, id: '' }, { quantity: 9 })).toBeNull();
  });

  it('chybějící pivo nebo obal se propíše jako null, ne jako undefined', () => {
    const bezPiva = srovnaniPoUprave({ ...polozka, beer_id: null }, { quantity: 9 });
    expect(bezPiva).not.toBeNull();
    expect(bezPiva!.p_beer_id).toBeNull();
  });
});
