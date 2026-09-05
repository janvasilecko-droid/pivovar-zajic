import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('d:/stazene/zajic/project/.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const serviceKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, serviceKey);

const MONTH = '2026-08';

const [{ data: beers }, { data: packages }, { data: inv }, { data: bt }, { data: kg }, { data: fa }, { data: fp }, { data: wo }, { data: ords }, { data: oi }] = await Promise.all([
  supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
  supabase.from('packages').select('*').order('sort_order'),
  supabase.from('inventory').select('*'),
  supabase.from('bottling').select('*'),
  supabase.from('kegging').select('*'),
  supabase.from('fasovani').select('*'),
  supabase.from('fasovani_private').select('*'),
  supabase.from('writeoffs').select('*'),
  supabase.from('orders').select('id, order_date, status'),
  supabase.from('order_items').select('order_id, beer_id, package_id, quantity'),
]);

const pkgMap = new Map((packages ?? []).map((p) => [p.id, p]));
const beerMap = new Map((beers ?? []).map((b) => [b.id, b]));
const filterMonth = (d) => d && d.startsWith(MONTH);

console.log('=== Inventory (initial stock) for', MONTH, '===');
(inv ?? []).filter((r) => filterMonth(r.entry_date)).forEach((r) => {
  console.log(`  ${beerMap.get(r.beer_id)?.name} | ${pkgMap.get(r.package_id)?.label} | qty=${r.quantity}`);
});

console.log('\n=== Bottling for', MONTH, '===');
(bt ?? []).filter((r) => filterMonth(r.entry_date)).forEach((r) => {
  const pkg = pkgMap.get(r.package_id);
  const kegPkg = pkgMap.get(r.kegs_used_package_id);
  console.log(`  ${r.entry_date} | ${beerMap.get(r.beer_id)?.name} | ${pkg?.label} | qty=${r.quantity} | kegs_used=${r.kegs_used} | source=${kegPkg?.label}`);
});

console.log('\n=== Kegging for', MONTH, '===');
(kg ?? []).filter((r) => filterMonth(r.entry_date)).forEach((r) => {
  console.log(`  ${r.entry_date} | ${beerMap.get(r.beer_id)?.name} | ${pkgMap.get(r.package_id)?.label} | qty=${r.quantity}`);
});

console.log('\n=== Fasování for', MONTH, '===');
(fa ?? []).filter((r) => filterMonth(r.entry_date)).forEach((r) => {
  console.log(`  ${r.entry_date} | ${beerMap.get(r.beer_id)?.name} | ${pkgMap.get(r.package_id)?.label} | qty=${r.quantity}`);
});

console.log('\n=== Prodejna for', MONTH, '===');
(fp ?? []).filter((r) => filterMonth(r.entry_date)).forEach((r) => {
  console.log(`  ${r.entry_date} | ${beerMap.get(r.beer_id)?.name} | ${pkgMap.get(r.package_id)?.label} | qty=${r.quantity}`);
});

console.log('\n=== Writeoffs for', MONTH, '===');
(wo ?? []).filter((r) => filterMonth(r.entry_date)).forEach((r) => {
  console.log(`  ${r.entry_date} | ${beerMap.get(r.beer_id)?.name} | ${pkgMap.get(r.package_id)?.label} | qty=${r.quantity}`);
});

console.log('\n=== Orders for', MONTH, '===');
const orderIds = new Set((ords ?? []).filter((o) => filterMonth(o.order_date) && o.status !== 'storno').map((o) => o.id));
(oi ?? []).filter((r) => orderIds.has(r.order_id)).forEach((r) => {
  console.log(`  ${beerMap.get(r.beer_id)?.name} | ${pkgMap.get(r.package_id)?.label} | qty=${r.quantity}`);
});

console.log('\n=== All bottling records (any month) ===');
(bt ?? []).forEach((r) => {
  const pkg = pkgMap.get(r.package_id);
  const kegPkg = pkgMap.get(r.kegs_used_package_id);
  console.log(`  ${r.entry_date} | ${beerMap.get(r.beer_id)?.name} | ${pkg?.label} | qty=${r.quantity} | kegs_used=${r.kegs_used} | source=${kegPkg?.label}`);
});
