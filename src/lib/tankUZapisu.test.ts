import { describe, expect, it } from 'vitest';
import { cekaNaTank, nejvetsiTank, odpojPrecerpane, radkyBezTanku, tankRadku, tankyProPivo } from './tankUZapisu';

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

// Seznam na záložce „Stáčení bez tanku" i číslo na ní se řídí jednou funkcí.
describe('cekaNaTank — co čeká na přiřazení k tanku', () => {
  const OD = '2026-10-01';
  const radek = (extra: Record<string, unknown> = {}) =>
    ({ entry_date: '2026-10-14', beer_id: SVETLA, beer_name: '12° Světlá', quantity: 6, cellar_tank_id: null, ...extra });

  it('pivo bez tanku, s kusy a z nedávné doby čeká', () => {
    expect(cekaNaTank(radek(), OD)).toBe(true);
  });

  it('s tankem, bez piva, bez kusů nebo starší než hranice nečeká', () => {
    expect(cekaNaTank(radek({ cellar_tank_id: 't1' }), OD)).toBe(false);
    expect(cekaNaTank(radek({ beer_id: null }), OD)).toBe(false);
    expect(cekaNaTank(radek({ quantity: 0 }), OD)).toBe(false);
    expect(cekaNaTank(radek({ quantity: null }), OD)).toBe(false);
    expect(cekaNaTank(radek({ entry_date: '2026-09-30' }), OD)).toBe(false);
  });

  it('hranice `od` platí včetně (stáčení přesně v ten den ještě čeká)', () => {
    expect(cekaNaTank(radek({ entry_date: OD }), OD)).toBe(true);
  });

  it('limonáda (Citron) tank nemá, takže nečeká — podle jména ze zápisu', () => {
    expect(cekaNaTank(radek({ beer_id: 'cit', beer_name: 'Citron' }), OD)).toBe(false);
    expect(cekaNaTank(radek({ beer_id: 'grep', beer_name: 'Grep' }), OD)).toBe(false);
  });

  it('zápis bez jména piva se dohledá v katalogu: limonáda nečeká, pivo ano', () => {
    const katalog = (id: string) => ({ cit: 'Citron', des: '10° Desítka' } as Record<string, string>)[id];
    expect(cekaNaTank(radek({ beer_id: 'cit', beer_name: null }), OD, katalog)).toBe(false);
    expect(cekaNaTank(radek({ beer_id: 'des', beer_name: null }), OD, katalog)).toBe(true);
  });

  it('jméno ze zápisu má přednost před katalogem', () => {
    expect(cekaNaTank(radek({ beer_id: 'des', beer_name: 'Citron' }), OD, () => '10° Desítka')).toBe(false);
  });

  it('pivo, které nikde nenajde, se hlásí (nehádá se, že je to limonáda)', () => {
    expect(cekaNaTank(radek({ beer_id: 'x', beer_name: null }), OD, () => undefined)).toBe(true);
    expect(cekaNaTank(radek({ beer_id: 'x', beer_name: null }), OD)).toBe(true);
  });

  it('množství může být i text z databáze', () => {
    expect(cekaNaTank(radek({ quantity: '3' }), OD)).toBe(true);
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
