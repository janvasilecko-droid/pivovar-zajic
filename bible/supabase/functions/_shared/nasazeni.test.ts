// @vitest-environment node
// Hlídač tvaru funkcí projektu bible — chyby, které by se jinak ukázaly až v provozu.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AKCE } from './vstupy';

const FUNKCE = join(__dirname, '..');
const CONFIG = readFileSync(join(__dirname, '..', '..', 'config.toml'), 'utf8');

const slozkyFunkci = readdirSync(FUNKCE).filter((s) => !s.startsWith('_') && statSync(join(FUNKCE, s)).isDirectory());
const zdroj = (slug: string) => readFileSync(join(FUNKCE, slug, 'index.ts'), 'utf8');

describe('funkce projektu bible', () => {
  it('jsou bible-api a bible-migrace', () => {
    expect(slozkyFunkci.sort()).toEqual(['bible-api', 'bible-migrace']);
    for (const s of slozkyFunkci) expect(existsSync(join(FUNKCE, s, 'index.ts')), s).toBe(true);
  });

  it('každá má v config.toml verify_jwt = false (token hlavního projektu by jinak platforma odmítla)', () => {
    for (const s of slozkyFunkci) {
      const blok = CONFIG.match(new RegExp(`\\[functions\\.${s}\\]([^[]*)`));
      expect(blok, `[functions.${s}] chybí v bible/supabase/config.toml`).not.toBeNull();
      expect(blok?.[1]).toMatch(/^\s*verify_jwt\s*=\s*false\s*$/m);
    }
    expect(CONFIG).toMatch(/^project_id\s*=\s*"cegrelgvkygcatupqwrx"$/m);
  });

  it('každá ověřuje přihlášení bránou před prací s databází', () => {
    for (const s of slozkyFunkci) {
      const kod = zdroj(s);
      expect(kod, s).toMatch(/overUzivatele\(/);
      expect(kod.indexOf('overUzivatele('), s).toBeLessThan(kod.indexOf('createClient(url'));
    }
  });

  it('bible-api zapisuje jen přes SQL funkce, které hlídají práva (žádný přímý insert/update/delete)', () => {
    const kod = zdroj('bible-api');
    expect(kod).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(kod).toMatch(/rpc\('bible_zaloz_nahrani'/);
  });

  it('každá akce z AKCE má v bible-api obsluhu (chybějící by se ukázala až jako 500 za běhu)', () => {
    const kod = zdroj('bible-api');
    const akce = Object.keys(AKCE);
    expect(akce.length).toBeGreaterThan(0);
    for (const a of akce) expect(kod, a).toMatch(new RegExp(`\\n  async ${a}\\(`));
  });

  it('čtení knihy nejdřív ověří, že je zpracovaná (worker zapisuje kapitoly a pasáže po částech)', () => {
    const kod = zdroj('bible-api');
    for (const akce of ['kniha', 'listy', 'objekty']) {
      const zacatek = kod.indexOf(`  async ${akce}(`);
      const telo = kod.slice(zacatek, kod.indexOf('\n  },', zacatek));
      expect(telo, akce).toMatch(/await citelnyDokument\(db, id, cors, /);
      const overeni = telo.indexOf('citelnyDokument(');
      for (const tabulka of ['bible_strany', 'bible_kapitoly', 'bible_pasaze']) {
        const cteni = telo.indexOf(`from('${tabulka}')`);
        if (cteni >= 0) expect(overeni, `${akce}: ${tabulka}`).toBeLessThan(cteni);
      }
    }
  });

  it('soubory smazaných dokumentů se uklízejí (rozběhnuté nahrání s platným odkazem)', () => {
    const kod = zdroj('bible-api');
    expect(kod).toMatch(/rpc\('bible_smazane_k_uklidu'/);
    expect(kod).toMatch(/rpc\('bible_smazane_uklizeno'/);
    for (const akce of ['zalozit_nahrani', 'smazat', 'kapacita']) {
      const telo = kod.slice(kod.indexOf(`async ${akce}(`), kod.indexOf('\n  },', kod.indexOf(`async ${akce}(`)));
      expect(telo, akce).toMatch(/await uklidSmazanych\(db\)/);
    }
  });

  it('do logu nejde token, odkaz ani text chyby z databáze', () => {
    for (const s of slozkyFunkci) {
      for (const radek of zdroj(s).split('\n').filter((r) => /console\.(log|error|warn|info)/.test(r))) {
        expect(radek, `${s}: ${radek.trim()}`).not.toMatch(/token|signedUrl|\.message|zprava|sqlText|telo/);
      }
    }
  });

  it('závislosti jsou připnuté na konkrétní verzi', () => {
    for (const s of slozkyFunkci) {
      for (const m of zdroj(s).matchAll(/from '(npm:[^']+)'/g)) expect(m[1], s).toMatch(/@\d+\.\d+\.\d+$/);
    }
  });
});
