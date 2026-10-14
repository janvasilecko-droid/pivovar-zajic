// Audit 9. 10. 2026: Objednávky a Závoz počítají „chybí skladem" jedním
// výpočtem a sudy odběratelů s vlastními sudy z něj vyřazují.
import { describe, expect, it } from 'vitest';
import { chybiSklademTydne, schodkyObjednavky } from './tydenniZbytek';

const obaly = [{ id: 'k30', kind: 'keg', volume_l: 30 }];
const objednavky = [
  { id: 'dd', place_name: 'Duck and Dog', delivery_date: '2026-10-07', order_date: '2026-10-05' },
  { id: 'a', place_name: 'Hospoda A', delivery_date: '2026-10-08', order_date: '2026-10-05' },
  { id: 'b', place_name: 'Hospoda B', delivery_date: '2026-10-09', order_date: '2026-10-05' },
];
const polozky: Record<string, any[]> = {
  dd: [{ id: 'i-dd', order_id: 'dd', beer_id: 'sv', package_id: 'k30', quantity: 2 }],
  a: [{ id: 'i-a', order_id: 'a', beer_id: 'sv', package_id: 'k30', quantity: 2 }],
  b: [{ id: 'i-b', order_id: 'b', beer_id: 'sv', package_id: 'k30', quantity: 2 }],
};
const vypocet = (kegging: any[]) => chybiSklademTydne({
  zdroje: { keggingRows: kegging, zavozDeductionRows: [], packages: obaly as any },
  konecTydneISO: '2026-10-11',
  objednavky,
  polozky: (id) => polozky[id] ?? [],
  vsechnyObjednavky: objednavky,
  vsechnyPolozky: Object.values(polozky).flat(),
  obaly,
});

describe('chybiSklademTydne', () => {
  it('sudy Duck and Dog nekryjí ostatní a jejich objednávka si zásobu nebere', () => {
    // Stočeno 2 do sudů Duck and Dog (vazba na jejich položku) + 3 naše.
    const z = vypocet([
      { entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k30', quantity: 2, order_item_id: 'i-dd' },
      { entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k30', quantity: 3, order_item_id: null },
    ]);
    // A (čt) dostane 2 ze 3, B (pá) už jen 1 → chybí 1.
    expect(schodkyObjednavky(polozky.a, z.get('a')!)).toEqual([]);
    expect(schodkyObjednavky(polozky.b, z.get('b')!)).toEqual([{ beer_id: 'sv', package_id: 'k30', beer_name: '?', chybi: 1 }]);
  });

  it('dvě objednávky na stejné pivo se o zásobu dělí (Závoz dřív ukazoval obě v pořádku)', () => {
    const z = vypocet([{ entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k30', quantity: 2 }]);
    expect(schodkyObjednavky(polozky.a, z.get('a')!)).toEqual([]);
    expect(schodkyObjednavky(polozky.b, z.get('b')!)[0].chybi).toBe(2);
  });
});

// 14. 10. 2026, Egon: „do jejich sudu“ v poznámce dělá vlastní i odběratele mimo seznam.
describe('chybiSklademTydne — poznámka „do vlastního sudu“', () => {
  const objE = [
    { id: 'e', place_name: 'EGON', note: 'do vlastního sudu', delivery_date: '2026-10-07', order_date: '2026-10-05' },
    { id: 'a', place_name: 'Hospoda A', delivery_date: '2026-10-08', order_date: '2026-10-05' },
  ];
  const polE: Record<string, any[]> = {
    e: [{ id: 'i-e', order_id: 'e', beer_id: 'sv', package_id: 'k30', quantity: 2 }],
    a: [{ id: 'i-a', order_id: 'a', beer_id: 'sv', package_id: 'k30', quantity: 2 }],
  };
  const vypocetE = (objednavkyE: any[], kegging: any[]) => chybiSklademTydne({
    zdroje: { keggingRows: kegging, zavozDeductionRows: [], packages: obaly as any },
    konecTydneISO: '2026-10-11',
    objednavky: objednavkyE,
    polozky: (id) => polE[id] ?? [],
    vsechnyObjednavky: objednavkyE,
    vsechnyPolozky: Object.values(polE).flat(),
    obaly,
  });

  it('naplněné sudy do jejich sudů nekryjí ostatní a jejich objednávka si zásobu nebere', () => {
    const z = vypocetE(objE, [
      { entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k30', quantity: 2, order_item_id: 'i-e' },
      { entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k30', quantity: 2, order_item_id: null },
    ]);
    expect(schodkyObjednavky(polE.a, z.get('a')!)).toEqual([]);
  });

  it('bez poznámky je to obyčejný odběratel — jeho sudy kryjí ostatní', () => {
    const bezPoznamky = objE.map((o) => (o.id === 'e' ? { ...o, note: null } : o));
    const z = vypocetE(bezPoznamky, [
      { entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k30', quantity: 2, order_item_id: 'i-e' },
    ]);
    // Egonovy 2 sudy se bez poznámky počítají jako sklad pivovaru: pokryjí Egona (st) a pro A nezbude nic.
    expect(schodkyObjednavky(polE.a, z.get('a')!)[0]?.chybi).toBe(2);
  });
});
