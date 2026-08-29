// Z provozu 29. 8. 2026: „čtu objednávky a parsování z restaurace je úplně
// špatně, všude to píše Osma."
//
// Skutečná zpráva (whatsapp_incoming, 28. 8.):
//   „Restaurace 1x50 12, 1x50 10 a 1x50 tm, terasa 2x50 12 2x50 osma"
// Uložilo se z ní pět položek se SPRÁVNÝMI stupni (12°, 10°, 12°, 12°, 8°),
// ale u všech pěti beer_name „Osma".
//
// Příčina: celá zpráva je jeden řádek, takže všech pět položek od AI dostalo
// stejný raw_line — celý text. Pivo se hledá z raw_line a hledání dává
// přednost přímé shodě názvu piva kdekoli v textu (aby „Jantar" nepřebila
// obecná pravidla podle stupně). Slovo „osma" na konci řádku tak vyhrálo
// úplně u všech položek, včetně těch, které mají vlastní stupeň 12° a 10°.
import { describe, it, expect } from 'vitest';
import { parseGeminiItems, emptyAliasMap, type GeminiItem } from './orderParser';

// Katalog jako v produkci — pozor, Osma má stupeň zapsaný bez znaku °.
const beers: any[] = [
  { id: 'b-jantar', name: 'Jantar', degree: null, color: null, is_active: true },
  { id: 'b-tmava', name: '12° Tmavá', degree: '12°', color: 'tmavé', is_active: true },
  { id: 'b-11', name: '11° Světlá', degree: '11°', color: 'světlé', is_active: true },
  { id: 'b-10', name: '10° Desítka', degree: '10°', color: 'světlé', is_active: true },
  { id: 'b-summer', name: 'Summer Ale', degree: null, color: null, is_active: true },
  { id: 'b-osma', name: 'Osma', degree: '8', color: 'světlé', is_active: true },
  { id: 'b-12', name: '12° Světlá', degree: '12°', color: 'světlé', is_active: true },
];
const packages: any[] = [
  { id: 'p-50', label: 'KEG 50l', kind: 'keg', volume_l: 50 },
  { id: 'p-30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
];

const RADEK = 'Restaurace 1x50 12, 1x50 10 a 1x50 tm, terasa 2x50 12 2x50 osma';

/** Pět položek tak, jak je vrátí AI: správné stupně, ale společný raw_line. */
function polozky(): GeminiItem[] {
  return [
    { quantity: 1, degree: '12°', beer_name: null, package_label: 'KEG 50l', raw_line: RADEK, place_name: 'Restaurace' },
    { quantity: 1, degree: '10°', beer_name: null, package_label: 'KEG 50l', raw_line: RADEK, place_name: 'Restaurace' },
    { quantity: 1, degree: '12°', beer_name: '12° Tmavá', package_label: 'KEG 50l', raw_line: RADEK, place_name: 'Restaurace' },
    { quantity: 2, degree: '12°', beer_name: null, package_label: 'KEG 50l', raw_line: RADEK, place_name: 'terasa' },
    { quantity: 2, degree: '8°', beer_name: null, package_label: 'KEG 50l', raw_line: RADEK, place_name: 'terasa' },
  ];
}

describe('Jeden řádek, víc objednávek — pivo se nesmí vzít z cizí položky', () => {
  it('„osma" na konci řádku nepřepíše piva ostatních položek', () => {
    const vysledek = parseGeminiItems(polozky(), beers, packages, emptyAliasMap());
    const jmena = vysledek.map((r) => r.beer_name ?? null);

    // Osma smí být právě u té jediné položky, která má stupeň 8°.
    expect(jmena.filter((j) => j === 'Osma')).toHaveLength(1);
    expect(jmena[4]).toBe('Osma');
  });

  it('každá položka dostane pivo podle svého vlastního stupně', () => {
    const vysledek = parseGeminiItems(polozky(), beers, packages, emptyAliasMap());
    const jmena = vysledek.map((r) => r.beer_name ?? null);

    expect(jmena[0]).toBe('12° Světlá');
    expect(jmena[1]).toBe('10° Desítka');
    expect(jmena[2]).toBe('12° Tmavá');
    expect(jmena[3]).toBe('12° Světlá');
    expect(jmena[4]).toBe('Osma');
  });
});
