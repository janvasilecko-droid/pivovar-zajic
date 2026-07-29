import { Beer, Package, Place } from './supabase';
import { parseVoiceOrder, ParserAliasMap, ParsedLine } from './orderParser';

export type ParsedWhatsAppResult = {
  placeId: string | null;
  placeName: string | null;
  deliveryDay: string | null;
  deliveryDate: string | null;
  note: string | null;
  items: ParsedLine[];
};

const DAY_MAP: { regex: RegExp; code: string }[] = [
  { regex: /\b(?:v\s+|na\s+)?pond[eě]l[ií]\b|\bpo\b/i, code: 'po' },
  { regex: /\b(?:v\s+|na\s+)?[uú]ter[yý]\b|\b[uú]t\b/i, code: 'ut' },
  { regex: /\b(?:ve\s+|na\s+)?st[rř]ed[uuy]\b|\bst\b/i, code: 'st' },
  { regex: /\b(?:ve\s+|na\s+)?[cč]tvrtek\b|\b[cč]tvrtek\b|\b[cč]t\b/i, code: 'ct' },
  { regex: /\b(?:v\s+|na\s+)?p[aá]tek\b|\bp[aá]tky\b|\bpa\b/i, code: 'pa' },
  { regex: /\b(?:v\s+|na\s+)?sobot[uu]\b|\bsobota\b|\bso\b/i, code: 'so' },
  { regex: /\b(?:v\s+|na\s+)?ned[eě]li\b|\bned[eě]le\b|\bne\b/i, code: 'ne' },
];

export function detectDeliveryDay(text: string): { day: string | null; dateStr: string | null; cleanText: string } {
  let dayCode: string | null = null;
  let dateStr: string | null = null;
  let cleanText = text;

  // Check for "zítra" or "dnes"
  const now = new Date();
  if (/\bz[ií]tra\b/i.test(text)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const dayIdx = (tomorrow.getDay() + 6) % 7; // 0=po, 6=ne
    const dayCodes = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'];
    dayCode = dayCodes[dayIdx];
    dateStr = tomorrow.toISOString().slice(0, 10);
    cleanText = cleanText.replace(/\bz[ií]tra\b/gi, '');
  } else if (/\bdnes\b/i.test(text)) {
    const dayIdx = (now.getDay() + 6) % 7;
    const dayCodes = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'];
    dayCode = dayCodes[dayIdx];
    dateStr = now.toISOString().slice(0, 10);
    cleanText = cleanText.replace(/\bdnes\b/gi, '');
  } else {
    for (const d of DAY_MAP) {
      if (d.regex.test(text)) {
        dayCode = d.code;
        cleanText = cleanText.replace(d.regex, '');
        break;
      }
    }
  }

  return { day: dayCode, dateStr, cleanText: cleanText.trim() };
}

export function parseWhatsAppOrderMessage(
  rawMessage: string,
  beers: Beer[],
  packages: Package[],
  places: Place[],
  aliasMap?: ParserAliasMap
): ParsedWhatsAppResult {
  // 1. Detect delivery day
  const { day, dateStr, cleanText } = detectDeliveryDay(rawMessage);

  // 2. Parse place & items using fuzzy voice/text parser
  const parsedVoice = parseVoiceOrder(cleanText, beers, packages, places, aliasMap);

  // 3. Extract notes (extra text after greetings & items)
  let noteText: string | null = null;
  const lines = rawMessage.split('\n').map((l) => l.trim()).filter(Boolean);
  const noteLines = lines.filter((line) => {
    const isGreeting = /^(ahoj|dobrý den|dobry den|zdravim|zdravím|cau|čau|prosím|prosim)/i.test(line);
    const containsItem = /\d+\s*(?:x|ks|keg|l|lity?r|sud)/i.test(line);
    return !isGreeting && !containsItem;
  });

  if (noteLines.length > 0) {
    noteText = noteLines.join('; ').replace(/pro\s+[^;]+/gi, '').trim();
    if (noteText.length < 3) noteText = null;
  }

  return {
    placeId: parsedVoice.placeId,
    placeName: parsedVoice.placeName,
    deliveryDay: day,
    deliveryDate: dateStr,
    note: noteText,
    items: parsedVoice.items,
  };
}
