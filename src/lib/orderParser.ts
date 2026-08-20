const KEG_ONLY_VOLS = new Set(['50', '30', '20', '15', '10']);
const BEER_DEGREES = new Set(['8', '10', '11', '12', '13', '14', '15', '16']);

import type { Beer, Package, Place, ParserAlias } from './supabase';



export type ParsedVoiceOrder = {
  items: ParsedLine[];
  placeId: string | null;
  placeName: string | null;
};

export type ParsedLine = {
  raw: string;
  originalLine: string;
  quantity: number | null;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  package_label: string | null;
  confidence: 'high' | 'low' | 'unknown';
  issues: string[];
  matched_alias?: string | null;
  _removed?: boolean;
  _manual?: boolean;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
  place_name?: string | null;
  date?: string | null;
  photo_index?: number;
};


export type ParserAliasMap = {
  beer: Map<string, string>;
  package: Map<string, string>;
};

export function emptyAliasMap(): ParserAliasMap {
  return { beer: new Map(), package: new Map() };
}

export const normalize = (s: string) =>
  s.toLowerCase()
    .replace(/[ěščřžýáíéóúůťďň]/g, (c) =>
      ({ ě: 'e', š: 's', č: 'c', ř: 'r', ž: 'z', ý: 'y', á: 'a', í: 'i', é: 'e', ó: 'o', ú: 'u', ů: 'u', ť: 't', ď: 'd', ň: 'n' }[c] ?? c))
    .replace(/[^a-z0-9°,\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  let cur = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(
        prev[j] + 1,        // deletion
        cur[j - 1] + 1,     // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    [prev, cur] = [cur, prev];
  }
  return prev[bl];
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function bestFuzzyScoreInText(needle: string, haystack: string): number {
  if (!needle || !haystack) return 0;
  const words = haystack.split(/\s+/).filter(Boolean);
  const needleWordCount = needle.split(/\s+/).filter(Boolean).length || 1;
  let best = 0;
  for (let span = Math.max(1, needleWordCount - 1); span <= needleWordCount + 1 && span <= words.length; span++) {
    for (let i = 0; i + span <= words.length; i++) {
      const chunk = words.slice(i, i + span).join(' ');
      const s = similarity(needle, chunk);
      if (s > best) best = s;
    }
  }
  return best;
}

function volToPackage(volStr: string, packages: Package[], norm?: string): Package | null {
  const v = parseFloat(volStr.replace(',', '.'));
  if (isNaN(v)) return null;

  const exact = pickPackageByVolume(v, packages, norm ?? '');
  if (exact) return exact;

  let best: Package | null = null;
  let bestDiff = Infinity;
  for (const pkg of packages) {
    const diff = Math.abs(pkg.volume_l - v);
    if (diff < bestDiff) { bestDiff = diff; best = pkg; }
  }
  return bestDiff < 0.5 ? best : null;
}

// Rozšířené zkratky a vzory pro rozpoznávání piv
const BEER_ALIASES: { pattern: RegExp; degree?: string; color?: string; namePart?: string }[] = [
  { pattern: /\bcykl\.?\s*vosm(a|u|e|y|icka|ička)?\b|\bcykl\.?\s*osm(a|u|e|y|icka|ička)?\b|\bvosm(a|u|e|y|icka|ička)?\b|\bosm(a|u|e|y|icka|ička)?\b|\bcyklo\s*osm(a|u)?\b|\bcykloosm(a|u)?\b|\bcyklo\b|\b8\s*°?\b|\b8st\b|\bosma\b|\bvosma\b/i, degree: '8°' },
  { pattern: /\bdesitk(a|u|e|y)?\b|\bdesit(k)?\b|\bdesitku\b|\b10\s*°?\b|\b10\s*st\b|\b10sv\b|\bsvetle\s*vcepni\b|\bvycepni\s*svetle\b|\bdesitka\b|\bvycep\b|\bvýčep\b|\bvycepni\b|\bvýčepní\b/, degree: '10°', color: 'světlé' },
  { pattern: /\b11\s*(sv|svet|svetl)\b|\b11sv\b|\bjedenact(k)?(a|u|y)?\b|\bjedenactku\b|\bjedenactka\b/, degree: '11°', color: 'světlé' },
  { pattern: /\b12\s*(sv|svet|swet|svetl|light)\b|\b12sv\b|\bdvanactk(a|u|e|y)?\b|\bdvanactka\b|\bsvetla 12\b|\bsvetly 12\b|\bsvetly\s*lezak\b|\blezak\s*svetly\b/i, degree: '12°', color: 'světlé' },
  { pattern: /\bsv\s*l\b|\bsvetl[ée]\s*l\b|\bsvetl[ýy]\s*l\b|\bsvetle\s*l\b/, degree: '12°', color: 'světlé' },

  { pattern: /\b12\s*(tm|tma|tmavy|tmava|dark|tmave)\b|\btl\b|\btmava\b|\btmave\b|\btmavy\b|\btmavy\s*lezak\b|\blezak\s*tmavy\b|\btm\b|\bcerne\b|\bcerna\b/, degree: '12°', color: 'tmavé' },
  { pattern: /\bjantar\b|\bjant\b|\bjantarek\b|\bpolotmav\b|\b13\s*°?\b|\b13st\b/i, namePart: 'Jantar', degree: '13°' },
  { pattern: /\bsummer\b|\bsumr\b|\bsummer\s*ale\b|\bale\b/, namePart: 'Summer' },
  { pattern: /\bhazy\b|\bipa\b|\bneipa\b/, namePart: 'Hazy' },
  { pattern: /\bbunny\b|\bbuni\b/, namePart: 'Bunny' },
  { pattern: /\b13\s*°?\b|\b13st\b/, degree: '13°' },
  { pattern: /\b11\s*°?\b|\b11st\b/, degree: '11°' },
  { pattern: /\b12\s*°?\b|\b12st\b/, degree: '12°' },
  { pattern: /\b10\s*°?\b|\b10st\b/, degree: '10°' },
  { pattern: /\b8\s*°?\b|\b8st\b/, degree: '8°' },
  { pattern: /\bsv\b/, color: 'světlé' },
];

export function matchBeerFromHints(norm: string, beers: Beer[], aliasMap: ParserAliasMap): { beer: Beer | null; score: number; alias: string | null } {
  // 1. Exact name / short_name match FIRST so "jantar" is never intercepted by generic aliases
  let directMatch: Beer | null = null;
  let directLen = 0;
  for (const beer of beers) {
    const nameNorm = normalize(beer.name);
    if (nameNorm.length >= 3 && norm.includes(nameNorm) && nameNorm.length > directLen) {
      directMatch = beer;
      directLen = nameNorm.length;
    }
    if (beer.short_name) {
      const shortNorm = normalize(beer.short_name);
      if (shortNorm.length >= 2 && norm.includes(shortNorm) && shortNorm.length > directLen) {
        directMatch = beer;
        directLen = shortNorm.length;
      }
    }
  }
  if (directMatch) return { beer: directMatch, score: 0.98, alias: null };

  // Explicit check for Jantar if text contains jantar
  if (/\bjantar\b|\bjant\b|\bpolotmav\b/i.test(norm)) {
    const jantarBeer = beers.find((b) => /jantar/i.test(b.name) || /jantar/i.test(b.short_name ?? ''));
    if (jantarBeer) return { beer: jantarBeer, score: 0.98, alias: 'jantar' };
  }

  // 2. Exact alias map check
  const beerId = aliasMap.beer.get(norm);
  if (beerId) {
    const beer = beers.find((b) => b.id === beerId);
    if (beer) return { beer, score: 0.95, alias: norm };
  }

  // 3. Long alias substring match in aliasMap
  for (const [alias, bid] of aliasMap.beer) {
    if (alias.length >= 3 && norm.includes(alias)) {
      const beer = beers.find((b) => b.id === bid);
      if (beer) return { beer, score: 0.90, alias };
    }
  }

  // Try OCR-corrected matching: common OCR misreads for beer names
  const ocrCorrectedNorm = norm
    .replace(/\bse[eé]berg\b/i, 'seeberg')
    .replace(/\bseeger\b/i, 'seeberg');
  if (ocrCorrectedNorm !== norm) {
    for (const beer of beers) {
      const nameNorm = normalize(beer.name);
      if (nameNorm.length >= 3 && ocrCorrectedNorm.includes(nameNorm)) {
        return { beer, score: 0.90, alias: null };
      }
    }
  }

  const scores = new Map<string, number>();

  for (const alias of BEER_ALIASES) {
    if (alias.pattern.test(norm)) {
      for (const beer of beers) {
        let s = scores.get(beer.id) ?? 0;
        if (alias.degree && beer.degree === alias.degree) s += 0.5;
        if (alias.color && beer.color === alias.color) s += 0.4;
        if (alias.namePart && normalize(beer.name).includes(normalize(alias.namePart))) s += 0.6;
        scores.set(beer.id, s);
      }
    }
  }
  for (const beer of beers) {
    const nameNorm = normalize(beer.name);
    const tokens = nameNorm.split(' ').filter((t) => t.length > 2);
    let s = scores.get(beer.id) ?? 0;
    for (const t of tokens) {
      if (norm.includes(t)) s += 0.35;
    }
    scores.set(beer.id, s);
  }
  let best: Beer | null = null;
  let bestScore = 0;
  for (const beer of beers) {
    const s = scores.get(beer.id) ?? 0;
    if (s > bestScore) { bestScore = s; best = beer; }
  }
  if (bestScore >= 0.4) return { beer: best, score: bestScore, alias: null };

  let fuzzyBest: Beer | null = null;
  let fuzzyScore = 0;
  for (const beer of beers) {
    const nameNorm = normalize(beer.name);
    if (nameNorm.length < 3) continue;
    const s = bestFuzzyScoreInText(nameNorm, norm);
    if (s > fuzzyScore) { fuzzyScore = s; fuzzyBest = beer; }
  }
  if (fuzzyScore >= 0.70) return { beer: fuzzyBest, score: fuzzyScore, alias: null };

  return { beer: null, score: bestScore, alias: null };
}

const KEG_VOLS = new Set([50, 30, 20, 15, 10]);
const PET_VOLS = new Set([1.5, 1]);
const BOTTLE_VOLS = new Set([0.5, 0.33]);

function pickPackageByVolume(v: number, packages: Package[], norm: string): Package | null {
  const candidates = packages.filter((p) => Math.abs(p.volume_l - v) < 0.02);
  if (candidates.length <= 1) return candidates[0] ?? null;

  const wantsBottle = /\blahv|\bsklo\b|\bflas/.test(norm);
  const wantsPet = /\bpet\b|\bpetka\b/.test(norm);
  const wantsKeg = /\bkeg\b|\bsud\b|\bsudy\b/.test(norm);

  if (wantsBottle) {
    const b = candidates.find((p) => /lahv/i.test(p.label));
    if (b) return b;
  }
  if (wantsPet) {
    const p2 = candidates.find((p) => /pet/i.test(p.label));
    if (p2) return p2;
  }
  if (wantsKeg) {
    const k = candidates.find((p) => /keg|sud/i.test(p.label));
    if (k) return k;
  }

  if (BOTTLE_VOLS.has(v)) {
    const b = candidates.find((p) => /lahv/i.test(p.label));
    if (b) return b;
  }
  if (PET_VOLS.has(v)) {
    const p2 = candidates.find((p) => /pet/i.test(p.label));
    if (p2) return p2;
  }
  if (KEG_VOLS.has(v)) {
    const k = candidates.find((p) => /keg|sud/i.test(p.label));
    if (k) return k;
  }
  return candidates[0];
}

export function matchPackage(norm: string, packages: Package[], aliasMap: ParserAliasMap): Package | null {
  if (!packages || !packages.length) return null;

  // 0. POJISTKA: holé číslo "15" (BEZ desetinné čárky) vedle slova "pet"/
  // "petka"/"petr" je skoro jistě "1,5" se ztracenou čárkou (typický přepis
  // "PET 1,5" → "PET 15"), NE sud 15l — bez tohohle by ho o pár řádků níž
  // chytil regex pro sud/KEG 15l. Úzce cílené: nezasahuje do jiných případů
  // (např. objednávka od zákazníka jménem "Petr"), protože se aktivuje JEN
  // když je v textu doslova holé "15" a NENÍ tam slovo "keg"/"sud". Skutečné
  // "1,5"/"1.5" (s čárkou/tečkou) už správně řeší pravidlo níže samo o sobě.
  if (
    /\bpet\b|\bpetka\b|\bpetky\b|\bpetr\b/i.test(norm) &&
    !/\bkeg\b|\bsud\b/i.test(norm) &&
    /\b15\b/.test(norm) &&
    !/\b1[,.]5\b/.test(norm)
  ) {
    const hit = packages.find((p) => Number(p.volume_l) === 1.5) ?? packages.find((p) => /1[,.]5/i.test(p.label));
    if (hit) return hit;
  }

  // 1. Check EXPLICIT VOLUME NUMBERS FIRST so "keg 50l" is never intercepted by "keg" alias for 30l
  // ⚠️ CRITICAL: 10, 11, 12, 13, 14, 8 are BEER DEGREES (10%, 10°, 10sv, 10ka, 10) when NOT followed by 'l' or 'litr' or preceded by keg/sud!
  // NEVER treat bare "10" or "10%" or "10sv" as 10L keg!
  if (/\b50\s*l\b|\b50\s*litr|\bsud50\b|\bkeg50\b|\bvelky\s*sud\b|\bsud\s*50\b|\bkeg\s*50\b|(?:\b|\d\s*x\s*)50\b(?!%|°|sv|tm)/i.test(norm)) {
    return packages.find((p) => Number(p.volume_l) === 50 || /50/i.test(p.label)) ?? null;
  }
  if (/\b30\s*l\b|\b30\s*litr|\bsud30\b|\bkeg30\b|\bmaly\s*sud\b|\bsud\s*30\b|\bkeg\s*30\b|(?:\b|\d\s*x\s*)30\b(?!%|°|sv|tm)/i.test(norm)) {
    return packages.find((p) => Number(p.volume_l) === 30 || /30/i.test(p.label)) ?? null;
  }
  if (/\b20\s*l\b|\b20\s*litr|\bsud20\b|\bkeg20\b|\bsud\s*20\b|\bkeg\s*20\b|(?:\b|\d\s*x\s*)20\b(?!%|°|sv|tm|x)/i.test(norm)) {
    return packages.find((p) => Number(p.volume_l) === 20 || /20/i.test(p.label)) ?? null;
  }
  if (/\b15\s*l\b|\b15\s*litr|\bsud15\b|\bkeg15\b|\bsud\s*15\b|\bkeg\s*15\b|(?:\b|\d\s*x\s*)15\b(?!%|°|sv|tm)/i.test(norm)) {
    return packages.find((p) => Number(p.volume_l) === 15 || /15/i.test(p.label)) ?? null;
  }
  if ((/\b10\s*l\b|\b10\s*litr|\bsud10\b|\bkeg10\b|\bsud\s*10\b|\bkeg\s*10\b/i.test(norm)) && !/\b10\s*(%|°|sv|tm|ka|tka|desitk)/i.test(norm)) {
    return packages.find((p) => Number(p.volume_l) === 10 || /10/i.test(p.label)) ?? null;
  }
  if (/\b1[,.]5\s*l?\b|\bpetka\b/i.test(norm)) {
    return packages.find((p) => Number(p.volume_l) === 1.5 || /1[,.]5/i.test(p.label)) ?? null;
  }
  if (/(?<!\d)\b1\s*l\b(?!\s*[,.]?\s*5)|\b1\s*litr\b/i.test(norm)) {
    return packages.find((p) => Number(p.volume_l) === 1.0 || /1\s*l/i.test(p.label)) ?? null;
  }
  if (/\b0[,.]33\s*l?\b|\btretinka\b|\btřetinka\b/i.test(norm)) {
    return packages.find((p) => Number(p.volume_l) === 0.33 || /0[,.]33/i.test(p.label)) ?? null;
  }
  if (/\b0[,.]5\s*l?\b|\bpullitr\b|\bpůllitr\b/i.test(norm)) {
    return packages.find((p) => Number(p.volume_l) === 0.5 || /0[,.]5|lahv/i.test(p.label)) ?? null;
  }

  // 2. Exact alias match in aliasMap
  const pkgId = aliasMap.package.get(norm);
  if (pkgId) {
    const pkg = packages.find((p) => p.id === pkgId);
    if (pkg) return pkg;
  }

  // 3. Fallback to generic alias substring matching
  for (const [alias, pid] of aliasMap.package) {
    if (alias.length >= 3 && norm.includes(alias)) {
      const pkg = packages.find((p) => p.id === pid);
      if (pkg) return pkg;
    }
  }

  if (/\blahve?\b|\bsklo\b|\bflas\b/i.test(norm)) {
    return packages.find((p) => Number(p.volume_l) === 0.5 || /0[,.]5|lahv/i.test(p.label)) ?? null;
  }
  if (/\bkeg\b|\bsud\b/i.test(norm)) {
    return packages.find((p) => Number(p.volume_l) === 50 || /50/i.test(p.label)) ?? packages.find((p) => Number(p.volume_l) === 30 || /30/i.test(p.label)) ?? null;
  }

  return null;
}

function ocrNormalizeLine(line: string): string {
  return line
    .replace(/[×«]/g, 'x')
    .replace(/(\d)\s*[IL](?=\s|°|$)/g, '$1l')
    .replace(/(\d+\s*x\s*[\d,\.]+)\s*[IL](?=\s|°|$)/gi, '$1l')
    // 🧠 OCR OPRAVA: "1l" (1 litr) se občas přečte jako "1,5" nebo "1.5"
    // (OCR zamění "l" za "5"). Pokud je "1,5" nebo "1.5" NÁSLEDOVÁNO slovem
    // "pet" nebo "petka" a NENÍ to skutečný 1.5l, oprav na "1l".
    // Pozor: "1,5l" s explicitním "l" je skutečný 1.5l — neopravuj.
    .replace(/\b1[.,]5\s*(?!l\b)(?=.*\bpet\b)/gi, '1l')
    .replace(/\s+/g, ' ')
    .trim();
}


function ocrCleanupQuantities(text: string): string {
  return text
    .replace(/\btox\b/gi, '10x')
    .replace(/\bsox\b/gi, '5x')
    .replace(/\bGx\b/g, '6x')
    .replace(/\bGK\s+(\d)/g, '6x $1')
    .replace(/\bOx\s+(\d)/g, '0x $1')
    ;
}

function findBboxForContext(context: string, linesWithBbox?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[]) {
  if (!linesWithBbox?.length) return undefined;
  const ctx = context.toLowerCase().trim();
  if (!ctx) return undefined;
  let best: { x0: number; y0: number; x1: number; y1: number } | undefined;
  let bestScore = 0;
  for (const l of linesWithBbox) {
    const lt = l.text.toLowerCase().trim();
    if (!lt) continue;
    const ctxWords = ctx.split(/\s+/).filter((w) => w.length > 1);
    const ltWords = lt.split(/\s+/).filter((w) => w.length > 1);
    let shared = 0;
    for (const w of ctxWords) {
      if (ltWords.some((lw) => lw.includes(w) || w.includes(lw))) shared++;
    }
    const score = ctxWords.length ? shared / ctxWords.length : 0;
    if (score > bestScore) { bestScore = score; best = l.bbox; }
  }
  return bestScore > 0.15 ? best : undefined;
}

type Token = { qty: number; volStr: string | null; degree: string | null; start: number; end: number };

// 🧠 "VŠE [stupeň]" NA KONCI OBJEDNÁVKY:
// Pokud text obsahuje "vše 11sv", "vse 11sv", "vše 11", "všechno 11sv" apod.,
// znamená to, že VŠECHNY položky objednávky jsou TOHO STUPNĚ.
// Vrací stupeň (např. "11") a barvu (např. "světlé") nebo null.
function extractGlobalDegree(text: string): { degree: string | null; color: string | null } {
  const m = text.match(/\b(v[šs]e|v[šs]echno|v[šs]echny|v[šs]echna)\s+(11|12|10|13|8|9|14)\s*(sv|svet|svetl|svetle|svetly|tm|tma|tmav|tmava|tmavy|tmave|dark)?\b/i);
  if (!m) return { degree: null, color: null };
  const degree = m[2];
  const colorRaw = m[3]?.toLowerCase() ?? '';
  let color: string | null = null;
  if (colorRaw.startsWith('tm') || colorRaw.startsWith('dark')) color = 'tmavé';
  else if (colorRaw.startsWith('sv')) color = 'světlé';
  return { degree, color };
}

// 🧠 STUPEŇ Z VLASTNÍHO TEXTU POLOŽKY:
// Najde v raw textu (raw_line) stupeň piva (např. "8", "10", "12", "8+", "8sv",
// "8 svetly", "12 tmavý"). Vrací stupeň jako string (bez °) nebo null, pokud se
// v textu žádný samostatný stupeň nevyskytuje.
// Používá se k opravě AI: stupeň napsaný PŘÍMO v textu té položky má přednost
// před stupněm, který AI mohlo špatně převzít z JINÉ položky na fotografii.
function extractDegreeFromRaw(text: string): string | null {
  if (!text) return null;
  // Stupeň u piva: číslo 8–16, případně s ° a/nebo barvou (sv/tm/dark/...).
  // Pozor: nepleteme si stupeň s objemem — objemy (50, 30, 20, 15, 10 ... l/x)
  // nejsou v BEER_DEGREES kromě č. 10 a 8, které se ale u piva typicky píšou
  // s °, "sv"/"tm" nebo jako součást názvu piva ("8", "10").
  const m = text.match(
    /(?:^|[^0-9.])(8|9|10|11|12|13|14|15|16)\s*(?:°|stupn|st|sv|svet|svetl|svetly|svetle|tm|tma|tmav|tmavy|tmave|dark|l[eé]ž[aá]k|des[ií]tk|dvan[aá]ctk)/i
  );
  if (m) return m[1];
  // Stupeň napsaný ZA SUDEM na konci řádku (např. "2x50 10", "2x50 8",
  // "3x 30l 11"): po objemu KEG (x50/x30...) následuje na konci číslo stupně.
  // Bezpečně rozlišíme, že 10/8 tady není objem (objem už je vypsaný), ale stupeň.
  const m2 = text.match(
    /x\s*(?:\d+\s*)?(?:50|30|20|15|10)\s*(?:l\b|l\.?\s*)?[ ,;.\n\t-]+\s*(8|9|10|11|12|13|14|15|16)\s*(?:°|sv|tm|dark)?\s*$/i
  );
  if (m2) return m2[1];
  return null;
}



export function parseOrderText(
  rawText: string,
  beers: Beer[],
  packages: Package[],
  aliasMap?: ParserAliasMap,
  linesWithBbox?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[],
): ParsedLine[] {
  const aliases = aliasMap ?? emptyAliasMap();

  // Zpracováváme každý řádek zvlášť, aby se kontext z jedné položky
  // nepromítal do sousední (např. název piva z předchozího řádku).
  const flatLines = rawText.split(/\n/).map((l) => ocrNormalizeLine(l.trim())).filter((l) => l.length > 0);

  const results: ParsedLine[] = [];
  const seen = new Set<string>();

  // 🧠 "VŠE [stupeň]" NA KONCI OBJEDNÁVKY — aplikuj na všechny položky
  const globalDegree = extractGlobalDegree(rawText);

  for (const line of flatLines) {
    const flat = ocrCleanupQuantities(line);


    const tokenRe = /(\d{1,4})\s*x\s*(\d{1,2}(?:[,.]\d)?)\s*(°|l|L)?|(\d{1,4})\s*(?:x|ks)\b/g;
    const tokens: Token[] = [];
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(flat)) !== null) {
      if (m[1] !== undefined) {
        const qty = parseInt(m[1], 10);
        const numStr = m[2];
        let suffix = m[3];
        let end = m.index + m[0].length;

        if (!suffix) {
          const after = flat.slice(end, end + 2);
          if (after.includes('°')) { suffix = '°'; end += after.indexOf('°') + 1; }
          else if (/[lL]/.test(after)) { suffix = 'l'; end += after.search(/[lL]/) + 1; }
        }

        let volStr: string | null = null;
        let degree: string | null = null;

        if (suffix === 'l' || suffix === 'L') {
          volStr = numStr;
        } else if (suffix === '°') {
          degree = numStr;
        } else {
          if (KEG_ONLY_VOLS.has(numStr)) {
            volStr = numStr;
          } else if (BEER_DEGREES.has(numStr)) {
            degree = numStr;
          }
        }

        tokens.push({ qty, volStr, degree, start: m.index, end });
      } else {
        tokens.push({ qty: parseInt(m[4], 10), volStr: null, degree: null, start: m.index, end: m.index + m[0].length });
      }
    }

    // 🧠 ZÁCHRANNÝ FALLBACK: řádek obsahuje číslo, ale žádné "x"/"ks" (např.
    // "12 piv 0.5l", "2 kegy 30L") — tokenRe výše na něj nechytne nic a řádek by
    // beze stopy zmizel (uživatel by nikdy nezjistil, že se položka neobjednala).
    // Vezmeme první číslo v řádku jako množství a necháme ho projít stejnou
    // logikou rozpoznání piva/obalu níže; při nejistotě se označí jako
    // low/unknown confidence, aby si toho uživatel v UI všiml a zkontroloval.
    // Aktivuje se jen s jasným náznakem balení/piva u čísla (jinak by chytal
    // i data, telefonní čísla apod.) a ne na řádcích "vše/všechno <stupeň>",
    // což je řídicí fráze aplikovaná globálně, ne samostatná položka.
    if (
      tokens.length === 0 &&
      !/\b(v[šs]e|v[šs]echno|v[šs]echny|v[šs]echna)\b/i.test(flat) &&
      (/\b(piv|keg|sud|lahv|balen|ks)\b/i.test(flat) || /\d\s*[lL]\b/.test(flat))
    ) {
      const bare = flat.match(/\d{1,4}/);
      if (bare) {
        const qty = parseInt(bare[0], 10);
        if (qty > 0) {
          tokens.push({ qty, volStr: null, degree: null, start: bare.index ?? 0, end: (bare.index ?? 0) + bare[0].length });
        }
      }
    }

    // 🧠 STUPEŇ NA ZAČÁTKU ŘÁDKU SE APLIKUJE NA VŠECHNY POLOŽKY:
    // Pokud řádek začíná stupněm (např. "11sv 3x30 3x20 15x1"), platí tento
    // stupeň pro VŠECHNY položky na řádku, i když u nich není explicitně napsaný.
    // Nejprve zkus najít stupeň na začátku řádku.
    let lineDegree: string | null = null;
    const lineStartMatch = flat.match(/^\s*(8|9|10|11|12|13|14)\s*(sv|svet|svetl|svetle|svetly|tm|tma|tmav|tmava|tmavy|tmave|dark|°)?\b/i);
    if (lineStartMatch) {
      lineDegree = lineStartMatch[1];
    }

    for (const t of tokens) {
      if (t.degree) continue;
      // 1) Stupeň ze začátku řádku (platí pro všechny položky)
      if (lineDegree) {
        t.degree = lineDegree;
        continue;
      }
      // 2) Stupeň v kontextu kolem tokenu (např. "12sv 3x30")
      const ctxStart = Math.max(0, t.start - 60);
      const ctxEnd = Math.min(flat.length, t.end + 60);
      const ctx = flat.slice(ctxStart, ctxEnd);
      const degMatch = ctx.match(/\b(8|9|10|11|12|13|14)\s*(°|sv|svet|svetl|svetle|svetly|tm|tma|tmav|tmava|tmavy|tmave|dark)?\b/i);
      if (degMatch) t.degree = degMatch[1];
    }


    for (const t of tokens) {
      if (t.volStr) continue;
      const ctxStart = Math.max(0, t.start - 80);
      const ctxEnd = Math.min(flat.length, t.end + 80);
      const ctx = flat.slice(ctxStart, ctxEnd);
      // Try to find explicit volume with unit — catches "1,5l", "1 l", "0,5l" etc.
      const volMatch = ctx.match(/\b(50|30|20|15|10|1[,.]5|1[,.]0|0[,.]5|0[,.]33)\s*[lL]\b|\b(1)\s*[lL]\b/);
      if (volMatch) {
        t.volStr = (volMatch[1] ?? volMatch[2]);
      } else if (/\bkeg\b/i.test(ctx)) {
        t.volStr = '30';
      } else if (/\b1[,.]5\b/.test(ctx)) {
        // "1,5" without explicit 'l' — assume PET 1.5l
        t.volStr = '1.5';
      } else if (/\b1\s*l\b|\b1[lL]\b/.test(ctx)) {
        // "1l" or "1 l" — 1 litr
        t.volStr = '1';
      } else if (/\b(pet|petka)\b/i.test(ctx)) {
        // PET without size — default to 1l (most common PET size)
        t.volStr = '1';
      } else if (/\b(lahv|sklo|flas|bottle)\b/i.test(ctx)) {
        // Glass bottle without size — default to 0.5l
        t.volStr = '0.5';
      }
    }

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.qty === 0) continue;

      const dispStart = i === 0 ? 0 : tokens[i - 1].end;
      const dispEnd = i === tokens.length - 1 ? flat.length : tokens[i + 1].start;
      const dispContext = flat.slice(dispStart, dispEnd).trim();

      let { beer, alias } = matchBeerFromHints(normalize(dispContext), beers, aliases);
      if (!beer && t.degree) {
        ({ beer, alias } = matchBeerFromHints(normalize(t.degree + '°'), beers, aliases));
      }
      if (!beer) {
        const wideStart = Math.max(0, t.start - 80);
        const wideEnd = Math.min(flat.length, t.end + 80);
        ({ beer, alias } = matchBeerFromHints(normalize(flat.slice(wideStart, wideEnd).trim()), beers, aliases));
      }
      // 🧠 "VŠE [stupeň]" NA KONCI OBJEDNÁVKY — pokud položka nemá pivo,
      // zkus ho najít podle globálního stupně z konce objednávky
      if (!beer && globalDegree.degree) {
        const gd = globalDegree.degree + '°';
        ({ beer, alias } = matchBeerFromHints(normalize(gd), beers, aliases));
      }


      const dispNorm = normalize(dispContext);
      let pkg: Package | null = t.volStr ? volToPackage(t.volStr, packages, dispNorm) : null;
      if (!pkg) pkg = matchPackage(dispNorm, packages, aliases);

      const issues: string[] = [];
      if (!t.qty) issues.push('množství');
      if (!beer) issues.push('pivo');
      if (!pkg) issues.push('obal');

      const hasAnything = t.qty || beer || pkg;
      const confidence: ParsedLine['confidence'] = (t.qty && beer && pkg)
        ? 'high'
        : hasAnything ? 'low' : 'unknown';

      // 🧠 NEdeduplikujeme položky se stejným pivem/obalem/množstvím na jednom
      // řádku — uživatel může objednat stejné pivo VÍCEKRÁT (např. "2x50 12sv
      // a dalsi 2x50 12sv" = 4x50 12sv celkem). Duplicity se řeší až v
      // dedupeAgainstExisting (proti existujícím položkám v objednávce).

      const bbox = findBboxForContext(dispContext, linesWithBbox);

      // Pivo/obal, které se nepodařilo rozpoznat, zůstávají null (nehádáme
      // je natvrdo) — issues/confidence výše už správně říkají, co chybí,
      // a beer_id/package_id musí tomu odpovídat, jinak by se dala do
      // objednávky tiše zapsat úplně jiná položka, aniž by si toho uživatel
      // všiml (beerId/pkgId prázdné = řádek zůstane needitovaný ve
      // formuláři, dokud ho uživatel sám nevyplní).

      results.push({
        raw: dispContext,
        originalLine: dispContext,
        quantity: t.qty,
        beer_id: beer?.id ?? null,
        beer_name: beer?.name ?? null,
        package_id: pkg?.id ?? null,
        package_label: pkg?.label ?? null,
        confidence,
        issues,
        matched_alias: alias,
        bbox,
      });
    }
  }

  return results;
}


export type GeminiItem = {
  quantity: number | null;
  degree: string | null;
  beer_name: string | null;
  package_label: string | null;
  raw_line: string;
  place_name: string | null;
  date?: string | null;
  bbox?: { x0: number; y0: number; x1: number; y1: number } | null;
};


// Rozdělí položku, která obsahuje VÍCE objednávek na jednom řádku oddělených
// slovem "a" (např. "2x50 12sv a 2x50 vosma"). Vrací pole položek.
// Toto je bezpečnostní síť pro případ, že AI nesplní pokyn k rozdělení.
function splitGeminiItemOnA(item: GeminiItem): GeminiItem[] {
  const raw = item.raw_line || '';
  // Hledáme vzor "a" mezi dvěma objednávkovými vzory (čísla s x/ks)
  const pattern = /(\d{1,4}\s*x\s*\d{1,2}(?:[,.]\d)?[^\n]*?)\s+a\s+(\d{1,4}\s*x\s*\d{1,2}(?:[,.]\d)?[^\n]*)/i;
  const m = raw.match(pattern);
  if (!m) return [item];

  const firstPart = m[1].trim();
  const secondPart = m[2].trim();
  if (!firstPart || !secondPart) return [item];

  // Zkopíruj item a rozděl raw_line.
  // DŮLEŽITÉ: Vymažeme beer_name a degree, aby se pivo hledalo z NOVÉHO
  // (rozděleného) raw_line — jinak by obě položky dostaly stejné pivo
  // z původního (nesprávně sloučeného) itemu.
  const first = { ...item, raw_line: firstPart, beer_name: null, degree: null };
  const second = { ...item, raw_line: secondPart, beer_name: null, degree: null };

  // Pokud má item quantity, ale raw_line obsahuje dvě množství, necháme
  // quantity z AI (AI by měla vrátit správné quantity pro každou položku).
  // Pokud AI vrátila jen jednu quantity, zkus ji odvodit z raw_line.
  if (item.quantity === null) {
    const q1 = firstPart.match(/^\s*(\d{1,4})\s*x/i);
    const q2 = secondPart.match(/^\s*(\d{1,4})\s*x/i);
    if (q1) first.quantity = parseInt(q1[1], 10);
    if (q2) second.quantity = parseInt(q2[1], 10);
  }

  return [first, second];

}

export function parseGeminiItems(
  items: GeminiItem[],
  beers: Beer[],
  packages: Package[],
  aliasMap?: ParserAliasMap,
  photoIndex?: number,
  places?: Place[],
): ParsedLine[] {
  const aliases = aliasMap ?? emptyAliasMap();
  const results: ParsedLine[] = [];
  const seen = new Set<string>();

  // 🧠 ROZDĚLENÍ POLOŽEK SE SLOVEM "a":
  // Pokud AI vrátila jednu položku s více objednávkami na jednom řádku
  // (např. "2x50 12sv a 2x50 vosma"), rozděl ji na samostatné položky.
  const expandedItems: GeminiItem[] = [];
  for (const item of items) {
    expandedItems.push(...splitGeminiItemOnA(item));
  }
  items = expandedItems;

  // 🧠 OPRAVA PROHOZENÉHO OBJEMU A MNOŽSTVÍ:
  // AI občas přečte "20l 1x" jako "1l 20x" (prohodí objem a množství).
  // Z raw_line poznáme správný vzor: číslo s "l" = OBJEM, číslo s "x"/"ks" = MNOŽSTVÍ.
  // Pokud AI vrátila quantity odpovídající objemu a package odpovídající množství,
  // prohodíme je zpět.
  for (const item of items) {
    const raw = item.raw_line || '';
    // Najdi objem s "l" (např. "20l", "30l", "50l", "1,5l") a množství s "x"/"ks"
    const volMatch = raw.match(/\b(\d{1,2}(?:[,.]\d)?)\s*l\b/i);
    const qtyMatch = raw.match(/\b(\d{1,4})\s*(?:x|ks)\b/i);
    if (volMatch && qtyMatch) {
      const volNum = parseFloat(volMatch[1].replace(',', '.'));
      const qtyNum = parseInt(qtyMatch[1], 10);
      // Pokud AI vrátila quantity = objem (např. 20) a package_label obsahuje
      // číslo odpovídající množství (např. "PET 1l"), je to prohozené.
      const pkgVolMatch = item.package_label?.match(/(\d+[.,]?\d*)\s*l/i);
      const pkgVol = pkgVolMatch ? parseFloat(pkgVolMatch[1].replace(',', '.')) : null;
      if (item.quantity === volNum && pkgVol === qtyNum && volNum !== qtyNum) {
        // Prohoď: quantity = správné množství, package_label = správný objem
        item.quantity = qtyNum;
        // package_label necháme, ale upravíme objem na správný
        if (item.package_label) {
          item.package_label = item.package_label.replace(/(\d+[.,]?\d*)\s*l/i, `${volNum}l`);
        }
      }
    }
  }



  // 🧠 NAUČENÉ ALIASY ODBĚRATELŮ: načti z localStorage a použij je k opravě
  // place_name z AI. Pokud AI rozpoznala "Seeberg" ale uživatel dříve opravil
  // na "Seeberg 2", automaticky použijeme správný název.
  let placeAliasMap = new Map<string, string>();
  try {
    const localSaved = localStorage.getItem('user_learned_place_aliases');
    if (localSaved) {
      const parsed = JSON.parse(localSaved);
      for (const [k, v] of Object.entries(parsed)) {
        placeAliasMap.set(k, String(v));
      }
    }
  } catch {}

  // 🧠 ODBĚRATEL: Sleduj poslední známého odběratele, aby se place_name "dědil"
  // odshora dolů — pokud AI nevrátila place_name pro některou položku, použij
  // odběratele z předchozí položky (stejné okno/objednávka).
  let lastPlaceName: string | null = null;

  // 🧠 "VŠE [stupeň]" NA KONCI OBJEDNÁVKY — aplikuj na všechny položky
  const globalDegree = extractGlobalDegree(items.map((i) => i.raw_line || '').join('\n'));

  // 🧠 STUPEŇ NA ZAČÁTKU ŘÁDKU SE APLIKUJE NA VŠECHNY POLOŽKY:
  // Pokud raw_line začíná stupněm (např. "11sv 3x30 3x20 15x1"), platí tento
  // stupeň pro VŠECHNY položky na tom řádku. Pokud AI nevrátila stupeň pro
  // položku, ale raw_line začíná stupněm, použij ho.
  const lineDegreeMap = new Map<string, string>();
  for (const item of items) {
    const raw = item.raw_line || '';
    const m = raw.match(/^\s*(8|9|10|11|12|13|14)\s*(sv|svet|svetl|svetle|svetly|tm|tma|tmav|tmava|tmavy|tmave|dark|°)?\b/i);
    if (m) lineDegreeMap.set(raw, m[1]);
  }

  // 🧠 OPRAVA STUPNĚ PODLE VLASTNÍHO TEXTU POLOŽKY (1. krok):
  // AI občas přiřadí položce špatný stupeň (např. vezme "10" z JINÉ objednávky
  // na fotografii, zatímco u téhle objednávky je napsáno "8"). Stupeň napsaný
  // PŘÍMO v raw_line té položky je přesný přepis z fotky -> má přednost a
  // přepíšeme jím AI `item.degree`. Tím se ke každé objednávce přiřadí ten
  // stupeň, který je skutečně u ní napsaný, a ne z jiného řádku.
  for (const item of items) {
    const ownDegree = extractDegreeFromRaw(item.raw_line || '');
    if (ownDegree) {
      item.degree = ownDegree;
    }
  }

  // 🧠 OPRAVA STUPNĚ (2. krok) — "SAMOSTATNÝ STUPEŇ" VLASTNÍ POLOŽKY:
  // AI občas z fotky rozpozná stupeň piva jako SAMOSTATNOU položku (řádek jen
  // s číslem stupně, např. "8", bez množství, obalu i piva), zatímco objednávku
  // ("2x50") vykáže se špatným stupněm (např. 10, který patřil jiné objednávce).
  // Tady takovou "solitérní" stupně najdeme: pokud předchozí položka je pořádná
  // objednávka (má množství/obal) a nemá vlastní stupeň, přiřadíme jí stupeň
  // z té solitérní položky a tu z výstupu odstraníme.
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    // Je to solitérní stupeň? (jen číslo 8-16, bez obalu/množství/názvu piva)
    const soloDegree = /^\s*(?:8|9|10|11|12|13|14|15|16)\s*(?:°|sv|tm)?\s*$/i.test((it.raw_line || '').trim());
    const isObjedn = it.quantity != null || !!it.package_label || !!it.beer_name;
    if (!soloDegree || isObjedn) continue;
    // Najdi v okolí NEJBLIŽŠÍ předchozí pořádnou objednávku bez vlastního stupně.
    for (let j = i - 1; j >= 0; j--) {
      const target = items[j];
      const targetIsObjedn = target.quantity != null || !!target.package_label || !!target.beer_name;
      if (!targetIsObjedn) continue;
      // Má cíl v TEXTU vlastní stupeň s označením piva (např. "12sv", "10°", "8 tmavý")?
      // Pak ten v textu má přednost a solitérní stupeň ho nepřepíše. Pokud má cíl
      // jen číslo napsané od AI (jako "2x50 10"), necháme ho přepsat solitérním stupněm.
      const hasMarkedDegree = (target.raw_line || '').match(
        /(?:8|9|10|11|12|13|14|15|16)\s*(?:°|sv|svet|svetl[aéy]|tm|tmav|tmave|dark)/i
      ) != null;
      if (!hasMarkedDegree) {
        const soloMatch = (it.raw_line || '').trim().match(/(8|9|10|11|12|13|14|15|16)/);
        target.degree = soloMatch ? soloMatch[1] : target.degree;
      }
      break; // vždy naváže na nejbližší předchozí objednávku
    }
    // Solitérní položku odstraníme z výstupu (jen číslo stupně sama o sobě
    // není objednávkou piva).
    items.splice(i, 1);
    i--; // po odstranění se posuneme zpět
  }


  for (const item of items) {
    const raw = item.raw_line || [item.quantity, item.degree, item.beer_name, item.package_label].filter(Boolean).join(' ');

    let beer: Beer | null = null;
    let alias: string | null = null;
    if (item.beer_name) {
      ({ beer, alias } = matchBeerFromHints(normalize(item.beer_name), beers, aliases));
    }
    // Celý raw text (obsahuje jméno piva, např. "Summer") má přednost před
    // holým stupněm — pivo se stejným stupněm jako jiné (typicky bez
    // vlastního stupně v katalogu, jako sezonní "Summer Ale") by jinak
    // shoda podle degree přebila jménem správně určené pivo.
    if (!beer) {
      ({ beer, alias } = matchBeerFromHints(normalize(raw), beers, aliases));
    }
    if (!beer && item.degree) {
      ({ beer, alias } = matchBeerFromHints(normalize(item.degree), beers, aliases));
    }
    // 🧠 "VŠE [stupeň]" NA KONCI OBJEDNÁVKY — pokud položka nemá pivo,
    // zkus ho najít podle globálního stupně z konce objednávky
    if (!beer && globalDegree.degree) {
      const gd = globalDegree.degree + '°';
      ({ beer, alias } = matchBeerFromHints(normalize(gd), beers, aliases));
    }
    // 🧠 STUPEŇ NA ZAČÁTKU ŘÁDKU — pokud položka nemá pivo a raw_line
    // začíná stupněm, použij tento stupeň
    if (!beer && lineDegreeMap.has(item.raw_line || '')) {
      const ld = lineDegreeMap.get(item.raw_line || '')!;
      ({ beer, alias } = matchBeerFromHints(normalize(ld + '°'), beers, aliases));
    }



    const rawNorm = normalize(raw);
    let pkg: Package | null = null;
    if (item.package_label) {
      // 🧠 OCR OPRAVA: AI občas přečte "1l" (1 litr) jako "1,5l" nebo "1.5l".
      // Pokud raw_line obsahuje "1l" nebo "1 l" (bez čárky/tečky), ale
      // package_label má "1,5" nebo "1.5", oprav na 1l.
      const rawHas1l = /\b1\s*l\b/i.test(raw);
      const pkgHas15 = /1[.,]5/.test(item.package_label);
      if (rawHas1l && pkgHas15) {
        item.package_label = item.package_label.replace(/1[.,]5/, '1');
      }
      // === OCR OPRAVA OBJEMU KEG ===
      // Někdy AI správně přečte objem v raw textu (např. "5x50", "3x 50l"),
      // ale do obalu zapíše chybný objem (např. "KEG 30l" místo "KEG 50l").
      // raw text je přesný přepis toho, co je na obrázku, proto objem
      // rozpoznaný z raw textu má přednost, pokud AI řekl jiný KEG objem.
      // ⚠️ VÍCE OBJEMŮ NA JEDNOM ŘÁDKU (např. "7x30 2x10 1x20"): objem položky
      // párujeme podle JEJÍHO množství (quantity) — položka s quantity 2 patří
      // k "2x10", ne k prvnímu "7x30". Jinak by všechny položky dostaly první
      // objem z řádku (vše 30l místo 30l/10l/20l).
      const kegVolByQty = (() => {
        if (item.quantity == null || !raw) return null;
        for (const m of raw.matchAll(/(\d{1,2})\s*x\s*(50|30|20|15|10)(?![.,]\s*\d)/gi)) {
          if (parseInt(m[1], 10) === item.quantity) return m[2];
        }
        return null;
      })();
      const rawKegVols = new Set<string>([
        ...raw.matchAll(/\b(50|30|20|15|10)\s*l\b/gi),
        ...raw.matchAll(/(?:\d{1,2}\s*x\s*|\bx\s*)(50|30|20|15|10)(?![.,]\s*\d)/gi),
      ].map((m) => m[1]));
      // Objem z raw textu smí přepsat obal od AI JEN pokud víme, že patří právě
      // téhle položce: známe její quantity (párujeme podle ní), nebo je v raw
      // textu JEDINÝ objem KEG (jednoznačné). Při více objemech a neznámém
      // množství bychom správný obal (např. "KEG 10l") mohli přepsat špatně.
      const kegVolFromRaw = kegVolByQty ?? (rawKegVols.size === 1 ? [...rawKegVols][0] : null);
      // Opravujeme JEN KEG-ové obaly (slovo "keg"/"sud" NEBO objem s "l" jako
      // "30l"), aby nedošlo k přepsání PET/lahví na stejném řádku.
      const labelIsKegVol = item.package_label && (/\bkeg\b|\bsud\b/i.test(item.package_label) || /\b(50|30|20|15|10)\s*l\b/i.test(item.package_label));
      if (kegVolFromRaw && labelIsKegVol) {
        const rawVolNum = parseInt(kegVolFromRaw, 10);
        const labelVolMatch = item.package_label.match(/(50|30|20|15|10)\s*l?/i);
        if (labelVolMatch && parseInt(labelVolMatch[1], 10) !== rawVolNum) {
          item.package_label = item.package_label.replace(/(50|30|20|15|10)\s*l?/i, kegVolFromRaw + 'l');
        }
      }
      // Explicit bottle size override from raw text (e.g. 20x0,5 -> Lahve 0.5l)
      // ⚠️ raw_line může obsahovat VÍCE položek s RŮZNÝMI obaly na jednom řádku
      // (např. "SV 12 = 3x50l KEG + 24x1,5l PET + 20x0,5l lahev"). Tento override
      // smí přepsat obal JEN položkám, které AI označila jako lahev (Lahve/0,5/
      // 0,33/sklo) nebo jimž obal chybí A jejichž množství odpovídá počtu lahví.
      // Nikdy nepřepisuj KEG/PET položky na stejném řádku.
      const aiLabelIsBottle = item.package_label && /\blahv\b|\bflas\b|\bsklo\b|0[.,](5|33)/i.test(item.package_label);
      const bottleQty05 = raw.match(/(\d{1,3})\s*x\s*0[,.]5/i);
      const bottleQty033 = raw.match(/(\d{1,3})\s*x\s*0[,.]33/i);
      const qtyMatchesBottles = () => {
        const qm = bottleQty05 || bottleQty033;
        return !qm || item.quantity == null || Number(qm[1]) === item.quantity;
      };
      if (aiLabelIsBottle || (!item.package_label && qtyMatchesBottles())) {
        if (/\b0[,.]5\s*l?\b|\b20\s*x\s*0[,.]5/i.test(raw) && !/\b0[,.]33\s*l?\b/i.test(raw)) {
          item.package_label = 'Lahve 0.5l';
        } else if (/\b0[,.]33\s*l?\b|\b20\s*x\s*0[,.]33/i.test(raw)) {
          item.package_label = 'Lahve 0.33l';
        }
      }
      const normLabel = normalize(item.package_label);
      pkg = matchPackage(normLabel, packages, aliases);
      if (!pkg) {
        const volMatch = item.package_label.match(/(\d+[.,]?\d*)\s*l/i);
        if (volMatch) pkg = volToPackage(volMatch[1], packages, normLabel + ' ' + rawNorm);
      }
    }

    if (!pkg) {
      pkg = matchPackage(rawNorm, packages, aliases);
    }
    if (!pkg) {
      // Nejprve zkus specificky najít "0,5" / "0.5" / "0,33" / "0.33" (skleněné lahve)
      const bottleMatch = raw.match(/\b0[.,](5|33)\b/);
      if (bottleMatch) {
        pkg = volToPackage(bottleMatch[1] === '5' ? '0.5' : '0.33', packages, rawNorm);
      }
    }
    if (!pkg) {
      const volMatch = raw.match(/(\d+[.,]?\d*)\s*l?\b/);
      if (volMatch) pkg = volToPackage(volMatch[1], packages, rawNorm);
    }
    // 🧠 RESTAURACE, TERASA, BAR, HOSPODA: Pokud není v raw textu explicitně uveden jiný obal (30l/20l/15l/pet/lahev),
    // všechny sudy a položky jsou VŽDY 50L (KEG 50l)! 10% je 10° pivo v 50l sudu, 12% je 12° pivo v 50l sudu!
    const isRestauraceOrTerasa = /\b(restaurace|terasa|bar|hospoda)\b/i.test(
      (item.place_name || '') + ' ' + (lastPlaceName || '') + ' ' + (item.raw_line || '') + ' ' + (raw || '')
    );
    if (isRestauraceOrTerasa) {
      const rawHasExplicitOther =
        /\b30\s*l\b|\b30\s*litr|\bsud\s*30\b|\bkeg\s*30\b|\b\d{1,2}\s*x\s*30\b(?![%°])/i.test(raw) ||
        /\b20\s*l\b|\b20\s*litr|\bsud\s*20\b|\bkeg\s*20\b|\b\d{1,2}\s*x\s*20\b(?![%°])/i.test(raw) ||
        /\b15\s*l\b|\b15\s*litr|\bsud\s*15\b|\bkeg\s*15\b/i.test(raw) ||
        /\b10\s*l\b|\b10\s*litr|\bsud\s*10\b|\bkeg\s*10\b/i.test(raw) ||
        /\bpet\b|\b1[.,]5\s*l\b/i.test(raw) ||
        /\blahv\b|\bsklo\b|\b0[.,](5|33)\b/i.test(raw);

      if (!rawHasExplicitOther) {
        const keg50 = packages.find((p) => Number(p.volume_l) === 50 || /50/i.test(p.label));
        if (keg50) {
          pkg = keg50;
          item.package_label = keg50.label;
        }
      }
    }

    // 🧠 VÝČEP / "sv l" / "tm l" BEZ OBJEMU → výchozí KEG 30l (pokud to není restaurace/terasa).
    // Pokud text zmiňuje pivo (světlé/tmavé/výčep) s "l" (litr/sud) nebo jen
    // "vycep", ale bez konkrétního objemu, použij výchozí KEG 30l.
    if (!pkg && (/\bsv\s*l\b|\bsvetl[ée]\s*l\b|\btm\s*l\b|\btmav[ée]\s*l\b|\bvycep\b|\bvýčep\b|\bvycepni\b|\bvýčepní\b/i.test(raw))) {
      pkg = isRestauraceOrTerasa
        ? (packages.find((p) => Number(p.volume_l) === 50 || /50/i.test(p.label)) ?? volToPackage('30', packages, rawNorm))
        : volToPackage('30', packages, rawNorm);
    }

    // 🧠 „2x50“ BEZ OBALU/MNOŽSTVÍ OD AI — POSLEDNÍ ZÁCHRANA:
    // Když AI rozpozná jen text "2x50" (2× sud 50l) a NENaplní obal ani množství,
    // odvodíme je přesně z raw textu: (množství) x (objem sudu). Bez toho by se
    // "2x50" vyhodilo jako prázdná objednávka (chybí pivo/obal/množství).
    // Vzor: "2x50", "2 x 50", "2x50l", "3x 30", "10x50" ...
    if (!pkg || item.quantity == null) {
      const kegXPairs = [...raw.matchAll(/(\d{1,2})\s*x\s*(50|30|20|15|10)(?:\s*l\b)?/gi)];
      const pkgVol = pkg ? Math.round(pkg.volume_l) : null;
      // Přednost má pár, jehož objem odpovídá obalu položky od AI (AI řekla
      // obal, ale chybí množství) — např. "KEG 10l" + "7x30 2x10 1x20" → 2x10.
      const kegXMatch =
        (item.quantity == null && pkgVol != null ? kegXPairs.find((m) => parseInt(m[2], 10) === pkgVol) : undefined)
        ?? kegXPairs[0];
      if (kegXMatch) {
        const n = parseInt(kegXMatch[1], 10);
        const vol = kegXMatch[2];
        if (!pkg) {
          pkg = volToPackage(vol, packages, rawNorm + ' ' + (item.package_label || ''));
        }
        if (item.quantity == null && n >= 1) {
          item.quantity = n;
        }
      }
    }



    const qty = item.quantity ?? null;

    const issues: string[] = [];
    if (!qty) issues.push('množství');
    if (!beer) issues.push('pivo');
    if (!pkg) issues.push('obal');

    const hasAnything = qty || beer || pkg;
    const confidence: ParsedLine['confidence'] = (qty && beer && pkg)
      ? 'high'
      : hasAnything ? 'low' : 'unknown';

    // 🧠 ODBĚRATEL: Oprav place_name pomocí naučených aliasů a známých míst.
    // 1) Nejprve zkus naučené aliasy (špatný název z fotky → správný název).
    // 2) Pak zkus najít shodu se známými místy (přibližná/fonetická shoda).
    // 3) Pokud AI nevrátila place_name, zkus ho odvodit z raw textu.
    // 4) Pokud stále nic, "zděď" odběratele z předchozí položky.
    let resolvedPlaceName = item.place_name ?? null;

    // 3) Pokud AI nevrátila place_name, zkus ho najít v raw textu položky
    if (!resolvedPlaceName && places && places.length > 0) {
      const matched = matchPlaceFromText(raw, places, placeAliasMap);
      if (matched.placeId && matched.placeName) {
        resolvedPlaceName = matched.placeName;
      }
    }

    // 1) Naučené aliasy
    if (resolvedPlaceName && placeAliasMap.size > 0) {
      const normPlace = normalizePlace(resolvedPlaceName);
      const aliasPlaceId = placeAliasMap.get(normPlace);
      if (aliasPlaceId && places) {
        const place = places.find((p) => p.id === aliasPlaceId);
        if (place) resolvedPlaceName = place.name;
      }
    }
    // 2) Přibližná shoda se známými místy
    if (resolvedPlaceName && places && places.length > 0) {
      const matched = matchPlaceFromText(resolvedPlaceName, places, placeAliasMap);
      if (matched.placeId && matched.placeName) {
        resolvedPlaceName = matched.placeName;
      }
    }

    // 4) Pokud stále nemáme odběratele, "zděď" ho z předchozí položky
    if (!resolvedPlaceName && lastPlaceName) {
      resolvedPlaceName = lastPlaceName;
    }

    // Aktualizuj posledního známého odběratele
    if (resolvedPlaceName) {
      lastPlaceName = resolvedPlaceName;
    }

    // 🧠 DEDUPLIKACE: NEodstraňujeme položky se stejným pivem/obalem/množstvím,
    // protože uživatel může objednat stejné pivo VÍCEKRÁT (např. "2x50 12sv a
    // dalsi 2x50 12sv" = 4x50 12sv celkem). Duplicity se řeší až v
    // dedupeAgainstExisting (proti existujícím položkám v objednávce).
    // Uživatel může duplicity odstranit ručně v kontrolním zobrazení.

    // Duplicitní výskyt stejné položky v rámci jednoho parsování (identická place_name, beer_id, package_id, quantity) — odstranit jeden z nich.
    // Zabrání duplikátům, které vznikly opakováním objednávky v konverzaci.
    const dedupKey = [normalizePlace(resolvedPlaceName ?? ''), beer?.id, pkg?.id, qty].filter(Boolean).join('|');
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    results.push({

      raw,
      originalLine: raw,
      quantity: qty,
      beer_id: beer?.id ?? null,
      beer_name: beer?.name ?? null,
      package_id: pkg?.id ?? null,
      package_label: pkg?.label ?? null,
      confidence,
      issues,
      matched_alias: alias,
      place_name: resolvedPlaceName,
      date: item.date ?? null,
      bbox: item.bbox ?? undefined,
      photo_index: photoIndex,
    } as ParsedLine);


  }


  return results;
}

export function dedupeAgainstExisting(
  parsed: ParsedLine[],
  existing: { beer_id: string | null; package_id: string | null; quantity: number }[],
): { line: ParsedLine; duplicate: boolean }[] {
  const existingKeys = new Set(existing.map((e) => `${e.beer_id ?? ''}|${e.package_id ?? ''}|${e.quantity}`));
  return parsed.map((line) => {
    const key = `${line.beer_id ?? ''}|${line.package_id ?? ''}|${line.quantity ?? ''}`;
    const duplicate = line.beer_id != null && line.package_id != null && line.quantity != null && existingKeys.has(key);
    return { line, duplicate };
  });
}

// Uložení naučené zkratky do localStorage i Supabase databáze
export async function saveAlias(aliasText: string, beerId: string | null, packageId: string | null): Promise<void> {
  const norm = normalize(aliasText);
  if (!norm || norm.length < 2) return;

  // 1. Okamžitá paměť do localStorage
  try {
    const localSaved = localStorage.getItem('user_learned_aliases');
    const localMap = localSaved ? JSON.parse(localSaved) : { beer: {}, package: {} };
    if (beerId) localMap.beer[norm] = beerId;
    if (packageId) localMap.package[norm] = packageId;
    localStorage.setItem('user_learned_aliases', JSON.stringify(localMap));
  } catch {}

  // 2. Trvalý uložení do Supabase
  try {
    const { supabase } = await import('./supabase');
    // Merge: oprava JEN piva nebo JEN obalu nesmí smazat tu druhou dimenzi,
    // kterou si AI už dříve zapamatovala (např. "sud" → beer X + package Y).
    const { data: existing } = await supabase
      .from('parser_aliases')
      .select('id, beer_id, package_id, hit_count')
      .eq('alias_text', norm)
      .maybeSingle();
    if (existing) {
      await supabase.from('parser_aliases').update({
        beer_id: beerId ?? (existing as any).beer_id ?? null,
        package_id: packageId ?? (existing as any).package_id ?? null,
        hit_count: (existing.hit_count ?? 0) + 1, updated_at: new Date().toISOString(),
      }).eq('id', (existing as any).id);
    } else {
      await supabase.from('parser_aliases').insert({
        alias_text: norm, beer_id: beerId ?? null, package_id: packageId ?? null, hit_count: 1,
      });
    }
  } catch {}
}

// Uložení naučeného aliasu pro místo (place) do localStorage i Supabase.
// Když uživatel opraví odběratele, který AI/OCR rozpoznal špatně, uložíme
// mapping: špatný název (aliasText) → správný odběratel (placeId + correctName).
// correctName se ukládá, aby ji mohla použít AI (edge funkce) a auto-parse
// (matchPlaceSafely páruje correct_name proti katalogu odběratelů).
export async function savePlaceAlias(aliasText: string, placeId: string, correctName?: string): Promise<void> {
  const norm = normalizePlace(aliasText);
  if (!norm || norm.length < 2) return;

  // 1. Okamžitá paměť do localStorage (wrong_name → placeId)
  try {
    const localSaved = localStorage.getItem('user_learned_place_aliases');
    const localMap = localSaved ? JSON.parse(localSaved) : {};
    if (placeId) localMap[norm] = placeId;
    localStorage.setItem('user_learned_place_aliases', JSON.stringify(localMap));
  } catch {}

  // 2. Trvalé uložení do Supabase (tabulka place_aliases: wrong_name → místo)
  try {
    const { supabase } = await import('./supabase');
    const { data: existing } = await supabase
      .from('place_aliases')
      .select('id, correct_name, hit_count')
      .eq('wrong_name', norm)
      .maybeSingle();
    if (existing) {
      await supabase.from('place_aliases').update({
        place_id: placeId || null,
        correct_name: correctName ?? (existing as any).correct_name ?? '',
        hit_count: (existing.hit_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', (existing as any).id);
    } else {
      await supabase.from('place_aliases').insert({
        wrong_name: norm,
        place_id: placeId || null,
        correct_name: correctName ?? '',
        hit_count: 1,
      });
    }
  } catch {}
}

// Načtení naučených aliasů pro místa (špatný název → placeId)
export async function loadPlaceAliasMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // 1. Načtení z localStorage
  try {
    const localSaved = localStorage.getItem('user_learned_place_aliases');
    if (localSaved) {
      const parsed = JSON.parse(localSaved);
      Object.entries(parsed).forEach(([k, v]) => map.set(k, v as string));
    }
  } catch {}

  // 2. Načtení ze Supabase (tabulka place_aliases)
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.from('place_aliases').select('wrong_name, place_id').not('place_id', 'is', null);
    for (const a of (data ?? []) as any[]) {
      if (a.place_id) map.set(a.wrong_name, a.place_id);
    }
  } catch {}

  return map;
}

export async function loadAliasMap(): Promise<ParserAliasMap> {
  const map = emptyAliasMap();

  // 1. Načtení z localStorage
  try {
    const localSaved = localStorage.getItem('user_learned_aliases');
    if (localSaved) {
      const parsed = JSON.parse(localSaved);
      if (parsed.beer) Object.entries(parsed.beer).forEach(([k, v]) => map.beer.set(k, v as string));
      if (parsed.package) Object.entries(parsed.package).forEach(([k, v]) => map.package.set(k, v as string));
    }
  } catch {}

  // 2. Načtení ze Supabase
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.from('parser_aliases').select('*');
    for (const a of (data ?? []) as any[]) {
      if (a.beer_id) map.beer.set(a.alias_text, a.beer_id);
      if (a.package_id) map.package.set(a.alias_text, a.package_id);
    }
  } catch {}

  return map;
}

// Vyhledá odběratele (hospodu/místo) z fotky nebo textu
// Hledá v CELÉM textu (nejen v parsovaných položkách)
export function matchPlaceFromText(
  rawText: string,
  places: Place[],
  placeAliasMap?: Map<string, string>,
): { placeId: string | null; placeName: string | null } {
  if (!rawText || !places.length) return { placeId: null, placeName: null };
  const normText = normalizePlace(rawText);

  // Odstraníme jména odesílatelů z textu, aby nebránila vyhledání skutečného odběratele (Maneo, Malešice, atd.)
  const ignoredSenders = ['pojmi', 'bednar', 'bendat', 'gabina', 'gabinka', 'gabina ucetni', 'ucetni', 'sladek', 'petr', 'sladecek'];
  let cleanText = normText;
  for (const s of ignoredSenders) {
    cleanText = cleanText.replace(new RegExp('\\b' + s + '\\b', 'gi'), ' ').replace(/\s+/g, ' ');
  }

  // 0. Try to match against learned place aliases first
  if (placeAliasMap && placeAliasMap.size > 0) {
    for (const [alias, placeId] of placeAliasMap) {
      if (cleanText.includes(alias)) {
        const place = places.find((p) => p.id === placeId);
        if (place) return { placeId: place.id, placeName: place.name };
      }
    }
  }

  // 0b. Try to match against known aliases / common OCR misreads first
  const ocrSubstitutions: [RegExp, string][] = [
    [/\bseeger\b/i, 'seeberg'],
    [/\bseeg[eé]r\b/i, 'seeberg'],
    [/\bzeeburg\b/i, 'seeberg'],
    [/\blabut[ěe]\b/i, 'u labute'],
    [/\bmalessice\b/i, 'malesice'],
    [/\bmalenovice\b/i, 'malesice'],
    [/\bzajic\b/i, 'u zajice'],
    [/\bzajíc\b/i, 'u zajice'],
    [/\bhostinec\b/i, 'hospoda'],
    [/\bhostinec\s+u\b/i, 'hospoda u'],
    [/\bposezeni\b/i, 'posezení'],
    [/\brestaurace\b/i, 'restaurace'],
    [/\bve[h]?k[eé]\s+namesti\b/i, 'velké náměstí'],
    [/\bna\s+perku\b/i, 'na pérku'],
    [/\bna\s+spilce\b/i, 'na špilce'],
    [/\bu\s+jezirka\b/i, 'u jezírka'],
    [/\bu\s+rybnicka\b/i, 'u rybníčka'],
    [/\bpod\s+lipou\b/i, 'pod lipou'],
    [/\bpod\s+lesem\b/i, 'pod lesem'],
    [/\bna\s+vyhlidce\b/i, 'na vyhlídce'],
    [/\bna\s+kopci\b/i, 'na kopci'],
    [/\bu\s+hasicu\b/i, 'u hasičů'],
    [/\bna\s+ruzku\b/i, 'na růžku'],
    [/\bpod\s+skalkou\b/i, 'pod skalkou'],
    [/\bna\s+skalce\b/i, 'na skalce'],
    [/\bu\s+studny\b/i, 'u studny'],
    [/\bna\s+vyhledu\b/i, 'na výhledu'],
    [/\bve\s+sklepe\b/i, 've sklepě'],
    [/\bu\s+jezera\b/i, 'u jezera'],
    [/\bna\s+louce\b/i, 'na louce'],
    [/\bpod\s+horou\b/i, 'pod horou'],
    [/\bna\s+hrinci\b/i, 'na hrinci'],
    [/\bu\s+potoka\b/i, 'u potoka'],
    [/\bna\s+veseli\b/i, 'na veselí'],
  ];
  // 0b. Ochrana reálných míst: pokud text UŽ obsahuje název místa z katalogu,
  //     OCR substituce NESPOUŠTÍME. Jinak by přepsala i správný název — např.
  //     "malenovice" je reálná obec (Malenovice u Zlína) a nesmí se automaticky
  //     měnit na "malesice". Naučené aliasy a přibližná shoda níže to vyřeší.
  const textAlreadyHasPlace = places.some((p) => {
    const np = normalizePlace(p.name);
    return np.length >= 3 && cleanText.includes(np);
  });

  let correctedText = cleanText;
  if (!textAlreadyHasPlace) {
    for (const [pattern, replacement] of ocrSubstitutions) {
      correctedText = correctedText.replace(pattern, replacement);
    }
    if (correctedText !== cleanText) {
      // Try matching with corrected text
      for (const p of places) {
        const np = normalizePlace(p.name);
        if (np.length < 3) continue;
        if (correctedText.includes(np)) {
          return { placeId: p.id, placeName: p.name };
        }
      }
    }
  }

  // 1. Exact substring match — prefer longest match to avoid short false positives
  let bestMatch: { place: Place; len: number } | null = null;
  for (const p of places) {
    const np = normalizePlace(p.name);
    if (np.length < 3) continue;
    if (cleanText.includes(np) && (!bestMatch || np.length > bestMatch.len)) {
      bestMatch = { place: p, len: np.length };
    }
  }
  if (bestMatch) return { placeId: bestMatch.place.id, placeName: bestMatch.place.name };

  // 1b. Try matching individual significant words from place name in text
  //     (handles cases where OCR merges/splits words differently)
  let wordBest: { place: Place; score: number } | null = null;
  for (const p of places) {
    const np = normalizePlace(p.name);
    if (np.length < 4) continue;
    const words = np.split(/\s+/).filter((w) => w.length >= 3);
    if (words.length === 0) continue;
    // Check if ANY significant word from place name appears in text
    const anyWordMatch = words.some((w) => normText.includes(w));
    if (anyWordMatch) {
      const matched = words.filter((w) => normText.includes(w)).length;
      const score = matched / words.length;
      if (!wordBest || score > wordBest.score) {
        wordBest = { place: p, score };
      }
    }
  }
  if (wordBest && wordBest.score >= 0.5) {
    return { placeId: wordBest.place.id, placeName: wordBest.place.name };
  }

  // 2. Word-level token match — each word of place name must appear in text
  let tokenBest: { place: Place; score: number } | null = null;
  for (const p of places) {
    const np = normalizePlace(p.name);
    if (np.length < 4) continue;
    const words = np.split(/\s+/).filter((w) => w.length >= 3);
    if (words.length === 0) continue;
    const matched = words.filter((w) => normText.includes(w)).length;
    const score = matched / words.length;
    if (score >= 0.75 && (!tokenBest || score > tokenBest.score)) {
      tokenBest = { place: p, score };
    }
  }
  if (tokenBest) return { placeId: tokenBest.place.id, placeName: tokenBest.place.name };

  // 3. Fuzzy fallback — lowered threshold to 0.60 for OCR tolerance.
  //    Povolujeme i kratší názvy (3+ znaky), aby se rozpoznali i odběratelé
  //    s krátkým jménem (např. "Bar", "K2", "U Z"), které OCR často zkomolí.
  let bestFuzzy: Place | null = null;
  let bestScore = 0;
  for (const p of places) {
    const np = normalizePlace(p.name);
    if (np.length < 3) continue;
    const s = bestFuzzyScoreInText(np, normText);
    if (s > bestScore) { bestScore = s; bestFuzzy = p; }
  }
  if (bestFuzzy && bestScore >= 0.60) {
    return { placeId: bestFuzzy.id, placeName: bestFuzzy.name };
  }


  return { placeId: null, placeName: null };
}

const NOTE_PATTERNS: { re: RegExp; label: string | ((m: RegExpMatchArray) => string) }[] = [
  { re: /\b(\+\s*)?vycep\b|\bvycepy\b|\bvycepu\b|\bvycepni\b|\bpujcit\s*vycep\b|\bchlazeni\b|\bchladak\b|\bhospoda\b|\bna[řr]azec\b|\bna[řr]azen[ií]\b/i, label: (m) => m[0].trim() },
  // 🚰 PIPA / KOHOUT — výčep se rezervuje i když je napsáno "pipa", "dvojkohout",
  // "jednokohout", "trojkohout", "kohout" apod. (nejen slovo "výčep").
  { re: /\b(jedno|dvoj|troj|ctyr|sesti)?(pipa|pipy|pipu|kohout|kohouty)\b/i, label: (m) => m[0].trim() },

  // 🥛 SKLO — do poznámky jen když je to skutečný požadavek (např. "přidat/ještě/a sklo"),
  // ne samostatné vágní slovo "sklo"/"sklo?" (což AI z fotky zapisuje omylem).
  { re: /\bsklenic[eí]?\b|(?:pridat\s+|je[sš]t[íěe]?\s+|a\s+|i\s+)sklo\b/i, label: 'sklo' },
  { re: /(?:pridat\s+|je[sš]t[íěe]?\s+|a\s+|i\s+)podt[aá]ck[y]?\b|\bpodt[aá]c[eě]k\b/i, label: 'podtácky' },
  { re: /\bzavoz\s+(v[e]?\s+)?(pondeli|utery|stredu|ctvrtek|patek|sobotu|nedeli|\d{1,2}\.\d{1,2}\.)(\s+v\s+\d{1,2}(:\d{2})?\s*(h|hod)?)?/i, label: (m) => m[0] },
  { re: /\bdodat\s+(v[e]?\s+)?(pondeli|utery|stredu|ctvrtek|patek|sobotu|nedeli|\d{1,2}\.\d{1,2}\.)(\s+v\s+\d{1,2}(:\d{2})?\s*(h|hod)?)?/i, label: (m) => m[0] },
  { re: /\b(cas|hodin[a]|v)\s+\d{1,2}(:\d{2})?\s*(h|hod)?\b/i, label: (m) => m[0] },
  { re: /\bbez\s*etiket/i, label: 'bez etikety' },
  { re: /\bbez\s*etiket[a]?\b/i, label: 'bez etikety' },
  { re: /\(\s*bez\s*etiket/i, label: 'bez etikety' },

  { re: /\betiket[a]?\s*mm\b/i, label: 'etiketa MM' },
  { re: /\betiket[a]?\s*m\b(?!\w)/i, label: 'etiketa M' },
  { re: /\betiket[a]?\s*xxl\b/i, label: 'etiketa XXL' },
  { re: /\bvraceni\s*lahvi\b|\bvratne\s*lahve\b|\bvratne\b/i, label: 'vrácení lahví' },
  { re: /\bspotak(y)?\b/i, label: 'spoták' },
  { re: /\bplaceno\b|\bzaplaceno\b/i, label: 'zaplaceno' },
  { re: /\bfaktur/i, label: 'faktura' },
  { re: /\bsleva\b/i, label: 'sleva' },
];

export function detectOrderNotes(rawText: string): string {
  const found: string[] = [];
  for (const { re, label } of NOTE_PATTERNS) {
    const m = rawText.match(re);
    if (m) {
      const textLabel = typeof label === 'function' ? label(m) : label;
      if (textLabel && !found.includes(textLabel)) found.push(textLabel);
    }
  }
  return found.join(', ');
}

export function parseFreeTextEntries(
  rawText: string,
  beers: Beer[],
  packages: Package[],
  aliasMap?: ParserAliasMap,
): ParsedLine[] {
  const aliases = aliasMap ?? emptyAliasMap();

  let segments = rawText
    .split(/[,;+]|(?:\s+a\s+)(?=\d)|(?:\s*=\s*)/i)
    .map((s) => ocrNormalizeLine(s.trim()))
    .filter((s) => s.length > 0);


  segments = segments.flatMap((seg) => splitByQtyBoundaries(seg));

  // 🧠 "VŠE [stupeň]" NA KONCI OBJEDNÁVKY — aplikuj na všechny položky
  const globalDegree = extractGlobalDegree(rawText);

  return parseSegments(segments, beers, packages, aliases, globalDegree);
}

function splitByQtyBoundaries(seg: string): string[] {

  const re = /\d{1,4}\s*(?:x|ks|×)\b/gi;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) starts.push(m.index);
  if (starts.length <= 1) return [seg];

  // 🧠 STUPEŇ NA ZAČÁTKU ŘÁDKU SE APLIKUJE NA VŠECHNY POLOŽKY:
  // Pokud segment začíná stupněm (např. "11sv 3x30 3x20 15x1"), zachovej
  // tento stupeň a přidej ho ke KAŽDÉ rozdělené části.
  const leadingDegreeMatch = seg.match(/^\s*(8|9|10|11|12|13|14)\s*(sv|svet|svetl|svetle|svetly|tm|tma|tmav|tmava|tmavy|tmave|dark|°)?\b/i);
  const leadingDegree = leadingDegreeMatch ? leadingDegreeMatch[0].trim() : null;

  const parts: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : seg.length;
    let part = seg.slice(start, end).trim();
    if (part) {
      // Přidej stupeň ze začátku ke každé části
      if (leadingDegree && !part.toLowerCase().includes(leadingDegree.toLowerCase())) {
        part = leadingDegree + ' ' + part;
      }
      parts.push(part);
    }
  }
  return parts;
}


function parseSegments(
  segments: string[],
  beers: Beer[],
  packages: Package[],
  aliases: ParserAliasMap,
  globalDegree?: { degree: string | null; color: string | null },
): ParsedLine[] {

  const results: ParsedLine[] = [];
  const seen = new Set<string>();

  for (const seg of segments) {
    const cleaned = ocrCleanupQuantities(seg);
    const qtyMatch = cleaned.match(/^\s*(\d{1,4})\s*(?:x|ks|×)?\s*/i) ?? cleaned.match(/(\d{1,4})\s*(?:x|ks|×)\s*/i);
    let qty = qtyMatch ? parseInt(qtyMatch[1], 10) : null;
    let rest = qtyMatch ? cleaned.slice((qtyMatch.index ?? 0) + qtyMatch[0].length) : cleaned;

    // Slovní množství: "dva", "tri", "ctyri", "pet", "sest", "sedm", "osm", "devet", "deset"
    if (qty === null) {
      const wordQty = rest.match(/^\s*(dva|dve|tri|ctyri|pet|sest|sedm|osm|devet|deset)\b/i);
      if (wordQty) {
        const map: Record<string, number> = { dva: 2, dve: 2, tri: 3, ctyri: 4, pet: 5, sest: 6, sedm: 7, osm: 8, devet: 9, deset: 10 };
        qty = map[wordQty[1].toLowerCase()] ?? null;
        rest = rest.slice((wordQty.index ?? 0) + wordQty[0].length);

      }
    }

    const norm = normalize(rest || cleaned);

    let { beer, alias } = matchBeerFromHints(norm, beers, aliases);


    // 🧠 "VŠE [stupeň]" NA KONCI OBJEDNÁVKY — pokud položka nemá pivo,
    // zkus ho najít podle globálního stupně z konce objednávky
    if (!beer && globalDegree?.degree) {
      const gd = globalDegree.degree + '°';
      ({ beer, alias } = matchBeerFromHints(normalize(gd), beers, aliases));
    }


    let pkg: Package | null = null;
    // Volume match — ordered from most specific to least: 1,5 before 1 before 0,5
    // Také zachytí kompaktní formát "50l12sv" (objem + stupeň + barva bez mezer)
    const volMatch = norm.match(/\b(50|30|20|15|10|1[,.]5|1[,.]0|0[,.]5|0[,.]33)\s*l?\b|(?<!\d)\b(1)\s*l\b|(\d{1,2})l(?=\d)/);
    if (volMatch) pkg = volToPackage((volMatch[1] ?? volMatch[2] ?? volMatch[3]).replace(',', '.'), packages, norm);
    if (!pkg) pkg = matchPackage(norm, packages, aliases);

    if (!pkg && /\bkeg\b|\bsud\b|\bsudy\b/.test(norm)) {
      pkg = volToPackage('30', packages, norm);
    }
    if (!pkg && /\b1[,.]5\b/.test(norm)) {
      pkg = volToPackage('1.5', packages, norm);
    }
    if (!pkg && /\bpet\b|\bpetka\b/.test(norm)) {
      pkg = volToPackage('1', packages, norm);
    }
    if (!pkg && /\blahv|\bflas|\bsklo/.test(norm)) {
      pkg = volToPackage('0.5', packages, norm);
    }

    // 🧠 BEDNY (PŘEPRAVKY) S LAHVEMI: "2 bedny tmavého" = 2 × 20 = 40 ks lahví 0.33l.
    // JEDNA bedna = 20 ks lahví 0.33l. Stupeň/barva piva se určí z textu.
    const crateMatch = cleaned.match(/(\d{1,4})\s*(?:x|ks|×)?\s*(bedn|prepravk|přepravk)/i);
    if (crateMatch) {
      const crates = parseInt(crateMatch[1], 10);
      qty = crates * 20;
      const cratePkg = volToPackage('0.33', packages, norm);
      if (cratePkg) pkg = cratePkg;
    }

    // Pokud je objem (obal) ale žádné explicitní množství, předpokládej 1 ks
    if (qty === null && pkg) qty = 1;


    const issues: string[] = [];
    if (!qty) issues.push('množství');
    if (!beer) issues.push('pivo');
    if (!pkg) issues.push('obal');

    const hasAnything = qty || beer || pkg;
    if (!hasAnything) continue;
    const confidence: ParsedLine['confidence'] = (qty && beer && pkg) ? 'high' : 'low';

    const key = `${beer?.id ?? ''}|${pkg?.id ?? ''}|${qty ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      raw: seg,
      originalLine: seg,
      quantity: qty,
      beer_id: beer?.id ?? null,
      beer_name: beer?.name ?? null,
      package_id: pkg?.id ?? null,
      package_label: pkg?.label ?? null,
      confidence,
      issues,
      matched_alias: alias,
    });
  }


  return results;
}

function normalizePlace(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function parseVoiceOrder(
  rawText: string,
  beers: Beer[],
  packages: Package[],
  places: Place[],
  aliasMap?: ParserAliasMap,
  placeAliasMap?: Map<string, string>,
): ParsedVoiceOrder {
  let text = rawText.trim();
  let placeId: string | null = null;
  let placeName: string | null = null;

  // 0. Try learned place aliases on the ENTIRE text first
  if (!placeName && placeAliasMap && placeAliasMap.size > 0 && places.length) {
    const normText = normalizePlace(text);
    for (const [alias, pid] of placeAliasMap) {
      if (normText.includes(alias)) {
        const place = places.find((p) => p.id === pid);
        if (place) {
          placeId = place.id;
          placeName = place.name;
          const re = new RegExp(place.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          text = text.replace(re, ' ');
          break;
        }
      }
    }
  }

  // 1. Try explicit "pro [place]" pattern
  if (!placeName) {
    const explicitMatch = text.match(/\b(?:objedn[áa]vka\s+)?pro\s+([^,;]+?)(?=[,;]|\s+\d|$)/i);
    if (explicitMatch) {
      const candidate = explicitMatch[1].trim();
      if (candidate.length >= 2) {
        const normCand = normalizePlace(candidate);
        const place = places.find((p) => normalizePlace(p.name) === normCand)
          ?? places.find((p) => normalizePlace(p.name).includes(normCand) || normCand.includes(normalizePlace(p.name)));
        placeId = place?.id ?? null;
        placeName = place?.name ?? candidate;
        text = text.slice(0, explicitMatch.index) + text.slice(explicitMatch.index! + explicitMatch[0].length);
      }
    }
  }

  // 2. Try matching place name in the ENTIRE remaining text
  if (!placeName && places.length) {
    const normText = normalizePlace(text);
    let bestMatch: { place: Place; len: number; idx: number } | null = null;
    for (const p of places) {
      const np = normalizePlace(p.name);
      if (np.length < 4) continue;
      const idx = normText.indexOf(np);
      if (idx >= 0 && (!bestMatch || np.length > bestMatch.len)) {
        bestMatch = { place: p, len: np.length, idx };
      }
    }
    if (bestMatch) {
      placeId = bestMatch.place.id;
      placeName = bestMatch.place.name;
      const re = new RegExp(bestMatch.place.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      text = text.replace(re, ' ');
    }
  }

  // 3. Fuzzy fallback
  if (!placeName && places.length) {
    const normText = normalizePlace(text);
    let bestPlace: Place | null = null;
    let bestScore = 0;
    for (const p of places) {
      const np = normalizePlace(p.name);
      if (np.length < 4) continue;
      const s = bestFuzzyScoreInText(np, normText);
      if (s > bestScore) { bestScore = s; bestPlace = p; }
    }
    if (bestPlace && bestScore >= 0.80) {
      placeId = bestPlace.id;
      placeName = bestPlace.name;
      const re = new RegExp(bestPlace.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      text = text.replace(re, ' ');
    }
  }

  const items = parseFreeTextEntries(text, beers, packages, aliasMap);
  return { items, placeId, placeName };
}

/**
 * Bezpečné získání nebo vytvoření odběratele (places)
 * Vždy vrátí existujícího odběratele (i při shodě bez diakritiky nebo velkých písmen)
 * a zabrání chybám databázového uníkátního klíče (places_name_lower_uniq).
 */
export async function getOrCreatePlace(name: string, places: Place[] = []): Promise<Place | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const qNorm = norm(trimmed);

  // 1. Zkontroluj paměťové pole odběratelů
  const existingInMemory = places.find((p) => norm(p.name) === qNorm);
  if (existingInMemory) return existingInMemory;

  // 2. Pokus se vložit přes běžného klienta (RLS povoluje přihlášeným uživatelům)
  try {
    const { supabase } = await import('./supabase');
    const { lookupPlaceOnline } = await import('./placeLookup');
    let address: string | null = null;
    let phone: string | null = null;
    try {
      const candidates = await lookupPlaceOnline(trimmed);
      if (candidates.length > 0) {
        address = candidates[0].address || null;
        phone = candidates[0].phone || null;
      }
    } catch {}

    const { data: newPlace, error } = await supabase
      .from('places')
      .insert({ name: trimmed, address, phone })
      .select()
      .single();
    if (!error && newPlace) return newPlace as Place;
  } catch {}

  // 3. Záložní řešení: Načti všechny odběratele z DB a spáruj bez diakritiky
  try {
    const { supabase } = await import('./supabase');
    const { data: dbPlaces } = await supabase.from('places').select('*');
    if (dbPlaces && dbPlaces.length > 0) {
      const dbMatch = dbPlaces.find((p) => norm(p.name) === qNorm) || dbPlaces.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
      if (dbMatch) return dbMatch as Place;
    }
  } catch {}

  return null;
}

// ─── Detekce duplicitní objednávky (stejný odběratel na více fotkách) ──────
// Používá se v ImportFromImage.tsx: po importu objednávky z fotky si pamatujeme
// (odběratel + datum + položky) a při další fotce se stejným odběratelem
// upozorníme uživatele a ukážeme obě objednávky vedle sebe k porovnání.

export type ImportedOrderItem = { beer_id: string; package_id: string; quantity: number };
export type ImportedOrder = { place: string; date: string; items: ImportedOrderItem[] };
export type OrderDupWarning = {
  place: string;
  prev: ImportedOrder;
  curr: { date: string; items: { raw: string; beer_id: string | null; package_id: string | null; quantity: number | null }[] };
};

export function normPlaceName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshteinDup(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  let prevRow = new Array(bl + 1);
  let curRow = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prevRow[j] = j;
  for (let i = 1; i <= al; i++) {
    curRow[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curRow[j] = Math.min(prevRow[j] + 1, curRow[j - 1] + 1, prevRow[j - 1] + cost);
    }
    [prevRow, curRow] = [curRow, prevRow];
  }
  return prevRow[bl];
}

// Přibližná shoda názvů odběratelů (překlepy / OCR šum z fotky).
export function placesMatch(a: string, b: string): boolean {
  const na = normPlaceName(a);
  const nb = normPlaceName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 3 && nb.length >= 3 && (na.includes(nb) || nb.includes(na))) return true;
  const maxLen = Math.max(na.length, nb.length);
  return 1 - levenshteinDup(na, nb) / maxLen > 0.72;
}

// Najde odběratele z aktuální fotky, který odpovídá nějaké dříve importované
// objednávce. Varování se týká hlavně případů, kdy položky NEJSOU úplně stejné
// (AI četla jinak / jde o novou objednávku téhož odběratele) — přesně stejné
// položky už řeší per-řádková duplikace (p.duplicate).
export function detectOrderDupWarnings(
  lines: { line: ParsedLine; duplicate: boolean }[],
  importedOrders: ImportedOrder[],
  globalPlace: string,
): OrderDupWarning[] {
  if (importedOrders.length === 0) return [];
  const groups = new Map<string, { place: string; date: string; items: OrderDupWarning['curr']['items']; anyNew: boolean }>();
  for (const w of lines) {
    if (w.line._removed) continue;
    const place = (w.line.place_name || '').trim() || globalPlace.trim();
    if (!place) continue;
    const key = `${normPlaceName(place)}||${w.line.date || ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { place, date: w.line.date || '', items: [], anyNew: false };
      groups.set(key, g);
    }
    g.items.push({
      raw: w.line.originalLine || w.line.raw,
      beer_id: w.line.beer_id,
      package_id: w.line.package_id,
      quantity: w.line.quantity,
    });
    if (!w.duplicate) g.anyNew = true;
  }
  const warnings: OrderDupWarning[] = [];
  for (const g of groups.values()) {
    if (!g.anyNew) continue; // přesně stejná objednávka → řeší per-item duplikace
    for (const prev of importedOrders) {
      if (placesMatch(g.place, prev.place)) {
        warnings.push({ place: g.place, prev, curr: { date: g.date, items: g.items } });
        break;
      }
    }
  }
  return warnings;
}
