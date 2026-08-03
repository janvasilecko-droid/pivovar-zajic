import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Jednorázová oprava: změní datum všech srpnových objednávek (2026-08) na
// červencové datum se zachováním dne (např. 3.8. → 3.7.).
// Spustí se POST na /functions/v1/fix-order-dates
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1) Najdi všechny srpnové objednávky
    const { data: orders, error: selErr } = await supabase
      .from("orders")
      .select("id, order_date")
      .gte("order_date", "2026-08-01")
      .lt("order_date", "2026-09-01");

    if (selErr) {
      return new Response(
        JSON.stringify({ error: selErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const list = orders ?? [];
    let updated = 0;
    const errors: string[] = [];

    // 2) Pro každou objednávku posuň datum o měsíc zpět (8. → 7.)
    for (const o of list) {
      const d = new Date(o.order_date + "T00:00:00Z");
      d.setUTCMonth(d.getUTCMonth() - 1);
      const newDate = d.toISOString().slice(0, 10);
      const { error: updErr } = await supabase
        .from("orders")
        .update({ order_date: newDate })
        .eq("id", o.id);
      if (updErr) {
        errors.push(`${o.id}: ${updErr.message}`);
      } else {
        updated++;
      }
    }

    return new Response(
      JSON.stringify({ found: list.length, updated, errors }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
