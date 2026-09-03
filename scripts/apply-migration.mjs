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

// Zapsat do evidence aplikovaných migrací (tabulka migrace_aplikovane,
// migrace 20261227010000). Bez toho soubory v repozitáři neříkají nic o tom,
// co na produkci doopravdy běží — dvě čekající migrace tak dva dny nikdo
// neviděl. Zápis jde stejnou cestou jako migrace sama, takže nepotřebuje
// žádný další klíč.
//
// Selhání zápisu NESMÍ přebít výsledek migrace: migrace se povedla a to je
// to podstatné. Jen se to řekne nahlas.
if (resp.ok) {
  const zapis = `INSERT INTO public.migrace_aplikovane (nazev, zdroj)
    VALUES ('${migrationName.replace(/'/g, "''")}', 'apply-migration.mjs')
    ON CONFLICT (nazev) DO NOTHING;`;
  const respZapis = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: zapis }),
  });
  if (respZapis.ok) {
    console.log(`Zapsáno do evidence migrací: ${migrationName}`);
  } else {
    console.warn(
      `POZOR: migrace prošla, ale do evidence se nezapsala (HTTP ${respZapis.status}).`
      + ' Přehled v Nastavení ji bude ukazovat jako čekající.'
      + ' Nejčastější důvod: tabulka migrace_aplikovane ještě neexistuje'
      + ' (pusť migraci 20261227010000_evidence_migraci.sql).',
    );
  }
}

// Pozn.: nepoužíváme process.exit() — na Windows padá Node na fetch handles (assert v async.c).
process.exitCode = resp.ok ? 0 : 1;

