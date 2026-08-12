/**
 * Zaškrtávací políčko „Druhé auto (Kačena)“ v Závozu.
 *
 * Označení je vázané na konkrétní závoz (= den rozvozu v Závozu), ne na jedno
 * datum: do localStorage ukládáme všechna konkrétní data (YYYY-MM-DD), na která
 * se objednávky označeného závozu vážou (delivery_date ?? order_date). Auto-generátor
 * Knihy jízd (KnihaJizdScreen) pak každý den, jehož datum je v tomto seznamu,
 * zapíše na druhé vozidlo.
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

/**
 * Přepne označení celého závozu pro druhé auto.
 * Jedno zaškrtnutí v Závozu označí VŠECHNA data, na která se objednávky daného
 * závozu vážou (skupina může mít objednávky s více daty). Když už je některé
 * z nich označené, závoz se odškrtne a tato data se odeberou.
 */
export function toggleSecondCarDates(dates: string[]): string[] {
  const validDates = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (validDates.length === 0) return getSecondCarDates();

  const current = new Set(getSecondCarDates());
  const hasAny = validDates.some((d) => current.has(d));

  if (hasAny) {
    validDates.forEach((d) => current.delete(d));
  } else {
    validDates.forEach((d) => current.add(d));
  }

  const next = [...current].sort();
  saveSecondCarDates(next);
  return next;
}
