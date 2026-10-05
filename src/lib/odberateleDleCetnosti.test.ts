import { describe, it, expect } from 'vitest';
import { odberateleDleCetnosti } from './odberateleDleCetnosti';

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
