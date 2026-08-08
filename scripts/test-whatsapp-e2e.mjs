// E2E test auto-parse: vloží testovací zprávu, spustí parsování, vypíše výsledek.
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const get = (k) => env.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim();
const SU = get('VITE_SUPABASE_URL');
const SRK = get('VITE_SUPABASE_SERVICE_ROLE_KEY');
const ANK = get('VITE_SUPABASE_ANON_KEY');

const SENDER = process.argv[2] ?? 'Hospoda U Zajíce';
const TEXT = process.argv[3] ?? 'Ahoj sládku, na pátek potřebujeme:\n2x 12° světlý ležák 50l\n1x 13° jantar 30l\nDíky!';

const wid = 'e2e-' + Date.now();
const ins = await fetch(`${SU}/rest/v1/whatsapp_incoming`, {
  method: 'POST',
  headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ sender_name: SENDER, message_text: TEXT, message_type: 'text', message_timestamp: new Date().toISOString(), webhook_id: wid }),
});
const inserted = await ins.json();
const row = Array.isArray(inserted) ? inserted[0] : inserted;
console.log('INSERTED', row?.id, row?.status);

const pr = await fetch(`${SU}/functions/v1/whatsapp-auto-parse`, {
  method: 'POST',
  headers: { apikey: ANK, Authorization: `Bearer ${ANK}`, 'Content-Type': 'application/json' },
  body: '{}',
});
console.log('PARSE HTTP', pr.status);
console.log('PARSE BODY', JSON.stringify(await pr.json(), null, 1));

if (row?.id) {
  const q = await fetch(`${SU}/rest/v1/whatsapp_incoming?select=id,sender_name,status,parsed_items&id=eq.${row.id}`, {
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}` },
  });
  console.log('FINAL', JSON.stringify(await q.json(), null, 1));
}
