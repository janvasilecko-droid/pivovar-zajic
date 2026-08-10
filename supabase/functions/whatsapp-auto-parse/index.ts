import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Interface for parsed order items
interface ParsedItem {
  beer_id?: string;
  pkg_id?: string;
  qty?: number;
  degree?: string;
  beer_name?: string;
  package_label?: string;
  raw_line?: string;
}

// Interface for parsed message
interface ParsedMessage {
  place_id?: string;
  place_name?: string;
  delivery_day?: string;
  delivery_date?: string;
  note?: string;
  items?: ParsedItem[];
}

// ── Přiřazování položek ke katalogu (názvy od AI → beer_id / pkg_id) ────────
function normText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[ěščřžýáíéóúůťďň]/g, (c) =>
      ({ ě: "e", š: "s", č: "c", ř: "r", ž: "z", ý: "y", á: "a", í: "i", é: "e", ó: "o", ú: "u", ů: "u", ť: "t", ď: "d", ň: "n" }[c] ?? c))
    .replace(/[^a-z0-9°.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Normalizace názvu odesílatele/skupiny: malá písmena, ořezané mezery, bez
// diakritiky. "objednavky pivovar" == "Objednávky pivovar".
function normName(s: string): string {
  return (s || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Kontrola čtení (readback): spočítá položky, jejichž raw_line (to, co AI tvrdí,
// že přečetla) se v originálním textu zprávy nenašel. Číslo se ukládá do
// readback_unmatched_count a v UI slouží pro ⚠ odznaky a filtry.
function readbackUnmatchedCount(
  items: Array<{ raw_line?: string | null }>,
  messageText: string
): number {
  const text = normText(messageText || "");
  if (!text) return 0;
  return (items || []).filter((item) => {
    const raw = normText(item.raw_line || "");
    if (!raw || raw.length < 2) return false;
    return !text.includes(raw);
  }).length;
}

// ── Pomocné funkce pro fuzzy párování s databází aplikace ──────────────────
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
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
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

// Nejlepší podobnost needle v oknech slov haystacku (toleruje chybějící slova).
function bestFuzzyScoreInText(needle: string, haystack: string): number {
  if (!needle || !haystack) return 0;
  const words = haystack.split(/\s+/).filter(Boolean);
  const needleWordCount = needle.split(/\s+/).filter(Boolean).length || 1;
  let best = 0;
  for (let span = Math.max(1, needleWordCount - 1); span <= needleWordCount + 1 && span <= words.length; span++) {
    for (let i = 0; i + span <= words.length; i++) {
      const chunk = words.slice(i, i + span).join(" ");
      const s = similarity(needle, chunk);
      if (s > best) best = s;
    }
  }
  return best;
}

// Kód dne (po/ut/st/ct/pa/so/ne) pro zadané ISO datum.
function weekdayCode(dateStr: string): string {
  const dow = new Date(dateStr + "T00:00:00Z").getUTCDay();
  return ["ne", "po", "ut", "st", "ct", "pa", "so"][dow];
}

// 🗓️ Rozpoznání konkrétního data v textu (např. "25.8.") → ISO datum.
// Datum se zapíše do poznámky a objednávka se přesune do týdne daného data.
const CZ_MONTHS: [string, number][] = [
  ["ledna", 1], ["února", 2], ["unora", 2], ["března", 3], ["brezna", 3],
  ["dubna", 4], ["května", 5], ["kvetna", 5], ["června", 6], ["cervna", 6],
  ["července", 7], ["cervence", 7], ["srpna", 8], ["září", 9], ["zari", 9],
  ["října", 10], ["rijna", 10], ["listopadu", 11], ["prosince", 12],
];

function parseExplicitDate(text: string): { dateStr: string; display: string; matched: string } | null {
  if (!text) return null;
  const now = new Date();
  const thisYear = now.getFullYear();

  const build = (day: number, month: number, year?: number, matched?: string): { dateStr: string; display: string; matched: string } | null => {
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    let y = year ?? thisYear;
    if (!year) {
      const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      if (Date.UTC(y, month - 1, day) < todayStart) y = y + 1;
    }
    const d = new Date(Date.UTC(y, month - 1, day));
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return {
      dateStr: `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      display: `${day}.${month}.`,
      matched: matched ?? `${day}.${month}.`,
    };
  };

  // 1) "25.8.2026"
  let m = text.match(/(?<![\d.])(\d{1,2})\s*[.]\s*(\d{1,2})\s*[.]\s*(\d{4})(?![\d.])/);
  if (m) {
    const r = build(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m[0].trim());
    if (r) return r;
  }
  // 2) "25.8."
  m = text.match(/(?<![\d.])(\d{1,2})\s*[.]\s*(\d{1,2})\s*[.](?![\d.])/);
  if (m) {
    const r = build(parseInt(m[1], 10), parseInt(m[2], 10), undefined, m[0].trim());
    if (r) return r;
  }
  // 3) "25.8" bez tečky — ne objem (1.5l) ani cena
  m = text.match(/(?<![\d.])(\d{1,2})\s*[.]\s*(\d{1,2})(?![\d.])(?![lL])/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 10);
      const before = text.slice(Math.max(0, m.index - 10), m.index);
      const looksLikeVolumeOrQty =
        /\bl\b|\bl\.|litr|litru|litry|keg|sud|x\s*\d|\bks\b/i.test(after) ||
        /\d+\s*x/i.test(before) || /cena|k[čc]\b/i.test(before);
      if (!looksLikeVolumeOrQty) {
        const r = build(day, month, undefined, m[0].trim());
        if (r) return r;
      }
    }
  }
  // 4) "25. srpna"
  m = text.match(/(?<![\d.])(\d{1,2})\s*[.]\s*(ledna|února|unora|března|brezna|dubna|května|kvetna|června|cervna|července|cervence|srpna|září|zari|října|rijna|listopadu|prosince)\b/i);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = CZ_MONTHS.find(([name]) => name === m[2].toLowerCase())?.[1];
    if (month) {
      const r = build(day, month, undefined, m[0].trim());
      if (r) return r;
    }
  }
  // 5) "25/8"
  m = text.match(/(?<![\d./])(\d{1,2})[/](\d{1,2})(?![\d.])/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const r = build(day, month, undefined, m[0].trim());
      if (r) return r;
    }
  }
  return null;
}

function matchBeerId(
  item: any,
  beers: { id: string; name: string; degree?: string | null; short_name?: string | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> }
): string | null {
  // Přednost má PŮVODNÍ text objednávky (raw_line) — to je to, co zákazník
  // skutečně napsal. Název od AI (beer_name) může být špatně rozpoznaný,
  // proto ho zkoušíme až jako záložní zdroj.
  const rawText = normText([item.raw_line, item.degree].filter(Boolean).join(" "));
  if (rawText) {
    const hit = matchBeerInText(rawText, beers, aliasMap, item.degree);
    if (hit) return hit;
  }
  const aiName = normText(item.beer_name || "");
  if (aiName) {
    const hit = matchBeerInText(aiName, beers, aliasMap, item.degree);
    if (hit) return hit;
  }
  return null;
}

function matchBeerInText(
  text: string,
  beers: { id: string; name: string; degree?: string | null; short_name?: string | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> },
  rawDegree?: string | null
): string | null {
  if (!text) return null;

  // 1) Přesná shoda s názvem / short_name z katalogu (nejdelší shoda vyhrává)
  let best: string | null = null;
  let bestLen = 0;
  for (const b of beers) {
    for (const name of [b.name, b.short_name]) {
      const n = normText(name || "");
      if (n.length >= 3 && text.includes(n) && n.length > bestLen) {
        best = b.id;
        bestLen = n.length;
      }
    }
  }
  if (best) return best;

  // 2) Naučené aliasy (přesná shoda nebo substring)
  for (const [alias, beerId] of aliasMap.beer) {
    const na = normText(alias);
    if (na.length >= 2 && (text === na || text.includes(na))) return beerId;
  }

  // 2b) OCR opravy názvů piv (seeger/zeeburg → seeberg)
  const ocrText = text
    .replace(/\bse[eé]berg\b/g, "seeberg")
    .replace(/\bzeeburg\b/g, "seeberg");
  if (ocrText !== text) {
    for (const b of beers) {
      const n = normText(b.name);
      if (n.length >= 3 && ocrText.includes(n)) return b.id;
    }
  }

  // 2c) Fuzzy shoda s názvy z katalogu aplikace (překlepy, OCR šum).
  //     Primárně párujeme s databází, ne s tím, co si vymyslela AI.
  let fuzzyBest: string | null = null;
  let fuzzyScore = 0;
  for (const b of beers) {
    const n = normText(b.name);
    if (n.length < 4) continue;
    const s = bestFuzzyScoreInText(n, ocrText);
    if (s > fuzzyScore) { fuzzyScore = s; fuzzyBest = b.id; }
  }
  if (fuzzyBest && fuzzyScore >= 0.72) return fuzzyBest;

  // 3) Podle stupně (rozlišení světlá/tmavá, 12° má 2 piva v katalogu)
  const degree = (rawDegree || "").replace("°", "").trim();
  if (degree) {
    const candidates = beers.filter((b) => (b.degree || "").replace("°", "").trim() === degree);
    if (candidates.length === 1) return candidates[0].id;
    if (candidates.length > 1) {
      if (/tmav|dark|tl\b|cerne|cerna/.test(text)) {
        const dark = candidates.find((b) => /tmav|dark/.test(normText(b.name)));
        if (dark) return dark.id;
      }
      if (/svetl|svet|light|sv\b/.test(text)) {
        const light = candidates.find((b) => /svetl|svet|light|sv\b/.test(normText(b.name)));
        if (light) return light.id;
      }
    }
  }
  return null;
}

function matchPackageId(
  item: any,
  packages: { id: string; label: string; volume_l?: number | null }[],
  aliasMap: { beer: Map<string, string>; package: Map<string, string> }
): string | null {
  // Primárně párujeme z package_label od AI — to je obal KONKRÉTNÍ položky.
  // ⚠️ raw_line může obsahovat VÍCE obalů najednou (např. "SV 12 = 3x50l KEG +
  // 24x1,5l PET + 20x0,5l lahev") — párovat proti celému raw_line by přiřadilo
  // všem položkám řádku jeden (nejdelší) obal. raw_line použij JEN jako zálohu,
  // když AI obal nevrátila.
  const labelText = normText(item.package_label || "");
  const rawText = normText(item.raw_line || "");
  const text = labelText || rawText;
  if (!text) return null;

  // 1) Přesná shoda s názvem obalu (např. "50l")
  let best: string | null = null;
  let bestLen = 0;
  for (const p of packages) {
    const n = normText(p.label);
    if (n.length >= 2 && text.includes(n) && n.length > bestLen) {
      best = p.id;
      bestLen = n.length;
    }
  }
  if (best) return best;

  // 2) Konkrétní objemy z textu (stejná pravidla jako při čtení z fotky /
  //    ručním zadání) — primárně párujeme s obaly v databázi aplikace.
  const pickVol = (v: number): string | null => {
    const byVol = packages.find((p) => Number(p.volume_l) === v);
    if (byVol) return byVol.id;
    return null;
  };
  if (/\b50\s*l?\b|\bsud50\b|\bkeg50\b|\bvelky\s*sud\b|\bsud\s*50\b|\bkeg\s*50\b/i.test(text)) {
    const hit = pickVol(50) ?? packages.find((p) => /50/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\b30\s*l?\b|\bsud30\b|\bkeg30\b|\bmaly\s*sud\b|\bsud\s*30\b|\bkeg\s*30\b/i.test(text)) {
    const hit = pickVol(30) ?? packages.find((p) => /30/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\b20\s*l?\b|\bsud20\b|\bkeg20\b|\bsud\s*20\b|\bkeg\s*20\b/i.test(text)) {
    const hit = pickVol(20) ?? packages.find((p) => /20/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\b15\s*l?\b|\bsud15\b|\bkeg15\b|\bsud\s*15\b|\bkeg\s*15\b/i.test(text)) {
    const hit = pickVol(15) ?? packages.find((p) => /15/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\b10\s*l?\b|\bsud10\b|\bkeg10\b|\bsud\s*10\b|\bkeg\s*10\b/i.test(text)) {
    const hit = pickVol(10) ?? packages.find((p) => /10/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\b1[,.]5\s*l?\b|\bpetka\b/i.test(text)) {
    const hit = pickVol(1.5) ?? packages.find((p) => /1[,.]5/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/(?<!\d)\b1\s*l\b(?!\s*[,.]?\s*5)/i.test(text)) {
    const hit = pickVol(1) ?? packages.find((p) => /1\s*l/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\b0[,.]33\s*l?\b|\btretinka\b|\btřetinka\b/i.test(text)) {
    const hit = pickVol(0.33) ?? packages.find((p) => /0[,.]33/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\b0[,.]5\s*l?\b|\bpullitr\b|\bpůllitr\b/i.test(text)) {
    const hit = pickVol(0.5) ?? packages.find((p) => /0[,.]5|lahv/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\blahve?\b|\bsklo\b|\bflas\b/i.test(text)) {
    const hit = packages.find((p) => Number(p.volume_l) === 0.5 || /0[,.]5|lahv/i.test(p.label))?.id ?? null;
    if (hit) return hit;
  }
  if (/\bkeg\b|\bsud\b/i.test(text)) {
    const hit = pickVol(30);
    if (hit) return hit;
  }

  // 3) Naučené aliasy
  for (const [alias, pkgId] of aliasMap.package) {
    const na = normText(alias);
    if (na.length >= 2 && (text === na || text.includes(na))) return pkgId;
  }

  // 4) Fuzzy shoda s názvy obalů z katalogu aplikace
  let fuzzyBest: string | null = null;
  let fuzzyScore = 0;
  for (const p of packages) {
    const n = normText(p.label);
    if (n.length < 3) continue;
    const s = bestFuzzyScoreInText(n, text);
    if (s > fuzzyScore) { fuzzyScore = s; fuzzyBest = p.id; }
  }
  if (fuzzyBest && fuzzyScore >= 0.72) return fuzzyBest;

  return null;
}

// ── Bezpečné přiřazení odběratele (místa) ──────────────────────────────────
// Normalizace pro porovnání názvů míst (malá písmena, bez diakritiky).
function normPlaceName(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Odstraní jméno odesílatele (posla) z textu zprávy, aby nemohlo zastínit
// skutečného odběratele, který je uvedený UVNITŘ zprávy (např. pozdrav
// "Ahoj, tady Miláček" vs. odběratel "U Dubu").
function stripSenderName(text: string, senderName: string | null | undefined): string {
  if (!senderName) return text;
  const words = senderName.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return text;
  let out = text;
  for (const w of words) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(w)}\\b`, "gi"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

// Slova, která nenesou informaci o konkrétním odběrateli (druh provozovny,
// předložky…) — nesmí samy o sobě určovat shodu.
const PLACE_STOPWORDS = new Set([
  "u", "na", "pod", "ve", "v", "za", "nad", "mezi",
  "hospoda", "restaurace", "pivnice", "bar", "vinarna", "hostinec",
  "klub", "kavarna", "cukrarna", "penzion", "hotel", "motel", "pub",
  "lokalka", "pivovar", "minipivovar", "stodola", "sala", "kulturni",
]);

function placeSignificantWords(n: string): string[] {
  return n.split(/\s+/).filter((w) => w.length >= 3 && !PLACE_STOPWORDS.has(w));
}

// Ověří, že kandidát na odběratele je "ukotven" v textu zprávy. Jméno
// odesílatele se k ukotvení NEPOUŽÍVÁ — odesílatel je jen posel/doručovatel,
// odběratel musí být uvedený UVNITŘ textu zprávy. Brání tomu, aby AI vymyslelo
// odběratele, který v objednávce vůbec není (hallucinace ze seznamu známých
// odběratelů). Ukotvení je na úrovni podstatných slov (např. "Růžku" pro
// "Restaurace Na Růžku").
function isPlaceGrounded(candidate: string, messageText: string): boolean {
  const c = normPlaceName(candidate);
  if (!c || c.length < 3) return false;
  const msg = normPlaceName(messageText);
  if (msg.includes(c)) return true;
  const words = placeSignificantWords(c);
  if (words.length > 0) {
    if (words.some((w) => msg.includes(w))) return true;
  }
  return false;
}

// Bezpečné přiřazení odběratele: kandidát musí být ukotven v textu zprávy
// a odpovídat skutečnému místu z DATABÁZE aplikace. Přednost má databáze
// odběratelů — používáme přesnou shodu, shodu slov, aliasy a fuzzy shodu.
function matchPlaceSafely(
  candidate: string,
  messageText: string,
  places: { id: string; name: string }[],
  placeAliases: { wrong_name: string; correct_name: string }[]
): { id: string | null; name: string | null } {
  const c = normPlaceName(candidate);
  if (!c || c.length < 3) return { id: null, name: null };
  if (!isPlaceGrounded(candidate, messageText)) return { id: null, name: null };

  // 1) Naučené aliasy odběratelů (zkomolený název → správný název).
  for (const a of placeAliases) {
    const wrong = normPlaceName(a.wrong_name);
    if (wrong && (wrong === c || (c.length >= 4 && wrong.includes(c)) || (wrong.length >= 4 && c.includes(wrong)))) {
      const correct = places.find((p) => normPlaceName(p.name) === normPlaceName(a.correct_name));
      if (correct) return { id: correct.id, name: correct.name };
    }
  }

  // 2) Přesná normalizovaná shoda s odběratelem v katalogu.
  const exact = places.find((p) => normPlaceName(p.name) === c);
  if (exact) return { id: exact.id, name: exact.name };

  // 3) Kandidát je součástí názvu odběratele (např. AI vrátí jen "Naseb",
  //    v katalogu je "Na Seb"). Jen pro dostatečně dlouhé kandidáty.
  if (c.length >= 5) {
    const contained = places.find((p) => {
      const np = normPlaceName(p.name);
      return np.length >= 4 && np.includes(c);
    });
    if (contained) return { id: contained.id, name: contained.name };
  }

  // 4) Shoda podle podstatných slov názvu z katalogu: "Růžku" → "Restaurace
  //    Na Růžku", "Malesice" → "Malešice". Přednost má databáze odběratelů.
  const cWords = placeSignificantWords(c);
  if (cWords.length > 0) {
    let wordBest: { place: { id: string; name: string }; score: number } | null = null;
    for (const p of places) {
      const np = normPlaceName(p.name);
      const pWords = placeSignificantWords(np);
      if (pWords.length === 0) continue;
      const matched = pWords.filter((w) =>
        cWords.some((cw) => cw === w || cw.includes(w) || (cw.length >= 4 && w.includes(cw)))
      ).length;
      const score = matched / pWords.length;
      if (score >= 0.6 && (!wordBest || score > wordBest.score)) {
        wordBest = { place: p, score };
      }
    }
    if (wordBest) return { id: wordBest.place.id, name: wordBest.place.name };
  }

  // 5) Fuzzy shoda s názvy z katalogu (překlepy, OCR šum) — jen pro dostatečně
  //    dlouhé názvy, aby nevznikaly falešné shody jako "patek" → "Radek".
  if (c.length >= 5) {
    let fuzzyBest: { id: string; name: string; score: number } | null = null;
    for (const p of places) {
      const np = normPlaceName(p.name);
      if (np.length < 5) continue;
      const s = bestFuzzyScoreInText(np, c);
      if (s > (fuzzyBest?.score ?? 0)) fuzzyBest = { id: p.id, name: p.name, score: s };
    }
    if (fuzzyBest && fuzzyBest.score >= 0.8) return { id: fuzzyBest.id, name: fuzzyBest.name };
  }

  return { id: null, name: null };
}

// Bezpečný update zprávy: když se plný update nepovede (např. chybějící sloupec
// v DB), zkusí se alespoň minimální update jen na status + error_message. Cíl:
// zpráva NIKDY nesmí uvíznout ve stavu 'processing' (původní bug — tichý fail
// update nechal zprávu viset navždy). fallbackStatus říká, kam zprávu vrátit,
// když se plný update nepovede: "error" (viditelné, bez automatického retry)
// nebo "pending" (zpráva se zkusí zpracovat znova).
async function safeUpdateMessage(
  supabase: any,
  id: string,
  patch: Record<string, unknown>,
  fallbackStatus: "error" | "pending" = "error"
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("whatsapp_incoming")
    .update(patch)
    .eq("id", id);
  if (!error) return { ok: true };

  console.error(`Update whatsapp_incoming ${id} selhal:`, error);
  const { error: fallbackError } = await supabase
    .from("whatsapp_incoming")
    .update({
      status: fallbackStatus,
      error_message: `store-failed: ${error.message || "update failed"}`,
    })
    .eq("id", id);
  if (fallbackError) {
    console.error(`Fallback update ${id} selhal taky:`, fallbackError);
    return { ok: false, error: error.message };
  }
  return { ok: false, error: error.message };
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get pending messages (limit to 10 at a time)
    const { data: pendingMessages, error: fetchError } = await supabase
      .from("whatsapp_incoming")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    if (fetchError) {
      console.error("Error fetching pending messages:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch pending messages", details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pendingMessages || pendingMessages.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending messages to process",
          processed: 0
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current catalog data for AI parsing
    const [beersRes, packagesRes, placesRes] = await Promise.all([
      supabase.from("beers").select("id, name, degree, short_name").order("name"),
      supabase.from("packages").select("id, label, volume_l").order("label"),
      supabase.from("places").select("id, name").order("name"),
    ]);

    const beers = beersRes.data || [];
    const packages = packagesRes.data || [];
    const places = placesRes.data || [];

    // Get alias maps
    const { data: aliasRows } = await supabase
      .from("parser_aliases")
      .select("alias_text, beer_id, package_id");

    // parser_aliases ukládá id piva/obalu → převedeme je na čitelné názvy pro AI
    // a zároveň si připravíme mapu alias_text → id pro přiřazení položek.
    const aliasRowsSafe = aliasRows || [];
    const aliasMap = {
      beer: new Map<string, string>(),
      package: new Map<string, string>(),
    };
    for (const a of aliasRowsSafe) {
      if (a.beer_id) aliasMap.beer.set(a.alias_text, a.beer_id);
      if (a.package_id) aliasMap.package.set(a.alias_text, a.package_id);
    }
    const aliases = aliasRowsSafe.map((a: any) => ({
      alias_text: a.alias_text,
      beer_name: (beers as any[]).find((b) => b.id === a.beer_id)?.name ?? null,
      package_label: (packages as any[]).find((p) => p.id === a.package_id)?.label ?? null,
    }));

    // Get place aliases
    const { data: placeAliasRows } = await supabase
      .from("place_aliases")
      .select("wrong_name, correct_name");

    const placeAliases = placeAliasRows || [];

    // Povolení odesílatelé (whitelist): pokud je seznam neprázdný, zpracujeme
    // jen zprávy ze skupiny „Objednávky pivovar“ — podle chat_id (primárně)
    // nebo názvu skupiny (přechodně, dokud chat_id není zaregistrováno).
    // Ostatní (a VŠECHNY vlastní zprávy z jiných zařízení, from_me) se označí
    // 'ignored', aby neležely v aplikaci jako 'pending'.
    const { data: senderRows } = await supabase
      .from("whatsapp_senders")
      .select("sender_name, chat_id");
    const allowedNames = (senderRows || [])
      .map((s: any) => normName(s.sender_name))
      .filter(Boolean);
    const allowedChatIds = (senderRows || [])
      .map((s: any) => (s.chat_id || "").trim().toLowerCase())
      .filter(Boolean);
    const chatIdConfigured = allowedChatIds.length > 0;
    const isSenderAllowed = (message: any): boolean => {
      // Vlastní zpráva → nikdy k AI (pojistka; webhook je už neukládá).
      if (message.from_me === true) return false;
      const chat = (message.chat_id || "").trim().toLowerCase();
      if (chatIdConfigured) {
        return chat !== "" && allowedChatIds.includes(chat);
      }
      return allowedNames.length === 0 || allowedNames.includes(normName(message.sender_name));
    };

    // Process each pending message
    const results = [];
    for (const message of pendingMessages) {
      try {
        // Whitelist odesílatelů — do aplikace smí projít jen zprávy ze skupiny
        // „Objednávky pivovar" (webhook jiné zprávy už ani neuloží). Starší
        // zprávy od nepovolených odesílatelů označíme 'ignored', aby neležely
        // v aplikaci jako 'pending' a nezvětšovaly počítadlo.
        if (!isSenderAllowed(message)) {
          const isOwn = message.from_me === true;
          await safeUpdateMessage(
            supabase,
            message.id,
            {
              status: "ignored",
              error_message: isOwn
                ? "Vlastní zpráva (from_me) — nikdy se nezpracovává (prevence smyčky)"
                : "Odesílatel není povolený (povolena je jen skupina Objednávky pivovar)",
            },
            "pending"
          );
          results.push({
            id: message.id,
            status: "ignored",
            reason: isOwn ? "from_me" : "sender not allowed",
          });
          continue;
        }

        // Mark as processing — když se to nepodaří, zpráva zůstane 'pending'
        // a v této iteraci ji přeskočíme (zpracuje ji někdo příště).
        const { ok: markOk, error: markError } = await safeUpdateMessage(
          supabase,
          message.id,
          { status: "processing" },
          "pending"
        );
        if (!markOk) {
          results.push({ id: message.id, status: "error", error: markError });
          continue;
        }

        // Do AI jde JEN poslední zpráva (jméno + text), žádná celá konverzace.
        // Předchozí zprávy od stejného odesílatele se neposílají — AI má číst
        // jen text aktuální objednávky, ne celý chat.

        // Call the existing parse-order-text edge function
        const parseUrl = `${supabaseUrl}/functions/v1/parse-order-text`;

        const parseBody = {
          rawText: message.message_text,
          beers,
          packages,
          places: places.map(p => p.name),
          aliases,
          placeAliases,
          messages: [
            {
              sender: message.sender_name,
              date: message.message_timestamp ?
                    new Date(message.message_timestamp).toISOString().split('T')[0] :
                    null,
              text: message.message_text
            }
          ]
        };

        const parseResponse = await fetch(parseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify(parseBody),
        });

        if (!parseResponse.ok) {
          throw new Error(`Parse API error: ${parseResponse.status}`);
        }

        const parseResult = await parseResponse.json();

        if (parseResult.error) {
          // If AI parsing fails, mark as error (fallback 'pending', ať zpráva
          // neuvízne v 'processing', kdyby selhal i tenhle update).
          await safeUpdateMessage(
            supabase,
            message.id,
            { status: "error", error_message: parseResult.error },
            "pending"
          );

          results.push({
            id: message.id,
            status: "error",
            error: parseResult.error
          });
          continue;
        }

        // Extract parsed items and find place matches
        const parsedItems = parseResult.items || [];
        let parsedPlaceId: string | null = null;
        let parsedPlaceName: string | null = null;

        // Try to match place from parsed items, top-level place_name (stejné
        // ladění jako u čtení z fotek), nebo celý text zprávy. Odesílatel se
        // jako odběratel NIKDY nepoužívá — je to jen posel. Proto vyřadíme
        // kandidáty odpovídající jménu odesílatele a z textu zprávy odstraníme
        // jeho jméno (např. pozdrav "Ahoj, tady Miláček" nesmí zastínit
        // skutečného odběratele "U Dubu"). Vše prochází matchPlaceSafely,
        // které páruje primárně s DATABÁZÍ odběratelů aplikace.
        const topLevelPlaceName: string | null = parseResult.place_name || null;
        const firstItemPlaceName: string | null =
          (parsedItems.length > 0 && parsedItems[0].place_name) || null;

        // Jméno odesílatele (posla) nikdy nepoužijeme jako odběratele.
        const senderNormPlace = normPlaceName(message.sender_name);
        const isSameAsSender = (name: string | null | undefined): boolean =>
          !!name && !!senderNormPlace && normPlaceName(name) === senderNormPlace;

        // Z textu zprávy odstraníme jméno odesílatele, aby nemohlo zastínit
        // odběratele, který je napsaný uvnitř zprávy.
        const cleanTextForPlace = stripSenderName(message.message_text, message.sender_name);

        const placeCandidates = [
          firstItemPlaceName,
          topLevelPlaceName,
          cleanTextForPlace,
        ].filter((c): c is string => !!c && c.trim().length > 0 && !isSameAsSender(c));

        for (const candidate of placeCandidates) {
          const matched = matchPlaceSafely(
            candidate,
            cleanTextForPlace,
            places,
            placeAliases
          );
          if (matched.id) {
            parsedPlaceId = matched.id;
            parsedPlaceName = matched.name;
            break;
          }
        }

        // Extract delivery day/date from message text — nejdřív konkrétní datum
        // (např. "25.8." → objednávka se přesune do týdne 25.8.), pak zítra/dnes,
        // pak název dne.
        let deliveryDay: string | null = null;
        let deliveryDate: string | null = null;

        const dateInfo = parseExplicitDate(message.message_text);
        if (dateInfo) {
          deliveryDate = dateInfo.dateStr;
          deliveryDay = weekdayCode(dateInfo.dateStr);
        } else {
          const now = new Date();
          if (/\bz[ií]tra\b/i.test(message.message_text)) {
            const tomorrow = new Date(now);
            tomorrow.setDate(now.getDate() + 1);
            deliveryDate = tomorrow.toISOString().slice(0, 10);
            deliveryDay = weekdayCode(deliveryDate);
          } else if (/\bdnes\b/i.test(message.message_text)) {
            deliveryDate = now.toISOString().slice(0, 10);
            deliveryDay = weekdayCode(deliveryDate);
          } else {
            const dayPatterns = [
              { regex: /(?:na\s+)?pond[eě]l[ií]/i, code: "po" },
              { regex: /(?:na\s+)?[uú]ter[yý]/i, code: "ut" },
              { regex: /(?:na\s+)?st[rř]ed[uuy]/i, code: "st" },
              { regex: /(?:na\s+)?[cč]tvrtek/i, code: "ct" },
              { regex: /(?:na\s+)?p[aá]tek/i, code: "pa" },
              { regex: /(?:na\s+)?sobot[au]/i, code: "so" },
              { regex: /(?:na\s+)?ned[eě]l[ei]/i, code: "ne" },
            ];
            for (const pattern of dayPatterns) {
              if (pattern.regex.test(message.message_text)) {
                deliveryDay = pattern.code;
                break;
              }
            }
          }
        }

        // Extract note — řádky, které nevypadají jako položky objednávky,
        // plus klíčová slova (výčep, sklo, etikety…) hledaná v celém textu,
        // plus konkrétní datum zprávy (např. "Datum: 25.8.").
        let note: string | null = null;
        const noteParts: string[] = [];
        const lines = message.message_text.split('\n').map(l => l.trim()).filter(Boolean);
        const noteLines = lines.filter(line => {
          const isGreeting = /^(ahoj|dobrý den|dobry den|zdravim|zdravím|cau|čau|prosím|prosim)/i.test(line);
          const containsItem = /\d+\s*(?:x|ks|keg|l|lity?r|sud)/i.test(line);
          return !isGreeting && !containsItem;
        });
        if (noteLines.length > 0) {
          noteParts.push(noteLines.join('; ').replace(/pro\s+[^;]+/gi, '').trim());
        }

        // Klíčová slova poznámek — i když jsou na stejném řádku jako položky.
        // Pozor: label může být funkce (vrací nalezený text) NEBO statický string
        // (např. 'faktura', 'sleva') — viz použití níže.
        const noteKeywords: { re: RegExp; label: ((m: RegExpMatchArray) => string) | string }[] = [
          { re: /\b(?:jedno|dvoj|troj|ctyr|sesti)?(?:pipa|pipy|pipu|kohout|kohouty)\b|\bvycep\w*|\bvyčep\w*|\bpujcit\s*vycep\b|\bpůjčit\s*výčep\b|\bchlazeni\b|\bchladak\b|\bchlazení\b|\bchladák\b|\bnarazec\b|\bnaražeč\b|\bnarazeni\b|\bnaražení\b/i, label: (m) => m[0].trim() },
          { re: /\b(?:pridat\s+|jeste\s+|ještě\s+|a\s+|i\s+|take\s+|také\s+)(?:sklo\b|podtacky\b|podtácky\b)|\bsklenic[eí]?\b/i, label: (m) => m[0].trim() },
          { re: /\bbez\s*etiket\b|\bbez\s*etiket[a]?\b/i, label: 'bez etikety' },
          { re: /\betiket\w*\s*(?:mm|m\b|xxl)?/i, label: (m) => m[0].trim() },
          { re: /\bvratne\s*lahve\b|\bvraceni\s*lahvi\b|\bvratné\s*lahve\b|\bvrácení\s*lahví\b/i, label: 'vrácení lahví' },
          { re: /\bzaplaceno\b|\bplaceno\b/i, label: 'zaplaceno' },
          { re: /\bfaktur/i, label: 'faktura' },
          { re: /\bsleva\b/i, label: 'sleva' },
          { re: /\bspotak(y)?\b/i, label: (m) => m[0].trim() },
        ];
        for (const kw of noteKeywords) {
          const m = message.message_text.match(kw.re);
          if (m) {
            // label je buď funkce (zpracuje nalezený match) nebo statický string
            const t = (typeof kw.label === 'function' ? kw.label(m) : kw.label).trim();
            if (t && !noteParts.some((p) => p.toLowerCase().includes(t.toLowerCase()))) noteParts.push(t);
          }
        }

        // Konkrétní datum (např. "25.8.") se zapíše do poznámky.
        if (dateInfo) {
          const dnote = `Datum: ${dateInfo.display}`;
          if (!noteParts.some((p) => p.includes(dnote) || p.includes(dateInfo.dateStr))) noteParts.push(dnote);
        }

        note = noteParts.filter(Boolean).join('; ') || null;
        if (note && note.length < 3) note = null;

        // Spárovat položky s katalogem (beer_id, pkg_id) podle názvu/stupně/balení,
        // aby objednávka odkazovala na skutečná piva a obaly.
        const itemsForStorage = parsedItems.map((item: any) => ({
          beer_id: matchBeerId(item, beers, aliasMap),
          pkg_id: matchPackageId(item, packages, aliasMap),
          qty: item.quantity || null,
          degree: item.degree || null,
          beer_name: item.beer_name || null,
          package_label: item.package_label || null,
          raw_line: item.raw_line || null,
        }));

        // ✅ Zdroj objednávek je jediná WhatsApp skupina „Objednávky pivovar"
        // (whitelist odesílatelů — webhook jiné zprávy neuloží). Všechny zprávy
        // z ní jsou objednávky, takže se uloží jako 'parsed' a v aplikaci se
        // zobrazí ke schválení — i když AI z textu nepřečetla žádnou položku
        // (chybějící položky se doplní ručně v kontrolním modálu).

        // Update message with parsed data — když se uložení nepovede (např.
        // chybějící sloupec v DB), zpráva skončí ve stavu 'error' s popisem
        // chyby a NIKDY neuvízne v 'processing' (původní tichý bug).
        const { ok: storeOk, error: storeError } = await safeUpdateMessage(
          supabase,
          message.id,
          {
            status: "parsed",
            error_message: null, // smaže případnou starou chybu z minulého pokusu
            parsed_place_id: parsedPlaceId,
            parsed_place_name: parsedPlaceName,
            parsed_delivery_day: deliveryDay,
            parsed_delivery_date: deliveryDate,
            parsed_note: note,
            parsed_raw_text: parseResult.raw_text || null,
            parsed_items: itemsForStorage,
            readback_unmatched_count: readbackUnmatchedCount(
              itemsForStorage,
              message.message_text
            ),
          },
          "error"
        );
        if (!storeOk) {
          results.push({
            id: message.id,
            status: "error",
            error: storeError,
          });
          continue;
        }

        results.push({
          id: message.id,
          status: "parsed",
          place_id: parsedPlaceId,
          place_name: parsedPlaceName,
          items_count: parsedItems.length,
        });

      } catch (error: any) {
        console.error(`Error processing message ${message.id}:`, error);

        await safeUpdateMessage(
          supabase,
          message.id,
          {
            status: "error",
            error_message: error.message || "Unknown processing error"
          },
          "pending"
        );

        results.push({
          id: message.id,
          status: "error",
          error: error.message
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} messages`,
        matcher_version: 4,
        results,
        summary: {
          parsed: results.filter(r => r.status === "parsed").length,
          ignored: results.filter(r => r.status === "ignored").length,
          skipped: results.filter(r => r.status === "skipped").length,
          error: results.filter(r => r.status === "error").length,
          total: results.length
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: err?.message || String(err)
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});