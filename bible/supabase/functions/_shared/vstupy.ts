// 📥 bible-api: akce, kontrola vstupů a překlad chyb databáze.
// ---------------------------------------------------------------------------
// Čisté funkce bez sítě a bez Dena (testy: vstupy.test.ts). Práva hlídají
// dvakrát: tady podle úrovně přístupu z hlavního projektu a znovu v SQL
// funkcích projektu bible (bible/supabase/migrations), které jediné zapisují.
import { jeUuid, type Pristup } from './brana.ts';
import { DRUHY_ZARIZENI, ZDROJE_PARAMETRU } from './technologie-popisy.ts';
import { DRUHY_SUROVIN, FAZE_KROKU, HODNOTY_VARKY } from './varky-popisy.ts';
import { STAVY_PROBLEMU, STAVY_ZJISTENI, TYPY_ZJISTENI } from './problemy-popisy.ts';
import { STAVY_WEBU } from './web-popisy.ts';

/** Akce bible-api a nejnižší potřebný přístup. */
export const AKCE = {
  dokumenty: 'cte',
  nastaveni: 'cte',
  odkaz: 'cte',
  zalozit_nahrani: 'prispiva',
  potvrdit_nahrani: 'prispiva',
  upravit_popis: 'prispiva',
  nastavit_stav: 'prispiva',
  // Přispěvatel smí zrušit jen svoje nedokončené nahrání — zbytek hlídá SQL.
  smazat: 'prispiva',
  kapacita: 'spravuje',
  naklady: 'spravuje',
  // Čtení zpracované knihy (etapa 3a): obsah, listy textu, tabulky a vzorce.
  kniha: 'cte',
  listy: 'cte',
  objekty: 'cte',
  // Hledání v knihách (etapa 4): originál i český překlad.
  hledej: 'cte',
  // Přehledy témat (Claude porovná knihy, s odkazy na stránky).
  prehledy: 'cte',
  prehled: 'cte',
  // Konektor do aplikace Claude (bible-mcp): schválení a správa připojení.
  mcp_povolit: 'cte',
  mcp_pripojeni: 'cte',
  mcp_odpojit: 'cte',
  // Zkušenosti sládků (etapa 3b): čtení všem, zápis přispěvateli; ověřenou
  // úroveň 1–3 a cizí záznamy hlídá SQL (správce).
  zkusenosti: 'cte',
  zkusenost_zapsat: 'prispiva',
  zkusenost_upravit: 'prispiva',
  zkusenost_smazat: 'prispiva',
  // Nová vydání (etapa 3c): vazba „tahle kniha je novým vydáním té"; komu
  // patří dokument, hlídá SQL (správce u čehokoli, přispěvatel u svých).
  vydani: 'cte',
  vydani_nastavit: 'prispiva',
  // Technologie pivovaru (etapa 7): čtení všem, zápis přispěvateli, smazat celý
  // pivovar jen správce (hlídá i SQL).
  technologie: 'cte',
  pivovar_ulozit: 'prispiva',
  pivovar_smazat: 'spravuje',
  zarizeni_ulozit: 'prispiva',
  zarizeni_prevzit: 'prispiva',
  zarizeni_smazat: 'prispiva',
  postup_provozu_ulozit: 'prispiva',
  postup_provozu_smazat: 'prispiva',
  // Receptury a várky (etapa 8): čtení všem, zápis přispěvateli; smazat smí
  // autor záznamu nebo správce (hlídá SQL).
  varky: 'cte',
  receptura_ulozit: 'prispiva',
  receptura_smazat: 'prispiva',
  varka_ulozit: 'prispiva',
  varka_smazat: 'prispiva',
  // Rešerše z internetu (etapa 9): čtení všem, zápis přispěvateli (nový zdroj
  // je vždy neověřený), ověřit / zamítnout jen správce (hlídá i SQL).
  web_zdroje: 'cte',
  web_zdroj_ulozit: 'prispiva',
  web_zdroj_overit: 'spravuje',
  web_zdroj_smazat: 'prispiva',
  // Analýza problémů (etapa 10): čtení všem, zápis přispěvateli; smazat autor
  // nebo správce (hlídá SQL).
  problemy: 'cte',
  problem_ulozit: 'prispiva',
  problem_smazat: 'prispiva',
  zjisteni_ulozit: 'prispiva',
  zjisteni_stav: 'prispiva',
  zjisteni_smazat: 'prispiva',
  // AI sládek (chatbot, etapa 5): každý vidí a maže jen svoje konverzace
  // (hlídá SQL); měsíční strop útraty za AI mění jen správce.
  chat_stav: 'cte',
  konverzace: 'cte',
  konverzace_detail: 'cte',
  konverzace_smazat: 'cte',
  strop_nastavit: 'spravuje',
} as const satisfies Record<string, Pristup>;

export type Akce = keyof typeof AKCE;

export function jeAkce(v: unknown): v is Akce {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(AKCE, v);
}

/** Sloupce dokumentu pro appku (bez fronty workeru a otisku souboru). */
export const SLOUPCE_DOKUMENTU =
  'id,nazev,autor,vydani,rok,isbn,jazyk,druh,oblasti,zdroj,soubor_nazev,soubor_velikost,soubor_mime,stav,stav_zprava,postup,stran_celkem,kvalita_ocr,licence,nahral,nahral_jmeno,created_at,zpracovano_at';

/** Platnost odkazu ke stažení originálu (s): prohlížeč PDF si dočítá části souboru průběžně. */
export const PLATNOST_ODKAZU_S = 600;

/**
 * Dodatek k PDF (bible_dodatky, scripts/bible/dodatek.py) pro appku: bytea
 * přijde z PostgRESTu jako text „\x0a…", appka dostane base64. Bez dat,
 * s divnou délkou nebo nad 2 MB = null (čtečka pak čte holý originál).
 */
export function dodatekKOdeslani(radek: unknown): { delka_originalu: number; data: string } | null {
  if (!radek || typeof radek !== 'object') return null;
  const { delka_originalu: delkaSurova, data } = radek as Record<string, unknown>;
  const delka = typeof delkaSurova === 'string' ? Number(delkaSurova) : delkaSurova;
  if (typeof delka !== 'number' || !Number.isSafeInteger(delka) || delka <= 0) return null;
  if (typeof data !== 'string' || !data.startsWith('\\x') || data.length % 2 !== 0 || data.length > 2 + 4_000_000) return null;
  const hex = data.slice(2);
  if (!hex || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  let bin = '';
  for (let i = 0; i < hex.length; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return { delka_originalu: delka, data: btoa(bin) };
}

export class ChybaVstupu extends Error {}

function text(v: unknown, jmeno: string, max: number, povinny = false): string | null {
  if (v === undefined || v === null) {
    if (povinny) throw new ChybaVstupu(`Chybí ${jmeno}.`);
    return null;
  }
  if (typeof v !== 'string') throw new ChybaVstupu(`${jmeno} musí být text.`);
  if (v.length > max) throw new ChybaVstupu(`${jmeno} je moc dlouhý (nejvýš ${max} znaků).`);
  if (povinny && !v.trim()) throw new ChybaVstupu(`Chybí ${jmeno}.`);
  return v;
}

export function idDokumentu(telo: Record<string, unknown>): string {
  if (!jeUuid(telo.id)) throw new ChybaVstupu('Chybí id dokumentu.');
  return telo.id.toLowerCase();
}

/** Předchozí vydání: id jiného dokumentu, nebo null = vazbu zrušit. Chybějící pole je chyba (ne tiché zrušení). */
export function predchoziVydani(telo: Record<string, unknown>): string | null {
  if (!Object.prototype.hasOwnProperty.call(telo, 'predchozi')) throw new ChybaVstupu('Chybí předchozí vydání.');
  if (telo.predchozi === null) return null;
  if (!jeUuid(telo.predchozi)) throw new ChybaVstupu('Předchozí vydání musí být dokument z knihovny.');
  return telo.predchozi.toLowerCase();
}

/** Popis dokumentu (název, autor…) — jen známá pole, nic dalšího do SQL nepustí. */
export function popisDokumentu(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Chybí popis dokumentu.');
  const p = v as Record<string, unknown>;
  const rok = p.rok;
  if (rok !== undefined && rok !== null && (typeof rok !== 'number' || !Number.isInteger(rok))) {
    throw new ChybaVstupu('Rok musí být celé číslo.');
  }
  const oblasti = p.oblasti ?? [];
  if (!Array.isArray(oblasti) || oblasti.length > 20 || oblasti.some((o) => typeof o !== 'string' || o.length > 2)) {
    throw new ChybaVstupu('Oblasti musí být seznam písmen A–T.');
  }
  return {
    nazev: text(p.nazev, 'Název', 500, true),
    autor: text(p.autor, 'Autor', 500),
    vydani: text(p.vydani, 'Vydání', 200),
    rok: rok ?? null,
    isbn: text(p.isbn, 'ISBN', 50),
    jazyk: text(p.jazyk, 'Jazyk', 10),
    druh: text(p.druh, 'Druh', 20),
    oblasti,
    zdroj: text(p.zdroj, 'Zdroj', 1000),
    licence: text(p.licence, 'Licence', 1000),
  };
}

/** Soubor ohlášený k nahrání. Typ a velikost hlídá i SQL a bucket. */
export function souborKNahrani(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Chybí údaje o souboru.');
  const s = v as Record<string, unknown>;
  const velikost = s.velikost;
  if (typeof velikost !== 'number' || !Number.isSafeInteger(velikost) || velikost < 1) {
    throw new ChybaVstupu('Chybí velikost souboru.');
  }
  const sha = text(s.sha256, 'Otisk souboru', 64, true) as string;
  if (!/^[0-9a-f]{64}$/.test(sha)) throw new ChybaVstupu('Otisk souboru musí být SHA-256.');
  const jmeno = text(s.jmeno, 'Jméno souboru v úložišti', 200, true) as string;
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(jmeno) || jmeno === '.' || jmeno === '..') {
    throw new ChybaVstupu('Neplatné jméno souboru v úložišti.');
  }
  return {
    soubor_nazev: text(s.nazev, 'Jméno souboru', 500, true),
    soubor_jmeno: jmeno,
    soubor_velikost: velikost,
    soubor_mime: text(s.mime, 'Typ souboru', 200, true),
    soubor_sha256: sha,
  };
}

export function stavDokumentu(v: unknown): 'ceka' | 'pozastaveno' {
  if (v !== 'ceka' && v !== 'pozastaveno') throw new ChybaVstupu('Ručně jde jen „zpracovat znovu" nebo „pozastavit".');
  return v;
}

/** Začátek období útraty (ISO čas), nejdál 10 let zpátky. */
export function zacatekObdobi(v: unknown, ted = new Date()): string {
  if (typeof v !== 'string' || v.length > 40) throw new ChybaVstupu('Chybí začátek období.');
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ChybaVstupu('Neplatný začátek období.');
  if (d.getTime() < ted.getTime() - 10 * 366 * 24 * 3600 * 1000 || d.getTime() > ted.getTime() + 24 * 3600 * 1000) {
    throw new ChybaVstupu('Začátek období je mimo rozsah.');
  }
  return d.toISOString();
}

export type ChybaDb = { code?: string; message?: string } | null | undefined;

const BEZ_MIGRACE = 'Databáze bible ještě nemá tabulky — spusť migraci v Systém → Databázové migrace → Databáze bible.';

/** Chyba databáze bible → HTTP status, kód a česká zpráva pro appku. */
export function prekladChybyDb(e: ChybaDb): { status: number; kod: string; zprava: string } {
  const code = e?.code ?? '';
  const zprava = (e?.message ?? '').slice(0, 300);
  if (['PGRST202', 'PGRST205', '42P01', '42883', '3F000'].includes(code)) return { status: 503, kod: 'bez_migrace', zprava: BEZ_MIGRACE };
  if (code === '42501') return { status: 403, kod: 'zakazano', zprava: zprava || 'Na tohle nemáš právo.' };
  if (code === 'P0002') return { status: 404, kod: 'nenalezeno', zprava: zprava || 'Záznam už v bibli není.' };
  if (code === '23505' && zprava.includes('bible_varky')) return { status: 409, kod: 'duplicita', zprava: 'Várka s tímhle číslem už v evidenci je.' };
  if (code === '23505') return { status: 409, kod: 'duplicita', zprava: 'Tenhle soubor už v knihovně je.' };
  if (code === '54000') return { status: 413, kod: 'velky_soubor', zprava: zprava || 'Soubor je příliš velký.' };
  if (['22023', '23514', '23502', '22P02', '22003', '22007', '22008'].includes(code)) {
    return { status: 400, kod: 'neplatny_vstup', zprava: zprava || 'Neplatné údaje.' };
  }
  return { status: 500, kod: 'chyba', zprava: `Databáze bible vrátila chybu${code ? ` (${code})` : ''}.` };
}

/** Klíč přehledu tématu (jako CHECK v bible_prehledy). */
export function klicPrehledu(v: unknown): string {
  if (typeof v !== 'string' || !/^[a-z0-9_]{1,40}$/.test(v)) throw new ChybaVstupu('Neznámé téma.');
  return v;
}

// --- Zkušenosti sládků (etapa 3b) -------------------------------------------

export const TYPY_ZKUSENOSTI = [
  'pripadova_studie', 'diskuse', 'rozhovor', 'postup', 'reseni_problemu', 'doporuceni_vyrobce', 'provozni_zkusenost',
] as const;

const OBLASTI = 'ABCDEFGHIJKLMNOPQRST';

function oblasti(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 20 || v.some((o) => typeof o !== 'string' || o.length !== 1 || !OBLASTI.includes(o))) {
    throw new ChybaVstupu('Oblasti musí být seznam písmen A–T.');
  }
  return [...new Set(v as string[])].sort();
}

function uroven(v: unknown): number {
  if (v === undefined || v === null) return 4;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) throw new ChybaVstupu('Úroveň důvěryhodnosti je číslo 1 až 5.');
  return v;
}

export function idZkusenosti(telo: Record<string, unknown>): string {
  if (!jeUuid(telo.id)) throw new ChybaVstupu('Chybí id zkušenosti.');
  return telo.id.toLowerCase();
}

/** Zkušenost sládka — jen známá pole; práva k úrovni a vlastnictví hlídá SQL. */
export function zkusenostVstup(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Chybí zkušenost.');
  const p = v as Record<string, unknown>;
  const typ = p.typ === undefined || p.typ === null ? 'provozni_zkusenost' : p.typ;
  if (typeof typ !== 'string' || !(TYPY_ZKUSENOSTI as readonly string[]).includes(typ)) throw new ChybaVstupu('Neznámý druh zkušenosti.');
  return {
    typ,
    nazev: text(p.nazev, 'Název', 200, true),
    text: text(p.text, 'Text', 8000, true),
    oblasti: oblasti(p.oblasti),
    uroven: uroven(p.uroven),
    zdroj: text(p.zdroj, 'Zdroj', 500),
  };
}

/** Hledání ve zkušenostech: dotaz je volitelný (bez něj nejnovější), filtry oblast a nejnižší důvěryhodnost. */
/**
 * Hledání ve zkušenostech sládků. `volne` (obrazovka Hledání v knihách): když
 * přesné hledání (všechna slova) nic nenajde, hledá se otázkou v běžné řeči
 * jako u knih a v nástroji AI sládka (bible_hledej_zkusenosti_volne).
 */
export function dotazZkusenosti(telo: Record<string, unknown>): { dotaz: string | null; oblast: string | null; nejhorsi: number; volne: boolean } {
  const d = telo.dotaz;
  let dotaz: string | null = null;
  if (d !== undefined && d !== null && d !== '') {
    if (typeof d !== 'string' || d.length > 200) throw new ChybaVstupu('Dotaz je moc dlouhý (nejvýš 200 znaků).');
    dotaz = d.trim() || null;
  }
  const o = telo.oblast;
  if (o !== undefined && o !== null && o !== '' && (typeof o !== 'string' || o.length !== 1 || !OBLASTI.includes(o))) {
    throw new ChybaVstupu('Oblast je písmeno A–T.');
  }
  const n = telo.nejhorsi;
  if (n !== undefined && n !== null && (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 5)) {
    throw new ChybaVstupu('Důvěryhodnost je číslo 1 až 5.');
  }
  return { dotaz, oblast: typeof o === 'string' && o ? o : null, nejhorsi: typeof n === 'number' ? n : 5, volne: telo.volne === true };
}

// --- Technologie pivovaru (etapa 7) -----------------------------------------

/** Id záznamu z těla požadavku (pivovar, zařízení, postup). */
/** Filtr hledání v knihách (etapa 4b): kniha, autor, rok od–do, jazyk, druh, oblast A–T. */
export type FiltrHledani = {
  dokument?: string; autor?: string; rok_od?: number; rok_do?: number; jazyk?: string; druh?: string; oblast?: string;
};

const JAZYKY_DOKUMENTU = ['cs', 'de', 'en', 'sk', 'jiny'];
const DRUHY_DOKUMENTU = ['kniha', 'skripta', 'clanek', 'norma', 'prirucka', 'poznamky', 'tabulky', 'jiny'];

/**
 * Filtr hledání z požadavku (objekt { autor, rok_od, … }, null = bez filtru).
 * Prázdné hodnoty se vynechají, neplatné odmítnou česky. Bez jediné hodnoty null.
 */
export function filtrHledani(v: unknown, dokument: string | null = null): FiltrHledani | null {
  if (v !== undefined && v !== null && (typeof v !== 'object' || Array.isArray(v))) throw new ChybaVstupu('Neplatný filtr hledání.');
  const o = (v ?? {}) as Record<string, unknown>;
  const f: FiltrHledani = {};
  const prazdne = (x: unknown) => x === undefined || x === null || (typeof x === 'string' && !x.trim());
  const dok = dokument ?? (prazdne(o.dokument) ? null : o.dokument);
  if (dok !== null) {
    if (!jeUuid(dok)) throw new ChybaVstupu('Neplatná kniha ve filtru.');
    f.dokument = dok.toLowerCase();
  }
  if (!prazdne(o.autor)) {
    if (typeof o.autor !== 'string' || o.autor.trim().length > 100) throw new ChybaVstupu('Autor ve filtru: 1–100 znaků.');
    f.autor = o.autor.trim();
  }
  for (const klic of ['rok_od', 'rok_do'] as const) {
    if (prazdne(o[klic])) continue;
    const rok = typeof o[klic] === 'number' ? o[klic] : typeof o[klic] === 'string' ? Number(o[klic]) : Number.NaN;
    if (!Number.isInteger(rok) || rok < 1400 || rok > 2100) throw new ChybaVstupu('Rok ve filtru musí být mezi 1400 a 2100.');
    f[klic] = rok;
  }
  if (f.rok_od !== undefined && f.rok_do !== undefined && f.rok_od > f.rok_do) throw new ChybaVstupu('Rok „od“ je až po roku „do“.');
  if (!prazdne(o.jazyk)) {
    if (typeof o.jazyk !== 'string' || !JAZYKY_DOKUMENTU.includes(o.jazyk)) throw new ChybaVstupu('Neznámý jazyk ve filtru.');
    f.jazyk = o.jazyk;
  }
  if (!prazdne(o.druh)) {
    if (typeof o.druh !== 'string' || !DRUHY_DOKUMENTU.includes(o.druh)) throw new ChybaVstupu('Neznámý druh dokumentu ve filtru.');
    f.druh = o.druh;
  }
  if (!prazdne(o.oblast)) {
    if (typeof o.oblast !== 'string' || !/^[A-T]$/.test(o.oblast)) throw new ChybaVstupu('Oblast ve filtru musí být A–T.');
    f.oblast = o.oblast;
  }
  return Object.keys(f).length > 0 ? f : null;
}

/** Filtr něčím víc než jen knihou (ten umí i hledání před migrací 20261111040000). */
export const filtrMimoKnihu = (f: FiltrHledani | null) => !!f && Object.keys(f).some((k) => k !== 'dokument');

/** Měsíční strop útraty za AI v USD (0 = AI sládek vypnutý), na centy. */
export function stropVstup(telo: Record<string, unknown>): number {
  const v = typeof telo.usd === 'number' ? telo.usd : typeof telo.usd === 'string' && telo.usd.trim() ? Number(telo.usd.replace(',', '.')) : Number.NaN;
  if (!Number.isFinite(v) || v < 0 || v > 1000) throw new ChybaVstupu('Strop je 0 až 1000 USD za měsíc.');
  return Math.round(v * 100) / 100;
}

export function idZaznamu(telo: Record<string, unknown>, co: string): string {
  if (!jeUuid(telo.id)) throw new ChybaVstupu(`Chybí id ${co}.`);
  return telo.id.toLowerCase();
}

/** Volitelný výběr pivovaru pro čtení profilu. */
export function vyberPivovaru(telo: Record<string, unknown>): string | null {
  const v = telo.pivovar_id;
  if (v === undefined || v === null || v === '') return null;
  if (!jeUuid(v)) throw new ChybaVstupu('Neplatné id pivovaru.');
  return v.toLowerCase();
}

function volitelneId(v: unknown, co: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (!jeUuid(v)) throw new ChybaVstupu(`Neplatné id ${co}.`);
  return v.toLowerCase();
}

export function pivovarVstup(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Chybí pivovar.');
  const p = v as Record<string, unknown>;
  if (p.hlavni !== undefined && typeof p.hlavni !== 'boolean') throw new ChybaVstupu('Hlavní pivovar je ano/ne.');
  const id = volitelneId(p.id, 'pivovaru');
  return {
    ...(id ? { id } : {}),
    nazev: text(p.nazev, 'Název pivovaru', 120, true)!.trim(),
    popis: text(p.popis, 'Popis provozu', 4000),
    hlavni: p.hlavni === true,
  };
}

const ID_DRUHU = DRUHY_ZARIZENI.map((d) => d.id) as readonly string[];
const ID_ZDROJU = ZDROJE_PARAMETRU.map((z) => z.id) as readonly string[];

/** Parametry zařízení: {nazev, hodnota (číslo) nebo text, jednotka, zdroj}. */
export function parametryVstup(v: unknown): Record<string, unknown>[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 40) throw new ChybaVstupu('Parametry musí být seznam (nejvýš 40).');
  return v.map((x, i) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new ChybaVstupu(`Parametr ${i + 1} musí mít název a hodnotu.`);
    const o = x as Record<string, unknown>;
    const nazev = text(o.nazev, `Název parametru ${i + 1}`, 80, true)!.trim();
    if (o.hodnota !== undefined && o.hodnota !== null && (typeof o.hodnota !== 'number' || !Number.isFinite(o.hodnota))) {
      throw new ChybaVstupu(`Hodnota parametru „${nazev}" musí být číslo.`);
    }
    const hodnota = typeof o.hodnota === 'number' ? o.hodnota : undefined;
    const t = text(o.text, `Text parametru „${nazev}"`, 200)?.trim() || undefined;
    if (hodnota === undefined && !t) throw new ChybaVstupu(`Parametr „${nazev}" nemá hodnotu.`);
    const jednotka = text(o.jednotka, `Jednotka parametru „${nazev}"`, 30)?.trim() || undefined;
    const zdroj = o.zdroj === undefined || o.zdroj === null || o.zdroj === '' ? 'odhad' : o.zdroj;
    if (typeof zdroj !== 'string' || !ID_ZDROJU.includes(zdroj)) throw new ChybaVstupu(`Neznámý zdroj parametru „${nazev}".`);
    return { nazev, ...(hodnota !== undefined ? { hodnota } : {}), ...(t ? { text: t } : {}), ...(jednotka ? { jednotka } : {}), zdroj };
  });
}

/** Zařízení; nové potřebuje pivovar_id (jen když `sPivovarem`). */
export function zarizeniVstup(v: unknown, sPivovarem = true): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Chybí zařízení.');
  const p = v as Record<string, unknown>;
  const id = volitelneId(p.id, 'zařízení');
  const pivovar = volitelneId(p.pivovar_id, 'pivovaru');
  if (sPivovarem && !id && !pivovar) throw new ChybaVstupu('Chybí pivovar.');
  if (typeof p.druh !== 'string' || !ID_DRUHU.includes(p.druh)) throw new ChybaVstupu('Neznámý druh zařízení.');
  const pocet = p.pocet === undefined || p.pocet === null ? 1 : p.pocet;
  if (typeof pocet !== 'number' || !Number.isInteger(pocet) || pocet < 1 || pocet > 999) throw new ChybaVstupu('Počet kusů je celé číslo 1 až 999.');
  return {
    ...(id ? { id } : {}),
    ...(pivovar && !id ? { pivovar_id: pivovar } : {}),
    druh: p.druh,
    nazev: text(p.nazev, 'Název zařízení', 120, true)!.trim(),
    pocet,
    parametry: parametryVstup(p.parametry),
    poznamka: text(p.poznamka, 'Poznámka', 2000),
  };
}

/** Převzetí víc zařízení najednou (tanky ze Sklepa). */
export function prevzetiVstup(telo: Record<string, unknown>): { pivovar: string; seznam: Record<string, unknown>[] } {
  if (!jeUuid(telo.pivovar_id)) throw new ChybaVstupu('Chybí pivovar.');
  if (!Array.isArray(telo.seznam) || telo.seznam.length === 0 || telo.seznam.length > 200) {
    throw new ChybaVstupu('Seznam zařízení je prázdný nebo moc dlouhý (nejvýš 200).');
  }
  return {
    pivovar: telo.pivovar_id.toLowerCase(),
    seznam: telo.seznam.map((z) => {
      const { id: _id, pivovar_id: _p, ...zbytek } = zarizeniVstup(z, false) as Record<string, unknown>;
      void _id; void _p;
      return zbytek;
    }),
  };
}

export function postupProvozuVstup(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Chybí postup.');
  const p = v as Record<string, unknown>;
  const id = volitelneId(p.id, 'postupu');
  const pivovar = volitelneId(p.pivovar_id, 'pivovaru');
  if (!id && !pivovar) throw new ChybaVstupu('Chybí pivovar.');
  const o = p.oblast;
  if (o !== undefined && o !== null && o !== '' && (typeof o !== 'string' || o.length !== 1 || !OBLASTI.includes(o))) {
    throw new ChybaVstupu('Oblast je písmeno A–T.');
  }
  return {
    ...(id ? { id } : {}),
    ...(pivovar && !id ? { pivovar_id: pivovar } : {}),
    nazev: text(p.nazev, 'Název postupu', 200, true)!.trim(),
    oblast: typeof o === 'string' && o ? o : null,
    kroky: text(p.kroky, 'Kroky postupu', 12000, true),
    zdroj: text(p.zdroj, 'Zdroj', 500),
  };
}

// --- Receptury a várky (etapa 8) ---------------------------------------------

/** Volitelné číslo v rozsahu (null = nezadáno). */
function cisloVRozsahu(v: unknown, co: string, min: number, max: number): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ChybaVstupu(`${co} musí být číslo.`);
  if (v < min || v > max) throw new ChybaVstupu(`${co} je mimo rozsah ${String(min).replace('.', ',')} až ${String(max).replace('.', ',')}.`);
  return v;
}

const ID_SUROVIN = DRUHY_SUROVIN.map((d) => d.id) as readonly string[];
const ID_FAZI = FAZE_KROKU.map((f) => f.id) as readonly string[];

function surovinyVstup(v: unknown): Record<string, unknown>[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 60) throw new ChybaVstupu('Suroviny musí být seznam (nejvýš 60).');
  return v.map((x, i) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new ChybaVstupu(`Surovina ${i + 1} musí mít druh a název.`);
    const o = x as Record<string, unknown>;
    if (typeof o.druh !== 'string' || !ID_SUROVIN.includes(o.druh)) throw new ChybaVstupu(`Neznámý druh suroviny ${i + 1}.`);
    const nazev = text(o.nazev, `Název suroviny ${i + 1}`, 120, true)!.trim();
    const mnozstvi = o.mnozstvi === undefined || o.mnozstvi === null ? null : o.mnozstvi;
    if (mnozstvi !== null && (typeof mnozstvi !== 'number' || !Number.isFinite(mnozstvi) || mnozstvi <= 0 || mnozstvi > 1000000)) {
      throw new ChybaVstupu(`Množství suroviny „${nazev}" musí být kladné číslo.`);
    }
    const jednotka = text(o.jednotka, `Jednotka suroviny „${nazev}"`, 20)?.trim() || undefined;
    const kdy = text(o.kdy, `Kdy (surovina „${nazev}")`, 60)?.trim() || undefined;
    const poznamka = text(o.poznamka, `Poznámka suroviny „${nazev}"`, 200)?.trim() || undefined;
    return { druh: o.druh, nazev, ...(mnozstvi !== null ? { mnozstvi } : {}), ...(jednotka ? { jednotka } : {}), ...(kdy ? { kdy } : {}), ...(poznamka ? { poznamka } : {}) };
  });
}

function krokyVstup(v: unknown): Record<string, unknown>[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 40) throw new ChybaVstupu('Kroky musí být seznam (nejvýš 40).');
  return v.map((x, i) => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw new ChybaVstupu(`Krok ${i + 1} musí mít fázi a název.`);
    const o = x as Record<string, unknown>;
    if (typeof o.faze !== 'string' || !ID_FAZI.includes(o.faze)) throw new ChybaVstupu(`Neznámá fáze kroku ${i + 1}.`);
    const nazev = text(o.nazev, `Název kroku ${i + 1}`, 120, true)!.trim();
    const teplota = cisloVRozsahu(o.teplota_c, `Teplota kroku „${nazev}"`, -5, 110);
    const minut = cisloVRozsahu(o.minut, `Délka kroku „${nazev}"`, 0, 100000);
    const poznamka = text(o.poznamka, `Poznámka kroku „${nazev}"`, 200)?.trim() || undefined;
    return { faze: o.faze, nazev, ...(teplota !== null ? { teplota_c: teplota } : {}), ...(minut !== null ? { minut } : {}), ...(poznamka ? { poznamka } : {}) };
  });
}

export function recepturaVstup(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Chybí receptura.');
  const p = v as Record<string, unknown>;
  const id = volitelneId(p.id, 'receptury');
  const pivovar = volitelneId(p.pivovar_id, 'pivovaru');
  return {
    ...(id ? { id } : {}),
    pivovar_id: pivovar ?? null,
    nazev: text(p.nazev, 'Název receptury', 120, true)!.trim(),
    styl: text(p.styl, 'Styl', 120)?.trim() || null,
    cil_objem_hl: cisloVRozsahu(p.cil_objem_hl, 'Cílový objem', 0.01, 2000),
    cil_stupnovitost: cisloVRozsahu(p.cil_stupnovitost, 'Cílová stupňovitost', 1, 35),
    cil_alkohol: cisloVRozsahu(p.cil_alkohol, 'Cílový alkohol', 0, 20),
    cil_ibu: cisloVRozsahu(p.cil_ibu, 'Cílová hořkost', 0, 200),
    cil_barva_ebc: cisloVRozsahu(p.cil_barva_ebc, 'Cílová barva', 0, 300),
    suroviny: surovinyVstup(p.suroviny),
    kroky: krokyVstup(p.kroky),
    poznamka: text(p.poznamka, 'Poznámka', 4000)?.trim() || null,
  };
}

/** Hodnoty várky {klíč: číslo} podle katalogu; null = nezapsáno (vynechá se). */
export function hodnotyVarkyVstup(v: unknown): Record<string, number> {
  if (v === undefined || v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Hodnoty várky musí být objekt {klíč: číslo}.');
  const out: Record<string, number> = {};
  for (const [klic, hodnota] of Object.entries(v as Record<string, unknown>)) {
    const k = HODNOTY_VARKY.find((h) => h.klic === klic);
    if (!k) throw new ChybaVstupu(`Neznámá hodnota várky „${klic.slice(0, 60)}".`);
    if (hodnota === null || hodnota === undefined) continue;
    const n = cisloVRozsahu(hodnota, k.nazev, k.min, k.max)!;
    if (k.cele && !Number.isInteger(n)) throw new ChybaVstupu(`${k.nazev} musí být celé číslo.`);
    out[klic] = n;
  }
  return out;
}

/** Datum ve tvaru RRRR-MM-DD, skutečný den, 1990–2100. */
export function datumVstup(v: unknown, co: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ChybaVstupu(`${co} chybí nebo není datum.`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new ChybaVstupu(`${co} není platné datum.`);
  if (v < '1990-01-01' || v > '2100-12-31') throw new ChybaVstupu(`${co} je mimo rozsah.`);
  return v;
}

export function varkaVstup(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Chybí várka.');
  const p = v as Record<string, unknown>;
  const id = volitelneId(p.id, 'várky');
  return {
    ...(id ? { id } : {}),
    pivovar_id: volitelneId(p.pivovar_id, 'pivovaru') ?? null,
    receptura_id: volitelneId(p.receptura_id, 'receptury') ?? null,
    cislo: text(p.cislo, 'Číslo várky', 40)?.trim() || null,
    pivo: text(p.pivo, 'Pivo', 120, true)!.trim(),
    datum_varu: datumVstup(p.datum_varu, 'Datum varu'),
    hodnoty: hodnotyVarkyVstup(p.hodnoty),
    poznamka: text(p.poznamka, 'Poznámka', 4000)?.trim() || null,
  };
}

// --- Rešerše z internetu (etapa 9) a analýza problémů (etapa 10) ------------

/** Adresa webového zdroje: http(s), bez mezer, nejvýš 2000 znaků. */
export function urlVstup(v: unknown): string {
  if (typeof v !== 'string') throw new ChybaVstupu('Chybí adresa zdroje.');
  const url = v.trim();
  if (url.length > 2000 || !/^https?:\/\/[^\s]+$/i.test(url)) throw new ChybaVstupu('Adresa zdroje musí začínat http:// nebo https:// a nesmí mít mezery.');
  try {
    const u = new URL(url);
    if (!u.hostname.includes('.')) throw new Error('host');
  } catch {
    throw new ChybaVstupu('Adresa zdroje není platná webová adresa.');
  }
  return url;
}

export function webZdrojVstup(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Chybí zdroj.');
  const p = v as Record<string, unknown>;
  const id = volitelneId(p.id, 'zdroje');
  const duvera = p.duvera === undefined || p.duvera === null ? 5 : p.duvera;
  if (typeof duvera !== 'number' || !Number.isInteger(duvera) || duvera < 1 || duvera > 5) throw new ChybaVstupu('Důvěra je celé číslo 1 až 5.');
  const datumPublikace = p.datum_publikace === undefined || p.datum_publikace === null || p.datum_publikace === ''
    ? null : datumVstup(p.datum_publikace, 'Datum publikace');
  return {
    ...(id ? { id } : {}),
    url: urlVstup(p.url),
    titulek: text(p.titulek, 'Titulek', 300, true)!.trim(),
    vydavatel: text(p.vydavatel, 'Vydavatel', 200)?.trim() || null,
    datum_publikace: datumPublikace,
    shrnuti: text(p.shrnuti, 'Shrnutí', 4000, true)!.trim(),
    oblasti: oblasti(p.oblasti),
    duvera,
  };
}

const ID_STAVU_WEBU = STAVY_WEBU.map((x) => x.id) as readonly string[];

export function overeniVstup(telo: Record<string, unknown>): { id: string; stav: string; poznamka: string | null } {
  if (typeof telo.stav !== 'string' || !ID_STAVU_WEBU.includes(telo.stav)) throw new ChybaVstupu('Neznámý stav zdroje.');
  return { id: idZaznamu(telo, 'zdroje'), stav: telo.stav, poznamka: text(telo.poznamka, 'Poznámka k ověření', 1000)?.trim() || null };
}

const ID_STAVU_PROBLEMU = STAVY_PROBLEMU.map((x) => x.id) as readonly string[];
const ID_TYPU_ZJISTENI = TYPY_ZJISTENI.map((x) => x.id) as readonly string[];
const ID_STAVU_ZJISTENI = STAVY_ZJISTENI.map((x) => x.id) as readonly string[];

export function problemVstup(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Chybí problém.');
  const p = v as Record<string, unknown>;
  const id = volitelneId(p.id, 'problému');
  const stav = p.stav === undefined || p.stav === null || p.stav === '' ? 'otevreny' : p.stav;
  if (typeof stav !== 'string' || !ID_STAVU_PROBLEMU.includes(stav)) throw new ChybaVstupu('Neznámý stav problému.');
  const varky = p.varky === undefined || p.varky === null ? [] : p.varky;
  if (!Array.isArray(varky) || varky.length > 12 || varky.some((x) => !jeUuid(x))) throw new ChybaVstupu('Dotčené várky jsou seznam nejvýš 12 id várek.');
  return {
    ...(id ? { id } : {}),
    nazev: text(p.nazev, 'Název problému', 200, true)!.trim(),
    popis: text(p.popis, 'Příznaky', 4000)?.trim() || null,
    pivo: text(p.pivo, 'Pivo', 120)?.trim() || null,
    varky: [...new Set((varky as string[]).map((x) => x.toLowerCase()))],
    oblasti: oblasti(p.oblasti),
    stav,
    reseni: text(p.reseni, 'Řešení', 4000)?.trim() || null,
  };
}

export function zjisteniVstup(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ChybaVstupu('Chybí zjištění.');
  const p = v as Record<string, unknown>;
  if (!jeUuid(p.problem_id)) throw new ChybaVstupu('Chybí problém.');
  if (typeof p.typ !== 'string' || !ID_TYPU_ZJISTENI.includes(p.typ)) {
    throw new ChybaVstupu('Typ zjištění je fakt, vypocet, zkusenost, doporuceni, hypoteza nebo chybi.');
  }
  const zdroj = text(p.zdroj, 'Zdroj', 500)?.trim() || null;
  if ((p.typ === 'fakt' || p.typ === 'vypocet') && !zdroj) throw new ChybaVstupu('Fakt a výpočet potřebují zdroj (kniha a strana, várka, výpočet…).');
  return { problem_id: p.problem_id.toLowerCase(), typ: p.typ, text: text(p.text, 'Text zjištění', 2000, true)!.trim(), zdroj };
}

export function stavZjisteniVstup(telo: Record<string, unknown>): { id: string; stav: string } {
  if (typeof telo.stav !== 'string' || !ID_STAVU_ZJISTENI.includes(telo.stav)) throw new ChybaVstupu('Neznámý stav zjištění.');
  return { id: idZaznamu(telo, 'zjištění'), stav: telo.stav };
}
