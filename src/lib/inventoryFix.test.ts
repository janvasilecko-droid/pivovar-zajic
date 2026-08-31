import { describe, expect, it } from 'vitest';
import { akceProRozdil, datumDoplnku, jeSud, nabidnoutMinulyMesic, nazevMesice, planDostaceni, stoceniZapis, type InventuraPolozka } from './inventoryFix';

const lahev: InventuraPolozka = {
  beer_id: 'b1', beer_name: 'Ležák 12°',
  package_id: 'p1', package_label: 'Lahev 0,5 l', package_kind: 'bottle',
  diffQty: 0,
};
const sud: InventuraPolozka = {
  beer_id: 'b2', beer_name: 'Světlé 11°',
  package_id: 'p2', package_label: 'KEG 50 l', package_kind: 'keg',
  diffQty: 0,
};

describe('akceProRozdil', () => {
  it('přebytek se dopisuje do stáčení, manko se plánuje', () => {
    expect(akceProRozdil(48)).toBe('zapsat_staceni');
    expect(akceProRozdil(-12)).toBe('naplanovat');
    expect(akceProRozdil(0)).toBe('zadna');
  });
});

describe('jeSud', () => {
  it('rozhoduje podle kind', () => {
    expect(jeSud('keg', 'KEG 50 l')).toBe(true);
    expect(jeSud('bottle', 'Lahev 0,5 l')).toBe(false);
  });

  it('u obalů bez vyplněného druhu sáhne po popisku', () => {
    expect(jeSud(null, 'Sud 30 l')).toBe(true);
    expect(jeSud(undefined, 'keg 20l')).toBe(true);
    expect(jeSud(undefined, 'Lahev 0,33')).toBe(false);
  });
});

describe('datumDoplnku', () => {
  it('vždy poslední den inventovaného měsíce', () => {
    expect(datumDoplnku('2026-07')).toBe('2026-07-31');
    expect(datumDoplnku('2026-08')).toBe('2026-08-31');
    expect(datumDoplnku('2026-04')).toBe('2026-04-30');
  });

  it('zvládne únor i přestupný rok', () => {
    expect(datumDoplnku('2026-02')).toBe('2026-02-28');
    expect(datumDoplnku('2028-02')).toBe('2028-02-29');
  });

  it('nezáleží na tom, kdy se inventura doklikala', () => {
    expect(datumDoplnku('2026-12')).toBe('2026-12-31');
  });

  // Pravidlo od uživatele: rozhoduje INVENTOVANÝ měsíc, ne den zápisu.
  // Inventura za srpen se připíše k srpnu, ať se dodělá 31. 8. nebo 3. 9.
  it('inventura za srpen dodělaná v září pořád patří k srpnu', () => {
    expect(datumDoplnku('2026-08')).toBe('2026-08-31');
  });
});

describe('nazevMesice', () => {
  it('píše měsíc česky, ať je omyl vidět', () => {
    expect(nazevMesice('2026-08')).toBe('srpen 2026');
    expect(nazevMesice('2026-01')).toBe('leden 2026');
    expect(nazevMesice('2026-12')).toBe('prosinec 2026');
  });
});

describe('nabidnoutMinulyMesic', () => {
  it('první dny měsíce upozorní, že jde nejspíš o ten minulý', () => {
    expect(nabidnoutMinulyMesic('2026-09', '2026-09-03')).toBe('2026-08');
    expect(nabidnoutMinulyMesic('2026-01', '2026-01-02')).toBe('2025-12');
  });

  it('mlčí, když je vybraný jiný měsíc než dnešní', () => {
    expect(nabidnoutMinulyMesic('2026-08', '2026-09-03')).toBeNull();
  });

  it('mlčí i v druhé polovině měsíce — to už se počítá ten probíhající', () => {
    expect(nabidnoutMinulyMesic('2026-09', '2026-09-20')).toBeNull();
  });
});

describe('stoceniZapis (přebytek)', () => {
  it('lahve jdou do bottling', () => {
    const z = stoceniZapis({ ...lahev, diffQty: 48 }, '2026-08-31', '2026-08');
    expect(z?.table).toBe('bottling');
    expect(z?.row.quantity).toBe(48);
    expect(z?.row.beer_id).toBe('b1');
    expect(z?.row.entry_date).toBe('2026-08-31');
    expect(z?.row.note).toContain('inventury 2026-08');
  });

  it('sudy jdou do kegging', () => {
    const z = stoceniZapis({ ...sud, diffQty: 7 }, '2026-08-31', '2026-08');
    expect(z?.table).toBe('kegging');
    expect(z?.row.quantity).toBe(7);
  });

  it('nevyplňuje zdroj — jinak by srovnání jednoho rozdílu vyrobilo další', () => {
    const lahve = stoceniZapis({ ...lahev, diffQty: 48 }, '2026-08-31', '2026-08');
    expect(lahve?.row.kegs_used).toBeNull();
    expect(lahve?.row.kegs_used_package_id).toBeNull();
    expect(lahve?.row.source_volume_l).toBeNull();

    const sudy = stoceniZapis({ ...sud, diffQty: 7 }, '2026-08-31', '2026-08');
    expect(sudy?.row.cellar_tank_id).toBeNull();
    expect(sudy?.row.source_volume_l).toBeNull();
  });

  it('u manka ani nuly nevznikne žádný zápis výroby', () => {
    expect(stoceniZapis({ ...lahev, diffQty: -5 }, '2026-08-31', '2026-08')).toBeNull();
    expect(stoceniZapis({ ...lahev, diffQty: 0 }, '2026-08-31', '2026-08')).toBeNull();
  });
});

describe('planDostaceni (manko)', () => {
  it('chybějící lahve jdou do lahvové části úkolu', () => {
    const p = planDostaceni({ ...lahev, diffQty: -48 }, '2026-08-31', '2026-08');
    expect(p?.pkg_id).toBe('p1');
    expect(p?.qty).toBe(48);
    expect(p?.keg_pkg_id).toBeNull();
    expect(p?.keg_qty).toBe(0);
  });

  it('chybějící sudy jdou do sudové části úkolu', () => {
    const p = planDostaceni({ ...sud, diffQty: -12 }, '2026-08-31', '2026-08');
    expect(p?.keg_pkg_id).toBe('p2');
    expect(p?.keg_qty).toBe(12);
    expect(p?.pkg_id).toBeNull();
    expect(p?.qty).toBe(0);
  });

  it('u přebytku ani nuly nevznikne úkol', () => {
    expect(planDostaceni({ ...sud, diffQty: 3 }, '2026-08-31', '2026-08')).toBeNull();
    expect(planDostaceni({ ...sud, diffQty: 0 }, '2026-08-31', '2026-08')).toBeNull();
  });
});
