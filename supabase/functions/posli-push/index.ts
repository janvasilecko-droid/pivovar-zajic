import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { readJsonWithLimit, requireApprovedUser } from "../_shared/require-user.ts";

/**
 * 🔔 Odeslání push upozornění na uložená zařízení.
 *
 * Klient se přihlašuje v src/lib/pushOdber.ts, obsluhuje public/sw.js.
 * Tahle funkce jen podepíše zprávu VAPID klíčem a rozešle ji.
 *
 * Potřebuje dva projektové secrets (návod: docs/push-upozorneni-navod.md):
 *   VAPID_PUBLIC_KEY   — stejný, jaký má appka ve VITE_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY  — jen tady, nikdy v aplikaci
 *
 * Odběr, který push služba odmítne jako neplatný (410/404 = odinstalovaná
 * appka, smazaná data prohlížeče), se rovnou maže. Bez toho by seznam
 * zařízení jen rostl a každé odeslání by čekalo na mrtvé adresy.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Telo = {
  titulek: string;
  telo?: string;
  /** Na kterou obrazovku má klepnutí otevřít appku. */
  stranka?: string;
  /** Stejný tag = nová zpráva přepíše starou místo laviny oznámení. */
  tag?: string;
};

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
      bucket: "posli-push",
      limit: 30,
      windowSeconds: 60,
    });
    if (!auth.ok) return auth.response;

    const verejny = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const soukromy = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    if (!verejny || !soukromy) {
      // Mlčet by znamenalo, že se upozornění tváří jako odeslaná.
      return new Response(
        JSON.stringify({ error: "Push není nastavený: chybí VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY v projektových secrets." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    webpush.setVapidDetails("mailto:pivovar@zajic.cz", verejny, soukromy);

    const body = await readJsonWithLimit<Telo>(req, 8 * 1024);
    if (!body.titulek || !body.titulek.trim()) {
      return new Response(
        JSON.stringify({ error: "Chybí titulek upozornění." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: odbery, error } = await supabase
      .from("push_odbery")
      .select("endpoint, p256dh, auth");
    if (error) {
      return new Response(
        JSON.stringify({ error: `Odběry se nepodařilo načíst: ${error.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const zprava = JSON.stringify({
      titulek: body.titulek.trim(),
      telo: (body.telo ?? "").trim(),
      stranka: body.stranka ?? "",
      tag: body.tag ?? "pivovar",
    });

    let odeslano = 0;
    const smazane: string[] = [];
    const chyby: { endpoint: string; duvod: string }[] = [];

    for (const o of (odbery ?? []) as { endpoint: string; p256dh: string; auth: string }[]) {
      try {
        await webpush.sendNotification(
          { endpoint: o.endpoint, keys: { p256dh: o.p256dh, auth: o.auth } },
          zprava,
        );
        odeslano += 1;
      } catch (e) {
        const stav = (e as { statusCode?: number }).statusCode ?? 0;
        const duvod = (e as Error).message ?? String(e);
        if (stav === 404 || stav === 410) {
          smazane.push(o.endpoint);
        } else {
          chyby.push({ endpoint: o.endpoint, duvod });
          await supabase.from("push_odbery").update({ posledni_chyba: duvod }).eq("endpoint", o.endpoint);
        }
      }
    }

    if (smazane.length > 0) {
      await supabase.from("push_odbery").delete().in("endpoint", smazane);
    }

    return new Response(
      JSON.stringify({ odeslano, smazano: smazane.length, chyby }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
