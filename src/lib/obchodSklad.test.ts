// Sklad obchodu (10. 10. 2026): fasování a příjem přidávají, uzávěrka ubírá, počítá se od inventury.
import { describe, it, expect } from 'vitest';
import {
  dnyZasoby, fasovaniBezZbozi, pohybyZbozi, prumernyDenniProdej, stavySkladu, varovaniZasob,
  type VstupSkladu,
} from './obchodSklad';

const zbozi = [
  { kod: '11141', nazev: 'Pivo PET 1l 12° světlá', beer_id: 'b12s', package_id: 'p1', min_ks: 10 },
  { kod: '10241', nazev: 'Pivo sud 30l 10° světlá', beer_id: 'b10', package_id: 'k30', min_ks: null },
  { kod: '1106', nazev: 'Saponát 1l', beer_id: null, package_id: null, min_ks: 2 },
];

const zaklad = (p: Partial<VstupSkladu> = {}): VstupSkladu => ({
  zbozi,
  fasovani: [],
  prijmy: [],
  uzaverky: [],
  radky: [],
  inventury: [],
  ...p,
});

const stav = (v: VstupSkladu, kDatu: string, kod: string) => stavySkladu(v, kDatu).find((s) => s.kod === kod)!;

describe('odpis zboží v obchodě', () => {
  const inv = [{ kod: '1106', datum: '2026-10-05', napocitano: 10 }];

  it('odpis po inventuře ze skladu ubývá, odpis v den inventury a před ní už je v napočítaném čísle', () => {
    const v = zaklad({
      inventury: inv,
      odpisy: [
        { kod: '1106', datum: '2026-10-06', mnozstvi: 2, duvod: 'rozbite' },
        { kod: '1106', datum: '2026-10-05', mnozstvi: 5, duvod: 'prosle' },
        { kod: '1106', datum: '2026-10-01', mnozstvi: 3, duvod: 'prosle' },
      ],
    });
    expect(stav(v, '2026-10-10', '1106')).toMatchObject({ stav: 8, odepsano: 2 });
  });

  it('odpis po zvoleném dni se do stavu k tomu dni nepočítá', () => {
    const v = zaklad({ inventury: inv, odpisy: [{ kod: '1106', datum: '2026-10-09', mnozstvi: 4, duvod: 'ztrata' }] });
    expect(stav(v, '2026-10-08', '1106').stav).toBe(10);
    expect(stav(v, '2026-10-09', '1106').stav).toBe(6);
  });

  it('bez odpisů (migrace ještě neběžela) se stav počítá jako dřív', () => {
    expect(stav(zaklad({ inventury: inv }), '2026-10-10', '1106')).toMatchObject({ stav: 10, odepsano: 0 });
  });

  it('odpis může stav stáhnout do mínusu a hlídání zásob na to upozorní', () => {
    const v = zaklad({ inventury: inv, odpisy: [{ kod: '1106', datum: '2026-10-07', mnozstvi: 12, duvod: 'ztrata' }] });
    const s = stavySkladu(v, '2026-10-10');
    expect(varovaniZasob(s).find((x) => x.kod === '1106')).toMatchObject({ druh: 'zaporny', stav: -2 });
  });

  it('v pohybech zboží je odpis se zápornými kusy a důvodem', () => {
    const v = zaklad({ inventury: inv, odpisy: [{ kod: '1106', datum: '2026-10-06', mnozstvi: 2, duvod: 'rozbite' }] });
    expect(pohybyZbozi('1106', v).find((p) => p.druh === 'odpis')).toEqual({
      datum: '2026-10-06', druh: 'odpis', ks: -2, popis: 'Odpis — rozbité',
    });
  });
});

describe('stavySkladu', () => {
  it('bez inventury je stav neznámý (null), ne nula', () => {
    const v = zaklad({ fasovani: [{ beer_id: 'b12s', package_id: 'p1', quantity: 20, entry_date: '2026-10-08' }] });
    expect(stav(v, '2026-10-10', '11141').stav).toBeNull();
  });

  it('inventura + fasování + příjem − uzávěrka', () => {
    const v = zaklad({
      inventury: [
        { kod: '11141', datum: '2026-10-05', napocitano: 10 },
        { kod: '1106', datum: '2026-10-05', napocitano: 4 },
      ],
      fasovani: [
        { beer_id: 'b12s', package_id: 'p1', quantity: 20, entry_date: '2026-10-07' },
        { beer_id: 'b12s', package_id: 'p1', quantity: 5, entry_date: '2026-10-05' }, // v den inventury už je v číslu
      ],
      prijmy: [{ kod: '1106', datum: '2026-10-08', mnozstvi: 6 }],
      uzaverky: [{ id: 'u1', datum_od: '2026-10-10', datum_do: '2026-10-10' }],
      radky: [
        { uzaverka_id: 'u1', kod: '11141', mnozstvi: 13 },
        { uzaverka_id: 'u1', kod: '1106', mnozstvi: 1 },
      ],
    });
    const pet = stav(v, '2026-10-10', '11141');
    expect(pet).toMatchObject({ stav: 17, napocitano: 10, fasovano: 20, prodano: 13, odInventury: '2026-10-05' });
    expect(stav(v, '2026-10-10', '1106')).toMatchObject({ stav: 9, prijato: 6, prodano: 1 });
  });

  it('k dřívějšímu dni se pozdější pohyby nepočítají', () => {
    const v = zaklad({
      inventury: [{ kod: '11141', datum: '2026-10-05', napocitano: 10 }],
      fasovani: [{ beer_id: 'b12s', package_id: 'p1', quantity: 20, entry_date: '2026-10-07' }],
    });
    expect(stav(v, '2026-10-06', '11141').stav).toBe(10);
    expect(stav(v, '2026-10-07', '11141').stav).toBe(30);
  });

  it('novější inventura přepíše staré počítání', () => {
    const v = zaklad({
      inventury: [
        { kod: '11141', datum: '2026-10-05', napocitano: 10 },
        { kod: '11141', datum: '2026-10-31', napocitano: 3 },
      ],
      fasovani: [{ beer_id: 'b12s', package_id: 'p1', quantity: 20, entry_date: '2026-10-07' }],
    });
    expect(stav(v, '2026-10-31', '11141')).toMatchObject({ stav: 3, odInventury: '2026-10-31', fasovano: 0 });
    expect(stav(v, '2026-10-20', '11141').stav).toBe(30);
  });

  it('smazání uzávěrky sklad vrátí — stav se jen počítá', () => {
    const inv = [{ kod: '11141', datum: '2026-10-05', napocitano: 20 }];
    const s = zaklad({ inventury: inv, uzaverky: [{ id: 'u1', datum_od: '2026-10-10', datum_do: '2026-10-10' }], radky: [{ uzaverka_id: 'u1', kod: '11141', mnozstvi: 13 }] });
    expect(stav(s, '2026-10-10', '11141').stav).toBe(7);
    expect(stav({ ...s, uzaverky: [], radky: [] }, '2026-10-10', '11141').stav).toBe(20);
  });

  it('týdenní uzávěrka se počítá ke dni konce období', () => {
    const v = zaklad({
      inventury: [{ kod: '11141', datum: '2026-10-04', napocitano: 50 }],
      uzaverky: [{ id: 'w', datum_od: '2026-10-05', datum_do: '2026-10-11', typ: 'tydenni' }],
      radky: [{ uzaverka_id: 'w', kod: '11141', mnozstvi: 30 }],
    });
    expect(stav(v, '2026-10-08', '11141').stav).toBe(50);
    expect(stav(v, '2026-10-11', '11141').stav).toBe(20);
  });

  it('Fasování zboží, které v obchodě není, se nikam nepřipíše', () => {
    const v = zaklad({
      inventury: [{ kod: '11141', datum: '2026-10-05', napocitano: 0 }],
      fasovani: [{ beer_id: 'b12t', package_id: 'p1', quantity: 5, entry_date: '2026-10-07' }],
    });
    expect(stav(v, '2026-10-10', '11141').stav).toBe(0);
  });

  it('neaktivní zboží se nepočítá', () => {
    const v = zaklad({ zbozi: [{ ...zbozi[2], aktivni: false }] });
    expect(stavySkladu(v, '2026-10-10')).toEqual([]);
  });
});

describe('fasovaniBezZbozi', () => {
  it('jen po první inventuře a jen to, co zboží nemá', () => {
    const v = zaklad({
      inventury: [{ kod: '11141', datum: '2026-10-05', napocitano: 0 }],
      fasovani: [
        { beer_id: 'b12t', package_id: 'p1', quantity: 5, entry_date: '2026-10-07' },
        { beer_id: 'b12t', package_id: 'p1', quantity: 3, entry_date: '2026-10-09' },
        { beer_id: 'b12t', package_id: 'p1', quantity: 99, entry_date: '2026-09-01' }, // před inventurou
        { beer_id: 'b12s', package_id: 'p1', quantity: 5, entry_date: '2026-10-07' }, // zboží existuje
      ],
    });
    expect(fasovaniBezZbozi(v)).toEqual([{ beer_id: 'b12t', package_id: 'p1', ks: 8, poslednDatum: '2026-10-09' }]);
  });

  it('bez inventury nic', () => {
    expect(fasovaniBezZbozi(zaklad({ fasovani: [{ beer_id: 'x', package_id: 'y', quantity: 1, entry_date: '2026-10-07' }] }))).toEqual([]);
  });
});

describe('varovaniZasob', () => {
  it('záporný, vyprodaný a pod minimem; neznámý stav se nehlídá', () => {
    const stavy = [
      { kod: 'a', nazev: 'A', stav: -2, odInventury: 'x', napocitano: 0, fasovano: 0, prijato: 0, prodano: 2, odepsano: 0, min: null },
      { kod: 'b', nazev: 'B', stav: 0, odInventury: 'x', napocitano: 0, fasovano: 0, prijato: 0, prodano: 0, odepsano: 0, min: 5 },
      { kod: 'c', nazev: 'C', stav: 3, odInventury: 'x', napocitano: 3, fasovano: 0, prijato: 0, prodano: 0, odepsano: 0, min: 5 },
      { kod: 'd', nazev: 'D', stav: 5, odInventury: 'x', napocitano: 5, fasovano: 0, prijato: 0, prodano: 0, odepsano: 0, min: 5 },
      { kod: 'e', nazev: 'E', stav: null, odInventury: null, napocitano: null, fasovano: 0, prijato: 0, prodano: 0, odepsano: 0, min: 5 },
      { kod: 'f', nazev: 'F', stav: 0, odInventury: 'x', napocitano: 0, fasovano: 0, prijato: 0, prodano: 0, odepsano: 0, min: null },
    ];
    expect(varovaniZasob(stavy).map((v) => [v.kod, v.druh])).toEqual([['a', 'zaporny'], ['b', 'nula'], ['c', 'pod_minimem']]);
  });
});

describe('průměrný prodej a dny zásoby', () => {
  const uzaverky = [
    { id: 'u1', datum_od: '2026-10-05', datum_do: '2026-10-05' },
    { id: 'u2', datum_od: '2026-10-06', datum_do: '2026-10-06' },
    { id: 'u3', datum_od: '2026-08-01', datum_do: '2026-08-01' }, // mimo okno
  ];
  const radky = [
    { uzaverka_id: 'u1', kod: 'k', mnozstvi: 6 },
    { uzaverka_id: 'u2', kod: 'k', mnozstvi: 4 },
    { uzaverka_id: 'u3', kod: 'k', mnozstvi: 100 },
  ];

  it('10 ks za 2 dny = 5 ks za den; zásoba 12 ks = 2 dny', () => {
    const p = prumernyDenniProdej('k', uzaverky, radky, '2026-10-10');
    expect(p).toBe(5);
    expect(dnyZasoby(12, p)).toBe(2);
  });

  it('bez prodeje nebo bez uzávěrek se neodhaduje', () => {
    expect(prumernyDenniProdej('jine', uzaverky, radky, '2026-10-10')).toBeNull();
    expect(prumernyDenniProdej('k', [], [], '2026-10-10')).toBeNull();
    expect(dnyZasoby(null, 5)).toBeNull();
    expect(dnyZasoby(10, null)).toBeNull();
  });
});

describe('pohybyZbozi', () => {
  it('všechny druhy pohybů, nejnovější první', () => {
    const v = zaklad({
      inventury: [{ kod: '11141', datum: '2026-10-05', napocitano: 10 }],
      fasovani: [{ beer_id: 'b12s', package_id: 'p1', quantity: 20, entry_date: '2026-10-07' }],
      prijmy: [{ kod: '11141', datum: '2026-10-08', mnozstvi: 2 }],
      uzaverky: [{ id: 'u1', datum_od: '2026-10-10', datum_do: '2026-10-10', cislo: '2/2873' }],
      radky: [{ uzaverka_id: 'u1', kod: '11141', mnozstvi: 13 }],
    });
    expect(pohybyZbozi('11141', v).map((p) => [p.datum, p.druh, p.ks])).toEqual([
      ['2026-10-10', 'prodej', -13],
      ['2026-10-08', 'prijem', 2],
      ['2026-10-07', 'fasovani', 20],
      ['2026-10-05', 'inventura', 10],
    ]);
    expect(pohybyZbozi('nic', v)).toEqual([]);
  });
});
