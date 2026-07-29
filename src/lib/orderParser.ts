import type { Beer, Package, Place } from './supabase';

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
  photo_index?: number;
};

export type ParserAliasMap = {
  beer: Map<string, string>;
  package: Map<string, string>;
};

export function emptyAliasMap(): ParserAliasMap {
  return { beer: new Map(), package: new Map() };
}

const normalize = (s: string) =>
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
  { pattern: /\bvosm(a|u|e|y|icka|ička)?\b|\bosm(a|u|e|y|icka|ička)?\b|\bcyklo\s*osm(a|u)?\b|\bcykloosm(a|u)?\b|\bcyklo\b|\b8\s*°?\b|\b8st\b|\bosma\b|\bvosma\b/, degree: '8°' },
  { pattern: /\bdesitk(a|u|e|y)?\b|\bdesit(k)?\b|\bdesitku\b|\b10\s*°?\b|\b10\s*st\b|\b10sv\b|\bsvetle\s*vcepni\b|\bvycepni\s*svetle\b|\bdesitka\b/, degree: '10°', color: 'světlé' },
  { pattern: /\b11\s*(sv|svet|svetl)\b|\b11sv\b|\bjedenact(k)?(a|u|y)?\b|\bjedenactku\b|\bjedenactka\b/, degree: '11°', color: 'světlé' },
  { pattern: /\b12\s*(sv|svet|swet|svetl|light)\b|\b12sv\b|\bdvanactk(a|u|e|y)?\b|\bdvanactka\b|\bsvetla 12\b|\bsvetly 12\b|\bsvetly\s*lezak\b|\blezak\s*svetly\b|\bzajic\b|\bzajíc\b|\blezak\b(?!.*\btmav)/, degree: '12°', color: 'světlé' },
  { pattern: /\b12\s*(tm|tma|tmavy|tmava|dark|tmave)\b|\btl\b|\btmava\b|\btmave\b|\btmavy\b|\btmavy\s*lezak\b|\blezak\s*tmavy\b|\btm\b|\bcerne\b|\bcerna\b/, degree: '12°', color: 'tmavé' },
  { pattern: /\bjantar\b|\bjant\b|\bjantarek\b|\b13\s*°?\b|\b13st\b/, namePart: 'Jantar', degree: '13°' },
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

function matchBeerFromHints(norm: string, beers: Beer[], aliasMap: ParserAliasMap): { beer: Beer | null; score: number; alias: string | null } {
  const beerId = aliasMap.beer.get(norm);
  if (beerId) {
    const beer = beers.find((b) => b.id === beerId);
    if (beer) return { beer, score: 1.0, alias: norm };
  }
  for (const [alias, bid] of aliasMap.beer) {
    if (norm.includes(alias) && alias.length >= 2) {
      const beer = beers.find((b) => b.id === bid);
      if (beer) return { beer, score: 0.95, alias };
    }
  }

  let directMatch: Beer | null = null;
  let directLen = 0;
  for (const beer of beers) {
    const nameNorm = normalize(beer.name);
    if (nameNorm.length >= 3 && norm.includes(nameNorm) && nameNorm.length > directLen) {
      directMatch = beer;
      directLen = nameNorm.length;
    }
  }
  if (directMatch) return { beer: directMatch, score: 0.95, alias: null };

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

function matchPackage(norm: string, packages: Package[], aliasMap: ParserAliasMap): Package | null {
  const pkgId = aliasMap.package.get(norm);
  if (pkgId) {
    const pkg = packages.find((p) => p.id === pkgId);
    if (pkg) return pkg;
  }
  for (const [alias, pid] of aliasMap.package) {
    if (norm.includes(alias) && alias.length >= 2) {
      const pkg = packages.find((p) => p.id === pid);
      if (pkg) return pkg;
    }
  }

  // Common pattern aliases for packages
  if (/\b50l?\b|\bsud50\b|\bkeg50\b|\bvelky\s*sud\b/.test(norm)) return packages.find((p) => p.volume_l === 50) ?? null;
  if (/\b30l?\b|\bsud30\b|\bkeg30\b|\bmaly\s*sud\b/.test(norm)) return packages.find((p) => p.volume_l === 30) ?? null;
  if (/\b20l?\b|\bsud20\b|\bkeg20\b/.test(norm)) return packages.find((p) => p.volume_l === 20) ?? null;
  if (/\b15l?\b|\bsud15\b|\bkeg15\b/.test(norm)) return packages.find((p) => p.volume_l === 15) ?? null;
  if (/\b1[.,]5\s*l?\b|\bpetka\b/.test(norm)) return packages.find((p) => p.volume_l === 1.5) ?? null;
  // "1l" or "1 l" — only if NOT preceded by another digit (to avoid "10l", "15l" matching)
  if (/(?<!\d)\b1\s*l\b(?!\s*[.,]?\s*5)/.test(norm)) return packages.find((p) => p.volume_l === 1.0) ?? null;
  if (/\b0[.,]5\s*l?\b|\blahve?\b|\bsklo\b/.test(norm)) return packages.find((p) => p.volume_l === 0.5) ?? null;
  if (/\b0[.,]33\s*l?\b|\btretinka\b/.test(norm)) return packages.find((p) => p.volume_l === 0.33) ?? null;

  return null;
}

const BEER_DEGREES = new Set(['8', '9', '10', '11', '12', '13', '14']);
const KEG_ONLY_VOLS = new Set(['50', '30', '20', '15']);

function ocrNormalizeLine(line: string): string {
  return line
    .replace(/[×«]/g, 'x')
    .replace(/(\d)\s*[IL](?=\s|°|$)/g, '$1l')
    .replace(/(\d+\s*x\s*[\d,\.]+)\s*[IL](?=\s|°|$)/gi, '$1l')
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

export function parseOrderText(
  rawText: string,
  beers: Beer[],
  packages: Package[],
  aliasMap?: ParserAliasMap,
  linesWithBbox?: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[],
): ParsedLine[] {
  const aliases = aliasMap ?? emptyAliasMap();

  const flatLines = rawText.split(/\n/).map((l) => ocrNormalizeLine(l.trim())).filter((l) => l.length > 0);
  let flat = flatLines.join(' ');
  flat = ocrCleanupQuantities(flat);

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

  for (const t of tokens) {
    if (t.degree) continue;
    const ctxStart = Math.max(0, t.start - 60);
    const ctxEnd = Math.min(flat.length, t.end + 60);
    const ctx = flat.slice(ctxStart, ctxEnd);
    const degMatch = ctx.match(/\b(8|9|10|11|12|13|14)\s*°\b/);
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

  const results: ParsedLine[] = [];
  const seen = new Set<string>();

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

    const key = `${beer?.id ?? ''}|${pkg?.id ?? ''}|${t.qty ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const bbox = findBboxForContext(dispContext, linesWithBbox);

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

  return results;
}

export type GeminiItem = {
  quantity: number | null;
  degree: string | null;
  beer_name: string | null;
  package_label: string | null;
  raw_line: string;
  place_name: string | null;
  bbox?: { x0: number; y0: number; x1: number; y1: number } | null;
};

export function parseGeminiItems(
  items: GeminiItem[],
  beers: Beer[],
  packages: Package[],
  aliasMap?: ParserAliasMap,
  photoIndex?: number,
): ParsedLine[] {
  const aliases = aliasMap ?? emptyAliasMap();
  const results: ParsedLine[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const raw = item.raw_line || [item.quantity, item.degree, item.beer_name, item.package_label].filter(Boolean).join(' ');

    let beer: Beer | null = null;
    let alias: string | null = null;
    if (item.beer_name) {
      ({ beer, alias } = matchBeerFromHints(normalize(item.beer_name), beers, aliases));
    }
    if (!beer && item.degree) {
      ({ beer, alias } = matchBeerFromHints(normalize(item.degree), beers, aliases));
    }
    if (!beer) {
      ({ beer, alias } = matchBeerFromHints(normalize(raw), beers, aliases));
    }

    const rawNorm = normalize(raw);
    let pkg: Package | null = null;
    if (item.package_label) {
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
      const volMatch = raw.match(/(\d+[.,]?\d*)\s*l?\b/);
      if (volMatch) pkg = volToPackage(volMatch[1], packages, rawNorm);
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

    const key = `${beer?.id ?? ''}|${pkg?.id ?? ''}|${qty ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

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
      place_name: item.place_name ?? null,
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
    const { data: existing } = await supabase.from('parser_aliases').select('id, hit_count').eq('alias_text', norm).maybeSingle();
    if (existing) {
      await supabase.from('parser_aliases').update({
        beer_id: beerId, package_id: packageId,
        hit_count: (existing.hit_count ?? 0) + 1, updated_at: new Date().toISOString(),
      }).eq('id', (existing as any).id);
    } else {
      await supabase.from('parser_aliases').insert({
        alias_text: norm, beer_id: beerId, package_id: packageId, hit_count: 1,
      });
    }
  } catch {}
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
export function matchPlaceFromText(rawText: string, places: Place[]): { placeId: string | null; placeName: string | null } {
  if (!rawText || !places.length) return { placeId: null, placeName: null };
  const normText = normalizePlace(rawText);

  // 1. Exact substring match — prefer longest match to avoid short false positives
  let bestMatch: { place: Place; len: number } | null = null;
  for (const p of places) {
    const np = normalizePlace(p.name);
    if (np.length < 4) continue; // skip very short names (e.g. "Bar") — too generic
    if (normText.includes(np) && (!bestMatch || np.length > bestMatch.len)) {
      bestMatch = { place: p, len: np.length };
    }
  }
  if (bestMatch) return { placeId: bestMatch.place.id, placeName: bestMatch.place.name };

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

  // 3. Fuzzy fallback — raised threshold to 0.80 to avoid false matches
  let bestFuzzy: Place | null = null;
  let bestScore = 0;
  for (const p of places) {
    const np = normalizePlace(p.name);
    if (np.length < 4) continue;
    const s = bestFuzzyScoreInText(np, normText);
    if (s > bestScore) { bestScore = s; bestFuzzy = p; }
  }
  if (bestFuzzy && bestScore >= 0.80) {
    return { placeId: bestFuzzy.id, placeName: bestFuzzy.name };
  }

  return { placeId: null, placeName: null };
}

const NOTE_PATTERNS: { re: RegExp; label: string | ((m: RegExpMatchArray) => string) }[] = [
  { re: /\b(\+\s*)?vycep\b|\bvycepy\b|\bvycepu\b|\bpujcit\s*vycep\b/i, label: '+ výčep' },
  { re: /\b(pridat\s*)?sklo\b|\bsklenic[e]?\b/i, label: 'sklo' },
  { re: /\bpodtack[y]?\b|\bpodtacek\b/i, label: 'podtácky' },
  { re: /\bzavoz\s+(v[e]?\s+)?(pondeli|utery|stredu|ctvrtek|patek|sobotu|nedeli|\d{1,2}\.\d{1,2}\.)(\s+v\s+\d{1,2}(:\d{2})?\s*(h|hod)?)?/i, label: (m) => m[0] },
  { re: /\bdodat\s+(v[e]?\s+)?(pondeli|utery|stredu|ctvrtek|patek|sobotu|nedeli|\d{1,2}\.\d{1,2}\.)(\s+v\s+\d{1,2}(:\d{2})?\s*(h|hod)?)?/i, label: (m) => m[0] },
  { re: /\b(cas|hodin[a]|v)\s+\d{1,2}(:\d{2})?\s*(h|hod)?\b/i, label: (m) => m[0] },
  { re: /\bbez\s*etiket/i, label: 'bez etikety' },
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
    .split(/[,;]|(?:\s+a\s+)(?=\d)/i)
    .map((s) => ocrNormalizeLine(s.trim()))
    .filter((s) => s.length > 0);

  segments = segments.flatMap((seg) => splitByQtyBoundaries(seg));

  return parseSegments(segments, beers, packages, aliases);
}

function splitByQtyBoundaries(seg: string): string[] {
  const re = /\d{1,4}\s*(?:x|ks|×)\b/gi;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) starts.push(m.index);
  if (starts.length <= 1) return [seg];
  const parts: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : seg.length;
    const part = seg.slice(start, end).trim();
    if (part) parts.push(part);
  }
  return parts;
}

function parseSegments(
  segments: string[],
  beers: Beer[],
  packages: Package[],
  aliases: ParserAliasMap,
): ParsedLine[] {
  const results: ParsedLine[] = [];
  const seen = new Set<string>();

  for (const seg of segments) {
    const cleaned = ocrCleanupQuantities(seg);
    const qtyMatch = cleaned.match(/^\s*(\d{1,4})\s*(?:x|ks|×)?\s*/i) ?? cleaned.match(/(\d{1,4})\s*(?:x|ks|×)\s*/i);
    const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : null;
    const rest = qtyMatch ? cleaned.slice((qtyMatch.index ?? 0) + qtyMatch[0].length) : cleaned;

    const norm = normalize(rest || cleaned);

    let { beer, alias } = matchBeerFromHints(norm, beers, aliases);

    let pkg: Package | null = null;
    // Volume match — ordered from most specific to least: 1,5 before 1 before 0,5
    const volMatch = norm.match(/\b(50|30|20|15|10|1[,.]5|1[,.]0|0[,.]5|0[,.]33)\s*l?\b|(?<!\d)\b(1)\s*l\b/);
    if (volMatch) pkg = volToPackage((volMatch[1] ?? volMatch[2]).replace(',', '.'), packages, norm);
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
): ParsedVoiceOrder {
  let text = rawText.trim();
  let placeId: string | null = null;
  let placeName: string | null = null;

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
