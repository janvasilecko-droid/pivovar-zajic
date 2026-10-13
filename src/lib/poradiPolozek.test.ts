import { describe, it, expect } from 'vitest';
import { poradiPolozekObjednavky } from './poradiPolozek';

const obaly = [
  { id: 'k50', kind: 'keg', volume_l: 50, label: ' 50l', sort_order: 1 },
  { id: 'k30', kind: 'keg', volume_l: 30, label: '30l', sort_order: 2 },
  { id: 'k15', kind: 'keg', volume_l: 15, label: ' 15l', sort_order: 4 },
  { id: 'k10', kind: 'keg', volume_l: 10, label: ' 10l', sort_order: 5 },
  { id: 'p15', kind: 'bottle', volume_l: 1.5, label: '1.5l', sort_order: 6 },
  { id: 'p1', kind: 'bottle', volume_l: 1, label: '1l', sort_order: 7 },
  { id: 'p05', kind: 'bottle', volume_l: 0.5, label: '0.5l', sort_order: 8 },
];
const piva = [
  { id: 's12', name: '12° Světlá', sort_order: 1 },
  { id: 's11', name: '11° Světlá', sort_order: 2 },
  { id: 'des', name: '10° Desítka', sort_order: 3 },
  { id: 'jan', name: 'Jantar', sort_order: 5 },
  { id: 'win', name: 'winter', sort_order: 7 },
];
const pol = (id: string, beer: string | null, pkg: string | null, jmeno = '') => ({ id, beer_id: beer, package_id: pkg, package_label: null, beer_name: jmeno });

describe('Pořadí položek objednávky: podle piv a velikosti obalu, jako v katalogu', () => {
  it('objednávka Malešic (12. 10. 2026): pivo po pivu, v něm sudy a lahve od největšího', () => {
    const items = [
      pol('1', 's12', 'k30'), pol('2', 'jan', 'k30'), pol('3', 's12', 'k50'),
      pol('4', 's12', 'p05'), pol('5', 'jan', 'p05'), pol('6', 's12', 'p15'),
    ];
    expect(poradiPolozekObjednavky(items, obaly, piva).map((i) => i.id)).toEqual(['3', '1', '6', '4', '2', '5']);
  });

  it('objednávka Jony: 12°, 11°, 10°, Jantar, winter — každé pivo celé pohromadě', () => {
    const items = [
      pol('a', 's11', 'p1'), pol('b', 'win', 'k15'), pol('c', 's12', 'k15'), pol('d', 'des', 'p1'),
      pol('e', 's11', 'k10'), pol('f', 's11', 'p15'), pol('g', 'jan', 'p1'), pol('h', 's12', 'p1'),
    ];
    expect(poradiPolozekObjednavky(items, obaly, piva).map((i) => i.id)).toEqual(['c', 'h', 'e', 'f', 'a', 'd', 'g', 'b']);
  });

  it('1,5l je před 1l a před 0,5l (ne podle textu štítku)', () => {
    const items = [pol('a', 's12', 'p05'), pol('b', 's12', 'p1'), pol('c', 's12', 'p15')];
    expect(poradiPolozekObjednavky(items, obaly, piva).map((i) => i.id)).toEqual(['c', 'b', 'a']);
  });

  it('pivo mimo katalog a bez piva jde nakonec; bez pořadí obalu rozhoduje druh a velikost', () => {
    const items = [pol('x', null, 'k30', 'Cizí'), pol('y', 's12', 'p1')];
    expect(poradiPolozekObjednavky(items, obaly, piva).map((i) => i.id)).toEqual(['y', 'x']);
    const bez = [{ id: 'k20', kind: 'keg', volume_l: 20, label: '20l' }, { id: 'l1', kind: 'bottle', volume_l: 1, label: '1l' }, { id: 'k5', kind: 'keg', volume_l: 5, label: '5l' }];
    const it2 = [pol('1', 's12', 'l1'), pol('2', 's12', 'k5'), pol('3', 's12', 'k20')];
    expect(poradiPolozekObjednavky(it2, bez, piva).map((i) => i.id)).toEqual(['3', '2', '1']);
  });

  it('pořadí nezávisí na pořadí z databáze', () => {
    const a = [pol('2', 's12', 'k30'), pol('1', 's12', 'k30')];
    expect(poradiPolozekObjednavky(a, obaly, piva).map((i) => i.id)).toEqual(['1', '2']);
    expect(poradiPolozekObjednavky([...a].reverse(), obaly, piva).map((i) => i.id)).toEqual(['1', '2']);
  });
});
