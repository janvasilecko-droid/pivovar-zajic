import { Beer, Package, Place, supabase } from './supabase';
import { normPlaceName, stripSenderName, resolvePlace, odberatelZHistorie, wantsOwnOrder as textWantsOwnOrder } from '../../supabase/functions/_shared/place-match';
import { nactiHistorii } from '../../supabase/functions/_shared/historie-objednavek';
import { parseGeminiItems, detectOrderNotes, loadAliasMap, loadPlaceAliasMap, ParserAliasMap, ParsedLine, GeminiItem } from './orderParser';
import { parseExplicitDate } from './orderDates';
import { businessNow } from './businessDate';
import { authenticatedFunctionHeaders } from './functionAuth';
import { zalogujANahlas } from './chybyHlaseni';
import { norm } from './whatsappAmendment';

// 📷 Stažení fotky z WhatsApp (media_url ze Supabase Storage) a převod na base64
// pro AI čtení. Velké fotky zmenšíme na max. 1600 px (JPEG), aby se request
// vešel do limitu edge funkce a AI nemusela zpracovávat megapixelová data.
// Selhání jen zalogujeme a vrátíme null — zpráva se zpracuje i bez fotky (z textu).
// Blob.arrayBuffer(), pokud existuje (moderní prohlížeče i Node.js nativní fetch
// Blob) — jinak FileReader (jsdom vlastní Blob v testovacím prostředí arrayBuffer
// nemá, ale jeho vlastní FileReader ho čte v pořádku). Které API je k dispozici,
// se liší i mezi verzemi Node.js, proto obojí, ne jen jedno nebo druhé.
async function blobToBase64(blob: Blob): Promise<string> {
  if (typeof blob.arrayBuffer === 'function') {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Blob nelze přečíst'));
    reader.readAsDataURL(blob);
  });
}

function downscaleImageBlob(blob: Blob, maxDim = 1600): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2D není dostupný');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const comma = dataUrl.indexOf(',');
        resolve({ base64: dataUrl.slice(comma + 1), mimeType: 'image/jpeg' });
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Fotku nelze načíst'));
    };
    img.src = url;
  });
}

async function loadWhatsAppImageForAI(
  imageUrl: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      console.warn(`Fotku z WhatsApp nelze stáhnout pro AI čtení (HTTP ${resp.status})`);
      return null;
    }
    const blob = await resp.blob();
    if (!blob || blob.size === 0) return null;

    // Velké fotky zmenšíme — menší payload = rychlejší čtení i nižší riziko
    // překročení limitu edge funkce.
    if (blob.size > 2_500_000) {
      return await downscaleImageBlob(blob);
    }
    return { base64: await blobToBase64(blob), mimeType: blob.type || 'image/jpeg' };
  } catch (e) {
    console.warn('Chyba při zpracování fotky z WhatsApp pro AI čtení:', e);
    return null;
  }
}

export type ParsedWhatsAppResult = {
  placeId: string | null;
  placeName: string | null;
  deliveryDay: string | null;
  deliveryDate: string | null;
  note: string | null;
  items: ParsedLine[];
  /** Doslovný přepis textu od AI (raw_text) — pro kontrolu čtení. */
  raw_text?: string | null;
  /** ❓ Co si AI nebyla jistá — vidí to obsluha v kontrole objednávky. */
  otazky?: string[];
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

// \b v JS regexu bere za "slovní" znak jen [A-Za-z0-9_] — u slov končících
// českým znakem s diakritikou (úterý, pondělí) tak koncová \b vůbec nesedne
// (přechod diakritika→mezera/konec řetězce se nebere jako hranice slova) a
// pattern nikdy nenajde shodu. Proto vlastní unicode-aware hranice přes
// \p{L}/\p{N} (flag "u"), co diakritiku počítá jako písmeno správně.
const WB_BEFORE = '(?<![\\p{L}\\p{N}])';
const WB_AFTER = '(?![\\p{L}\\p{N}])';
function dayRegex(...alts: string[]): RegExp {
  return new RegExp(alts.map((a) => `${WB_BEFORE}${a}${WB_AFTER}`).join('|'), 'iu');
}

// „po" a „ne" jsou zkratky dnů, ale taky úplně běžná česká slova: „po Normě",
// „po 30 litrech", „ne, tenhle týden ne". Zkratka se proto bere jen tam, kde
// nemůže být ničím jiným — po předložce („v po") nebo jako popisek řádku
// („Po: 5x30"). Bez toho se z „na příští týden úterý PO Normě" stalo
// pondělí a objednávka spadla o den (a o týden) vedle.
const ZKRATKA_PO = '(?:(?:v|na)\\s+po|(?:^|\\n)\\s*po\\s*(?=[:\\-–]))';
const ZKRATKA_NE = '(?:(?:v|na)\\s+ne|(?:^|\\n)\\s*ne\\s*(?=[:\\-–]))';

const DAY_MAP: { regex: RegExp; code: string }[] = [
  { regex: dayRegex('(?:v\\s+|na\\s+)?pond[eě]l[ií]', ZKRATKA_PO), code: 'po' },
  { regex: dayRegex('(?:v\\s+|na\\s+)?[uú]ter[yý]', '[uú]t'), code: 'ut' },
  { regex: dayRegex('(?:ve\\s+|na\\s+)?st[rř]ed[uuy]', 'st'), code: 'st' },
  { regex: dayRegex('(?:ve\\s+|na\\s+)?[cč]tvrtek', '[cč]t'), code: 'ct' },
  { regex: dayRegex('(?:v\\s+|na\\s+)?p[aá]tek', 'p[aá]tky', 'pa'), code: 'pa' },
  { regex: dayRegex('(?:v\\s+|na\\s+)?sobot[uu]', 'sobota', 'so'), code: 'so' },
  { regex: dayRegex('(?:v\\s+|na\\s+)?ned[eě]li', 'ned[eě]le', 'ne'), code: 'ne' },
];

/**
 * „Na příští týden úterý" — zákazník myslí úterý NÁSLEDUJÍCÍHO týdne, ne
 * nejbližší úterý. Bez tohohle rozlišení se objednávka napsaná v pondělí
 * zavezla hned druhý den, tedy o týden dřív.
 */
const PRISTI_TYDEN_RE = /\b(p[řr][íi][šs]t[íi]|dal[šs][íi]|nadch[áa]zej[íi]c[íi])\s+t[ýy]den\b|\bza\s+t[ýy]den\b/i;

/**
 * ISO datum z LOKÁLNÍCH getterů (getFullYear/getMonth/getDate), ne z
 * toISOString() (ta čte UTC) — `d` sem chodí buď z businessNow(), nebo
 * z něj odvozené přes setDate(), takže je to vždy "pražský" kalendářní den.
 */
function isoZMistnihoData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Pondělí týdne, ve kterém den leží — pro porovnání „je to ještě tenhle týden?". */
function tydenOd(d: Date): string {
  const kopie = new Date(d);
  const posun = (kopie.getDay() + 6) % 7; // 0 = pondělí
  kopie.setDate(kopie.getDate() - posun);
  return `${kopie.getFullYear()}-${kopie.getMonth() + 1}-${kopie.getDate()}`;
}

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
  // now je "dnešek podle Prahy" s LOKÁLNÍMI gettery (viz businessNow) —
  // dál se s ním pracuje jen přes ně (getDay/getDate/...), nikdy přes
  // toISOString(), aby datum a den v týdnu vyšly ze stejné časové zóny.
  const now = businessNow();
  if (/\bz[ií]tra\b/i.test(text)) {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const dayIdx = (tomorrow.getDay() + 6) % 7; // 0=po, 6=ne
    const dayCodes = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'];
    dayCode = dayCodes[dayIdx];
    dateStr = isoZMistnihoData(tomorrow);
    cleanText = cleanText.replace(/\bz[ií]tra\b/gi, '');
  } else if (/\bdnes\b/i.test(text)) {
    const dayIdx = (now.getDay() + 6) % 7;
    const dayCodes = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'];
    dayCode = dayCodes[dayIdx];
    dateStr = isoZMistnihoData(now);
    cleanText = cleanText.replace(/\bdnes\b/gi, '');
  } else {
    for (const d of DAY_MAP) {
      if (d.regex.test(text)) {
        dayCode = d.code;
        cleanText = cleanText.replace(d.regex, '');
        break;
      }
    }
    // Název dne bez konkrétního data ("na úterý") → nejbližší nadcházející
    // výskyt toho dne (dnešek se počítá, pokud sedí). Napsáno v pondělí "na
    // úterý" = zítra (tento týden); napsáno ve středu "na úterý" = úterý už
    // bylo, takže úterý PŘÍŠTÍHO týdne.
    if (dayCode) {
      const dayCodes = ['ne', 'po', 'ut', 'st', 'ct', 'pa', 'so'];
      const targetIdx = dayCodes.indexOf(dayCode);
      const fromIdx = now.getDay();
      const diff = (targetIdx - fromIdx + 7) % 7;
      const target = new Date(now);
      // „na PŘÍŠTÍ TÝDEN úterý" = úterý toho týdne, co přijde po tomhle —
      // ne nejbližší úterý. Napsáno v pondělí by se jinak objednávka
      // zavezla hned zítra, tedy o týden dřív, než zákazník chtěl. Posun
      // se počítá od nejbližšího výskytu dne: když ten padne ještě do
      // tohoto týdne, přidá se sedm dní; když už je v příštím (např.
      // „v pátek na příští týden úterý"), je správně a nepřidává se nic.
      const target0 = new Date(now);
      target0.setDate(now.getDate() + diff);
      const pristiTyden = PRISTI_TYDEN_RE.test(text);
      const jeVTomtoTydnu = tydenOd(now) === tydenOd(target0);
      target.setDate(now.getDate() + diff + (pristiTyden && jeVTomtoTydnu ? 7 : 0));
      dateStr = isoZMistnihoData(target);
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
  imageUrl?: string | null,
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

  // Načtení kontextu z předchozích zpráv ve stejném chatu/skupině (chat_id).
  //
  // ⚠️ Okno MUSÍ sedět s automatickým zpracováním (whatsapp-auto-parse, které
  // bere až 200 zpráv / 7 dní zpátky) — dřív tu bylo natvrdo jen `limit(3)`.
  // Cesta "Přečíst znovu (AI)" v Kontrole objednávky (WhatsAppOrderReviewModal)
  // jde přes TUHLE funkci, takže zpráva, kterou automat správně spároval s
  // odběratelem z citace o pár zpráv dřív, po ručním "Přečíst znovu" o
  // odběratele přišla — AI citovanou zprávu v tak úzkém okně prostě neviděla
  // (z provozu 17. 9. 2026: odpověď „Radek" na citovanou objednávku se
  // znovunačtením rozparsovala bez odběratele).
  const CONTEXT_MAX_DAYS = 7;
  const CONTEXT_MAX_MESSAGES = 200;
  // Zároveň zjistíme SKUTEČNÉHO pisatele TÉTO zprávy (participant_name) —
  // u skupinového chatu je `sender` předaný voláním obvykle sender_name
  // (jméno mostu/skupiny, např. "Objednávky pivovar"), ne osoby, která
  // zprávu napsala. Bez tohohle appka u "pro mě" hledala odběratele podle
  // jména skupiny (z provozu 16. 9. 2026, viz whatsapp-auto-parse/index.ts).
  let chatContext: any[] = [];
  let quotedText: string | null = null;
  let effectiveSender = sender ?? null;
  // Citovaná zpráva, i když sama nezaložila objednávku — pořád může nést
  // svého rozpoznaného odběratele (viz fallback po resolvePlace níž, stejná
  // logika jako v supabase/functions/whatsapp-auto-parse/index.ts).
  let quotedPlaceId: string | null = null;
  let quotedPlaceName: string | null = null;
  if (messageId) {
    try {
      const { data: currentMsg } = await supabase
        .from('whatsapp_incoming')
        .select('chat_id, created_at, quoted_text, sender_name, participant_name')
        .eq('id', messageId)
        .maybeSingle();
      quotedText = currentMsg?.quoted_text || null;
      effectiveSender = currentMsg?.participant_name || currentMsg?.sender_name || effectiveSender;

      if (currentMsg?.chat_id) {
        const since = new Date(
          new Date(currentMsg.created_at).getTime() - CONTEXT_MAX_DAYS * 24 * 60 * 60 * 1000
        ).toISOString();
        const { data: contextData } = await supabase
          .from('whatsapp_incoming')
          .select('sender_name, participant_name, message_timestamp, message_text, from_me, created_at, imported_order_id, parsed_place_id, parsed_place_name')
          .eq('chat_id', currentMsg.chat_id)
          .lt('created_at', currentMsg.created_at)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(CONTEXT_MAX_MESSAGES);

        if (contextData && contextData.length > 0) {
          chatContext = [...contextData].reverse().map((m: any) => ({
            sender: m.participant_name || m.sender_name,
            date: m.message_timestamp ? new Date(m.message_timestamp).toISOString().split('T')[0] : null,
            text: m.message_text,
            fromMe: !!m.from_me,
          }));

          const q = norm(quotedText);
          if (q.length >= 3) {
            const kandidati = contextData.filter((z: any) => {
              const t = norm(z.message_text);
              return t && (t.startsWith(q) || q.startsWith(t));
            });
            const vybrany = kandidati.find((z: any) => z.imported_order_id) ?? kandidati[0] ?? null;
            if (vybrany) {
              quotedPlaceId = vybrany.parsed_place_id ?? null;
              quotedPlaceName = vybrany.parsed_place_name ?? null;
            }
          }
        }
      }
    } catch (e) {
      zalogujANahlas('Chyba při načítání chat kontextu', e);
    }
  }

  // 🧠 HISTORIE — co už víme z dřívějších objednávek tohohle odesílatele.
  // Stejná funkce jako na serveru (whatsapp-auto-parse), žádná vlastní kopie:
  // „Přečíst znovu" musí dát totéž, co dalo první automatické zpracování.
  // Bez tohohle měla AI při ručním přečtení méně informací než při prvním —
  // a táž zpráva se pak přečetla jinak podle toho, kudy šla.
  const { text: historieText, odberatele: historieOdberatelu } = await nactiHistorii(supabase, {
    odesilatel: effectiveSender,
    kdy: messageTimestamp || new Date().toISOString(),
  });

  // 📷 Fotka v příloze → stáhneme ji a pošleme AI, aby objednávku přečetla i z fotky.
  let imageBase64: string | null = null;
  let imageMimeType: string | null = null;
  if (imageUrl) {
    const loaded = await loadWhatsAppImageForAI(imageUrl);
    if (loaded) {
      imageBase64 = loaded.base64;
      imageMimeType = loaded.mimeType;
    }
  }

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-order-text`;

  const resp = await fetch(fnUrl, {
    method: 'POST',
    headers: await authenticatedFunctionHeaders(),
    body: JSON.stringify({
      rawText: rawMessage,
      beers: beers.map((b) => ({ id: b.id, name: b.name, degree: b.degree ?? '' })),
      packages: packages.map((p) => ({ id: p.id, label: p.label })),
      places: places.map((pl) => pl.name),
      aliases: aliasList,
      placeAliases: placeAliasList,
      historie: historieText,
      messages: [
        ...chatContext,
        { sender: effectiveSender, date, text: rawMessage, ...(quotedText ? { quotedText } : {}) }
      ],
      ...(imageBase64 ? { imageBase64, imageMimeType } : {}),
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
  //    ODESÍLATEL se jako odběratel normálně nepoužívá — je to jen posel;
  //    odběratel je vždy napsaný UVNITŘ textu zprávy. VÝJIMKA: "pro mě"/
  //    "mi"/"mně"/"pro mne" — pak je odběratelem PRÁVĚ odesílatel (viz
  //    `resolvePlace`/`matchOwnOrderPlace` v _shared/place-match.ts).
  //
  // Stejná funkce jako u serverového whatsapp-auto-parse (žádná vlastní
  // duplicitní logika) — appka se tak u "Přečíst znovu" chová stejně jako
  // u prvního (automatického) zpracování zprávy.
  const rawTextFromAi: string = data?.raw_text ?? rawMessage;
  const rawPlaceName: string | null = data?.place_name ?? null;
  const wantsOwnOrder = textWantsOwnOrder(rawMessage);
  const senderNorm = normPlaceName(effectiveSender);
  const isSameAsSender = (name?: string | null) => !!name && !!senderNorm && normPlaceName(name) === senderNorm;
  const jePlatnyKandidat = (c: string | null | undefined): c is string => {
    if (!c || !c.trim()) return false;
    if (wantsOwnOrder) return true;
    return !isSameAsSender(c);
  };
  const cleanTextForPlace = stripSenderName(rawTextFromAi || rawMessage, effectiveSender);

  let firstItemPlaceName: string | null = null;
  for (const item of geminiItems) {
    if (item.place_name && jePlatnyKandidat(item.place_name) && !firstItemPlaceName) {
      firstItemPlaceName = item.place_name;
    }
  }
  const topLevelPlaceName = jePlatnyKandidat(rawPlaceName) ? rawPlaceName : null;

  const matchCandidates = [firstItemPlaceName, topLevelPlaceName, cleanTextForPlace].filter(jePlatnyKandidat);
  const freeformCandidates = [firstItemPlaceName, topLevelPlaceName].filter(jePlatnyKandidat);
  const ownOrderCandidate = wantsOwnOrder ? effectiveSender : null;
  // ↩️ UKOTVENÍ jména smí vycházet i z CITOVANÉ zprávy — u odpovědi je
  // odběratel napsaný v té zprávě, na kterou se odpovídá, ne v odpovědi samé.
  // Totéž dělá server (whatsapp-auto-parse), ať se obě cesty chovají stejně.
  const ukotveniText = stripSenderName(
    [rawTextFromAi || rawMessage, quotedText].filter(Boolean).join('\n'),
    effectiveSender,
  );
  const resolved = resolvePlace(matchCandidates, freeformCandidates, ukotveniText, places, placeAliasList, ownOrderCandidate);

  let placeId = resolved.id;
  let placeName = resolved.name;
  // ↩️ Zpráva sama žádného odběratele nejmenuje, ale je to ODPOVĚĎ na zprávu,
  // která ho měla (quotedPlaceId/quotedPlaceName výš) — zdědit ho. Stejná
  // logika jako v supabase/functions/whatsapp-auto-parse/index.ts; vlastní
  // odběratel v téhle zprávě má vždy přednost, zdědění platí jen jako záloha.
  if (!placeId && !placeName && !wantsOwnOrder && (quotedPlaceId || quotedPlaceName)) {
    placeId = quotedPlaceId;
    placeName = quotedPlaceName;
  }

  // 🧠 Ani text, ani citace odběratele neurčily — poslední nápověda je HISTORIE.
  // `odberatelZHistorie` ověří, že jméno v historii odesílatele OPRAVDU je; co je
  // mimo ní, se zahodí. Stejně jako na serveru (whatsapp-auto-parse).
  if (!placeId && !placeName && !wantsOwnOrder && historieOdberatelu.length > 0) {
    const zHistorie = odberatelZHistorie(
      [firstItemPlaceName, topLevelPlaceName],
      historieOdberatelu,
      places,
      placeAliasList,
    );
    if (zHistorie.id || zHistorie.name) {
      placeId = zHistorie.id;
      placeName = zHistorie.name;
    }
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

  // ❓ Otázky od AI — když si nebyla jistá, řekne to místo hádání.
  // Filtruje se tvrdě: jen neprázdné věty, nejvýš tři (dlouhý seznam by
  // obsluha přeskočila stejně jako žádný).
  const otazky: string[] = Array.isArray(data?.otazky)
    ? data.otazky.filter((o: unknown): o is string => typeof o === 'string' && o.trim().length > 0)
        .map((o: string) => o.trim())
        .slice(0, 3)
    : [];

  return { placeId, placeName, deliveryDay: day, deliveryDate: dateStr, note, items, raw_text: rawTextFromAi, otazky };
}
