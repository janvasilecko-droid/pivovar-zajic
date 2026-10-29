import { describe, it, expect } from 'vitest';
import {
  kusy, mnozstviLahve, nastavLahve, mnozstviSudu, nastavSud, sudyDavky, odhadLahviZeSudu,
  sudyNaDavku, rychleHodnoty, poradiLahvi, type KonceptLahve,
} from './krokoveZadavani';

const prazdny = (): KonceptLahve => ({
  pkgId: '', qty: '', pkg2Id: '', qty2: '', pkg3Id: '', qty3: '', pkg4Id: '', qty4: '',
  kegPkgId: 'k50', kegQty: '', keg2PkgId: '', keg2Qty: '',
});

describe('kusy', () => {
  it('bere jen celá kladná čísla', () => {
    expect(kusy('12')).toBe(12);
    expect(kusy('')).toBe(0);
    expect(kusy('-3')).toBe(0);
    expect(kusy('abc')).toBe(0);
    expect(kusy(2.7)).toBe(2);
  });
});

describe('lahve → sloty', () => {
  it('nový obal jde do prvního volného slotu', () => {
    let d = nastavLahve(prazdny(), 'b1', 137);
    d = nastavLahve(d, 'b05', 40);
    expect(d).toMatchObject({ pkgId: 'b1', qty: '137', pkg2Id: 'b05', qty2: '40' });
    expect(mnozstviLahve(d, 'b1')).toBe(137);
    expect(mnozstviLahve(d, 'b05')).toBe(40);
    expect(mnozstviLahve(d, 'b033')).toBe(0);
  });

  it('stejný obal přepíše svůj slot, nezabírá nový', () => {
    let d = nastavLahve(prazdny(), 'b1', 10);
    d = nastavLahve(d, 'b1', 25);
    expect(d.qty).toBe('25');
    expect(d.pkg2Id).toBe('');
  });

  it('nula slot uvolní a další obal ho znovu použije', () => {
    let d = nastavLahve(nastavLahve(prazdny(), 'b1', 10), 'b15', 5);
    d = nastavLahve(d, 'b1', 0);
    expect(d).toMatchObject({ pkgId: '', qty: '', pkg2Id: 'b15', qty2: '5' });
    d = nastavLahve(d, 'b033', 20);
    expect(d).toMatchObject({ pkgId: 'b033', qty: '20' });
  });

  it('slot s obalem, ale bez počtu (starý rozepsaný zápis) se znovu využije', () => {
    const d = nastavLahve({ ...prazdny(), pkgId: 'b1', qty: '' }, 'b15', 7);
    expect(d).toMatchObject({ pkgId: 'b15', qty: '7' });
  });

  it('nula u obalu, který tam není, nic nemění', () => {
    const d = prazdny();
    expect(nastavLahve(d, 'b1', 0)).toBe(d);
  });
});

describe('sudy → sloty', () => {
  it('předvolená padesátka bez počtu se při jiné velikosti přepíše', () => {
    const d = nastavSud(prazdny(), 'k30', 4);
    expect(d).toMatchObject({ kegPkgId: 'k30', kegQty: '4', keg2PkgId: '', keg2Qty: '' });
  });

  it('padesátka se zadá do prvního slotu a ponechá si předvolbu', () => {
    const d = nastavSud(prazdny(), 'k50', 3);
    expect(d).toMatchObject({ kegPkgId: 'k50', kegQty: '3' });
    expect(mnozstviSudu(d, 'k50')).toBe(3);
  });

  it('druhá velikost jde do druhého slotu', () => {
    const d = nastavSud(nastavSud(prazdny(), 'k50', 1), 'k20', 1);
    expect(d).toMatchObject({ kegPkgId: 'k50', kegQty: '1', keg2PkgId: 'k20', keg2Qty: '1' });
    expect(sudyDavky(d)).toEqual([{ pkgId: 'k50', qty: 1 }, { pkgId: 'k20', qty: 1 }]);
  });

  it('třetí velikost se nepřijme (datový model unese dvě)', () => {
    const dve = nastavSud(nastavSud(prazdny(), 'k50', 1), 'k20', 1);
    expect(nastavSud(dve, 'k30', 2)).toBe(dve);
  });

  it('smazání prvního slotu přesune druhý na první', () => {
    const dve = nastavSud(nastavSud(prazdny(), 'k50', 1), 'k20', 2);
    const d = nastavSud(dve, 'k50', 0);
    expect(d).toMatchObject({ kegPkgId: 'k20', kegQty: '2', keg2PkgId: '', keg2Qty: '' });
  });

  it('smazání druhého slotu ho vyprázdní včetně obalu', () => {
    const dve = nastavSud(nastavSud(prazdny(), 'k50', 1), 'k20', 2);
    const d = nastavSud(dve, 'k20', 0);
    expect(d).toMatchObject({ kegPkgId: 'k50', kegQty: '1', keg2PkgId: '', keg2Qty: '' });
  });

  it('bez zadaných sudů je seznam dávek prázdný', () => {
    expect(sudyDavky(prazdny())).toEqual([]);
  });
});

describe('odhad lahví ze sudů', () => {
  it('3× 50 l = 150 l, po 10 % ztrátě 135 l → 135× 1 l', () => {
    expect(odhadLahviZeSudu(150, 0, 1)).toBe(135);
  });
  it('odečte litry z jiných lahví', () => {
    // 135 l − 20× 0,5 l = 125 l → 83× 1,5 l
    expect(odhadLahviZeSudu(150, 10, 1.5)).toBe(83);
  });
  it('nulu a mínus nevrací', () => {
    expect(odhadLahviZeSudu(0, 0, 1)).toBe(0);
    expect(odhadLahviZeSudu(10, 50, 1)).toBe(0);
  });
});

describe('sudy na dávku', () => {
  it('dávka s víc druhy lahví se počítá jednou', () => {
    const t = '2026-10-20T09:00:00Z';
    const rows = [
      { beer_id: 'sv12', created_at: t, entry_date: '2026-10-20', kegs_used: 3, kegs_used_package_id: 'k50' },
      { beer_id: 'sv12', created_at: t, entry_date: '2026-10-20', kegs_used: 3, kegs_used_package_id: 'k50' },
      { beer_id: 'sv12', created_at: '2026-10-21T09:00:00Z', entry_date: '2026-10-21', kegs_used: 2, kegs_used_package_id: 'k50' },
      { beer_id: 'sv12', created_at: t, entry_date: '2026-10-20', kegs_used: null, kegs_used_package_id: null },
    ];
    expect(sudyNaDavku(rows).map((r) => r.quantity)).toEqual([3, 2]);
  });

  it('dvě velikosti sudů v jedné dávce jsou dva záznamy', () => {
    const t = '2026-10-06T09:00:00Z';
    const rows = [
      { beer_id: 'd10', created_at: t, entry_date: '2026-10-06', kegs_used: 1, kegs_used_package_id: 'k50' },
      { beer_id: 'd10', created_at: t, entry_date: '2026-10-06', kegs_used: 1, kegs_used_package_id: 'k20' },
    ];
    expect(sudyNaDavku(rows)).toHaveLength(2);
  });
});

describe('rychlé hodnoty', () => {
  it('vrátí pět nejčastějších vzestupně a doplní zálohou', () => {
    const rows = [
      ...[1, 1, 1, 2, 2, 3, 5, 19].map((q) => ({ beer_id: 'sv12', package_id: 'k50', quantity: q, entry_date: '2026-10-01' })),
    ];
    expect(rychleHodnoty(rows, 'sv12', 'k50')).toEqual([1, 2, 3, 5, 19]);
    expect(rychleHodnoty([], 'sv12', 'k50', [6, 12, 18, 24])).toEqual([6, 12, 18, 24]);
  });
});

describe('pořadí lahví', () => {
  it('litr první, pak 1,5 l, 0,5 l a 0,33 l', () => {
    const obaly = [1.5, 0.33, 1, 0.5].map((v) => ({ volume_l: v }));
    expect(poradiLahvi(obaly).map((o) => o.volume_l)).toEqual([1, 1.5, 0.5, 0.33]);
  });
});
