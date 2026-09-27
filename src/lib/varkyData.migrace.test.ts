// Stejná třída chyby jako u výčepů (vycepyData.migrace.test.ts, 27. 9. 2026):
// jednorázová migrace prohlížeč → databáze nesmí záviset na tom, že ji
// spustí jen jeden konkrétní vstupní bod appky. `nactiVarky` ji musí spustit
// sama, ať se na ni sáhne odkudkoli.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stav = vi.hoisted(() => ({ varky: [] as any[] }));

vi.mock('./supabase', () => ({
  supabase: {
    from: (tabulka: string) => {
      if (tabulka !== 'planovane_varky') throw new Error(`neočekávaná tabulka v testu: ${tabulka}`);
      return {
        select: (_cols: string, opts?: { head?: boolean }) => {
          if (opts?.head) return Promise.resolve({ count: stav.varky.length, error: null });
          return { order: async () => ({ data: stav.varky, error: null }) };
        },
        insert: async (radky: any[]) => { stav.varky.push(...radky); return { error: null }; },
      };
    },
  },
}));

import { KLIC_VARKY, nactiVarky, vycistiMigraciProTesty } from './varkyData';

const TANK_A = 'tank-a';

beforeEach(() => {
  stav.varky = [];
  localStorage.clear();
  vycistiMigraciProTesty();
});

describe('nactiVarky spouští migraci prohlížeč → databáze sama', () => {
  it('nachystaná lokální várka na platném tanku se přenese do databáze', async () => {
    localStorage.setItem(KLIC_VARKY, JSON.stringify([
      { id: 'mistni-1', tankId: TANK_A, beerName: '12 Světlá', volumeHl: 10, startDate: '2026-09-20', targetDays: 21 },
    ]));
    const varky = await nactiVarky(new Set([TANK_A]));
    expect(varky).toHaveLength(1);
    expect(stav.varky).toHaveLength(1);
    expect(stav.varky[0].pivo).toBe('12 Světlá');
  });

  it('várka na tanku, který mezitím zmizel, se při migraci přeskočí', async () => {
    localStorage.setItem(KLIC_VARKY, JSON.stringify([
      { id: 'mistni-1', tankId: 'zrusenyTank', beerName: '12 Světlá', volumeHl: 10, startDate: '2026-09-20', targetDays: 21 },
    ]));
    await nactiVarky(new Set([TANK_A]));
    expect(stav.varky).toEqual([]);
  });

  it('když databáze už něco má, migrace ji nepřepíše', async () => {
    stav.varky.push({ id: 'existing', tank_id: TANK_A, pivo: 'Existující', objem_hl: 5, datum_od: '2026-09-01', dnu: 30, poznamka: null });
    localStorage.setItem(KLIC_VARKY, JSON.stringify([
      { id: 'mistni-1', tankId: TANK_A, beerName: 'Nová z prohlížeče', volumeHl: 10, startDate: '2026-09-20', targetDays: 21 },
    ]));
    await nactiVarky(new Set([TANK_A]));
    expect(stav.varky).toHaveLength(1);
    expect(stav.varky[0].pivo).toBe('Existující');
  });

  it('opakované čtení nezkusí migrovat znovu (žádná duplicita)', async () => {
    localStorage.setItem(KLIC_VARKY, JSON.stringify([
      { id: 'mistni-1', tankId: TANK_A, beerName: '12 Světlá', volumeHl: 10, startDate: '2026-09-20', targetDays: 21 },
    ]));
    await nactiVarky(new Set([TANK_A]));
    await nactiVarky(new Set([TANK_A]));
    expect(stav.varky).toHaveLength(1);
  });
});
