// 🛢️ Odečet objemu z tanků po doplněném stáčení — jedno místo pro obě inventury.
// ---------------------------------------------------------------------------
// Zápis sudů doplněný z inventury musí ubrat pivo i ve sklepě, jinak zůstane
// tank nafouklý o pivo, které dávno odteklo — z toho jsou ty velké schodky
// (Spilka 1 −2 000 l, Tank 6 −5 400 l). Postup je netriviální: relativní RPC,
// zavření dojetých tanků, otevření dalšího. Měsíční inventura si ho psala
// u sebe; jakmile totéž potřebovala i týdenní, byla druhá kopie horší než
// přesun sem — dvě kopie se rozejdou a jedna z nich pak sklep rozhodí.
import { supabase } from './supabase';
import { zmenaOtevreni, type RozdeleniSudu, type TankProRozdeleni } from './tankRozdeleni';

/**
 * Odečte objem z tanků. Relativní RPC (stejná jako v Kegging.tsx), ne
 * absolutní hodnota — jinak by se dva odečty ve stejnou chvíli přepsaly.
 * Vrací text chyby, když se některý tank nepovedlo upravit.
 */
export async function odectiZTanku(
  tanky: TankProRozdeleni[],
  rozdeleni: RozdeleniSudu,
  beerId: string,
): Promise<string | null> {
  const nepovedlo: string[] = [];
  for (const d of rozdeleni.dily) {
    const { error } = await supabase.rpc('adjust_tank_volume', { p_tank_id: d.tankId, p_delta_l: -d.litry });
    if (error) nepovedlo.push(`${d.label} (${error.message})`);
  }

  // 🛢️ Když tank odečtem došel, ukonči na něm stáčení a otevři další se
  // stejným pivem — jinak by zůstal otevřený prázdný tank a stáčeč by musel
  // ručně hledat, ze kterého pokračovat.
  const zmena = zmenaOtevreni(tanky, beerId, rozdeleni);
  const ted = new Date().toISOString();
  if (zmena.dojely.length > 0) {
    await supabase.from('cellar_tanks')
      .update({ kegging_active: false, kegging_ended_at: ted, updated_at: ted })
      .in('id', zmena.dojely.map((d) => d.tankId));
  }
  if (zmena.otevrit) {
    // Stáčecí zdroj smí být na jedno pivo jen jeden (viz startKegging v
    // Cellar.tsx), takže ostatní se stejným pivem se nejdřív zavřou.
    const ostatni = tanky
      .filter((t) => t.current_beer_id === beerId && t.id !== zmena.otevrit!.tankId)
      .map((t) => t.id);
    if (ostatni.length > 0) {
      await supabase.from('cellar_tanks')
        .update({ kegging_active: false, kegging_ended_at: ted, updated_at: ted })
        .in('id', ostatni);
    }
    await supabase.from('cellar_tanks')
      .update({ kegging_active: true, kegging_started_at: ted, kegging_ended_at: null, updated_at: ted })
      .eq('id', zmena.otevrit.tankId);
  }

  return nepovedlo.length > 0
    ? `Stáčení je zapsané, ale objem se nepodařilo odečíst z: ${nepovedlo.join(', ')}. Oprav objem ve Sklepě ručně.`
    : null;
}

/** Objem zpátky do tanků při vzetí zpět. Kladné delta = opak odečtu. */
export async function vratDoTanku(rozdeleni: RozdeleniSudu | null): Promise<void> {
  for (const d of rozdeleni?.dily ?? []) {
    await supabase.rpc('adjust_tank_volume', { p_tank_id: d.tankId, p_delta_l: d.litry });
  }
}
