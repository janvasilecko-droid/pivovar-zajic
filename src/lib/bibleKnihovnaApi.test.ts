import { describe, it, expect, vi, beforeEach } from 'vitest';

// Falešný klient bible: zaznamená, co se volalo, a vrátí nastavené odpovědi.
type Stav = { tabulka: string; op: 'select' | 'insert' | 'update' | 'delete'; radek?: Record<string, unknown>; filtry: [string, unknown][] };
const volani: string[] = [];
const vlozene: Record<string, unknown>[] = [];
let nalezeneDuplicity: { id: string; nazev: string }[] = [];
let chybaVlozeni: { code?: string; message: string } | null = null;
let chybaNahrani: { statusCode?: string; message: string } | null = null;
let smazaneRadky: { soubor_cesta: string }[] = [];

function vysledek(s: Stav) {
  if (s.op === 'select') return { data: nalezeneDuplicity, error: null };
  if (s.op === 'insert') return chybaVlozeni ? { data: null, error: chybaVlozeni } : { data: { ...s.radek, stav: 'ceka' }, error: null };
  if (s.op === 'delete') return { data: smazaneRadky, error: null };
  return { data: null, error: null };
}

function dotaz(tabulka: string) {
  const s: Stav = { tabulka, op: 'select', filtry: [] };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => { s.filtry.push([k, v]); return b; },
    limit: () => b,
    order: () => b,
    single: () => b,
    insert: (r: Record<string, unknown>) => { s.op = 'insert'; s.radek = r; vlozene.push(r); volani.push(`insert ${tabulka}`); return b; },
    update: (r: Record<string, unknown>) => { s.op = 'update'; s.radek = r; volani.push(`update ${tabulka}`); return b; },
    delete: () => { s.op = 'delete'; volani.push(`delete ${tabulka}`); return b; },
    then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(vysledek(s)).then(ok, ko),
  };
  return b;
}

const rpcVolani: [string, unknown][] = [];

vi.mock('./bibleKlient', () => ({
  bibleDb: {
    from: (t: string) => dotaz(t),
    rpc: async (funkce: string, argumenty: unknown) => {
      rpcVolani.push([funkce, argumenty]);
      return { data: [{ ucel: 'ocr', cena_usd: '1.250000', volani: 1200 }, { ucel: 'chat', cena_usd: 0.5, volani: 3 }], error: null };
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (cesta: string, _soubor: File, opts: { contentType: string; upsert: boolean }) => {
          volani.push(`upload ${bucket} ${cesta} ${opts.contentType} upsert=${opts.upsert}`);
          return { data: chybaNahrani ? null : { path: cesta }, error: chybaNahrani };
        },
        remove: async (cesty: string[]) => { volani.push(`remove ${bucket} ${cesty.join(',')}`); return { data: [], error: null }; },
      }),
    },
  },
}));

import { nactiNakladyMesice, nahrajDokument, smazDokument } from './bibleKnihovnaApi';

const pdf = (jmeno = 'Kunze Technology Brewing.pdf') => new File(['%PDF-1.7 obsah'], jmeno, { type: 'application/pdf' });

beforeEach(() => {
  volani.length = 0;
  vlozene.length = 0;
  nalezeneDuplicity = [];
  chybaVlozeni = null;
  chybaNahrani = null;
  smazaneRadky = [];
});

describe('nahrání dokumentu do knihovny', () => {
  it('nahraje soubor do soukromého bucketu a založí dokument ve stavu „čeká"', async () => {
    const v = await nahrajDokument(pdf(), { nazev: '  Technology Brewing and Malting ', autor: '', jazyk: 'en', oblasti: ['A', 'D'] }, 'Jan');
    expect(v.stav).toBe('nahrano');
    const nahrani = volani.find((x) => x.startsWith('upload'))!;
    expect(nahrani).toMatch(/^upload knihovna [0-9a-f-]{36}\/Kunze-Technology-Brewing\.pdf application\/pdf upsert=false$/);
    const radek = vlozene[0];
    expect(radek.nazev).toBe('Technology Brewing and Malting');
    expect(radek.autor).toBeNull();
    expect(radek.jazyk).toBe('en');
    expect(radek.oblasti).toEqual(['A', 'D']);
    expect(radek.soubor_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(radek.soubor_cesta).toBe(nahrani.split(' ')[2]);
    expect(radek.id).toBe(String(radek.soubor_cesta).split('/')[0]);
    expect(typeof radek.prava_potvrzena_at).toBe('string');
    expect(radek.nahral_jmeno).toBe('Jan');
    // Kdo nahrál a stav doplní databáze sama (výchozí hodnoty + RLS) — klient je neposílá.
    expect(radek).not.toHaveProperty('nahral');
    expect(radek).not.toHaveProperty('prava_potvrdil');
    expect(radek).not.toHaveProperty('stav');
  });

  it('stejný soubor (SHA-256) podruhé nenahraje', async () => {
    nalezeneDuplicity = [{ id: 'x', nazev: 'Kunze (už nahraný)' }];
    const v = await nahrajDokument(pdf(), { nazev: 'Kunze' }, null);
    expect(v).toEqual({ stav: 'duplicita', nazev: 'Kunze (už nahraný)' });
    expect(volani.some((x) => x.startsWith('upload'))).toBe(false);
    expect(vlozene).toHaveLength(0);
  });

  it('nepodporovaný typ nebo prázdný název odmítne bez nahrání', async () => {
    expect((await nahrajDokument(pdf('kniha.mobi'), { nazev: 'X' }, null)).stav).toBe('chyba');
    expect((await nahrajDokument(pdf(), { nazev: '   ' }, null)).stav).toBe('chyba');
    expect(volani).toEqual([]);
  });

  it('když se nepovede zápis dokumentu, soubor z bucketu hned smaže', async () => {
    chybaVlozeni = { code: '42501', message: 'new row violates row-level security policy' };
    const v = await nahrajDokument(pdf(), { nazev: 'Kunze' }, null);
    expect(v.stav).toBe('chyba');
    expect(v.stav === 'chyba' && v.zprava).toMatch(/Nemáš právo/);
    const cesta = volani.find((x) => x.startsWith('upload'))!.split(' ')[2];
    expect(volani).toContain(`remove knihovna ${cesta}`);
  });

  it('souběžné nahrání téhož souboru (unikátní SHA v databázi) skončí jako duplicita a soubor uklidí', async () => {
    chybaVlozeni = { code: '23505', message: 'duplicate key value violates unique constraint "bible_dokumenty_sha256_uniq"' };
    const v = await nahrajDokument(pdf(), { nazev: 'Kunze' }, null);
    expect(v.stav).toBe('duplicita');
    expect(volani.some((x) => x.startsWith('remove'))).toBe(true);
  });

  it('soubor nad limit úložiště: srozumitelná hláška, žádný záznam', async () => {
    chybaNahrani = { statusCode: '413', message: 'The object exceeded the maximum allowed size' };
    const v = await nahrajDokument(pdf(), { nazev: 'Velký sken' }, null);
    expect(v.stav === 'chyba' && v.zprava).toMatch(/50 MB/);
    expect(vlozene).toHaveLength(0);
  });
});

describe('smazání dokumentu', () => {
  it('smaže nejdřív záznam, potom soubor', async () => {
    smazaneRadky = [{ soubor_cesta: 'abc/kniha.pdf' }];
    expect(await smazDokument('abc')).toBeNull();
    expect(volani).toEqual(['delete bible_dokumenty', 'remove knihovna abc/kniha.pdf']);
  });

  it('bez práva (databáze nic nesmaže) soubor nechá a řekne to', async () => {
    smazaneRadky = [];
    expect(await smazDokument('abc')).toMatch(/nemáš na to právo/);
    expect(volani.some((x) => x.startsWith('remove'))).toBe(false);
  });
});

describe('útrata za AI', () => {
  it('sečte databáze (žádný limit 1000 řádků) od začátku měsíce UTC', async () => {
    rpcVolani.length = 0;
    const v = await nactiNakladyMesice(new Date('2026-10-31T23:30:00Z'));
    expect(rpcVolani).toEqual([['bible_naklady_od', { p_od: '2026-10-01T00:00:00.000Z' }]]);
    expect(v).toEqual({ naklady: { usd: 1.75, volani: 1203, podleUcelu: { ocr: 1.25, chat: 0.5 } } });
  });
});
