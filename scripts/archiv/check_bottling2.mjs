import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

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

const { data: packages } = await supabase.from('packages').select('id, code, label, volume_l, kind');
console.log('=== All packages ===');
(packages ?? []).forEach((p) => console.log(`${p.id} | ${p.label} | ${p.volume_l}L | ${p.kind}`));

const pkgMap = new Map((packages ?? []).map((p) => [p.id, p]));

console.log('');
console.log('=== All bottling records ===');
(bottling ?? []).forEach((r) => {
  const pkg = pkgMap.get(r.package_id);
  const kegPkg = pkgMap.get(r.kegs_used_package_id);
  console.log(`${r.entry_date} | ${r.beer_name} | pkg=${pkg?.label ?? 'MISSING:' + r.package_id} (${pkg?.volume_l}L) | qty=${r.quantity} | kegs_used=${r.kegs_used} | source=${kegPkg?.label ?? 'MISSING:' + r.kegs_used_package_id} (${kegPkg?.volume_l}L) | srcL=${r.source_volume_l}`);
});
