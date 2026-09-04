import { describe, it, expect } from 'vitest';
import { kartaOdberatele, type ObjednavkaOdberatele, type PolozkaOdberatele } from './kartaOdberatele';

const DNES = '2026-09-03';

const OBJ: ObjednavkaOdberatele[] = [
  { id: 'o1', datum: '2026-08-06' },
  { id: 'o2', datum: '2026-08-20' },
  { id: 'o3', datum: '2026-09-01' },
  { id: 'x1', datum: '2026-09-02', status: 'storno' },
];

const POL: PolozkaOdberatele[] = [
  { order_id: 'o1', beer_id: 'des', beer_name: 'Desítka', package_id: 'k30', package_label: 'KEG 30 l', quantity: 2 },
  { order_id: 'o1', beer_id: 'jed', beer_name: 'Jedenáctka', package_id: 'k50', package_label: 'KEG 50 l', quantity: 1 },
  { order_id: 'o2', beer_id: 'des', beer_name: 'Desítka', package_id: 'k30', package_label: 'KEG 30 l', quantity: 3 },
  { order_id: 'o3', beer_id: 'des', beer_name: 'Desítka', package_id: 'k30', package_label: 'KEG 30 l', quantity: 2 },
  { order_id: 'o3', beer_id: 'des', beer_name: 'Desítka', package_id: 'pet', package_label: 'PET 1,5 l', quantity: 24 },
  // Storno objednávka s velkým množstvím — nesmí kartu rozhodit.
  { order_id: 'x1', beer_id: 'jed', beer_name: 'Jedenáctka', package_id: 'k50', package_label: 'KEG 50 l', quantity: 99 },
];

describe('kartaOdberatele', () => {
  it('spočítá objednávky, poslední datum a dny od ní', () => {
    const k = kartaOdberatele(OBJ, POL, DNES);
    expect(k.objednavek).toBe(3);
    expect(k.posledni).toBe('2026-09-01');
    expect(k.dnuOdPosledni).toBe(2);
  });

  it('STORNO se nepočítá nikam', () => {
    // Zrušená objednávka neříká nic o tom, co odběratel bere ani jak často.
    const k = kartaOdberatele(OBJ, POL, DNES);
    expect(k.posledni).not.toBe('2026-09-02');
    expect(k.oblibene.some((o) => o.kusu === 99)).toBe(false);
  });

  it('spočítá rytmus jako průměr rozestupů', () => {
    // 6. 8. → 20. 8. = 14 dní, 20. 8. → 1. 9. = 12 dní, průměr 13.
    expect(kartaOdberatele(OBJ, POL, DNES).prumerneKazdychDni).toBe(13);
  });

  it('z jedné objednávky se rytmus NEODVOZUJE', () => {
    // Odhad z jedné objednávky by byl vymyšlený a podle „bere každých
    // 7 dní" se plánuje závoz.
    const k = kartaOdberatele([OBJ[0]], POL.filter((p) => p.order_id === 'o1'), DNES);
    expect(k.prumerneKazdychDni).toBeNull();
  });

  it('oblíbené řadí podle množství a sčítá napříč objednávkami', () => {
    const k = kartaOdberatele(OBJ, POL, DNES);
    expect(k.oblibene[0].popis).toBe('Desítka · PET 1,5 l'); // 24 ks
    const des30 = k.oblibene.find((o) => o.package_id === 'k30')!;
    expect(des30.kusu).toBe(7); // 2 + 3 + 2
    expect(des30.objednavek).toBe(3);
  });

  it('„to co posledně" jsou položky POSLEDNÍ objednávky', () => {
    const k = kartaOdberatele(OBJ, POL, DNES);
    expect(k.posledniObjednavka.map((p) => p.package_id).sort()).toEqual(['k30', 'pet']);
  });

  it('odběratel bez objednávek dá prázdnou kartu, ne nuly a NaN', () => {
    const k = kartaOdberatele([], [], DNES);
    expect(k).toEqual({
      objednavek: 0, posledni: null, dnuOdPosledni: null,
      prumerneKazdychDni: null, oblibene: [], posledniObjednavka: [],
    });
  });

  it('quantity jako text nebo null nerozhodí součet', () => {
    const pol: PolozkaOdberatele[] = [
      { order_id: 'o1', beer_id: 'des', beer_name: 'Desítka', package_id: 'k30', quantity: '4' },
      { order_id: 'o1', beer_id: 'des', beer_name: 'Desítka', package_id: 'k30', quantity: null },
    ];
    const k = kartaOdberatele([OBJ[0]], pol, DNES);
    expect(k.oblibene[0].kusu).toBe(4);
    expect(Number.isNaN(k.oblibene[0].kusu)).toBe(false);
  });

  it('položky bez piva se popíšou čitelně, ne jako „undefined"', () => {
    const pol: PolozkaOdberatele[] = [
      { order_id: 'o1', beer_id: null, package_id: 'k30', package_label: 'KEG 30 l', quantity: 1 },
    ];
    expect(kartaOdberatele([OBJ[0]], pol, DNES).oblibene[0].popis).toBe('neurčené pivo · KEG 30 l');
  });

  it('položky zrušené i cizí objednávky se ignorují', () => {
    const pol: PolozkaOdberatele[] = [
      { order_id: 'cizi', beer_id: 'des', beer_name: 'Desítka', package_id: 'k30', quantity: 50 },
    ];
    expect(kartaOdberatele(OBJ, pol, DNES).oblibene).toEqual([]);
  });
});
