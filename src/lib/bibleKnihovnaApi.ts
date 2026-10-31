// 📚 Odborná knihovna — čtení a zápis v projektu bible (samostatný Supabase,
// rozhodnutí R12) přes edge funkci bible-api (lib/bibleKlient.ts).
// ---------------------------------------------------------------------------
// Databáze bible je pro prohlížeč zavřená; práva hlídá bible-api (ověří
// přihlášení a práva v hlavní appce, fail-closed) a znovu SQL funkce v bibli.
// Nic z knihovny nejde do offline mezipaměti telefonu.
//
// Nahrání jednoho souboru:
//   1. SHA-256 v prohlížeči; zalozit_nahrani → stejný soubor už v knihovně
//      = duplicita; jinak řádek „nahrava" a podepsaný odkaz jen pro tuhle cestu
//   2. soubor rovnou do úložiště bible (cesta <id>/<bezpečné jméno>)
//   3. potvrdit_nahrani → soubor tam je a má ohlášenou velikost → „čeká"
//   Když 2. nebo 3. selže, řádek zůstane „nahrava": nahrát stejný soubor
//   znovu naváže (bez nového řádku), nebo jde nahrání zrušit. Nikdy soubor
//   bez záznamu ani záznam ve frontě bez souboru.
import { BIBLE_URL, odkazDoUloziste, volejBibli } from './bibleKlient';
import {
  bezpecneJmeno, hlaskaChyby, LIMIT_SOUBORU_FREE, sha256Hex, souhrnNakladu, typSouboru,
  type DruhDokumentu, type JazykDokumentu, type NakladyMesice, type PostupZpracovani, type StavDokumentu,
} from './bibleKnihovna';

export type { NakladyMesice } from './bibleKnihovna';

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
  const r = await volejBibli<BibleDokument[]>('bible-api', { akce: 'dokumenty' });
  if (!r.ok) return r.chyba.kod === 'bez_migrace' ? { stav: 'bez_migrace' } : { stav: 'chyba', zprava: r.chyba.zprava };
  return { stav: 'ok', dokumenty: Array.isArray(r.data) ? r.data : [] };
}

export type VysledekNahrani =
  | { stav: 'nahrano'; dokument: BibleDokument }
  | { stav: 'duplicita'; nazev: string }
  | { stav: 'chyba'; zprava: string };

/** Prázdné texty → null, ať se v databázi neusadí „" místo „nevyplněno". */
const neboNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

type Zalozeni =
  | { duplicita: true; nazev: string }
  | { duplicita?: false; id: string; cesta: string; obnoveno: boolean; soubor_nahran: boolean; token?: string; apikey?: string };

/**
 * Soubor rovnou do úložiště bible podepsaným odkazem (platí jen pro tuhle
 * cestu a nepřepíše existující soubor). null = nahráno.
 */
export async function nahrajDoUloziste(cesta: string, token: string, soubor: Blob, typ: string, apikey?: string): Promise<string | null> {
  const adresa = `${BIBLE_URL}/storage/v1/object/upload/sign/${BUCKET_KNIHOVNA}/${cesta.split('/').map(encodeURIComponent).join('/')}`
    + `?token=${encodeURIComponent(token)}`;
  // Stejně jako supabase-js: formulář s typem souboru podle přípony (prohlížeč
  // u .md nebo .djvu žádný nezná) — bucket bere jen povolené typy.
  const formular = new FormData();
  formular.append('cacheControl', '3600');
  formular.append('', soubor.slice(0, soubor.size, typ));
  let odpoved: Response;
  try {
    odpoved = await fetch(adresa, { method: 'PUT', headers: { 'x-upsert': 'false', ...(apikey ? { apikey } : {}) }, body: formular });
  } catch (e) {
    return hlaskaChyby(e);
  }
  if (odpoved.ok) return null;
  let j: { statusCode?: string | number; error?: string; message?: string } = {};
  try {
    j = await odpoved.json();
  } catch {
    j = {};
  }
  const text = `${j.error ?? ''} ${j.message ?? ''}`;
  // Soubor tam už je z dřívějšího pokusu — velikost ověří potvrzení.
  if (odpoved.status === 409 || /already exists|Duplicate/i.test(text)) return null;
  if (/jwt|signature|expired/i.test(text)) return 'Odkaz pro nahrání vypršel.';
  return hlaskaChyby({ statusCode: j.statusCode ?? odpoved.status, message: j.message ?? j.error ?? `HTTP ${odpoved.status}` });
}

export async function nahrajDokument(soubor: File, popis: Popis): Promise<VysledekNahrani> {
  const typ = typSouboru(soubor.name);
  if (!typ) return { stav: 'chyba', zprava: 'Tenhle typ souboru knihovna nebere.' };
  if (!popis.nazev.trim()) return { stav: 'chyba', zprava: 'Chybí název dokumentu.' };
  if (soubor.size === 0) return { stav: 'chyba', zprava: 'Soubor je prázdný.' };
  if (soubor.size > LIMIT_SOUBORU_FREE) {
    return { stav: 'chyba', zprava: 'Soubor je větší, než úložiště dovolí (tarif Supabase Free bere nejvýš 50 MB na soubor).' };
  }

  let sha: string;
  try {
    sha = await sha256Hex(soubor);
  } catch (e) {
    return { stav: 'chyba', zprava: `Soubor nejde přečíst (${hlaskaChyby(e)}).` };
  }

  const z = await volejBibli<Zalozeni>('bible-api', {
    akce: 'zalozit_nahrani',
    popis: ulozenyPopis(popis),
    soubor: { nazev: soubor.name, jmeno: bezpecneJmeno(soubor.name), velikost: soubor.size, mime: typ, sha256: sha },
  });
  if (!z.ok) return { stav: 'chyba', zprava: z.chyba.zprava };
  if (z.data.duplicita) return { stav: 'duplicita', nazev: z.data.nazev };
  const zalozeno = z.data;

  if (!zalozeno.soubor_nahran) {
    if (!zalozeno.token) return { stav: 'chyba', zprava: 'Bot nevydal odkaz pro nahrání. Zkus to znovu.' };
    const chyba = await nahrajDoUloziste(zalozeno.cesta, zalozeno.token, soubor, typ, zalozeno.apikey);
    if (chyba) return { stav: 'chyba', zprava: `${chyba} Nahrání jde dokončit: vyber stejný soubor a nahraj ho znovu.` };
  }

  const p = await volejBibli<BibleDokument>('bible-api', { akce: 'potvrdit_nahrani', id: zalozeno.id });
  if (!p.ok) return { stav: 'chyba', zprava: p.chyba.zprava };
  return { stav: 'nahrano', dokument: p.data };
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
  const r = await volejBibli('bible-api', { akce: 'upravit_popis', id, popis: ulozenyPopis(popis) });
  return r.ok ? null : r.chyba.zprava;
}

/** „Zpracovat znovu" (po chybě nebo nové verzi zpracování) a „Pozastavit". */
export async function nastavStav(id: string, stav: 'ceka' | 'pozastaveno'): Promise<string | null> {
  const r = await volejBibli('bible-api', { akce: 'nastavit_stav', id, stav });
  return r.ok ? null : r.chyba.zprava;
}

/**
 * Smazání dokumentu (správce), nebo zrušení vlastního nedokončeného nahrání.
 * Nejdřív záznam, pak soubor: kdyby soubor smazat nešlo, zbude jen nepoužitý
 * soubor — nikdy záznam bez souboru.
 */
export async function smazDokument(id: string): Promise<string | null> {
  const r = await volejBibli<{ smazano: boolean; soubor_zustal?: boolean }>('bible-api', { akce: 'smazat', id });
  if (!r.ok) return r.chyba.zprava;
  return r.data.soubor_zustal ? 'Záznam je pryč, ale soubor zůstal v úložišti bible.' : null;
}

/** Odkaz ke stažení originálu na pár minut (soukromý bucket projektu bible). */
export async function odkazNaSoubor(id: string): Promise<{ url: string } | { chyba: string }> {
  const r = await volejBibli<{ url: string }>('bible-api', { akce: 'odkaz', id });
  if (!r.ok) return { chyba: r.chyba.zprava };
  const url = odkazDoUloziste(r.data.url);
  return url ? { url } : { chyba: 'Bot vrátil neplatný odkaz ke stažení.' };
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
  const r = await volejBibli<Kapacita>('bible-api', { akce: 'kapacita' });
  if (!r.ok) return { chyba: r.chyba.zprava, bezMigrace: r.chyba.kod === 'bez_migrace' };
  return { kapacita: r.data };
}

/** Útrata za AI od začátku měsíce (UTC) — jen pro správce. */
export async function nactiNakladyMesice(ted = new Date()): Promise<{ naklady: NakladyMesice } | { chyba: string; bezMigrace: boolean }> {
  const zacatek = new Date(Date.UTC(ted.getUTCFullYear(), ted.getUTCMonth(), 1)).toISOString();
  // Součet po účelech počítá databáze — výběr řádků by REST uřízl na 1000 a útrata by vyšla menší.
  const r = await volejBibli<{ ucel: string; cena_usd: number; volani: number }[]>('bible-api', { akce: 'naklady', od: zacatek });
  if (!r.ok) return { chyba: r.chyba.zprava, bezMigrace: r.chyba.kod === 'bez_migrace' };
  return { naklady: souhrnNakladu(Array.isArray(r.data) ? r.data : []) };
}

/** Nastavení bible (modely, stropy) jako klíč → hodnota. */
export async function nactiNastaveni(): Promise<Record<string, unknown> | null> {
  const r = await volejBibli<Record<string, unknown>>('bible-api', { akce: 'nastaveni' });
  return r.ok && r.data && typeof r.data === 'object' ? r.data : null;
}
