// Přehled stáčení KEG jako tabulka (17. 10. 2026: „udělej takhle i přehled stáčení KEG").
import { describe, expect, it } from 'vitest';
import { davkyStaceni, dnyStaceni } from './prehledStaceni';
import { bunkaDavky, sloupceKeg, souctyDne, zaznamyBezSloupce, zdrojAVytrata, type ZaznamKeg } from './prehledStaceniKeg';

const OBJEM: Record<string, number> = { k50: 50, k30: 30, k20: 20, k15: 15, k5: 5, bez: 0 };
const z = (id: string, datum: string, beer: string, pkg: string, ks: number, zdroj?: number | null): ZaznamKeg => ({
  id, entry_date: datum, beer_id: beer, beer_name: beer, package_id: pkg, quantity: ks, source_volume_l: zdroj ?? null,
});
const dny = (zaznamy: ZaznamKeg[]) => dnyStaceni(davkyStaceni(zaznamy, (p) => OBJEM[p ?? ''] ?? 0));

describe('sloupceKeg', () => {
  it('základní 50 a 30 jsou vždy; ostatní jen když v nich něco je, od největšího', () => {
    expect(sloupceKeg(dny([z('1', '2026-10-12', 'sv', 'k30', 2)]))).toEqual([50, 30]);
    expect(sloupceKeg(dny([z('1', '2026-10-12', 'sv', 'k15', 1), z('2', '2026-10-12', 'sv', 'k50', 1)]))).toEqual([50, 30, 15]);
  });

  it('sud mimo katalog sloupců dostane vlastní sloupec; nulový počet sloupec nevytvoří', () => {
    expect(sloupceKeg(dny([z('1', '2026-10-12', 'sv', 'k5', 3)]))).toEqual([50, 30, 5]);
    expect(sloupceKeg(dny([z('1', '2026-10-12', 'sv', 'k20', 0)]))).toEqual([50, 30]);
  });
});

describe('bunkaDavky a součty', () => {
  const d = dny([z('1', '2026-10-12', 'sv', 'k50', 2), z('2', '2026-10-12', 'sv', 'k30', 1), z('3', '2026-10-12', 'sv', 'k30', 3), z('4', '2026-10-12', 'tm', 'k30', 4)]);

  it('kusy se v buňce sečtou přes záznamy téhož obalu a zachovají se záznamy', () => {
    const sv = d[0].davky.find((x) => x.beerId === 'sv')!;
    expect(bunkaDavky(sv, 30)).toMatchObject({ ks: 4 });
    expect(bunkaDavky(sv, 30).zaznamy.map((x) => x.id)).toEqual(['2', '3']);
    expect(bunkaDavky(sv, 50).ks).toBe(2);
    expect(bunkaDavky(sv, 20)).toEqual({ ks: 0, zaznamy: [] });
  });

  it('součty dne po sloupcích', () => {
    expect(souctyDne(d[0], [50, 30, 20])).toEqual([2, 8, 0]);
  });

  it('obal mimo sloupce se najde', () => {
    const dd = dny([z('1', '2026-10-12', 'sv', 'bez', 2), z('2', '2026-10-12', 'sv', 'k30', 1)]);
    expect(zaznamyBezSloupce(dd[0].davky[0], [50, 30]).map((x) => x.id)).toEqual(['1']);
  });
});

describe('zdrojAVytrata', () => {
  it('výtrata z litrů z tanku: 2×50 + 1×30 = 130 l ze 140 l = 7,1 %', () => {
    const dd = dny([z('1', '2026-10-12', 'sv', 'k50', 2, 100), z('2', '2026-10-12', 'sv', 'k30', 1, 40)]);
    expect(zdrojAVytrata(dd[0].davky[0])).toEqual({ zdrojL: 140, vytrata: 7.1 });
  });

  it('chybí-li objem z tanku u jediného záznamu, výtrata se nepočítá', () => {
    const dd = dny([z('1', '2026-10-12', 'sv', 'k50', 2, 100), z('2', '2026-10-12', 'sv', 'k30', 1, null)]);
    expect(zdrojAVytrata(dd[0].davky[0])).toEqual({ zdrojL: 0, vytrata: null });
  });

  it('bez záznamů s kusy nic; text v objemu se bere jako číslo', () => {
    expect(zdrojAVytrata(dny([z('1', '2026-10-12', 'sv', 'k50', 0, 50)])[0].davky[0])).toEqual({ zdrojL: 0, vytrata: null });
    const text = { ...z('1', '2026-10-12', 'sv', 'k50', 2), source_volume_l: '104.5' };
    expect(zdrojAVytrata(dny([text])[0].davky[0]).zdrojL).toBe(104.5);
  });
});
