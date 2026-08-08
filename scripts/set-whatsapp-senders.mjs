// Nastavení whitelistu WhatsApp odesílatelů — do aplikace se propisují jen
// objednávky od povolených odesílatelů (prázdný seznam = všichni).
//
// Použití:
//   node scripts/set-whatsapp-senders.mjs                     → nastaví výchozí dvojici
//   node scripts/set-whatsapp-senders.mjs "Název" "Další" ... → vlastní seznam
//
// Výchozí (dle zadání): kontakt "Objednávky pivovar" + "Ala Milacek".
// Potřebuje SB_TOKEN a VITE_SUPABASE_URL v .env.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const envPath = resolve(projectRoot, '.env');

const DEFAULTS = ['Objednávky pivovar', 'Ala Milacek'];

function readEnv(key) {
  if (!existsSync(envPath)) return '';
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^${key}=(.*)$`));
    if (m) return m[1].trim();
  }
  return '';
}

const token = readEnv('SB_TOKEN') || readEnv('SUPABASE_ACCESS_TOKEN');
const url = readEnv('VITE_SUPABASE_URL');
const ref = (url || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'sasqexjadvlqyticxwja';

if (!token) { console.error('Chyba: SB_TOKEN nenalezen v .env'); process.exit(1); }

// Nahradit? 1. argument může být --replace (pouze tyto) nebo --add (přidat k existujícím).
const args = process.argv.slice(2);
const mode = args.includes('--replace') ? 'replace' : args.includes('--add') ? 'add' : 'replace';
const names = args.filter((a) => !a.startsWith('--'));
const finalNames = (names.length > 0 ? names : DEFAULTS)
  .map((n) => n.trim())
  .filter(Boolean);

if (finalNames.length === 0) { console.error('Chyba: prázdný seznam odesílatelů'); process.exit(1); }

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

try {
  console.log(`== Projekt: ${ref} ==`);
  console.log(`Režim: ${mode === 'replace' ? 'NAHRADIT celý seznam' : 'PŘIDAT k existujícímu seznamu'}`);
  console.log(`Povolení odesílatelé: ${finalNames.map((n) => JSON.stringify(n)).join(', ')}\n`);

  const before = await sql('select sender_name from whatsapp_senders order by sender_name;');
  console.log('Původní whitelist:', before.length === 0 ? '(prázdný)' : before.map((r) => r.sender_name).join(', '));

  if (mode === 'replace') {
    await sql('delete from whatsapp_senders;');
    console.log('✓ Starý seznam smazán');
  }

  for (const name of finalNames) {
    // ON CONFLICT (lower(trim(sender_name))) — díky unikátnímu indexu se duplicitní názvy ignorují
    const esc = name.replace(/'/g, "''");
    await sql(
      `insert into whatsapp_senders (sender_name) values ('${esc}') ` +
      `on conflict ((lower(trim(sender_name)))) do nothing;`
    );
  }
  console.log(`✓ Odesílatelé přidáni`);

  const after = await sql('select sender_name, created_at from whatsapp_senders order by created_at;');
  console.log('\n--- Aktuální whitelist ---');
  if (after.length === 0) {
    console.log('(prázdný = načítají se zprávy od VŠECH odesílatelů)');
  } else {
    for (const r of after) console.log(`  ${JSON.stringify(r.sender_name)} (od ${r.created_at})`);
  }
} catch (e) {
  console.error('Selhání dotazu:', e.message);
  process.exit(1);
}
