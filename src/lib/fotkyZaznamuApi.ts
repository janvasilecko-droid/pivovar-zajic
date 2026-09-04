/**
 * 📷 Fotky k zápisu — čtení, nahrání, smazání.
 *
 * Odděleno od `fotkyZaznamu.ts` schválně: tam je jen počítání (cesta,
 * kontroly), co jde otestovat bez prohlížeče; tady je práce se Storage a
 * s databází.
 *
 * Bucket je neveřejný, takže se obrázek nečte přes trvalou adresu, ale
 * přes podepsané URL platné hodinu. Veřejný bucket už jednou znamenal, že
 * si kdokoli mohl vylistovat všechny fotky objednávek (viz migrace
 * 20261205000000).
 */
import { supabase } from './supabase';
import {
  BUCKET_FOTEK, cestaFotky, chybaFotky, type TypZaznamu,
} from './fotkyZaznamu';

export type FotkaZaznamu = {
  id: string;
  cesta: string;
  popis: string | null;
  created_at: string;
  /** Podepsané URL — platí hodinu, po znovunačtení se vyrobí nové. */
  url: string | null;
};

/** Jak dlouho platí podepsané URL (s). */
const PLATNOST_URL = 3600;

/**
 * Fotky jednoho zápisu. `chybiTabulka` znamená nepuštěnou migraci —
 * obrazovka pak nemá dělat, že fotky prostě nejsou.
 */
export async function nactiFotky(
  typ: TypZaznamu,
  zaznamId: string,
): Promise<{ fotky: FotkaZaznamu[]; chybiTabulka: boolean }> {
  const { data, error } = await supabase
    .from('zaznam_fotky')
    .select('id, cesta, popis, created_at')
    .eq('typ', typ)
    .eq('zaznam_id', zaznamId)
    .order('created_at', { ascending: false });

  if (error) return { fotky: [], chybiTabulka: error.code === '42P01' };

  const radky = (data as { id: string; cesta: string; popis: string | null; created_at: string }[]) ?? [];
  if (radky.length === 0) return { fotky: [], chybiTabulka: false };

  const { data: podpisy } = await supabase.storage
    .from(BUCKET_FOTEK)
    .createSignedUrls(radky.map((r) => r.cesta), PLATNOST_URL);

  const podleCesty = new Map((podpisy ?? []).map((p) => [p.path ?? '', p.signedUrl ?? null]));
  return {
    fotky: radky.map((r) => ({ ...r, url: podleCesty.get(r.cesta) ?? null })),
    chybiTabulka: false,
  };
}

/**
 * Nahraje fotku. Vrací text chyby pro člověka, nebo null při úspěchu —
 * „nepodařilo se" bez důvodu vede k tomu, že to zkusí pětkrát znovu se
 * stejnou fotkou.
 *
 * Když se nahraje soubor, ale zápis do tabulky selže, soubor se ze
 * Storage uklidí: osiřelý soubor v bucketu nikdo nikdy nenajde ani nesmaže.
 */
export async function nahrajFotku(
  typ: TypZaznamu,
  zaznamId: string,
  soubor: Blob,
  mime: string,
  popis?: string,
): Promise<string | null> {
  const problem = chybaFotky(mime, soubor.size);
  if (problem) return problem;

  const cesta = cestaFotky(typ, zaznamId, mime);
  const nahrani = await supabase.storage.from(BUCKET_FOTEK).upload(cesta, soubor, {
    contentType: mime,
    upsert: false,
  });
  if (nahrani.error) {
    return nahrani.error.message.includes('Bucket not found')
      ? 'Úložiště fotek ještě není nastavené — je potřeba pustit migraci 20261228020000_fotky_zaznamu.sql.'
      : `Fotku se nepodařilo nahrát: ${nahrani.error.message}`;
  }

  const { error } = await supabase.from('zaznam_fotky').insert({
    typ, zaznam_id: zaznamId, cesta, popis: (popis ?? '').trim() || null,
  });
  if (error) {
    await supabase.storage.from(BUCKET_FOTEK).remove([cesta]);
    return error.code === '42P01'
      ? 'Evidence fotek ještě není v databázi — je potřeba pustit migraci 20261228020000_fotky_zaznamu.sql.'
      : `Fotka se nahrála, ale nešla připojit k zápisu: ${error.message}`;
  }
  return null;
}

/** Smaže fotku ze Storage i z evidence. Vrací text chyby, nebo null. */
export async function smazFotku(fotka: { id: string; cesta: string }): Promise<string | null> {
  const { error } = await supabase.from('zaznam_fotky').delete().eq('id', fotka.id);
  if (error) return `Fotku se nepodařilo smazat: ${error.message}`;
  // Soubor až po zápisu: kdyby se smazal první a zápis spadl, zůstal by v
  // evidenci řádek odkazující na nic.
  await supabase.storage.from(BUCKET_FOTEK).remove([fotka.cesta]);
  return null;
}
