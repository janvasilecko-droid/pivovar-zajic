// 🐛 27. 9. 2026: uživatel měl v prohlížeči roky vedené výčepy, appka je po
// přechodu na databázi (31. 8. 2026) přesto ukazovala prázdné. Příčina:
// `nactiVycepy`/`nactiRezervace` po úspěšném (byť prázdném) čtení z databáze
// přepíšou offline kopii v localStorage — a jednorázová migrace prohlížeč →
// databáze se dřív volala jen z VycepyScreen.tsx. Jenže HomeScreen (výčepy
// po termínu) i autoReserveTapIfNeeded (Orders.tsx) sahají na
// `nactiRezervace`/`nactiVycepy` NAPŘÍMO — a HomeScreen se načte při každém
// spuštění appky dřív, než kdo stihne otevřít Výčepy. Migrace tak nikdy
// neproběhla a stará data v prohlížeči zmizela prvním (prázdným) čtením.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const stav = vi.hoisted(() => ({ vycepy: [] as any[], rezervace: [] as any[] }));

vi.mock('./supabase', () => ({
  supabase: {
    from: (tabulka: string) => {
      if (tabulka === 'vycepy') {
        return {
          select: (_cols: string, opts?: { head?: boolean }) => {
            if (opts?.head) return Promise.resolve({ count: stav.vycepy.length, error: null });
            return { order: () => ({ order: async () => ({ data: stav.vycepy, error: null }) }) };
          },
          insert: async (radky: any[]) => { stav.vycepy.push(...radky); return { error: null }; },
        };
      }
      if (tabulka === 'vycepy_rezervace') {
        return {
          select: () => ({ order: async () => ({ data: stav.rezervace, error: null }) }),
          insert: async (radky: any[]) => { stav.rezervace.push(...radky); return { error: null }; },
        };
      }
      throw new Error(`neočekávaná tabulka v testu: ${tabulka}`);
    },
  },
}));

import { KLIC_VYCEPY, nactiVycepy, nactiRezervace, vycistiMigraciProTesty } from './vycepyData';

function ulozMistniVycep(id: string, name: string) {
  localStorage.setItem(KLIC_VYCEPY, JSON.stringify([
    { id, name, tap_type: 'jednokohout', status: 'clean' },
  ]));
}

beforeEach(() => {
  stav.vycepy = [];
  stav.rezervace = [];
  localStorage.clear();
  vycistiMigraciProTesty();
});

describe('migrace prohlížeč → databáze se spustí, ať appku „probudí“ cokoli', () => {
  it('nactiRezervace (HomeScreen) zavolaná jako první migraci taky spustí, ne jen nactiVycepy', async () => {
    ulozMistniVycep('t1', 'Výčep #1');
    const rezervace = await nactiRezervace();
    expect(rezervace).toEqual([]);
    // Migrace proběhla, přestože jsme zavolali jen nactiRezervace.
    expect(stav.vycepy).toHaveLength(1);
    expect(stav.vycepy[0].nazev).toBe('Výčep #1');
  });

  it('nactiVycepy zavolaná jako první migraci spustí a vrátí přenesená data', async () => {
    ulozMistniVycep('t1', 'Výčep #1');
    const vycepy = await nactiVycepy();
    expect(vycepy).toHaveLength(1);
    expect(vycepy[0].name).toBe('Výčep #1');
    expect(stav.vycepy).toHaveLength(1);
  });

  it('když databáze už něco má, migrace ji nepřepíše', async () => {
    stav.vycepy.push({ id: 'existing', nazev: 'Existující výčep', typ: 'jednokohout', stav: 'clean', kohouty_rozebrane: false, poradi: 0 });
    ulozMistniVycep('t1', 'Nový výčep z prohlížeče');
    await nactiVycepy();
    expect(stav.vycepy).toHaveLength(1);
    expect(stav.vycepy[0].nazev).toBe('Existující výčep');
  });

  it('opakované volání po migraci nezkusí migrovat znovu (žádná duplicita)', async () => {
    ulozMistniVycep('t1', 'Výčep #1');
    await nactiVycepy();
    await nactiRezervace();
    await nactiVycepy();
    expect(stav.vycepy).toHaveLength(1);
  });

  it('prázdný prohlížeč i prázdná databáze — nic se nestane, žádná chyba', async () => {
    const vycepy = await nactiVycepy();
    expect(vycepy).toEqual([]);
    expect(stav.vycepy).toEqual([]);
  });
});
