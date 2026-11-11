// 📅 Konkrétní datum a „zítra / pozítří / dnes" ze zprávy s objednávkou.
// ---------------------------------------------------------------------------
// Z provozu 6. 11. 2026: „Na 13 .11.30l 12sv, děkuji" — appka datum nepřečetla
// (za „13 .11." hned bez mezery pokračuje „30l", a to staré pravidlo za datem
// nepovolilo číslici) a kontrola čtení si z „.11.30l" udělala objem 11,30 l.
// Majitel: „aplikace tohle musí umět přečíst a přiřadit na daný den".
//
// Dřív měly appka (src/lib/orderDates.ts) a server (whatsapp-auto-parse) každý
// vlastní kopii pravidla — teď je jedno tady a obě strany i kontrola čtení
// (src/lib/whatsappReadback.ts) říkají totéž. Názvy dnů a „příští týden" jsou
// v ./den-zavozu.ts.
//
// Soubor je záměrně bez závislostí mimo ./den-zavozu.ts: běží v Deno (edge
// funkce) i v prohlížeči a ve vitestu.
import { KODY_DNU, datumPraha } from './den-zavozu.ts';

export type DatumZpravy = {
  /** YYYY-MM-DD */
  datum: string;
  /** Den v týdnu: po…ne */
  den: string;
  /** Pro poznámku: „13.11." */
  zobrazeni: string;
  /** Přesný text ve zprávě („13 .11.") */
  nalezeno: string;
  /** Pozice nalezeného textu ve zprávě (od včetně, do vyjma). */
  od: number;
  do: number;
};

const DEN_MS = 86_400_000;

/** Měsíc podle slova bez diakritiky: „listopadu", „listopad", „lis." → 11. */
const MESICE: [RegExp, number][] = [
  [/^led(?:en|na|nu)?$/, 1],
  [/^uno(?:r|ra|ru)?$/, 2],
  [/^bre(?:zen|zna|znu)?$/, 3],
  [/^dub(?:en|na|nu)?$/, 4],
  [/^kve(?:ten|tna|tnu)?$/, 5],
  [/^cerv(?:en|na|nu)$/, 6],
  [/^cerven(?:ec|ce|ci)$/, 7],
  [/^srp(?:en|na|nu)?$/, 8],
  [/^zar(?:i)?$/, 9],
  [/^rij(?:en|na|nu)?$/, 10],
  [/^lis(?:topad|topadu)?$/, 11],
  [/^pro(?:sinec|since|sinci)?$/, 12],
];

const bezDiakritiky = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function mesicZeSlova(slovo: string): number | null {
  const s = bezDiakritiky(slovo).replace(/\.$/, '');
  for (const [re, m] of MESICE) if (re.test(s)) return m;
  return null;
}

const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Sestaví datum; bez roku podle dneška: datum víc než 60 dní zpátky je příští
 * rok (v prosinci „na 5.1."), datum víc než 300 dní dopředu loni (v lednu
 * zpráva „na 30.12."). Pár dní zpátky zůstane letos — v okně je pak vidět,
 * že je datum v minulosti, místo aby objednávka tiše odjela o rok.
 */
function sestav(den: number, mesic: number, rok: number | null, dnes: string): string | null {
  if (den < 1 || den > 31 || mesic < 1 || mesic > 12) return null;
  let r = rok ?? Number(dnes.slice(0, 4));
  if (rok === null) {
    const rozdil = (Date.UTC(r, mesic - 1, den) - utc(dnes)) / DEN_MS;
    if (rozdil < -60) r += 1;
    else if (rozdil > 300) r -= 1;
  }
  const d = new Date(Date.UTC(r, mesic - 1, den));
  if (d.getUTCFullYear() !== r || d.getUTCMonth() !== mesic - 1 || d.getUTCDate() !== den) return null;
  return iso(d.getTime());
}

// Za číslem jednotka = množství / objem / stupeň, ne datum: „1.5l", „12.5°", „2.5 x".
const JEDNOTKA_ZA = /^\s*(?:l(?![a-zá-ž])|l\.|lit|hl\b|keg|sud|x\s*\d|×|\*\s*\d|ks\b|kus|°|sv\b|st\b|blg|%|k[čc]|kč)/i;
// Před číslem „2x" (množství) nebo cena — taky ne datum.
const PRED_NE_DATUM = /(?:\d+\s*[x×*]\s*|cena\s*:?\s*|k[čc]\s*)$/i;
// „v 10.30", „kolem 10.15" — čas, ne datum.
const PRED_CAS = /(?:^|[^\p{L}])(?:v|o|kolem|okolo|cca)\s*$/iu;
// Holé „13.11" (bez tečky na konci) se bere jen za předložkou nebo názvem dne,
// ať se z „Jantar 1.5 6ks" nestane 1. května.
const PRED_DATUM_BEZ_TECKY = /(?:^|[^\p{L}])(?:na|do|dne|ke?|pro|zavoz\w*|term[ií]n\w*|datum\w*|pond[eě]l[ií]|[uú]ter[yý]|st[rř]ed[auy]|[cč]tvrtek|p[aá]tek|sobot[auy]|ned[eě]l[ei])\s*,?\s*$/iu;

type Kandidat = { den: number; mesic: number; rok: number | null; kratkyRok: boolean; od: number; do: number; text: string };

function kandidati(text: string): Kandidat[] {
  const out: Kandidat[] = [];
  const pridej = (m: RegExpMatchArray, den: string, mesic: number, rok: number | null, kratkyRok = false) => {
    const od = m.index ?? 0;
    const textOrez = m[0].trimEnd();
    out.push({ den: Number(den), mesic, rok, kratkyRok, od, do: od + textOrez.length, text: textOrez });
  };

  // 1) S rokem: „13.11.2026", „13. 11. 2026"
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})(?![\d.]|,\d)/g)) {
    pridej(m, m[1], Number(m[2]), Number(m[3]));
  }
  // 2) S tečkou na konci: „13.11.", „13 .11.", „13. 11." — i když hned za ním
  //    bez mezery pokračuje množství („13 .11.30l", „13.11.2x30").
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,2})\s*\.\s*(\d{1,2})\s*\.(?=\s|$|,(?!\d)|[^\d.,]|\d+\s*(?:l(?![a-zá-ž])|lit|x|×|\*|ks\b|keg|sud))/g)) {
    pridej(m, m[1], Number(m[2]), null);
  }
  // 3) Dvoumístný rok: „13.11.26" — jen letošní nebo příští rok a ne objem („13.11.30l" je 30 l).
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{2})(?![\d.]|,\d)/g)) {
    const za = text.slice((m.index ?? 0) + m[0].length);
    if (JEDNOTKA_ZA.test(za) || /^[a-zá-ž]/i.test(za)) continue;
    pridej(m, m[1], Number(m[2]), 2000 + Number(m[3]), true);
  }
  // 4) Bez tečky na konci: „na 13.11 2x30" — jen za předložkou nebo dnem.
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,2})\s*\.\s*(\d{1,2})(?![\d.]|,\d)/g)) {
    const od = m.index ?? 0;
    const pred = text.slice(Math.max(0, od - 24), od);
    const za = text.slice(od + m[0].length);
    if (JEDNOTKA_ZA.test(za) || PRED_NE_DATUM.test(pred) || PRED_CAS.test(pred)) continue;
    if (!PRED_DATUM_BEZ_TECKY.test(pred)) continue;
    pridej(m, m[1], Number(m[2]), null);
  }
  // 5) Název měsíce: „13. listopadu", „13 listopadu", „13.listopad"
  for (const m of text.matchAll(/(?<![\d.,])(\d{1,2})\s*\.?\s*(\p{L}{3,9}\.?)(?:\s+(\d{4}))?(?!\p{L})/gu)) {
    const mesic = mesicZeSlova(m[2]);
    if (!mesic) continue;
    // Zkratky („lis.") jen s tečkou za dnem, ať „3 pro" (3 kusy pro…) není prosinec.
    if (bezDiakritiky(m[2]).replace(/\.$/, '').length <= 3 && !/\d\s*\./.test(m[0])) continue;
    pridej(m, m[1], mesic, m[3] ? Number(m[3]) : null);
  }
  // 6) Lomítko: „13/11", „13/11/2026" — ne „1/2 sudu", „1/2 l".
  for (const m of text.matchAll(/(?<![\d./])(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{4}|\d{2}))?(?![\d./])/g)) {
    const za = text.slice((m.index ?? 0) + m[0].length);
    if (JEDNOTKA_ZA.test(za) || /^\s*(?:sud|keg|hl|l\b|lit|piv)/i.test(za)) continue;
    const rok = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    pridej(m, m[1], Number(m[2]), rok, m[3]?.length === 2);
  }
  return out;
}

/**
 * Konkrétní datum ve zprávě (první platné podle pořadí ve zprávě), nebo null.
 * `dnes` (YYYY-MM-DD) slouží k doplnění roku — u zprávy datum, kdy přišla.
 */
export function datumZeZpravy(text: string | null | undefined, dnes: string = datumPraha()): DatumZpravy | null {
  if (!text) return null;
  const vse = kandidati(text).sort((a, b) => a.od - b.od || b.text.length - a.text.length);
  const letos = Number(dnes.slice(0, 4));
  for (const k of vse) {
    // Dvoumístný rok jen letošní nebo příští („13.11.26"), jinak to bývá něco jiného.
    if (k.kratkyRok && k.rok !== null && (k.rok < letos || k.rok > letos + 1)) continue;
    if (k.rok !== null && (k.rok < 2000 || k.rok > 2100)) continue;
    const datum = sestav(k.den, k.mesic, k.rok, dnes);
    if (!datum) continue;
    return {
      datum,
      den: KODY_DNU[new Date(utc(datum)).getUTCDay()],
      zobrazeni: `${k.den}.${k.mesic}.`,
      nalezeno: k.text,
      od: k.od,
      do: k.do,
    };
  }
  return null;
}

/**
 * Text bez konkrétních dat (nahrazená mezerami stejné délky) — pro čtení
 * položek a kontrolu objemu, ať „13 .11.30l" není objem 11,30 l.
 */
export function bezData(text: string, dnes: string = datumPraha()): string {
  let out = text;
  for (let i = 0; i < 8; i++) {
    const d = datumZeZpravy(out, dnes);
    if (!d) break;
    out = out.slice(0, d.od) + ' '.repeat(d.do - d.od) + out.slice(d.do);
  }
  return out;
}

/**
 * „Pozítří", „zítra", „dnes" → datum podle dneška zprávy (YYYY-MM-DD), nebo null.
 * Přednost má pozítří (obsahuje „zítří", ne „zítra"), pak zítra, pak dnes.
 */
export function relativniDen(text: string | null | undefined, dnes: string = datumPraha()): { datum: string; den: string; slovo: string } | null {
  if (!text) return null;
  const posun = [
    { re: /(?<!\p{L})poz[ií]t[rř][ií](?!\p{L})/iu, dny: 2 },
    { re: /(?<!\p{L})z[ií]tra(?!\p{L})/iu, dny: 1 },
    { re: /(?<!\p{L})dnes(?!\p{L})/iu, dny: 0 },
  ];
  for (const p of posun) {
    const m = text.match(p.re);
    if (!m) continue;
    const datum = iso(utc(dnes) + p.dny * DEN_MS);
    return { datum, den: KODY_DNU[new Date(utc(datum)).getUTCDay()], slovo: m[0] };
  }
  return null;
}
