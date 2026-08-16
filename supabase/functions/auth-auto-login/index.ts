import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Otevřené přihlášení: kdokoli se přihlásí svým e-mailem a výchozím heslem „zajic“.
// Pokud účet s daným e-mailem ještě neexistuje, automaticky se vytvoří
// (potvrzený e-mail, role "user", password_set=false → při prvním přihlášení
// si uživatel založí vlastní heslo). Heslo „zajic“ se používá pouze pro
// vytvoření účtu — existující uživatelé se hlásí svým vlastním heslem.
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

    // Už existuje účet pro tento e-mail? Pak se nic nevytváří ani nepřepisuje —
    // heslo ověří běžné přihlášení.
    const { data: userList } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = userList?.users?.find((u: any) => u.email?.toLowerCase() === email);
    if (existing) {
      return json({ ok: true, created: false });
    }

    // Účet smí vzniknout pouze pro e-mail, který předem schválil administrátor.
    const { data: allowed, error: allowedErr } = await admin
      .from("allowed_emails")
      .select("status")
      .ilike("email", email)
      .maybeSingle();
    if (allowedErr) return json({ error: "Schválení e-mailu se nepodařilo ověřit." }, 500);
    if (allowed?.status !== "approved") {
      return json({ error: "Tento e-mail zatím nebyl schválen administrátorem." }, 403);
    }

    // Účet neexistuje → vytvoří se pouze s výchozím heslem „zajic“.
    if (password !== "zajic") {
      return json({
        ok: true,
        created: false,
        error: `Účet s e-mailem ${email} zatím neexistuje. Nový účet se vytvoří automaticky po přihlášení výchozím heslem „zajic“.`,
      });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: "zajic",
      email_confirm: true,
      user_metadata: { display_name: email.split("@")[0] },
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const userId = created?.user?.id;
    if (userId) {
      await admin.from("profiles").upsert({
        id: userId,
        display_name: email.split("@")[0],
        role: "user",
        password_set: false,
      });
    }

    return json({ ok: true, created: true, id: userId });
  } catch (err: any) {
    return json({ error: err?.message ?? "Server error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
