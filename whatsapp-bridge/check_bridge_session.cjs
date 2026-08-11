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
  console.log('Checking whatsapp_session...');
  const { data: keys, error } = await supabase
    .from('whatsapp_session')
    .select('key');
    
  if (error) {
    console.error('Error fetching session keys:', error);
    return;
  }
  
  console.log('Session keys count:', keys.length);
  console.log('Keys:', keys.map(k => k.key));
}

run();
