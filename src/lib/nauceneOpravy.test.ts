// Uložení oprav zaškrtnutých „Naučit" v kontrole zprávy (tabulka naucene_opravy).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  radky: [] as Record<string, any>[],
  chyba: null as { code?: string; message: string } | null,
  zapisy: [] as { akce: string; radek: Record<string, any>; id?: string }[],
}));
vi.mock('./supabase', () => {
  function dotaz() {
    const filtry: Record<string, any> = {};
    let zapis: { akce: string; radek: Record<string, any> } | null = null;
    const q: Record<string, any> = {
      select: () => q,
      order: () => q,
      limit: () => Promise.resolve(db.chyba ? { data: null, error: db.chyba } : { data: db.radky, error: null }),
      eq: (s: string, v: any) => {
        filtry[s] = v;
        if (zapis?.akce === 'update') { db.zapisy.push({ ...zapis, id: v }); return Promise.resolve({ error: db.chyba }); }
        if (zapis?.akce === 'delete') { db.zapisy.push({ akce: 'delete', radek: {}, id: v }); return Promise.resolve({ error: db.chyba }); }
        return q;
      },
      maybeSingle: () => Promise.resolve(db.chyba
        ? { data: null, error: db.chyba }
        : { data: db.radky.find((r) => r.misto_klic === filtry.misto_klic && r.klic === filtry.klic) ?? null, error: null }),
      insert: (radek: Record<string, any>) => { db.zapisy.push({ akce: 'insert', radek }); return Promise.resolve({ error: db.chyba }); },
      update: (radek: Record<string, any>) => { zapis = { akce: 'update', radek }; return q; },
      delete: () => { zapis = { akce: 'delete', radek: {} }; return q; },
    };
    return q;
  }
  return { supabase: { from: vi.fn(() => dotaz()), auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'majitel@pivovar.test' } } }) } } };
});

import { ulozNauceneOpravy, nactiNauceneOpravyProSpravu, smazNaucenouOpravu, pocetOprav, CHYBI_MIGRACE_OPRAV } from './nauceneOpravy';

const oprava = (navic: Record<string, any> = {}) => ({
  misto_klic: 'm-luzec', place_id: 'm-luzec', place_name: 'Lužec', radek: '5 beden světlého', klic: 'beden svetleho',
  beer_id: null, package_id: 'p-033', ...navic,
});

describe('ulozNauceneOpravy', () => {
  beforeEach(() => { db.radky = []; db.chyba = null; db.zapisy = []; });

  it('novou opravu vloží — s tím, kdo ji naučil', async () => {
    expect(await ulozNauceneOpravy([oprava()])).toEqual({ ulozeno: 1, chyba: null });
    expect(db.zapisy).toHaveLength(1);
    expect(db.zapisy[0]).toMatchObject({ akce: 'insert', radek: { misto_klic: 'm-luzec', klic: 'beden svetleho', package_id: 'p-033', beer_id: null, created_by: 'majitel@pivovar.test' } });
  });

  it('nové naučení téhož řádku starou opravu doplní — co se teď neopravovalo, zůstane', async () => {
    db.radky = [{ id: 'stara', misto_klic: 'm-luzec', klic: 'beden svetleho', beer_id: 'b-12', package_id: 'p-05' }];
    expect(await ulozNauceneOpravy([oprava()])).toEqual({ ulozeno: 1, chyba: null });
    expect(db.zapisy).toHaveLength(1);
    expect(db.zapisy[0]).toMatchObject({ akce: 'update', id: 'stara', radek: { beer_id: 'b-12', package_id: 'p-033' } });
  });

  it('bez oprav se databáze vůbec nevolá', async () => {
    expect(await ulozNauceneOpravy([])).toEqual({ ulozeno: 0, chyba: null });
    expect(db.zapisy).toEqual([]);
  });

  it('chybí tabulka (migrace ještě neběžela) → srozumitelná hláška, žádná výjimka', async () => {
    db.chyba = { code: 'PGRST205', message: "Could not find the table 'public.naucene_opravy' in the schema cache" };
    expect(await ulozNauceneOpravy([oprava()])).toEqual({ ulozeno: 0, chyba: CHYBI_MIGRACE_OPRAV });
    expect(CHYBI_MIGRACE_OPRAV).toContain('Databázové migrace');
  });

  it('jiná chyba databáze se vrátí tak, jak je', async () => {
    db.chyba = { code: '42501', message: 'new row violates row-level security policy' };
    expect(await ulozNauceneOpravy([oprava()])).toEqual({ ulozeno: 0, chyba: 'new row violates row-level security policy' });
  });
});

describe('přehled a mazání', () => {
  beforeEach(() => { db.radky = []; db.chyba = null; db.zapisy = []; });

  it('vypíše opravy; bez tabulky řekne, že chybí migrace', async () => {
    db.radky = [oprava({ id: 'o1' })];
    expect(await nactiNauceneOpravyProSpravu()).toMatchObject({ chybiMigrace: false, opravy: [{ id: 'o1' }] });
    db.chyba = { code: '42P01', message: 'relation "public.naucene_opravy" does not exist' };
    expect(await nactiNauceneOpravyProSpravu()).toEqual({ opravy: [], chybiMigrace: true });
  });

  it('smaže jednu opravu podle id', async () => {
    await smazNaucenouOpravu('o1');
    expect(db.zapisy).toEqual([{ akce: 'delete', radek: {}, id: 'o1' }]);
  });
});

describe('pocetOprav', () => {
  it('skloňuje', () => {
    expect([1, 2, 4, 5, 12].map(pocetOprav)).toEqual(['1 oprava', '2 opravy', '4 opravy', '5 oprav', '12 oprav']);
  });
});
