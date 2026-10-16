// Řádky z fotky na víc dnů najednou — Stáčení KEG a Fasování / Prodejna / Odpis
// (majitel 16. 10. 2026: „udělej to pro všechno").
import { describe, expect, it } from 'vitest';
import {
  denRadku, dnyRadku, jizZapsane, mesiceDnu, otazkaJizZapsano, otazkaUzamcenychMesicu,
  platnyDen, rozdelPodleDnu, seskupPoDnech, souhrnDnu,
} from './zapisPoDnech';

const r = (datum: string | null | undefined, extra: Record<string, unknown> = {}) => ({ beerId: 'b', pkgId: 'p', qty: '1', datum, ...extra });

describe('platnyDen', () => {
  it('vrátí existující den, jinak null', () => {
    expect(platnyDen('2026-10-13')).toBe('2026-10-13');
    expect(platnyDen('2024-02-29')).toBe('2024-02-29');
    for (const spatne of ['2026-02-31', '2026-13-01', '2026-00-10', '2026-10-32', '13. 10. 2026', '2026-10-13T10:00', '', null, undefined, 20261013]) {
      expect(platnyDen(spatne)).toBeNull();
    }
    expect(platnyDen('2025-02-29')).toBeNull(); // 2025 není přestupný rok
  });
});

describe('denRadku', () => {
  it('řádek z fotky má svůj den, ostatní datum formuláře', () => {
    expect(denRadku('2026-10-12', '2026-10-16')).toBe('2026-10-12');
    expect(denRadku(null, '2026-10-16')).toBe('2026-10-16');
    expect(denRadku(undefined, '2026-10-16')).toBe('2026-10-16');
    expect(denRadku('nesmysl', '2026-10-16')).toBe('2026-10-16');
  });
});

describe('dnyRadku', () => {
  it('různé dny vzestupně, bez opakování a bez řádků bez dne', () => {
    expect(dnyRadku([r('2026-10-14'), r('2026-10-12'), r('2026-10-14'), r(null), r('chyba')])).toEqual(['2026-10-12', '2026-10-14']);
    expect(dnyRadku([])).toEqual([]);
  });
});

describe('rozdelPodleDnu — kam s řádky přečtenými z fotky', () => {
  it('jeden den: všechno do formuláře jako dosud', () => {
    const radky = [r('2026-10-13'), r('2026-10-13', { qty: '4' })];
    const x = rozdelPodleDnu(radky);
    expect(x.formular).toEqual(radky);
    expect(x.poDnech).toEqual([]);
  });

  it('bez dnů (seznam / zpráva): všechno do formuláře', () => {
    const radky = [r(undefined), r(null)];
    expect(rozdelPodleDnu(radky)).toEqual({ formular: radky, poDnech: [] });
  });

  it('víc dnů: řádky s dnem do seznamu po dnech, řádky bez dne (ručně přidané) zůstanou formuláři', () => {
    const a = r('2026-10-12');
    const b = r('2026-10-13');
    const rucne = r(undefined, { _manual: true });
    const x = rozdelPodleDnu([a, rucne, b]);
    expect(x.poDnech).toEqual([a, b]);
    expect(x.formular).toEqual([rucne]);
  });

  it('víc dnů, ale jeden má neplatný tvar: neplatný den se bere jako „bez dne"', () => {
    const dobry1 = r('2026-10-12');
    const dobry2 = r('2026-10-13');
    const spatny = r('2026-02-31');
    const x = rozdelPodleDnu([dobry1, spatny, dobry2]);
    expect(x.poDnech).toEqual([dobry1, dobry2]);
    expect(x.formular).toEqual([spatny]);
  });

  it('řádek se dvěma stejnými dny nestačí na „víc dnů"', () => {
    expect(rozdelPodleDnu([r('2026-10-12'), r('2026-10-12')]).poDnech).toEqual([]);
  });
});

describe('seskupPoDnech', () => {
  it('nejstarší den první, v rámci dne původní pořadí, s původním indexem', () => {
    const radky = [r('2026-10-14', { id: 'a' }), r('2026-10-12', { id: 'b' }), r('2026-10-14', { id: 'c' }), r(null, { id: 'bez' }), r('2026-10-13', { id: 'd' })];
    const s = seskupPoDnech(radky);
    expect(s.map((x) => x.den)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
    expect(s[2].radky.map((x) => [x.radek.id, x.index])).toEqual([['a', 0], ['c', 2]]);
    expect(s[0].radky.map((x) => x.index)).toEqual([1]);
  });

  it('řádky bez platného dne do seznamu nepatří', () => {
    expect(seskupPoDnech([r(null), r(undefined), r('2026-13-40')])).toEqual([]);
  });
});

describe('mesiceDnu', () => {
  it('měsíce vzestupně a bez opakování (přelom měsíců)', () => {
    expect(mesiceDnu(['2026-10-02', '2026-09-30', '2026-10-31', '2026-09-01'])).toEqual(['2026-09', '2026-10']);
    expect(mesiceDnu([])).toEqual([]);
  });
});

describe('otazkaUzamcenychMesicu', () => {
  it('jeden měsíc: v jednotném čísle', () => {
    const t = otazkaUzamcenychMesicu(['2026-09']);
    expect(t).toMatch(/^Měsíc 2026-09 už má napočítanou inventuru\. Zápis do něj teď změní číslo, které je už uzavřené a dorovnané\./);
    expect(t).toContain('Opravdu zapsat do už napočítaného měsíce?');
  });

  it('víc měsíců: jedna otázka s výčtem všech, v množném čísle', () => {
    const t = otazkaUzamcenychMesicu(['2026-09', '2026-10']);
    expect(t).toMatch(/^Měsíce 2026-09, 2026-10 už mají napočítanou inventuru\. Zápis do nich teď změní čísla, která jsou už uzavřená a dorovnané\./);
  });
});

describe('jizZapsane — stejná fotka podruhé', () => {
  const ulozene = [
    { entry_date: '2026-10-13', beer_id: 'des', package_id: 'k30', quantity: 6 },
    { entry_date: '2026-10-13', beer_id: 'des', package_id: 'k30', quantity: '2' },
    { entry_date: '2026-10-13', beer_id: 'des', package_id: 'k50', quantity: 9 },
    { entry_date: '2026-10-12', beer_id: 'des', package_id: 'k30', quantity: 4 },
    { entry_date: '2026-10-14T08:00:00+00:00', beer_id: 'svetla', package_id: 'k50', quantity: 3 },
  ];

  it('stejný den, pivo i obal: sečte kusy, které už jsou zapsané', () => {
    expect(jizZapsane([r('2026-10-13', { beerId: 'des', pkgId: 'k30' })], ulozene))
      .toEqual([{ den: '2026-10-13', beerId: 'des', pkgId: 'k30', ks: 8 }]);
  });

  it('jiný obal, jiné pivo nebo jiný den se neshodují', () => {
    expect(jizZapsane([
      r('2026-10-13', { beerId: 'des', pkgId: 'k20' }),
      r('2026-10-13', { beerId: 'svetla', pkgId: 'k30' }),
      r('2026-10-15', { beerId: 'des', pkgId: 'k30' }),
    ], ulozene)).toEqual([]);
  });

  it('datum uložené s časem se čte podle dne', () => {
    expect(jizZapsane([r('2026-10-14', { beerId: 'svetla', pkgId: 'k50' })], ulozene)).toHaveLength(1);
  });

  it('řádek bez vlastního dne (formulář) se nehlídá; stejný den+pivo+obal dvakrát se hlásí jednou', () => {
    expect(jizZapsane([r(null, { beerId: 'des', pkgId: 'k30' })], ulozene)).toEqual([]);
    expect(jizZapsane([
      r('2026-10-12', { beerId: 'des', pkgId: 'k30' }),
      r('2026-10-12', { beerId: 'des', pkgId: 'k30', qty: '9' }),
    ], ulozene)).toEqual([{ den: '2026-10-12', beerId: 'des', pkgId: 'k30', ks: 4 }]);
  });

  it('nečíselné množství se přeskočí, platné se sečte', () => {
    expect(jizZapsane([r('2026-10-13', { beerId: 'x', pkgId: 'y' })], [
      { entry_date: '2026-10-13', beer_id: 'x', package_id: 'y', quantity: 5 },
      { entry_date: '2026-10-13', beer_id: 'x', package_id: 'y', quantity: 'abc' },
      { entry_date: '2026-10-13', beer_id: 'x', package_id: 'y', quantity: '2' },
    ])).toEqual([{ den: '2026-10-13', beerId: 'x', pkgId: 'y', ks: 7 }]);
  });

  it('nulové, záporné či nečíselné množství nic nehlásí', () => {
    expect(jizZapsane([r('2026-10-13', { beerId: 'x', pkgId: 'y' })], [
      { entry_date: '2026-10-13', beer_id: 'x', package_id: 'y', quantity: 0 },
      { entry_date: '2026-10-13', beer_id: 'x', package_id: 'y', quantity: 'abc' },
      { entry_date: '2026-10-13', beer_id: 'x', package_id: 'y', quantity: null },
    ])).toEqual([]);
  });
});

describe('otazkaJizZapsano', () => {
  const popisek = (b: string, p: string) => `${b === 'des' ? '10° Desítka' : b} ${p === 'k30' ? '30l' : p}`;

  it('vypíše den, pivo a kusy a ptá se, jestli se stejná fotka nezapisuje podruhé', () => {
    const t = otazkaJizZapsano([{ den: '2026-10-13', beerId: 'des', pkgId: 'k30', ks: 8 }], 've stáčení KEG', popisek);
    expect(t).toBe(
      'Tohle už ve stáčení KEG je:\n\n• 13. 10. · 10° Desítka 30l — už zapsáno 8 ks\n\n'
      + 'Řádky z fotky se přidají k tomu, co už je zapsané. Nezapisuješ stejnou fotku podruhé?',
    );
  });

  const dny = (n: number) => Array.from({ length: n }, (_, i) => ({ den: `2026-10-${String(i + 1).padStart(2, '0')}`, beerId: 'des', pkgId: 'k30', ks: 1 }));

  it('nad osm řádků se výpis zkrátí', () => {
    const t = otazkaJizZapsano(dny(11), 'v prodejně', popisek);
    expect(t.match(/^• /gm)).toHaveLength(9); // 8 řádků + „a dalších“
    expect(t).toContain('• … a dalších 3');
  });

  it('osm řádků se vypíše celé; devátý už je „a dalších 1“', () => {
    const osm = otazkaJizZapsano(dny(8), 'v prodejně', popisek);
    expect(osm.match(/^• /gm)).toHaveLength(8);
    expect(osm).not.toContain('a dalších');
    const devet = otazkaJizZapsano(dny(9), 'v prodejně', popisek);
    expect(devet.match(/^• /gm)).toHaveLength(9);
    expect(devet).toContain('• … a dalších 1');
  });
});

describe('souhrnDnu', () => {
  it('řádky v češtině a počet dnů jen při víc dnech', () => {
    expect(souhrnDnu(1, 1)).toBe('1 řádek');
    expect(souhrnDnu(3, 1)).toBe('3 řádky');
    expect(souhrnDnu(4, 1)).toBe('4 řádky');
    expect(souhrnDnu(5, 1)).toBe('5 řádků');
    expect(souhrnDnu(0, 0)).toBe('0 řádků');
    expect(souhrnDnu(12, 3)).toBe('12 řádků z 3 dnů');
    expect(souhrnDnu(2, 2)).toBe('2 řádky z 2 dnů');
  });
});
