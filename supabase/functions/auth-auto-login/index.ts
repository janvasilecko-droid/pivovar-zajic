import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Doplňkový krok po neúspěšném přihlášení: pouze vysvětlí PROČ přihlášení
// selhalo (účet ještě neexistuje / čeká na schválení), NIKDY zde nevzniká
// nový účet. Účty se zakládají výhradně přes manage-users „approve“
// (autentizovaná admin akce), s náhodným dočasným heslem, které admin sdělí
// uživateli mimo aplikaci. Dřívější verze zde přijímala heslo od klienta a s
// pevnou konstantou "zajic" si kdokoli, kdo znal schválený e-mail, mohl účet
// rovnou založit a přihlásit se — bez důkazu, že mu ta e-mailová schránka
// skutečně patří. Endpoint je bez přihlášení veřejně volatelný, proto má i
// rate limiting (viz níže).
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Pouze POST." }, 405);

    const body = await req.json().catch(() => null);
    const email = (body?.email ?? "").toString().trim().toLowerCase();
    const password = (body?.password ?? "").toString();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Neplatný e-mail." }, 400);
    }
    if (!password) return json({ error: "Heslo je povinné." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Rate limit podle IP (endpoint nemá přihlášeného uživatele, takže per-user
    // limit z require-user.ts nejde použít). Klíč se mapuje na pseudo-UUID přes
    // SHA-256, aby šla znovupoužít existující tabulka edge_rate_limits.
    // Fail-open: pokud RPC chybí/selže (např. neaplikovaná migrace), tato
    // doplňková ochrana proti zneužití se jen přeskočí — nesmí zablokovat
    // běžné přihlašování (funkce už beztak nezakládá účty, takže výpadek
    // limitu neotevírá zpět původní zranitelnost).
    const clientIp =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    try {
      const rateKey = await keyToUuid(`auth-auto-login:${clientIp}`);
      const { data: allowed, error: rateError } = await admin.rpc("consume_edge_rate_limit", {
        p_user_id: rateKey,
        p_bucket: "auth_auto_login",
        p_limit: 20,
        p_window_seconds: 900,
      });
      if (!rateError && allowed === false) {
        return json({ error: "Příliš mnoho pokusů o přihlášení. Zkuste to za chvíli." }, 429);
      }
    } catch {
      // Rate limiting je best-effort — pokračujeme bez něj.
    }

    // Existuje účet pro tento e-mail? Pak se nic nezakládá — původní chyba
    // přihlášení (např. špatné heslo) zůstává v platnosti a klient ji zobrazí.
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = userList?.users?.find((u: any) => u.email?.toLowerCase() === email);
    if (existing) {
      return json({ ok: true, created: false });
    }

    // Účet neexistuje (ať už proto, že e-mail není schválený, nebo proto, že
    // ho admin ještě neschválil) — stejná zpráva pro oba případy, ať se
    // nedá zvenčí zjišťovat, které e-maily jsou na schváleném seznamu.
    return json({
      ok: true,
      created: false,
      error: `Účet s e-mailem ${email} zatím neexistuje. Požádejte administrátora o schválení přístupu — po schválení vám sdělí přihlašovací heslo.`,
    });
  } catch (err: any) {
    return json({ error: err?.message ?? "Server error" }, 500);
  }
});

async function keyToUuid(key: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
