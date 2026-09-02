#!/usr/bin/env node
/**
 * Složí vybrané migrace do JEDNOHO SQL k vložení do Supabase → SQL Editoru.
 *
 * K čemu to je: `apply-migration.mjs` pouští migrace přes Management API, což
 * potřebuje síť ven a token. Když se ven nedá (zavřená egress politika) nebo
 * token po ruce není, tohle vypíše totéž k ručnímu vložení — a člověk pustí
 * jedno okno místo pěti souborů po sobě.
 *
 * SCHVÁLNĚ SE NIC NEUKLÁDÁ DO REPA: obsah se skládá z `supabase/migrations/`
 * při každém spuštění. Kdyby tu ležela hotová kopie, rozešla by se s originálem
 * a jednou by někdo pustil starou verzi migrace.
 *
 * Použití:
 *   node scripts/slozit-migrace.mjs 20261226080000_neco.sql 20261226070000_jine.sql
 *   node scripts/slozit-migrace.mjs ... > /tmp/pustit.sql
 *
 * Pořadí argumentů = pořadí spuštění. Zabalené je to do jedné transakce:
 * když spadne kterákoli část, nezůstane databáze v půlce.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
const soubory = process.argv.slice(2);

if (soubory.length === 0) {
  console.error('Použití: node scripts/slozit-migrace.mjs <migrace.sql> [další.sql ...]');
  process.exit(1);
}

const casti = [];
for (const nazev of soubory) {
  const cesta = join(KOREN, 'supabase', 'migrations', nazev);
  let sql;
  try {
    sql = await readFile(cesta, 'utf8');
  } catch {
    console.error(`Migrace ${nazev} v supabase/migrations/ není.`);
    process.exit(1);
  }
  casti.push(
    [
      '-- ' + '='.repeat(73),
      `-- ${nazev}`,
      '-- ' + '='.repeat(73),
      sql.trimEnd(),
    ].join('\n'),
  );
}

const hlavicka = [
  '-- Složeno skriptem scripts/slozit-migrace.mjs — needituj tady, uprav',
  '-- původní migrace v supabase/migrations/ a spusť skript znovu.',
  '--',
  '-- Vlož celé do Supabase → SQL Editor a spusť. Je to jedna transakce:',
  '-- když kterákoli část spadne, neprovede se nic a databáze zůstane, jak byla.',
  '',
  'BEGIN;',
  '',
].join('\n');

console.log(hlavicka + casti.join('\n\n') + '\n\nCOMMIT;\n');
