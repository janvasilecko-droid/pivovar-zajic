// E2E test whitelistu: přidá povoleného odesílatele, ověří, že nepovolená
// zpráva zůstane 'pending' a povolená se rozparsuje. Pak seznam vyčistí.
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const get = (k) => env.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim();
const SU = get('VITE_SUPABASE_URL');
const SRK = get('VITE_SUPABASE_SERVICE_ROLE_KEY');
const ANK = get('VITE_SUPABASE_ANON_KEY');

const h = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const hAnon = { apikey: ANK, Authorization: `Bearer ${ANK}`, 'Content-Type': 'application/json' };

async function insert(sender, text) {
  const wid = 'wl-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  const r = await fetch(`${SU}/rest/v1/whatsapp_incoming`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ sender_name: sender, message_text: text, message_type: 'text', message_timestamp: new Date().toISOString(), webhook_id: wid }),
  });
  const j = await r.json();
  return Array.isArray(j) ? j[0] : j;
}

async function parse() {
  const r = await fetch(`${SU}/functions/v1/whatsapp-auto-parse`, { method: 'POST', headers: hAnon, body: '{}' });
  return r.json();
}

// 1) Přidat povoleného odesílatele
await fetch(`${SU}/rest/v1/whatsapp_senders`, { method: 'POST', headers: h, body: JSON.stringify({ sender_name: 'Hospoda U Zajíce' }) });

// 2) Nepovolená zpráva → auto-parse ji přeskočí (zůstane pending)
const bad = await insert('Nepovoleny Kontakt', 'Ahoj, na čtvrtek 2x 12° 50l, díky!');
let res = await parse();
console.log('PARSE s nepovolenou:', JSON.stringify(res.summary));
let q = await (await fetch(`${SU}/rest/v1/whatsapp_incoming?select=id,status&id=eq.${bad.id}`, { headers: h })).json();
console.log('Nepovolená zpráva status:', q[0]?.status);

// 3) Povolená zpráva → rozparsuje se
const good = await insert('Hospoda U Zajíce', 'Ahoj, na čtvrtek 2x 12° světlý ležák 50l, díky!');
res = await parse();
console.log('PARSE s povolenou:', JSON.stringify(res.summary));
q = await (await fetch(`${SU}/rest/v1/whatsapp_incoming?select=id,status,parsed_items&id=eq.${good.id}`, { headers: h })).json();
console.log('Povolená zpráva status:', q[0]?.status, 'items:', JSON.stringify(q[0]?.parsed_items));

// 4) Vyčistit testovací data
const clean = await fetch(`${SU}/rest/v1/whatsapp_incoming?webhook_id=like.wl-%25`, { method: 'DELETE', headers: h });
if (!clean.ok) console.warn('Varování: úklid testovacích zpráv selhal', clean.status, await clean.text());
await fetch(`${SU}/rest/v1/whatsapp_senders?sender_name=eq.Hospoda%20U%20Zajíce`, { method: 'DELETE', headers: h });
console.log('ČISTO ✓ (testovací zprávy i whitelist smazány)');
