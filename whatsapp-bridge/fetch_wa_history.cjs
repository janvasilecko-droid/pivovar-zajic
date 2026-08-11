const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const { getSupabase, useSupabaseAuthState } = require('./lib/supabaseAuth.js');
const { normTs } = require('./lib/history.js');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const envPath = '../.env';
let supabaseUrl = '';
let supabaseKey = '';
let webhookSecret = '';

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    if (line.startsWith('VITE_SUPABASE_URL=')) {
      supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
    }
    if (line.startsWith('VITE_SUPABASE_SERVICE_ROLE_KEY=')) {
      supabaseKey = line.split('=')[1].trim().replace(/['"]/g, '');
    }
    if (line.startsWith('WEBHOOK_SECRET=')) {
      webhookSecret = line.split('=')[1].trim().replace(/['"]/g, '');
    }
  }
}

process.env.SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = supabaseKey;
process.env.WEBHOOK_SECRET = webhookSecret;

const logger = pino({ level: 'debug' });

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { state, saveCreds } = await useSupabaseAuthState();
  
  console.log('Connecting to WhatsApp...');
  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false
  });
  
  sock.ev.on('creds.update', saveCreds);
  
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log('Connected successfully!');
      
      const groupJid = '420777935560-1527582844@g.us';
      console.log('Fetching history for group:', groupJid);
      
      try {
        // Try calling fetchMessageHistory with undefined key/timestamp
        console.log('Calling fetchMessageHistory...');
        const msgs = await sock.fetchMessageHistory(groupJid, 100, undefined, undefined);
        console.log('fetchMessageHistory returned:', msgs?.length, 'messages');
        if (msgs && msgs.length > 0) {
          console.log('Sample message:', JSON.stringify(msgs[0], null, 2));
        }
      } catch (err) {
        console.error('Error fetching history:', err);
      }
      
      console.log('Waiting 10 seconds for any events...');
      setTimeout(() => {
        console.log('Exiting...');
        process.exit(0);
      }, 10000);
    }
    
    if (connection === 'close') {
      console.log('Connection closed:', lastDisconnect?.error?.message);
    }
  });
  
  sock.ev.on('messaging-history.set', (data) => {
    console.log('messaging-history.set fired!');
    console.log('Messages count in history sync:', data.messages?.length);
    const groupMsgs = (data.messages || []).filter(m => m.key.remoteJid === '420777935560-1527582844@g.us');
    console.log('Group messages count in history sync:', groupMsgs.length);
  });
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
