import { createClient } from "npm:@supabase/supabase-js@2";
import { readJsonWithLimit, requireApprovedUser } from "../_shared/require-user.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SendOrderItem {
  qty: number;
  beerName: string;
  packageLabel: string;
}

interface SendOrderBody {
  placeName: string;
  items: SendOrderItem[];
  note?: string | null;
}

/**
 * Naformátuje shrnutí nové objednávky ve tvaru
 * "odběratel: množství: pivo: (případně poznámka)" pro odeslání do WhatsApp
 * skupiny "Objednávky pivovar" — stejné skupiny, ze které appka zprávy čte.
 */
function formatOrderMessage(body: SendOrderBody): string {
  const lines = [`✅ Nová objednávka`, `Odběratel: ${body.placeName}`];
  for (const item of body.items) {
    lines.push(`Množství: ${item.qty}× ${item.packageLabel}   Pivo: ${item.beerName}`);
  }
  if (body.note && body.note.trim()) {
    lines.push(`Poznámka: ${body.note.trim()}`);
  }
  return lines.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const auth = await requireApprovedUser(req, supabase, corsHeaders, {
      bucket: "whatsapp-send-order",
      limit: 20,
      windowSeconds: 60,
    });
    if (!auth.ok) return auth.response;

    const body = await readJsonWithLimit<SendOrderBody>(req, 32 * 1024);
    if (!body.placeName || !Array.isArray(body.items) || body.items.length === 0) {
      return new Response(
        JSON.stringify({ error: "Chybí odběratel nebo položky objednávky." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Cílová skupina (chat_id) — stejná, ze které appka WhatsApp zprávy čte.
    const { data: senderRow } = await supabase
      .from("whatsapp_senders")
      .select("chat_id")
      .eq("sender_name", "Objednávky pivovar")
      .maybeSingle();
    const chatId = senderRow?.chat_id;

    const { data: secretRows } = await supabase
      .from("app_secrets")
      .select("key, value")
      .in("key", ["WHATSAPP_BRIDGE_URL", "WHATSAPP_SEND_TOKEN"]);
    const secretsMap = new Map((secretRows ?? []).map((s) => [s.key, s.value]));
    const bridgeUrl = secretsMap.get("WHATSAPP_BRIDGE_URL");
    const sendToken = secretsMap.get("WHATSAPP_SEND_TOKEN");

    if (!chatId) {
      return new Response(
        JSON.stringify({ error: "Skupina Objednávky pivovar nemá zaregistrované chat_id." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!bridgeUrl || !sendToken) {
      return new Response(
        JSON.stringify({ error: "Odesílání na WhatsApp zatím není nastavené (chybí WHATSAPP_BRIDGE_URL / WHATSAPP_SEND_TOKEN v app_secrets)." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const text = formatOrderMessage(body);

    const sendResp = await fetch(`${bridgeUrl.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-send-token": sendToken },
      body: JSON.stringify({ chatId, text }),
    });
    const sendResult = await sendResp.json().catch(() => ({}));
    if (!sendResp.ok || sendResult?.ok !== true) {
      return new Response(
        JSON.stringify({ error: sendResult?.error || `Bridge vrátil HTTP ${sendResp.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, text }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Neznámá chyba" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
