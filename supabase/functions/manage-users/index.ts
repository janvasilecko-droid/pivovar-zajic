import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
    // Používá se ve výběru příjemců upozornění („poslat zprávu konkrétním lidem").
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

    if (req.method === "GET" && path === "") {
      const { data, error } = await adminClient.auth.admin.listUsers();
      if (error) return json({ error: error.message }, 500);
      const users = (data.users ?? []).map((u: any) => ({
        id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
      }));
      const { data: profiles } = await adminClient.from("profiles").select("id, display_name, role");
      const profMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return json({ users: users.map((u: any) => ({ ...u, ...profMap.get(u.id) })) });
    }

    if (req.method === "POST" && path === "") {
      const body = await req.json();
      const { email, display_name, is_admin } = body;
      const password = "zajic";
      if (!email) return json({ error: "Email je povinný." }, 400);
      
      // 1. Insert into allowed_emails first to satisfy the trigger BEFORE INSERT ON auth.users
      await adminClient.from("allowed_emails").upsert({
        email,
      }, { onConflict: "email" });

      const { data, error } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name: display_name ?? null },
      });
      if (error) return json({ error: error.message }, 400);

      if (data.user) {
        await adminClient.from("profiles").upsert({
          id: data.user.id,
          display_name: display_name ?? email.split("@")[0],
          role: is_admin ? "admin" : "user",
          password_set: true, // admin created user has a default password 'zajic'
        });
      }
      return json({ ok: true, id: data.user?.id });
    }

    if (req.method === "PUT" && path === "") {
      const body = await req.json();
      const { id, password, is_admin, display_name } = body;
      if (!id) return json({ error: "Chybí id." }, 400);
      if (password) {
        if (password.length < 6) return json({ error: "Heslo musí mít min. 6 znaků." }, 400);
        const { error } = await adminClient.auth.admin.updateUserById(id, { password });
        if (error) return json({ error: error.message }, 400);
      }
      if (typeof is_admin !== "undefined" || display_name) {
        const patch: any = {};
        if (typeof is_admin !== "undefined") patch.role = is_admin ? "admin" : "user";
        if (display_name) patch.display_name = display_name;
        await adminClient.from("profiles").update(patch).eq("id", id);
      }
      return json({ ok: true });
    }

    if (req.method === "DELETE" && path === "") {
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "Chybí id." }, 400);

      // Get email of the user first so we can remove it from allowed_emails allowlist
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
