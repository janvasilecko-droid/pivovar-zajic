#!/usr/bin/env node
/**
 * 🔗 Srovná skladové odpočty zavozu (`zavoz_deductions`) podle objednávek.
 *
 * Objednávka je pravda; odpočet je jen její otisk k okamžiku zavozu. Když se
 * po zavozu opravilo množství, pivo, obal nebo DEN zavozu, otisk zůstal se
 * starými hodnotami a rozdíl vyplaval až v inventuře jako manko (nebo
 * přebytek) bez původu ve výrobě.
 *
 * Od migrace 20261224000000 to hlídá trigger v databázi a jednorázový úklid
 * je součástí té migrace. Tenhle skript je NÁHRADNÍ cesta a hlavně kontrola:
 * bez přepínače jen ukáže, co je rozjeté, a nic nemění.
 *
 * Použití:
 *   node scripts/srovnat-odpocty-na-objednavky.mjs          # jen výpis
 *   node scripts/srovnat-odpocty-na-objednavky.mjs --zapsat # provede opravu
 */
import { readFileSync } from 'node:fs';

const projectRef = 'sasqexjadvlqyticxwja';
const zapsat = process.argv.includes('--zapsat');

// Vše v main(): process.exit() padá na Windows na otevřených fetch handles
// (assert v async.c), takže se z funkce jenom vrací a exit kód se nastaví.
async function main() {
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const m = env.match(/^\s*(?:SUPABASE_ACCESS_TOKEN|SB_TOKEN)\s*=\s*["']?([^"'\r\n]+)/m);
  if (!m) { console.error('Chybí SUPABASE_ACCESS_TOKEN / SB_TOKEN v .env'); process.exitCode = 1; return; }
  const token = m[1].trim();

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

  // Tři druhy rozjetí, pokaždé jinak spočítané. Den zavozu se bere z
  // ucinny_den_zavozu() — stejný vzorec jako v appce, jiný by hlásil
  // rozdíly, které nejsou.
  const prehled = await dotaz(`
    select o.place_name, zd.deduct_date, b.name as pivo, p.code as obal,
           zd.quantity as odpocet, oi.quantity as objednavka,
           o.status,
           public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date) as den_zavozu,
           case
             when o.status = 'storno' then 'storno'
             when zd.quantity is distinct from oi.quantity
               or zd.beer_id is distinct from oi.beer_id
               or zd.package_id is distinct from oi.package_id then 'nesedi'
             else 'datum'
           end as duvod
    from zavoz_deductions zd
    join order_items oi on oi.id = zd.order_item_id
    join orders o on o.id = zd.order_id
    left join beers b on b.id = zd.beer_id
    left join packages p on p.id = zd.package_id
    where o.status = 'storno'
       or zd.quantity   is distinct from oi.quantity
       or zd.beer_id    is distinct from oi.beer_id
       or zd.package_id is distinct from oi.package_id
       or zd.deduct_date is distinct from public.ucinny_den_zavozu(o.delivery_date, o.delivery_day, o.order_date)
    order by duvod, zd.deduct_date;`);
  if (prehled === null) return;

  if (prehled.length === 0) {
    console.log('✅ Všechny odpočty sedí s objednávkami — množstvím, pivem, obalem i dnem zavozu.');
    return;
  }

  const popis = { storno: 'STORNO — sklad odepsaný za zrušenou objednávku',
                  nesedi: 'NESEDÍ — jiné množství, pivo nebo obal',
                  datum:  'DATUM — sklad ubyl k jinému dni, než se vezlo' };
  let posledni = null;
  console.log(`Rozjetých odpočtů: ${prehled.length}\n`);
  for (const r of prehled) {
    if (r.duvod !== posledni) { console.log(`\n── ${popis[r.duvod]} ──`); posledni = r.duvod; }
    const detail = r.duvod === 'datum'
      ? `odepsáno ${r.deduct_date} → vezlo se ${r.den_zavozu}`
      : r.duvod === 'storno'
        ? `odepsáno ${r.odpocet} ks, objednávka stornovaná`
        : `odpočet ${r.odpocet} → objednávka ${r.objednavka}`;
    console.log(`  ${String(r.pivo).padEnd(14)} ${String(r.obal).padEnd(8)} ${detail.padEnd(42)} ${r.place_name ?? ''}`);
  }

  if (!zapsat) {
    console.log('\nTohle byl jen náhled. Zapsat: node scripts/srovnat-odpocty-na-objednavky.mjs --zapsat');
    return;
  }

  // Srovnání dělá funkce z migrace 20261224000000 — jedno místo, jeden vzorec.
  const zmeneno = await dotaz(`
    do $$
    declare r record;
    begin
      for r in select distinct order_id from zavoz_deductions loop
        perform public.srovnat_odpocty_objednavky(r.order_id);
      end loop;
    end $$;`);
  if (zmeneno === null) return;

  console.log('\n✅ Srovnáno. Pusť skript znovu bez přepínače — má vypsat, že všechno sedí.');
  console.log('Skladové výpočty se přepočítají samy, v appce stačí obrazovku znovu otevřít.');
}

await main();
