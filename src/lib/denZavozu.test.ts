// Výchozí den závozu odběratele (17. 11. 2026: „u objednávek nastav primárně
// závoz středa, pokud není jinak označeno ve zprávě" a „u objednávek Seeberg,
// Lužec dávej automaticky objednávky na pátek"). Musí říkat totéž co databáze
// (vychozi_den_zavozu, migrace 20261231260000 a 20261231470000).
import { describe, it, expect } from 'vitest';
import { computeDeliveryDateISO, denADatumZeZpravyNeboVychozi, vychoziDenZavozu, VYCHOZI_DEN_ZAVOZU } from './denZavozu';

const MISTA = [
  { id: 'p-lipa', name: 'Hospoda U Lípy' },
  { id: 'p-rest', name: 'Restaurace', vychozi_den_zavozu: 'zadny' },
  { id: 'p-prodejna', name: 'Prodejna', vychozi_den_zavozu: 'zadny' },
  { id: 'p-luzec', name: 'Lužec', vychozi_den_zavozu: 'pa' },
  { id: 'p-seeberg', name: 'Seeberg', vychozi_den_zavozu: 'pa' },
  { id: 'p-truck', name: 'Food truck', vychozi_den_zavozu: 'ct' },
  { id: 'p-null', name: 'Maneo', vychozi_den_zavozu: null },
];

describe('vychoziDenZavozu', () => {
  it('běžný odběratel i neznámý odběratel mají středu', () => {
    expect(VYCHOZI_DEN_ZAVOZU).toBe('st');
    expect(vychoziDenZavozu(MISTA, 'p-lipa', 'Hospoda U Lípy')).toBe('st');
    expect(vychoziDenZavozu(MISTA, 'p-null', null)).toBe('st');
    expect(vychoziDenZavozu(MISTA, null, 'Nový odběratel')).toBe('st');
    expect(vychoziDenZavozu(MISTA, null, null)).toBe('st');
    expect(vychoziDenZavozu([], null, '')).toBe('st');
  });

  it('Restaurace a Prodejna (zadny) žádný výchozí den nemají', () => {
    expect(vychoziDenZavozu(MISTA, 'p-rest', 'Restaurace')).toBeNull();
    expect(vychoziDenZavozu(MISTA, null, 'Prodejna')).toBeNull();
  });

  it('Seeberg a Lužec mají pátek — podle id i jen podle jména', () => {
    expect(vychoziDenZavozu(MISTA, 'p-seeberg', 'Seeberg')).toBe('pa');
    expect(vychoziDenZavozu(MISTA, 'p-luzec', null)).toBe('pa');
    expect(vychoziDenZavozu(MISTA, null, 'Lužec')).toBe('pa');
    expect(vychoziDenZavozu(MISTA, null, ' seeberg ')).toBe('pa');
  });

  it('odběratel s vlastním dnem má ten den', () => {
    expect(vychoziDenZavozu(MISTA, 'p-truck', null)).toBe('ct');
  });

  it('jméno se hledá bez ohledu na velikost písmen a mezery; id má přednost před jménem', () => {
    expect(vychoziDenZavozu(MISTA, null, '  restaurace ')).toBeNull();
    expect(vychoziDenZavozu(MISTA, 'p-lipa', 'Restaurace')).toBe('st');
    // „Restaurace Na Růžku" není „Restaurace" — středu má.
    expect(vychoziDenZavozu(MISTA, null, 'Restaurace Na Růžku')).toBe('st');
  });

  it('dva odběratelé stejného jména bez id: platí ten s nastaveným dnem (jako v databázi)', () => {
    const dva = [{ id: 'a', name: 'Seeberg' }, { id: 'b', name: 'seeberg', vychozi_den_zavozu: 'pa' }];
    expect(vychoziDenZavozu(dva, null, 'Seeberg')).toBe('pa');
    expect(vychoziDenZavozu(dva, 'a', 'Seeberg')).toBe('st');
    const bezDne = [{ id: 'a', name: 'Prodejna' }, { id: 'b', name: 'prodejna', vychozi_den_zavozu: 'zadny' }];
    expect(vychoziDenZavozu(bezDne, null, 'Prodejna')).toBeNull();
  });

  it('neplatná hodnota ve sloupci se bere jako středa', () => {
    expect(vychoziDenZavozu([{ id: 'x', name: 'X', vychozi_den_zavozu: 'kdykoli' }], 'x', null)).toBe('st');
  });
});

describe('computeDeliveryDateISO', () => {
  it('datum má přednost, jinak den v týdnu objednávky (bez dne pátek)', () => {
    expect(computeDeliveryDateISO('2026-11-16', 'st', '2026-11-25')).toBe('2026-11-25');
    expect(computeDeliveryDateISO('2026-11-16', 'st', null)).toBe('2026-11-18');
    expect(computeDeliveryDateISO('2026-11-16', null, null)).toBe('2026-11-20');
  });
});

describe('denADatumZeZpravyNeboVychozi — rychlý import zprávy bez kontrolního okna', () => {
  const zaklad = { mista: MISTA, placeId: 'p-lipa', placeName: 'Hospoda U Lípy', dnes: '2026-11-16' };

  it('zpráva bez dne („2x30"): výchozí středa a nejbližší takové datum — ne pondělí s dneškem', () => {
    expect(denADatumZeZpravyNeboVychozi({ ...zaklad })).toEqual({ den: 'st', datum: '2026-11-18' });
    // ve středu dnešek, ve čtvrtek středa příštího týdne
    expect(denADatumZeZpravyNeboVychozi({ ...zaklad, dnes: '2026-11-18' })).toEqual({ den: 'st', datum: '2026-11-18' });
    expect(denADatumZeZpravyNeboVychozi({ ...zaklad, dnes: '2026-11-19' })).toEqual({ den: 'st', datum: '2026-11-25' });
  });

  it('den a datum ze zprávy („2x30 na pátek") mají přednost', () => {
    expect(denADatumZeZpravyNeboVychozi({ ...zaklad, den: 'pa', datum: '2026-11-20' })).toEqual({ den: 'pa', datum: '2026-11-20' });
    // den bez data → nejbližší takový den
    expect(denADatumZeZpravyNeboVychozi({ ...zaklad, den: 'pa' })).toEqual({ den: 'pa', datum: '2026-11-20' });
  });

  it('„příští týden" bez dne: výchozí středa příštího týdne', () => {
    expect(denADatumZeZpravyNeboVychozi({ ...zaklad, pristiTyden: true })).toEqual({ den: 'st', datum: '2026-11-25' });
    // ve čtvrtek je nejbližší středa už v příštím týdnu — další týden se nepřidává
    expect(denADatumZeZpravyNeboVychozi({ ...zaklad, dnes: '2026-11-19', pristiTyden: true })).toEqual({ den: 'st', datum: '2026-11-25' });
  });

  it('odběratel bez výchozího dne (Restaurace) zůstává na dnešku, se správným dnem v týdnu', () => {
    expect(denADatumZeZpravyNeboVychozi({ ...zaklad, placeId: 'p-rest', placeName: 'Restaurace' })).toEqual({ den: 'po', datum: '2026-11-16' });
    expect(denADatumZeZpravyNeboVychozi({ ...zaklad, placeId: 'p-rest', placeName: 'Restaurace', dnes: '2026-11-17' })).toEqual({ den: 'ut', datum: '2026-11-17' });
  });

  it('datum ze zprávy bez dne: den výchozí, datum ze zprávy', () => {
    expect(denADatumZeZpravyNeboVychozi({ ...zaklad, datum: '2026-11-27' })).toEqual({ den: 'st', datum: '2026-11-27' });
  });

  // 17. 11. 2026: „u objednávek Seeberg, Lužec dávej automaticky objednávky na pátek".
  it('Seeberg a Lužec bez dne ve zprávě: nejbližší pátek (v pátek týž den, v sobotu až další)', () => {
    const seeberg = { ...zaklad, placeId: 'p-seeberg', placeName: 'Seeberg' };
    expect(denADatumZeZpravyNeboVychozi({ ...seeberg, dnes: '2026-11-17' })).toEqual({ den: 'pa', datum: '2026-11-20' });
    expect(denADatumZeZpravyNeboVychozi({ ...seeberg, dnes: '2026-11-20' })).toEqual({ den: 'pa', datum: '2026-11-20' });
    expect(denADatumZeZpravyNeboVychozi({ ...seeberg, dnes: '2026-11-21' })).toEqual({ den: 'pa', datum: '2026-11-27' });
    expect(denADatumZeZpravyNeboVychozi({ ...zaklad, placeId: null, placeName: 'Lužec', dnes: '2026-11-17' })).toEqual({ den: 'pa', datum: '2026-11-20' });
  });

  it('Seeberg s dnem ve zprávě („na čtvrtek"): platí den ze zprávy, ne pátek', () => {
    const seeberg = { ...zaklad, placeId: 'p-seeberg', placeName: 'Seeberg', dnes: '2026-11-17' };
    expect(denADatumZeZpravyNeboVychozi({ ...seeberg, den: 'ct' })).toEqual({ den: 'ct', datum: '2026-11-19' });
    expect(denADatumZeZpravyNeboVychozi({ ...seeberg, den: 'ut', datum: '2026-11-24' })).toEqual({ den: 'ut', datum: '2026-11-24' });
  });
});
