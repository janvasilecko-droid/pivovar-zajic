import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('../.env', 'utf-8');
const env = {};
envContent.split('\n').forEach((line) => {
  const match = line.match(/^\s*([\w_]+)\s*=\s*(.*)\s*$/);
  if (match) {
    env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabaseUrl = env.VITE_SUPABASE_URL || 'https://sasqexjadvlqyticxwja.supabase.co';
const supabaseKey = env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('Missing VITE_SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('whatsapp_incoming')
    .select('id, created_at, message_timestamp, sender_name, message_text, status')
    .order('message_timestamp', { ascending: false })
    .limit(30);

  if (error) {
    console.error(error);
    return;
  }

  console.log('--- RECENT INCOMING MESSAGES ---');
  data.forEach((m) => {
    console.log(`ID: ${m.id}`);
    console.log(`From: ${m.sender_name}`);
    console.log(`TS: ${m.message_timestamp} | DB: ${m.created_at}`);
    console.log(`Status: ${m.status}`);
    console.log(`Text: ${m.message_text ? m.message_text.slice(0, 150) : ''}`);
    console.log('------------------------------');
  });
}

check();
