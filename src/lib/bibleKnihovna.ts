// 📚 Odborná knihovna — čisté pomocné funkce (bez sítě, s testy).
// ---------------------------------------------------------------------------
// Typy souborů, bezpečná jména v úložišti, odhad názvu ze jména souboru,
// SHA-256, popisy stavů zpracování a srozumitelné hlášky chyb nahrávání.

/** nahrava = záznam je založený, soubor ještě nedorazil celý (projekt bible, R12). */
export type StavDokumentu = 'nahrava' | 'ceka' | 'zpracovava' | 'hotovo' | 'ke_kontrole' | 'chyba' | 'pozastaveno';

export type DruhDokumentu = 'kniha' | 'skripta' | 'clanek' | 'norma' | 'prirucka' | 'poznamky' | 'tabulky' | 'jiny';

export type JazykDokumentu = 'cs' | 'de' | 'en' | 'sk' | 'jiny';

/**
 * Průběh zpracování, který worker zapisuje během práce do postup.prubeh
 * (scripts/bible/zpracuj.py, hlasit_prubeh) — z něj jsou procenta v knihovně.
 */
export type PrubehZpracovani = {
  faze?: string;
  hotovo?: number;
  celkem?: number;
  ocr_hotovo?: number;
  ocr_celkem?: number;
  cas?: string;
};

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
  prubeh?: PrubehZpracovani;
};

/**
 * Přípona → MIME typ. Bucket „knihovna" projektu bible přijme jen tyhle typy
 * (seznam v bible/supabase/migrations/20261101000000_bible_zaklad.sql se musí
 * shodovat — hlídá test). Typ se posílá vždy podle přípony: prohlížeč u .md
 * nebo .djvu často žádný nezná.
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

/** Limit souboru na tarifu Supabase Free (bucket knihovna projektu bible ho má nastavený). */
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
  nahrava: 'Nahrává se',
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

const FAZE_POPIS: Readonly<Record<string, string>> = {
  stahovani: 'stahuje soubor',
  cteni: 'čte text',
  prepis: 'přepisuje skeny',
  ukladani: 'ukládá kapitoly a pasáže',
};

const cislo = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * Procenta zpracování z průběhu (0–99; 100 % znamená až stav „Zpracováno").
 * null = počet stran ještě není známý.
 */
export function procentZpracovani(postup: PostupZpracovani | null | undefined): number | null {
  const p = postup?.prubeh;
  const hotovo = cislo(p?.hotovo);
  const celkem = cislo(p?.celkem);
  if (hotovo === null || celkem === null || celkem <= 0) return null;
  return Math.max(0, Math.min(99, Math.floor((100 * hotovo) / celkem)));
}

/**
 * Po kolika minutách bez zprávy od workeru se u zpracovávané knihy připíše
 * „bez zprávy" — víc než nejdelší mezera mezi zápisy průběhu (stažení velké
 * knihy, čtení DjVu, ukládání pasáží), ať to nestraší u běžící práce.
 */
export const PRUBEH_BEZ_ZPRAVY_MIN = 20;

/**
 * Text průběhu u dokumentu, např. „46 % · přepisuje skeny (80 z 250 stran)".
 * Když se worker dlouho neozval (spadlý běh drží zámek až 2 h), připíše
 * „bez zprávy N min". U čekajícího dokumentu řekne jen to, co se doopravdy
 * neztratí: kolik naskenovaných stran je už přepsaných. Jinak null.
 */
export function prubehText(stav: StavDokumentu, postup: PostupZpracovani | null | undefined, ted: Date = new Date()): string | null {
  const p = postup?.prubeh;
  const procent = procentZpracovani(postup);
  const ocrCelkem = cislo(p?.ocr_celkem);
  const ocrHotovo = cislo(p?.ocr_hotovo) ?? 0;
  if (stav === 'zpracovava') {
    if (!p) return 'začíná — procenta se ukážou za chvíli';
    const faze = FAZE_POPIS[p.faze ?? ''] ?? 'zpracovává';
    const ocr = p.faze === 'prepis' && ocrCelkem ? ` (${ocrHotovo} z ${ocrCelkem} stran)` : '';
    const cas = p.cas ? Date.parse(p.cas) : Number.NaN;
    const minut = Number.isFinite(cas) ? Math.floor((ted.getTime() - cas) / 60_000) : 0;
    const ticho = minut >= PRUBEH_BEZ_ZPRAVY_MIN ? ` · bez zprávy ${minut} min` : '';
    return `${procent === null ? '' : `${procent} % · `}${faze}${ocr}${ticho}`;
  }
  if (stav === 'ceka' && ocrCelkem && ocrHotovo > 0) {
    // Kdy kniha přijde na řadu, říká textCekani — tady jen to, co se neztratí.
    return `Už přepsáno ${Math.min(ocrHotovo, ocrCelkem)} z ${ocrCelkem} naskenovaných stran — znovu se neplatí`;
  }
  return null;
}

/**
 * Kdy se zpracování pustí samo: GitHub Actions, cron `17 *\/3 * * *` (UTC)
 * v .github/workflows/bible-zpracovani.yml (test hlídá, že se neliší).
 */
export const PLAN_ZPRACOVANI_CRON = '17 */3 * * *';

/** Nejbližší plánovaný běh zpracování po okamžiku `ted` (GitHub ho občas o pár minut zdrží). */
export function dalsiBehZpracovani(ted: Date = new Date()): Date {
  const hodina = ted.getUTCHours() - (ted.getUTCHours() % 3);
  let beh = Date.UTC(ted.getUTCFullYear(), ted.getUTCMonth(), ted.getUTCDate(), hodina, 17);
  while (beh <= ted.getTime()) beh += 3 * 3600_000;
  return new Date(beh);
}

/** Poslední plánovaný běh zpracování, který už měl začít (nejpozději `ted`). */
export function posledniBehZpracovani(ted: Date = new Date()): Date {
  return new Date(dalsiBehZpracovani(ted).getTime() - 3 * 3600_000);
}

/** Jak dlouho po plánovaném čase se ještě čeká, že běh teprve začne (GitHub ho zdrží). */
export const ZDRZENI_BEHU_MIN = 75;

/**
 * Text u čekající knihy. Když se jiná kniha právě zpracovává, přijde tahle na
 * řadu ve stejném běhu (worker bere frontu dokola) — pokud ji tenhle běh už
 * neviděl (průběh zapsaný po plánovaném čase): odloženou knihu (třeba skeny
 * bez kreditu) worker ve stejném běhu znovu nebere. Těsně po plánovaném čase
 * běh často ještě nezačal (GitHub ho zdrží) — dokud ho kniha neviděla, čeká
 * na něj, ne na ten o 3 hodiny později. To ale neplatí pro knihu, která do
 * fronty přišla (nahráním nebo dokončením) až po plánovaném čase: ten běh už
 * nejspíš proběhl, slibuje se další (`zarazeno` = zpracováno_at ?? created_at).
 */
export function textCekani(
  zpracovavaSeJina: boolean,
  postup: PostupZpracovani | null | undefined,
  zarazeno: string | null | undefined,
  ted: Date = new Date(),
): string {
  const posledni = posledniBehZpracovani(ted);
  const videla = postup?.prubeh?.cas ? Date.parse(postup.prubeh.cas) >= posledni.getTime() : false;
  const poBehu = zarazeno ? Date.parse(zarazeno) > posledni.getTime() : false;
  if (zpracovavaSeJina && !videla) return 'Čeká ve frontě — přijde na řadu v tomhle běhu, až doběhne rozpracovaná kniha.';
  if (ted.getTime() - posledni.getTime() < ZDRZENI_BEHU_MIN * 60_000 && !videla && !poBehu) {
    return `Čeká na běh zpracování z ${casBehuText(posledni)} — GitHub ho občas o pár desítek minut zdrží.`;
  }
  return `Čeká na další běh zpracování — asi v ${casBehuText(dalsiBehZpracovani(ted))}.`;
}

/** Jak často se knihovna sama obnoví: když se něco zpracovává (procenta) a když jen čeká na běh. */
export const OBNOVA_PRI_ZPRACOVANI_MS = 20_000;
export const OBNOVA_PRI_CEKANI_MS = 60_000;
export const OBNOVA_MIMO_BEH_MS = 600_000;

/**
 * Interval obnovy knihovny: při zpracování často (procenta), u čekajících knih
 * po minutě jen v okně po plánovaném běhu (jinak se stav nemění), jinak vůbec.
 */
export function intervalObnovy(zpracovavaSe: boolean, nekdoCeka: boolean, ted: Date = new Date()): number | null {
  if (zpracovavaSe) return OBNOVA_PRI_ZPRACOVANI_MS;
  if (!nekdoCeka) return null;
  const odBehu = ted.getTime() - posledniBehZpracovani(ted).getTime();
  return odBehu < 90 * 60_000 ? OBNOVA_PRI_CEKANI_MS : OBNOVA_MIMO_BEH_MS;
}

/** Čas běhu po pivovarsku (Europe/Prague), např. „21:17". */
export function casBehuText(d: Date): string {
  return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' });
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
  if (chybiMigrace(c)) return 'Databáze bible ještě nemá tabulky — spusť migraci v Systém → Databázové migrace → Databáze bible.';
  if (/Failed to fetch|NetworkError|aborted|network/i.test(zprava)) return 'Spojení se přerušilo. Zkus to znovu, až bude signál.';
  return zprava || 'Neznámá chyba.';
}

export type NakladyMesice = { usd: number; volani: number; podleUcelu: Record<string, number> };

/** Součet řádků ai_naklady (útrata za AI) — celkem a po účelech (ocr, chat…). */
export function souhrnNakladu(radky: { ucel: string; cena_usd: number | string; volani: number | null }[]): NakladyMesice {
  const podleUcelu: Record<string, number> = {};
  let usd = 0;
  let volani = 0;
  for (const r of radky) {
    const cena = Number(r.cena_usd) || 0;
    usd += cena;
    volani += Number(r.volani) || 0;
    podleUcelu[r.ucel] = (podleUcelu[r.ucel] ?? 0) + cena;
  }
  return { usd, volani, podleUcelu };
}
