// 🧠 Naučené opravy čtení objednávek — zápis a správa z appky.
//
// Pravidla (co jde naučit, komu oprava patří, jak se použije) jsou ve sdíleném
// modulu supabase/functions/_shared/naucene-opravy.ts — čte je server i appka.
// Tady je jen to, co potřebuje obrazovka: uložit opravy zaškrtnuté v kontrole
// zprávy („Naučit"), vypsat je v Katalozích a smazat.
import { supabase } from './supabase';
import type { NaucenaOprava } from '../../supabase/functions/_shared/naucene-opravy';

/** Migrace s tabulkou — majitel ji pouští v Systém → Databázové migrace. */
export const MIGRACE_NAUCENYCH_OPRAV = '20261231490000_naucene_opravy_cteni.sql';
export const CHYBI_MIGRACE_OPRAV =
  'v databázi chybí tabulka pro naučené opravy — spusť migraci „naucene_opravy_cteni“ v Systém → Databázové migrace.';

/** Tabulka v databázi ještě není (migrace neběžela). */
function chybiTabulka(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST205' || error.code === '42P01' || /naucene_opravy.*(schema cache|does not exist)/i.test(error.message ?? '');
}

export type VysledekUceni = { ulozeno: number; chyba: string | null };

/**
 * Uloží opravy, u kterých uživatel zaškrtl „Naučit". Nové naučení téhož řádku
 * u téhož odběratele staré doplní: co se teď neopravovalo (pivo nebo obal),
 * zůstane z dřívějška. Nikdy nevyhazuje výjimku — objednávka už je schválená
 * a selhání zapamatování ji nesmí shodit; vrací, co se povedlo.
 */
export async function ulozNauceneOpravy(opravy: NaucenaOprava[]): Promise<VysledekUceni> {
  if (!opravy.length) return { ulozeno: 0, chyba: null };
  try {
    const { data: prihlaseni } = await supabase.auth.getUser();
    const kdo = prihlaseni?.user?.email ?? null;
    let ulozeno = 0;
    for (const o of opravy) {
      const { data: stara, error: chybaCteni } = await supabase
        .from('naucene_opravy')
        .select('id, beer_id, package_id')
        .eq('misto_klic', o.misto_klic)
        .eq('klic', o.klic)
        .maybeSingle();
      if (chybaCteni) return { ulozeno, chyba: chybiTabulka(chybaCteni) ? CHYBI_MIGRACE_OPRAV : chybaCteni.message };
      const radek = {
        misto_klic: o.misto_klic,
        place_id: o.place_id,
        place_name: o.place_name,
        radek: o.radek,
        klic: o.klic,
        beer_id: o.beer_id ?? (stara as { beer_id?: string | null } | null)?.beer_id ?? null,
        package_id: o.package_id ?? (stara as { package_id?: string | null } | null)?.package_id ?? null,
        created_by: o.created_by ?? kdo,
        created_at: new Date().toISOString(),
      };
      const { error } = stara
        ? await supabase.from('naucene_opravy').update(radek).eq('id', (stara as { id: string }).id)
        : await supabase.from('naucene_opravy').insert(radek);
      if (error) return { ulozeno, chyba: chybiTabulka(error) ? CHYBI_MIGRACE_OPRAV : error.message };
      ulozeno++;
    }
    return { ulozeno, chyba: null };
  } catch (e) {
    return { ulozeno: 0, chyba: e instanceof Error ? e.message : String(e) };
  }
}

/** Všechny naučené opravy pro přehled v Katalozích (nejnovější napřed). */
export async function nactiNauceneOpravyProSpravu(): Promise<{ opravy: NaucenaOprava[]; chybiMigrace: boolean }> {
  const { data, error } = await supabase
    .from('naucene_opravy')
    .select('id, misto_klic, place_id, place_name, radek, klic, beer_id, package_id, created_by, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    if (chybiTabulka(error)) return { opravy: [], chybiMigrace: true };
    throw new Error(error.message);
  }
  return { opravy: (data ?? []) as NaucenaOprava[], chybiMigrace: false };
}

export async function smazNaucenouOpravu(id: string): Promise<void> {
  const { error } = await supabase.from('naucene_opravy').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** „2 opravy" / „1 oprava" / „5 oprav" */
export function pocetOprav(n: number): string {
  return `${n} ${n === 1 ? 'oprava' : n >= 2 && n <= 4 ? 'opravy' : 'oprav'}`;
}
