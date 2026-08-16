import { createClient } from "npm:@supabase/supabase-js@2";
import { readJsonWithLimit, requireApprovedUser } from "../_shared/require-user.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CountItem {
  package_label: string | null;
  beer_name?: string | null;
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

    const auth = await requireApprovedUser(req, supabase, corsHeaders, {
      bucket: "count-bottles",
      limit: 10,
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

    const body = await readJsonWithLimit<Record<string, any>>(req, 15 * 1024 * 1024);
    const imageBase64: string | undefined = body.imageBase64;
    const imageMimeType: string | undefined = body.imageMimeType;
    const packages: { id: string; label: string; kind: string }[] = body.packages ?? [];
    const mode: string | undefined = body.mode; // 'inventory' (lahve) | 'kegging' (sudy)
    const promptHint: string | undefined = body.promptHint;

    if (!imageBase64 || !imageMimeType) {
      return new Response(
        JSON.stringify({ error: "Missing imageBase64 or imageMimeType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isKegMode = mode === 'kegging';

    // Omezte katalog obalů na relevantní typ dle módu (lahve vs sudy).
    // V KEG módu posíláme jen sudy, v lahvích jen lahve — AI se tak nedá splést.
    const relevantKind = isKegMode ? 'keg' : 'bottle';
    const filteredPackages = packages.filter((p) => {
      const k = (p.kind ?? '').toLowerCase();
      if (isKegMode) return k === 'keg' || p.label.toLowerCase().includes('keg') || p.label.toLowerCase().includes('sud');
      return k === 'bottle' || p.label.toLowerCase().includes('lahv') || p.label.toLowerCase().includes('0.5') || p.label.toLowerCase().includes('0.33') || p.label.toLowerCase().includes('sklo');
    });
    const pkgList = (filteredPackages.length ? filteredPackages : packages).map((p) => `${p.label} (${p.kind})`).join(", ");

    let basePrompt: string;
    if (isKegMode) {
      basePrompt = `Jsi asistent pro pivovar. Na obrázku jsou pivo sud - KEG sudy (případně na paletě či na vozíku).
Spočítej, kolik kusů každého typu sudu je na obrázku vidět.

DOSTUPNÉ OBALY (SUDY) V KATALOGU: ${pkgList}

PRAVIDLA:
- Počítej skutečně viditelné sudy, ne štítky nebo stínice.
- Terazuj typ sudu podle velikosti (KEG 10l, 15l, 20l, 30l, najkasteji 50l) a podle obsahu piva (štítek na sudu, barva víčka/koruny).
- U každého rozeznatého sudu urči i pivo, pokud to jde do note (např. "Světlý ležák 11°").
- Pokud typ sudu nelze bezpečně určit, dej package_label null a do note napiš rozpoznanou velikost a pivo ("kegy, asi 30l").
- Pokud je na obrázku více typů sudů, vrať pro každý typ jednu položku.
- quantity = počet sudů (celé číslo).
`;
    } else {
      basePrompt = `Jsi asistent pro pivovar. Na obrázku je bedna, regál nebo stůl s pivními lahvemi (inventura skladu).
Spočítej, kolik kusů každého typu obalu je na obrázku vidět.

DOSTUPNÉ OBALY (LAHVE) V KATALOGU: ${pkgList}

PRAVIDLA:
- Počítej skutečně viditelné lahve, ne štítky nebo stíny.
- Česká přepravka má typicky 20 lahví (4x5). Počítej plné i částečně vyprázdněné bedny.
- Pokud rozeznáš typ obalu (např. 0.5l lahve vs 0.33l lahve), přiřaď package_label odpovídající katalogové zkratce.
- Pokud typ obalu nelze bezpečně určit, vrať package_label null a do note napiš co vidíš (např. "lahve 0.5l?").
- Pokud je na obrázku více typů obalů, vrať pro každý typ jednu položku.
- quantity je počet kusů (celé číslo).
`;
    }

    const customHint = promptHint?.trim();
    if (customHint) {
      basePrompt += `\nDOPLŇUJÍCÍ POKYN OD UŽIVATELE: ${customHint}\n`;
    }

    basePrompt += `\nVrať ČISTĚ JSON (bez markdown, bez \`\`\`), přesně v tomto formátu, a nic jiného:
{"items":[{"package_label":"Lahve 0.5l","beer_name":"Světlý ležák 11°","quantity":24,"note":null}],"raw_text":"krátký popis co vidíš na obrázku"}

beer_name je volitelné a slouží jako pomůcka — pokud z fotky (štítek, etiketa) rozpoznáš konkrétní pivo, vypiš jeho název. Pokud ne, nech beer_name: null (resp. ho vynech).`;

    const prompt = basePrompt;

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
