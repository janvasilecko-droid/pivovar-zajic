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
  const { data: imported, error } = await supabase
    .from('whatsapp_incoming')
    .select('id, sender_name, chat_id, message_text')
    .eq('status', 'imported');
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Imported messages JIDs:', imported);
}

run();
