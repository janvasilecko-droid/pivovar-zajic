// Nastavení whitelistu WhatsApp odesílatelů — do aplikace se propisují jen
// objednávky od povolených odesílatelů (prázdný seznam = všichni).
//
// Použití:
//   node scripts/set-whatsapp-senders.mjs                     → nastaví výchozí dvojici
//   node scripts/set-whatsapp-senders.mjs "Název" "Další" ... → vlastní seznam
//   node scripts/set-whatsapp-senders.mjs --chat-id "120363...@g.us"
//                                                           → zaregistruje chat_id
//                                                             (stabilní ID skupiny)
//   node scripts/set-whatsapp-senders.mjs --clear-chat-id    → vymaže chat_id
//
// Výchozí (dle zadání): WhatsApp skupina "Objednávky pivovar" — jediný zdroj objednávek.
// Potřebuje SB_TOKEN a VITE_SUPABASE_URL v .env.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const envPath = resolve(projectRoot, '.env');

const DEFAULTS = ['Objednávky pivovar'];

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

// Nahradit? --replace (pouze tyto) nebo --add (přidat k existujícím).
// --chat-id <hodnota> → uloží stabilní chat_id skupiny (např. "120363...@g.us")
//                      pro právě nastavené odesílatele.
// --clear-chat-id     → vymaže chat_id.
const args = process.argv.slice(2);
const mode = args.includes('--replace') ? 'replace' : args.includes('--add') ? 'add' : 'replace';
const chatIdx = args.indexOf('--chat-id');
const chatId = chatIdx >= 0 && args[chatIdx + 1] ? String(args[chatIdx + 1]).trim() : '';
const clearChatId = args.includes('--clear-chat-id');
const flags = new Set(['--replace', '--add', '--clear-chat-id', '--chat-id']);
const skipIndexes = new Set(chatIdx >= 0 ? [chatIdx, chatIdx + 1] : []);
const names = args.filter((a, i) => !flags.has(a) && !skipIndexes.has(i));
const finalNames = (names.length > 0 ? names : DEFAULTS)
  .map((n) => n.trim())
  .filter(Boolean);

if (finalNames.length === 0) { console.error('Chyba: prázdný seznam odesílatelů'); process.exit(1); }
if (chatId && clearChatId) { console.error('Chyba: --chat-id a --clear-chat-id se vylučují'); process.exit(1); }

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

  const nameList = finalNames.map((n) => `'${n.replace(/'/g, "''").trim().toLowerCase()}'`).join(', ');
  if (chatId) {
    const escId = chatId.replace(/'/g, "''");
    await sql(
      `update whatsapp_senders set chat_id = '${escId}' ` +
      `where lower(trim(sender_name)) in (${nameList});`
    );
    console.log(`✓ chat_id zaregistrován: ${chatId}`);
  }
  if (clearChatId) {
    await sql(
      `update whatsapp_senders set chat_id = null ` +
      `where lower(trim(sender_name)) in (${nameList});`
    );
    console.log(`✓ chat_id vymazán`);
  }

  const after = await sql('select sender_name, chat_id, created_at from whatsapp_senders order by created_at;');
  console.log('\n--- Aktuální whitelist ---');
  if (after.length === 0) {
    console.log('(prázdný = načítají se zprávy od VŠECH odesílatelů)');
  } else {
    for (const r of after) {
      const chat = r.chat_id ? ` | chat_id=${JSON.stringify(r.chat_id)}` : ' | bez chat_id';
      console.log(`  ${JSON.stringify(r.sender_name)}${chat} (od ${r.created_at})`);
    }
  }
} catch (e) {
  console.error('Selhání dotazu:', e.message);
  process.exit(1);
}
