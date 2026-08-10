#!/usr/bin/env node
/**
 * WhatsApp Gateway (WhatsApp Bridge)
 * -----------------------------------
 * Lehoučká Node.js mikroslužba postavená na @whiskeysockets/baileys
 * (Multi-Device WhatsApp API — bez Puppeteeru/Chromiumu, nízká paměť).
 *
 * Co dělá:
 *  - spáruje se s telefonem jako další „propojené zařízení“ (QR kód v konzoli),
 *  - udržuje WhatsApp session perzistentně v Supabase (tabulka whatsapp_session),
 *  - poslouchá událost `messages.upsert`,
 *  - zprávy ze skupiny „Objednávky pivovar“ (nebo povolených kontaktů)
 *    přeposílá POSTem na Supabase edge funkci `whatsapp-webhook`.
 */

import { createServer } from 'node:http';
import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
import qrcodeTerminal from 'qrcode-terminal';
import pino from 'pino';
import { useSupabaseAuthState } from './lib/supabaseAuth.js';
import { forwardToWebhook } from './lib/webhook.js';

// sync:true → logy se okamžitě zapíší (nespoléháme na flush bufferu při killu/exit)
const logger = pino({ level: process.env.LOG_LEVEL || 'info' }, pino.destination({ sync: true }));

// --- Konfigurace -----------------------------------------------------------
const ALLOWED_GROUPS = (process.env.ALLOWED_GROUPS || 'Objednávky pivovar')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_CONTACTS = (process.env.ALLOWED_CONTACTS || 'Ala Milacek Milacek')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** In-memory dedup: `messages.upsert` může stejnou zprávu doručit vícenásobně. */
const SEEN = new Set();
const SEEN_MAX = 5000;
function remember(id) {
  if (SEEN.size >= SEEN_MAX) SEEN.clear();
  SEEN.add(id);
}

/** Sjednocené porovnání názvů (bez diakritiky a velikosti) — stejné jako webhook. */
function norm(s) {
  return (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// --- Health endpoint (Render Web Service / health check) -------------------
function startHealthServer() {
  const port = Number(process.env.PORT || 3000);
  createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, service: 'whatsapp-bridge', uptime: process.uptime() }));
  }).listen(port, () => logger.info(`[health] HTTP server na portu ${port}`));
}

// --- Extrakce textu z message protobufu ------------------------------------
function extractText(message) {
  if (!message) return '';
  const m = message.message || {};
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  if (m.ephemeralMessage?.message) return extractText({ message: m.ephemeralMessage.message });
  if (m.viewOnceMessage?.message) return extractText({ message: m.viewOnceMessage.message });
  return '';
}

async function getGroupSubject(sock, jid) {
  try {
    const meta = await sock.groupMetadata(jid);
    return meta?.subject || jid;
  } catch (e) {
    logger.warn(`[groupMetadata] ${jid}: ${e.message}`);
    return jid;
  }
}

// --- Zpracování jedné příchozí zprávy --------------------------------------
async function handleMessage(sock, msg) {
  const key = msg.key || {};
  const remoteJid = key.remoteJid;
  if (!remoteJid || !msg.message) return;

  // 1) Vlastní zprávy (z jiného zařízení / Webu) → NIKDY, prevence smyčky.
  if (key.fromMe === true) {
    logger.info('[msg] vlastní zpráva — ignoruji (fromMe)');
    return;
  }

  const text = extractText(msg);
  if (!text) {
    logger.debug('[msg] zpráva bez textu (systémová/obrázek) — ignoruji');
    return;
  }

  const isGroup = remoteJid.endsWith('@g.us');
  const senderJid = isGroup ? key.participant || remoteJid : remoteJid;
  const senderNumber = (senderJid || '').split('@')[0] || '';
  const pushName = (msg.pushName || '').trim();

  let sender;
  if (isGroup) {
    const groupName = await getGroupSubject(sock, remoteJid);
    if (ALLOWED_GROUPS.length && !ALLOWED_GROUPS.some((g) => norm(g) === norm(groupName))) {
      logger.info(`[msg] skupina „${groupName}“ není v ALLOWED_GROUPS — ignoruji`);
      return;
    }
    sender = groupName;
  } else {
    sender = pushName || senderNumber || remoteJid;
    const allowed =
      !ALLOWED_CONTACTS.length ||
      ALLOWED_CONTACTS.some((c) => norm(c) === norm(sender)) ||
      ALLOWED_CONTACTS.some((c) => norm(c) === norm(senderNumber));
    if (!allowed) {
      logger.info(`[msg] kontakt „${sender}“ (${senderNumber}) není v ALLOWED_CONTACTS — ignoruji`);
      return;
    }
  }

  // Dedup podle stabilního key.id
  if (key.id) {
    if (SEEN.has(key.id)) return;
    remember(key.id);
  }

  const tsMs =
    typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp * 1000 : Date.now();

  const payload = {
    sender,
    message: text,
    timestamp: new Date(tsMs).toISOString(),
    senderNumber,
    chatId: isGroup ? remoteJid : undefined,
    fromMe: false,
    webhookId: key.id ? `wa-${key.id}` : `wa-${Date.now()}-${senderNumber}`,
  };

  logger.info(
    `[msg] ➜ webhook: sender="${sender}" chatId="${payload.chatId || ''}" text="${text
      .slice(0, 60)
      .replace(/\n/g, ' ')}"`
  );
  await forwardToWebhook(payload, logger);
}


// --- Hlavní smyčka -----------------------------------------------------------
async function start() {
  logger.info('=== WhatsApp Gateway (Baileys) ===');

  const { state, saveCreds } = await useSupabaseAuthState({ logger });

  const sock = makeWASocket({
    auth: state,
    logger,
    browser: ['WhatsApp Bridge', 'Chrome', '24.0.0'],
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  // Perzistence: při každé změně přihlašovacích klíčů → Supabase
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n============================================================');
      console.log('  QR kód pro spárování — v telefonu otevři:');
      console.log('  WhatsApp → Nastavení → Propojená zařízení → Propojit zařízení');
      console.log('============================================================');
      qrcodeTerminal.generate(qr, { small: true });
      console.log('');
    }

    if (connection === 'open') {
      logger.info('[conn] OPEN — spárováno a online ✔');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      logger.warn(`[conn] připojení zavřeno (statusCode=${code}, loggedOut=${loggedOut})`);
      if (loggedOut) {
        logger.error(
          '[conn] Zařízení bylo odpojeno (logged out). Smazat klíč "creds" z whatsapp_session a restartovat službu pro nový QR.'
        );
      }
      // Baileys se o reconnect stará sám (výjimka: loggedOut).
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg);
      } catch (e) {
        logger.error('[msg] chyba zpracování:', e);
      }
    }
  });
}

start().catch((e) => {
  logger.error('Fatal chyba při startu:', e);
  process.exit(1);
});

startHealthServer();

