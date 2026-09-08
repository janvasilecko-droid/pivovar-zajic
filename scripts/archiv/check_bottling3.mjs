import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('d:/stazene/zajic/project/.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const serviceKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, serviceKey);

const { data: bottling, error } = await supabase
  .from('bottling')
  .select('*')
  .order('entry_date', { ascending: false });

if (error) {
  console.error('ERROR:', error.message);
  process.exit(1);
}

console.log('=== All bottling records (full) ===');
(bottling ?? []).forEach((r) => {
  console.log(JSON.stringify(r));
});
