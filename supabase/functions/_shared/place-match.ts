// Určení odběratele (place) ze zprávy/objednávky — vytažené z
// whatsapp-auto-parse/index.ts, aby šlo testovat (stejný důvod jako u
// beer-match.ts: dokud tahle logika seděla uvnitř edge funkce, nedala se
// z testů vůbec zavolat).
//
// ⚠️ Odesílatel zprávy (posel) se tu NIKDY nepoužívá jako odběratel — jméno
// odesílatele se z textu odstraňuje (`stripSenderName`) a kandidáti, kteří
// mu odpovídají, se vyřazují ještě před voláním `resolvePlace` (viz
// whatsapp-auto-parse/index.ts, výjimka je jen „pro mě"/„mi"/„mně").
import { bestFuzzyScoreInText } from "./beer-match.ts";

export function normPlaceName(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Odstraní jméno odesílatele (posla) z textu zprávy, aby nemohlo zastínit
// skutečného odběratele, který je uvedený UVNITŘ zprávy (např. pozdrav
// "Ahoj, tady Miláček" vs. odběratel "U Dubu").
export function stripSenderName(text: string, senderName: string | null | undefined): string {
  if (!senderName) return text;
  const words = senderName.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return text;
  let out = text;
  for (const w of words) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(w)}\\b`, "gi"), " ");
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Slova, která nenesou informaci o konkrétním odběrateli (druh provozovny,
// předložky…) — nesmí samy o sobě určovat shodu.
const PLACE_STOPWORDS = new Set([
  'u', 'na', 'pod', 've', 'v', 'za', 'nad', 'mezi',
  'hospoda', 'restaurace', 'pivnice', 'bar', 'vinarna', 'hostinec',
  'klub', 'kavarna', 'cukrarna', 'penzion', 'hotel', 'motel', 'pub',
  'lokalka', 'pivovar', 'minipivovar', 'stodola', 'sala', 'kulturni',
]);

export function placeSignificantWords(n: string): string[] {
  return n.split(/\s+/).filter((w) => w.length >= 3 && !PLACE_STOPWORDS.has(w));
}

// Ověří, že kandidát na odběratele je "ukotven" v textu zprávy. Jméno
// odesílatele se k ukotvení NEPOUŽÍVÁ — odesílatel je jen posel/doručovatel,
// odběratel musí být uvedený UVNITŘ textu zprávy. Brání tomu, aby AI vymyslelo
// odběratele, který v objednávce vůbec není (hallucinace ze seznamu známých
// odběratelů). Ukotvení je na úrovni podstatných slov (např. "Růžku" pro
// "Restaurace Na Růžku").
export function isPlaceGrounded(candidate: string, messageText: string): boolean {
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

// Bezpečné přiřazení odběratele Z KATALOGU: kandidát musí být ukotven v textu
// zprávy a odpovídat skutečnému místu z DATABÁZE odběratelů. Přednost má
// databáze — přesná shoda, obsažení, shoda podstatných slov, fuzzy shoda.
// Kandidát, který katalogu neodpovídá, vrátí { id: null, name: null } — i
// kdyby byl v textu jasně napsaný. Na to je `resolvePlace` níže.
export function matchPlaceSafely(
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

/** Nejdelší jméno, které se ještě bere jako věrohodný název odběratele. */
const MAX_FREEFORM_PLACE_LEN = 60;

export type ResolvedPlace = { id: string | null; name: string | null };

/**
 * Rozhodne, kdo je odběratel zprávy.
 *
 * `matchCandidates` (v pořadí důvěryhodnosti — typicky place_name z první
 * položky, top-level place_name z celé zprávy AI, pak celý vyčištěný text
 * zprávy jako poslední záchrana pro shodu podstatných slov katalogu) se
 * zkouší přes `matchPlaceSafely` proti katalogu odběratelů.
 *
 * Když katalog nic nenajde, ale AI přesto přečetla jméno PŘÍMO Z TEXTU
 * zprávy (parse-order-text ji na to instruuje: „u odběratele vrať text tak,
 * jak jsi ho přečetl" — viz bod 591 promptu), použije se tohle jméno jako
 * NEZÁVAZNÝ název (bez ID). `freeformCandidates` proto NESMÍ obsahovat celý
 * text zprávy — to není jméno, ale odstavec, a v poli "Odběratel" by
 * vypadalo jako chyba.
 *
 * Bez tohohle kroku zpráva s úplně novým odběratelem (žádná shoda v
 * katalogu) dopadla jako "Neznámý odběratel", i když jméno bylo přímo ve
 * zprávě napsané — z provozu 9. 9. 2026: "objednávka pro Tomáše od Marušky"
 * (Maruška posílá, Tomáš objednává) skončila jako Neznámý odběratel, přestože
 * AI přečetla "Tomáš" správně a jen v katalogu ještě není. S nezávazným
 * jménem appka nabídne rovnou "Tomáš" k potvrzení/založení
 * (`getOrCreatePlace`), ne prázdné pole, do kterého musí obsluha zprávu
 * znovu otevřít a přečíst ručně.
 */
export function resolvePlace(
  matchCandidates: (string | null | undefined)[],
  freeformCandidates: (string | null | undefined)[],
  messageText: string,
  places: { id: string; name: string }[],
  placeAliases: { wrong_name: string; correct_name: string }[]
): ResolvedPlace {
  for (const candidate of matchCandidates) {
    if (!candidate) continue;
    const matched = matchPlaceSafely(candidate, messageText, places, placeAliases);
    if (matched.id) return matched;
  }
  for (const candidate of freeformCandidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.length > MAX_FREEFORM_PLACE_LEN) continue;
    if (isPlaceGrounded(trimmed, messageText)) return { id: null, name: trimmed };
  }
  return { id: null, name: null };
}
