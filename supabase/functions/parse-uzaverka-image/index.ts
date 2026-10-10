// 🧾 Čtení uzávěrky z pokladny obchodu („Sumář prodeje") z fotky.
// ---------------------------------------------------------------------------
// Zadání 10. 10. 2026: dlaždice Obchod — uzávěrky z pokladny se čtou z fotky
// a odečítají z vlastního skladu obchodu (src/lib/obchodUzaverka.ts).
//
// Na rozdíl od parse-order-image se tu dá výsledek ZKONTROLOVAT: účtenka má
// u každé položky „množství x cena = částka" a dole Celkem. Funkce proto
// zkouší poskytovatele za sebou a bere první odpověď, jejíž čísla sedí
// sama se sebou (shared/uzaverka.ts zkontrolujUzaverku). Když nesedí žádná,
// vrátí tu s nejméně problémy a ty ohlásí — aplikace ji ukáže nad fotkou
// a obsluha ji opraví. Nic se nezapisuje tady, jen čte.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { readJsonWithLimit, requireApprovedUser } from "../_shared/require-user.ts";
import {
  PROMPT_UZAVERKA,
  uzaverkaZTextu,
  zkontrolujUzaverku,
  type PrectenaUzaverka,
} from "../_shared/uzaverka.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Stropy pro jednotlivé poskytovatele — součet musí zůstat bezpečně pod
// tvrdým limitem platformy (150 s), viz parse-order-image.
const AI_TIMEOUT_MS = { gemini: 40_000, anthropic: 40_000, openai: 40_000 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Poskytovatel = { nazev: string; cti: () => Promise<string> };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    const auth = await requireApprovedUser(req, supabase, corsHeaders, {
      bucket: "parse-uzaverka-image",
      limit: 10,
      windowSeconds: 60,
    });
    if (!auth.ok) return auth.response;

    const { data: secretRows, error: secretsErr } = await supabase
      .from("app_secrets")
      .select("key, value")
      .in("key", ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
    const secrets = new Map<string, string>(
      (secretRows ?? []).map((s: { key: string; value: string }) => [s.key, s.value] as [string, string]),
    );
    const geminiKey = secrets.get("GEMINI_API_KEY");
    const anthropicKey = secrets.get("ANTHROPIC_API_KEY");
    const openaiKey = secrets.get("OPENAI_API_KEY");
    if (secretsErr || (!geminiKey && !anthropicKey && !openaiKey)) {
      return json({ error: "Není nastavený žádný klíč GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY v app_secrets." }, 500);
    }

    const body = await readJsonWithLimit<Record<string, unknown>>(req, 15 * 1024 * 1024);
    const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
    const imageMimeType = typeof body.imageMimeType === "string" ? body.imageMimeType : "";
    if (!imageBase64 || !imageMimeType) return json({ error: "Chybí imageBase64 nebo imageMimeType." }, 400);

    const poskytovatele: Poskytovatel[] = [];

    if (geminiKey) {
      poskytovatele.push({
        nazev: "gemini",
        cti: async () => {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;
          const resp = await fetch(url, {
            signal: AbortSignal.timeout(AI_TIMEOUT_MS.gemini),
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [
                  { text: PROMPT_UZAVERKA },
                  { text: "Toto je fotka uzávěrky z pokladny. Přečti ji přesně podle instrukcí a vrať JSON." },
                  { inline_data: { mime_type: imageMimeType, data: imageBase64 } },
                ],
              }],
              generationConfig: { temperature: 0, responseMimeType: "application/json" },
            }),
          });
          if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
          const data = await resp.json();
          return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") ?? "";
        },
      });
    }

    if (anthropicKey) {
      poskytovatele.push({
        nazev: "anthropic",
        cti: async () => {
          const resp = await fetch("https://api.anthropic.com/v1/messages", {
            signal: AbortSignal.timeout(AI_TIMEOUT_MS.anthropic),
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
              model: "claude-sonnet-4-5-20250929",
              max_tokens: 8192,
              temperature: 0,
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: PROMPT_UZAVERKA },
                  { type: "image", source: { type: "base64", media_type: imageMimeType, data: imageBase64 } },
                ],
              }],
            }),
          });
          if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
          const data = await resp.json();
          return data?.content?.[0]?.text ?? "";
        },
      });
    }

    if (openaiKey) {
      poskytovatele.push({
        nazev: "openai",
        cti: async () => {
          const resp = await fetch("https://api.openai.com/v1/chat/completions", {
            signal: AbortSignal.timeout(AI_TIMEOUT_MS.openai),
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
            body: JSON.stringify({
              model: "gpt-4o",
              temperature: 0,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: PROMPT_UZAVERKA },
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Přečti tuhle uzávěrku podle instrukcí a vrať JSON." },
                    { type: "image_url", image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
                  ],
                },
              ],
            }),
          });
          if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
          const data = await resp.json();
          return data?.choices?.[0]?.message?.content ?? "";
        },
      });
    }

    // Poskytovatelé za sebou: první, jejíž čísla sedí, vyhrává. Jinak ta
    // s nejméně problémy.
    let nejlepsi: { uzaverka: PrectenaUzaverka; skore: number; poskytovatel: string } | null = null;
    const chyby: string[] = [];
    for (const p of poskytovatele) {
      try {
        const uzaverka = uzaverkaZTextu(await p.cti());
        if (uzaverka.radky.length === 0) { chyby.push(`${p.nazev}: nic nepřečetl`); continue; }
        const { skore } = zkontrolujUzaverku(uzaverka);
        if (!nejlepsi || skore < nejlepsi.skore) nejlepsi = { uzaverka, skore, poskytovatel: p.nazev };
        if (skore === 0) break;
      } catch (err) {
        chyby.push(`${p.nazev}: ${err instanceof Error ? err.message : String(err)}`);
        console.warn(`parse-uzaverka-image: ${chyby[chyby.length - 1]}`);
      }
    }

    if (!nejlepsi) {
      return json({ error: `Fotku se nepodařilo přečíst. ${chyby.join(" · ")}`.trim() }, 502);
    }
    return json({
      ...nejlepsi.uzaverka,
      problemy: zkontrolujUzaverku(nejlepsi.uzaverka).problemy,
      poskytovatel: nejlepsi.poskytovatel,
    });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
