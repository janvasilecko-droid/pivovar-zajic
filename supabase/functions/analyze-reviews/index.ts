import { createClient } from "npm:@supabase/supabase-js@2";
import { readJsonWithLimit, requireApprovedUser } from "../_shared/require-user.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ReviewAnalysisResult {
  overallRating: number;
  totalReviewsAnalyzed: number;
  sentimentScorePct: number;
  topFlavorNotes: { note: string; count: number; category: 'hop' | 'malt' | 'body' | 'aroma' }[];
  positiveHighlights: string[];
  constructiveFeedback: string[];
  sladekSummary: string;
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
      bucket: "analyze-reviews",
      limit: 20,
      windowSeconds: 60,
    });
    if (!auth.ok) return auth.response;

    const { data: secretRow, error: secretErr } = await supabase
      .from("app_secrets")
      .select("value")
      .eq("key", "ANTHROPIC_API_KEY")
      .maybeSingle();

    const apiKey = secretRow?.value;
    if (secretErr || !apiKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured in app_secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await readJsonWithLimit<{ rawText?: string }>(req, 256 * 1024);
    const rawText: string | undefined = body.rawText;
    if (!rawText || !rawText.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing rawText" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const prompt = `Jsi AI sommeliér piva pro minipivovar. Uživatel vloží textové recenze/zpětnou vazbu od zákazníků (např. z Untappd, Google Reviews apod.). Ze vložených recenzí extrahuj a shrň:

1) overallRating — průměrné hodnocení v rozsahu 0–5 (pokud recenze obsahují hodnocení jako "4.5/5", "4.25", "*", "★"); balanc na dvě desetinná místa; pokud žádná čísla nejsou, odhadni z tónu recenzí.
2) totalReviewsAnalyzed — počet rozpoznaných samostatných recenzí (řádků/příspěvků).
3) sentimentScorePct — procento pozitivních zmínek (0–100), celé číslo.
4) topFlavorNotes — pole nejčastějších chuťových/sladových/chmelových/aroma tónů. každý objekt: { "note": "název tónu v češtině (např. Žatecký červeňák)", "count": číslo (kolikrát se objevil), "category": "hop" | "malt" | "body" | "aroma" }. Max 8, seřazené sestupně dle count.
5) positiveHighlights — pole (max 5) nejvýraznějších pochval/plusů piva, v češtině, konkrétních (bez frází typu "dobré pivo").
6) constructiveFeedback — pole (max 4) konstruktivních výtek/nápadů na zlepšení, v češtině, konkrétních; pokud žádné nejsou, prázdné pole [].
7) sladekSummary — 1–3 věty doporučení pro sládka: co zachovat, co případně vylepšit, sladový/chmelový závěr. V češtině, fakticky, jen na základě vložených recenzí.

Buď konkrétní a opírej se POUZE o vložené recenze. Nevymýšlej si fakta, která tam nejsou.

Vrať ČISTĚ JSON (bez markdown, bez \\`\\`\\`), přesně v tomto formátu, a nic jiného:
{"overallRating":4.38,"totalReviewsAnalyzed":4,"sentimentScorePct":94,"topFlavorNotes":[{"note":"Žatecký červeňák","count":3,"category":"hop"}],"positiveHighlights":["..."],"constructiveFeedback":["..."],"sladekSummary":"..."}`;

    const anthropicBody = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4000,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "text", text: `\n\nTEXT RECENZÍ:\n"""\n${rawText}\n"""` },
          ],
        },
      ],
    };

    const anthropicUrl = "https://api.anthropic.com/v1/messages";

    const anthropicResp = await fetch(anthropicUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      return new Response(
        JSON.stringify({ error: `Anthropic API error (${anthropicResp.status}): ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anthropicData = await anthropicResp.json();
    const text: string | undefined = anthropicData?.content?.[0]?.text;

    if (!text) {
      return new Response(
        JSON.stringify({ error: "Anthropic returned no text", raw: anthropicData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let cleaned = text.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    }
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart > 0 && jsonEnd > jsonStart) {
      cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
    }

    let parsed: ReviewAnalysisResult;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Nepodařilo se rozparsovat odpověď AI", raw: text.slice(0, 500) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(parsed),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
