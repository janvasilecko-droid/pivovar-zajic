#!/usr/bin/env node
// 🧾 Přegeneruje src/lib/database.types.ts ze skutečného schématu produkce.
// Token se bere z .env (SUPABASE_ACCESS_TOKEN), stejně jako u nasazování
// edge funkcí. Pouští se po spuštění migrací, ať typy odpovídají databázi.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = existsSync(resolve(KOREN, '.env')) ? readFileSync(resolve(KOREN, '.env'), 'utf8') : '';
const token = process.env.SUPABASE_ACCESS_TOKEN
  || env.match(/^\s*SUPABASE_ACCESS_TOKEN\s*=\s*["']?([^"'\r\n]+)/m)?.[1]?.trim();

if (!token) {
  console.error('Chybí SUPABASE_ACCESS_TOKEN (v .env nebo v prostředí).');
  process.exitCode = 1;
} else {
  const typy = execFileSync(
    'npx',
    ['--yes', 'supabase', 'gen', 'types', 'typescript', '--project-id', 'sasqexjadvlqyticxwja', '--schema', 'public'],
    { cwd: KOREN, encoding: 'utf8', env: { ...process.env, SUPABASE_ACCESS_TOKEN: token }, shell: process.platform === 'win32', maxBuffer: 32 * 1024 * 1024 },
  );
  if (!/export type Database = \{/.test(typy)) {
    console.error('Supabase nevrátil typy — soubor se nepřepsal.');
    process.exitCode = 1;
  } else {
    writeFileSync(resolve(KOREN, 'src/lib/database.types.ts'), typy, 'utf8');
    console.log(`Typy uloženy: ${(typy.match(/Row: \{/g) || []).length} tabulek a pohledů.`);
  }
}
