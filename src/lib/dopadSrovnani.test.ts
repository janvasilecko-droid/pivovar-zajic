import { describe, expect, it } from 'vitest';
import { dopadSrovnani, type RadekProDopad } from './dopadSrovnani';

const SV = { beer_id: 'b1', beer_name: '12° Světlá' };

const lahev = (label: string, volume: number, diffQty: number): RadekProDopad => ({
  ...SV, package_id: `p-${label}`, package_label: label,
  package_kind: 'bottle', package_volume: volume, diffQty,
});
const sud = (label: string, volume: number, diffQty: number): RadekProDopad => ({
  ...SV, package_id: `k-${label}`, package_label: label,
  package_kind: 'keg', package_volume: volume, diffQty,
});

describe('dopadSrovnani', () => {
  it('spočítá sudy z lahví a přičte je k sudovému řádku', () => {
    // 781 × 1 l = 781 l, ÷ 0,9 = 867,8 l, ÷ 50 = 17,36 → 18 sudů.
    const d = dopadSrovnani([lahev('1 L', 1, 781), sud('50 L', 50, 10)]);
    expect(d[0].sudyZLahvi).toBe(18);
    expect(d[0].sudove[0]).toEqual({ package_label: '50 L', ted: 10, poLahvich: 28 });
  });

  it('celkový počet sudů se počítá ze SOUČTU litrů, ne sečtením zaokrouhlených řádků', () => {
    // Všechny velikosti lahví se stáčejí z jedněch sudů. Sečíst zaokrouhlené
    // řádky (4 + 18 + 2 + 1 = 25) počet nadsazuje — jako by se pro každou
    // velikost lahve načínaly vlastní sudy. Z 1017 l vyjde 23.
    const d = dopadSrovnani([
      lahev('1.5 L', 1.5, 116),
      lahev('1 L', 1, 781),
      lahev('0.5 L', 0.5, 111),
      lahev('0.33 L', 0.33, 20),
      sud('50 L', 50, 10),
    ]);
    expect(d[0].litryCelkem).toBe(1017.1);
    expect(d[0].sudyZLahvi).toBe(23);
    expect(d[0].sudove[0].poLahvich).toBe(33);
  });

  it('sečte litry přes všechny lahvové řádky', () => {
    const d = dopadSrovnani([lahev('1 L', 1, 100), lahev('0.5 L', 0.5, 100), sud('50 L', 50, 0)]);
    expect(d[0].litryCelkem).toBe(150);
  });

  it('manko na lahvích sudy nespotřebuje — nic se nevyrobilo', () => {
    const d = dopadSrovnani([lahev('1 L', 1, -300), sud('50 L', 50, 5)]);
    expect(d[0].sudyZLahvi).toBe(0);
    expect(d[0].sudove[0].poLahvich).toBe(5);
  });

  it('odečet se přičte jen k sudu té velikosti, ze které se počítalo', () => {
    // Srovnání přes padesátky nesmí sahat na třicítky.
    const d = dopadSrovnani([lahev('1 L', 1, 450), sud('50 L', 50, 2), sud('30 L', 30, 7)], 50);
    const p50 = d[0].sudove.find((s) => s.package_label === '50 L');
    const p30 = d[0].sudove.find((s) => s.package_label === '30 L');
    expect(p50).toEqual({ package_label: '50 L', ted: 2, poLahvich: 12 });
    expect(p30).toEqual({ package_label: '30 L', ted: 7, poLahvich: 7 });
  });

  it('při přepnutí na třicítky se přičte tam, ne k padesátkám', () => {
    const d = dopadSrovnani([lahev('1 L', 1, 450), sud('50 L', 50, 2), sud('30 L', 30, 7)], 30);
    expect(d[0].sudove.find((s) => s.package_label === '30 L')?.poLahvich).toBe(7 + 17);
    expect(d[0].sudove.find((s) => s.package_label === '50 L')?.poLahvich).toBe(2);
  });

  it('piva se nemíchají', () => {
    const d = dopadSrovnani([
      lahev('1 L', 1, 450),
      { beer_id: 'b2', beer_name: '11° Tmavá', package_id: 'k2', package_label: '50 L', package_kind: 'keg', package_volume: 50, diffQty: 3 },
    ]);
    const tmava = d.find((x) => x.beer_id === 'b2');
    expect(tmava?.sudyZLahvi).toBe(0);
    expect(tmava?.sudove[0].poLahvich).toBe(3);
  });

  it('pivo bez rozdílů se v přehledu neobjeví', () => {
    expect(dopadSrovnani([lahev('1 L', 1, 0), sud('50 L', 50, 0)])).toEqual([]);
  });

  it('lahev bez objemu se přeskočí — nedá se z ní nic dopočítat', () => {
    const d = dopadSrovnani([
      { ...SV, package_id: 'x', package_label: 'Neznámá', package_kind: 'bottle', diffQty: 100 },
      sud('50 L', 50, 4),
    ]);
    expect(d[0].sudyZLahvi).toBe(0);
  });

  it('řadí piva podle toho, kde se toho děje nejvíc', () => {
    const d = dopadSrovnani([
      lahev('1 L', 1, 90),
      { beer_id: 'b2', beer_name: '11° Tmavá', package_id: 'p2', package_label: '1 L', package_kind: 'bottle', package_volume: 1, diffQty: 900 },
    ]);
    expect(d[0].beer_id).toBe('b2');
  });

  it('sudový řádek bez rozdílu se ukáže, když ho lahve posunou', () => {
    const d = dopadSrovnani([lahev('1 L', 1, 450), sud('50 L', 50, 0)]);
    expect(d[0].sudove[0]).toEqual({ package_label: '50 L', ted: 0, poLahvich: 10 });
  });
});
