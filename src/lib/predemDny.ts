// 📅 Předstih objednávky — o kolik dní dřív přišla, než se vozí.
// ---------------------------------------------------------------------------
// Jedno pravidlo pro dvě místa, aby se nikdy nerozešla:
//  • upozornění „Předem objednané — tento týden se stáčí“ (lib/predemObjednane.ts, pondělní push),
//  • malé sudy (lib/maleSudy.ts): objednávka na pozdější týden se do čísel nepočítá, dokud se nezačne vozit.
// Žádné importy — dá se použít odkudkoliv (maleSudy.ts nesmí táhnout plán stáčení ani komponenty).

/**
 * Od kolika dní předem je objednávka „předem“. Běžná objednávka v pátek na příští středu (5 dní)
 * se nepočítá — ta je v týdenním rytmu a plán stáčení ji ukazuje stejně jako ostatní.
 */
export const PREDSTIH_DNI = 7;

const DEN_MS = 86_400_000;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const utc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

/**
 * Přišla objednávka nejméně `PREDSTIH_DNI` dní před dnem závozu? Obě data jako YYYY-MM-DD (delší
 * text s časem se ořízne na den); bez jednoho z nich nikdy — bez data se nedá říct, jak daleko je.
 */
export function jePredemObjednana(objednano: string | null | undefined, zavoz: string | null | undefined): boolean {
  const zadano = (objednano ?? '').slice(0, 10);
  const datum = (zavoz ?? '').slice(0, 10);
  if (!DATUM.test(zadano) || !DATUM.test(datum)) return false;
  return (utc(datum) - utc(zadano)) / DEN_MS >= PREDSTIH_DNI;
}
