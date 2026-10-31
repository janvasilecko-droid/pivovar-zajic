// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adresaSeznamuSql, JMENO_MIGRACE, prekazkaTransakce, sqlMigrace, VYCHOZI_APP_URL } from './migrace';

const SLOZKA = join(__dirname, '..', '..', 'migrations');

describe('bible-migrace', () => {
  it('jména migrací', () => {
    expect(JMENO_MIGRACE.test('20261101000000_bible_zaklad.sql')).toBe(true);
    expect(JMENO_MIGRACE.test('../20261101000000_x.sql')).toBe(false);
    expect(JMENO_MIGRACE.test('20261101000000_x.sql; DROP TABLE x')).toBe(false);
    expect(JMENO_MIGRACE.test('2026110100000_x.sql')).toBe(false);
  });

  it('SQL se bere jen z nasazené appky (cizí adresu nepřijme)', () => {
    expect(adresaSeznamuSql(undefined, 5)).toBe(`${VYCHOZI_APP_URL}/migrace-bible-sql.json?t=5`);
    expect(adresaSeznamuSql('https://jina.pages.dev/', 5)).toBe('https://jina.pages.dev/migrace-bible-sql.json?t=5');
    expect(adresaSeznamuSql('http://zlo.example', 5)).toBe(`${VYCHOZI_APP_URL}/migrace-bible-sql.json?t=5`);
    expect(adresaSeznamuSql('https://zlo.example?x=1', 5)).toBe(`${VYCHOZI_APP_URL}/migrace-bible-sql.json?t=5`);
  });

  it('SQL ze seznamu', () => {
    expect(sqlMigrace({ sql: { 'a.sql': 'SELECT 1;' } }, 'a.sql')).toBe('SELECT 1;');
    expect(sqlMigrace({ sql: { 'a.sql': '  ' } }, 'a.sql')).toBeNull();
    expect(sqlMigrace({ sql: {} }, 'a.sql')).toBeNull();
    expect(sqlMigrace(null, 'a.sql')).toBeNull();
    expect(sqlMigrace({ sql: 'x' }, 'a.sql')).toBeNull();
  });

  it('migrace, která by rozbila jednu transakci, se nepustí', () => {
    expect(prekazkaTransakce('BEGIN;\nCREATE TABLE x();\nCOMMIT;')).toMatch(/BEGIN/);
    expect(prekazkaTransakce('CREATE INDEX CONCURRENTLY i ON x(a);')).toMatch(/CONCURRENTLY/);
    expect(prekazkaTransakce('VACUUM x;')).toMatch(/VACUUM/);
    expect(prekazkaTransakce('-- COMMIT; jen v komentáři\nDO $$ BEGIN PERFORM 1; END $$;')).toBeNull();
  });

  it('všechny migrace bible jdou pustit v jedné transakci a mají platné jméno', () => {
    const soubory = readdirSync(SLOZKA).filter((s) => s.endsWith('.sql'));
    expect(soubory.length).toBeGreaterThan(0);
    for (const s of soubory) {
      expect(JMENO_MIGRACE.test(s), s).toBe(true);
      expect(prekazkaTransakce(readFileSync(join(SLOZKA, s), 'utf8')), s).toBeNull();
    }
  });
});
