import { describe, expect, it } from 'vitest';
import { najdiRozjeteOdpocty, odpoctyStornovanych, srovnaniPoUprave, type PolozkaObjednavky } from './zavozSync';

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

describe('najdiRozjeteOdpocty', () => {
  const polozky = [
    { id: 'oi-1', beer_id: 'summer', package_id: 'keg30', quantity: 9 },
    { id: 'oi-2', beer_id: 'osma', package_id: 'lahev1', quantity: 30 },
    { id: 'oi-3', beer_id: 'jantar', package_id: 'keg50', quantity: 5 },
  ];

  it('najde odpočet, který odepisuje víc, než se objednalo', () => {
    const nalez = najdiRozjeteOdpocty(polozky, [
      { order_item_id: 'oi-1', order_id: 'o-1', beer_id: 'summer', package_id: 'keg30', quantity: 15 },
    ]);
    expect(nalez).toHaveLength(1);
    expect(nalez[0].rozdilKusu).toBe(6);
    expect(nalez[0].jinePivoNeboObal).toBe(false);
  });

  it('najde i odpočet, který odepisuje míň (Jona: odpočet 10, objednávka 30)', () => {
    const nalez = najdiRozjeteOdpocty(polozky, [
      { order_item_id: 'oi-2', order_id: 'o-2', beer_id: 'osma', package_id: 'lahev1', quantity: 10 },
    ]);
    expect(nalez[0].rozdilKusu).toBe(-20);
  });

  it('pozná i změnu piva nebo obalu při stejném počtu', () => {
    const nalez = najdiRozjeteOdpocty(polozky, [
      { order_item_id: 'oi-3', order_id: 'o-3', beer_id: 'jantar', package_id: 'keg30', quantity: 5 },
    ]);
    expect(nalez).toHaveLength(1);
    expect(nalez[0].jinePivoNeboObal).toBe(true);
    expect(nalez[0].rozdilKusu).toBe(0);
  });

  it('sedící odpočty nehlásí', () => {
    expect(najdiRozjeteOdpocty(polozky, [
      { order_item_id: 'oi-1', order_id: 'o-1', beer_id: 'summer', package_id: 'keg30', quantity: 9 },
      { order_item_id: 'oi-3', order_id: 'o-3', beer_id: 'jantar', package_id: 'keg50', quantity: 5 },
    ])).toEqual([]);
  });

  it('množství jako text z databáze porovná jako číslo', () => {
    expect(najdiRozjeteOdpocty(polozky, [
      { order_item_id: 'oi-1', order_id: 'o-1', beer_id: 'summer', package_id: 'keg30', quantity: '9' },
    ])).toEqual([]);
  });

  it('položku mimo načtený rozsah netvrdí za rozjetou', () => {
    // Audit umí běžet jen nad jedním týdnem — odpočet k objednávce, která se
    // nenačetla, by jinak vyšel jako chyba pokaždé.
    expect(najdiRozjeteOdpocty(polozky, [
      { order_item_id: 'oi-neznama', order_id: 'o-9', beer_id: 'summer', package_id: 'keg30', quantity: 4 },
    ])).toEqual([]);
  });

  it('odpočet bez vazby na položku přeskočí', () => {
    expect(najdiRozjeteOdpocty(polozky, [
      { order_item_id: null, order_id: 'o-9', beer_id: 'summer', package_id: 'keg30', quantity: 4 },
    ])).toEqual([]);
  });
});

describe('odpoctyStornovanych', () => {
  const odpocty = [
    { order_id: 'o-1', quantity: 3 },
    { order_id: 'o-2', quantity: 5 },
    { order_id: 'o-3', quantity: 1 },
  ];

  it('vrátí odpočty, které visí na stornované objednávce', () => {
    // Zrušené zboží nikdo neodvezl — sklad ho nesmí mít odepsané.
    expect(odpoctyStornovanych(['o-2'], odpocty)).toEqual([{ order_id: 'o-2', quantity: 5 }]);
  });

  it('bez stornovaných objednávek nevrací nic', () => {
    expect(odpoctyStornovanych([], odpocty)).toEqual([]);
  });

  it('stornovaná objednávka bez odpočtu je v pořádku', () => {
    expect(odpoctyStornovanych(['o-9'], odpocty)).toEqual([]);
  });

  it('zvládne víc stornovaných najednou', () => {
    expect(odpoctyStornovanych(['o-1', 'o-3'], odpocty)).toHaveLength(2);
  });
});
