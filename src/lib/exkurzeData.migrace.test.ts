// Stejná třída chyby jako u výčepů (vycepyData.migrace.test.ts, 27. 9. 2026):
// jednorázová migrace prohlížeč → databáze nesmí záviset na tom, že ji
// spustí jen jeden konkrétní vstupní bod appky. `nactiExkurze` ji musí
// spustit sama, ať se na ni sáhne odkudkoli.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stav = vi.hoisted(() => ({ exkurze: [] as any[] }));

vi.mock('./supabase', () => ({
  supabase: {
    from: (tabulka: string) => {
      if (tabulka !== 'exkurze') throw new Error(`neočekávaná tabulka v testu: ${tabulka}`);
      return {
        select: (_cols: string, opts?: { head?: boolean }) => {
          if (opts?.head) return Promise.resolve({ count: stav.exkurze.length, error: null });
          return { order: async () => ({ data: stav.exkurze, error: null }) };
        },
        insert: async (radky: any[]) => { stav.exkurze.push(...radky); return { error: null }; },
      };
    },
  },
}));

import { KLIC_EXKURZE, nactiExkurze, vycistiMigraciProTesty } from './exkurzeData';

beforeEach(() => {
  stav.exkurze = [];
  localStorage.clear();
  vycistiMigraciProTesty();
});

describe('nactiExkurze spouští migraci prohlížeč → databáze sama', () => {
  it('nachystaná lokální exkurze se přenese do databáze při prvním čtení', async () => {
    localStorage.setItem(KLIC_EXKURZE, JSON.stringify([
      { id: 'mistni-1', tour_date: '2026-09-20', tour_time: '14:00', people_count: 5, guide_name: 'František', revenue: 1000 },
    ]));
    const seznam = await nactiExkurze();
    expect(seznam).toHaveLength(1);
    expect(stav.exkurze).toHaveLength(1);
    expect(stav.exkurze[0].pruvodce).toBe('František');
  });

  it('když databáze už něco má, migrace ji nepřepíše', async () => {
    stav.exkurze.push({ id: 'existing', datum: '2026-09-01', cas: '10:00', pocet_lidi: 3, pruvodce: 'Existující', trzba: null, poznamka: null, archivovano_mesic: null, created_at: '2026-09-01' });
    localStorage.setItem(KLIC_EXKURZE, JSON.stringify([
      { id: 'mistni-1', tour_date: '2026-09-20', tour_time: '14:00', people_count: 5, guide_name: 'Nový z prohlížeče' },
    ]));
    await nactiExkurze();
    expect(stav.exkurze).toHaveLength(1);
    expect(stav.exkurze[0].pruvodce).toBe('Existující');
  });

  it('opakované čtení nezkusí migrovat znovu (žádná duplicita)', async () => {
    localStorage.setItem(KLIC_EXKURZE, JSON.stringify([
      { id: 'mistni-1', tour_date: '2026-09-20', tour_time: '14:00', people_count: 5, guide_name: 'František' },
    ]));
    await nactiExkurze();
    await nactiExkurze();
    expect(stav.exkurze).toHaveLength(1);
  });

  it('prázdný prohlížeč i prázdná databáze — nic se nestane', async () => {
    const seznam = await nactiExkurze();
    expect(seznam).toEqual([]);
    expect(stav.exkurze).toEqual([]);
  });
});
