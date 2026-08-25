import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Náhodné dočasné heslo pro nově založený účet (nahrazuje dřívější sdílenou
// konstantu "zajic", kterou mohl uhodnout kdokoli, kdo znal schválený e-mail).
// Vyloučené jsou vizuálně zaměnitelné znaky (0/O, 1/l/I).
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/manage-users\/?/, "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Nejste přihlášen." }, 401);

    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Adresář uživatelů (jen čtení) — dostupný VŠEM přihlášeným uživatelům.
    // Používá se ve výběru příjemců upozornění („poslat zprávu konkrétním lidem“).
    if (req.method === "GET" && path === "directory") {
      const { data, error } = await adminClient.auth.admin.listUsers();
      if (error) return json({ error: error.message }, 500);
      const { data: profiles } = await adminClient.from("profiles").select("id, display_name, role");
      const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const users = (data?.users ?? []).map((u: any) => {
        const prof = profMap.get(u.id) || {};
        return {
          id: u.id,
          email: u.email,
          display_name: prof.display_name ?? null,
          role: prof.role ?? "user",
        };
      });
      return json({ users });
    }

    const { data: profile } = await userClient.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (profile?.role !== "admin") return json({ error: "Pouze admin může spravovat uživatele." }, 403);

    // Seznam uživatelů + stavů e-mailů (jen pro admina)
    if (req.method === "GET" && path === "") {
      const { data, error } = await adminClient.auth.admin.listUsers();
      if (error) return json({ error: error.message }, 500);
      const users = (data.users ?? []).map((u: any) => ({
        id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
      }));
      const { data: profiles } = await adminClient.from("profiles").select("id, display_name, role");
      const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const { data: emails } = await adminClient.from("allowed_emails").select("email, status, created_at").order("email");
      return json({ users: users.map((u: any) => ({ ...u, ...profMap.get(u.id) })), emails: emails ?? [] });
    }

    // PŘIDÁNÍ e-mailu KE SCHVÁLENÍ (dvoukrok: admin přidá e-mail, pak ho schválí).
    // Účet uživatele se ještě NEvytváří — vytvoří se až po schválení e-mailu.
    if (req.method === "POST" && path === "") {
      const body = await req.json();
      const email = (body?.email ?? "").toString().trim().toLowerCase();
      if (!email) return json({ error: "Email je povinný." }, 400);

      // E-mail, který už má účet, se spravuje v záložce Uživatelé.
      const { data: userList } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (userList?.users?.some((u: any) => u.email?.toLowerCase() === email)) {
        return json({ error: `E-mail ${email} už má vytvořený účet — spravuje se v záložce Uživatelé.` }, 400);
      }

      const { data: existing } = await adminClient.from("allowed_emails").select("status").eq("email", email).maybeSingle();
      if (existing?.status === "approved") return json({ error: `E-mail ${email} je už schválený.` }, 400);
      if (existing?.status === "pending") return json({ error: `E-mail ${email} už čeká na schválení.` }, 400);

      const { error: insErr } = await adminClient.from("allowed_emails").insert({ email, status: "pending" });
      if (insErr) return json({ error: insErr.message }, 400);

      return json({ ok: true, pending: true, email });
    }

    // SCHVÁLENÍ e-mailu — teprve nyní se vytvoří účet s náhodným dočasným heslem;
    // to admin ihned uvidí v odpovědi a sdělí ho uživateli mimo aplikaci (osobně/
    // přes WhatsApp). Uživatel si při prvním přihlášení založí vlastní heslo.
    if (req.method === "POST" && path === "approve") {
      const body = await req.json();
      const email = (body?.email ?? "").toString().trim().toLowerCase();
      if (!email) return json({ error: "Email je povinný." }, 400);

      const { data: allowRow } = await adminClient.from("allowed_emails").select("status").eq("email", email).maybeSingle();
      if (!allowRow) return json({ error: `E-mail ${email} není v seznamu e-mailů.` }, 400);

      // 1) Nejprve schválit v allowlistu (kvůli triggeru BEFORE INSERT ON auth.users)
      const { error: updErr } = await adminClient.from("allowed_emails").update({ status: "approved" }).eq("email", email);
      if (updErr) return json({ error: updErr.message }, 400);

      // 2) Vytvořit účet, pokud ještě neexistuje (s náhodným dočasným heslem, e-mail potvrzený)
      const { data: userList } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = userList?.users?.find((u: any) => u.email?.toLowerCase() === email);
      let userId = found?.id ?? null;
      let tempPassword: string | null = null;

      if (!found) {
        tempPassword = generateTempPassword();
        const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { display_name: email.split("@")[0] },
        });
        if (createErr) return json({ error: createErr.message }, 400);
        userId = created?.user?.id ?? null;
      }

      // 3) Profil s právy — uživatel má dočasné heslo, ale při prvním přihlášení si založí vlastní
      if (userId) {
        await adminClient.from("profiles").upsert({
          id: userId,
          display_name: email.split("@")[0],
          role: "user",
          password_set: false,
        });
      }

      return json({ ok: true, approved: true, email, id: userId, tempPassword });
    }

    // Úprava uživatele (heslo, role, jméno)
    if (req.method === "PUT" && path === "") {
      const body = await req.json();
      const { id, password, is_admin, display_name, permissions } = body;
      if (!id) return json({ error: "Chybí id." }, 400);
      if (password) {
        if (password.length < 6) return json({ error: "Heslo musí mít min. 6 znaků." }, 400);
        const { error } = await adminClient.auth.admin.updateUserById(id, { password });
        if (error) return json({ error: error.message }, 400);
      }
      if (typeof is_admin !== "undefined" || display_name || typeof permissions !== "undefined") {
        const patch: any = {};
        if (typeof is_admin !== "undefined") patch.role = is_admin ? "admin" : "user";
        if (display_name) patch.display_name = display_name;
        // Zápis modulových práv MUSÍ jít přes service-role klienta (tady) —
        // běžný klient je zablokovaný RLS (update_own_profile povoluje jen
        // vlastní řádek), a je to jediné místo, kde je před zápisem znovu
        // ověřeno auth.role() === "admin" volajícího (viz kontrola výš).
        if (typeof permissions !== "undefined") patch.permissions = permissions;
        const { error } = await adminClient.from("profiles").update(patch).eq("id", id);
        if (error) return json({ error: error.message }, 400);
      }
      return json({ ok: true });
    }

    // Smazání uživatele (i z allowlistu)
    if (req.method === "DELETE" && path === "") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "Chybí id." }, 400);

      // Zjistíme e-mail uživatele, abychom ho odstranili i z allowed_emails
      const { data: userToDel } = await adminClient.auth.admin.getUserById(id);
      const email = userToDel?.user?.email;

      const { error } = await adminClient.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      await adminClient.from("profiles").delete().eq("id", id);

      if (email) {
        await adminClient.from("allowed_emails").delete().eq("email", email);
      }
      return json({ ok: true });
    }

    return json({ error: "Neznámý endpoint." }, 404);
  } catch (err: any) {
    return json({ error: err?.message ?? "Server error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

