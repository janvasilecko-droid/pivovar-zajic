// Obchod → Sklad (13. 10. 2026): naskladněno po týdnech + fasování bez kódu z pokladny.
import { describe, it, expect } from 'vitest';
import { naskladneniPoTydnech } from './obchodNaskladneni';
import { jeBezKodu, sNafasovanymBezKodu, stavySkladu, type VstupSkladu } from './obchodSklad';

const piva = [{ id: 'b12', name: '12° Světlá' }, { id: 'kiwi', name: 'Kiwi' }];
const obaly = [{ id: 'p1', label: 'PET 1l' }, { id: 'p15', label: 'PET 1.5l' }];
const zbozi = [{ kod: '11141', nazev: 'Pivo PET 1l 12° světlá', beer_id: 'b12', package_id: 'p1' }];
const vstup = (p: Partial<VstupSkladu> = {}): VstupSkladu => ({ zbozi, fasovani: [], prijmy: [], uzaverky: [], radky: [], inventury: [], ...p });

describe('naskladnění po týdnech', () => {
  const v = vstup({
    fasovani: [
      { beer_id: 'b12', package_id: 'p1', quantity: 10, entry_date: '2026-10-12' }, // pondělí tohoto týdne
      { beer_id: 'b12', package_id: 'p1', quantity: 5, entry_date: '2026-10-13' },
      { beer_id: 'b12', package_id: 'p15', quantity: 17, entry_date: '2026-10-11' }, // neděle minulého týdne
      { beer_id: 'kiwi', package_id: 'p1', quantity: 9, entry_date: '2026-10-13' }, // limonáda — ne
    ],
    prijmy: [{ kod: '11141', datum: '2026-10-08', mnozstvi: 4 }],
  });
  const t = naskladneniPoTydnech(v, piva, '2026-10-13', 3);

  it('týdny jsou od pondělí, nejnovější první, i prázdné', () => {
    expect(t.map((x) => x.od)).toEqual(['2026-10-12', '2026-10-05', '2026-09-28']);
    expect(t[0]).toMatchObject({ do: '2026-10-18', cislo: 42, celkem: 15 });
    expect(t[2].celkem).toBe(0);
  });

  it('po pivu a obalu, fasování i příjem, limonády ne', () => {
    expect(t[0].piva).toEqual([{ beer_id: 'b12', obaly: [{ package_id: 'p1', ks: 15 }], celkem: 15 }]);
    const minuly = t[1].piva[0];
    expect(minuly.obaly.sort((a, b) => a.package_id.localeCompare(b.package_id))).toEqual([{ package_id: 'p1', ks: 4 }, { package_id: 'p15', ks: 17 }]);
    expect(t[0].piva.some((p) => p.beer_id === 'kiwi')).toBe(false);
  });
});

describe('fasování bez kódu z pokladny se naskladní', () => {
  const v = vstup({
    inventury: [{ kod: '11141', datum: '2026-10-13', napocitano: 10 }],
    fasovani: [
      { beer_id: 'b12', package_id: 'p15', quantity: 17, entry_date: '2026-10-11' }, // před nulovým stavem — ne
      { beer_id: 'b12', package_id: 'p15', quantity: 6, entry_date: '2026-10-14' },
      { beer_id: 'b12', package_id: 'p1', quantity: 2, entry_date: '2026-10-14' },  // má zboží — řeší se klasicky
    ],
  });

  it('vznikne zboží bez kódu s nulou k datu nulového stavu a přibývá fasováním', () => {
    const rozsireny = sNafasovanymBezKodu(v, { piva, obaly });
    const novy = rozsireny.zbozi.find((z) => jeBezKodu(z.kod))!;
    expect(novy).toMatchObject({ nazev: '12° Světlá PET 1.5l', beer_id: 'b12', package_id: 'p15' });
    expect(stavySkladu(rozsireny, '2026-10-20').find((s) => s.kod === novy.kod)).toMatchObject({ stav: 6, fasovano: 6 });
    expect(stavySkladu(rozsireny, '2026-10-20').find((s) => s.kod === '11141')?.stav).toBe(12);
  });

  it('bez nulového stavu nebo bez nového fasování se nic nepřidá, limonáda taky ne', () => {
    expect(sNafasovanymBezKodu(vstup(), { piva, obaly }).zbozi).toHaveLength(1);
    const limo = vstup({ inventury: v.inventury, fasovani: [{ beer_id: 'kiwi', package_id: 'p1', quantity: 5, entry_date: '2026-10-14' }] });
    expect(sNafasovanymBezKodu(limo, { piva, obaly }).zbozi).toHaveLength(1);
  });
});
