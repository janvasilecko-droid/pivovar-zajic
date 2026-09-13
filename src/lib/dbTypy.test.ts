import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BACKUP_TABLES } from './backup';

// Typová kontrola (`satisfies readonly NazevTabulky[]` v backup.ts) hlídá
// totéž při `tsc`; tenhle test to řekne i v `vitest`, kde se typy nekontrolují.
describe('vygenerované typy databáze', () => {
  // Na Windows git soubor rozbalí s CRLF — `$` by pak před \r nesedělo.
  const typy = readFileSync('src/lib/database.types.ts', 'utf8').replace(/\r\n/g, '\n');

  it('každá zálohovaná tabulka v databázi opravdu existuje', () => {
    const chybi = BACKUP_TABLES.filter((t) => !new RegExp(`^\\s{6}${t}: \\{$`, 'm').test(typy));
    expect(chybi).toEqual([]);
  });

  it('soubor je vygenerovaný, ne ručně psaný', () => {
    expect(typy).toMatch(/export type Database = \{/);
    expect(typy).toMatch(/export type Tables</);
  });
});
