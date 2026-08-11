import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Interface for incoming webhook payload from Make.com
interface MakeWebhookPayload {
  // Required fields
  message: string;
  sender: string;
  timestamp: string; // ISO timestamp or epoch
  
  // Optional fields
  senderNumber?: string;
  // Skutečné jméno pisatele ve skupině (pushName z WhatsApp bridge). Pro
  // soukromé zprávy se rovná sender. Aliasy: participantName | participant_name.
  participantName?: string;
  participant_name?: string;
  messageType?: string;
  webhookId?: string;
  mediaUrl?: string;
  attachments?: Array<{
    type: string;
    url: string;
    filename?: string;
  }>;

  // ✅ Chat/group ID (např. "120363...@g.us") — stabilní identifikátor skupiny.
  //    Tasker/AutoNotification: %anwhatsappchatid (pokud ho verze nabízí),
  //    jinak libovolná WhatsApp API (chatId). Aliasy: chatId | chat_id.
  chatId?: string;
  chat_id?: string;

  // ✅ Vlastní zpráva (odeslaná z jiného zařízení/Webu) — from_me=true se uloží
  //    s flagem from_me, aby ji aplikace odlišila od zákaznických zpráv.
  //    Aliasy: fromMe | from_me. Pokud se neposílá, použije se prefixová
  //    heuristika "You:/Ty:/Vy:" v textu (viz isOwnMessage).
  fromMe?: boolean;
  from_me?: boolean;
  
  // Make metadata
  makeWebhookId?: string;
  makeScenarioId?: string;
  makeExecutionId?: string;
}

// Interface for database insertion
interface WhatsAppIncomingRecord {
  sender_name: string;
  sender_number?: string;
  participant_name?: string;
  message_text: string;
  message_timestamp?: string;
  message_type?: string;
  media_url?: string;
  webhook_id?: string;
  webhook_timestamp?: string;
  chat_id?: string;
  from_me?: boolean;
}

/**
 * Escapuje surové řídicí znaky (skutečné nové řádky apod., které posílá Tasker
 * v %antext) POUZE uvnitř JSON stringů. Vně stringů nechává JSON tak, jak je,
 * aby se nerozbilo formátování. Jinak by multi-line zpráva z Taskeru skončila
 * HTTP 400 ("Bad control character in string literal") a objednávka by se ztratila.
 */
function escapeControlCharsInJsonStrings(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      const code = ch.charCodeAt(0);
      if (code < 0x20 || code === 0x7f) {
        switch (ch) {
          case "\n": out += "\\n"; break;
          case "\r": out += "\\r"; break;
          case "\t": out += "\\t"; break;
          case "\b": out += "\\b"; break;
          case "\f": out += "\\f"; break;
          default: out += "\\u" + code.toString(16).padStart(4, "0");
        }
        continue;
      }
      out += ch;
    } else {
      out += ch === '"' ? ((inString = true), ch) : ch;
    }
  }
  return out;
}

/**
 * Normalizace názvu odesílatele/skupiny: malá písmena, ořezané mezery, bez
 * diakritiky. "objednavky pivovar" == "Objednávky pivovar".
 */
function normName(s: string): string {
  return (s || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Heuristická detekce vlastní zprávy (from_me), pokud ji Tasker neposílá:
 * WhatsApp zprávy odeslané z jiného zařízení/Webu začínají v notifikaci
 * prefixem "You: ", "Ty: ", "Vy: " apod.
 */
const OWN_MESSAGE_PREFIX = /^(you|vy|ty|já|ja)\s*:\s/i;
function isOwnMessage(text: string): boolean {
  return OWN_MESSAGE_PREFIX.test((text || "").trimStart());
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // 📡 Ping (GET) — rychlá kontrola z telefonu, že URL a server fungují.
  //    Nepotřebuje token ani tělo (nic nevrací citlivého). V Taskeru/prohlížeči
  //    na telefonu stačí otevřít: https://…/functions/v1/whatsapp-webhook
  //    a vidět {"ok":true}. Pomáhá odlišit „neposílá telefon" od „webhook odmítá".
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        service: "whatsapp-webhook",
        hint: "POST s hlavičkou x-webhook-token pro odeslání zprávy",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 🔐 Ověření sdíleného tajemství webhooku.
  // Aktivuje se až ve chvíli, kdy je v Supabase nastavena proměnná WEBHOOK_SECRET.
  // Tasker/Make pak musí posílat hlavičku `x-webhook-token` se stejnou hodnotou.
  // Bez nastaveného tajemství zůstává webhook otevřený (pro lokální vývoj).
  const webhookSecret = Deno.env.get("WEBHOOK_SECRET") ?? "";
  if (webhookSecret) {
    const provided = req.headers.get("x-webhook-token") ?? "";
    if (provided !== webhookSecret) {
      console.warn(
        `[whatsapp-webhook] 401 — chybí nebo nesouhlasí x-webhook-token (WEBHOOK_SECRET je nastaveno). Požadavek NEBYL zpracován — zpráva se NEULOŽÍ. Tasker: doplň hlavičku x-webhook-token.`
      );
      return new Response(
        JSON.stringify({ error: "Unauthorized: chybí nebo nesouhlasí x-webhook-token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Parse request body
    // Make/Tasker posílá text zprávy se skutečnými novými řádky. JSON je přísný
    // na řídicí znaky uvnitř stringů, proto čteme text a při neúspěchu escapujeme
    // řídicí znaky jen uvnitř stringů a zkusíme to znovu (viz escapeControlChars...).
    let payload: MakeWebhookPayload;
    const rawBody = await req.text();
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      try {
        payload = JSON.parse(escapeControlCharsInJsonStrings(rawBody));
      } catch (e2) {
        return new Response(
          JSON.stringify({ error: "Invalid JSON payload", details: e2.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate required fields
    if (!payload.message || !payload.sender) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: 'message' and 'sender' are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse timestamp — Tasker posílá %antime (epoch SEKUNDY, 10 číslic) nebo
    // %TIMEMS (milisekundy, 13 číslic); Make posílá ISO string. Rozlišíme to podle
    // tvaru, ať se zprávy nezobrazují s časem roku 1970.
    let messageTimestamp: Date | null = null;
    if (payload.timestamp) {
      try {
        const raw = String(payload.timestamp).trim();
        if (/^\d{1,16}$/.test(raw)) {
          const num = Number(raw);
          if (num > 0) {
            messageTimestamp = new Date(num < 1e12 ? num * 1000 : num);
          }
        } else {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) messageTimestamp = d;
        }
      } catch (e) {
        console.warn("Failed to parse timestamp:", e);
      }
    }

    // Prepare record for database
    const record: WhatsAppIncomingRecord = {
      sender_name: payload.sender.trim(),
      message_text: payload.message.trim(),
      message_type: payload.messageType || "text",
      webhook_id: payload.webhookId || payload.makeWebhookId,
      webhook_timestamp: new Date().toISOString(),
    };

    // Add optional fields if present
    if (payload.senderNumber) {
      record.sender_number = payload.senderNumber.trim();
    }

    // Skutečné jméno pisatele ve skupině (participantName z bridge). Pro
    // soukromé zprávy se rovná senderu, takže se ukládá jen, když se liší.
    const participantName = String(
      payload.participantName ?? payload.participant_name ?? ""
    ).trim();
    if (participantName && participantName !== record.sender_name) {
      record.participant_name = participantName;
    }

    // Fotka/příloha — mediaUrl (fotky stahuje a ukládá do Supabase Storage
    // whatsapp-bridge; sem chodí jen finální URL) nebo první attachment s URL.
    // Slouží k zobrazení a stažení v aplikaci — DeepSeek fotky nečte.
    const firstAttachmentUrl = (payload.attachments && payload.attachments.length > 0)
      ? payload.attachments.find((a) => a.url)?.url
      : undefined;
    const mediaUrl = payload.mediaUrl || firstAttachmentUrl;
    if (mediaUrl) {
      record.media_url = mediaUrl.trim();
    }

    if (messageTimestamp && !isNaN(messageTimestamp.getTime())) {
      record.message_timestamp = messageTimestamp.toISOString();
    }

    // ✅ Brána: zpracovávají se JEN zprávy od povolených odesílatelů (whitelist
    //    ve `whatsapp_senders`). Whitelist se porovnává podle NÁZVU skupiny bez
    //    diakritiky a velikosti písmen (viz normName).
    //    chat_id je dobrovolná stabilizační pojistka:
    //      • když má odesílatel zaregistrované chat_id a zpráva nějaké posílá,
    //        MUSÍ souhlasit (jinak je to jiná skupina se stejným názvem);
    //      • když zpráva chat_id neposílá (Tasker %anwhatsappchatid často neumí),
    //        projde podle názvu — název-filtr funguje i po zaregistrování chat_id.
    //    Vlastní zprávy (from_me=true — píše je sám majitel ze spárovaného
    //    telefonu, do skupiny i soukromě) whitelist OBEJDOU a vždy se uloží
    //    s flagem from_me, aby je aplikace rozlišila od zákaznických objednávek.
    const chatId = String(payload.chatId ?? payload.chat_id ?? "").trim();
    const fromMe =
      payload.fromMe === true ||
      payload.from_me === true ||
      isOwnMessage(payload.message);

    record.chat_id = chatId || undefined;
    record.from_me = fromMe || undefined;

    if (fromMe) {
      console.log(
        `[whatsapp-webhook] vlastní zpráva (from_me): sender="${record.sender_name}" chat_id="${chatId}" — ukládám s from_me=true.`
      );
    }

    const { data: senderRows } = await supabase
      .from("whatsapp_senders")
      .select("sender_name, chat_id");
    const senders = senderRows || [];

    const skip = (reason: string, extra: Record<string, unknown> = {}) =>
      new Response(
        JSON.stringify({
          success: true,
          message: reason,
          skipped: true,
          sender_name: record.sender_name,
          chat_id: chatId || null,
          ...extra,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    // Whitelist (prázdný seznam = povoleno vše, zpětně kompatibilní). Najdeme
    // odesílatele podle normalizovaného názvu (bez diakritiky a velikosti).
    const allowedChatIds = senders
      .map((s: any) => (s.chat_id || "").trim().toLowerCase())
      .filter(Boolean);
    const senderRow = senders.find(
      (s: any) => normName(s.sender_name) === normName(record.sender_name)
    );
    // Zpráva je povolená, když odesílatel je ve whitelistu podle názvu NEBO
    // chat_id zprávy odpovídá zaregistrovanému chat_id (skupina se mohla
    // přejmenovat — chat_id je stabilní). Stejná pravidla jako DB trigger
    // (check_whatsapp_sender_allowed) a whatsapp-auto-parse.
    const chatAllowed = chatId !== "" && allowedChatIds.includes(chatId.toLowerCase());
    if (!fromMe && senders.length > 0 && !senderRow && !chatAllowed) {
      console.log(
        `[whatsapp-webhook] IGNOROVÁNO — odesílatel "${record.sender_name}" (chat_id="${chatId}") není v whitelistu.`
      );
      return skip(
        "Sender not allowed — message skipped (povolena je jen skupina Objednávky pivovar)"
      );
    }

    // chat_id — dobrovolná stabilizační pojistka (viz komentář výše). Název-filtr
    // zůstává aktivní: prázdné chat_id v payloadu zprávu NEzahodí (Tasker ho často
    // neposílá), ale pokud zpráva chat_id posílá a odesílatel ho má registrované,
    // musí souhlasit.
    const registeredChatId = (senderRow && (senderRow.chat_id || "").trim()) || "";
    if (!fromMe && senderRow && registeredChatId) {
      if (chatId && chatId.toLowerCase() !== registeredChatId.toLowerCase()) {
        console.log(
          `[whatsapp-webhook] IGNOROVÁNO — chat_id="${chatId}" nesouhlasí se zaregistrovaným "${registeredChatId}" pro "${record.sender_name}".`
        );
        return skip(
          "chat_id not allowed — message skipped (chat_id nesouhlasí se zaregistrovaným pro tuto skupinu)",
          { chat_id_unknown: true }
        );
      }
      if (!chatId) {
        console.log(
          `[whatsapp-webhook] chat_id nebylo v payloadu odesláno (Tasker neposílá chatId) — prošlo podle názvu skupiny "${record.sender_name}".`
        );
      }
    } else {
      // chat_id u odesílatele ještě není zaregistrováno → platí jen název-filtr.
      if (chatId) {
        console.log(
          `[whatsapp-webhook] 🆔 DETEKCE chat_id pro skupinu "${record.sender_name}": chat_id="${chatId}" — zaregistruj ho: node scripts/set-whatsapp-senders.mjs --chat-id "${chatId}"`
        );
      } else {
        console.log(
          `[whatsapp-webhook] Zpráva ze skupiny "${record.sender_name}" přijata BEZ chat_id — pošli ho v payloadu (Tasker: např. %anwhatsappchatid), ať se dá filtrovat stabilně.`
        );
      }
    }

    // ✅ Log zpracované zprávy: sender + chat_id pro kontrolu.
    console.log(
      `[whatsapp-webhook] ✅ ZPRACOVÁNO: sender="${record.sender_name}" chat_id="${chatId}" webhook_id="${record.webhook_id || ""}" msg="${record.message_text.slice(0, 80).replace(/\n/g, " ")}"`
    );

    // Check for duplicate webhook ID to prevent duplicate processing
    if (record.webhook_id) {
      const { data: existing } = await supabase
        .from("whatsapp_incoming")
        .select("id")
        .eq("webhook_id", record.webhook_id)
        .maybeSingle();

      if (existing) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: "Duplicate webhook ID, message already received",
            id: existing.id 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Insert into database
    const { data, error } = await supabase
      .from("whatsapp_incoming")
      .insert(record)
      .select()
      .single();

    if (error) {
      console.error("Database insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to store message", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: "WhatsApp message received and stored",
        id: data.id,
        status: "pending",
        next_step: "Message will be automatically parsed by AI in the background"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error", 
        details: err?.message || String(err) 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});