import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('d:/stazene/zajic/project/.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const serviceKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, serviceKey);

const MONTH = '2026-07';

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

// Replicate EndStockTab logic
const kegPkgIds = new Set((packages ?? []).filter((p) => p.kind === 'keg').map((p) => p.id));

// Initial stock
const initialStock = {};
(inv ?? []).filter((r) => filterMonth(r.entry_date)).forEach((r) => {
  const k = `${r.beer_id}__${r.package_id}`;
  initialStock[k] = Number(r.quantity || 0);
});

// Stáčení KEG
const stacenoKegMap = {};
(kg ?? []).filter((r) => filterMonth(r.entry_date)).forEach((r) => {
  const k = `${r.beer_id}__${r.package_id}`;
  stacenoKegMap[k] = (stacenoKegMap[k] || 0) + Number(r.quantity || 0);
});

// Stáčení lahví (kegs_used)
const stacenoLahveMap = {};
const seenKegSource = new Set();
(bt ?? []).filter((r) => filterMonth(r.entry_date)).forEach((r) => {
  if (r.kegs_used && r.kegs_used_package_id) {
    const key = `${r.entry_date}|${r.beer_id}|${r.kegs_used}|${r.kegs_used_package_id}`;
    if (seenKegSource.has(key)) return;
    seenKegSource.add(key);
    const k = `${r.beer_id}__${r.kegs_used_package_id}`;
    stacenoLahveMap[k] = (stacenoLahveMap[k] || 0) + Number(r.kegs_used || 0);
  }
});

// Fasování
const fasovaniMap = {};
(fa ?? []).filter((r) => filterMonth(r.entry_date)).forEach((r) => {
  const k = `${r.beer_id}__${r.package_id}`;
  fasovaniMap[k] = (fasovaniMap[k] || 0) + Number(r.quantity || 0);
});

// Prodejna
const prodejnaMap = {};
(fp ?? []).filter((r) => filterMonth(r.entry_date)).forEach((r) => {
  const k = `${r.beer_id}__${r.package_id}`;
  prodejnaMap[k] = (prodejnaMap[k] || 0) + Number(r.quantity || 0);
});

// Objednávky
const orderIds = new Set((ords ?? []).filter((o) => filterMonth(o.order_date) && o.status !== 'storno').map((o) => o.id));
const objednavkyMap = {};
(oi ?? []).filter((r) => orderIds.has(r.order_id) && kegPkgIds.has(r.package_id)).forEach((r) => {
  const k = `${r.beer_id}__${r.package_id}`;
  objednavkyMap[k] = (objednavkyMap[k] || 0) + Number(r.quantity || 0);
});

console.log('=== EndStockTab for', MONTH, '===');
console.log('Pivo | Obal | Poč. | StáčKEG | Objednávky | Stáč.lahví | Fasování | Prodejna | Akce | Konec');
for (const b of (beers ?? [])) {
  for (const p of (packages ?? []).filter((p) => p.kind === 'keg')) {
    const k = `${b.id}__${p.id}`;
    const initialQty = Number(initialStock[k] || 0);
    const stacenoKegQty = Number(stacenoKegMap[k] || 0);
    const objednavkyQty = Number(objednavkyMap[k] || 0);
    const stacenoLahveQty = Number(stacenoLahveMap[k] || 0);
    const fasovaniQty = Number(fasovaniMap[k] || 0);
    const prodejnaQty = Number(prodejnaMap[k] || 0);
    const akceQty = 0;
    const endStockQty = initialQty + stacenoKegQty - (objednavkyQty + stacenoLahveQty + fasovaniQty + prodejnaQty + akceQty);
    if (initialQty !== 0 || stacenoKegQty !== 0 || objednavkyQty !== 0 || stacenoLahveQty !== 0 || fasovaniQty !== 0 || prodejnaQty !== 0 || akceQty !== 0) {
      console.log(`${b.name} | ${p.label} | ${initialQty} | +${stacenoKegQty} | -${objednavkyQty} | -${stacenoLahveQty} | -${fasovaniQty} | -${prodejnaQty} | -${akceQty} | ${endStockQty}`);
    }
  }
}
