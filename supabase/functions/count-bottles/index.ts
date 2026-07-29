import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CountItem {
  package_label: string | null;
  quantity: number | null;
  note: string | null;
}

interface CountResponse {
  items?: CountItem[];
  raw_text?: string;
  error?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

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

    const body = await req.json();
    const imageBase64: string | undefined = body.imageBase64;
    const imageMimeType: string | undefined = body.imageMimeType;
    const packages: { id: string; label: string; kind: string }[] = body.packages ?? [];

    if (!imageBase64 || !imageMimeType) {
      return new Response(
        JSON.stringify({ error: "Missing imageBase64 or imageMimeType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pkgList = packages.map((p) => `${p.label} (${p.kind})`).join(", ");

    const prompt = `Jsi asistent pro pivovar. Na obrázku je bedna nebo regál s lahvemi nebo kegy piva (inventura skladu).
Spočítej, kolik kusů každého typu obalu je na obrázku vidět.

DOSTUPNÉ OBALY V KATALOGU: ${pkgList}

PRAVIDLA:
- Počítej skutečně viditelné lahve/kegy, ne štítky nebo stíny.
- Pokud rozeznáš typ obalu (např. 0.5l lahve vs 0.33l lahve, KEG 30l vs KEG 50l), přiřaď package_label odpovídající katalogové zkratce.
- Pokud typ obazu nelze bezpečně určit, vrať package_label null a do note napiš co vidíš (např. "lahve 0.5l?", "kegy").
- Pokud je na obrázku více typů obalů, vrať pro každý typ jednu položku.
- quantity je počet kusů (celé číslo).
- Pokud obrázek není jasný nebo není inventura, vrať prázdné items a do raw_text napiš co vidíš.

Vrať ČISTĚ JSON (bez markdown, bez \`\`\`), přesně v tomto formátu, a nic jiného:
{"items":[{"package_label":"Lahve 0.5l","quantity":24,"note":null}],"raw_text":"krátký popis co vidíš na obrázku"}`;

    const anthropicBody = {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imageMimeType,
                data: imageBase64,
              },
            },
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

    let parsed: CountResponse;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { items: [], raw_text: text };
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
