#!/usr/bin/env node
/**
 * VYČIŠTĚNÍ DATABÁZE — PŘÍPRAVA NA OSTRÝ PROVOZ
 *
 * Tento skript se přihlásí do Supabase jako administrátor a vymaže
 * VŠECHNA uživatelsky zadaná data z databáze. Referenční číselníky
 * (piva, obaly, sklepní tanky) se resetují na seed stav.
 *
 * SPUŠTĚNÍ:
 *   node scripts/cleanup-db.mjs
 *
 * Skript se zeptá na e-mail a heslo administrátora (nebo je přečte
 * z proměnných prostředí ADMIN_EMAIL / ADMIN_PASSWORD).
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Načtení .env
function loadEnv() {
  try {
    const envPath = resolve(projectRoot, '.env');
    const content = readFileSync(envPath, 'utf8');
    const env = {};
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return env;
  } catch {
    return {};
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans.trim()); }));
}

const env = loadEnv();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ Chybí VITE_SUPABASE_URL nebo VITE_SUPABASE_ANON_KEY v .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, ANON_KEY);

// Tabulky s uživatelskými daty (všechny se vymažou)
const USER_TABLES = [
  'order_items', 'orders',
  'bottling', 'bottling_entries', 'kegging', 'kegging_entries',
  'writeoffs', 'inventory', 'monthly_inventory',
  'fasovani', 'fasovani_private',
  'akce_items', 'akce', 'event_items',
  'calendar_events', 'reminders',
  'sanitation_logs', 'srotovani', 'zadavani',
  'cellar_transfers', 'cellar_tank_cycles', 'kegging_tanks',
  'places', 'price_list', 'vehicles',
  'parser_aliases', 'audit_log', 'user_app_versions', 'feedback_notes',
];

// Referenční číselníky — reset na seed
const SEED_BEERS = [
  ['12° Světlá', '12°', 'světlé', '#FDE68A', 1],
  ['11° Světlá', '11°', 'světlé', '#FEF3C7', 2],
  ['10° Desítka', '10°', 'světlé', '#FCD34D', 3],
  ['12° Tmavá', '12°', 'tmavé', '#44403B', 4],
  ['Jantar', null, 'jantarové', '#F59E0B', 5],
  ['Summer Ale', null, 'ovocné', '#86EFAC', 6],
  ['13 Hazy Bunny', '13°', 'nefiltrované', '#FCA5A5', 7],
  ['Hazy Spring Day', null, 'nefiltrované', '#F9A8D4', 8],
];

const SEED_PACKAGES = [
  ['KEG50', 'keg', 50, 'KEG 50l', 1],
  ['KEG30', 'keg', 30, 'KEG 30l', 2],
  ['KEG20', 'keg', 20, 'KEG 20l', 3],
  ['KEG15', 'keg', 15, 'KEG 15l', 4],
  ['KEG10', 'keg', 10, 'KEG 10l', 5],
  ['LAHEV15', 'bottle', 1.5, 'Lahve 1.5l', 6],
  ['LAHEV1', 'bottle', 1, 'Lahve 1l', 7],
  ['LAHEV05', 'bottle', 0.5, 'Lahve 0.5l', 8],
  ['LAHEV033', 'bottle', 0.33, 'Lahve 0.33l', 9],
];

async function main() {
  console.log('🍺 VYČIŠTĚNÍ DATABÁZE MINIPIVOVARU ZAJÍC\n');

  // 1) Přihlášení
  const email = process.env.ADMIN_EMAIL || (await ask('📧 E-mail administrátora: '));
  const password = process.env.ADMIN_PASSWORD || (await ask('🔑 Heslo: '));

  console.log('\n🔐 Přihlašuji se...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.session) {
    console.error('❌ Přihlášení selhalo:', authError?.message || 'Neznámá chyba');
    process.exit(1);
  }
  console.log(`✅ Přihlášen jako ${authData.user.email}`);

  // 2) Potvrzení
  const confirm = await ask('\n⚠️  Tímto SMAŽETE VŠECHNA data. Pokračovat? (napište ANO): ');
  if (confirm !== 'ANO') {
    console.log('Zrušeno.');
    process.exit(0);
  }

  // 3) Vymazání uživatelských tabulek
  console.log('\n🗑️  Mažu uživatelská data...');
  for (const table of USER_TABLES) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.log(`   ⚠️  ${table}: ${error.message}`);
    } else {
      console.log(`   ✅ ${table}`);
    }
  }

  // 4) Reset referenčních číselníků
  console.log('\n🔄 Resetuji referenční číselníky...');

  // Piva
  const { error: delBeers } = await supabase.from('beers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delBeers) console.log(`   ⚠️  beers (delete): ${delBeers.message}`);
  for (const [name, degree, color, beer_color, sort_order] of SEED_BEERS) {
    const { error } = await supabase.from('beers').insert({ name, degree, color, beer_color, is_active: true, sort_order });
    if (error) console.log(`   ⚠️  beers (${name}): ${error.message}`);
  }
  console.log('   ✅ beers (8 piv)');

  // Obaly
  const { error: delPkg } = await supabase.from('packages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delPkg) console.log(`   ⚠️  packages (delete): ${delPkg.message}`);
  for (const [code, kind, volume_l, label, sort_order] of SEED_PACKAGES) {
    const { error } = await supabase.from('packages').insert({ code, kind, volume_l, label, sort_order });
    if (error) console.log(`   ⚠️  packages (${code}): ${error.message}`);
  }
  console.log('   ✅ packages (9 obalů)');

  // Sklepní tanky
  const { error: delTanks } = await supabase.from('cellar_tanks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delTanks) console.log(`   ⚠️  cellar_tanks (delete): ${delTanks.message}`);
  for (let i = 1; i <= 8; i++) {
    const { error } = await supabase.from('cellar_tanks').insert({ label: `Tank ${i}`, capacity_l: 7500, current_volume_l: 0, status: 'empty' });
    if (error) console.log(`   ⚠️  cellar_tanks (Tank ${i}): ${error.message}`);
  }
  console.log('   ✅ cellar_tanks (8 tanků)');

  console.log('\n🎉 VYČIŠTĚNÍ DOKONČENO!');
  console.log('Aplikace je připravena na ostrý provoz.');
  console.log('Referenční číselníky (piva, obaly, tanky) byly resetovány na seed stav.');

  await supabase.auth.signOut();
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Chyba:', e.message);
  process.exit(1);
});
