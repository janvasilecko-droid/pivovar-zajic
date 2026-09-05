import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('d:/stazene/zajic/project/.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const serviceKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(url, serviceKey);

function monthKey(dateStr) { return dateStr.slice(0, 7); }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = 1 + Math.round(((thursday.getTime() - yearStart.getTime()) / 86400000 - 3 + ((yearStart.getUTCDay() + 6) % 7)) / 7);
  return `${thursday.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

const [{ data: beers }, { data: packages }, { data: invData }, { data: botData }, { data: kegData }, { data: ordItemsData }, { data: ordData }, { data: woData }, { data: akItemsData }, { data: faData }, { data: fpData }] = await Promise.all([
  supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
  supabase.from('packages').select('*').order('sort_order'),
  supabase.from('inventory').select('*'),
  supabase.from('bottling').select('*'),
  supabase.from('kegging').select('*'),
  supabase.from('order_items').select('*'),
  supabase.from('orders').select('id, order_date, delivery_date, status'),
  supabase.from('writeoffs').select('*'),
  supabase.from('event_items').select('package_id, beer_id, quantity, returned_qty'),
  supabase.from('fasovani').select('*'),
  supabase.from('fasovani_private').select('*'),
]);

const inv = (invData ?? []);
const bot = (botData ?? []);
const keg = (kegData ?? []);
const wo = (woData ?? []);
const fa = (faData ?? []);
const fp = (fpData ?? []);
const ords = (ordData ?? []);
const ordItems = (ordItemsData ?? []);
const akItems = (akItemsData ?? []);

const curMonth = monthKey(todayISO());
const invMonths = [...new Set(inv.map((r) => monthKey(r.entry_date)))].filter((m) => m <= curMonth).sort().reverse();
const lastInvMonth = invMonths[0];
const lastInv = lastInvMonth ? inv.filter((r) => monthKey(r.entry_date) === lastInvMonth) : [];

const weekKey = isoWeekKey(todayISO());
const validOrdIdsWeek = new Set(ords.filter((o) => o.status !== 'storno' && isoWeekKey(o.delivery_date || o.order_date) === weekKey).map((o) => o.id));

const pkgMap = new Map((packages ?? []).map((p) => [p.id, p]));

// Find 12° Světlá
const beer = (beers ?? []).find((b) => b.name.includes('12° Světlá') || b.name.includes('12 Světlá'));
if (!beer) { console.log('12° Světlá NOT FOUND'); process.exit(0); }
console.log('Beer:', beer.name, beer.id);
console.log('Week:', weekKey, '| Last inv month:', lastInvMonth);
console.log('');

console.log('=== Per-package breakdown for', beer.name, '===');
for (const pkg of (packages ?? [])) {
  const fromInv = lastInv.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id).reduce((s, r) => s + Number(r.quantity), 0);
  const brewedW = [...bot, ...keg].filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && r.entry_date <= todayISO()).reduce((s, r) => s + Number(r.quantity), 0);
  const currentStock = fromInv + brewedW;

  const orderedW = ordItems.filter((i) => validOrdIdsWeek.has(i.order_id) && i.beer_id === beer.id && i.package_id === pkg.id).reduce((s, i) => s + Number(i.quantity), 0);
  const woW = wo.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && r.entry_date <= todayISO()).reduce((s, r) => s + Number(r.quantity), 0);
  const fasovaniW = fa.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && r.entry_date <= todayISO()).reduce((s, r) => s + Number(r.quantity), 0);
  const prodejnaW = fp.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id && r.entry_date <= todayISO()).reduce((s, r) => s + Number(r.quantity), 0);
  const akT = akItems.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id).reduce((s, r) => s + Number(r.quantity), 0);
  const akR = akItems.filter((r) => r.beer_id === beer.id && r.package_id === pkg.id).reduce((s, r) => s + Number(r.returned_qty ?? 0), 0);
  const akceWeek = akT - akR;

  const seenKegSource = new Set();
  const kegsUsedW = bot
    .filter((r) => r.beer_id === beer.id && r.kegs_used_package_id === pkg.id && r.entry_date <= todayISO())
    .reduce((s, r) => {
      const key = `${r.entry_date}|${r.beer_id}|${r.kegs_used}|${r.kegs_used_package_id}`;
      if (seenKegSource.has(key)) return s;
      seenKegSource.add(key);
      return s + Number(r.kegs_used ?? 0);
    }, 0);

  const outgoing = fasovaniW + woW + orderedW + prodejnaW + akceWeek + kegsUsedW;
  const difference = currentStock - outgoing;

  if (currentStock > 0 || outgoing > 0) {
    console.log(`${pkg.label} (${pkg.volume_l}L, ${pkg.kind}):`);
    console.log(`  Inv=${fromInv} Stoč=${brewedW} AKT=${currentStock}`);
    console.log(`  OBJ=${orderedW} Odp=${woW} Fas=${fasovaniW} Prodejna=${prodejnaW} Akce=${akceWeek} Stáč.lahví=${kegsUsedW}`);
    console.log(`  Odchody celkem=${outgoing} ZBYDE=${difference}`);
    console.log('');
  }
}

// Also show the bottling records for this beer
console.log('=== Bottling records for', beer.name, '===');
bot.filter((r) => r.beer_id === beer.id).forEach((r) => {
  const pkg = pkgMap.get(r.package_id);
  const kegPkg = pkgMap.get(r.kegs_used_package_id);
  console.log(`${r.entry_date} | ${pkg?.label} (${pkg?.volume_l}L) | qty=${r.quantity} | kegs_used=${r.kegs_used} | source=${kegPkg?.label} (${kegPkg?.volume_l}L)`);
});
