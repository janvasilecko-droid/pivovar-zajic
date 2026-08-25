// Pomocné funkce pro upozornění na „měsíční úklid" v posledním týdnu měsíce.
// Poslední týden měsíce = posledních 7 kalendářních dnů (např. 25.–31., 24.–30.,
// 23.–29., 22.–28.).
import { businessDateISO } from './businessDate';

// Bez výslovně předaného data se používá pražský "obchodní den" (ne syrové
// new Date(), které je v UTC) — kolem půlnoci (léto i zima) by jinak UTC den
// mohl být ještě včerejší, a poslední týden/měsíc by se vyhodnotil špatně.
export function isLastWeekOfMonth(dateStr?: string): boolean {
  const d = new Date((dateStr ?? businessDateISO()) + 'T00:00:00');
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() >= daysInMonth - 6;
}

// Klíč měsíce ve tvaru RRRR-MM (např. „2026-08") pro trvalé potlačení upozornění.
export function getMonthKey(dateStr?: string): string {
  const d = new Date((dateStr ?? businessDateISO()) + 'T00:00:00');
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
