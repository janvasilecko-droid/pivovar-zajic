// Dlaždice Rozbor na ploše otevře Pohyby na celém měsíci; v něm jde vybrat týden
// (16. 10. 2026: „od začátku měsíce, s možností filtrovat třeba jen týden").
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LS_POHYBY_FILTR, LS_POHYBY_MESIC, LS_POHYBY_REZIM, predvyberRozbor, tydnyMesice } from './pohybyPredvyber';

describe('tydnyMesice', () => {
  it('říjen 2026: týdny 40–44 se dny, které do měsíce padnou', () => {
    expect(tydnyMesice('2026-10')).toEqual([
      { klic: '2026-40', cislo: '40', od: '2026-10-01', doDne: '2026-10-04' },
      { klic: '2026-41', cislo: '41', od: '2026-10-05', doDne: '2026-10-11' },
      { klic: '2026-42', cislo: '42', od: '2026-10-12', doDne: '2026-10-18' },
      { klic: '2026-43', cislo: '43', od: '2026-10-19', doDne: '2026-10-25' },
      { klic: '2026-44', cislo: '44', od: '2026-10-26', doDne: '2026-10-31' },
    ]);
  });

  it('únor a přelom roku', () => {
    expect(tydnyMesice('2026-02')).toHaveLength(5); // 1. 2. je neděle = týden 5
    expect(tydnyMesice('2026-02')[0]).toMatchObject({ od: '2026-02-01', doDne: '2026-02-01' });
    const leden = tydnyMesice('2027-01');
    expect(leden[0]).toMatchObject({ klic: '2026-53', od: '2027-01-01', doDne: '2027-01-03' });
  });

  it('neplatný měsíc nedá nic', () => {
    expect(tydnyMesice('')).toEqual([]);
    expect(tydnyMesice('2026-1')).toEqual([]);
  });
});

describe('predvyberRozbor', () => {
  beforeEach(() => localStorage.clear());

  it('nastaví měsíc a celý měsíc, vybrané pivo a obal nechá být', () => {
    localStorage.setItem(LS_POHYBY_FILTR, JSON.stringify({ beerId: 'b', packageId: 'p' }));
    predvyberRozbor('2026-10-16');
    expect(JSON.parse(localStorage.getItem(LS_POHYBY_REZIM)!)).toBe('mesic');
    expect(JSON.parse(localStorage.getItem(LS_POHYBY_MESIC)!)).toBe('2026-10');
    expect(JSON.parse(localStorage.getItem(LS_POHYBY_FILTR)!)).toEqual({ beerId: 'b', packageId: 'p' });
  });
});

describe('dlaždice Rozbor na ploše', () => {
  it('klepnutí předvybere měsíc a otevře Sklad → Pohyby', () => {
    const zdroj = readFileSync('src/screens/HomeScreen.tsx', 'utf8');
    expect(zdroj).toMatch(/if \(id === 'rozbor'\) \{\s*predvyberRozbor\(businessDateISO\(\)\);\s*setPage\('stock_pohyby'\);\s*return;\s*\}/);
  });
});
