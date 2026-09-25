export const BUSINESS_TIME_ZONE = 'Europe/Prague';

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

function businessParts(value: Date): DateParts {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
  };
}

/** Czech brewery business date, independent of the device's configured zone. */
export function businessDateISO(value: Date = new Date()): string {
  const { year, month, day } = businessParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Current hour in the brewery time zone (Europe/Prague). */
export function businessHour(value: Date = new Date()): number {
  return businessParts(value).hour;
}

/**
 * Vrátí Date, jehož LOKÁLNÍ gettery (getFullYear/getMonth/getDate/getDay)
 * odpovídají kalendářnímu dni v Praze — bez ohledu na to, v jaké časové
 * zóně běží runtime. V prohlížeči v ČR je to shodou okolností stejné jako
 * `new Date()`, ale v Deno edge funkci (vždy UTC) by bez tohohle
 * `getDay()`/`getDate()` kolem půlnoci pražského času ukazovaly ještě
 * včerejšek — přesně tenhle rozdíl mezi lokálními gettery a
 * `toISOString()` (vždy UTC) způsobil, že appka WhatsApp objednávkám
 * "dnes"/"zítra"/"v úterý" psaným těsně po půlnoci ukládala datum dodání
 * o den dřív (nalezeno 13. 9. 2026).
 *
 * POZOR: vrácený objekt NENÍ platný okamžik v čase (jen nosič lokálních
 * kalendářních polí) — nikdy ho nepoužívat s `toISOString()`/`getTime()`
 * jako skutečný čas, jen číst lokální gettery.
 */
export function businessNow(value: Date = new Date()): Date {
  const { year, month, day } = businessParts(value);
  return new Date(year, month - 1, day);
}

/**
 * Posun měsíce o `delta` měsíců. Vstup i výstup je `YYYY-MM`.
 *
 * Bylo to napsané ČTYŘIKRÁT — v Objednávkách, Inventuře, Stáčení KEG
 * a Lahvích — pokaždé o kousek jinak (dvakrát přes `Date.UTC` a
 * `toISOString`, jednou přes `getUTC*`, jednou přes místní čas). Všechny
 * čtyři varianty vracely totéž, ale u data se na „vrací totéž" nedá
 * spoléhat: v aplikaci, kde se datum bere přes `businessDateISO()` právě
 * proto, aby nezáleželo na nastavení telefonu, patří i tohle na jedno místo.
 *
 * Počítá se přes UTC schválně: prvního v měsíci o půlnoci UTC nespadne
 * přes hranici měsíce v žádné časové zóně, takže „leden −1" je vždycky
 * prosinec předchozího roku.
 */
export function posunMesic(mesic: string, delta: number): string {
  const [rok, m] = mesic.split('-').map(Number);
  const d = new Date(Date.UTC(rok, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Posun kalendářního data o `delta` dní. Vstup i výstup je `YYYY-MM-DD`.
 * Přes UTC schválně, stejně jako `posunMesic` — datum je jen kalendářní
 * hodnota, ne okamžik v čase, a počítat ho v místní zóně by kolem přechodu
 * na letní/zimní čas mohlo dát den navíc nebo míň.
 */
export function posunDen(datumISO: string, delta: number): string {
  const [rok, mesic, den] = datumISO.split('-').map(Number);
  const d = new Date(Date.UTC(rok, mesic - 1, den + delta));
  return d.toISOString().slice(0, 10);
}
