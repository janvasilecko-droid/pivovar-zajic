// 📥 bible-api: akce, kontrola vstupů a překlad chyb databáze.
// ---------------------------------------------------------------------------
// Čisté funkce bez sítě a bez Dena (testy: vstupy.test.ts). Práva hlídají
// dvakrát: tady podle úrovně přístupu z hlavního projektu a znovu v SQL
// funkcích projektu bible (bible/supabase/migrations), které jediné zapisují.
import { jeUuid, type Pristup } from './brana.ts';

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
  if (code === '23505') return { status: 409, kod: 'duplicita', zprava: 'Tenhle soubor už v knihovně je.' };
  if (code === '54000') return { status: 413, kod: 'velky_soubor', zprava: zprava || 'Soubor je příliš velký.' };
  if (['22023', '23514', '23502', '22P02', '22003', '22007', '22008'].includes(code)) {
    return { status: 400, kod: 'neplatny_vstup', zprava: zprava || 'Neplatné údaje.' };
  }
  return { status: 500, kod: 'chyba', zprava: `Databáze bible vrátila chybu${code ? ` (${code})` : ''}.` };
}
