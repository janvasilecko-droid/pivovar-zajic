import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const token = (env.match(/^\s*(?:SUPABASE_ACCESS_TOKEN|SB_TOKEN)\s*=\s*["']?([^"'\r\n]+)/m) || [])[1]?.trim();
const projectRef = 'sasqexjadvlqyticxwja';

async function runQuery(q) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Query failed (${r.status}): ${JSON.stringify(data)}`);
  return data;
}

const rows = await runQuery('SELECT * FROM whatsapp_incoming ORDER BY created_at');
const dir = new URL('../../whatsapp-incoming-backups/', import.meta.url);
mkdirSync(dir, { recursive: true });
const file = new URL(`whatsapp_incoming_${new Date().toISOString().slice(0, 10)}.json`, dir);
writeFileSync(file, JSON.stringify(rows, null, 2), 'utf8');
console.log(`Záloha uložena: ${file.pathname} (${rows.length} zpráv)`);
