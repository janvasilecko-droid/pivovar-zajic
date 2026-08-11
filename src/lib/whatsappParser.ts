import { Beer, Package, Place, supabase } from './supabase';
import { parseGeminiItems, matchPlaceFromText, detectOrderNotes, loadAliasMap, loadPlaceAliasMap, ParserAliasMap, ParsedLine, GeminiItem } from './orderParser';
import { parseExplicitDate } from './orderDates';

export type ParsedWhatsAppResult = {
  placeId: string | null;
  placeName: string | null;
  deliveryDay: string | null;
  deliveryDate: string | null;
  note: string | null;
  items: ParsedLine[];
  /** Doslovný přepis textu od AI (raw_text) — pro kontrolu čtení. */
  raw_text?: string | null;
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

  // 0) Konkrétní datum (např. "25.8.") má přednost — objednávka se přesune
  //    do týdne daného data a datum se napíše do poznámky.
  const explicit = parseExplicitDate(text);
  if (explicit) {
    dateStr = explicit.dateStr;
    const dow = new Date(explicit.dateStr + 'T00:00:00Z').getUTCDay();
    dayCode = ['ne', 'po', 'ut', 'st', 'ct', 'pa', 'so'][dow];
    cleanText = cleanText.replace(new RegExp(explicit.matched.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ').replace(/\s+/g, ' ').trim();
    return { day: dayCode, dateStr, cleanText };
  }

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

// 🧠 AI PARSE — STEJNÉ ČTENÍ JAKO Z FOTKY:
// Volá edge funkci parse-order-text (s vyladěným promptem pro WhatsApp), pak
// položky namapuje přes parseGeminiItems (shoda s katalogem aplikace). Tuto
// cestu používá automatické zpracování (whatsapp-auto-parse) i manuální výběr
// v WhatsAppAutoProcessorModal, aby se špatné přiřazení piv/obalů opravilo
// identicky jako u čtení z fotky.
export async function parseWhatsAppOrderMessageWithAI(
  rawMessage: string,
  beers: Beer[],
  packages: Package[],
  places: Place[],
  sender?: string | null,
  messageTimestamp?: string | null,
  aliasMapOverride?: ParserAliasMap,
  placeAliasMapOverride?: Map<string, string>,
  messageId?: string,
): Promise<ParsedWhatsAppResult> {
  // 1. Naučené zkratky (piva + obaly) a aliasy odběratelů — stejné hinty
  //    jako posílá čtení z fotky (ImportFromImage).
  const [aliasMap, placeAliasMap] = await Promise.all([
    aliasMapOverride ?? loadAliasMap(),
    placeAliasMapOverride ?? loadPlaceAliasMap(),
  ]);

  const aliasList = [
    ...[...aliasMap.beer.entries()].map(([alias_text, beer_id]) => ({
      alias_text,
      beer_name: beers.find((b) => b.id === beer_id)?.name ?? null,
      package_label: null as string | null,
    })),
    ...[...aliasMap.package.entries()].map(([alias_text, package_id]) => ({
      alias_text,
      beer_name: null as string | null,
      package_label: packages.find((p) => p.id === package_id)?.label ?? null,
    })),
  ].slice(0, 80);

  const placeAliasList = [...placeAliasMap.entries()]
    .map(([wrong_name, place_id]) => {
      const place = places.find((pl) => pl.id === place_id);
      return place ? { wrong_name, correct_name: place.name } : null;
    })
    .filter((x): x is { wrong_name: string; correct_name: string } => x !== null)
    .slice(0, 50);

  // Neplatné/částečné časové razítko (např. "2026-08-04T8:41:00" z WhatsApp exportu
  // s jednocifernou hodinou) nesmí shodit celé zpracování — pošleme null.
  const date = messageTimestamp
    ? (() => {
        const d = new Date(messageTimestamp);
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
      })()
    : null;

  // Načtení kontextu z předchozích zpráv ve stejném chatu/skupině (chat_id)
  let chatContext: any[] = [];
  if (messageId) {
    try {
      const { data: currentMsg } = await supabase
        .from('whatsapp_incoming')
        .select('chat_id, created_at')
        .eq('id', messageId)
        .maybeSingle();

      if (currentMsg?.chat_id) {
        const { data: contextData } = await supabase
          .from('whatsapp_incoming')
          .select('sender_name, message_timestamp, message_text')
          .eq('chat_id', currentMsg.chat_id)
          .lt('created_at', currentMsg.created_at)
          .order('created_at', { ascending: false })
          .limit(3);

        if (contextData && contextData.length > 0) {
          chatContext = [...contextData].reverse().map((m: any) => ({
            sender: m.sender_name,
            date: m.message_timestamp ? new Date(m.message_timestamp).toISOString().split('T')[0] : null,
            text: m.message_text,
          }));
        }
      }
    } catch (e) {
      console.error('Chyba při načítání chat kontextu:', e);
    }
  }

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-order-text`;

  const resp = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      rawText: rawMessage,
      beers: beers.map((b) => ({ id: b.id, name: b.name, degree: b.degree ?? '' })),
      packages: packages.map((p) => ({ id: p.id, label: p.label })),
      places: places.map((pl) => pl.name),
      aliases: aliasList,
      placeAliases: placeAliasList,
      messages: [
        ...chatContext,
        { sender: sender ?? null, date, text: rawMessage }
      ],
    }),
  });

  const respText = await resp.text();
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try { msg += ': ' + (JSON.parse(respText)?.error ?? respText); } catch { msg += ': ' + respText; }
    throw new Error(msg);
  }
  let data: any;
  try { data = JSON.parse(respText); } catch { throw new Error('Neplatná odpověď: ' + respText.slice(0, 200)); }
  if (data?.error) throw new Error(data.error);

  // 2. AI položky → ParsedLine (stejný post-processing jako u fotek).
  const geminiItems: GeminiItem[] = data?.items ?? [];
  const items = parseGeminiItems(geminiItems, beers, packages, aliasMap, undefined, places);

  // 3. Odběratel — top-level place_name z AI má přednost (stejné ladění jako
  //    u čtení z fotek), pak place_name položek, pak celý text zprávy.
  //    ODESÍLATEL se jako odběratel NIKDY nepoužívá — je to jen posel;
  //    odběratel je vždy napsaný UVNITŘ textu zprávy.
  //
  // Ukotvení (grounding): AI občas vymyslí odběratele, který v objednávce není
  // (hallucinace ze seznamu ZNÁMÍ ODBĚRATELÉ). Kandidát na odběratele proto
  // musí být "ukotven" — jeho název se musí vyskytovat v textu zprávy.
  // Stejně tak filtrujeme falešné fuzzy shody z textu (např. "patek" → "Radek").
  const isIgnoredSender = (name?: string | null) => {
    if (!name) return true;
    const norm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return ['bednar', 'petr', 'sladek', 'gabina', 'ucetni', 'pojmi', 'bendat'].some((s) => norm.includes(s));
  };
  const normGround = (s?: string | null) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  // Jméno odesílatele (posla) nikdy neoznačuje odběratele.
  const senderNormGround = normGround(sender);
  const isSameAsSender = (name?: string | null) =>
    !!name && !!senderNormGround && normGround(name) === senderNormGround;
  // Z textu zprávy odstraníme jméno odesílatele (pozdrav/podpis), aby nemohlo
  // zastínit odběratele, který je napsaný uvnitř zprávy.
  const stripSenderWords = (text: string): string => {
    if (!sender) return text;
    const words = sender.split(/\s+/).filter((w) => w.length >= 3);
    if (words.length === 0) return text;
    let out = text;
    for (const w of words) {
      out = out.replace(new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
    }
    return out.replace(/\s+/g, ' ').trim();
  };
  const groundText = stripSenderWords(rawMessage);
  const isPlaceGrounded = (candidate?: string | null) => {
    const c = normGround(candidate);
    if (!c || c.length < 3) return false;
    if (isSameAsSender(candidate)) return false;
    if (normGround(groundText).includes(c)) return true;
    return false;
  };
  // Shoda místa je důvěryhodná, pokud se název místa (nebo jeho podstatné
  // slovo) vyskytuje v textu zprávy (ne v odesílateli).
  const isMatchGrounded = (placeNameToCheck?: string | null) => {
    if (!placeNameToCheck) return false;
    if (isSameAsSender(placeNameToCheck)) return false;
    if (isPlaceGrounded(placeNameToCheck)) return true;
    const np = normGround(placeNameToCheck);
    const words = np.split(' ').filter((w) => w.length >= 3);
    if (words.some((w) => normGround(groundText).includes(w))) return true;
    return false;
  };

  const rawTextFromAi: string = data?.raw_text ?? rawMessage;
  const rawPlaceName: string | null = data?.place_name ?? null;
  const detectedPlaceName =
    (isIgnoredSender(rawPlaceName) || isSameAsSender(rawPlaceName)) ? null : rawPlaceName;

  let foundPlace = { placeId: null as string | null, placeName: null as string | null };
  if (detectedPlaceName && isPlaceGrounded(detectedPlaceName)) {
    foundPlace = matchPlaceFromText(detectedPlaceName, places, placeAliasMap);
    if (foundPlace.placeId && !isMatchGrounded(foundPlace.placeName)) foundPlace = { placeId: null, placeName: null };
  }
  let firstItemPlaceName: string | null = null;
  if (!foundPlace.placeId) {
    for (const item of geminiItems) {
      if (item.place_name && !isIgnoredSender(item.place_name) && !isSameAsSender(item.place_name)) {
        if (!firstItemPlaceName) firstItemPlaceName = item.place_name;
        if (isPlaceGrounded(item.place_name)) {
          foundPlace = matchPlaceFromText(item.place_name, places, placeAliasMap);
          if (foundPlace.placeId && !isMatchGrounded(foundPlace.placeName)) foundPlace = { placeId: null, placeName: null };
          if (foundPlace.placeId) break;
        }
      }
    }
  }
  if (!foundPlace.placeId) {
    // Celý text zprávy (bez jména odesílatele) — odběratel je uvnitř zprávy.
    foundPlace = matchPlaceFromText(stripSenderWords(rawTextFromAi || rawMessage), places, placeAliasMap);
    if (foundPlace.placeId && !isMatchGrounded(foundPlace.placeName)) foundPlace = { placeId: null, placeName: null };
  }

  let placeId = foundPlace.placeId;
  let placeName = foundPlace.placeName;
  if (!placeId && !placeName) {
    // AI rozpoznala jméno, ale neodpovídá žádnému známému odběrateli
    // → použij ho jako nového odběratele (placeNameFree). Jen pokud je
    // ukotveno v textu zprávy (ne vymyšlené) a není to jméno odesílatele.
    placeName = detectedPlaceName || firstItemPlaceName;
    if (placeName && (isSameAsSender(placeName) || !isPlaceGrounded(placeName))) placeName = null;
  }

  // 4. Den/datum dodání (zítra, dnes, název dne, ...).
  const { day, dateStr } = detectDeliveryDay(rawMessage);

  // 5. Poznámka (pipa, sklo, etikety…) — stejně jako u fotek / importu exportu.
  //    Když je v textu konkrétní datum (např. "25.8."), zapíšeme ho i do poznámky.
  const noteFromText = detectOrderNotes(rawTextFromAi || rawMessage) || null;
  let note = noteFromText;
  const detectedDate = parseExplicitDate(rawMessage);
  if (detectedDate) {
    const dnote = `Datum: ${detectedDate.display}`;
    note = note && note.includes(dnote) ? note : (note ? `${note}, ${dnote}` : dnote);
  }

  return { placeId, placeName, deliveryDay: day, deliveryDate: dateStr, note, items, raw_text: rawTextFromAi };
}
