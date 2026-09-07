import { createClient } from "npm:@supabase/supabase-js@2";
import { readJsonWithLimit, requireApprovedUser } from "../_shared/require-user.ts";

/**
 * 🗄️ Spuštění čekající databázové migrace z aplikace — tedy i z telefonu.
 *
 * Migrace se do teď pouštěly jen z počítače (`node scripts/apply-migration.mjs`).
 * Přehled v Nastavení uměl říct, že něco čeká, ale ne to spustit: 6. 9. 2026
 * takhle šest migrací čekalo tři dny a aplikace mezitím sahala na tabulky,
 * které na produkci nebyly.
 *
 * Odkud se bere SQL: ze SOUBORU NASAZENÉ APLIKACE (`/migrace-sql.json`, vzniká
 * při buildu z repozitáře). Klient posílá jen JMÉNO migrace. Kdyby posílal SQL,
 * byl by z téhle funkce vzdáleně ovládaný spouštěč libovolného příkazu nad
 * databází — a stačilo by k tomu jedno přihlášení do aplikace.
 *
 * Kdo to smí: přihlášený uživatel s rolí `admin` v `profiles`. Tady se
 * schválně NEDĚDÍ obvyklé „fail-open" chování `user_can_edit_module`
 * (chybí profil → smí): u schématu databáze je bezpečnější odmítnout.
 *
 * Vlastní běh dělá funkce `public.spust_migraci` (migrace 20261229000000),
 * kterou smí volat jedině service_role. Jedno volání = jedna transakce.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/** Odkud se stahuje SQL migrací. Přebitelné secretem, kdyby se měnila adresa. */
const VYCHOZI_APP_URL = "https://zajic-pivovar.pages.dev";

/** Název migrace: čas + popis + .sql. Nic jiného se nestahuje ani nepouští. */
const JMENO_MIGRACE = /^\d{14}_[A-Za-z0-9._-]+\.sql$/;

type Telo = { nazev?: string };

function odpoved(status: number, telo: Record<string, unknown>): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const auth = await requireApprovedUser(req, supabase, corsHeaders, {
      bucket: "pust-migraci",
      limit: 10,
      windowSeconds: 60,
    });
    if (!auth.ok) return auth.response;

    // Role admin, fail-closed. Cron ani systémové volání sem nepatří —
    // migraci pouští člověk, který ví, co pouští.
    const { data: profil } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    if ((profil as { role?: string } | null)?.role !== "admin") {
      return odpoved(403, { error: "Migrace smí spustit jen administrátor." });
    }

    const body = await readJsonWithLimit<Telo>(req, 2 * 1024);
    const nazev = (body.nazev ?? "").trim();
    if (!JMENO_MIGRACE.test(nazev)) {
      return odpoved(400, { error: `Neplatný název migrace: ${nazev || "(prázdný)"}` });
    }

    // Už jednou puštěná migrace se nepouští podruhé. Většina jich je psaná
    // idempotentně (IF NOT EXISTS), ale spoléhat se na to není potřeba.
    const { data: uz } = await supabase
      .from("migrace_aplikovane")
      .select("nazev, aplikovano_at")
      .eq("nazev", nazev)
      .maybeSingle();
    if (uz) {
      return odpoved(200, { ok: true, nazev, jizBylo: true, aplikovanoAt: (uz as { aplikovano_at?: string }).aplikovano_at ?? null });
    }

    const appUrl = (Deno.env.get("APP_URL") ?? VYCHOZI_APP_URL).replace(/\/+$/, "");
    const resp = await fetch(`${appUrl}/migrace-sql.json?t=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) {
      return odpoved(502, { error: `Seznam SQL migrací se nepodařilo stáhnout (${appUrl}, HTTP ${resp.status}).` });
    }
    const seznam = await resp.json() as { sql?: Record<string, string> };
    const sql = seznam.sql?.[nazev];
    if (!sql) {
      return odpoved(404, {
        error: `Migrace ${nazev} v nasazeném buildu není — nasaď nejdřív aplikaci, teprve pak ji pouštěj.`,
      });
    }

    const { data, error } = await supabase.rpc("spust_migraci", {
      p_nazev: nazev,
      p_sql: sql,
      p_zdroj: `appka: ${auth.user.email ?? auth.user.id}`,
    });
    if (error) {
      // Chybu z databáze říct doslova: „migrace spadla" bez důvodu nikoho
      // nikam neposune a v logu edge funkce ji nikdo hledat nebude.
      return odpoved(500, { error: `Migrace ${nazev} spadla: ${error.message}` });
    }

    return odpoved(200, { ok: true, nazev, vysledek: data });
  } catch (e) {
    return odpoved(500, { error: (e as Error).message });
  }
});
