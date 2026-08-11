// Script to clear whatsapp_session table in Supabase.
// Usage: node scripts/clear-whatsapp-session.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const envPath = resolve(projectRoot, '.env');

function readEnv(key) {
  if (!existsSync(envPath)) return '';
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^${key}=(.*)$`));
    if (m) return m[1].trim();
  }
  return '';
}

const url = readEnv('VITE_SUPABASE_URL');
const key = readEnv('VITE_SUPABASE_SERVICE_ROLE_KEY');

if (!url || !key) {
  console.error('Error: VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY not found in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  console.log('Clearing whatsapp_session table...');
  const { data, error } = await supabase
    .from('whatsapp_session')
    .delete()
    .neq('key', '');

  if (error) {
    console.error('Error clearing session:', error.message);
    process.exit(1);
  }

  console.log('Session successfully cleared! Bridge will restart and generate a new QR code.');
}

run();
