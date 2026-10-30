// 📚 Odborná knihovna — čtení a zápis (soukromý bucket „knihovna" + tabulka
// bible_dokumenty, migrace 20261231410000).
// ---------------------------------------------------------------------------
// Jde přes bibleDb (lib/bibleKlient.ts): nic z knihovny nesmí do offline
// mezipaměti telefonu. Přístup hlídá databáze (RLS, fail-closed).
//
// Nahrání jednoho souboru:
//   1. SHA-256 v prohlížeči; stejný soubor už v knihovně → nenahrává se znovu
//   2. soubor do bucketu (cesta <nové id>/<bezpečné jméno>)
//   3. řádek dokumentu ve stavu „čeká na zpracování"
//   Když 3. selže, soubor z bucketu hned zmizí — nezůstane soubor bez záznamu.
import { bibleDb } from './bibleKlient';
import {
  bezpecneJmeno, chybiMigrace, hlaskaChyby, sha256Hex, typSouboru,
  type DruhDokumentu, type JazykDokumentu, type PostupZpracovani, type StavDokumentu,
} from './bibleKnihovna';

export const BUCKET_KNIHOVNA = 'knihovna';

export type BibleDokument = {
  id: string;
  nazev: string;
  autor: string | null;
  vydani: string | null;
  rok: number | null;
  isbn: string | null;
  jazyk: JazykDokumentu | null;
  druh: DruhDokumentu;
  oblasti: string[];
  zdroj: string | null;
  soubor_nazev: string;
  soubor_velikost: number;
  soubor_mime: string | null;
  stav: StavDokumentu;
  stav_zprava: string | null;
  postup: PostupZpracovani;
  stran_celkem: number | null;
  kvalita_ocr: number | null;
  licence: string | null;
  nahral: string | null;
  nahral_jmeno: string | null;
  created_at: string;
  zpracovano_at: string | null;
};

const SLOUPCE = 'id,nazev,autor,vydani,rok,isbn,jazyk,druh,oblasti,zdroj,soubor_nazev,soubor_velikost,soubor_mime,stav,stav_zprava,postup,stran_celkem,kvalita_ocr,licence,nahral,nahral_jmeno,created_at,zpracovano_at';

export type Popis = {
  nazev: string;
  autor?: string | null;
  vydani?: string | null;
  rok?: number | null;
  isbn?: string | null;
  jazyk?: JazykDokumentu | null;
  druh?: DruhDokumentu;
  oblasti?: string[];
  zdroj?: string | null;
  licence?: string | null;
};

export type Nacteno =
  | { stav: 'ok'; dokumenty: BibleDokument[] }
  | { stav: 'bez_migrace' }
  | { stav: 'chyba'; zprava: string };

export async function nactiDokumenty(): Promise<Nacteno> {
  const { data, error } = await bibleDb.from('bible_dokumenty').select(SLOUPCE).order('created_at', { ascending: false });
  if (error) return chybiMigrace(error) ? { stav: 'bez_migrace' } : { stav: 'chyba', zprava: hlaskaChyby(error) };
  return { stav: 'ok', dokumenty: (data ?? []) as BibleDokument[] };
}

export type VysledekNahrani =
  | { stav: 'nahrano'; dokument: BibleDokument }
  | { stav: 'duplicita'; nazev: string }
  | { stav: 'chyba'; zprava: string };

/** Prázdné texty → null, ať se v databázi neusadí „" místo „nevyplněno". */
const neboNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

function noveId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Starší WebView bez randomUUID — UUID v4 z getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function nahrajDokument(soubor: File, popis: Popis, nahralJmeno: string | null): Promise<VysledekNahrani> {
  const typ = typSouboru(soubor.name);
  if (!typ) return { stav: 'chyba', zprava: 'Tenhle typ souboru knihovna nebere.' };
  if (!popis.nazev.trim()) return { stav: 'chyba', zprava: 'Chybí název dokumentu.' };

  let sha: string;
  try {
    sha = await sha256Hex(soubor);
  } catch (e) {
    return { stav: 'chyba', zprava: `Soubor nejde přečíst (${hlaskaChyby(e)}).` };
  }

  const { data: stejne, error: chybaHledani } = await bibleDb.from('bible_dokumenty').select('id,nazev').eq('soubor_sha256', sha).limit(1);
  if (chybaHledani) return { stav: 'chyba', zprava: hlaskaChyby(chybaHledani) };
  if (stejne && stejne.length > 0) return { stav: 'duplicita', nazev: (stejne[0] as { nazev: string }).nazev };

  const id = noveId();
  const cesta = `${id}/${bezpecneJmeno(soubor.name)}`;
  const { error: chybaNahrani } = await bibleDb.storage.from(BUCKET_KNIHOVNA).upload(cesta, soubor, {
    contentType: typ,
    upsert: false,
  });
  if (chybaNahrani) return { stav: 'chyba', zprava: hlaskaChyby(chybaNahrani) };

  const radek = {
    id,
    ...ulozenyPopis(popis),
    soubor_cesta: cesta,
    soubor_nazev: soubor.name,
    soubor_velikost: soubor.size,
    soubor_mime: typ,
    soubor_sha256: sha,
    // Potvrzení práv je podmínka nahrání (zadání, bod 6) — formulář bez
    // zaškrtnutí sem vůbec nedojde.
    prava_potvrzena_at: new Date().toISOString(),
    nahral_jmeno: neboNull(nahralJmeno),
  };
  const { data, error } = await bibleDb.from('bible_dokumenty').insert(radek).select(SLOUPCE).single();
  if (error) {
    // Bez záznamu by soubor v bucketu jen zabíral místo — pryč s ním.
    await bibleDb.storage.from(BUCKET_KNIHOVNA).remove([cesta]).catch(() => undefined);
    if (error.code === '23505') return { stav: 'duplicita', nazev: popis.nazev.trim() };
    return { stav: 'chyba', zprava: hlaskaChyby(error) };
  }
  return { stav: 'nahrano', dokument: data as BibleDokument };
}

/** Popis tak, jak ho uloží databáze (prázdné texty → null). */
export function ulozenyPopis(popis: Popis): Required<Popis> {
  return {
    nazev: popis.nazev.trim(),
    autor: neboNull(popis.autor),
    vydani: neboNull(popis.vydani),
    rok: popis.rok ?? null,
    isbn: neboNull(popis.isbn),
    jazyk: popis.jazyk ?? null,
    druh: popis.druh ?? 'kniha',
    oblasti: popis.oblasti ?? [],
    zdroj: neboNull(popis.zdroj),
    licence: neboNull(popis.licence),
  };
}

/** Úprava popisu (název, autor…). Stav a údaje zpracování databáze uživateli nedovolí měnit. */
export async function upravPopis(id: string, popis: Popis): Promise<string | null> {
  const { error } = await bibleDb.from('bible_dokumenty').update(ulozenyPopis(popis)).eq('id', id);
  return error ? hlaskaChyby(error) : null;
}

/** „Zpracovat znovu" (po chybě nebo nové verzi zpracování) a „Pozastavit". */
export async function nastavStav(id: string, stav: 'ceka' | 'pozastaveno'): Promise<string | null> {
  const { error } = await bibleDb.from('bible_dokumenty').update({ stav, stav_zprava: null }).eq('id', id);
  return error ? hlaskaChyby(error) : null;
}

/**
 * Smazání dokumentu (jen správce). Nejdřív záznam, pak soubor: kdyby soubor
 * smazat nešlo, zbude jen nepoužitý soubor — nikdy záznam bez souboru.
 */
export async function smazDokument(id: string): Promise<string | null> {
  const { data, error } = await bibleDb.from('bible_dokumenty').delete().eq('id', id).select('soubor_cesta');
  if (error) return hlaskaChyby(error);
  const cesty = ((data ?? []) as { soubor_cesta: string }[]).map((r) => r.soubor_cesta);
  if (cesty.length === 0) return 'Dokument se nesmazal — nemáš na to právo, nebo už neexistuje.';
  const { error: chybaSouboru } = await bibleDb.storage.from(BUCKET_KNIHOVNA).remove(cesty);
  return chybaSouboru ? `Záznam je pryč, ale soubor zůstal v úložišti (${hlaskaChyby(chybaSouboru)}).` : null;
}

/** Odkaz ke stažení originálu na hodinu (soukromý bucket). */
export async function odkazNaSoubor(id: string): Promise<{ url: string } | { chyba: string }> {
  const { data, error } = await bibleDb.from('bible_dokumenty').select('soubor_cesta').eq('id', id).single();
  if (error || !data) return { chyba: hlaskaChyby(error) };
  const { data: podepsany, error: e2 } = await bibleDb.storage.from(BUCKET_KNIHOVNA).createSignedUrl((data as { soubor_cesta: string }).soubor_cesta, 3600);
  if (e2 || !podepsany) return { chyba: hlaskaChyby(e2) };
  return { url: podepsany.signedUrl };
}

export type Kapacita = {
  postgres: string;
  db_bajtu: number;
  rozsireni: Record<string, { dostupna: string | null; zapnuta: string | null }>;
  fulltext: string[];
  uloziste: Record<string, { souboru: number; bajtu: number }>;
  knihovna: { dokumentu: number; bajtu: number; podle_stavu: Record<string, number> };
};

export async function nactiKapacitu(): Promise<{ kapacita: Kapacita } | { chyba: string; bezMigrace: boolean }> {
  const { data, error } = await bibleDb.rpc('bible_kapacita');
  if (error) return { chyba: hlaskaChyby(error), bezMigrace: chybiMigrace(error) };
  return { kapacita: data as Kapacita };
}
