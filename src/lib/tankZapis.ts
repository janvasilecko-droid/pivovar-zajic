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
import { zaradOdecet, novyKlic } from './tankFronta';

/**
 * Odečte objem z tanků. Relativní RPC (stejná jako v Kegging.tsx), ne
 * absolutní hodnota — jinak by se dva odečty ve stejnou chvíli přepsaly.
 * Vrací text chyby, když se některý tank nepovedlo upravit.
 *
 * Když odečet selže, zařadí se do fronty (lib/tankFronta.ts) a zkusí se
 * znovu při startu aplikace a po návratu sítě. Dřív z toho byla jen hláška
 * „oprav to ve Sklepě ručně" — a když na to člověk zapomněl, zůstal tank
 * nafouknutý o pivo, které dávno odteklo, a našlo se to až na inventuře.
 */
export async function odectiZTanku(
  tanky: TankProRozdeleni[],
  rozdeleni: RozdeleniSudu,
  beerId: string,
): Promise<string | null> {
  const nepovedlo: string[] = [];
  for (const d of rozdeleni.dily) {
    const { error } = await supabase.rpc('adjust_tank_volume', { p_tank_id: d.tankId, p_delta_l: -d.litry });
    if (error) {
      nepovedlo.push(`${d.label} (${error.message})`);
      // Do fronty jde VŽDY nový klíč: o původním pokusu nevíme, jestli
      // na serveru proběhl, nebo ne. Opakování běží přes
      // `adjust_tank_volume_once`, takže případný dvojí odečet zastaví
      // klíč idempotence, ne naše hádání (viz migrace 20261227020000).
      zaradOdecet({
        klic: novyKlic(),
        tankId: d.tankId,
        label: d.label,
        deltaL: -d.litry,
        zdroj: 'staceni',
        chyba: error.message,
      });
    }
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
    ? `Stáčení je zapsané, ale objem se teď nepodařilo odečíst z: ${nepovedlo.join(', ')}.`
      + ' Odečet čeká ve frontě a appka ho zkusí znovu sama (při dalším spuštění a po návratu signálu).'
      + ' Zkontroluj to potom ve Sklepě.'
    : null;
}

/** Objem zpátky do tanků při vzetí zpět. Kladné delta = opak odečtu. */
export async function vratDoTanku(rozdeleni: RozdeleniSudu | null): Promise<void> {
  for (const d of rozdeleni?.dily ?? []) {
    await supabase.rpc('adjust_tank_volume', { p_tank_id: d.tankId, p_delta_l: d.litry });
  }
}
