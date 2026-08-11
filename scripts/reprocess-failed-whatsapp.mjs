import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve('.env');
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

if (!token) {
  console.error('Chyba: SB_TOKEN/SUPABASE_ACCESS_TOKEN nenalezen v .env');
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function triggerAutoParse() {
  const anonKey = readEnv('VITE_SUPABASE_ANON_KEY') || readEnv('VITE_SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${url}/functions/v1/whatsapp-auto-parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`
    },
    body: JSON.stringify({})
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, raw: text };
}

async function run() {
  console.log('Finding messages in whatsapp_incoming with status "error"...');
  
  // 1) Find the failed messages
  const failedMsgs = await sql("select id, sender_name, left(message_text, 40) as txt from whatsapp_incoming where status = 'error';");
  console.log(`Found ${failedMsgs.length} messages in error status.`);
  
  if (failedMsgs.length === 0) {
    console.log('No messages to reprocess.');
    return;
  }
  
  // 2) Update their status to 'pending' and clear error_message
  console.log('Updating statuses to "pending"...');
  const updateResult = await sql(`
    update whatsapp_incoming
    set status = 'pending', error_message = null
    where status = 'error';
  `);
  console.log('Update complete.');
  
  // 3) Call whatsapp-auto-parse in a loop
  console.log('Triggering whatsapp-auto-parse edge function...');
  let iteration = 1;
  let hasMore = true;
  
  while (hasMore && iteration <= 10) {
    console.log(`\n--- Iteration ${iteration} ---`);
    const { status, data, raw } = await triggerAutoParse();
    console.log(`Response HTTP ${status}:`, data || raw);
    
    // Check if there are any remaining pending messages
    const pendingCount = await sql("select count(*) from whatsapp_incoming where status = 'pending';");
    const count = parseInt(pendingCount[0]?.count ?? '0', 10);
    console.log(`Remaining pending messages: ${count}`);
    
    if (count === 0) {
      hasMore = false;
      console.log('All pending messages processed successfully.');
    } else {
      iteration++;
      // Wait a bit to avoid hitting rate limits too fast
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log('\nReprocessing finished.');
}

run().catch(e => console.error('Error:', e));
