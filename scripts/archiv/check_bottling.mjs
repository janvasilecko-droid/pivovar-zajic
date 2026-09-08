
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load env
const env = readFileSync('d:/stazene/zajic/project/.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const serviceKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, serviceKey);

const { data: bottling, error } = await supabase
  .from('bottling')
  .select('id, entry_date, beer_id, beer_name, package_id, quantity, kegs_used, kegs_used_package_id, source_volume_l')
  .order('entry_date', { ascending: false });

if (error) {
  console.error('ERROR:', error.message);
  process.exit(1);
}

const { data: packages } = await supabase.from('packages').select('id, name, volume_l, kind');

const pkgMap = new Map((packages ?? []).map((p) => [p.id, p]));

const total = bottling?.length ?? 0;
const withKegs = (bottling ?? []).filter((r) => r.kegs_used && r.kegs_used_package_id).length;
const withoutKegs = total - withKegs;

console.log(`Total bottling records: ${total}`);
console.log(`With kegs_used: ${withKegs}`);
console.log(`Without kegs_used: ${withoutKegs}`);
console.log('');

console.log('=== Sample of records WITHOUT kegs_used (most recent 30) ===');
(bottling ?? [])
  .filter((r) => !r.kegs_used || !r.kegs_used_package_id)
  .slice(0, 30)
  .forEach((r) => {
    const pkg = pkgMap.get(r.package_id);
    console.log(`${r.entry_date} | ${r.beer_name} | ${pkg?.name ?? r.package_id} (${pkg?.volume_l}L) | qty=${r.quantity}`);
  });

console.log('');
console.log('=== Sample of records WITH kegs_used (most recent 30) ===');
(bottling ?? [])
  .filter((r) => r.kegs_used && r.kegs_used_package_id)
  .slice(0, 30)
  .forEach((r) => {
    const pkg = pkgMap.get(r.package_id);
    const kegPkg = pkgMap.get(r.kegs_used_package_id);
    console.log(`${r.entry_date} | ${r.beer_name} | ${pkg?.name ?? r.package_id} (${pkg?.volume_l}L) | qty=${r.quantity} | kegs_used=${r.kegs_used} | source=${kegPkg?.name ?? r.kegs_used_package_id}`);
  });
