// Pomocné funkce pro upozornění na „měsíční úklid" v posledním týdnu měsíce.
// Poslední týden měsíce = posledních 7 kalendářních dnů (např. 25.–31., 24.–30.,
// 23.–29., 22.–28.).

export function isLastWeekOfMonth(dateStr?: string): boolean {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() >= daysInMonth - 6;
}

// Klíč měsíce ve tvaru RRRR-MM (např. „2026-08") pro případné trvalé potlačení.
export function getMonthKey(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
