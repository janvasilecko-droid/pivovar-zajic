import { describe, it, expect } from 'vitest';
import { ztratyPodle, type CyklusTanku } from './ztratyTanku';

function cyklus(tank: string, pivo: string, pocatek: number, ztrata: number, konec: string): CyklusTanku {
  return { tank_id: tank, tank_label: tank, beer_id: pivo, beer_name: pivo, initial_volume_l: pocatek, loss_l: ztrata, ended_at: konec };
}

describe('ztráty při stáčení', () => {
  it('průměr je vážený objemem, ne průměr procent', () => {
    const v = ztratyPodle([
      cyklus('T1', 'Ležák', 1000, 20, '2026-08-01'),
      cyklus('T1', 'Ležák', 50, 10, '2026-08-10'),
    ], 'pivo');
    // (20 + 10) / 1050 = 2,86 %, ne (2 % + 20 %) / 2 = 11 %
    expect(v[0].ztrataPct).toBe(2.9);
  });

  it('seskupí po tancích a seřadí od nejhorších', () => {
    const v = ztratyPodle([
      cyklus('T1', 'A', 1000, 10, '2026-08-01'),
      cyklus('T2', 'A', 1000, 50, '2026-08-01'),
    ], 'tank');
    expect(v.map((s) => s.nazev)).toEqual(['T2', 'T1']);
  });

  it('trend jen když jsou starší cykly k porovnání', () => {
    const malo = ztratyPodle([cyklus('T1', 'A', 1000, 10, '2026-08-01')], 'tank');
    expect(malo[0].poslednichPct).toBeNull();

    const hodne = ztratyPodle([
      cyklus('T1', 'A', 1000, 10, '2026-06-01'),
      cyklus('T1', 'A', 1000, 40, '2026-07-01'),
      cyklus('T1', 'A', 1000, 40, '2026-08-01'),
      cyklus('T1', 'A', 1000, 40, '2026-09-01'),
    ], 'tank');
    expect(hodne[0].poslednichPct).toBe(4);
    expect(hodne[0].predtimPct).toBe(1);
  });

  it('cyklus bez počátečního objemu se nepočítá', () => {
    expect(ztratyPodle([cyklus('T1', 'A', 0, 10, '2026-08-01')], 'tank')).toEqual([]);
  });
});
