// 🐛 5. 11. 2026, test výčepů: tlačítka „Opláchnuto“ / „Louh“ i přidání výčepu
// posílala do databáze datum jako ČESKÝ TEXT („5. 11. 2026 11:06“ — tak ho dělá
// toLocaleDateString('cs-CZ')). Sloupce `posledni_oplach` a
// `posledni_sanitace_louhem` jsou ale timestamptz a Postgres takový text
// odmítne: invalid input syntax for type timestamp with time zone.
// Výsledek: výčep ani oplach se nikdy neuložil, obrazovka ho jen chvíli držela
// v paměti a v prohlížeči — a při dalším načtení z databáze zmizel. V ostré
// databázi proto byly 0 výčepů a 0 rezervací.
//
// Ověřeno na skutečném Postgresu (PGlite, `select '5. 11. 2026 11:06'::timestamptz`).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const zapsane = vi.hoisted(() => ({ vycepy: [] as any[] }));

vi.mock('./supabase', () => ({
  supabase: {
    from: (tabulka: string) => {
      if (tabulka !== 'vycepy') throw new Error(`neočekávaná tabulka v testu: ${tabulka}`);
      return {
        upsert: async (radek: any) => { zapsane.vycepy.push(radek); return { error: null }; },
        insert: async (radky: any[]) => { zapsane.vycepy.push(...radky); return { error: null }; },
        select: (_c: string, opts?: { head?: boolean }) => {
          if (opts?.head) return Promise.resolve({ count: 0, error: null });
          return { order: () => ({ order: async () => ({ data: [], error: null }) }) };
        },
      };
    },
  },
}));

import { naIsoCas, ukazCas, ulozVycep, vycistiMigraciProTesty } from './vycepyData';

beforeEach(() => {
  zapsane.vycepy = [];
  localStorage.clear();
  vycistiMigraciProTesty();
});

// Čas v místním pásmu zařízení — tak ho vyrobil toLocaleTimeString.
const mistni = (r: number, m: number, d: number, h = 0, min = 0) => new Date(r, m - 1, d, h, min).toISOString();

describe('naIsoCas — převod na čas, který databáze přijme', () => {
  it('český zápis z tlačítek („5. 11. 2026 11:06“, mezery za tečkami) se převede', () => {
    expect(naIsoCas('5. 11. 2026 11:06')).toBe(mistni(2026, 11, 5, 11, 6));
    expect(naIsoCas('25. 11. 2026 9:05')).toBe(mistni(2026, 11, 25, 9, 5));
  });

  it('český zápis bez mezer a bez času', () => {
    expect(naIsoCas('5.11.2026 11:06')).toBe(mistni(2026, 11, 5, 11, 6));
    expect(naIsoCas('5. 11. 2026')).toBe(mistni(2026, 11, 5));
  });

  it('den a měsíc se nezamění (25. 11. není 11. 25.)', () => {
    expect(naIsoCas('25. 11. 2026 11:06')).toBe(mistni(2026, 11, 25, 11, 6));
    expect(naIsoCas('5. 11. 2026 11:06')).not.toBe(mistni(2026, 5, 11, 11, 6));
  });

  it('už platný čas (z databáze, ISO) zůstane stejný okamžik', () => {
    expect(naIsoCas('2026-11-05T10:06:00.000Z')).toBe('2026-11-05T10:06:00.000Z');
    expect(naIsoCas('2026-11-05T11:06:00+01:00')).toBe('2026-11-05T10:06:00.000Z');
    expect(naIsoCas('2026-11-05T10:06:00+00:00')).toBe('2026-11-05T10:06:00.000Z');
  });

  it('starší ukázkový zápis „2026-07-26 18:00“ (místní čas)', () => {
    expect(naIsoCas('2026-07-26 18:00')).toBe(mistni(2026, 7, 26, 18, 0));
  });

  it('neexistující datum se nepřijme (31. 2.)', () => {
    expect(naIsoCas('31. 2. 2026 10:00')).toBeNull();
  });

  it('prázdné a nesmyslné → null (ne výjimka, ne špatné datum)', () => {
    for (const v of [undefined, null, '', '   ', 'někdy loni', 'zítra', '99. 99. 2026']) {
      expect(naIsoCas(v as string | null | undefined)).toBeNull();
    }
  });
});

describe('ukazCas — jak se čas ukáže na kartě výčepu', () => {
  it('čas z databáze (ISO) se ukáže česky, ne jako „2026-11-05T10:06:00+00:00“', () => {
    const iso = mistni(2026, 11, 5, 11, 6);
    expect(ukazCas(iso)).toMatch(/^5\. 11\. 2026 11:06$/);
  });

  it('starý český zápis se ukáže stejně', () => {
    expect(ukazCas('5. 11. 2026 11:06')).toBe('5. 11. 2026 11:06');
  });

  it('co se přečíst nedá, se ukáže tak, jak to je; prázdné je prázdné', () => {
    expect(ukazCas('někdy loni')).toBe('někdy loni');
    expect(ukazCas(undefined)).toBe('');
    expect(ukazCas('')).toBe('');
  });
});

describe('ulozVycep — do databáze odejde jen platný čas', () => {
  const vycep = (patch: Record<string, unknown>) => ({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Výčep A',
    tap_type: 'jednokohout',
    status: 'clean',
    taps_disassembled: true,
    ...patch,
  }) as any;

  it('výčep s českým časem oplachu se uloží s platným časem (dřív databáze spadla)', async () => {
    const chyba = await ulozVycep(vycep({ last_water_rinse: '5. 11. 2026 11:06' }));
    expect(chyba).toBeNull();
    expect(zapsane.vycepy).toHaveLength(1);
    expect(zapsane.vycepy[0].posledni_oplach).toBe(mistni(2026, 11, 5, 11, 6));
    expect(zapsane.vycepy[0].posledni_sanitace_louhem).toBeNull();
  });

  it('louh se převádí stejně', async () => {
    await ulozVycep(vycep({ last_louh_sanitation: '25. 11. 2026 9:05' }));
    expect(zapsane.vycepy[0].posledni_sanitace_louhem).toBe(mistni(2026, 11, 25, 9, 5));
  });

  it('nečitelný čas nesmí shodit uložení celého výčepu — uloží se bez něj', async () => {
    const varovani = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const chyba = await ulozVycep(vycep({ last_water_rinse: 'někdy loni' }));
    expect(chyba).toBeNull();
    expect(zapsane.vycepy[0].posledni_oplach).toBeNull();
    varovani.mockRestore();
  });

  it('bez oplachu zůstane null', async () => {
    await ulozVycep(vycep({}));
    expect(zapsane.vycepy[0].posledni_oplach).toBeNull();
  });
});
