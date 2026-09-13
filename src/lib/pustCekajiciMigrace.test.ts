import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { ZACATEK_EVIDENCE as ZACATEK_V_APLIKACI } from './migraceStav';

// Skript je čisté .mjs pro Node (běží v CI). Volá se proto skutečným Node,
// ne přes transformaci vitestu — tak se testuje přesně to, co poběží v CI.
function zeSkriptu(kod: string): unknown {
  const vystup = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', `import * as m from './scripts/pust-cekajici-migrace.mjs'; console.log(JSON.stringify(${kod}));`],
    { encoding: 'utf8' },
  );
  return JSON.parse(vystup.trim().split('\n').pop()!);
}

const nebezpecna = (sql: string) => zeSkriptu(`m.nebezpecna(${JSON.stringify(sql)})`) as string | null;

describe('automatické migrace z CI — pojistky', () => {
  it('hranice evidence sedí s aplikací', () => {
    expect(zeSkriptu('m.ZACATEK_EVIDENCE')).toBe(ZACATEK_V_APLIKACI);
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

  it('dnešní migrace v repu by automat nezastavily omylem', () => {
    for (const f of ['20261231050000_varky_mereni_a_kvasnice.sql', '20261231040000_historie_zmen_cen.sql']) {
      expect(nebezpecna(readFileSync(`supabase/migrations/${f}`, 'utf8')), f).toBeNull();
    }
  });
});
