import { describe, expect, it } from 'vitest';
import { nejvetsiTank, odpojPrecerpane, radkyBezTanku, tankRadku, tankyProPivo } from './tankUZapisu';

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

describe('odpojPrecerpane', () => {
  const tanky = [
    { id: 't1', label: 'Tank 1', current_volume_l: 3000 },
    { id: 't2', label: 'Tank 2', current_volume_l: 7000 },
  ];
  const radek = (tank: string | null, l: number | null) => ({ cellar_tank_id: tank, source_volume_l: l });

  it('co se do tanku vejde, zůstává beze změny', () => {
    const r = odpojPrecerpane([radek('t1', 2000), radek('t2', 500)], tanky);
    expect(r.precerpane).toEqual([]);
    expect(r.radky[0]).toEqual(radek('t1', 2000));
  });

  it('přečerpaný tank: řádky se uloží bez tanku a bez litrů, ostatní zůstanou', () => {
    const r = odpojPrecerpane([radek('t1', 2000), radek('t1', 2000), radek('t2', 500)], tanky);
    expect(r.precerpane).toEqual([{ tankId: 't1', label: 'Tank 1', vTankuL: 3000, chceL: 4000 }]);
    expect(r.radky[0]).toEqual(radek(null, null));
    expect(r.radky[1]).toEqual(radek(null, null));
    expect(r.radky[2]).toEqual(radek('t2', 500));
  });

  it('do litru navíc se nepočítá jako přečerpání (zaokrouhlení)', () => {
    expect(odpojPrecerpane([radek('t1', 3000.5)], tanky).precerpane).toEqual([]);
  });
});
