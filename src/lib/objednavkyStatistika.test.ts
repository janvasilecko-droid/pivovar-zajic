import { describe, it, expect } from 'vitest';
import { poctyPolozek } from './objednavkyStatistika';

type P = { beer_id: string; package_id: string; quantity: number | string | null };

const OBJ = [
  { id: 'o1', status: 'nova' },
  { id: 'o2', status: 'potvrzena' },
  { id: 'o3', status: 'storno' },
];

const POLOZKY: Record<string, P[]> = {
  o1: [
    { beer_id: 'desitka', package_id: 'keg30', quantity: 2 },
    { beer_id: 'jedenactka', package_id: 'keg50', quantity: 1 },
  ],
  o2: [{ beer_id: 'desitka', package_id: 'keg30', quantity: 3 }],
  o3: [{ beer_id: 'desitka', package_id: 'keg30', quantity: 99 }],
};

const jenTricitky = (p: P) => p.package_id === 'keg30';

describe('poctyPolozek', () => {
  it('sečte kusy, objednávky i řádky ve viditelném výběru', () => {
    const r = poctyPolozek({ videne: [OBJ[0]], vsechny: OBJ, polozky: POLOZKY, vyhovuje: jenTricitky });
    expect(r.kusyVeVyberu).toBe(2);
    expect(r.objednavekVeVyberu).toBe(1);
    expect(r.polozekVeVyberu).toBe(1);
  });

  it('storno se do „celkem" NEPOČÍTÁ', () => {
    // Zrušená objednávka na 99 sudů by jinak řekla, že se má nachystat
    // 104 kusů piva, které nikdo nechce.
    const r = poctyPolozek({ videne: OBJ.slice(0, 2), vsechny: OBJ, polozky: POLOZKY, vyhovuje: jenTricitky });
    expect(r.kusyCelkem).toBe(5);
    expect(r.objednavekCelkem).toBe(2);
  });

  it('řekne, že filtr něco schovává', () => {
    // Tohle je celý důvod, proč se počítají dva rozsahy. Bez toho by
    // člověk s filtrem viděl 2 ks a chystal 2, i když jsou potřeba 5.
    const r = poctyPolozek({ videne: [OBJ[0]], vsechny: OBJ, polozky: POLOZKY, vyhovuje: jenTricitky });
    expect(r.kusyVeVyberu).toBe(2);
    expect(r.kusyCelkem).toBe(5);
    expect(r.jsouSkryteObjednavky).toBe(true);
  });

  it('když je vidět všechno, nic se neschovává', () => {
    const r = poctyPolozek({ videne: OBJ.slice(0, 2), vsechny: OBJ, polozky: POLOZKY, vyhovuje: jenTricitky });
    expect(r.jsouSkryteObjednavky).toBe(false);
  });

  it('quantity jako text nebo null nerozhodí součet', () => {
    // Z databáze umí `quantity` přijít jako string (numeric) i jako null.
    // Dřív se to sčítalo přes Number() přímo v obrazovce a NaN by udělalo
    // z celého součtu „NaN ks".
    const polozky: Record<string, P[]> = {
      o1: [
        { beer_id: 'a', package_id: 'keg30', quantity: '4' },
        { beer_id: 'b', package_id: 'keg30', quantity: null },
        { beer_id: 'c', package_id: 'keg30', quantity: 'nic' as any },
      ],
    };
    const r = poctyPolozek({ videne: [OBJ[0]], vsechny: [OBJ[0]], polozky, vyhovuje: jenTricitky });
    expect(r.kusyVeVyberu).toBe(4);
    expect(Number.isNaN(r.kusyVeVyberu)).toBe(false);
  });

  it('objednávka bez položek se nepočítá jako zásah', () => {
    const r = poctyPolozek({ videne: [{ id: 'prazdna' }], vsechny: [{ id: 'prazdna' }], polozky: {}, vyhovuje: jenTricitky });
    expect(r).toEqual({
      kusyVeVyberu: 0, objednavekVeVyberu: 0, polozekVeVyberu: 0,
      kusyCelkem: 0, objednavekCelkem: 0, jsouSkryteObjednavky: false,
    });
  });

  it('filtr, kterému nic nevyhovuje, dá nuly a ne skryté objednávky', () => {
    const r = poctyPolozek({ videne: OBJ, vsechny: OBJ, polozky: POLOZKY, vyhovuje: () => false });
    expect(r.kusyVeVyberu).toBe(0);
    expect(r.kusyCelkem).toBe(0);
    expect(r.jsouSkryteObjednavky).toBe(false);
  });

  it('vlastní čtení množství (např. přepočet na litry) jde podstrčit', () => {
    const r = poctyPolozek({
      videne: [OBJ[0]], vsechny: [OBJ[0]], polozky: POLOZKY, vyhovuje: jenTricitky,
      mnozstvi: (p) => (Number(p.quantity) || 0) * 30,
    });
    expect(r.kusyVeVyberu).toBe(60);
  });
});
