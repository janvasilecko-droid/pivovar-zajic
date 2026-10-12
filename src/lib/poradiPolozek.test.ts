import { describe, it, expect } from 'vitest';
import { poradiPolozekObjednavky } from './poradiPolozek';

const obaly = [
  { id: 'k50', kind: 'keg', volume_l: 50, label: ' 50l' },
  { id: 'k30', kind: 'keg', volume_l: 30, label: '30l' },
  { id: 'k15', kind: 'keg', volume_l: 15, label: ' 15l' },
  { id: 'k10', kind: 'keg', volume_l: 10, label: ' 10l' },
  { id: 'p15', kind: 'bottle', volume_l: 1.5, label: '1.5l' },
  { id: 'p1', kind: 'bottle', volume_l: 1, label: '1l' },
  { id: 'p05', kind: 'bottle', volume_l: 0.5, label: '0.5l' },
];
const pol = (id: string, pkg: string, pivo: string) => ({ id, package_id: pkg, package_label: null, beer_name: pivo });

describe('Pořadí položek objednávky: sudy, pak lahve, od největšího obalu', () => {
  it('objednávka Malešic (12. 10. 2026)', () => {
    const items = [
      pol('1', 'k30', '12° Světlá'), pol('2', 'k30', 'Jantar'), pol('3', 'k50', '12° Světlá'),
      pol('4', 'p05', '12° Světlá'), pol('5', 'p05', 'Jantar'), pol('6', 'p15', '12° Světlá'),
    ];
    expect(poradiPolozekObjednavky(items, obaly).map((i) => i.id)).toEqual(['3', '1', '2', '6', '4', '5']);
  });

  it('1,5l je před 1l a před 0,5l (ne podle textu štítku)', () => {
    const items = [pol('a', 'p05', 'X'), pol('b', 'p1', 'X'), pol('c', 'p15', 'X'), pol('d', 'k10', 'X'), pol('e', 'k15', 'X')];
    expect(poradiPolozekObjednavky(items, obaly).map((i) => i.id)).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('bez obalu v katalogu se objem čte ze štítku položky a leží mezi lahvemi', () => {
    const items = [{ id: 'x', package_id: null, package_label: '30l', beer_name: 'A' }, pol('y', 'p1', 'A')];
    expect(poradiPolozekObjednavky(items, obaly).map((i) => i.id)).toEqual(['x', 'y']);
  });

  it('pořadí nezávisí na pořadí z databáze', () => {
    const a = [pol('2', 'k30', 'B'), pol('1', 'k30', 'A')];
    expect(poradiPolozekObjednavky(a, obaly).map((i) => i.id)).toEqual(['1', '2']);
    expect(poradiPolozekObjednavky([...a].reverse(), obaly).map((i) => i.id)).toEqual(['1', '2']);
  });
});
