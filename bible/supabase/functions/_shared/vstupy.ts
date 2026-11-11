// 📥 bible-api: akce, kontrola vstupů a překlad chyb databáze.
// ---------------------------------------------------------------------------
// Čisté funkce bez sítě a bez Dena (testy: vstupy.test.ts). Práva hlídají
// dvakrát: tady podle úrovně přístupu z hlavního projektu a znovu v SQL
// funkcích projektu bible (bible/supabase/migrations), které jediné zapisují.
import { jeUuid, type Pristup } from './brana.ts';
import { DRUHY_ZARIZENI, ZDROJE_PARAMETRU } from './technologie-popisy.ts';

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
export function dotazZkusenosti(telo: Record<string, unknown>): { dotaz: string | null; oblast: string | null; nejhorsi: number } {
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
  return { dotaz, oblast: typeof o === 'string' && o ? o : null, nejhorsi: typeof n === 'number' ? n : 5 };
}

// --- Technologie pivovaru (etapa 7) -----------------------------------------

/** Id záznamu z těla požadavku (pivovar, zařízení, postup). */
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
