import { describe, it, expect } from 'vitest';
import { cenaKusu, formatKc, hodnotaInventury, orientacniCena, type CenaRadku } from './hodnotaInventury';
import type { CenaPolozky } from './hodnotaObjednavky';

const cena = (p: Partial<CenaPolozky> & { beer_id: string; package_id: string; price_per_unit: number }): CenaPolozky => ({
  currency: 'CZK', valid_from: null, valid_to: null, ...p,
});

describe('orientační cena podle obalu (stejná jako v měsíční inventuře)', () => {
  it('sud, velká lahev, malá lahev', () => {
    expect(orientacniCena(30)).toBe(1500);
    expect(orientacniCena(50)).toBe(1500);
    expect(orientacniCena(20)).toBe(250);   // hranice: přes 20 l je sud
    expect(orientacniCena(1.5)).toBe(250);
    expect(orientacniCena(0.6)).toBe(45);   // hranice: přes 0,6 l je velká lahev
    expect(orientacniCena(0.5)).toBe(45);
    expect(orientacniCena(0)).toBe(45);
  });
});

describe('cena kusu', () => {
  const cenik = [
    cena({ beer_id: 'b1', package_id: 'keg30', price_per_unit: 1275 }),
    cena({ beer_id: 'b1', package_id: 'pet', price_per_unit: 0 }),
    cena({ beer_id: 'b1', package_id: 'eur', price_per_unit: 55, currency: 'EUR' }),
    cena({ beer_id: 'b1', package_id: 'stara', price_per_unit: 100, valid_to: '2026-01-31' }),
  ];

  it('bere cenu z ceníku', () => {
    expect(cenaKusu({ beer_id: 'b1', package_id: 'keg30' }, 30, cenik, '2026-10-10')).toEqual({ cena: 1275, zCeniku: true });
  });
  it('bez ceny v ceníku jede na orientační cenu a řekne to', () => {
    expect(cenaKusu({ beer_id: 'b2', package_id: 'keg30' }, 30, cenik, '2026-10-10')).toEqual({ cena: 1500, zCeniku: false });
  });
  it('nulová cena v ceníku není cena', () => {
    expect(cenaKusu({ beer_id: 'b1', package_id: 'pet' }, 1.5, cenik, '2026-10-10')).toEqual({ cena: 250, zCeniku: false });
  });
  it('cizí měna se s korunami nemíchá', () => {
    expect(cenaKusu({ beer_id: 'b1', package_id: 'eur' }, 0.5, cenik, '2026-10-10')).toEqual({ cena: 45, zCeniku: false });
  });
  it('cena po skončení platnosti neplatí', () => {
    expect(cenaKusu({ beer_id: 'b1', package_id: 'stara' }, 0.5, cenik, '2026-10-10').zCeniku).toBe(false);
    expect(cenaKusu({ beer_id: 'b1', package_id: 'stara' }, 0.5, cenik, '2026-01-15')).toEqual({ cena: 100, zCeniku: true });
  });
});

describe('hodnota inventury', () => {
  const r = (napocitano: number | null, ocekavano: number) => ({
    napocitano, rozdil: napocitano === null ? 0 : napocitano - ocekavano,
  });
  const ceniky = (...c: CenaRadku[]) => {
    let i = 0;
    return () => c[i++];
  };

  it('počítá jen spočítané řádky — nezadané není nula kusů', () => {
    const radky = [r(4, 4), r(null, 10), r(2, 3)];
    const h = hodnotaInventury(radky, ceniky({ cena: 100, zCeniku: true }, { cena: 999, zCeniku: true }));
    expect(h.spocitano).toBe(2);
    expect(h.napocitanoKc).toBe(4 * 100 + 2 * 999);
  });

  it('přebytky, manka a jejich rozdíl', () => {
    const radky = [r(5, 3), r(1, 4), r(7, 7)];
    const h = hodnotaInventury(radky, ceniky(
      { cena: 100, zCeniku: true },   // +2 × 100 = +200
      { cena: 50, zCeniku: true },    // −3 × 50  = −150
      { cena: 10, zCeniku: true },    // sedí
    ));
    expect(h.prebytekKc).toBe(200);
    expect(h.mankoKc).toBe(150);
    expect(h.rozdilKc).toBe(50);
    expect(h.napocitanoKc).toBe(5 * 100 + 1 * 50 + 7 * 10);
    expect(h.orientacnichRadku).toBe(0);
  });

  it('celkově chybí → rozdíl je záporný', () => {
    const h = hodnotaInventury([r(0, 2)], () => ({ cena: 1500, zCeniku: false }));
    expect(h.rozdilKc).toBe(-3000);
    expect(h.mankoKc).toBe(3000);
    expect(h.prebytekKc).toBe(0);
    expect(h.napocitanoKc).toBe(0);
  });

  it('počítá, kolik řádků jde na orientační cenu', () => {
    const h = hodnotaInventury([r(1, 1), r(2, 2), r(null, 5)], ceniky(
      { cena: 10, zCeniku: false }, { cena: 10, zCeniku: true }, { cena: 10, zCeniku: false },
    ));
    // Nespočítaný třetí řádek se nepočítá ani mezi orientační.
    expect(h.orientacnichRadku).toBe(1);
  });

  it('půlka sudu: součty se zaokrouhlí až nakonec a sedí na sebe', () => {
    // 0,5 × 45 = 22,5 Kč na řádek: po jednom by to bylo 23 + 23, správně je to 45.
    const radky = [r(0.5, 0), r(0.5, 0)];
    const h = hodnotaInventury(radky, () => ({ cena: 45, zCeniku: false }));
    expect(h.napocitanoKc).toBe(45);
    expect(h.prebytekKc).toBe(45);
    expect(h.rozdilKc).toBe(h.prebytekKc - h.mankoKc);
  });

  it('prázdný seznam = nuly', () => {
    expect(hodnotaInventury([], () => ({ cena: 1, zCeniku: true }))).toEqual({
      spocitano: 0, napocitanoKc: 0, prebytekKc: 0, mankoKc: 0, rozdilKc: 0, orientacnichRadku: 0,
    });
  });
});

describe('formát korun', () => {
  it('tisíce oddělené pevnou mezerou, znaménko podle potřeby', () => {
    expect(formatKc(12345)).toBe('12 345 Kč');
    expect(formatKc(-750)).toBe('−750 Kč');
    expect(formatKc(750, true)).toBe('+750 Kč');
    expect(formatKc(0, true)).toBe('0 Kč');
    expect(formatKc(-0.4)).toBe('0 Kč');
  });
});
