import { describe, expect, it } from 'vitest';
import { nejvetsiTank, radkyBezTanku, tankRadku, tankyProPivo } from './tankUZapisu';

const SVETLA = 'b-svetla';
const TMAVA = 'b-tmava';

const tank = (id: string, beer: string | null, extra: Record<string, unknown> = {}) => ({
  id, current_beer_id: beer, kegging_active: true, status: 'emptying', current_volume_l: 1000, ...extra,
});

describe('ze kterého tanku se stáčí', () => {
  it('vezme tank s daným pivem, na kterém je zahájené stáčení', () => {
    const tanky = [tank('t1', SVETLA), tank('t2', TMAVA)];
    expect(tankRadku(tanky, SVETLA)?.id).toBe('t1');
  });

  it('tank bez zahájeného stáčení se nenabídne — z toho se neodečítá', () => {
    expect(tankyProPivo([tank('t1', SVETLA, { kegging_active: false })], SVETLA)).toEqual([]);
  });

  it('ani tank, který se zrovna sanituje', () => {
    expect(tankyProPivo([tank('t1', SVETLA, { status: 'sanitizing' })], SVETLA)).toEqual([]);
  });

  it('při dvou tancích téhož piva vyhraje větší objem', () => {
    const tanky = [tank('maly', SVETLA, { current_volume_l: 300 }), tank('velky', SVETLA, { current_volume_l: 5000 })];
    expect(nejvetsiTank(tanky)?.id).toBe('velky');
    expect(tankRadku(tanky, SVETLA)?.id).toBe('velky');
  });

  it('ručně vybraný tank má přednost před největším', () => {
    const tanky = [tank('maly', SVETLA, { current_volume_l: 300 }), tank('velky', SVETLA, { current_volume_l: 5000 })];
    expect(tankRadku(tanky, SVETLA, 'maly')?.id).toBe('maly');
  });

  it('ale ručně vybraný tank, ze kterého se už nestáčí, se nepoužije', () => {
    // Jinak by řádek propadl s odkazem na tank, ze kterého se objem neodečte.
    const tanky = [tank('skoncil', SVETLA, { kegging_active: false }), tank('bezi', SVETLA)];
    expect(tankRadku(tanky, SVETLA, 'skoncil')?.id).toBe('bezi');
  });

  it('pro pivo bez tanku nevrátí nic', () => {
    expect(tankRadku([tank('t1', TMAVA)], SVETLA)).toBeUndefined();
  });
});

describe('řádky, které by se uložily bez tanku', () => {
  // Přesně tyhle se dřív uložily tiše — a spolu s číslem tanku zmizel i odečet
  // objemu ze sklepa.
  const tanky = [tank('t1', SVETLA)];
  const radky = [
    { beerId: SVETLA, qty: '5', tankId: null },
    { beerId: TMAVA, qty: '3', tankId: null },
    { beerId: TMAVA, qty: '0', tankId: null },
    { beerId: '', qty: '2', tankId: null },
  ];

  it('najde jen ty vyplněné, pro které tank není', () => {
    const bez = radkyBezTanku(radky, tanky, (r) => r.tankId);
    expect(bez.map((r) => r.beerId)).toEqual([TMAVA, '']);
  });

  it('když tanky sedí, nevrátí nic', () => {
    expect(radkyBezTanku([{ beerId: SVETLA, qty: '5', tankId: null }], tanky, (r) => r.tankId)).toEqual([]);
  });
});
