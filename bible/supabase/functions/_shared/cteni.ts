// 📖 bible-api: čtení zpracované knihy (etapa 3a) — čisté funkce bez sítě a bez Dena.
// ---------------------------------------------------------------------------
// Kapitoly, strany a pasáže zapisuje worker po částech (bez transakce), takže
// číst se smí jen dokument ve stavu hotovo / ke_kontrole — jinak můžou být
// data napůl smazaná nebo napůl zapsaná. Obsah knih nesmí do logu (repo je
// veřejné) a jeden požadavek vydá jen pár listů (žádný export celé knihy).
// Testy: cteni.test.ts.
import { ChybaVstupu } from './vstupy.ts';

/** Stavy, ve kterých jsou kapitoly, strany i pasáže kompletní (stejně jako jeZpracovany v appce). */
export const CITELNE_STAVY: readonly string[] = ['hotovo', 'ke_kontrole'];

export const jeCitelny = (stav: unknown): boolean => typeof stav === 'string' && CITELNE_STAVY.includes(stav);

/** Česká zpráva, proč kniha ještě nejde číst (kód 'nezpracovano'). */
export function zpravaNezpracovano(stav: unknown): string {
  switch (stav) {
    case 'nahrava': return 'Kniha se ještě nahrává — číst půjde, až bude nahraná a zpracovaná.';
    case 'ceka': return 'Kniha čeká na zpracování — číst půjde, až zpracování doběhne.';
    case 'zpracovava': return 'Kniha se právě zpracovává — číst půjde, až zpracování doběhne.';
    case 'chyba': return 'Knihu se nepodařilo zpracovat — důvod je u ní v knihovně.';
    case 'pozastaveno': return 'Zpracování knihy je pozastavené — v knihovně ho jde pustit znovu.';
    default: return 'Kniha ještě není zpracovaná.';
  }
}

/** Nejvýš tolik listů vydá jeden požadavek na čtení (a míň, když jsou husté). */
export const MAX_LISTU_NA_DOTAZ = 3;
/** Strop znaků textu v jedné odpovědi — vždy ale aspoň jeden celý list. */
export const MAX_ZNAKU_ODPOVEDI = 150_000;
/** PostgREST vrací nejvýš 1000 řádků na dotaz — rejstříky se čtou po stránkách. */
export const STRANKA_DB = 1000;
/** Pojistka stránkování (kniha s víc listy nebo kapitolami neexistuje). */
export const MAX_RADKU = 20_000;
/** Tabulek, vzorců a popisků na jeden požadavek (další po „Načíst další"). */
export const OBJEKTU_NA_DOTAZ = 100;
/** Kolik znaků z tabulky nebo vzorce ukáže přehled (celé jsou na stránce). */
export const NAHLED_ZNAKU = 300;

export type DruhObjektu = 'tabulka' | 'vzorec' | 'popisek';
export const DRUHY_OBJEKTU: readonly DruhObjektu[] = ['tabulka', 'vzorec', 'popisek'];

export function celeCislo(v: unknown, jmeno: string, min: number, max: number, vychozi?: number): number {
  if ((v === undefined || v === null) && vychozi !== undefined) return vychozi;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new ChybaVstupu(`${jmeno} musí být celé číslo.`);
  if (v < min || v > max) throw new ChybaVstupu(`${jmeno} musí být ${min}–${max}.`);
  return v;
}

/** Druh objektu pro přehled; nic = tabulky, vzorce i popisky. */
export function druhObjektu(v: unknown): DruhObjektu | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' && (DRUHY_OBJEKTU as readonly string[]).includes(v)) return v as DruhObjektu;
  throw new ChybaVstupu('Druh musí být tabulka, vzorec nebo popisek.');
}

/** Listy pod strop znaků — vždy aspoň jeden celý, žádný se nezkracuje (zbytek si appka vyžádá). */
export function listyPodStropem<T extends { text?: string | null }>(listy: T[], maxZnaku = MAX_ZNAKU_ODPOVEDI): T[] {
  const vysledek: T[] = [];
  let znaku = 0;
  for (const l of listy) {
    const delka = (l.text ?? '').length;
    if (vysledek.length > 0 && znaku + delka > maxZnaku) break;
    vysledek.push(l);
    znaku += delka;
  }
  return vysledek;
}

/** Začátek textu pro přehled tabulek a vzorců (bez rozpůleného znaku na konci). */
export function nahled(text: string | null | undefined, max = NAHLED_ZNAKU): string {
  const t = (text ?? '').trim();
  if (t.length <= max) return t;
  const znaky = Array.from(t);
  return znaky.length <= max ? t : `${znaky.slice(0, max).join('').trimEnd()}…`;
}

/** Kompaktní rejstřík listů: [pdf_index, tištěná strana, zdroj textu ('v' vrstva, 'o' OCR, 's' soubor), ke kontrole]. */
export type RadekRejstriku = [number, string | null, 'v' | 'o' | 's', 0 | 1];

const ZKRATKA_ZDROJE: Record<string, 'v' | 'o' | 's'> = { vrstva: 'v', ocr: 'o', soubor: 's' };

export function rejstrikListu(radky: readonly {
  pdf_index: number; tistena_strana: string | null; zdroj_textu: string; ke_kontrole: boolean | null;
}[]): RadekRejstriku[] {
  return radky.map((r) => [r.pdf_index, r.tistena_strana ?? null, ZKRATKA_ZDROJE[r.zdroj_textu] ?? 'v', r.ke_kontrole ? 1 : 0]);
}

/**
 * Všechny řádky dotazu po stránkách (PostgREST jich vrátí nejvýš 1000 najednou).
 * `stranka(od, do)` = stejný dotaz s .range(od, do) a pevným řazením.
 */
export async function vsechnyRadky<T>(
  stranka: (od: number, do_: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  max = MAX_RADKU,
): Promise<{ data: T[]; error: unknown }> {
  const data: T[] = [];
  for (let od = 0; od < max; od += STRANKA_DB) {
    const { data: kus, error } = await stranka(od, Math.min(od + STRANKA_DB, max) - 1);
    if (error) return { data, error };
    const radky = kus ?? [];
    data.push(...radky);
    if (radky.length < STRANKA_DB) break;
  }
  return { data, error: null };
}
