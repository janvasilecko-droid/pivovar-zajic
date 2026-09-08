/**
 * 💾 Úložiště prohlížeče, které nikdy neshodí obrazovku.
 *
 * `localStorage` vypadá jako bezpečná věc, ale umí vyhodit výjimku hned
 * ze tří důvodů: privátní režim (Safari), plné úložiště (kvóta) a zákaz
 * ukládání dat v nastavení prohlížeče. Když se to stane uprostřed
 * vykreslování, spadne CELÁ obrazovka — a to jen proto, že si appka chtěla
 * zapamatovat naposledy vybrané pivo.
 *
 * V kódu bylo 88 zápisů, z toho 34 bez jakékoliv pojistky. Místo aby se
 * try/catch dopisoval na 34 místech (a na 35. se zapomnělo), sahá se na
 * úložiště jen přes tyhle funkce.
 *
 * ČTENÍ vrací `null`, když se nedá číst — volající se tak chová stejně
 * jako u prázdného úložiště, což je stav, se kterým počítat musí tak jako tak.
 */

export function nacti(klic: string): string | null {
  try {
    return localStorage.getItem(klic);
  } catch {
    return null;
  }
}

/** Uloží hodnotu. Vrací `false`, když se nepovedlo — většině volajících to je jedno. */
export function uloz(klic: string, hodnota: string): boolean {
  try {
    localStorage.setItem(klic, hodnota);
    return true;
  } catch {
    return false;
  }
}

export function smaz(klic: string): void {
  try {
    localStorage.removeItem(klic);
  } catch {
    /* nedá se mazat, co se nedá ani zapsat */
  }
}

/** JSON v jednom kroku — bez ručního `JSON.parse` v každém volání. */
export function nactiJson<T>(klic: string, vychozi: T): T {
  const text = nacti(klic);
  if (text === null) return vychozi;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Rozbitý záznam (nedopsaný zápis, ruční zásah) se zahodí — pád kvůli
    // zapamatovanému filtru by byl absurdní.
    return vychozi;
  }
}

export function ulozJson(klic: string, hodnota: unknown): boolean {
  try {
    return uloz(klic, JSON.stringify(hodnota));
  } catch {
    // Kruhová reference v datech — do úložiště se nedostane nic.
    return false;
  }
}
