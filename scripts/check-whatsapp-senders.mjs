// Diagnostika whitelistu odesílatelů WhatsApp + přesné názvy odesílatelů v DB.
// Použití:  node scripts/check-whatsapp-senders.mjs
// Potřebuje SB_TOKEN a VITE_SUPABASE_URL v .env (nebo SUPABASE_REF).
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const envPath = resolve(projectRoot, '.env');

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
  console.log(`== Projekt: ${ref} ==\n`);

  console.log('--- whatsapp_senders (aktuální whitelist) ---');
  const senders = await sql('select sender_name, sender_number, created_at from whatsapp_senders order by created_at;');
  console.log(senders.length === 0 ? '(prázdný seznam = načítají se zprávy od VŠECH odesílatelů)' : senders);
  console.log('');

  console.log('--- whatsapp_incoming: počet zpráv podle odesílatele ---');
  const bySender = await sql("select sender_name, count(*) from whatsapp_incoming group by sender_name order by count(*) desc;");
  if (bySender.length === 0) {
    console.log('(žádné zprávy)');
  } else {
    for (const s of bySender) console.log(`  ${JSON.stringify(s.sender_name)} → ${s.count}`);
  }
  console.log('');

  console.log('--- whatsapp_incoming: posledních 8 zpráv (sender_name jako JSON, ať je vidět přesná diakritika/mezery) ---');
  const msgs = await sql('select sender_name, status, created_at from whatsapp_incoming order by created_at desc limit 8;');
  if (msgs.length === 0) {
    console.log('(žádné zprávy)');
  } else {
    for (const m of msgs) console.log(`  ${JSON.stringify(m.sender_name)} | ${m.status} | ${m.created_at}`);
  }
  console.log('--- testovací zprávy (webhook_id jako JSON) ---');
  const test = await sql("select id, sender_name, status, webhook_id from whatsapp_incoming where webhook_id like 'wl-%' order by created_at;");
  if (test.length === 0) {
    console.log('(žádné)');
  } else {
    for (const m of test) console.log(`  ${JSON.stringify(m.sender_name)} | ${m.status} | webhook_id=${JSON.stringify(m.webhook_id)} | id=${m.id}`);
  }
} catch (e) {
  console.error('Selhání dotazu:', e.message);
  process.exit(1);
}
