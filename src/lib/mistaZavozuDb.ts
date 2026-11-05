// 📍 Uložení zvoleného místa závozu u objednávky (lib/mistaZavozu.ts).
// Změna místa nespouští odpočty skladu — triggery objednávek hlídají jen
// datum, den, datum objednávky a stav.
import { supabase } from './supabase';
import { chybiSloupecMist, HLASKA_MIGRACE_MIST } from './mistaZavozu';

/** Uloží místo závozu objednávky (null = hlavní adresa). Vrátí hlášku chyby, nebo null. */
export async function ulozMistoObjednavky(orderId: string, mistoId: string | null): Promise<string | null> {
  const { error } = await supabase.from('orders').update({ misto_zavozu: mistoId }).eq('id', orderId);
  if (!error) return null;
  return chybiSloupecMist(error) ? HLASKA_MIGRACE_MIST : `Místo závozu se neuložilo: ${error.message}`;
}
