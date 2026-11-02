import { describe, it, expect } from 'vitest';
import { jeLimonada, idLimonad, bezLimonad, jenLimonady, souctyLimonad, jeLimonadaRadek } from './limonady';

// 2. 11. 2026 majitel: „do inventury a výstavu nikdy nepočítej Limonády citron
// kiwi višeň grep, počítej je zvlášť".

const KATALOG = [
  { id: 'd', name: '10° Desítka' }, { id: 's11', name: '11° Světlá' }, { id: 's12', name: '12° Světlá' },
  { id: 't12', name: '12° Tmavá' }, { id: 'j', name: 'Jantar' }, { id: 'o', name: 'Osma' },
  { id: 'sa', name: 'Summer Ale' }, { id: 'h', name: 'Hazy Spring Day' }, { id: 'w', name: 'winter' },
  { id: 'c', name: 'Citron' }, { id: 'g', name: 'Grep ' }, { id: 'k', name: 'Kiwi' }, { id: 'v', name: 'Višeň' },
];

describe('rozpoznání limonád v katalogu', () => {
  it('pozná přesně čtyři limonády, žádné skutečné pivo', () => {
    expect([...idLimonad(KATALOG)].sort()).toEqual(['c', 'g', 'k', 'v']);
  });
  it('pozná i tvar Višňová a prázdný katalog je bezpečně prázdný', () => {
    expect(jeLimonada('Višňová')).toBe(true);
    expect(idLimonad(null).size).toBe(0);
  });
});

describe('bezLimonad / jenLimonady', () => {
  const idL = idLimonad(KATALOG);
  const radky = [
    { beer_id: 's12', quantity: 5 }, { beer_id: 'c', quantity: 7 },
    { beer_id: 'neznamy', beer_name: 'Grep', quantity: 2 }, { beer_id: null, quantity: 1 },
  ];
  it('pivo zůstane, limonáda (podle id i jména na řádku) odejde', () => {
    expect(bezLimonad(radky, idL).map((r) => r.quantity)).toEqual([5, 1]);
    expect(jenLimonady(radky, idL).map((r) => r.quantity)).toEqual([7, 2]);
  });
  it('bez id pozná limonádu aspoň podle jména na řádku', () => {
    expect(jeLimonadaRadek({ beer_id: 'x', beer_name: 'Kiwi' }, new Set())).toBe(true);
    expect(jeLimonadaRadek({ beer_id: 'x', beer_name: 'Jantar' }, new Set())).toBe(false);
  });
});

describe('souctyLimonad', () => {
  const obaly = new Map([
    ['k30', { kind: 'keg', volume_l: 30 }],
    ['b05', { kind: 'bottle', volume_l: 0.5 }],
  ]);
  it('rozdělí sudy a lahve a spočítá litry zvlášť', () => {
    const s = souctyLimonad([
      { package_id: 'k30', quantity: 7 }, { package_id: 'b05', quantity: 280 }, { package_id: null, quantity: 1 },
    ], obaly);
    expect(s).toEqual({ sudyKs: 7, lahveKs: 280, ks: 288, litry: 350 });
  });
  it('prázdný vstup je nula', () => {
    expect(souctyLimonad([], obaly)).toEqual({ sudyKs: 0, lahveKs: 0, ks: 0, litry: 0 });
  });
});
