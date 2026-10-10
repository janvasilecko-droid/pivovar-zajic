import { describe, expect, it } from 'vitest';
import { jeZnackaRezu, litryRezu, popisRezu, prepocetRezu, problemyRezu, rozdelPodilB, rozdelRez, tankyKRezu, znackaRezu } from './rezani';

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

// 10. 10. 2026: „vyřezal jsem 11ku z 12ky (z tanku) a z 10ky, ale část 10ky šla ze sudů
// 1×30, 1×20 a 1×15, které mám na skladě — nevím, jak to zapsat."
describe('řezání se sudy ze skladu jako částí podílu B', () => {
  const tankA = { id: 'a', label: 'Tank 12°', status: 'active', current_volume_l: 800 };
  const tankB = { id: 'b', label: 'Tank 10°', status: 'active', current_volume_l: 300 };
  // 2× KEG 50 l + 1× KEG 30 l = 130 l
  const radky = [{ pocet: 2, objemL: 50 }, { pocet: 1, objemL: 30 }];
  const sudy65 = { litry: 65, pivoId: 'b10' }; // 30 + 20 + 15 l

  it('rozdělí podíl B na sudy ze skladu a zbytek z tanku', () => {
    expect(rozdelPodilB(78, 65)).toEqual({ sudyL: 65, tankBL: 13 });
    expect(rozdelPodilB(65, 65)).toEqual({ sudyL: 65, tankBL: 0 });
    // sudy dávají víc než podíl B → z tanku se nebere nic
    expect(rozdelPodilB(50, 65)).toEqual({ sudyL: 65, tankBL: 0 });
  });

  it('tvůj případ: 12° z tanku, 10° jen ze sudů 30+20+15 l — tank B není potřeba', () => {
    expect(problemyRezu({ pivoId: 'b11', tankA, podilA: 50, radky, sudy: sudy65 })).toEqual([]);
  });

  it('bez sudů se pořád vyžadují oba tanky (původní chování)', () => {
    expect(problemyRezu({ pivoId: 'b11', tankA, podilA: 50, radky })).toContain('Vyber oba tanky.');
  });

  it('sudy ze skladu bez piva se neuloží', () => {
    expect(problemyRezu({ pivoId: 'b11', tankA, podilA: 50, radky, sudy: { litry: 65, pivoId: '' } }))
      .toContain('Vyber pivo, ze kterého jsou sudy ze skladu.');
  });

  it('sudů je víc než podíl B → chyba s čísly', () => {
    const chyby = problemyRezu({ pivoId: 'b11', tankA, podilA: 50, radky: [{ pocet: 2, objemL: 50 }], sudy: sudy65 });
    expect(chyby).toEqual(['Sudy ze skladu (65 l) jsou víc než podíl B (50 l) — uprav poměr nebo počet sudů.']);
  });

  it('sudy nestačí na celý podíl B a tank B není vybraný → chybí zdroj', () => {
    // 40 % A = 52 l, B = 78 l, sudy 65 l → 13 l má jít z tanku B
    const chyby = problemyRezu({ pivoId: 'b11', tankA, podilA: 40, radky, sudy: sudy65 });
    expect(chyby).toHaveLength(1);
    expect(chyby[0]).toContain('zbývá 13 l');
    expect(chyby[0]).toContain('Vyber tank B');
  });

  it('zbytek podílu B z tanku: s tankem B to projde, a přečerpání se hlídá jen na ten zbytek', () => {
    expect(problemyRezu({ pivoId: 'b11', tankA, tankB, podilA: 40, radky, sudy: sudy65 })).toEqual([]);
    const maloVTanku = { ...tankB, current_volume_l: 5 };
    expect(problemyRezu({ pivoId: 'b11', tankA, tankB: maloVTanku, podilA: 40, radky, sudy: sudy65 }))
      .toEqual(['Tank 10° by se přečerpal (v tanku 5 l, chce se 13 l).']);
  });

  it('tank B jen o litr nebo míň mimo se toleruje (sudy jsou celé kusy)', () => {
    // A 50 % = 65, B = 65, sudy 64,5 l → zbývá 0,5 l, tank B netřeba
    expect(problemyRezu({ pivoId: 'b11', tankA, podilA: 50, radky, sudy: { litry: 64.5, pivoId: 'b10' } })).toEqual([]);
  });

  it('tank A se přečerpat nesmí ani se sudy', () => {
    const prazdny = { ...tankA, current_volume_l: 20 };
    expect(problemyRezu({ pivoId: 'b11', tankA: prazdny, podilA: 50, radky, sudy: sudy65 }))
      .toEqual(['Tank 12° by se přečerpal (v tanku 20 l, chce se 65 l).']);
  });

  it('popis řezu: se sudy bez tanku B, se sudy i tankem B, a beze sudů jako dřív', () => {
    expect(popisRezu('Tank 1', 'Tank 2', 60)).toBe('Řez: Tank 1 60 % + Tank 2 40 %');
    expect(popisRezu('Tank 1', null, 50, 65)).toBe('Řez: Tank 1 50 % + sudy ze skladu 50 % (65 l)');
    expect(popisRezu('Tank 1', 'Tank 2', 40, 65)).toBe('Řez: Tank 1 40 % + Tank 2 60 % (z toho sudy ze skladu 65 l)');
  });
});
