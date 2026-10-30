// 📚 Odborná knihovna — čisté pomocné funkce (bez sítě, s testy).
// ---------------------------------------------------------------------------
// Typy souborů, bezpečná jména v úložišti, odhad názvu ze jména souboru,
// SHA-256, popisy stavů zpracování a srozumitelné hlášky chyb nahrávání.

export type StavDokumentu = 'ceka' | 'zpracovava' | 'hotovo' | 'ke_kontrole' | 'chyba' | 'pozastaveno';

export type DruhDokumentu = 'kniha' | 'skripta' | 'clanek' | 'norma' | 'prirucka' | 'poznamky' | 'tabulky' | 'jiny';

export type JazykDokumentu = 'cs' | 'de' | 'en' | 'sk' | 'jiny';

/** Počty po zpracování (Etapa 2 — worker je zapisuje do bible_dokumenty.postup). */
export type PostupZpracovani = {
  stran?: number;
  digitalnich?: number;
  ocr?: number;
  ke_kontrole?: number;
  kapitol?: number;
  tabulek?: number;
  vzorcu?: number;
  pasazi?: number;
};

/**
 * Přípona → MIME typ. Bucket „knihovna" přijme jen tyhle typy (seznam
 * v migraci 20261231410000 se musí shodovat — hlídá test). Typ se posílá
 * vždy podle přípony: prohlížeč u .md nebo .djvu často žádný nezná.
 */
export const TYPY_SOUBORU: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  djvu: 'image/vnd.djvu',
  djv: 'image/vnd.djvu',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
};

/** Pro `<input accept>`. */
export const PRIJIMANE_PRIPONY = Object.keys(TYPY_SOUBORU).map((p) => `.${p}`).join(',');

/** Limit souboru na tarifu Supabase Free. Na Pro jde zvýšit v nastavení úložiště. */
export const LIMIT_SOUBORU_FREE = 50 * 1024 * 1024;

export function pripona(nazevSouboru: string): string {
  const i = nazevSouboru.lastIndexOf('.');
  return i > 0 ? nazevSouboru.slice(i + 1).toLowerCase() : '';
}

/** MIME typ podle přípony; null = typ, který knihovna (zatím) nezpracuje. */
export function typSouboru(nazevSouboru: string): string | null {
  return TYPY_SOUBORU[pripona(nazevSouboru)] ?? null;
}

const bezDiakritiky = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Jméno pro cestu v úložišti: bez diakritiky a mezer, jen [A-Za-z0-9._-],
 * přípona zůstává. Původní jméno se ukládá zvlášť (soubor_nazev).
 */
export function bezpecneJmeno(nazevSouboru: string): string {
  const p = pripona(nazevSouboru);
  const zaklad = p ? nazevSouboru.slice(0, -(p.length + 1)) : nazevSouboru;
  const cisty = bezDiakritiky(zaklad)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100);
  return `${cisty || 'dokument'}${p ? `.${p}` : ''}`;
}

/** Odhad názvu ze jména souboru — jen návrh, uživatel ho před nahráním vidí a může přepsat. */
export function nazevZeSouboru(nazevSouboru: string): string {
  const p = pripona(nazevSouboru);
  const zaklad = p ? nazevSouboru.slice(0, -(p.length + 1)) : nazevSouboru;
  return zaklad.replace(/[_]+/g, ' ').replace(/\s{2,}/g, ' ').trim() || nazevSouboru;
}

export function velikostText(bajtu: number): string {
  if (bajtu < 1024) return `${bajtu} B`;
  if (bajtu < 1024 * 1024) return `${(bajtu / 1024).toFixed(0)} kB`;
  if (bajtu < 1024 * 1024 * 1024) return `${(bajtu / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${(bajtu / (1024 * 1024 * 1024)).toFixed(2).replace('.', ',')} GB`;
}

/** Obsah souboru jako bajty — Blob.arrayBuffer, ve starších WebView přes FileReader. */
function nactiBajty(data: Blob): Promise<ArrayBuffer> {
  if (typeof data.arrayBuffer === 'function') return data.arrayBuffer();
  return new Promise((ok, ko) => {
    const cteni = new FileReader();
    cteni.onload = () => ok(cteni.result as ArrayBuffer);
    cteni.onerror = () => ko(cteni.error);
    cteni.readAsArrayBuffer(data);
  });
}

export async function sha256Hex(data: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await nactiBajty(data));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const STAV_POPIS: Readonly<Record<StavDokumentu, string>> = {
  ceka: 'Čeká na zpracování',
  zpracovava: 'Zpracovává se',
  hotovo: 'Zpracováno',
  ke_kontrole: 'Zpracováno, část ke kontrole',
  chyba: 'Chyba zpracování',
  pozastaveno: 'Pozastaveno',
};

export const DRUH_POPIS: Readonly<Record<DruhDokumentu, string>> = {
  kniha: 'Kniha',
  skripta: 'Skripta',
  clanek: 'Článek, studie',
  norma: 'Norma, metodika',
  prirucka: 'Příručka, dokumentace výrobce',
  poznamky: 'Poznámky, vlastní dokument',
  tabulky: 'Tabulky',
  jiny: 'Jiné',
};

export const JAZYK_POPIS: Readonly<Record<JazykDokumentu, string>> = {
  cs: 'čeština',
  de: 'němčina',
  en: 'angličtina',
  sk: 'slovenština',
  jiny: 'jiný',
};

/**
 * „Je kniha opravdu v knihovně?" — jen když je zpracovaná (zadání, bod 6:
 * netvrdit, že ji AI zná, dokud obsah nebyl nahrán, zpracován a zpřístupněn).
 */
export function jeZpracovany(stav: StavDokumentu): boolean {
  return stav === 'hotovo' || stav === 'ke_kontrole';
}

/** Krátký popis postupu zpracování, např. „412 stran · 18 kapitol · 3 ke kontrole". */
export function postupText(postup: PostupZpracovani | null | undefined, stranCelkem?: number | null): string {
  const p = postup ?? {};
  const casti: string[] = [];
  const stran = p.stran ?? stranCelkem ?? null;
  if (stran != null) casti.push(`${stran} stran`);
  if (p.ocr) casti.push(`${p.ocr} přes OCR`);
  if (p.kapitol != null) casti.push(`${p.kapitol} kapitol`);
  if (p.tabulek) casti.push(`${p.tabulek} tabulek`);
  if (p.vzorcu) casti.push(`${p.vzorcu} vzorců`);
  if (p.pasazi != null) casti.push(`${p.pasazi} pasáží`);
  if (p.ke_kontrole) casti.push(`${p.ke_kontrole} ke kontrole`);
  return casti.join(' · ');
}

/** Chyba „tabulka ještě neexistuje" — migrace knihovny ještě neběžela. */
export function chybiMigrace(chyba: { code?: string; message?: string } | null | undefined): boolean {
  if (!chyba) return false;
  return chyba.code === '42P01' || chyba.code === 'PGRST205' || chyba.code === 'PGRST202'
    || /does not exist|Could not find the (table|function)/i.test(chyba.message ?? '');
}

/** Srozumitelná hláška chyby při nahrání nebo zápisu dokumentu. */
export function hlaskaChyby(chyba: unknown): string {
  const c = (chyba ?? {}) as { code?: string; message?: string; statusCode?: string | number; status?: number };
  const zprava = c.message ?? String(chyba ?? '');
  const status = String(c.statusCode ?? c.status ?? '');
  if (c.code === '23505' || /duplicate key|already exists/i.test(zprava)) return 'Tenhle soubor už v knihovně je.';
  if (status === '413' || /exceeded the maximum allowed size|payload too large|too large/i.test(zprava)) {
    return 'Soubor je větší, než úložiště dovolí (tarif Supabase Free bere nejvýš 50 MB na soubor).';
  }
  if (status === '415' || /mime type|not supported/i.test(zprava)) return 'Tenhle typ souboru knihovna nebere.';
  if (c.code === '42501' || status === '403' || /row-level security|permission denied|Unauthorized/i.test(zprava)) {
    return 'Nemáš právo nahrávat do knihovny. Povolí ho admin v Uživatelé → Práva → Pivovarská bible.';
  }
  if (chybiMigrace(c)) return 'Knihovna ještě nemá tabulky v databázi — spusť migraci v Systém → Databázové migrace.';
  if (/Failed to fetch|NetworkError|aborted|network/i.test(zprava)) return 'Spojení se přerušilo. Zkus to znovu, až bude signál.';
  return zprava || 'Neznámá chyba.';
}
