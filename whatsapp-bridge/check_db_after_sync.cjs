const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = '../.env';
let supabaseUrl = '';
let supabaseKey = '';

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    if (line.startsWith('VITE_SUPABASE_URL=')) {
      supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
    }
    if (line.startsWith('VITE_SUPABASE_SERVICE_ROLE_KEY=')) {
      supabaseKey = line.split('=')[1].trim().replace(/['"]/g, '');
    }
  }
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: all, error } = await supabase
    .from('whatsapp_incoming')
    .select('id, status, sender_name, message_text, created_at, message_timestamp, from_me')
    .order('created_at', { ascending: false });
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Total messages in DB:', all.length);
  const counts = {};
  all.forEach(x => {
    counts[x.status] = (counts[x.status] || 0) + 1;
  });
  console.log('Statuses counts:', counts);
  
  const pendingOrParsed = all.filter(x => x.status === 'pending' || x.status === 'parsed');
  console.log('Pending/parsed messages count:', pendingOrParsed.length);
  
  if (pendingOrParsed.length > 0) {
    console.log('First 10 pending/parsed messages:');
    pendingOrParsed.slice(0, 10).forEach((x, i) => {
      console.log(`${i+1}. [${x.message_timestamp || x.created_at}] [from_me=${x.from_me}] [sender=${x.sender_name}] ${x.message_text.slice(0, 80).replace(/\n/g, ' ')}`);
    });
  }
}

run();
