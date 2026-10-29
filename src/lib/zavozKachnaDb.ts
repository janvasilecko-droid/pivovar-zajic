// 🦆 Druhé auto (Kačena) — zápis do databáze (orders.second_car).
// Čisté pomocné funkce (kdo jede Kačenou, co se přenese z prohlížeče) jsou
// v zavozSecondCar.ts; tady je jen sahání na databázi.
import { supabase } from './supabase';
import {
  getPrenesenoKachny,
  getSecondCarOrderIds,
  kachnaVDatabazi,
  kachnyKPrenosu,
  pridejPrenesenoKachny,
  type ObjednavkaKachna,
} from './zavozSecondCar';

export type VysledekZapisuKachny = { ok: true } | { ok: false; chyba: string; zapsano: number };

/**
 * Označí (jede = true) nebo odznačí objednávky jako Kačenu.
 *
 * Počítá, kolik řádků se opravdu změnilo: objednávka v uzavřeném měsíci
 * (nebo bez oprávnění) se v databázi tiše přeskočí a bez téhle kontroly by
 * obrazovka ukazovala označení, které se neuložilo.
 */
export async function zapisKachnu(ids: string[], jede: boolean): Promise<VysledekZapisuKachny> {
  if (ids.length === 0) return { ok: true };
  const { data, error } = await supabase.from('orders').update({ second_car: jede }).in('id', ids).select('id');
  if (error) return { ok: false, chyba: error.message, zapsano: 0 };
  const zapsano = data?.length ?? 0;
  if (zapsano < ids.length) {
    return {
      ok: false,
      zapsano,
      chyba: `Označení se uložilo jen u ${zapsano} z ${ids.length} objednávek — ostatní jsou v uzavřeném měsíci nebo na ně nemáš oprávnění.`,
    };
  }
  return { ok: true };
}

/**
 * Jednorázově přenese označení Kačeny, která jsou jen v tomto prohlížeči, do
 * databáze (viz kachnyKPrenosu). Vrací id objednávek, které se označily;
 * volající si je promítne do načtených objednávek. Bez sloupce v databázi
 * (migrace ještě neběžela) nedělá nic. Chyba nic neblokuje — zkusí se příště.
 */
export async function preneseMistniKachnu(objednavky: ObjednavkaKachna[], dnes: string): Promise<string[]> {
  if (!kachnaVDatabazi(objednavky)) return [];
  const ids = kachnyKPrenosu(objednavky, getSecondCarOrderIds(), getPrenesenoKachny(), dnes);
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('orders').update({ second_car: true }).in('id', ids).select('id');
  if (error) return [];
  // Zapamatovat se všechna, která se zkusila — i ta, co databáze přeskočila
  // (uzavřený měsíc), jinak by se pokaždé zkoušela znovu.
  pridejPrenesenoKachny(ids);
  return (data ?? []).map((r: { id: string }) => r.id);
}
