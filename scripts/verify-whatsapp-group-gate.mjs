#!/usr/bin/env node
// Ověření brány na webhooku: do aplikace projdou JEN zprávy ze skupiny
// „Objednávky pivovar“ — primárně podle chat_id, přechodně podle názvu;
// vlastní zprávy (from_me) se NIKDY neuloží. Nepovolený odesílatel → odpověď
// `skipped` (do DB se neuloží), povolený → pending → auto-parse → parsed.
// Použití: node scripts/verify-whatsapp-group-gate.mjs
// Potřebuje VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY a SB_TOKEN v .env.
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

const SUPABASE_URL = readEnv('VITE_SUPABASE_URL');
const ANON_KEY = readEnv('VITE_SUPABASE_ANON_KEY');
const TOKEN = readEnv('SB_TOKEN') || readEnv('SUPABASE_ACCESS_TOKEN');
const WEBHOOK_SECRET = readEnv('WEBHOOK_SECRET'); // povinná hlavička x-webhook-token
const ref = (SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'sasqexjadvlqyticxwja';

if (!SUPABASE_URL || !ANON_KEY || !TOKEN) {
  console.error('Chyba: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SB_TOKEN nenalezeny v .env');
  process.exit(1);
}

const WEBHOOK = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
const AUTO_PARSE = `${SUPABASE_URL}/functions/v1/whatsapp-auto-parse`;
const WID_PREFIX = `gt-${Date.now()}`;
const GROUP = 'Objednávky pivovar';
const TEST_CHAT_ID = '120363000000000000@g.us'; // placeholder (skutečný přijde z logu webhooku)

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_KEY}`,
      ...(WEBHOOK_SECRET ? { 'x-webhook-token': WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify(body),
  });
}

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) failures++;
};

try {
  console.log(`== Projekt: ${ref} ==\n`);

  // Zjisti, jestli je už chat_id zaregistrováno ve whitelistu.
  const senders = await sql('select sender_name, chat_id from whatsapp_senders;');
  const configuredChatId = (senders.find((s) => s.chat_id) || {}).chat_id || '';
  const chatIdConfigured = configuredChatId !== '';
  console.log(
    chatIdConfigured
      ? `Chat_id zaregistrováno: ${configuredChatId} → striktní filtr podle chat_id.`
      : 'Chat_id NENÍ zaregistrováno → přechodně filtr podle názvu skupiny.'
  );

  // 1) Nepovolený odesílatel (mimo skupinu) → webhook NESMÍ zprávu uložit
  console.log('\n1) Nepovolený odesílatel (mimo skupinu)…');
  const bad = {
    sender: 'Kynšperská beerbanda',
    message: 'Ahoj, jen se zdravím, žádná objednávka',
    timestamp: new Date().toISOString(),
    webhookId: `${WID_PREFIX}-bad`,
  };
  const badRes = await postJson(WEBHOOK, bad);
  const badJson = await badRes.json();
  ok(badJson.skipped === true, `odpověď skipped: ${JSON.stringify(badJson.message)}`);

  // 2) Vlastní zpráva (from_me) → NESMÍ se uložit (prevence smyčky)
  console.log('\n2) Vlastní zpráva (fromMe: true)…');
  const own = {
    sender: GROUP,
    message: 'Dobrý den, potvrzuji objednávku',
    timestamp: new Date().toISOString(),
    webhookId: `${WID_PREFIX}-own`,
    fromMe: true,
  };
  const ownRes = await postJson(WEBHOOK, own);
  const ownJson = await ownRes.json();
  ok(ownJson.skipped === true && ownJson.from_me === true, `odpověď skipped + from_me: ${JSON.stringify(ownJson.message)}`);

  // 3) Zpráva ze skupiny → uloží se jako pending
  console.log('\n3) Skupina „Objednávky pivovar“…');
  const good = {
    sender: GROUP,
    message: 'Ahoj sládku, na čtvrtek potřebujeme:\n2x 12° světlý ležák 50l\n1x 13° jantar 30l\nDíky!',
    timestamp: new Date().toISOString(),
    webhookId: `${WID_PREFIX}-good`,
    chatId: configuredChatId || TEST_CHAT_ID, // skutečné, pokud je registrované
  };
  const goodRes = await postJson(WEBHOOK, good);
  const goodJson = await goodRes.json();
  ok(goodJson.id && goodJson.status === 'pending', `uloženo jako pending (id=${goodJson.id})`);
  const goodId = goodJson.id;

  // 3b) Název bez diakritiky → musí projít (webhook i DB trigger porovnávají bez diakritiky)
  console.log('\n3b) Skupina bez diakritiky „Objednavky pivovar“…');
  const noDiak = {
    sender: 'Objednavky pivovar',
    message: 'Test: 1x 10° světlá 30l',
    timestamp: new Date().toISOString(),
    webhookId: `${WID_PREFIX}-nodiak`,
  };
  const noDiakRes = await postJson(WEBHOOK, noDiak);
  const noDiakJson = await noDiakRes.json();
  ok(noDiakJson.id && noDiakJson.status === 'pending', `uloženo jako pending (id=${noDiakJson.id})`);

  // 3c) Pokud je chat_id zaregistrováno → zpráva ze skupiny BEZ chat_id musí stále
  //     projít (název-filtr funguje i po zaregistrování chat_id; Tasker %anwhatsappchatid neposílá)
  if (chatIdConfigured) {
    console.log('\n3c) Skupina BEZ chat_id (chat_id je registrované)…');
    const noChat = {
      sender: GROUP,
      message: 'Test bez chat_id: 1x 12° tmavá 50l',
      timestamp: new Date().toISOString(),
      webhookId: `${WID_PREFIX}-nochatid`,
    };
    const noChatRes = await postJson(WEBHOOK, noChat);
    const noChatJson = await noChatRes.json();
    ok(noChatJson.id && noChatJson.status === 'pending', `uloženo jako pending (id=${noChatJson.id})`);
  } else {
    console.log('\n3c) Zpráva bez chat_id — přeskočeno (chat_id zatím není zaregistrováno, viz 3).');
  }

  // 4) Pokud je chat_id zaregistrováno → špatné chat_id se NESMÍ uložit
  if (chatIdConfigured) {
    console.log('\n4) Špatné chat_id (striktní filtr)…');
    const wrongChat = {
      sender: GROUP,
      message: 'Testovací zpráva se špatným chat_id',
      timestamp: new Date().toISOString(),
      webhookId: `${WID_PREFIX}-wrongchat`,
      chatId: '999999999999999999@g.us',
    };
    const wrongRes = await postJson(WEBHOOK, wrongChat);
    const wrongJson = await wrongRes.json();
    ok(wrongJson.skipped === true && wrongJson.chat_id_unknown === true, `odpověď skipped (chat_id_unknown): ${JSON.stringify(wrongJson.message)}`);
  } else {
    console.log('\n4) Špatné chat_id — přeskočeno (chat_id zatím není zaregistrováno).');
  }

  // 5) Ověřit v DB: uložily se JEN povolené skupinové zprávy
  //    (nepovolená, from_me a špatné chat_id se neuložily)
  console.log('\n5) Kontrola v DB…');
  const rows = await sql(
    `select id, sender_name, chat_id, from_me, status, webhook_id from whatsapp_incoming where webhook_id like '${WID_PREFIX}-%' order by created_at;`
  );
  const expected = chatIdConfigured ? 3 : 2; // good + nodiak (+ nochatid)
  ok(rows.length === expected, `v DB je právě ${expected} testovacích zpráv (špatné se neuložily) — našlo se ${rows.length}`);
  ok(rows.some((r) => r.webhook_id === `${WID_PREFIX}-good`), 'zpráva ze skupiny je v DB');
  ok(rows.some((r) => r.webhook_id === `${WID_PREFIX}-nodiak`), 'zpráva bez diakritiky je v DB (filtr sjednocen)');
  if (chatIdConfigured) {
    ok(rows.some((r) => r.webhook_id === `${WID_PREFIX}-nochatid`), 'zpráva bez chat_id je v DB i po zaregistrování chat_id');
    ok(!rows.some((r) => r.webhook_id === `${WID_PREFIX}-wrongchat`), 'špatné chat_id se neuložilo');
  }
  const goodRow = rows.find((r) => r.webhook_id === `${WID_PREFIX}-good`);
  if (goodRow) {
    ok(goodRow.from_me === false, 'from_me je false');
    if (good.chatId) ok(goodRow.chat_id === good.chatId, `chat_id se uložil (${goodRow.chat_id})`);
  }

  // 6) Auto-parse → pending → parsed
  console.log('\n6) Auto-parse…');
  const apRes = await postJson(AUTO_PARSE, {});
  const apJson = await apRes.json();
  console.log('  status:', apRes.status);
  console.log('  response:', JSON.stringify(apJson, null, 2));
  console.log('  summary:', JSON.stringify(apJson.summary));
  const db = await sql(`select status, parsed_items from whatsapp_incoming where id = '${goodId}';`);
  const item = db[0];
  ok(item && item.status === 'parsed', `zpráva má status 'parsed' (je: ${item?.status})`);
  ok(Array.isArray(item?.parsed_items) && item.parsed_items.length > 0, 'AI rozparsovala položky objednávky');

  // 7) Úklid testovacích zpráv
  console.log('\n7) Úklid…');
  await sql(`delete from whatsapp_incoming where webhook_id like '${WID_PREFIX}-%';`);
  console.log('  testovací zprávy smazány');

  console.log(failures === 0 ? '\nHOTOVO ✓ (brána funguje)' : `\nSELHÁNÍ (${failures} chyb)`);
  process.exit(failures === 0 ? 0 : 1);
} catch (e) {
  console.error('Selhání:', e.message);
  process.exit(1);
}
