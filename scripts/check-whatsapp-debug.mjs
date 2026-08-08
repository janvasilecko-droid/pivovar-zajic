// Diagnostika WhatsApp integrace — stav v produkční DB.
// Použití:  node scripts/check-whatsapp-debug.mjs
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

function fmtRow(r) {
  return {
    created: (r.created_at || '').replace('T', ' ').slice(0, 19),
    sender: r.sender_name,
    status: r.status,
    error: r.error_message || null,
    place: r.parsed_place_name || null,
    imported_order: r.imported_order_id ? r.imported_order_id.slice(0, 8) : null,
    webhook: r.webhook_id ? r.webhook_id.slice(0, 12) : null,
    text: (r.message_text || '').replace(/\s+/g, ' ').slice(0, 70),
  };
}

try {
  console.log(`== Projekt: ${ref} ==\n`);

  console.log('--- whatsapp_senders (whitelist) ---');
  const senders = await sql('select sender_name, sender_number, created_at from whatsapp_senders order by created_at;');
  console.log(senders.length === 0 ? '(prázdný seznam = načítají se zprávy od VŠECH odesílatelů)' : senders);
  console.log('');

  console.log('--- whatsapp_incoming: posledních 12 zpráv ---');
  const msgs = await sql('select id, created_at, sender_name, status, error_message, parsed_place_name, imported_order_id, webhook_id, left(message_text, 140) as message_text from whatsapp_incoming order by created_at desc limit 12;');
  if (msgs.length === 0) {
    console.log('(žádné zprávy)');
  } else {
    for (const m of msgs) console.log(fmtRow(m));
  }
  console.log('');

  console.log('--- whatsapp_incoming: počet podle statusu ---');
  const counts = await sql('select status, count(*) from whatsapp_incoming group by status order by status;');
  console.log(counts);
  console.log('');

  console.log('--- whatsapp_incoming: počet podle odesílatele ---');
  const bySender = await sql("select sender_name, count(*), string_agg(status, ',' order by created_at desc) as statuses from whatsapp_incoming group by sender_name order by count(*) desc;");
  console.log(bySender);
} catch (e) {
  console.error('Selhání dotazu:', e.message);
  process.exit(1);
}
