// 📥 Načíst z Excelu → stáhne soubor přímo z Google Disku (servisní účet),
// appka ho pak zpracuje úplně stejně, jako by ho uživatel ručně nahrál
// (ImportStaceniLahviExcel.tsx volá tuhle funkci a výsledek pošle do
// stejného lib/importStaceniExcel.ts). Uživatel nic nestahuje ani netouchuje.
//
// Přístup: servisní účet appky (Google Cloud) má sdílenou složku „Evidence
// HP Kynšperk" jako čtenář. Přihlašovací JSON klíč je v `app_secrets` pod
// klíčem GOOGLE_SERVICE_ACCOUNT_KEY (návod: Nastavení → Načíst z Excelu).
import { createClient } from "npm:@supabase/supabase-js@2";
import { readJsonWithLimit, requireApprovedUser } from "../_shared/require-user.ts";
import { najdiSoubor, vytvorPodepsanyJwt, zakodujBase64, type ServiceAccountKey, type SouborNaDisku } from "../_shared/google-drive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ID složky „Evidence HP Kynšperk" na Google Disku. Není to tajemství samo
// o sobě — přístup hlídá sdílení servisnímu účtu, ne skrytí ID.
const FOLDER_ID = "16mQiE7q5Vh97nmyx7LQVP61G9G1rxD71";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const auth = await requireApprovedUser(req, supabase, corsHeaders, {
      bucket: "import-google-drive",
      limit: 20,
      windowSeconds: 60,
    });
    if (!auth.ok) return auth.response;

    const body = await readJsonWithLimit<{ soubor?: string }>(req, 1024);
    const souborId = body.soubor ?? "";

    const { data: secretRow, error: secretErr } = await supabase
      .from("app_secrets")
      .select("value")
      .eq("key", "GOOGLE_SERVICE_ACCOUNT_KEY")
      .maybeSingle();
    if (secretErr || !secretRow?.value) {
      return jsonResponse({
        error: "GOOGLE_SERVICE_ACCOUNT_KEY není nastavený v app_secrets — viz návod v appce (Nastavení → Načíst z Excelu).",
      }, 500);
    }

    let klic: ServiceAccountKey;
    try {
      klic = JSON.parse(secretRow.value);
    } catch {
      return jsonResponse({ error: "GOOGLE_SERVICE_ACCOUNT_KEY v app_secrets není platný JSON (zkontroluj, že je vložený celý stažený soubor)." }, 500);
    }
    if (!klic.client_email || !klic.private_key) {
      return jsonResponse({ error: "GOOGLE_SERVICE_ACCOUNT_KEY chybí client_email nebo private_key — je to opravdu servisní klíč z Google Cloud?" }, 500);
    }

    // 1) JWT-bearer výměna za access token (viz _shared/google-drive.ts).
    const jwt = await vytvorPodepsanyJwt(klic, Math.floor(Date.now() / 1000), "https://www.googleapis.com/auth/drive.readonly");
    const tokenRes = await fetch(klic.token_uri || "https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return jsonResponse({
        error: `Přihlášení ke Google Disku selhalo: ${tokenData.error_description ?? tokenData.error ?? tokenRes.status}. Zkontroluj, že je složka nasdílená e-mailu servisního účtu (${klic.client_email}).`,
      }, 502);
    }
    const accessToken: string = tokenData.access_token;

    // 2) Seznam souborů ve sdílené složce — hledá se podle jména, ne podle
    // pevného ID, protože kolega soubor občas nahradí novým (jiné ID).
    const seznamRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${FOLDER_ID}' in parents and trashed = false`)}&fields=${encodeURIComponent("files(id,name,modifiedTime)")}&pageSize=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const seznamData = await seznamRes.json();
    if (!seznamRes.ok) {
      return jsonResponse({
        error: `Google Disk odmítl seznam souborů: ${seznamData.error?.message ?? seznamRes.status}. Zkontroluj, že je složka nasdílená e-mailu servisního účtu (${klic.client_email}).`,
      }, 502);
    }

    const soubory = (seznamData.files ?? []) as SouborNaDisku[];
    const nalezeny = najdiSoubor(soubory, souborId);
    if (!nalezeny) {
      return jsonResponse({
        error: `Ve sdílené složce appka nenašla soubor pro „${souborId}". Zkontroluj název souboru na Disku a že je složka nasdílená servisnímu účtu appky.`,
      }, 404);
    }

    // 3) Stažení obsahu.
    const obsahRes = await fetch(`https://www.googleapis.com/drive/v3/files/${nalezeny.id}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!obsahRes.ok) {
      return jsonResponse({ error: `Stažení souboru z Disku selhalo (${obsahRes.status}).` }, 502);
    }
    const bytes = new Uint8Array(await obsahRes.arrayBuffer());

    return jsonResponse({ nazevSouboru: nalezeny.name, zmenenoKdy: nalezeny.modifiedTime, base64: zakodujBase64(bytes) });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Neznámá chyba při načítání z Disku." }, 500);
  }
});
