import { Beer, Package, Place } from './supabase';
import { parseVoiceOrder, ParserAliasMap, ParsedLine, matchPlaceFromText } from './orderParser';

export type ParsedWhatsAppResult = {
  placeId: string | null;
  placeName: string | null;
  deliveryDay: string | null;
  deliveryDate: string | null;
  note: string | null;
  items: ParsedLine[];
};

// Rozdělí vložený text (může obsahovat VÍCE WhatsApp zpráv od různých
// odběratelů) na jednotlivé zprávy. Podporuje běžné formáty exportu:
//   A) s časovými razítky:  "[12:00, 1.1.2026] Hospoda: text"
//   B) oddělené prázdným řádkem
//   C) s prefixem odesílatele na samostatném řádku
export function splitWhatsAppMessages(rawText: string): string[] {
  const text = (rawText || '').replace(/\r\n/g, '\n');
  if (!text.trim()) return [];

  // A) WhatsApp export s časovými razítky — podporuje více formátů:
  //    "[HH:MM, DD.MM.YYYY]", "[DD.MM.YYYY, HH:MM]", "DD.MM.YYYY, HH:MM -",
  //    "DD.MM.YYYY HH:MM -", "HH:MM, DD.MM.YYYY -"
  const tsRe = /(?:\[\d{1,2}:\d{2}(?::\d{2})?,\s*\d{1,2}\.\d{1,2}\.\d{2,4}\]|\[\d{1,2}\.\d{1,2}\.\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\]|\d{1,2}[./]\d{1,2}[./]\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*-|\d{1,2}[./]\d{1,2}[./]\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?\s*-|\d{1,2}:\d{2}(?::\d{2})?,\s*\d{1,2}\.\d{1,2}\.\d{2,4}\s*-)/g;
  const tsMatches = text.match(tsRe);
  if (tsMatches && tsMatches.length > 1) {
    const parts: string[] = [];
    let lastIdx = 0;
    let m: RegExpExecArray | null;
    const re = new RegExp(tsRe.source, 'g');
    while ((m = re.exec(text)) !== null) {
      if (m.index > 0) parts.push(text.slice(lastIdx, m.index).trim());
      lastIdx = m.index;
    }
    parts.push(text.slice(lastIdx).trim());
    return parts.filter((p) => p.length > 0);
  }

  // B) Oddělené prázdným řádkem (2+ prázdné řádky = nová zpráva)
  const blankSplit = text.split(/\n\s*\n\s*\n/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (blankSplit.length > 1) return blankSplit;

  // C) Prefix odesílatele na samostatném řádku, za nímž následuje obsah.
  //    Rozpoznáme řádek, který je sám o sobě názvem místa (odběratele).
  //    Toto je heuristika — pokud selže, vrátíme celý text jako jednu zprávu.
  return [text.trim()];
}

// Jedna zpráva z WhatsApp exportu s rozpoznaným odesílatelem a datem.
export type WhatsAppMessage = {
  sender: string | null;   // název odesílatele (odběratele), pokud je rozpoznán
  date: string | null;     // datum z časového razítka ve formátu YYYY-MM-DD
  time: string | null;     // čas z časového razítka HH:MM
  text: string;            // samotný obsah zprávy (bez razítka a odesílatele)
};

// Rozparsuje celý export z WhatsApp (např. celý měsíc konverzace) na jednotlivé
// zprávy s rozpoznaným odesílatelem a datem. Podporuje běžné formáty exportu:
//   A) "[12:00, 1.1.2026] Hospoda U Zajíce: Ahoj, na čtvrtek 2x 12° 50l"
//   B) "1.1.2026, 12:00 - Hospoda U Zajíce: Ahoj, na čtvrtek 2x 12° 50l"
//   C) "1/1/2026, 12:00 - Hospoda U Zajíce: Ahoj, na čtvrtek 2x 12° 50l"
// Pokud text neobsahuje časová razítka, rozdělí zprávy podle prázdných řádků.
export function parseWhatsAppExport(rawText: string): WhatsAppMessage[] {
  const text = (rawText || '').replace(/\r\n/g, '\n');
  if (!text.trim()) return [];

  // Formát A: [HH:MM(:SS), DD.MM.YYYY] Odesílatel: obsah
  // Formát A2: [DD.MM.YYYY, HH:MM] Odesílatel: obsah  (datum před časem)
  // Formát B/C: DD.MM.YYYY, HH:MM - Odesílatel: obsah  (nebo MM/DD/YYYY)
  // Formát D: DD.MM.YYYY HH:MM - Odesílatel: obsah  (bez čárky)
  // Formát E: HH:MM, DD.MM.YYYY - Odesílatel: obsah  (čas před datem bez závorek)
  // Pozor: datum může být "5.7.2026" i "5. 7. 2026" (s mezerami).
  const bracketRe = /^\[(\d{1,2}:\d{2}(?::\d{2})?),\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})\]\s*(.*)$/;
  // [DD.MM.YYYY, HH:MM] — datum v závorce před časem
  const bracketDateFirstRe = /^\[(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/;
  // Datum na začátku řádku: "1.1.2026, 12:00 - " nebo "1/1/2026, 12:00 - "
  const dashRe = /^(\d{1,2})[./]\s*(\d{1,2})[./]\s*(\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.*)$/;
  // "1.1.2026 12:00 - " (bez čárky mezi datem a časem)
  const dashNoCommaRe = /^(\d{1,2})[./]\s*(\d{1,2})[./]\s*(\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*(.*)$/;
  // "12:00, 1.1.2026 - " (čas před datem bez závorek)
  const timeFirstRe = /^(\d{1,2}:\d{2}(?::\d{2})?),\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{2,4})\s*-\s*(.*)$/;

  const messages: WhatsAppMessage[] = [];
  let current: WhatsAppMessage | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    let date: string | null = null;
    let time: string | null = null;
    let rest: string | null = null;

    const m = bracketRe.exec(line);
    if (m) {
      time = m[1];
      const dd = m[2].padStart(2, '0');
      const mm = m[3].padStart(2, '0');
      let yyyy = m[4];
      if (yyyy.length === 2) yyyy = '20' + yyyy;
      date = `${yyyy}-${mm}-${dd}`;
      rest = m[5];
    } else {
      // [DD.MM.YYYY, HH:MM] — datum v závorce před časem
      const mDateFirst = bracketDateFirstRe.exec(line);
      if (mDateFirst) {
        const dd = mDateFirst[1].padStart(2, '0');
        const mm = mDateFirst[2].padStart(2, '0');
        let yyyy = mDateFirst[3];
        if (yyyy.length === 2) yyyy = '20' + yyyy;
        date = `${yyyy}-${mm}-${dd}`;
        time = mDateFirst[4];
        rest = mDateFirst[5];
      } else {
        const m2 = dashRe.exec(line);
        if (m2) {
          time = m2[4];
          // Rozlišíme formát DD.MM vs MM/DD podle oddělovače
          const sep = line.match(/^(\d{1,2})([./])/)?.[2];
          let dd = m2[1];
          let mm = m2[2];
          if (sep === '/') {
            // MM/DD/YYYY (americký formát)
            dd = m2[2];
            mm = m2[1];
          }
          let yyyy = m2[3];
          if (yyyy.length === 2) yyyy = '20' + yyyy;
          date = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
          rest = m2[5];
        } else {
          // "1.1.2026 12:00 - " (bez čárky mezi datem a časem)
          const mNoComma = dashNoCommaRe.exec(line);
          if (mNoComma) {
            time = mNoComma[4];
            const sep = line.match(/^(\d{1,2})([./])/)?.[2];
            let dd = mNoComma[1];
            let mm = mNoComma[2];
            if (sep === '/') {
              dd = mNoComma[2];
              mm = mNoComma[1];
            }
            let yyyy = mNoComma[3];
            if (yyyy.length === 2) yyyy = '20' + yyyy;
            date = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
            rest = mNoComma[5];
          } else {
            // "12:00, 1.1.2026 - " (čas před datem bez závorek)
            const mTimeFirst = timeFirstRe.exec(line);
            if (mTimeFirst) {
              time = mTimeFirst[1];
              const dd = mTimeFirst[2].padStart(2, '0');
              const mm = mTimeFirst[3].padStart(2, '0');
              let yyyy = mTimeFirst[4];
              if (yyyy.length === 2) yyyy = '20' + yyyy;
              date = `${yyyy}-${mm}-${dd}`;
              rest = mTimeFirst[5];
            }
          }
        }
      }
    }

    if (rest !== null) {
      // Nová zpráva s časovým razítkem
      // Odesílatel je text mezi "]" (nebo "-") a ":" (pokud existuje)
      let sender: string | null = null;
      let content = rest;
      const colonIdx = rest.indexOf(':');
      if (colonIdx > 0) {
        const candidate = rest.slice(0, colonIdx).trim();
        // Odesílatel nesmí být jen číslo (telefon) — ale i tak ho necháme, je to lepší než nic
        // Vynecháme běžné pozdravy, které nejsou názvy míst
        const isGreeting = /^(ahoj|dobr[ýy]|zdrav[ií]m|cau|čau|pros[ií]m|d[eě]kuji|diky|díky|nazdar|hello|hi|dobr[ýy]\s+den|dobr[ýy]\s+vecer|dobr[ýy]\s+r[áa]no)\b/i.test(candidate);
        // Pokud je odesílatel telefonní číslo (obsahuje + a číslice), zkus najít
        // název místa v obsahu zprávy (např. "pro Hospodu U Zajíce")
        const isPhone = /^\+?\d[\d\s\-()]*$/.test(candidate);
        if (candidate.length > 0 && candidate.length < 60 && !isGreeting && !isPhone) {
          sender = candidate;
          content = rest.slice(colonIdx + 1).trim();
        } else if (isPhone) {
          // Telefonní číslo jako odesílatel — zkus najít název místa v obsahu
          const placeMatch = content.match(/\b(?:pro|do|na)\s+([A-Za-zÁ-Žá-ž][^,;]+?)(?=[,;]|$)/i);
          if (placeMatch && placeMatch[1].trim().length > 2) {
            sender = placeMatch[1].trim();
          }
        }
      }

      current = { sender, date, time, text: content };
      messages.push(current);
    } else if (current) {
      // Pokračování předchozí zprávy (víceřádková zpráva)
      current.text = current.text ? `${current.text}\n${line}` : line;
    } else {
      // Text bez razítka na začátku — vytvoř zprávu bez odesílatele
      current = { sender: null, date: null, time: null, text: line };
      messages.push(current);
    }
  }

  // Pokud nebyly nalezeny ŽÁDNÉ časové razítka, znamená to, že uživatel vložil
  // text bez exportu (např. zkopírované zprávy). V takovém případě rozdělíme
  // text podle prázdných řádků (2+ prázdné řádky = nová zpráva).
  const hasTimestamps = messages.some((m) => m.date !== null);
  if (!hasTimestamps && messages.length > 0) {
    const parts = splitWhatsAppMessages(text);
    if (parts.length > 1) {
      return parts.map((p) => {
        // Zkus rozpoznat odesílatele na prvním řádku: "Hospoda U Zajíce: obsah"
        let sender: string | null = null;
        let content = p;
        const firstLine = p.split('\n')[0];
        const colonIdx = firstLine.indexOf(':');
        if (colonIdx > 0) {
          const candidate = firstLine.slice(0, colonIdx).trim();
          if (candidate.length > 0 && candidate.length < 60 && !/\d/.test(candidate)) {
            sender = candidate;
            content = p.slice(firstLine.indexOf(':') + 1).trim();
          }
        }
        return { sender, date: null, time: null, text: content };
      });
    }
  }

  return messages;
}

// Seskupí zprávy z celého měsíce do objednávek. Zprávy od STEJNÉHO odesílatele,
// které jdou po sobě (jedna konverzace), se sloučí do jedné objednávky.
// Vrací pole objednávek, každá s textem (sloučeným) a datem poslední zprávy.
export function groupWhatsAppMessages(messages: WhatsAppMessage[]): WhatsAppMessage[] {
  const groups: WhatsAppMessage[] = [];
  for (const msg of messages) {
    const last = groups[groups.length - 1];
    // Sloučíme, pokud je stejný odesílatel a zprávy jdou po sobě (nebo obě bez odesílatele)
    if (last && last.sender === msg.sender) {
      last.text = `${last.text}\n${msg.text}`;
      last.date = msg.date ?? last.date; // datum poslední zprávy
      last.time = msg.time ?? last.time;
    } else {
      groups.push({ ...msg });
    }
  }
  return groups;
}

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
  aliasMap?: ParserAliasMap,
  placeAliasMap?: Map<string, string>,
  sender?: string | null,
): ParsedWhatsAppResult {
  // 1. Detect delivery day
  const { day, dateStr, cleanText } = detectDeliveryDay(rawMessage);

  // 2. Parse place & items using fuzzy voice/text parser
  const parsedVoice = parseVoiceOrder(cleanText, beers, packages, places, aliasMap, placeAliasMap);

  // 2b. Pokud se místo nenašlo v textu zprávy, zkus ho najít podle odesílatele
  //     (např. "[12:00, 1.1.2026] Hospoda U Zajíce: ..." → odesílatel "Hospoda U Zajíce").
  let placeId = parsedVoice.placeId;
  let placeName = parsedVoice.placeName;
  if (!placeId && !placeName && sender) {
    const senderMatch = matchPlaceFromText(sender, places, placeAliasMap);
    if (senderMatch.placeId) {
      placeId = senderMatch.placeId;
      placeName = senderMatch.placeName;
    }
  }

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
    placeId,
    placeName,
    deliveryDay: day,
    deliveryDate: dateStr,
    note: noteText,
    items: parsedVoice.items,
  };
}
