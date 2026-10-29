import { describe, it, expect } from 'vitest';
import { odberateleAbecedne, odberateleDleCetnosti } from './odberateleDleCetnosti';

describe('odběratelé od nejčastěji používaných', () => {
  const mista = [
    { id: 'a', name: 'Louka' },
    { id: 'b', name: 'Maneo' },
    { id: 'c', name: 'Čertovka' },
  ];

  it('řadí podle počtu objednávek, storno se nepočítá, bez id podle jména', () => {
    const serazene = odberateleDleCetnosti(mista, [
      { place_id: 'b', place_name: 'Maneo' },
      { place_id: null, place_name: 'maneo' },
      { place_id: 'a', place_name: 'Louka' },
      { place_id: 'a', place_name: 'Louka', status: 'storno' },
      { place_id: 'a', place_name: 'Louka', status: 'storno' },
    ]);
    expect(serazene.map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('při shodě abecedně (česky)', () => {
    expect(odberateleDleCetnosti(mista, []).map((m) => m.name)).toEqual(['Čertovka', 'Louka', 'Maneo']);
  });
});

describe('odběratelé podle abecedy', () => {
  const jmena = (n: string[]) => n.map((name, i) => ({ id: String(i), name }));

  it('česká abeceda: velikost písmen nehraje roli, CH je za H, háčky na svém místě, číslice první', () => {
    const serazene = odberateleAbecedne(jmena([
      'Zizkov', 'Šimáček', 'Sedláčková', 'Řeka', 'Radek', 'CHmeloun', 'Hrad', 'Čertovka',
      'Ivo', 'Maneo', 'MARTIN', 'Mates Rybárna', 'petr', 'Petr moravcik prodejna', '7 stupnu Karlin',
    ]));
    expect(serazene.map((m) => m.name)).toEqual([
      '7 stupnu Karlin', 'Čertovka', 'Hrad', 'CHmeloun', 'Ivo', 'Maneo', 'MARTIN', 'Mates Rybárna',
      'petr', 'Petr moravcik prodejna', 'Radek', 'Řeka', 'Sedláčková', 'Šimáček', 'Zizkov',
    ]);
  });

  it('mezera na začátku jména odběratele neodsune na začátek seznamu', () => {
    expect(odberateleAbecedne(jmena([' Martin', 'Maneo', 'Zizkov'])).map((m) => m.name.trim()))
      .toEqual(['Maneo', 'Martin', 'Zizkov']);
  });

  it('nemění vstupní pole', () => {
    const vstup = jmena(['B', 'A']);
    odberateleAbecedne(vstup);
    expect(vstup.map((m) => m.name)).toEqual(['B', 'A']);
  });
});
