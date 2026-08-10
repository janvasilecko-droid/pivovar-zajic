import { WhatsAppIncoming } from './whatsappApi';

// ─────────────────────────────────────────────────────────────────────────────
// Kontrola čtení (readback) — porovnání toho, co AI tvrdí, že ze zprávy přečetla
// (parsed_items[].raw_line), s originálním textem zprávy (message_text).
// Slouží pro vizuální ověření, že AI správně přečetla WhatsApp objednávku.
//
// Vrstvy kontroly:
//   1) Přesná shoda raw_line v originálu (findRawLineMatch) — pozice pro zvýraznění.
//   2) Fuzzy shoda (findRawLineFuzzyMatch) — tolerance překlepů a pořadí slov
//      („keg 50l" = „50l KEG"), typicky „2x50l 12°" vs „12° 2×50l sud".
//   3) Kontrola po částech (extractOrderParts) — množství / objem / stupeň
//      se porovnávají zvlášť, takže ⚠ ukáže PŘESNĚ, která část nesouhlasí.
//   4) Skóre důvěryhodnosti (0–100) pro každou položku i pro celou zprávu.
// ─────────────────────────────────────────────────────────────────────────────

/** Normalizace pro porovnání: malá písmena, bez diakritiky, jen písmena/čísla/stupeň. */
export function normalizeForReadback(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9°]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizace, která navíc zachovává desetinné čárky/tečky a „x"
 * („1,5l", „2x30") — používá se pro části položky (množství/objem/stupeň)
 * a pro fuzzy shodu, kde by „1,5l" nemělo splývat s „15l".
 */
export function normalizeForReadbackParts(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9°.,x]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Vrátí normalizovaný text a paralelní mapu pozic: pro každý znak
 * normalizovaného textu index v originálním textu. `allowed` určuje, které
 * znaky zůstávají (přesná shoda × fuzzy shoda s desetinnými znaménky).
 */
function normalizeWithPositions(text: string, allowed: RegExp = /[a-z0-9°]/): { normalized: string; posMap: number[] } {
  let normalized = '';
  const posMap: number[] = [];
  let pendingSpace = false;
  let spaceStart = 0;
  for (let i = 0; i < text.length; i++) {
    const low = text[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (allowed.test(low)) {
      if (pendingSpace && posMap.length > 0) {
        normalized += ' ';
        posMap.push(spaceStart);
      }
      pendingSpace = false;
      normalized += low;
      posMap.push(i);
    } else {
      if (!pendingSpace) spaceStart = i;
      pendingSpace = true;
    }
  }
  return { normalized, posMap };
}

export interface ReadbackMatch {
  /** Počáteční pozice v originálním textu (včetně). */
  start: number;
  /** Koncová pozice v originálním textu (vyjma). */
  end: number;
}

/**
 * Najde rawLine (to, co AI tvrdí, že přečetla) uvnitř originální zprávy.
 * Vrací pozici v původním (nenormalizovaném) textu, nebo null, když se text
 * v originálu nenašel — to je signál, že AI četla jinak/špatně.
 */
export function findRawLineMatch(rawLine: string, text: string): ReadbackMatch | null {
  const needle = normalizeForReadback(rawLine);
  if (needle.length < 2) return null;

  const { normalized, posMap } = normalizeWithPositions(text);
  const idx = normalized.indexOf(needle);
  if (idx === -1) return null;

  const start = posMap[idx];
  const end = posMap[idx + needle.length - 1] + 1;
  if (start === undefined || end === undefined) return null;

  return { start, end };
}

// ── Fuzzy shoda (překlepy + pořadí slov) ────────────────────────────────────

/** Minimální podobnost dvou slov, aby se považovala za shodu. */
const FUZZY_WORD_THRESHOLD = 0.7;
/** Minimální skóre okna, aby byla položka označena jako částečně přečtená (fuzzy). */
export const FUZZY_MATCH_MIN = 0.55;

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
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
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[bl];
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Skóre shody slov needle proti oknu haystacku. Každé slovo needle se přiřadí
 * k nejpodobnějšímu nepoužitému slovu okna; skóre = součet podobností / počet slov.
 */
function matchWindowScore(needle: string[], window: string[]): { score: number; matches: number } {
  const used = new Set<number>();
  let total = 0;
  let matches = 0;
  for (const nw of needle) {
    const cn = canonicalizeNumbers(nw);
    let bestIdx = -1;
    let bestSim = 0;
    for (let j = 0; j < window.length; j++) {
      if (used.has(j)) continue;
      const sim = tokenSimilarity(cn, canonicalizeNumbers(window[j]));
      if (sim > bestSim) {
        bestSim = sim;
        bestIdx = j;
      }
    }
    if (bestIdx >= 0 && bestSim >= FUZZY_WORD_THRESHOLD) {
      used.add(bestIdx);
      matches++;
      total += bestSim;
    }
  }
  return { score: needle.length ? total / needle.length : 0, matches };
}

export interface FuzzyWindowMatch {
  /** Počáteční pozice nejlépe odpovídajícího okna v originálním textu. */
  start: number;
  /** Koncová pozice okna v originálním textu (vyjma). */
  end: number;
  /** Skóre shody 0–1 (toleruje překlepy i prohozené pořadí slov). */
  score: number;
  tokenMatches: number;
  tokenTotal: number;
}

/**
 * Najde v originálu nejlépe odpovídající okno pro rawLine s tolerancí překlepů
 * a prohozeného pořadí slov („keg 50l" ≈ „50l KEG"). Vrací pozice okna a skóre.
 */
export function findRawLineFuzzyMatch(rawLine: string, text: string): FuzzyWindowMatch | null {
  const needleWords = normalizeForReadbackParts(rawLine).split(' ').filter(Boolean);
  if (needleWords.length === 0) return null;

  const { normalized, posMap } = normalizeWithPositions(text, /[a-z0-9°.,x]/);
  const hayWords = normalized.split(' ').filter(Boolean);
  if (hayWords.length === 0) return null;

  const spans: { start: number; end: number }[] = [];
  let idx = 0;
  for (const w of hayWords) {
    const s = normalized.indexOf(w, idx);
    spans.push({ start: s, end: s + w.length });
    idx = s + w.length;
  }

  let best: FuzzyWindowMatch | null = null;
  const minSpan = Math.max(1, needleWords.length - 1);
  const maxSpan = needleWords.length + 2;
  for (let span = minSpan; span <= maxSpan; span++) {
    for (let i = 0; i + span <= hayWords.length; i++) {
      const { score, matches } = matchWindowScore(needleWords, hayWords.slice(i, i + span));
      if (!best || score > best.score) {
        const start = posMap[spans[i].start];
        const end = posMap[spans[i + span - 1].end - 1] + 1;
        if (start === undefined || end === undefined) continue;
        best = { start, end, score, tokenMatches: matches, tokenTotal: needleWords.length };
      }
    }
  }
  // Žádné slovo raw_line se v originálu nenašlo → fuzzy shoda nemá smysl.
  if (!best || best.score <= 0) return null;
  return best;
}

// ── Části položky (množství / objem / stupeň) ────────────────────────────────

export type ReadbackPartKind = 'qty' | 'volume' | 'degree';

export interface OrderPart {
  kind: ReadbackPartKind;
  /** Hodnota v kanonické podobě (desetinná čárka → tečka), např. '4', '50', '12', '1.5'. */
  value: string;
  /** Zobrazovaná podoba, např. '4×', '50l', '12°'. */
  display: string;
}

const PART_KIND_LABEL: Record<ReadbackPartKind, string> = {
  qty: 'množství',
  volume: 'objem',
  degree: 'stupeň',
};

export function partKindLabel(kind: ReadbackPartKind): string {
  return PART_KIND_LABEL[kind];
}

/**
 * Rozloží raw_line na číselné části: množství (N×), objem (50l, 30l, 1,5l…)
 * a stupeň (12°, 12sv, 12st). Vrací deduplikované části.
 */
export function extractOrderParts(line: string): OrderPart[] {
  const s = normalizeForReadbackParts(line);
  const parts: OrderPart[] = [];
  const seen = new Set<string>();
  const add = (kind: ReadbackPartKind, value: string, display: string) => {
    const key = `${kind}|${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    parts.push({ kind, value, display });
  };

  // Objem s jednotkou: „50l", „50 l", „1,5l", „30 l KEG", „sud 50".
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:l\b|litr\w*|keg\w*|sud\w*)/g)) {
    add('volume', m[1], `${m[1]}l`);
  }
  // Stupeň: „12°", „12sv", „12st", „12 blg".
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:°|°\s*blg|sv|st\b|blg)/g)) {
    add('degree', m[1], `${m[1]}°`);
  }
  // Množství s objemem: „4x30", „2x50l" (druhé číslo je objem).
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/g)) {
    add('qty', m[1], `${m[1]}×`);
    add('volume', m[2], `${m[2]}l`);
  }
  // Množství bez objemu: „4x", „4 x".
  for (const m of s.matchAll(/(\d+(?:[.,]\d+)?)\s*x(?!\s*\d)/g)) {
    add('qty', m[1], `${m[1]}×`);
  }
  return parts;
}

/**
 * Kanonizuje text pro porovnání čísel: „12sv"/„12st" → „12°", sjednotí mezery
 * mezi číslem a jednotkou („4 x 50 l" → „4x50l") a desetinné čárky → tečky.
 */
function canonicalizeNumbers(s: string): string {
  let out = (s || '').toLowerCase();
  out = out.replace(/(\d+(?:[.,]\d+)?)\s*(?:°|°\s*blg|sv|st\b|blg)/g, '$1°');
  let prev: string;
  do {
    prev = out;
    out = out.replace(/(\d)\s+([a-z°x])/g, '$1$2');
  } while (out !== prev);
  out = out.replace(/,/g, '.');
  return out;
}

/** Je hodnota (např. '4', '50', '12') přítomna jako samostatné číslo v kanonickém textu? */
function valuePresent(value: string, canonicalText: string): boolean {
  const v = value.replace(',', '.');
  if (!v) return false;
  const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^0-9.])${escaped}(?![0-9.])`).test(canonicalText);
}

export interface ItemReadbackPart {
  part: OrderPart;
  found: boolean;
}

// ── Analýza zprávy ───────────────────────────────────────────────────────────

export type ReadbackStatus = 'matched' | 'fuzzy' | 'unmatched' | 'empty';

export interface ReadbackItem {
  /** Pořadí položky v parsed_items (0-based). */
  index: number;
  /** Přesná shoda v originálu (pokud je). */
  match: ReadbackMatch | null;
  /** Fuzzy shoda (pokud je přesná shoda nemožná). */
  fuzzy: FuzzyWindowMatch | null;
  status: ReadbackStatus;
  /** Skóre důvěryhodnosti přečtení položky 0–100. */
  score: number;
  /** Kontrola číselných částí (množství/objem/stupeň) zvlášť. */
  parts: ItemReadbackPart[];
  /** Skóre částí 0–100, null když položka žádná čísla neobsahuje. */
  partsScore: number | null;
}

export interface ReadbackAnalysis {
  items: ReadbackItem[];
  /** Položky, jejichž raw_line se v originálu vůbec nenašel (⚠). */
  unmatchedCount: number;
  /** Položky s částečnou shodou (překlepy/prohozená slova) — upozornění. */
  partialCount: number;
  /** Položky s přesnou shodou (✓). */
  matchedCount: number;
  /** unmatched + fuzzy — počet položek, které nejsou perfektně přečtené. */
  mismatchCount: number;
  /** Celkové skóre zprávy 0–100 (průměr přes neprázdné položky), null bez položek. */
  score: number | null;
  /** Slovní hodnocení skóre („Vysoká důvěra"…) nebo null. */
  scoreLabel: string | null;
}

/** Analyzuje zprávu: pro každou rozparsovanou položku najde, kde v originálu AI četla. */
export function analyzeReadback(message: WhatsAppIncoming): ReadbackAnalysis {
  const text = message.message_text || '';
  const parsedItems = message.parsed_items || [];

  const items: ReadbackItem[] = parsedItems.map((item, index) => {
    const rawLine = (item.raw_line || '').trim();
    if (!rawLine) {
      return { index, match: null, fuzzy: null, status: 'empty' as const, score: 0, parts: [], partsScore: null };
    }

    const exact = findRawLineMatch(rawLine, text);
    const fuzzy = findRawLineFuzzyMatch(rawLine, text);

    let match: ReadbackMatch | null = null;
    let status: ReadbackStatus = 'unmatched';
    let baseScore = 0;

    if (exact) {
      match = exact;
      status = 'matched';
      baseScore = 100;
    } else if (fuzzy && fuzzy.score >= FUZZY_MATCH_MIN) {
      match = { start: fuzzy.start, end: fuzzy.end };
      status = 'fuzzy';
      baseScore = Math.round(fuzzy.score * 100);
    }

    // Kontrola po částech: porovná se s oknem, ze kterého AI (pravděpodobně)
    // četla; bez okna (unmatched) s celým textem zprávy.
    const windowText = match ? text.slice(match.start, match.end) : text;
    const canonWindow = canonicalizeNumbers(normalizeForReadbackParts(windowText));
    const parts: ItemReadbackPart[] = extractOrderParts(rawLine).map((part) => ({
      part,
      found: valuePresent(part.value, canonWindow),
    }));
    const partsScore = parts.length
      ? Math.round((parts.filter((p) => p.found).length / parts.length) * 100)
      : null;

    let score = baseScore;
    if (status === 'unmatched' || status === 'fuzzy') {
      score = partsScore != null ? Math.round(baseScore * 0.55 + partsScore * 0.45) : baseScore;
      // AI přečetla všechna čísla správně, jen jinak formulovala → částečná shoda.
      if (status === 'unmatched' && parts.length > 0 && partsScore === 100) {
        status = 'fuzzy';
      }
    }

    return { index, match, fuzzy, status, score, parts, partsScore };
  });

  const nonEmpty = items.filter((i) => i.status !== 'empty');
  const unmatchedCount = items.filter((i) => i.status === 'unmatched').length;
  const partialCount = items.filter((i) => i.status === 'fuzzy').length;
  const matchedCount = items.filter((i) => i.status === 'matched').length;
  const avg = nonEmpty.length
    ? Math.round(nonEmpty.reduce((s, i) => s + i.score, 0) / nonEmpty.length)
    : null;

  let scoreLabel: string | null = null;
  if (avg != null) {
    scoreLabel = avg >= 90 ? 'Vysoká důvěra' : avg >= 60 ? 'Částečná shoda' : 'Nízká důvěra';
  }

  return {
    items,
    unmatchedCount,
    partialCount,
    matchedCount,
    mismatchCount: unmatchedCount + partialCount,
    score: avg,
    scoreLabel,
  };
}

/**
 * Spočítá počet položek, jejichž raw_line se v originálu nenašel přesně
 * (pro uložení readback_unmatched_count do databáze po re-parse).
 */
export function computeReadbackUnmatchedCount(
  parsedItems: Array<{ raw_line?: string | null }>,
  text: string
): number {
  if (!text) return 0;
  return (parsedItems || []).filter((item) => {
    const raw = (item.raw_line || '').trim();
    if (!raw) return false;
    return findRawLineMatch(raw, text) === null;
  }).length;
}

// ── Zvýraznění originálního textu podle nalezených shod ─────────────────────

export interface HighlightMatch {
  start: number;
  end: number;
  /** Číslo položky (1-based) zobrazené jako odznak. */
  badge: number;
  /** 'ok' = přesná shoda (zelená), 'warn' = částečná/fuzzy shoda (jantarová). */
  tone?: 'ok' | 'warn';
}

export interface TextSegment {
  text: string;
  highlighted: boolean;
  badges: number[];
  tone?: 'ok' | 'warn';
}

/**
 * Rozdělí text na segmenty a spojí překrývající se shody do jednoho zvýraznění
 * (s více odznaky). Vrátí pole segmentů v pořadí originálu.
 */
export function buildHighlightedSegments(
  text: string,
  matches: HighlightMatch[]
): TextSegment[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || a.end - b.end);
  const segments: TextSegment[] = [];
  let cursor = 0;
  let i = 0;

  while (i < sorted.length) {
    const m = sorted[i];
    if (m.end <= cursor) { i++; continue; }
    if (m.start > cursor) {
      segments.push({ text: text.slice(cursor, m.start), highlighted: false, badges: [] });
      cursor = m.start;
    }
    let spanEnd = Math.max(cursor, m.end);
    const badges = [m.badge];
    const tone = m.tone;
    i++;
    while (i < sorted.length && sorted[i].start <= spanEnd) {
      if (sorted[i].end > spanEnd) spanEnd = sorted[i].end;
      badges.push(sorted[i].badge);
      i++;
    }
    segments.push({ text: text.slice(cursor, spanEnd), highlighted: true, badges, tone });
    cursor = spanEnd;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false, badges: [] });
  }
  return segments;
}

// ── Diff slov: originál vs. doslovný přepis AI ───────────────────────────────

export type DiffOp = 'same' | 'added' | 'removed';

export interface DiffSegment {
  op: DiffOp;
  text: string;
}

function tokenizeForDiff(s: string): string[] {
  return (s || '').split(/\s+/).filter(Boolean);
}

function normDiffToken(t: string): string {
  return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Porovná originální text s přepisem AI na úrovni slov (LCS diff).
 * 'removed' = slova v originálu, která AI nepřečetla; 'added' = slova, která
 * AI přidala, ačkoli v originálu nejsou. Zobrazuje původní text (s diakritikou),
 * porovnává normalizovaně (bez diakritiky, malá písmena).
 */
export function diffWords(original: string, transcript: string): DiffSegment[] {
  const a = tokenizeForDiff(original);
  const b = tokenizeForDiff(transcript);
  const n = a.length;
  const m = b.length;

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = normDiffToken(a[i]) === normDiffToken(b[j])
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const seq: { op: DiffOp; token: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      seq.push({ op: 'same', token: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      seq.push({ op: 'removed', token: a[i] });
      i++;
    } else {
      seq.push({ op: 'added', token: b[j] });
      j++;
    }
  }
  while (i < n) seq.push({ op: 'removed', token: a[i++] });
  while (j < m) seq.push({ op: 'added', token: b[j++] });

  const segments: DiffSegment[] = [];
  for (const s of seq) {
    const last = segments[segments.length - 1];
    if (last && last.op === s.op) last.text += ' ' + s.token;
    else segments.push({ op: s.op, text: s.token });
  }
  return segments;
}

// ── Opakované chyby čtení a podobné (možná duplicitní) zprávy ───────────────

export interface RepeatedReadbackError {
  sender: string;
  /** Doslovný raw_line, který AI opakovaně špatně přečetla. */
  rawLine: string;
  count: number;
  messageIds: string[];
}

/**
 * Najde raw_line, které se u stejného odesílatele opakovaně (≥ 2×) nepovedlo
 * přečíst (exaktní shoda s originálem nenalezena) — kandidát na naučený alias.
 */
export function findRepeatedReadbackErrors(messages: WhatsAppIncoming[]): RepeatedReadbackError[] {
  const groups = new Map<string, RepeatedReadbackError>();
  for (const msg of messages) {
    const text = msg.message_text || '';
    for (const item of msg.parsed_items || []) {
      const raw = (item.raw_line || '').trim();
      if (!raw) continue;
      if (findRawLineMatch(raw, text)) continue; // přečteno správně
      const key = `${(msg.sender_name || '').toLowerCase().trim()}::${normalizeForReadback(raw)}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count++;
        if (!existing.messageIds.includes(msg.id)) existing.messageIds.push(msg.id);
      } else {
        groups.set(key, {
          sender: msg.sender_name || 'Neznámý odesílatel',
          rawLine: raw,
          count: 1,
          messageIds: [msg.id],
        });
      }
    }
  }
  return [...groups.values()]
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count);
}

export interface SimilarMessagePair {
  first: WhatsAppIncoming;
  second: WhatsAppIncoming;
  score: number;
}

function tokenSetJaccard(a: string, b: string): number {
  const sa = new Set(a.split(' ').filter(Boolean));
  const sb = new Set(b.split(' ').filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * Najde dvojice zpráv s prakticky stejným obsahem (normovaný Jaccard tokenů
 * ≥ 0.85, minimální délka 20 znaků) — možná duplicitní objednávka (např. tu
 * stejnou objednávku poslal pivovar i číšník, nebo dorazila dvakrát).
 */
export function findSimilarMessages(messages: WhatsAppIncoming[]): SimilarMessagePair[] {
  const list = messages.filter((m) => (m.message_text || '').trim().length >= 20);
  const pairs: SimilarMessagePair[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const score = tokenSetJaccard(normalizeForReadback(a.message_text), normalizeForReadback(b.message_text));
      if (score >= 0.85) pairs.push({ first: a, second: b, score });
    }
  }
  return pairs.sort((x, y) => y.score - x.score).slice(0, 10);
}




