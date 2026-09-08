import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('d:/stazene/zajic/project/.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const serviceKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, serviceKey);

const { data: packages, error } = await supabase.from('packages').select('id, code, kind, volume_l, label, sort_order').order('sort_order');

if (error) {
  console.error('ERROR:', error.message);
} else {
  console.log(`Total packages: ${packages?.length ?? 0}`);
  (packages ?? []).forEach((p) => console.log(`${p.code} | ${p.label} | ${p.volume_l}L | ${p.kind} | ${p.id}`));
}
