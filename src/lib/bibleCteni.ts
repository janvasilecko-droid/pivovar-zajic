// 📖 Čtečka knihy (etapa 3a) — čisté funkce: trasa, označení místa v knize,
// rejstřík listů a strom kapitol. Testy: bibleCteni.test.ts.
// ---------------------------------------------------------------------------
// Místo v knize se označuje podle toho, co o něm víme jistě (zásada 1 návrhu):
// s tištěným číslem „s. 158", jinak „list 170" (pořadí v souboru), u DOCX,
// EPUB, TXT a tabulek „část 3". Tištěné číslo je text (i římské, „A-3") a
// může se v knize opakovat (úvod, přílohy) — hledání bere první výskyt.
import type { ZdrojTextu } from './bibleText';

export type KapitolaKnihy = {
  id: string;
  rodic_id: string | null;
  poradi: number;
  uroven: number;
  cislo: string | null;
  nazev: string;
  /** Rozsah v listech souboru (pdf_index), ne v tištěných stranách. */
  strana_od: number | null;
  strana_do: number | null;
};

export type ListKnihy = { pdfIndex: number; tistena: string | null; zdroj: ZdrojTextu; keKontrole: boolean };

export const ZDROJ_POPIS: Readonly<Record<ZdrojTextu, string>> = {
  vrstva: 'textová vrstva PDF',
  ocr: 'přepis skenu (AI)',
  soubor: 'text ze souboru',
};

const ZDROJ_ZKRATKA: Readonly<Record<string, ZdrojTextu>> = { v: 'vrstva', o: 'ocr', s: 'soubor' };

/** Kompaktní rejstřík z bible-api ([pdf_index, tištěná strana, zdroj, ke kontrole]) → listy. Vadné řádky vynechá. */
export function listyZRejstriku(v: unknown): ListKnihy[] {
  if (!Array.isArray(v)) return [];
  const listy: ListKnihy[] = [];
  for (const r of v) {
    if (!Array.isArray(r) || typeof r[0] !== 'number' || !Number.isInteger(r[0]) || r[0] < 1) continue;
    listy.push({
      pdfIndex: r[0],
      tistena: typeof r[1] === 'string' && r[1].trim() ? r[1].trim() : null,
      zdroj: ZDROJ_ZKRATKA[String(r[2])] ?? 'vrstva',
      keKontrole: r[3] === 1 || r[3] === true,
    });
  }
  return listy.sort((a, b) => a.pdfIndex - b.pdfIndex);
}

/** „s. 158", jinak „list 170", u souborů bez stran „část 3". */
export function oznaceniListu(list: Pick<ListKnihy, 'tistena' | 'zdroj'> | null | undefined, pdfIndex: number): string {
  if (list?.tistena) return `s. ${list.tistena}`;
  return list?.zdroj === 'soubor' ? `část ${pdfIndex}` : `list ${pdfIndex}`;
}

/** Trasa čtečky v pageSubTab: 'kniha:<uuid>' nebo 'kniha:<uuid>:<list>'. */
export function cestaKnihy(id: string, list?: number | null): string {
  return list && list > 0 ? `kniha:${id}:${list}` : `kniha:${id}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rozeberCestuKnihy(sub: string | null | undefined): { id: string; list: number | null } | null {
  if (!sub || !sub.startsWith('kniha:')) return null;
  const [, id, list] = sub.split(':');
  if (!id || !UUID.test(id)) return null;
  const n = list !== undefined && /^\d{1,7}$/.test(list) ? Number(list) : null;
  return { id: id.toLowerCase(), list: n && n > 0 ? n : null };
}

/** Sousední list v rejstříku (směr −1 / +1); null = na kraji knihy. */
export function sousedniList(listy: readonly ListKnihy[], pdfIndex: number, smer: -1 | 1): number | null {
  const i = listy.findIndex((l) => l.pdfIndex === pdfIndex);
  if (i < 0) {
    // List mimo rejstřík: nejbližší ve směru.
    const dalsi = smer > 0 ? listy.find((l) => l.pdfIndex > pdfIndex) : [...listy].reverse().find((l) => l.pdfIndex < pdfIndex);
    return dalsi?.pdfIndex ?? null;
  }
  return listy[i + smer]?.pdfIndex ?? null;
}

/**
 * List podle zadané strany: nejdřív tištěné číslo (bez ohledu na velikost
 * písmen, první výskyt), u čísla bez tištěné shody pořadí listu v souboru.
 */
export function najdiList(listy: readonly ListKnihy[], dotaz: string): ListKnihy | null {
  const d = dotaz.trim().replace(/^s\.\s*/i, '');
  if (!d) return null;
  const tistena = listy.find((l) => l.tistena !== null && l.tistena.toLowerCase() === d.toLowerCase());
  if (tistena) return tistena;
  if (/^\d{1,7}$/.test(d)) return listy.find((l) => l.pdfIndex === Number(d)) ?? null;
  return null;
}

/** Kapitoly v pořadí knihy s hloubkou pro odsazení (nejvýš 3 úrovně, ať se vejde na telefon). */
export function kapitolyProObsah(kapitoly: readonly KapitolaKnihy[]): (KapitolaKnihy & { odsazeni: 0 | 1 | 2 })[] {
  return [...kapitoly]
    .sort((a, b) => a.poradi - b.poradi)
    .map((k) => ({ ...k, odsazeni: Math.min(2, Math.max(0, (k.uroven || 1) - 1)) as 0 | 1 | 2 }));
}

/** Kapitola, ve které list leží (poslední začatá do něj včetně). */
export function kapitolaListu(kapitoly: readonly KapitolaKnihy[], pdfIndex: number): KapitolaKnihy | null {
  let nalezena: KapitolaKnihy | null = null;
  for (const k of [...kapitoly].sort((a, b) => a.poradi - b.poradi)) {
    if (k.strana_od !== null && k.strana_od <= pdfIndex && (k.strana_do === null || k.strana_do >= pdfIndex)) nalezena = k;
  }
  return nalezena;
}
