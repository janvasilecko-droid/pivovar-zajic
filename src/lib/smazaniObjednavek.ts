// 🗑️ Smazání objednávek i s proběhlým odpočtem závozu.
// ---------------------------------------------------------------------------
// Z provozu 29. 9. 2026: „potřebuju smazat objednávky z minulého týdne
// Maneo a Mutějovice, ale píše mi to, že nelze smazat."
//
// Objednávka z minulého týdne už má odpočet závozu (zavoz_deductions) a ten
// drží cizí klíč na položky i na objednávku (ON DELETE RESTRICT). Appka ho
// dřív mazala přímým DELETE — jenže tabulka má jen politiku SELECT, takže se
// tiše smazalo NULA řádků a smazání objednávky pak spadlo na cizím klíči.
//
// Odpočty jedné položky smí smazat úzká funkce smaz_odpocty_polozky
// (migrace 20261229030000, SECURITY DEFINER) — tou se projde každá položka.
// Smazáním odpočtu se sudy vrátí do stavu skladu: objednávka, která se
// maže, se nikdy nezavezla.
import { supabase, fetchAllRows } from './supabase';

export async function smazObjednavky(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const { data: polozky, error: chybaPolozek } = await fetchAllRows<{ id: string }>('order_items', 'id')
    .in('order_id', ids);
  if (chybaPolozek) return chybaPolozek.message;

  for (const p of (polozky ?? []) as { id: string }[]) {
    const { error } = await supabase.rpc('smaz_odpocty_polozky', { p_order_item_id: p.id });
    if (error) return `Odpočet ze skladu se nepodařilo zrušit: ${error.message}`;
  }

  const { error: chybaMazaniPolozek } = await supabase.from('order_items').delete().in('order_id', ids);
  if (chybaMazaniPolozek) return chybaMazaniPolozek.message;
  const { error } = await supabase.from('orders').delete().in('id', ids);
  if (error) {
    // Starý odpočet bez vazby na položku (z doby před 16. 8. 2026) drží jen
    // objednávku — to už jde jen přes správce databáze.
    if (/foreign key|violates/i.test(error.message)) {
      return 'Objednávku drží starý záznam odpočtu ze skladu. Napiš správci, ať ho smaže v databázi.';
    }
    return error.message;
  }
  return null;
}
