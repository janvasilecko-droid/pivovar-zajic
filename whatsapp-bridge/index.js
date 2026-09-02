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
import { getSupabase, useSupabaseAuthState, clearSession } from './lib/supabaseAuth.js';
import { createMessageGate } from './lib/filter.js';
import { HistoryCollector, normTs } from './lib/history.js';
import { spustTep, spustPrikazy } from './lib/stav.js';
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

/** Sdílené tajemství pro POST /send (appka žádá bridge o odeslání zprávy ven).
    Bez správné hlavičky x-send-token vrací /send HTTP 401. */
const SEND_TOKEN = process.env.SEND_TOKEN || '';

/** Historie chatu: starší zprávy (history sync) se po připojení přeposílají do aplikace. */
const SYNC_HISTORY = (process.env.SYNC_HISTORY || 'on') !== 'off';
const HISTORY_MAX_MESSAGES = Math.max(0, Number(process.env.HISTORY_MAX_MESSAGES || 1000) || 0);
const HISTORY_MAX_DAYS = Math.max(0, Number(process.env.HISTORY_MAX_DAYS || 4) || 0);

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

// --- Sdílený stav pro QR endpoint -----------------------------------------
// `/qr` (živá HTML stránka) a `/qr/raw` (JSON) čtou poslední QR string, který
// sem zapisuje `connection.update`. QR se rotuje každých ~20 s — díky tomu, že
// stránka sama obnovuje, uživatel nikdy neskenuje prošlý QR (to je nejčastější
// příčina „Zařízení se nepodařilo propojit s účtem“).
const qrState = {
  qr: null, // poslední QR string (null = zatím žádný / nepárované)
  connected: false,
  updatedAt: null,
  sock: null, // aktuální živý Baileys socket (přepisuje se při každém (re)připojení) — čte ho POST /send
  poznamka: null, // poslední důvod odpojení / stav — píše se do tepu
  posledniUdalost: null, // kdy naposledy něco přišlo z WhatsAppu (diagnostika hluché session)
};

/** Bezpečné porovnání tajemství (stejná odolnost proti timing útoku jako u webhooku). */
function secretsEqual(actual, expected) {
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i++) mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

// --- Health + QR endpoint (Render Web Service / health check) --------------
function renderQrPage() {
  return `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WhatsApp Bridge — párování QR</title>
<style>
  body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;flex-direction:column;align-items:center;min-height:100vh;margin:0;padding:24px}
  h1{font-size:18px;margin:0}
  #status{font-size:14px;margin:12px 0 16px;color:#94a3b8;text-align:center;max-width:520px}
  #qrbox{background:#fff;padding:16px;border-radius:12px}
  img{width:340px;max-width:90vw;height:auto;display:block}
  ol{max-width:440px;font-size:14px;line-height:1.7;color:#cbd5e1;padding-left:20px}
  .ok{color:#4ade80;font-weight:600}
</style>
</head>
<body>
  <h1>Spárování WhatsApp bridgu</h1>
  <div id="status">Načítám QR…</div>
  <div id="qrbox"><img id="qrimg" alt="QR"></div>
  <ol>
    <li>Otevři <b>WhatsApp</b> na telefonu → <b>Nastavení → Propojená zařízení → Propojit zařízení</b>.</li>
    <li>Namiř foťák na QR níže. Stránka se sama obnovuje každé 4 s, takže QR je vždy čerstvý.</li>
    <li>Po naskenování QR zmizí a uvidíš „Spárováno ✅“.</li>
  </ol>
<script>
  const img=document.getElementById('qrimg'),status=document.getElementById('status');
  async function tick(){
    try{
      const d=await (await fetch('/qr/raw',{cache:'no-store'})).json();
      if(d.connected){status.className='ok';status.textContent='Spárováno ✅ — zařízení je online, QR už není potřeba.';img.style.display='none';}
      else if(d.qr){
        status.textContent='QR je platný — naskenuj ho telefonem (stránka se sama obnovuje).';
        img.src='https://api.qrserver.com/v1/create-qr-code/?size=400x400&data='+encodeURIComponent(d.qr);
        img.style.display='block';
      }else{status.textContent='Zatím žádný QR — čekám na připojení…';img.style.display='none';}
    }catch(e){status.textContent='Chyba spojení — zkusím to znovu…';}
  }
  tick();setInterval(tick,4000);
</script>
</body>
</html>`;
}

/** Přečte a rozparsuje JSON tělo POST requestu (limit 64 KB — jen krátké zprávy). */
function readJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function startHttpServer(state) {
  const port = Number(process.env.PORT || 3000);
  createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];

    // Živá QR stránka pro párování (místo lovení QR v logu Renderu).
    if (url === '/qr' || url === '/qr/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(renderQrPage());
      return;
    }
    // JSON s aktuálním QR — stránka /qr ho polluje každé 4 s.
    if (url === '/qr/raw') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({
        qr: state.qr,
        connected: state.connected,
        updatedAt: state.updatedAt,
      }));
      return;
    }

    // Odeslání zprávy ven (appka → bridge → WhatsApp) — např. shrnutí nové
    // objednávky do skupiny "Objednávky pivovar". Chráněno sdíleným
    // tajemstvím (x-send-token), stejný princip jako u příchozího webhooku.
    if (url === '/send' && req.method === 'POST') {
      res.setHeader('Content-Type', 'application/json');
      if (!SEND_TOKEN) {
        res.statusCode = 503;
        res.end(JSON.stringify({ ok: false, error: 'SEND_TOKEN není nastavený na bridge' }));
        return;
      }
      const token = req.headers['x-send-token'] || '';
      if (typeof token !== 'string' || !secretsEqual(token, SEND_TOKEN)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ ok: false, error: 'neplatný x-send-token' }));
        return;
      }
      readJsonBody(req)
        .then(async (body) => {
          const chatId = String(body?.chatId || '').trim();
          const text = String(body?.text || '').trim();
          if (!chatId || !text) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: 'chybí chatId nebo text' }));
            return;
          }
          if (!state.sock || !state.connected) {
            res.statusCode = 503;
            res.end(JSON.stringify({ ok: false, error: 'WhatsApp spojení není aktivní (bridge se právě (znovu)připojuje)' }));
            return;
          }
          try {
            const sent = await state.sock.sendMessage(chatId, { text });
            logger.info(`[send] odesláno do ${chatId} (id=${sent?.key?.id ?? '?'})`);
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, id: sent?.key?.id ?? null }));
          } catch (e) {
            logger.error({ err: e }, '[send] odeslání selhalo');
            res.statusCode = 502;
            res.end(JSON.stringify({ ok: false, error: e?.message || 'odeslání selhalo' }));
          }
        })
        .catch((e) => {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'neplatné JSON tělo: ' + (e?.message || '') }));
        });
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, service: 'whatsapp-bridge', uptime: process.uptime() }));
  }).listen(port, () => logger.info(`[health] HTTP server na portu ${port} (QR: /qr, odesílání: POST /send)`));
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

// --- Text CITOVANÉ zprávy (na kterou se odpovídá), pokud jde o odpověď -----
// WhatsApp posílá u odpovědí "contextInfo.quotedMessage" (obsah zprávy, na
// kterou se odpovídá) — dřív se zahazovalo, takže AI musela hádat kontext
// jen podle pořadí zpráv v chatu (chybovalo to, když mezi odpovědí a
// původní objednávkou přišla mezitím jiná objednávka od jiného odběratele).
function extractQuotedText(message) {
  if (!message) return '';
  const m = message.message || {};
  const unwrapped = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m;
  const ctx =
    unwrapped.extendedTextMessage?.contextInfo ||
    unwrapped.imageMessage?.contextInfo ||
    unwrapped.videoMessage?.contextInfo ||
    unwrapped.documentMessage?.contextInfo ||
    null;
  const quoted = ctx?.quotedMessage;
  if (!quoted) return '';
  return extractText({ message: quoted });
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
async function handleMessage(sock, gate, supabase, msg, opts = {}) {
  const { history = false } = opts;
  const key = msg.key || {};
  const remoteJid = key.remoteJid;
  if (!remoteJid || !msg.message) return;

  // 1) Vlastní zprávy (z jiného zařízení / Webu) — zpracovávají se na přání uživatele.
  if (key.fromMe === true) {
    logger.info('[msg] vlastní zpráva — vyhodnocuji (fromMe)');
  }

  // Fotka (i v ephemeral / view-once obalu) se řeší zvlášť: DeepSeek fotky
  // nečte, takže se fotka stáhne, uloží do Storage a pošle se jako mediaUrl.
  const imageMessage = getImageMessage(msg);

  let text = extractText(msg);
  if (!text) {
    if (imageMessage) {
      if (history) {
        // V historii stará média nestahujeme — fotka bez popisku nemá co přeposlat.
        logger.debug('[msg] historie: fotka bez popisku — přeskočena');
        return;
      }
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
  //
  //    VLASTNÍ ZPRÁVY (fromMe) WHITELIST OBCHÁZEJÍ — píše je sám majitel ze
  //    spárovaného telefonu (do skupiny i soukromě), takže projdou vždy.
  //    Bylo to tu napsané v komentáři, ale `isOwn` se v podmínkách nikdy
  //    nepoužilo: most si do logu poznamenal „vlastní zpráva — vyhodnocuji
  //    (fromMe)" a hned na dalším řádku ji zahodil jako nepovoleného kontakta.
  //    Objednávka napsaná z vlastního telefonu se tím nikdy nedostala dál —
  //    webhook (whatsapp-webhook/index.ts ř. 322) i trigger v databázi ji
  //    přitom čekají a rozliší ji příznakem from_me.
  const isOwn = key.fromMe === true;
  let sender;
  if (isGroup) {
    const groupName = await getGroupSubject(sock, remoteJid);
    if (!isOwn && !gate.isGroupAllowed(groupName, remoteJid)) {
      logger.info(`[msg] skupina „${groupName}“ (${remoteJid}) není povolená — ignoruji`);
      return;
    }
    sender = groupName;
  } else {
    sender = pushName || senderNumber || remoteJid;
    if (!isOwn && !gate.isContactAllowed(sender, senderNumber)) {
      logger.info(`[msg] kontakt „${sender}“ (${senderNumber}) není povolený — ignoruji`);
      return;
    }
  }

  // Dedup podle stabilního key.id
  if (key.id) {
    if (SEEN.has(key.id)) return;
    remember(key.id);
  }

  const tsMs = normTs(msg.messageTimestamp);

  // Pokud je to zpráva z historie a je starší než pátek 7. 8. 2026, přeskočíme ji,
  // aby se zbytečně nenačítala stará historie (např. z července).
  if (history) {
    const minTimestamp = new Date('2026-08-07T00:00:00Z').getTime();
    if (tsMs < minTimestamp) {
      logger.debug(
        `[msg] historie: zpráva ze dne ${new Date(tsMs).toLocaleDateString('cs-CZ')} je starší než pátek 7.8.2026 — přeskočena`
      );
      return;
    }
  }

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
  if (imageMessage && !history) {
    // Stará média z historie nestahujeme (pomalé a zbytečné) — text a popisky jdou dál.
    mediaUrl = await prepareImageForForwarding({
      msg,
      supabase,
      webhookId,
      logger,
    });
  }

  const quotedText = extractQuotedText(msg);

  const payload = {
    sender,
    // Skutečné jméno pisatele (pushName). Pro skupinové zprávy je sender název
    // skupiny a participantName je jméno konkrétní osoby, která zprávu napsala
    // (důležité pro AI: "pro mě" v textu znamená tohoto odesílatele).
    participantName: (pushName || senderNumber || '').trim(),
    message: text,
    timestamp: new Date(tsMs).toISOString(),
    senderNumber,
    messageType,
    chatId: isGroup ? remoteJid : undefined,
    fromMe: key.fromMe === true,
    webhookId,
    ...(mediaUrl ? { mediaUrl } : {}),
    // Text zprávy, na kterou tahle odpovídá (WhatsApp "reply"/citace) — jasný
    // signál, KTERÉ objednávky se odpověď týká, místo hádání podle pořadí.
    ...(quotedText ? { quotedText } : {}),
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
/** Instance dostala SIGTERM — nesmí se už znovu připojovat (viz `ukonci`). */
let koncim = false;

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
    syncFullHistory: SYNC_HISTORY,
    markOnlineOnConnect: false,
  });
  qrState.sock = sock; // POST /send vždy použije aktuální (znovu)připojený socket

  // Perzistence: při každé změně přihlašovacích klíčů → Supabase
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrState.qr = qr;
      qrState.connected = false;
      qrState.updatedAt = new Date().toISOString();

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
      qrState.connected = true;
      qrState.poznamka = 'spojení navázáno';
      logger.info('[conn] OPEN — spárováno a online ✔');
    }

    if (connection === 'close') {
      qrState.connected = false;
      // Instance, kterou Render odepsal, se už nikdy nesmí připojit zpátky —
      // jinak vykope tu novou (viz `ukonci`).
      if (koncim) {
        logger.info('[conn] spojení zavřeno během ukončování — nepřipojuji se');
        return;
      }
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      qrState.poznamka = loggedOut ? 'odhlášeno ve WhatsAppu' : `spojení zavřeno (kód ${code ?? '?'})`;
      logger.warn(`[conn] připojení zavřeno (statusCode=${code}, loggedOut=${loggedOut})`);
      if (loggedOut) {
        // Uživatel odpojil zařízení v WhatsAppu → smažeme session; start() pak
        // vygeneruje nový QR. (Znovupárování je zároveň jediný spolehlivý způsob,
        // jak dostat starší zprávy — telefon pošle historii při párování.)
        logger.error('[conn] Zařízení bylo odpojeno (logged out) — mažu session, připravuji nový QR…');
        try {
          await clearSession(supabase, logger);
        } catch (e) {
          logger.error({ err: e }, '[conn] nelze smazat whatsapp_session');
        }
        setTimeout(() => {
          start().catch((e) => logger.error({ err: e }, 'Fatal chyba při znovupřipojení'));
        }, 1000);
      } else {
        // KONFLIKT (statusCode 440, `stream:error` s `conflict type="replaced"`)
        // znamená, že se na TUTÉŽ session připojil někdo další — na Renderu
        // typicky druhá instance mostu, která při nasazení nebo probouzení
        // chvíli běží souběžně se starou. WhatsApp pustí ke schránce vždycky
        // jen jednu, tu druhou vyhodí.
        //
        // Připojit se po 3 vteřinách zpátky je v té situaci to nejhorší
        // možné: vyhozená instance vykopne tu, která zrovna vyhrála, ta se
        // za 3 s vrátí a vykopne ji — a takhle donekonečna. 31. 8. 2026
        // večer se takhle obě instance přetahovaly celou noc a session z
        // toho vyšla „přihlášená, ale hluchá": spojení se navázalo, ale
        // WhatsApp na tohle zařízení přestal doručovat (žádná zpráva ani
        // historie od 31. 8. 13:21). Most to nepoznal, protože `open`
        // přišlo normálně, a hlásil do tepu `pripojeno: true`.
        //
        // Proto se po konfliktu čeká podstatně dýl. Souběžná instance je
        // vždycky krátkodobá (dobíhající deploy), takže než tenhle pokus
        // vyprší, zůstane naživu jen jedna — a přetahovaná nezačne.
        const konflikt = code === DisconnectReason.connectionReplaced || code === 440;
        const zaMs = konflikt ? 60_000 : 3000;
        if (konflikt) {
          qrState.poznamka = 'konflikt — připojila se druhá instance, čekám minutu';
          logger.warn('[conn] KONFLIKT (jiná instance převzala session) — čekám 60 s, ať se přetahovaná nerozjede');
        } else {
          logger.info('[conn] Restartuji připojení za 3 sekundy...');
        }
        setTimeout(() => {
          start().catch((e) => logger.error({ err: e }, 'Fatal chyba při znovupřipojení'));
        }, zaMs);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Značka „naposledy jsem něco slyšel" se zapisuje PŘED filtrem typu i
    // whitelistu — jde o diagnostiku spojení, ne o obsah. Právě tohle
    // odlišuje „nikdo nic nenapsal" od „session je přihlášená, ale hluchá"
    // (viz konflikt v connection.update výš): v druhém případě je
    // `pripojeno: true`, ale tahle značka celé dny nehne.
    qrState.posledniUdalost = new Date().toISOString();
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleMessage(sock, gate.getGate(), supabase, msg);
      } catch (e) {
        logger.error({ err: e }, '[msg] chyba zpracování');
      }
    }
  });

  // Historie chatu: WhatsApp po připojení posílá starší zprávy (history sync) v dávkách.
  // Kolektor je poskládá, vybere nejnovějších HISTORY_MAX_MESSAGES a přeposílá stejným
  // pipeline jako živé zprávy (whitelist + fromMe bypass + dedup podle key.id / webhook_id).
  const historyCollector =
    SYNC_HISTORY && HISTORY_MAX_MESSAGES > 0
      ? new HistoryCollector({
          cap: HISTORY_MAX_MESSAGES,
          maxDays: HISTORY_MAX_DAYS,
          logger,
          onMessage: (msg) => handleMessage(sock, gate.getGate(), supabase, msg, { history: true }),
        })
      : null;
  if (historyCollector) {
    sock.ev.on('messaging-history.set', (data) => historyCollector.add(data));
    logger.info(
      HISTORY_MAX_DAYS > 0
        ? `[history] sync zapnut — po připojení přepošlu max. ${HISTORY_MAX_MESSAGES} nejnovějších zpráv historie z posledních ${HISTORY_MAX_DAYS} dní`
        : `[history] sync zapnut — po připojení přepošlu max. ${HISTORY_MAX_MESSAGES} nejnovějších zpráv historie`
    );
  }
}

start().catch((e) => {
  logger.error({ err: e }, 'Fatal chyba při startu');
  process.exit(1);
});

// 🛑 Řízené ukončení. Render při nasazení pošle staré instanci SIGTERM a dá
// jí ještě desítky vteřin na doběhnutí — a přesně v tom okně vznikala
// přetahovaná o session: doběhávající instance měla pořád otevřený socket
// a naplánovaný `start()` z posledního odpojení, takže novou instanci
// vykopla ještě potom, co ji Render odepsal.
//
// `koncim` proto zastaví plánované znovupřipojení (kontroluje ho
// connection.update) a socket zavře hned, ne až se proces sám ukončí.
process.on('SIGTERM', () => ukonci('SIGTERM'));
process.on('SIGINT', () => ukonci('SIGINT'));

function ukonci(signal) {
  if (koncim) return;
  koncim = true;
  logger.info(`[konec] ${signal} — zavírám spojení a už se nepřipojuji (uvolňuji session pro novou instanci)`);
  try {
    qrState.sock?.end(new Error('ukončení instance'));
  } catch (e) {
    logger.warn({ err: e }, '[konec] socket se nepodařilo zavřít');
  }
  // Krátká chvíle na doposlání rozdělané zprávy na webhook, pak konec.
  setTimeout(() => process.exit(0), 2000).unref?.();
}

startHttpServer(qrState);

// 💓 Tep — každou minutu „žiju" do databáze. Bez toho se v aplikaci nedá
// odlišit „nikdo nic neposlal" od „most neběžel": obojí vypadá stejně, tedy
// prázdno. Na bezplatném Renderu je to podstatné, instance po ~15 minutách
// nečinnosti usne a spící most zprávy živě nedostane.
spustTep(
  supabase,
  () => {
    // „Přihlášená, ale hluchá" session (viz konflikt v connection.update):
    // `pripojeno` je true, ale z WhatsAppu celé hodiny nic nepřijde. Samotný
    // příznak připojení to neprozradí — tep proto nese i to, jak dlouho je
    // ticho po drátě, ať je v databázi vidět rozdíl mezi „nikdo nepíše" a
    // „most nic nedostává, spraví to jen nové spárování".
    const ticho = qrState.posledniUdalost
      ? Math.round((Date.now() - Date.parse(qrState.posledniUdalost)) / 60000)
      : null;
    const hluchy = qrState.connected && ticho !== null && ticho > 180;
    return {
      pripojeno: qrState.connected,
      poznamka: hluchy
        ? `připojeno, ale ${Math.floor(ticho / 60)} h nic nepřišlo — nejspíš ztracené spárování, načti QR znovu`
        : qrState.poznamka,
    };
  },
  logger,
  process.env.RENDER_GIT_COMMIT?.slice(0, 7) || '',
);

// 📥 Příkazy z aplikace. Jediný je „srovnat": zavřít spojení a nechat most
// znovu se připojit — WhatsApp při tom pošle historii skupiny a chybějící
// zprávy projdou stejnou cestou jako živé (dedup podle key.id je nezdvojí).
// Reconnect obstará existující větev connection.close, nic dalšího netřeba.
spustPrikazy(
  supabase,
  async () => {
    if (!qrState.sock) throw new Error('most zatím nemá spojení, není co znovu navázat');
    try {
      qrState.sock.end(new Error('srovnání na žádost z aplikace'));
    } catch (e) {
      logger.warn({ err: e }, '[prikazy] zavření socketu selhalo, zkusím pokračovat');
    }
    return 'Most se znovu připojuje; historie skupiny se dopočítá během pár minut.';
  },
  logger,
);

