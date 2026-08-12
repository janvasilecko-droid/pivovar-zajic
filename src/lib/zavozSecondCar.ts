/**
 * Zaškrtávací políčko „Druhé auto (Kačena)“ v Závozu.
 *
 * Ukládáme si seznam dat (YYYY-MM-DD), kdy se závoz jel druhým autem,
 * do localStorage, aby ho mohl použít i auto-generátor Knihy jízd
 * (KnihaJizdScreen) a zapsal takový den na druhé vozidlo.
 */

const STORAGE_KEY = 'zavoz_second_car_dates';

export function getSecondCarDates(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      : [];
  } catch {
    return [];
  }
}

function saveSecondCarDates(dates: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dates));
  } catch {
    // offline / plná kvóta — ignorujeme, aplikace funguje i bez uložení
  }
}

/** Přepne označení dne pro druhé auto a vrátí nový seznam dat. */
export function toggleSecondCarDate(date: string): string[] {
  const current = getSecondCarDates();
  const next = current.includes(date)
    ? current.filter((d) => d !== date)
    : [...current, date];
  saveSecondCarDates(next);
  return next;
}
