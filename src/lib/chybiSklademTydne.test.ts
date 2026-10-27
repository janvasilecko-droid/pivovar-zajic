// Audit 9. 10. 2026: Objednávky a Závoz počítají „chybí skladem" jedním výpočtem.
// Od 27. 10. 2026 bez výjimek pro vlastní sudy odběratelů (zrušené, lib/vlastniSudy.ts).
import { describe, expect, it } from 'vitest';
import { chybiSklademTydne, schodkyObjednavky } from './tydenniZbytek';

const obaly = [{ id: 'k30', kind: 'keg', volume_l: 30 }];
const vypocet = (objednavky: any[], polozky: Record<string, any[]>, kegging: any[]) => chybiSklademTydne({
  zdroje: { keggingRows: kegging, zavozDeductionRows: [], packages: obaly as any },
  konecTydneISO: '2026-10-11',
  objednavky,
  polozky: (id) => polozky[id] ?? [],
  vsechnyObjednavky: objednavky,
  vsechnyPolozky: Object.values(polozky).flat(),
  obaly,
});

describe('chybiSklademTydne', () => {
  const objednavky = [
    { id: 'a', place_name: 'Hospoda A', delivery_date: '2026-10-08', order_date: '2026-10-05' },
    { id: 'b', place_name: 'Hospoda B', delivery_date: '2026-10-09', order_date: '2026-10-05' },
  ];
  const polozky: Record<string, any[]> = {
    a: [{ id: 'i-a', order_id: 'a', beer_id: 'sv', package_id: 'k30', quantity: 2 }],
    b: [{ id: 'i-b', order_id: 'b', beer_id: 'sv', package_id: 'k30', quantity: 2 }],
  };

  it('dvě objednávky na stejné pivo se o zásobu dělí (Závoz dřív ukazoval obě v pořádku)', () => {
    const z = vypocet(objednavky, polozky, [{ entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k30', quantity: 2 }]);
    expect(schodkyObjednavky(polozky.a, z.get('a')!)).toEqual([]);
    expect(schodkyObjednavky(polozky.b, z.get('b')!)[0].chybi).toBe(2);
  });

  it('EGON „do vlastního sudu“ je obyčejná objednávka — bere ze zásoby jako ostatní', () => {
    const objE = [
      { id: 'e', place_name: 'EGON', note: 'do vlastního sudu', delivery_date: '2026-10-07', order_date: '2026-10-05' },
      objednavky[0],
    ];
    const polE: Record<string, any[]> = {
      e: [{ id: 'i-e', order_id: 'e', beer_id: 'sv', package_id: 'k30', quantity: 2 }],
      a: polozky.a,
    };
    const z = vypocet(objE, polE, [{ entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k30', quantity: 2 }]);
    // Egon (st) dostane 2, na A (čt) nezbude nic.
    expect(schodkyObjednavky(polE.e, z.get('e')!)).toEqual([]);
    expect(schodkyObjednavky(polE.a, z.get('a')!)[0]?.chybi).toBe(2);
  });
});
