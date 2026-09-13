import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — .mjs skript bez typů
import { nebezpecna, ZACATEK_EVIDENCE } from '../../scripts/pust-cekajici-migrace.mjs';
import { ZACATEK_EVIDENCE as ZACATEK_V_APLIKACI } from './migraceStav';

describe('automatické migrace z CI — pojistky', () => {
  it('hranice evidence sedí s aplikací', () => {
    expect(ZACATEK_EVIDENCE).toBe(ZACATEK_V_APLIKACI);
  });

  it('běžné přidání sloupce a politiky projde', () => {
    expect(nebezpecna('ALTER TABLE beers ADD COLUMN IF NOT EXISTS x int;\nDROP POLICY IF EXISTS p ON beers;')).toBeNull();
  });

  it('mazání tabulky, obsahu nebo sloupce se automaticky nepustí', () => {
    expect(nebezpecna('DROP TABLE public.stara;')).toMatch(/DROP TABLE/);
    expect(nebezpecna('TRUNCATE public.orders;')).toMatch(/TRUNCATE/);
    expect(nebezpecna('ALTER TABLE beers DROP COLUMN x;')).toMatch(/DROP COLUMN/);
    expect(nebezpecna('DELETE FROM public.orders;')).toMatch(/bez WHERE/);
  });

  it('DELETE s WHERE a zmínka v komentáři nevadí', () => {
    expect(nebezpecna("DELETE FROM public.push_odbery WHERE posledni_chyba = 'gone';")).toBeNull();
    expect(nebezpecna('-- dřív se tu dělalo DROP TABLE, už ne\nSELECT 1;')).toBeNull();
  });

  it('výjimku jde v souboru vědomě povolit', () => {
    expect(nebezpecna('-- auto-migrace: povoleno\nDROP TABLE public.stara;')).toBeNull();
  });

  it('žádná z dnešních migrací v repu by automat nezastavila omylem', () => {
    const sql = readFileSync('supabase/migrations/20261231050000_varky_mereni_a_kvasnice.sql', 'utf8');
    expect(nebezpecna(sql)).toBeNull();
  });
});
