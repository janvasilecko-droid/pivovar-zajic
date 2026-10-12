import { describe, it, expect } from 'vitest';
import { radkyObjednavky, doplnChybejiciZPrepisu } from './prepis-fotky';

const beers = [
  { id: 'b11', name: '11° Světlá', degree: '11°' },
  { id: 'b12', name: '12° Světlá', degree: '12°' },
  { id: 'b10', name: '10° Desítka', degree: '10°' },
  { id: 'bj', name: 'Jantar', degree: null },
  { id: 'bw', name: 'winter', degree: '12' },
];
const packages = [
  { id: 'k30', label: '30l', volume_l: 30 },
  { id: 'k20', label: '20l', volume_l: 20 },
  { id: 'k15', label: '15l', volume_l: 15 },
  { id: 'k10', label: '10l', volume_l: 10 },
  { id: 'p1', label: '1l', volume_l: 1 },
  { id: 'l05', label: '0.5l', volume_l: 0.5 },
];
const katalog = { beers, packages, aliasMap: { beer: new Map<string, string>(), package: new Map<string, string>() } };

const PREPIS = `Pro Radka ma stredu

1. JONÁŠ
10x 11 11°sv.
10x 11 12°-Jantar
10x 11 12° WINTER

2. DROBAK
10x 11 11°sv.

4. SKLAD
20x 0.5l 10°
35x 11 12°sv.
10x 11 12°-Jantar
10x 11 12° WINTER
3x 10 11°sv.`;

const polozka = (beer: string, pkg: string, qty: number, raw: string) => ({
  beer_id: beer, pkg_id: pkg, qty, degree: null, beer_name: null, package_label: null, raw_line: raw,
});

describe('Řádky přepisu fotky, které chybí v položkách', () => {
  it('najde řádky „Nx …" a přeskočí nadpisy', () => {
    expect(radkyObjednavky(PREPIS).map((r) => r.qty)).toEqual([10, 10, 10, 10, 20, 35, 10, 10, 3]);
  });

  it('doplní chybějící a opakované řádky (podle počtu výskytů)', () => {
    // AI vrátila jen první čtyři řádky.
    const mam = [
      polozka('b11', 'p1', 10, '10x 11 11°sv.'),
      polozka('bj', 'p1', 10, '10x 11 12°-Jantar'),
      polozka('bw', 'p1', 10, '10x 11 12° WINTER'),
    ];
    const doplnene = doplnChybejiciZPrepisu(PREPIS, mam, katalog);
    // Druhé 10× 11° sv., 20× 0,5l 10°, 35× 12° sv., druhý Jantar a Winter, 3× 10l.
    expect(doplnene.map((d) => d.raw_line)).toEqual([
      '10x 11 11°sv.', '20x 0.5l 10°', '35x 11 12°sv.', '10x 11 12°-Jantar', '10x 11 12° WINTER', '3x 10 11°sv.',
    ]);
    expect(doplnene.find((d) => d.raw_line === '10x 11 12° WINTER')?.beer_id).toBe('bw');
    expect(doplnene.find((d) => d.raw_line === '35x 11 12°sv.')?.pkg_id).toBe('p1');
  });

  it('nic nedoplňuje, když jsou všechny řádky v položkách', () => {
    const vse = radkyObjednavky(PREPIS).map(({ qty, radek }) => {
      const d = doplnChybejiciZPrepisu(radek, [], katalog)[0];
      return polozka(d.beer_id!, d.pkg_id!, qty, radek);
    });
    expect(doplnChybejiciZPrepisu(PREPIS, vse, katalog)).toEqual([]);
  });
});

describe('Pořadí podle fotky (12. 10. 2026: „máš na konci limonády")', () => {
  it('položky jdou jako řádky přepisu, doplněné na svém místě, nespárované na konci', async () => {
    const { poradiPodlePrepisu } = await import('./prepis-fotky');
    const prepis = '10x 11 11°sv.\n20x 0.5l 10°\n35x 11 12°sv.\n3x 10 11°sv.';
    const mam = [
      polozka('b11', 'k10', 3, '3x 10 11°sv.'),
      polozka('b11', 'p1', 10, '10x 11 11°sv.'),
      polozka('bx', 'k30', 7, 'něco navíc'),
    ];
    const r = poradiPodlePrepisu(prepis, mam, katalog);
    expect(r.map((x) => (x.nova ? `+${x.nova.raw_line}` : `#${x.index}`))).toEqual([
      '#1', '+20x 0.5l 10°', '+35x 11 12°sv.', '#0', '#2',
    ]);
  });
});

describe('Řádek „20x 0,5l 10°" (12. 10. 2026)', () => {
  it('je lahev 0,5l, ne sud 10l, a nezdvojí se', async () => {
    const { poradiPodlePrepisu } = await import('./prepis-fotky');
    const { matchPackageId } = await import('./beer-match');
    expect(matchPackageId({ raw_line: '20x 0,5l 10°', package_label: null }, packages, katalog.aliasMap)).toBe('l05');
    const r = poradiPodlePrepisu('20x 0,5l 10°\n3x 10 11°sv.', [
      polozka('b10', 'l05', 20, '20x 0,5l 10°'),
      polozka('b11', 'k10', 3, '3x 10 11°sv.'),
    ], katalog);
    expect(r).toEqual([{ index: 0 }, { index: 1 }]);
  });
});
