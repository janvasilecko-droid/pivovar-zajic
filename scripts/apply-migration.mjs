#!/usr/bin/env node
/**
 * Applies a migration file from supabase/migrations/ to the production
 * Supabase project via the Management API (bez supabase login — viz .env).
 *
 * Použití:
 *   node scripts/apply-migration.mjs [nazev-migrace.sql]
 *
 * Token se vezme z .env (SUPABASE_ACCESS_TOKEN / SB_TOKEN) — viz deploy-function.mjs.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

const projectRef = 'sasqexjadvlqyticxwja';
const migrationName = process.argv[2] || '20261008120000_add_bottling_plans.sql';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const m = env.match(/^\s*(?:SUPABASE_ACCESS_TOKEN|SB_TOKEN)\s*=\s*["']?([^"'\r\n]+)/m);
if (!m) {
  console.error('Chybí SUPABASE_ACCESS_TOKEN / SB_TOKEN v .env');
  process.exit(1);
}
const token = m[1].trim();

const migrationFile = new URL(`../supabase/migrations/${migrationName}`, import.meta.url);
const sql = await readFile(migrationFile, 'utf8');

console.log(`Aplikuji migraci ${migrationFile.pathname.split('/').pop()} (${sql.length} znaků) ...`);
const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await resp.text();
console.log(`HTTP ${resp.status}`);
console.log(text);
// Pozn.: nepoužíváme process.exit() — na Windows padá Node na fetch handles (assert v async.c).
process.exitCode = resp.ok ? 0 : 1;

