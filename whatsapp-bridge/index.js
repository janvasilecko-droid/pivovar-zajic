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
import { getSupabase, useSupabaseAuthState } from './lib/supabaseAuth.js';
import { createMessageGate } from './lib/filter.js';
import { forwardToWebhook } from './lib/webhook.js';
import { prepareImageForForwarding, ensureMediaBucket, getImageMessage } from './lib/media.js';

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

/** Cache názvů skupin — groupMetadata je nákladné API volání; stačí obnovit občas. */
const GROUP_SUBJECTS = new Map();
const GROUP_SUBJECT_TTL_MS = 10 * 60 * 1000;

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
  const cached = GROUP_SUBJECTS.get(jid);
  if (cached && Date.now() - cached.ts < GROUP_SUBJECT_TTL_MS) return cached.subject;
  try {
    const meta = await sock.groupMetadata(jid);
    const subject = meta?.subject || jid;
    GROUP_SUBJECTS.set(jid, { subject, ts: Date.now() });
    return subject;
  } catch (e) {
    logger.warn(`[groupMetadata] ${jid}: ${e.message}`);
    return jid;
  }
}

// --- Zpracování jedné příchozí zprávy --------------------------------------
async function handleMessage(sock, gate, supabase, msg) {
  const key = msg.key || {};
  const remoteJid = key.remoteJid;
  if (!remoteJid || !msg.message) return;

  // 1) Vlastní zprávy (z jiného zařízení / Webu) → NIKDY, prevence smyčky.
  if (key.fromMe === true) {
    logger.info('[msg] vlastní zpráva — ignoruji (fromMe)');
    return;
  }

  // Fotka (i v ephemeral / view-once obalu) se řeší zvlášť: DeepSeek fotky
  // nečte, takže se fotka stáhne, uloží do Storage a pošle se jako mediaUrl.
  const imageMessage = getImageMessage(msg);

  let text = extractText(msg);
  if (!text) {
    if (imageMessage) {
      // Fotka bez popisku — dřív se ignorovala. Teď ji přeposíláme s placeholderem,
      // aby si ji v aplikaci mohl člověk otevřít a stáhnout.
      text = '📷 Fotka objednávky (bez popisu)';
      logger.info('[msg] fotka bez popisku — přeposílám s placeholderem (DeepSeek fotky nečte)');
    } else {
      logger.debug('[msg] zpráva bez textu (systémová/obrázek bez popisku) — ignoruji');
      return;
    }
  }

  const isGroup = remoteJid.endsWith('@g.us');
  const senderJid = isGroup ? key.participant || remoteJid : remoteJid;
  const senderNumber = (senderJid || '').split('@')[0] || '';
  const pushName = (msg.pushName || '').trim();

  // 2) Filtr čtení — stejná pravidla jako brána webhooku (název NEBO chat_id).
  //    Whitelist = whatsapp_senders (z aplikace) sjednocený s env proměnnými;
  //    přejmenovaná skupina projde přes registrované chat_id (viz lib/filter.js).
  let sender;
  if (isGroup) {
    const groupName = await getGroupSubject(sock, remoteJid);
    if (!gate.isGroupAllowed(groupName, remoteJid)) {
      logger.info(`[msg] skupina „${groupName}“ (${remoteJid}) není povolená — ignoruji`);
      return;
    }
    sender = groupName;
  } else {
    sender = pushName || senderNumber || remoteJid;
    if (!gate.isContactAllowed(sender, senderNumber)) {
      logger.info(`[msg] kontakt „${sender}“ (${senderNumber}) není povolený — ignoruji`);
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

  // Typ zprávy pro webhook (image/video/document/audio/text) — rozbalí i ephemeral.
  const m = msg.message || {};
  const unwrapped = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m;
  const messageType = unwrapped.imageMessage
    ? 'image'
    : unwrapped.videoMessage
      ? 'video'
      : unwrapped.documentMessage
        ? 'document'
        : unwrapped.audioMessage
          ? 'audio'
          : 'text';

  const webhookId = key.id ? `wa-${key.id}` : `wa-${Date.now()}-${senderNumber}`;

  // Fotka: stáhni ze serverů WhatsApp a ulož do Supabase Storage (veřejný bucket),
  // ať je v aplikaci trvale dostupná ke zobrazení a stažení. DeepSeek fotky nečte,
  // takže kontrola objednávky z fotky je vždy na člověku. mediaUrl pošleme
  // webhooku → whatsapp_incoming.media_url.
  let mediaUrl = null;
  if (imageMessage) {
    mediaUrl = await prepareImageForForwarding({
      msg,
      supabase,
      webhookId,
      logger,
    });
  }

  const payload = {
    sender,
    message: text,
    timestamp: new Date(tsMs).toISOString(),
    senderNumber,
    messageType,
    chatId: isGroup ? remoteJid : undefined,
    fromMe: false,
    webhookId,
    ...(mediaUrl ? { mediaUrl } : {}),
  };

  logger.info(
    `[msg] ➜ webhook: sender="${sender}" chatId="${payload.chatId || ''}" text="${text
      .slice(0, 60)
      .replace(/\n/g, ' ')}"`
  );
  await forwardToWebhook(payload, logger);
}


// --- Globální instance pro znovupoužití --------------------------------------
const supabase = getSupabase();
let gate = null;

// --- Hlavní smyčka -----------------------------------------------------------
async function start() {
  logger.info('=== WhatsApp Gateway (Baileys) ===');

  if (!gate) {
    // Storage bucket pro fotky — zkontroluj při startu (samo-opravné; bucket lze
    // vytvořit i migrací 20261010000000_add_whatsapp_media_bucket.sql).
    ensureMediaBucket(supabase, { logger });

    // Filtr čtení: whitelist z whatsapp_senders (aplikace) + env proměnné, pravidla
    // shodná s bránou webhooku (název NEBO chat_id). Obnovuje se každých 5 minut.
    gate = createMessageGate({
      supabase,
      allowedGroups: ALLOWED_GROUPS,
      allowedContacts: ALLOWED_CONTACTS,
      logger,
    });
    await gate.load();
    gate.startRefresh();
  }

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
      // Klikací odkaz na velký QR (párování je pak spolehlivější než skenování terminálu).
      // QR je jednorázový a za ~30-60 s vyprší — otevři ho hned a naskenuj telefonem.
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
      console.log('\n  Pro velký QR klikni sem (platí jen pár vteřin):\n  ' + qrUrl);
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
      } else {
        logger.info('[conn] Restartuji připojení za 3 sekundy...');
        setTimeout(() => {
          start().catch((e) => logger.error({ err: e }, 'Fatal chyba při znovupřipojení'));
        }, 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, gate, supabase, msg);
      } catch (e) {
        logger.error({ err: e }, '[msg] chyba zpracování');
      }
    }
  });
}

start().catch((e) => {
  logger.error({ err: e }, 'Fatal chyba při startu');
  process.exit(1);
});

startHealthServer();

