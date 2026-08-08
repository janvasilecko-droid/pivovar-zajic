// Ověřovací skript: odesílatel se NIKDY nesmí použít jako odběratel,
// odběratel se hledá vždy uvnitř textu zprávy.
// Logika je zkopírována 1:1 ze supabase/functions/whatsapp-auto-parse/index.ts.
import assert from 'node:assert/strict';

// ── kopie z whatsapp-auto-parse/index.ts ────────────────────────────────────
function levenshtein(a, b) {
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

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function bestFuzzyScoreInText(needle, haystack) {
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

function normPlaceName(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripSenderName(text, senderName) {
  if (!senderName) return text;
  const words = senderName.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return text;
  let out = text;
  for (const w of words) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(w)}\\b`, "gi"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

const PLACE_STOPWORDS = new Set([
  "u", "na", "pod", "ve", "v", "za", "nad", "mezi",
  "hospoda", "restaurace", "pivnice", "bar", "vinarna", "hostinec",
  "klub", "kavarna", "cukrarna", "penzion", "hotel", "motel", "pub",
  "lokalka", "pivovar", "minipivovar", "stodola", "sala", "kulturni",
]);

function placeSignificantWords(n) {
  return n.split(/\s+/).filter((w) => w.length >= 3 && !PLACE_STOPWORDS.has(w));
}

function isPlaceGrounded(candidate, messageText) {
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

function matchPlaceSafely(candidate, messageText, places, placeAliases) {
  const c = normPlaceName(candidate);
  if (!c || c.length < 3) return { id: null, name: null };
  if (!isPlaceGrounded(candidate, messageText)) return { id: null, name: null };

  for (const a of placeAliases) {
    const wrong = normPlaceName(a.wrong_name);
    if (wrong && (wrong === c || (c.length >= 4 && wrong.includes(c)) || (wrong.length >= 4 && c.includes(wrong)))) {
      const correct = places.find((p) => normPlaceName(p.name) === normPlaceName(a.correct_name));
      if (correct) return { id: correct.id, name: correct.name };
    }
  }

  const exact = places.find((p) => normPlaceName(p.name) === c);
  if (exact) return { id: exact.id, name: exact.name };

  if (c.length >= 5) {
    const contained = places.find((p) => {
      const np = normPlaceName(p.name);
      return np.length >= 4 && np.includes(c);
    });
    if (contained) return { id: contained.id, name: contained.name };
  }

  const cWords = placeSignificantWords(c);
  if (cWords.length > 0) {
    let wordBest = null;
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

  if (c.length >= 5) {
    let fuzzyBest = null;
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
// ── konec kopie ─────────────────────────────────────────────────────────────


// Simulace flow ze serveru (whatsapp-auto-parse).
function resolvePlace({ messageText, senderName, aiPlaceName, aiItemPlaceName, places }) {
  const topLevelPlaceName = aiPlaceName || null;
  const firstItemPlaceName = aiItemPlaceName || null;

  const senderNormPlace = normPlaceName(senderName);
  const isSameAsSender = (name) => !!name && !!senderNormPlace && normPlaceName(name) === senderNormPlace;

  const cleanTextForPlace = stripSenderName(messageText, senderName);

  const placeCandidates = [
    firstItemPlaceName,
    topLevelPlaceName,
    cleanTextForPlace,
  ].filter((c) => !!c && c.trim().length > 0 && !isSameAsSender(c));

  for (const candidate of placeCandidates) {
    const matched = matchPlaceSafely(candidate, cleanTextForPlace, places, []);
    if (matched.id) return matched.name;
  }
  return null;
}

const PLACES = [
  { id: 'dubu', name: 'U Dubu' },
  { id: 'milacek', name: 'Miláček' }, // v DB je i odběratel "Miláček" — ale odesílatel se nesmí použít!
  { id: 'seeberg', name: 'Seeberg' },
  { id: 'zajic', name: 'U Zajíce' },
];

// 1) Hlášený scénář: AI i položka říkají "Miláček" (odesílatel), v textu je "U Dubu".
assert.equal(
  resolvePlace({
    messageText: 'Dobrý den, tady Miláček. Objednáváme pro U Dubu 2x 12° 50l sud, 1x 30l.',
    senderName: 'Miláček',
    aiPlaceName: 'Miláček',
    aiItemPlaceName: 'Miláček',
    places: PLACES,
  }),
  'U Dubu',
  'Scénář 1: má být U Dubu, ne Miláček'
);

// 2) Odesílatel vůbec není v textu zprávy.
assert.equal(
  resolvePlace({
    messageText: 'Dobrý den, prosím objednávku pro U Dubu: 2x 12° 50l.',
    senderName: 'Miláček',
    aiPlaceName: 'Miláček',
    aiItemPlaceName: null,
    places: PLACES,
  }),
  'U Dubu',
  'Scénář 2: má být U Dubu'
);

// 3) V textu je odběratel U Zajíce, AI správně vrátila Seeberg (ale není v textu) → má vyhrát U Zajíce.
assert.equal(
  resolvePlace({
    messageText: 'Dobrý den, objednávka U Zajíce: 3x 12° 30l.',
    senderName: 'Miláček',
    aiPlaceName: 'Seeberg',
    aiItemPlaceName: null,
    places: PLACES,
  }),
  'U Zajíce',
  'Scénář 3: odběratel z textu má přednost před AI'
);

// 4) Text žádného odběratele neobsahuje → null (ne odesílatel!).
assert.equal(
  resolvePlace({
    messageText: 'Dobrý den, prosím 2x 12° 50l sud.',
    senderName: 'Miláček',
    aiPlaceName: 'Miláček',
    aiItemPlaceName: null,
    places: PLACES,
  }),
  null,
  'Scénář 4: bez odběratele v textu → null, ne odesílatel'
);

// 5) AI vrátila správného odběratele → použije se.
assert.equal(
  resolvePlace({
    messageText: 'Dobrý den, objednávka pro U Dubu 2x 12° 50l.',
    senderName: 'Miláček',
    aiPlaceName: 'U Dubu',
    aiItemPlaceName: null,
    places: PLACES,
  }),
  'U Dubu',
  'Scénář 5: AI správně → U Dubu'
);

console.log('✅ Všechny scénáře prošly — odesílatel se už nepoužívá jako odběratel.');
