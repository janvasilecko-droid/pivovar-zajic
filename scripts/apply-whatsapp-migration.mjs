#!/usr/bin/env node
/**
 * Applies the whatsapp_incoming migration to the production Supabase project
 * via the Management API. Requires env var SB_TOKEN (Supabase Personal Access Token).
 * Usage: $env:SB_TOKEN='sbp_...'; node scripts/apply-whatsapp-migration.mjs
 */
import { readFile } from 'node:fs/promises';

const token = process.env.SB_TOKEN;
if (!token) {
  console.error('Missing SB_TOKEN environment variable');
  process.exit(1);
}

const projectRef = 'sasqexjadvlqyticxwja';
const migrationName = process.argv[2] || '20260807120000_add_whatsapp_incoming_table.sql';
const migrationFile = new URL(`../supabase/migrations/${migrationName}`, import.meta.url);
const sql = await readFile(migrationFile, 'utf8');

console.log(`Applying migration ${migrationFile.pathname.split('/').pop()} ...`);
const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const text = await resp.text();
console.log(`HTTP ${resp.status}`);
console.log(text);
process.exit(resp.ok ? 0 : 1);
