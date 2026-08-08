// 🗓️ Rozpoznání konkrétního data v textu objednávky (např. "25.8.", "25. 8. 2026",
// "25/8", "25. srpna"). Datum se zapíše do poznámky a objednávka se automaticky
// přesune do týdne, ve kterém dané datum je (delivery_date → isoWeekKey).

export interface ExplicitDate {
  dateStr: string;   // YYYY-MM-DD
  display: string;   // např. "25.8."
  matched: string;   // přesně nalezený text v původní zprávě
  year: number;
  month: number;
  day: number;
}

const CZ_MONTHS: [string, number][] = [
  ['ledna', 1], ['února', 2], ['unora', 2], ['března', 3], ['brezna', 3],
  ['dubna', 4], ['května', 5], ['kvetna', 5], ['června', 6], ['cervna', 6],
  ['července', 7], ['cervence', 7], ['srpna', 8], ['září', 9], ['zari', 9],
  ['října', 10], ['rijna', 10], ['listopadu', 11], ['prosince', 12],
];

function buildDate(day: number, month: number, year?: number, matched?: string): ExplicitDate | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  let y = year ?? new Date().getFullYear();

  // Bez roku: pokud by datum bylo už v minulosti (před dneškem), předpokládáme
  // příští rok (typické u objednávek dopředu, např. "dodat 25.8." poslané v září).
  if (!year) {
    const now = new Date();
    const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    if (Date.UTC(y, month - 1, day) < todayStart) y = y + 1;
  }

  // Ověření reálnosti data (např. 31.2. neexistuje)
  const d = new Date(Date.UTC(y, month - 1, day));
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;

  return {
    dateStr: `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    display: `${day}.${month}.`,
    matched: matched ?? `${day}.${month}.`,
    year: y,
    month,
    day,
  };
}

/**
 * Najde v textu konkrétní datum (např. "25.8."). Vrací ISO datum pro delivery_date,
 * zobrazení pro poznámku a přesný nalezený text. Pokud datum není, vrací null.
 */
export function parseExplicitDate(text: string): ExplicitDate | null {
  if (!text) return null;

  // 1) "25.8.2026" / "25. 8. 2026" — s rokem
  let m = text.match(/(?<![\d.])(\d{1,2})\s*[.]\s*(\d{1,2})\s*[.]\s*(\d{4})(?![\d.])/);
  if (m) {
    const r = buildDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m[0].trim());
    if (r) return r;
  }

  // 2) "25.8." (s tečkou na konci) — nejspolehlivější forma data v objednávce
  m = text.match(/(?<![\d.])(\d{1,2})\s*[.]\s*(\d{1,2})\s*[.](?![\d.])/);
  if (m) {
    const r = buildDate(parseInt(m[1], 10), parseInt(m[2], 10), undefined, m[0].trim());
    if (r) return r;
  }

  // 3) "25.8" / "25. 8" — bez tečky; nesmí to být objem (1.5l, 0.5...) ani cena
  m = text.match(/(?<![\d.])(\d{1,2})\s*[.]\s*(\d{1,2})(?![\d.])(?![lL])/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const mIndex = m.index ?? 0;
    const mText = m[0] ?? '';
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const after = text.slice(mIndex + mText.length, mIndex + mText.length + 10);
      const before = text.slice(Math.max(0, mIndex - 10), mIndex);
      const looksLikeVolumeOrQty =
        /\bl\b|\bl\.|litr|litru|litry|keg|sud|x\s*\d|\bks\b/i.test(after) ||
        /\d+\s*x/i.test(before) || /cena|k[čc]\b/i.test(before);
      if (!looksLikeVolumeOrQty) {
        const r = buildDate(day, month, undefined, mText.trim());
        if (r) return r;
      }
    }
  }

  // 4) "25. srpna" / "25.srpna"
  m = text.match(/(?<![\d.])(\d{1,2})\s*[.]\s*(ledna|února|unora|března|brezna|dubna|května|kvetna|června|cervna|července|cervence|srpna|září|zari|října|rijna|listopadu|prosince)\b/i);
  if (m) {
    const mm = m;
    const day = parseInt(mm[1], 10);
    const month = CZ_MONTHS.find(([name]) => name === (mm[2] || '').toLowerCase())?.[1];
    if (month) {
      const r = buildDate(day, month, undefined, m[0].trim());
      if (r) return r;
    }
  }

  // 5) "25/8" — s lomítkem
  m = text.match(/(?<![\d./])(\d{1,2})[/](\d{1,2})(?![\d.])/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const r = buildDate(day, month, undefined, m[0].trim());
      if (r) return r;
    }
  }

  return null;
}
