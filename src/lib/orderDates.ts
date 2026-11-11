// 🗓️ Rozpoznání konkrétního data v textu objednávky (např. "25.8.", "25. 8. 2026",
// "25/8", "25. srpna", i "13 .11.30l"). Datum se zapíše do poznámky a objednávka
// se automaticky přesune do týdne, ve kterém dané datum je (delivery_date → isoWeekKey).
//
// Pravidlo samo je od 6. 11. 2026 jedno pro appku i server (edge funkce
// whatsapp-auto-parse): supabase/functions/_shared/datum-ze-zpravy.ts. Dřív měla
// každá strana vlastní kopii a „Na 13 .11.30l 12sv" nepřečetla ani jedna.

import { businessDateISO } from './businessDate';
import { datumZeZpravy } from '../../supabase/functions/_shared/datum-ze-zpravy';

export interface ExplicitDate {
  dateStr: string;   // YYYY-MM-DD
  display: string;   // např. "25.8."
  matched: string;   // přesně nalezený text v původní zprávě
  year: number;
  month: number;
  day: number;
}

/**
 * Najde v textu konkrétní datum (např. "25.8."). Vrací ISO datum pro delivery_date,
 * zobrazení pro poznámku a přesný nalezený text. Pokud datum není, vrací null.
 * Rok se doplní podle dneška v Praze (`dnes`, výchozí businessDateISO).
 */
export function parseExplicitDate(text: string, dnes: string = businessDateISO()): ExplicitDate | null {
  const d = datumZeZpravy(text, dnes);
  if (!d) return null;
  const [year, month, day] = d.datum.split('-').map(Number);
  return { dateStr: d.datum, display: d.zobrazeni, matched: d.nalezeno, year, month, day };
}
