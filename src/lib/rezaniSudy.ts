// 🛢️ Řezání: sudy ze skladu jako část podílu B (viz lib/rezani.ts).
// ---------------------------------------------------------------------------
// Sudy, které se do řezu přelily z hotových sudů na skladě, se ze skladu
// odečtou jako PŘEFUK „do řezu": jeden řádek `keg_prefuk` na velikost sudu,
// s `to_package_id` prázdným a `to_count` 0 (nic nepřibývá — pivo odešlo do
// řezu). Přefuk čtou všechny obrazovky skladu (skladová kniha, stockLedger),
// takže se sudy odečtou všude stejně a vlastní zdroj pravdy není potřeba.
//
// Řádek nese značku `[rez:<id prvního řádku stáčení>]` (lib/rezani.ts), podle
// které se při smazání řádku stáčení sudy vrátí na sklad.
import { supabase } from './supabase';
import { znackaRezu } from './rezani';

export type SudKRezu = { pkgId: string; label: string; pocet: number };

/** Řádek přefuku tak, jak se ukládá (a jak se po smazání vrací zpátky). */
export type PrefukDoRezu = Record<string, unknown> & { id?: string; note?: string | null };

export function radkyPrefukuDoRezu(p: {
  keggingId: string;
  beer: { id: string; name: string };
  sudy: SudKRezu[];
  datum: string;
  popis: string;
}): Record<string, unknown>[] {
  return p.sudy
    .filter((s) => s.pocet > 0)
    .map((s) => ({
      entry_date: p.datum,
      beer_id: p.beer.id,
      beer_name: p.beer.name,
      from_package_id: s.pkgId,
      from_package_label: s.label,
      from_count: s.pocet,
      to_package_id: null,
      to_package_label: null,
      to_count: 0,
      note: `Do řezu: ${p.popis} ${znackaRezu(p.keggingId)}`,
    }));
}

/** Odečte sudy ze skladu. Vrací chybu pro uživatele, nebo null. */
export async function odectiSudyDoRezu(p: Parameters<typeof radkyPrefukuDoRezu>[0]): Promise<string | null> {
  const radky = radkyPrefukuDoRezu(p);
  if (radky.length === 0) return null;
  const { error } = await supabase.from('keg_prefuk').insert(radky);
  return error ? `Řez: sudy ze skladu se nepodařilo odečíst (${error.message}) — zapiš je ručně v Přefuku` : null;
}

/** Sudy navázané na řádek stáčení. */
export async function sudyKRadku(keggingId: string): Promise<PrefukDoRezu[]> {
  // Jeden řez nese nejvýš pár řádků (jeden na velikost sudu) — .limit() je
  // výslovný strop, aby hlídač rostoucích tabulek (strankovaniDotazu.test.ts)
  // věděl, že se nečte celá historie přefuků.
  const { data } = await supabase.from('keg_prefuk').select('*').ilike('note', `%:${keggingId}]%`).limit(50);
  return ((data as PrefukDoRezu[]) ?? []).filter((r) => String(r.note ?? '').includes(znackaRezu(keggingId)));
}

/**
 * Vrátí sudy na sklad (smaže přefuk) — při smazání řádku stáčení.
 * Vrací smazané řádky pro „Zpět".
 */
export async function vratSudyRadku(keggingId: string): Promise<PrefukDoRezu[]> {
  const vracene: PrefukDoRezu[] = [];
  for (const r of await sudyKRadku(keggingId)) {
    const { error } = await supabase.from('keg_prefuk').delete().eq('id', r.id as string);
    if (!error) vracene.push(r);
  }
  return vracene;
}

/** „Zpět" po smazání řádku: sudy se ze skladu odečtou znovu, stejně jako byly. */
export async function obnovSudy(radky: PrefukDoRezu[]): Promise<void> {
  for (const r of radky) {
    await supabase.from('keg_prefuk').insert(r);
  }
}
