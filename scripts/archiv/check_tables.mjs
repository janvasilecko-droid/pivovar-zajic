import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('d:/stazene/zajic/project/.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const anonKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, anonKey);

// List all tables in public schema
const { data: tables, error } = await supabase
  .from('information_schema.tables')
  .select('table_name')
  .eq('table_schema', 'public');

if (error) {
  console.error('ERROR listing tables:', error.message);
} else {
  console.log('=== Tables in public schema ===');
  (tables ?? []).forEach((t) => console.log(t.table_name));
}

// Try to count rows in bottling
const { count, error: countErr } = await supabase
  .from('bottling')
  .select('*', { count: 'exact', head: true });

console.log('');
console.log('bottling count:', count, 'error:', countErr?.message ?? 'none');
