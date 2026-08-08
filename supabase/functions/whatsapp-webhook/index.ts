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
  messageType?: string;
  webhookId?: string;
  attachments?: Array<{
    type: string;
    url: string;
    filename?: string;
  }>;
  
  // Make metadata
  makeWebhookId?: string;
  makeScenarioId?: string;
  makeExecutionId?: string;
}

// Interface for database insertion
interface WhatsAppIncomingRecord {
  sender_name: string;
  sender_number?: string;
  message_text: string;
  message_timestamp?: string;
  message_type?: string;
  webhook_id?: string;
  webhook_timestamp?: string;
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

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
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

    // Parse timestamp
    let messageTimestamp: Date | null = null;
    if (payload.timestamp) {
      try {
        // Try parsing as ISO string
        messageTimestamp = new Date(payload.timestamp);
        if (isNaN(messageTimestamp.getTime())) {
          // Try parsing as epoch milliseconds
          const epoch = parseInt(payload.timestamp);
          if (!isNaN(epoch)) {
            messageTimestamp = new Date(epoch);
          }
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

    if (messageTimestamp && !isNaN(messageTimestamp.getTime())) {
      record.message_timestamp = messageTimestamp.toISOString();
    }

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