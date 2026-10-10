// Sudy ze skladu v řezu (10. 10. 2026): zápis jako Přefuk „do řezu", vrácení na sklad při smazání.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const volani: { tabulka: string; akce: string; data?: unknown; filtr?: string; strop?: number }[] = [];
let ulozeno: Record<string, unknown>[] = [];
vi.mock('./supabase', () => ({
  supabase: {
    from: (tabulka: string) => ({
      insert: async (data: unknown) => { volani.push({ tabulka, akce: 'insert', data }); return { error: null }; },
      select: () => ({
        ilike: (_c: string, vzor: string) => ({
          // Dotaz musí mít výslovný strop (hlídač stránkování), tak ho mock vyžaduje.
          limit: async (strop: number) => { volani.push({ tabulka, akce: 'select', filtr: vzor, strop }); return { data: ulozeno, error: null }; },
        }),
      }),
      delete: () => ({ eq: async (_c: string, id: string) => { volani.push({ tabulka, akce: 'delete', filtr: id }); return { error: null }; } }),
    }),
  },
}));

import { obnovSudy, odectiSudyDoRezu, radkyPrefukuDoRezu, sudyKRadku, vratSudyRadku } from './rezaniSudy';

const sudy = [
  { pkgId: 'k30', label: 'KEG 30l', pocet: 1 },
  { pkgId: 'k20', label: 'KEG 20l', pocet: 1 },
  { pkgId: 'k15', label: 'KEG 15l', pocet: 1 },
  { pkgId: 'k50', label: 'KEG 50l', pocet: 0 }, // nula se nezapisuje
];
const zaklad = { keggingId: 'abc', beer: { id: 'b10', name: '10° Desítka' }, sudy, datum: '2026-10-09', popis: 'Řez: Tank 1 50 % + sudy ze skladu 50 % (65 l)' };

describe('sudy ze skladu do řezu', () => {
  beforeEach(() => { volani.length = 0; ulozeno = []; });

  it('jeden řádek přefuku na velikost sudu, bez cílového obalu, se značkou řezu', () => {
    const r = radkyPrefukuDoRezu(zaklad);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({
      entry_date: '2026-10-09', beer_id: 'b10', beer_name: '10° Desítka',
      from_package_id: 'k30', from_package_label: 'KEG 30l', from_count: 1,
      to_package_id: null, to_package_label: null, to_count: 0,
      note: 'Do řezu: Řez: Tank 1 50 % + sudy ze skladu 50 % (65 l) [rez:abc]',
    });
    expect(r.map((x) => x.from_package_id)).toEqual(['k30', 'k20', 'k15']);
  });

  it('zapíše je jedním dotazem do keg_prefuk', async () => {
    expect(await odectiSudyDoRezu(zaklad)).toBeNull();
    expect(volani).toHaveLength(1);
    expect(volani[0]).toMatchObject({ tabulka: 'keg_prefuk', akce: 'insert' });
    expect((volani[0].data as unknown[]).length).toBe(3);
  });

  it('bez sudů se nezapisuje nic', async () => {
    expect(await odectiSudyDoRezu({ ...zaklad, sudy: [] })).toBeNull();
    expect(volani).toHaveLength(0);
  });

  it('najde sudy jen podle značky tohoto řádku (jiný řez ne)', async () => {
    ulozeno = [
      { id: 'p1', note: 'Do řezu: x [rez:abc]' },
      { id: 'p2', note: 'Do řezu: y [rez:abcd]' }, // jiné id, které s tímhle začíná
      { id: 'p3', note: 'Přefuk 3× ze sudu' },
    ];
    const nalezene = await sudyKRadku('abc');
    expect(nalezene.map((r) => r.id)).toEqual(['p1']);
  });

  it('smazání řádku řezu vrátí sudy na sklad (smaže přefuk) a vrátí je pro „Zpět"', async () => {
    ulozeno = [{ id: 'p1', note: 'Do řezu: x [rez:abc]', from_count: 1 }];
    const vracene = await vratSudyRadku('abc');
    expect(vracene).toEqual([{ id: 'p1', note: 'Do řezu: x [rez:abc]', from_count: 1 }]);
    expect(volani.filter((v) => v.akce === 'delete').map((v) => v.filtr)).toEqual(['p1']);
    volani.length = 0;
    await obnovSudy(vracene);
    expect(volani).toEqual([{ tabulka: 'keg_prefuk', akce: 'insert', data: vracene[0] }]);
  });
});
