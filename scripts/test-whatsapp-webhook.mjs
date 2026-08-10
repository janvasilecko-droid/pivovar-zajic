#!/usr/bin/env node

/**
 * Test WhatsApp webhooku — brána chat_id + from_me.
 *
 * Scénáře:
 *   1) Nepovolený odesílatel (mimo skupinu)  → odpověď skipped (NEuloží se).
 *   2) Vlastní zpráva (fromMe: true)         → odpověď skipped + from_me (NEuloží se).
 *   3) Vlastní zpráva (from_me: true alias)  → odpověď skipped + from_me (NEuloží se).
 *   4) Skupina + chatId                      → uloží se jako pending (pokud chat_id
 *      odpovídá zaregistrovanému / není zaregistrováno); jinak skipped (chat_id_unknown).
 *   5) Skupina bez chatId                    → uloží se (dokud není chat_id
 *      zaregistrováno); jinak skipped (chat_id_missing).
 *
 * Použití: node scripts/test-whatsapp-webhook.mjs
 * Potřebuje VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY a WEBHOOK_SECRET (volitelně) v .env.
 */

import { readFileSync } from 'node:fs';

// Načti .env přímo (dotenv není závislost projektu).
function getEnvVar(name) {
  const val = process.env[name];
  if (val) return val;
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const m = env.match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([^"'\\r\\n]+)`, 'm'));
    return m ? m[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

const SUPABASE_URL = getEnvVar('VITE_SUPABASE_URL') || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = getEnvVar('VITE_SUPABASE_ANON_KEY') || 'your-anon-key';
const WEBHOOK_SECRET = getEnvVar('WEBHOOK_SECRET') || ''; // viz scripts/set-webhook-secret.mjs

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
const GROUP = 'Objednávky pivovar';
const TEST_CHAT_ID = '120363000000000000@g.us'; // placeholder — skutečný chat_id přijde z logu webhooku

const testCases = [
  {
    name: '1) Nepovolený odesílatel',
    payload: {
      sender: 'Kynšperská beerbanda',
      message: 'Ahoj, jen se zdravím, žádná objednávka',
      timestamp: new Date().toISOString(),
      webhookId: `tw-${Date.now()}-1`,
    },
    expectSkipped: true,
  },
  {
    name: '2) Vlastní zpráva (fromMe: true)',
    payload: {
      sender: GROUP,
      message: 'Dobrý den, potvrzuji objednávku',
      timestamp: new Date().toISOString(),
      webhookId: `tw-${Date.now()}-2`,
      fromMe: true,
    },
    expectSkipped: true,
    expectFromMe: true,
  },
  {
    name: '3) Vlastní zpráva (from_me: true alias)',
    payload: {
      sender: GROUP,
      message: 'Dobrý den, potvrzuji objednávku',
      timestamp: new Date().toISOString(),
      webhookId: `tw-${Date.now()}-3`,
      from_me: true,
    },
    expectSkipped: true,
    expectFromMe: true,
  },
  {
    name: '4) Skupina + chatId',
    payload: {
      sender: GROUP,
      message: 'Ahoj sládku, na čtvrtek potřebujeme:\n2x 12° světlý ležák 50l\n1x 13° jantar 30l\nDíky!',
      timestamp: new Date().toISOString(),
      webhookId: `tw-${Date.now()}-4`,
      chatId: TEST_CHAT_ID,
    },
    // Buď se uloží (chat_id nezaregistrován → přechodně podle názvu), nebo se
    // zahodí (chat_id zaregistrován a tento testovací nesouhlasí). Obojí je OK.
    expectSkipped: null,
  },
  {
    name: '5) Skupina bez chatId',
    payload: {
      sender: GROUP,
      message: 'Na středu prosím 1x 12° světlý 30l',
      timestamp: new Date().toISOString(),
      webhookId: `tw-${Date.now()}-5`,
    },
    // Uloží se (dokud není chat_id zaregistrováno), jinak skipped (chat_id_missing).
    expectSkipped: null,
  },
];

async function run(payload) {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      ...(WEBHOOK_SECRET ? { 'x-webhook-token': WEBHOOK_SECRET } : {}),
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { status: res.status, data };
}

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) failures++;
};

for (const tc of testCases) {
  console.log(`\n--- ${tc.name} ---`);
  console.log(`Payload: ${JSON.stringify(tc.payload, null, 2).slice(0, 300)}`);
  const { status, data } = await run(tc.payload);
  console.log(`Status: ${status}`);
  console.log(`Odpověď: ${JSON.stringify(data)}`);

  if (tc.expectSkipped === true) {
    ok(data.skipped === true, 'očekáváno skipped:true');
    if (tc.expectFromMe) ok(data.from_me === true, 'očekáváno from_me:true');
  } else {
    // Skupinové zprávy: obě varianty jsou v pořádku (záleží na zaregistrovaném chat_id).
    ok(
      (data.skipped === true && (data.chat_id_unknown || data.chat_id_missing)) ||
        (data.id && data.status === 'pending'),
      'uloženo (pending) NEBO zahazeno s důvodem chat_id (závisí na zaregistrovaném chat_id)'
    );
  }
  await new Promise((r) => setTimeout(r, 300));
}

console.log(failures === 0 ? '\nHOTOVO ✓' : `\nSELHÁNÍ (${failures} chyb)`);
process.exit(failures === 0 ? 0 : 1);
