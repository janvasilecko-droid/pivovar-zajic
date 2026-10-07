import { describe, expect, it } from 'vitest';
import { jeZnackaRezu, litryRezu, popisRezu, prepocetRezu, problemyRezu, rozdelRez, tankyKRezu, znackaRezu } from './rezani';

const tank = (id: string, objem: number, status = 'active') => ({ id, label: `Tank ${id}`, status, current_volume_l: objem });

describe('řezání ze dvou tanků', () => {
  it('rozdělí litry podle poměru a součet sedí přesně', () => {
    expect(rozdelRez(100, 60)).toEqual({ aL: 60, bL: 40 });
    expect(rozdelRez(50, 33)).toEqual({ aL: 16.5, bL: 33.5 });
    const { aL, bL } = rozdelRez(30, 33);
    expect(Math.round((aL + bL) * 10) / 10).toBe(30);
  });

  it('nabízí jen tanky v provozu s pivem', () => {
    const t = tankyKRezu([tank('2', 100), tank('1', 0), tank('3', 50, 'cleaning'), tank('10', 5, 'emptying')]);
    expect(t.map((x) => x.id)).toEqual(['2', '10']);
  });

  it('sečte litry ze sudů', () => {
    expect(litryRezu([{ pocet: 2, objemL: 50 }, { pocet: 3, objemL: 30 }, { pocet: 0, objemL: 20 }])).toBe(190);
  });

  it('neuloží řez bez piva, se stejným tankem nebo bez sudů', () => {
    expect(problemyRezu({ pivoId: '', tankA: tank('1', 100), tankB: tank('2', 100), podilA: 50, radky: [{ pocet: 1, objemL: 50 }] })).toHaveLength(1);
    expect(problemyRezu({ pivoId: 'p', tankA: tank('1', 100), tankB: tank('1', 100), podilA: 50, radky: [{ pocet: 1, objemL: 50 }] })[0]).toMatch(/různé/);
    expect(problemyRezu({ pivoId: 'p', tankA: tank('1', 100), tankB: tank('2', 100), podilA: 50, radky: [] })[0]).toMatch(/sudů/);
    expect(problemyRezu({ pivoId: 'p', tankA: tank('1', 100), tankB: tank('2', 100), podilA: 100, radky: [{ pocet: 1, objemL: 50 }] })[0]).toMatch(/Poměr/);
  });

  it('neuloží řez, který by přečerpal tank', () => {
    const p = problemyRezu({ pivoId: 'p', tankA: tank('1', 1000), tankB: tank('2', 30), podilA: 60, radky: [{ pocet: 2, objemL: 50 }] });
    expect(p).toEqual(['Tank 2 by se přečerpal (v tanku 30 l, chce se 40 l).']);
    expect(problemyRezu({ pivoId: 'p', tankA: tank('1', 60), tankB: tank('2', 40), podilA: 60, radky: [{ pocet: 2, objemL: 50 }] })).toEqual([]);
  });

  it('značka a popis', () => {
    expect(znackaRezu('abc')).toBe('[rez:abc]');
    expect(jeZnackaRezu('Do řezu: x [rez:abc]')).toBe(true);
    expect(jeZnackaRezu('Do Jantaru [jantar:abc]')).toBe(false);
    expect(popisRezu('Tank 1', 'Tank 2', 70)).toBe('Řez: Tank 1 70 % + Tank 2 30 %');
  });

  it('úprava řádku drží původní poměr', () => {
    // 2× 50 l v poměru 60/40 → B 40 l; změna na 3× 50 l → B 60 l, A 90 l.
    expect(prepocetRezu({ staryPocet: 2, staryObjemL: 50, prelitoBL: 40, novyPocet: 3, novyObjemL: 50 })).toEqual({ aL: 90, bL: 60 });
    // Změna obalu: 2× 30 l → 60 l, B 40 % = 24 l.
    expect(prepocetRezu({ staryPocet: 2, staryObjemL: 50, prelitoBL: 40, novyPocet: 2, novyObjemL: 30 })).toEqual({ aL: 36, bL: 24 });
    expect(prepocetRezu({ staryPocet: 0, staryObjemL: 50, prelitoBL: 0, novyPocet: 2, novyObjemL: 30 })).toBeNull();
  });
});
