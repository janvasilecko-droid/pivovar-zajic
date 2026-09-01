#!/usr/bin/env node
/**
 * 🔗 Srovná skladové odpočty zavozu (`zavoz_deductions`) podle objednávek.
 *
 * Objednávka je pravda; odpočet je jen její otisk k okamžiku zavozu. Když se
 * po zavozu opravilo množství, pivo nebo obal, otisk zůstal se starými
 * hodnotami a rozdíl vyplaval až v inventuře jako manko bez původu ve výrobě.
 *
 * Od verze 2.158 se odpočet srovnává sám (lib/zavozSync.ts + RPC
 * reconcile_zavoz_deduction_for_item). Tenhle skript je na řádky, které se
 * rozešly DŘÍV, než oprava vznikla.
 *
 * Použití:
 *   node scripts/srovnat-odpocty-na-objednavky.mjs          # jen vypíše, co by změnil
 *   node scripts/srovnat-odpocty-na-objednavky.mjs --zapsat # provede opravu
 */
import { readFileSync } from 'node:fs';

const projectRef = 'sasqexjadvlqyticxwja';
const zapsat = process.argv.includes('--zapsat');

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const m = env.match(/^\s*(?:SUPABASE_ACCESS_TOKEN|SB_TOKEN)\s*=\s*["']?([^"'\r\n]+)/m);
if (!m) { console.error('Chybí SUPABASE_ACCESS_TOKEN / SB_TOKEN v .env'); process.exitCode = 1; }
const token = m ? m[1].trim() : '';

async function dotaz(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) { console.error(`HTTP ${r.status}\n${text}`); process.exitCode = 1; return null; }
  try { return JSON.parse(text); } catch { return text; }
}

// Vše v main(): process.exit() padá na Windows na otevřených fetch handles
// (assert v async.c), takže se z funkce jenom vrací a exit kód se nastaví.
async function main() {
  const NESEDI = `
    zd.quantity   is distinct from oi.quantity
    or zd.beer_id    is distinct from oi.beer_id
    or zd.package_id is distinct from oi.package_id`;

  const prehled = await dotaz(`
    select o.place_name, zd.deduct_date, b.name as pivo, p.code as obal,
           zd.quantity as odpocet, oi.quantity as objednavka
    from zavoz_deductions zd
    join order_items oi on oi.id = zd.order_item_id
    join orders o on o.id = zd.order_id
    left join beers b on b.id = zd.beer_id
    left join packages p on p.id = zd.package_id
    where ${NESEDI}
    order by zd.deduct_date;`);


  console.log(`Nesedí ${prehled.length} odpočtů:\n`);
  for (const r of prehled) {
    console.log(`  ${r.deduct_date}  ${String(r.pivo).padEnd(14)} ${String(r.obal).padEnd(8)} `
      + `odpočet ${String(r.odpocet).padStart(4)} → objednávka ${String(r.objednavka).padStart(4)}   ${r.place_name ?? ''}`);
  }

  if (!zapsat) {
    console.log('\nTohle byl jen náhled. Zapsat: node scripts/srovnat-odpocty-na-objednavky.mjs --zapsat');
    return;
  }

  const zmeneno = await dotaz(`
    update zavoz_deductions zd
    set quantity   = oi.quantity,
        beer_id    = oi.beer_id,
        package_id = oi.package_id,
        note = trim(both ' ' from coalesce(zd.note, 'Automaticky odpocet zavozu')
                     || ' (srovnano na objednavku ' || current_date || ')')
    from order_items oi
    where oi.id = zd.order_item_id and (${NESEDI})
    returning zd.deduct_date, zd.quantity as nove_mnozstvi;`);
  if (zmeneno === null) return;

  console.log(`\n✅ Srovnáno ${zmeneno.length} odpočtů podle objednávek.`);
  console.log('Inventura se přepočítá sama — v appce stačí obrazovku znovu otevřít.');

}

await main();
