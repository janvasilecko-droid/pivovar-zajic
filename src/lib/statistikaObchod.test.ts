import { describe, it, expect } from 'vitest';
import { trzbyPoMesicich, trzbyPodleOdberatelu, mezirocniPodlePiv, odpisyPoMesicich, kdoBrzyObjedna } from './statistikaObchod';
import { hodnotaObjednavky, type CenaPolozky } from './hodnotaObjednavky';
import type { Obal } from './statistika';

const OBALY = new Map<string, Obal>([
  ['keg30', { id: 'keg30', label: 'KEG 30 l', kind: 'keg', volume_l: 30 }],
  ['keg50', { id: 'keg50', label: 'KEG 50 l', kind: 'keg', volume_l: 50 }],
]);
const PIVA = [{ id: 'b11', name: '11° Světlá' }, { id: 'b12', name: '12° Ležák' }];

const CENIK: CenaPolozky[] = [
  // Zdražení k 1. 8.: červencové objednávky za starou cenu, srpnové za novou.
  { beer_id: 'b11', package_id: 'keg30', price_per_unit: 1000, currency: 'CZK', valid_from: null, valid_to: '2026-07-31' },
  { beer_id: 'b11', package_id: 'keg30', price_per_unit: 1200, currency: 'CZK', valid_from: '2026-08-01', valid_to: null },
  { beer_id: 'b12', package_id: 'keg50', price_per_unit: 2500, currency: 'CZK', valid_from: null, valid_to: null },
];

const OBJ = [
  { id: 'a', place_name: 'U Lípy', delivery_date: '2026-08-05', order_date: '2026-07-30', status: 'nova' },
  { id: 'b', place_name: 'U Lípy', delivery_date: '2026-08-20', order_date: '2026-08-18', status: 'nova' },
  { id: 'c', place_name: 'Na Rohu', delivery_date: null, order_date: '2026-09-02', status: 'nova' },
  { id: 'd', place_name: 'Na Rohu', delivery_date: '2026-08-10', order_date: '2026-08-08', status: 'storno' },
];
const POL = [
  { order_id: 'a', beer_id: 'b11', package_id: 'keg30', quantity: 2 }, // cena k 30. 7. → 2 × 1000
  { order_id: 'b', beer_id: 'b11', package_id: 'keg30', quantity: 1 }, // 1200
  { order_id: 'b', beer_id: 'b12', package_id: 'keg50', quantity: 1 }, // 2500
  { order_id: 'b', beer_id: 'b99', package_id: 'keg30', quantity: 1 }, // bez ceny
  { order_id: 'c', beer_id: 'b12', package_id: 'keg50', quantity: 2 }, // 5000, září
  { order_id: 'd', beer_id: 'b12', package_id: 'keg50', quantity: 9 }, // storno
];

describe('trzbyPoMesicich', () => {
  it('měsíc podle dne závozu, cena k datu objednávky, bez storna', () => {
    const r = trzbyPoMesicich(OBJ, POL, CENIK, '2026-09');
    expect(r).toHaveLength(12);
    const m = Object.fromEntries(r.map((x) => [x.mesic, x]));
    expect(m['2026-08']).toEqual({ mesic: '2026-08', castka: 2000 + 1200 + 2500, bezCeny: 1 });
    expect(m['2026-09']).toEqual({ mesic: '2026-09', castka: 5000, bezCeny: 0 });
  });

  it('sedí s hodnotou objednávky v detailu objednávky', () => {
    const r = trzbyPoMesicich([OBJ[1]], POL, CENIK, '2026-08', 1)[0];
    const detail = hodnotaObjednavky(POL.filter((p) => p.order_id === 'b') as any, CENIK, OBJ[1].order_date);
    expect(r.castka).toBe(detail.celkem);
    expect(r.bezCeny).toBe(detail.chybiCenaUPolozek);
  });
});

describe('trzbyPodleOdberatelu', () => {
  it('seřazené podle částky, počty objednávek, bez storna', () => {
    const r = trzbyPodleOdberatelu(OBJ, POL, CENIK, '2026-08-01', '2026-09-30');
    expect(r.map((x) => x.nazev)).toEqual(['U Lípy', 'Na Rohu']);
    expect(r[0]).toEqual({ nazev: 'U Lípy', castka: 5700, objednavek: 2, bezCeny: 1 });
    expect(r[1]).toEqual({ nazev: 'Na Rohu', castka: 5000, objednavek: 1, bezCeny: 0 });
  });
});

describe('mezirocniPodlePiv', () => {
  it('letošek proti STEJNÉMU úseku loni, ne proti celému loňsku', () => {
    const sudy = [
      { entry_date: '2026-03-01', beer_id: 'b11', package_id: 'keg30', quantity: 10 }, // 300 l letos
      { entry_date: '2025-03-01', beer_id: 'b11', package_id: 'keg30', quantity: 5 }, // 150 l loni ve stejném úseku
      { entry_date: '2025-11-01', beer_id: 'b11', package_id: 'keg30', quantity: 50 }, // loni PO tomtéž dni → nepočítá se
      { entry_date: '2026-02-01', beer_id: 'b12', package_id: 'keg50', quantity: 1 }, // nové pivo, loni nic
    ];
    const r = mezirocniPodlePiv(sudy, OBALY, PIVA, '2026-09-26');
    const b11 = r.find((x) => x.id === 'b11')!;
    expect(b11).toMatchObject({ letos: 300, loni: 150, zmena: 100 });
    expect(r.find((x) => x.id === 'b12')!.zmena).toBeNull();
  });
});

describe('odpisyPoMesicich', () => {
  it('kusy, litry a podíl z výstavu téhož měsíce', () => {
    const odpisy = [{ entry_date: '2026-08-10', beer_id: 'b11', package_id: 'keg30', quantity: 1 }];
    const sudy = [{ entry_date: '2026-08-02', beer_id: 'b11', package_id: 'keg30', quantity: 20 }];
    const r = odpisyPoMesicich(odpisy, sudy, OBALY, '2026-08');
    expect(r.at(-1)).toEqual({ mesic: '2026-08', kusy: 1, litry: 30, vystavL: 600, podil: 5 });
    expect(r[0].podil).toBeNull(); // měsíc bez výstavu — žádné dělení nulou
  });
});

describe('kdoBrzyObjedna', () => {
  const zavozy = (jmeno: string, dny: string[]) =>
    dny.map((d, i) => ({ id: `${jmeno}${i}`, place_name: jmeno, delivery_date: d, order_date: d, status: 'nova' }));

  it('podle mediánu odstupu pozná, kdo je po termínu', () => {
    const obj = zavozy('Hospoda', ['2026-08-01', '2026-08-15', '2026-08-29', '2026-09-12']); // každých 14 dní
    const r = kdoBrzyObjedna(obj, '2026-09-30');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nazev: 'Hospoda', kazdychDni: 14, posledni: '2026-09-12', ocekavane: '2026-09-26', poTerminu: 4 });
  });

  it('kdo má naplánovaný budoucí závoz, na seznamu není', () => {
    const obj = [...zavozy('Hospoda', ['2026-08-01', '2026-08-15', '2026-08-29']), ...zavozy('Hospoda', ['2026-10-02']).map((o) => ({ ...o, id: 'budouci' }))];
    expect(kdoBrzyObjedna(obj, '2026-09-30')).toEqual([]);
  });

  it('málo závozů, dlouhé mlčení a termín daleko dopředu se nehlásí', () => {
    const obj = [
      ...zavozy('Dva', ['2026-09-01', '2026-09-08']),
      ...zavozy('Spici', ['2026-01-01', '2026-01-15', '2026-02-01']),
      ...zavozy('Pozdeji', ['2026-08-01', '2026-08-31', '2026-09-28']), // další až koncem října
    ];
    expect(kdoBrzyObjedna(obj, '2026-09-30')).toEqual([]);
  });

  it('storno se nepočítá jako závoz', () => {
    const obj = zavozy('Hospoda', ['2026-08-01', '2026-08-15', '2026-08-29']);
    obj.push({ id: 'x', place_name: 'Hospoda', delivery_date: '2026-09-25', order_date: '2026-09-25', status: 'storno' });
    expect(kdoBrzyObjedna(obj, '2026-09-30')[0].posledni).toBe('2026-08-29');
  });
});
