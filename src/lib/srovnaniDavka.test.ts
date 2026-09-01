import { describe, expect, it } from 'vitest';
import { davkySrovnani, rozdelSudyMeziRadky, zapisyDavky, type RadekSrovnani } from './srovnaniDavka';

const SV = { beer_id: 'b1', beer_name: '12° Světlá' };
const lahev = (label: string, volume: number, diffQty: number): RadekSrovnani => ({
  ...SV, package_id: `p${label}`, package_label: label,
  package_kind: 'bottle', package_volume: volume, diffQty,
});
const sud = (label: string, volume: number, diffQty: number): RadekSrovnani => ({
  ...SV, package_id: `k${label}`, package_label: label,
  package_kind: 'keg', package_volume: volume, diffQty,
});

describe('davkySrovnani', () => {
  it('sečte lahvové přebytky jednoho piva do litrů', () => {
    const d = davkySrovnani([lahev('1 L', 1, 781), lahev('0.5 L', 0.5, 111)]);
    expect(d[0].litryCelkem).toBe(836.5);
    expect(d[0].lahve.map((l) => l.kusy)).toEqual([781, 111]);
  });

  it('sudy počítá ze SOUČTU litrů, ne sečtením zaokrouhlených řádků', () => {
    // 1017,1 l ÷ 0,9 = 1130,1 ÷ 50 = 22,6 → 23. Po řádcích by vyšlo 25.
    const d = davkySrovnani([
      lahev('1.5 L', 1.5, 116), lahev('1 L', 1, 781),
      lahev('0.5 L', 0.5, 111), lahev('0.33 L', 0.33, 20),
    ]);
    expect(d[0].litryCelkem).toBe(1017.1);
    expect(d[0].orientacneSudu).toBe(23);
  });

  it('manko se nesbírá — nic se nevyrobilo', () => {
    expect(davkySrovnani([lahev('1 L', 1, -300)])).toEqual([]);
  });

  it('sudové řádky do lahvové dávky nepatří', () => {
    const d = davkySrovnani([lahev('1 L', 1, 100), sud('50 L', 50, 10)]);
    expect(d[0].lahve).toHaveLength(1);
  });

  it('piva se nemíchají a řadí se podle objemu', () => {
    const d = davkySrovnani([
      lahev('1 L', 1, 50),
      { beer_id: 'b2', beer_name: '11° Tmavá', package_id: 'x', package_label: '1 L', package_kind: 'bottle', package_volume: 1, diffQty: 900 },
    ]);
    expect(d.map((x) => x.beer_id)).toEqual(['b2', 'b1']);
  });

  it('lahev bez objemu se přeskočí', () => {
    const d = davkySrovnani([{ ...SV, package_id: 'x', package_label: '?', package_kind: 'bottle', diffQty: 100 }]);
    expect(d).toEqual([]);
  });
});

describe('rozdelSudyMeziRadky', () => {
  const lahve = [
    { package_id: 'a', package_label: '1 L', kusy: 800, litry: 800 },
    { package_id: 'b', package_label: '0.5 L', kusy: 400, litry: 200 },
  ];

  it('dělí poměrně podle litrů', () => {
    expect(rozdelSudyMeziRadky(lahve, { kegPkgId: 'k50', kegQty: 10, kegVolumeL: 50 })).toEqual([8, 2]);
  });

  it('součet sedí přesně i při nedělitelném počtu', () => {
    const r = rozdelSudyMeziRadky(lahve, { kegPkgId: 'k50', kegQty: 7, kegVolumeL: 50 });
    expect(r.reduce((s, x) => s + x, 0)).toBe(7);
  });

  it('jeden sud padne tam, kde je nejvíc piva', () => {
    expect(rozdelSudyMeziRadky(lahve, { kegPkgId: 'k50', kegQty: 1, kegVolumeL: 50 })).toEqual([1, 0]);
  });

  it('nula sudů nerozdělí nic', () => {
    expect(rozdelSudyMeziRadky(lahve, { kegPkgId: 'k50', kegQty: 0, kegVolumeL: 50 })).toEqual([0, 0]);
  });

  it('bez řádků nespadne', () => {
    expect(rozdelSudyMeziRadky([], { kegPkgId: 'k50', kegQty: 5, kegVolumeL: 50 })).toEqual([]);
  });
});

describe('zapisyDavky', () => {
  const davka = davkySrovnani([lahev('1 L', 1, 800), lahev('0.5 L', 0.5, 400)])[0];
  const D = '2026-08-31';

  it('bez sudů zapíše jen lahve a sklad sudů nechá být', () => {
    const r = zapisyDavky(davka, D, '2026-08', []);
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.kegs_used === null)).toBe(true);
    expect(r.reduce((s, x) => s + Number(x.quantity), 0)).toBe(1200);
  });

  it('součet lahví sedí na přebytek u každého obalu zvlášť', () => {
    const r = zapisyDavky(davka, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 15, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 5, kegVolumeL: 30 },
    ]);
    const proObal = (id: string) => r.filter((x) => x.package_id === id).reduce((s, x) => s + Number(x.quantity), 0);
    expect(proObal('p1 L')).toBe(800);
    expect(proObal('p0.5 L')).toBe(400);
  });

  it('součet sudů sedí přesně na zadané počty', () => {
    const r = zapisyDavky(davka, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 15, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 5, kegVolumeL: 30 },
    ]);
    const suduProObal = (id: string) => r.filter((x) => x.kegs_used_package_id === id)
      .reduce((s, x) => s + Number(x.kegs_used), 0);
    expect(suduProObal('k50')).toBe(15);
    expect(suduProObal('k30')).toBe(5);
  });

  it('poznámky se mezi řádky liší — jinak by je skladová kniha slila', () => {
    const r = zapisyDavky(davka, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 15, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 5, kegVolumeL: 30 },
    ]);
    const klice = r.map((x) => `${x.package_id}|${x.note}`);
    expect(new Set(klice).size).toBe(klice.length);
  });

  it('jedna velikost sudu = jeden řádek na obal', () => {
    const r = zapisyDavky(davka, D, '2026-08', [{ kegPkgId: 'k50', kegQty: 20, kegVolumeL: 50 }]);
    expect(r).toHaveLength(2);
    expect(r.reduce((s, x) => s + Number(x.kegs_used), 0)).toBe(20);
  });

  it('nulové skupiny se ignorují', () => {
    const r = zapisyDavky(davka, D, '2026-08', [{ kegPkgId: 'k50', kegQty: 0, kegVolumeL: 50 }]);
    expect(r.every((x) => x.kegs_used === null)).toBe(true);
  });
});
