import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Converts a base64 string into a Blob without ever materialising the whole
// thing as one giant JS string operation (avoids call-stack / memory issues
// with longer voice recordings).
function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
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
      .eq("key", "OPENAI_API_KEY")
      .maybeSingle();

    const apiKey = secretRow?.value;
    if (secretErr || !apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured in app_secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const audioBase64: string | undefined = body.audioBase64;
    const audioMimeType: string | undefined = body.audioMimeType;
    const contextPrompt: string | undefined = body.contextPrompt;


    if (!audioBase64 || !audioMimeType) {
      return new Response(
        JSON.stringify({ error: "Missing audioBase64 or audioMimeType" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const blob = base64ToBlob(audioBase64, audioMimeType);
    const ext = audioMimeType.includes("webm") ? "webm" : audioMimeType.includes("mp4") ? "mp4" : audioMimeType.includes("ogg") ? "ogg" : "wav";

    const form = new FormData();
    form.append("file", blob, `recording.${ext}`);
    form.append("model", "gpt-4o-transcribe");
    form.append("language", "cs");
    // Pomáhá modelu s doménovým slovníkem (názvy piv, obalů, jednotky) —
    // gpt-4o-transcribe umí využít volitelný prompt pro zpřesnění přepisu.
    // Základní obecný prompt + dynamický kontext poslaný z frontendu
    // (aktuální seznam piv a odběratelů), aby model rozpoznal konkrétní
    // vlastní jména z katalogu/adresáře.
    const basePrompt =
      "Objednávka piva pro pivovar. Časté výrazy: keg, sud, KEG 30l, KEG 50l, KEG 20l, KEG 15l, KEG 10l, lahve 0.5l, lahve 0.33l, PET 1.5l, desítka, jedenáctka, dvanáctka, třináctka, 10°, 11°, 12°, 13°, světlé, tmavé, ks, kusů, bez etikety, podtacky, sklo.";
    // OpenAI ořezává prompt na cca 224 tokenů — necháváme si rezervu.
    const fullPrompt = (contextPrompt ? `${basePrompt} ${contextPrompt}` : basePrompt).slice(0, 900);
    form.append("prompt", fullPrompt);
    form.append("response_format", "json");


    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(
        JSON.stringify({ error: `OpenAI API error (${resp.status}): ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const text: string = data?.text ?? "";

    return new Response(
      JSON.stringify({ text }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
