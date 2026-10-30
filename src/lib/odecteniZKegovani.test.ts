import { describe, it, expect } from 'vitest';
import { planOdecteniZKegovani } from './odecteniZKegovani';

const radky = [
  { id: 'a', entry_date: '2026-09-15', quantity: 12 },
  { id: 'b', entry_date: '2026-09-18', quantity: 5 },
  { id: 'c', entry_date: '2026-09-20', quantity: 2 },
  { id: 'd', entry_date: '2026-09-28', quantity: 4 },
];

describe('odečtení manka od stočených sudů', () => {
  it('nejdřív stejný den, pak nejbližší dřívější', () => {
    expect(planOdecteniZKegovani(radky, '2026-09-20', 4)).toEqual({ upravit: [{ id: 'b', quantity: 3 }], smazat: ['c'], zbytek: 0 });
  });
  it('když dřívějších nestačí, vezme pozdější', () => {
    const p = planOdecteniZKegovani(radky, '2026-09-20', 25);
    expect(p).toEqual({ upravit: [], smazat: ['c', 'b', 'a', 'd'], zbytek: 2 }); // 2 + 5 + 12 + 4 = 23 z 25
  });
  it('záporné řádky ignoruje a nic neodečítá při nule', () => {
    expect(planOdecteniZKegovani([{ id: 'x', entry_date: '2026-09-20', quantity: -3 }], '2026-09-20', 2)).toEqual({ upravit: [], smazat: [], zbytek: 2 });
    expect(planOdecteniZKegovani(radky, '2026-09-20', 0)).toEqual({ upravit: [], smazat: [], zbytek: 0 });
  });
});

import { datumDoplnkuStaceni, konecMesiceData, zdrojeOdecteni } from './odecteniZKegovani';

describe('datum doplnění a záznam odečtu', () => {
  it('chybějící stočení jde na poslední den měsíce, v běžícím měsíci na dnešek', () => {
    expect(konecMesiceData('2026-09-14')).toBe('2026-09-30');
    expect(datumDoplnkuStaceni('2026-09-27', '2026-10-13')).toBe('2026-09-30');
    expect(datumDoplnkuStaceni('2026-10-13', '2026-10-13')).toBe('2026-10-13');
  });
  it('záznam říká, z kterých řádků se odečetlo a jak', () => {
    const r = [{ id: 'a', entry_date: '2026-10-05', quantity: 6 }, { id: 'b', entry_date: '2026-10-07', quantity: 2 }];
    const plan = planOdecteniZKegovani(r, '2026-10-07', 4);
    expect(zdrojeOdecteni(plan, r)).toEqual([
      { id: 'a', entry_date: '2026-10-05', pred: 6, po: 4 },
      { id: 'b', entry_date: '2026-10-07', pred: 2, po: 0 },
    ]);
  });
});

import { drziSudyDavky, zapocitaneRadky } from './odecteniZKegovani';
import { buildMovements, stockAsOf } from './stockLedger';

describe('odečet jen z řádků, které se do očekávaného stavu promítají (30. 10. 2026)', () => {
  it('povolené řádky: ostatní se nesníží a co nejde odečíst, zůstane jako zbytek', () => {
    const p = planOdecteniZKegovani(radky, '2026-09-20', 6, { povolene: new Set(['c', 'd']) });
    expect(p).toEqual({ upravit: [], smazat: ['c', 'd'], zbytek: 0 });
  });
  it('lahve: řádek, který sám nese sudy dávky, se nesmaže — zůstane na jednom kusu', () => {
    const lahve = [
      { id: 's', entry_date: '2026-10-28', quantity: 10, kegs_used: 1, kegs_used_package_id: 'k50', created_at: '2026-10-28T10:00:00Z' },
      { id: 'n', entry_date: '2026-10-27', quantity: 4, kegs_used: null },
    ];
    const drzet = drziSudyDavky(lahve);
    expect(planOdecteniZKegovani(lahve, '2026-10-31', 20, { drzet }))
      .toEqual({ upravit: [{ id: 's', quantity: 1 }], smazat: ['n'], zbytek: 7 });
    // Bez volby (sudy KEG) se řádek normálně vyprázdní.
    expect(planOdecteniZKegovani(lahve, '2026-10-31', 10).smazat).toEqual(['s']);
  });
  it('lahve: sourozenec z téže dávky (jiná velikost lahve) nese sudy dál, řádek jde smazat', () => {
    const davka = { entry_date: '2026-10-28', kegs_used: 2, kegs_used_package_id: 'k50', created_at: '2026-10-28T10:00:00Z' };
    const litr = { id: 'l', ...davka, quantity: 60 };
    const pul = { id: 'p', ...davka, quantity: 5 };
    const drzet = drziSudyDavky([litr, pul]);
    expect(drzet(pul)).toBe(false);
    expect(planOdecteniZKegovani([pul], '2026-10-31', 5, { drzet })).toEqual({ upravit: [], smazat: ['p'], zbytek: 0 });
    // Bez času zápisu se sourozenci poznat nedají — drží se.
    expect(drziSudyDavky([{ ...litr, created_at: null }, { ...pul, created_at: null }])({ ...pul, created_at: null })).toBe(true);
  });

  const B = 'pivo';
  const K = 'sud50';
  const pohyby = buildMovements({
    inventoryRows: [
      // Týdenní počítání v pondělí 26. 10. ráno — co bylo stočeno před ním, už je v čísle.
      { entry_date: '2026-10-26', beer_id: B, package_id: K, quantity: 5, note: 'Počáteční stav (týden)', created_at: '2026-10-26T06:00:00Z' },
    ],
    keggingRows: [
      { entry_date: '2026-10-20', beer_id: B, package_id: K, quantity: 8, created_at: '2026-10-20T10:00:00Z' },
      { entry_date: '2026-10-28', beer_id: B, package_id: K, quantity: 3, created_at: '2026-10-28T10:00:00Z' },
      { entry_date: '2026-10-29', beer_id: B, package_id: K, quantity: 2, created_at: '2026-10-29T10:00:00Z' },
    ],
  });
  const ocekavano = (p: typeof pohyby) => stockAsOf(p, '2026-10-31').get(`${B}__${K}`)?.qty ?? 0;
  const zDb = [
    { id: 'pred', entry_date: '2026-10-20', quantity: 8, created_at: '2026-10-20T10:00:00Z' },
    { id: 'po1', entry_date: '2026-10-28', quantity: 3, created_at: '2026-10-28T10:00:00Z' },
    { id: 'po2', entry_date: '2026-10-29', quantity: 2, created_at: '2026-10-29T10:00:00Z' },
  ];

  it('řádek před počítáním se nepočítá — odečet z něj by rozdíl v inventuře nesrovnal', () => {
    expect(ocekavano(pohyby)).toBe(10);
    expect([...zapocitaneRadky(pohyby, 'kegovani', B, K, zDb, ocekavano)].sort()).toEqual(['po1', 'po2']);
  });

  it('manko 4 ks: odečte se z 28. a 29. 10., ne z 20. 10.; víc než 5 nejde', () => {
    const povolene = zapocitaneRadky(pohyby, 'kegovani', B, K, zDb, ocekavano);
    expect(planOdecteniZKegovani(zDb, '2026-10-31', 4, { povolene }))
      .toEqual({ upravit: [{ id: 'po1', quantity: 1 }], smazat: ['po2'], zbytek: 0 });
    expect(planOdecteniZKegovani(zDb, '2026-10-31', 7, { povolene }).zbytek).toBe(2);
  });

  it('řádek, který mezitím někdo změnil (jiný počet než v knize), se nepočítá', () => {
    const zmeneny = [{ ...zDb[1], quantity: 9 }];
    expect(zapocitaneRadky(pohyby, 'kegovani', B, K, zmeneny, ocekavano).size).toBe(0);
  });
});
