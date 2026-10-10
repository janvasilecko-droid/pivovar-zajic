// Odznak Obchodu na ploše (10. 10. 2026): jedno číslo ze stejných výpočtů jako uvnitř Obchodu.
import { describe, it, expect } from 'vitest';
import { odKdyJePotrebaZnatPohyby, spoctiUpozorneni } from './obchodUpozorneni';
import type { VstupSkladu } from './obchodSklad';

const zbozi = [
  { kod: 'A', nazev: 'Pivo A', beer_id: 'b1', package_id: 'p1', min_ks: 10 },
  { kod: 'B', nazev: 'Limo', beer_id: null, package_id: null, min_ks: null },
];
const vstup = (p: Partial<VstupSkladu> = {}): VstupSkladu => ({
  zbozi, fasovani: [], prijmy: [], odpisy: [], uzaverky: [], radky: [], inventury: [], ...p,
});

describe('spoctiUpozorneni', () => {
  it('prázdný obchod nemá co hlídat', () => {
    expect(spoctiUpozorneni(vstup(), [], '2026-10-10')).toEqual({ zasoby: 0, fasovaniBezZbozi: 0, mezery: 0, inventura: false, celkem: 0 });
  });

  it('zboží pod minimem se počítá, bez inventury ne (stav je neznámý, ne nula)', () => {
    const sInventurou = vstup({ inventury: [{ kod: 'A', datum: '2026-10-05', napocitano: 4 }] });
    expect(spoctiUpozorneni(sInventurou, [], '2026-10-06').zasoby).toBe(1);
    expect(spoctiUpozorneni(vstup(), [], '2026-10-06').zasoby).toBe(0);
  });

  it('odpis může zboží stáhnout pod minimum a odznak to ukáže', () => {
    const v = vstup({
      inventury: [{ kod: 'A', datum: '2026-10-05', napocitano: 12 }],
      odpisy: [{ kod: 'A', datum: '2026-10-06', mnozstvi: 5, duvod: 'rozbite' }],
    });
    expect(spoctiUpozorneni(v, [], '2026-10-07').zasoby).toBe(1);
  });

  it('mezera v uzávěrkách se počítá, „zavřeno" ji zavře', () => {
    const v = vstup({ uzaverky: [{ id: 'u1', datum_od: '2026-10-01', datum_do: '2026-10-03', stredisko: '2' }] });
    expect(spoctiUpozorneni(v, [], '2026-10-06').mezery).toBe(1);
    expect(spoctiUpozorneni(v, [{ datum: '2026-10-04' }, { datum: '2026-10-05' }], '2026-10-06').mezery).toBe(0);
  });

  it('chybějící inventura za končící měsíc je jedna věc; celkem je součet všeho', () => {
    const v = vstup({
      inventury: [{ kod: 'A', datum: '2026-09-15', napocitano: 2 }],
      uzaverky: [{ id: 'u1', datum_od: '2026-09-20', datum_do: '2026-09-25', stredisko: '2' }],
    });
    const u = spoctiUpozorneni(v, [], '2026-10-02');
    expect(u).toMatchObject({ zasoby: 1, mezery: 1, inventura: true });
    expect(u.celkem).toBe(u.zasoby + u.fasovaniBezZbozi + u.mezery + 1);
  });

  it('nafasované pivo bez zboží v obchodě se počítá až po první inventuře', () => {
    const fas = [{ beer_id: 'b9', package_id: 'p9', quantity: 12, entry_date: '2026-10-06' }];
    expect(spoctiUpozorneni(vstup({ fasovani: fas }), [], '2026-10-07').fasovaniBezZbozi).toBe(0);
    expect(spoctiUpozorneni(vstup({ fasovani: fas, inventury: [{ kod: 'B', datum: '2026-10-01', napocitano: 3 }] }), [], '2026-10-07').fasovaniBezZbozi).toBe(1);
  });
});

describe('odKdyJePotrebaZnatPohyby', () => {
  it('je to nejstarší z POSLEDNÍCH inventur jednotlivého zboží', () => {
    expect(odKdyJePotrebaZnatPohyby([
      { kod: 'A', datum: '2026-08-31' }, { kod: 'A', datum: '2026-09-30' },
      { kod: 'B', datum: '2026-09-15' },
    ])).toBe('2026-09-15');
  });

  it('bez inventur není od kdy', () => {
    expect(odKdyJePotrebaZnatPohyby([])).toBeNull();
  });
});
