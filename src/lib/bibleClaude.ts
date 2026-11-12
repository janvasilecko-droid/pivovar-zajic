/**
 * 🤝 AI sládek na předplatné majitele: otázka se předá do aplikace Claude,
 * kde odpovídá Claude z jeho předplatného přes konektor „Pivovarská bible"
 * (rozhodnutí R16 a R31) — se stejnými nástroji jako chatbot v appce (knihy
 * se stránkami, várky, profil pivovaru, zkušenosti sládků, výpočty, problémy).
 *
 * Proč ne přímo v appce: pravidla Anthropicu dovolují přihlášení předplatného
 * (Free, Pro, Max) jen v aplikacích Claude a v Claude Code; směrovat přes něj
 * dotazy z jiné aplikace zakazují (a od 2026 to Anthropic i technicky blokuje):
 * https://code.claude.com/docs/en/legal-and-compliance
 *
 * Odkaz https://claude.ai/new?q=… otevře nový chat s předvyplněnou otázkou
 * (odeslat ji musí člověk; text nejvýš ≈ 14 000 znaků). V mobilní aplikaci
 * Claude takový odkaz nefunguje — proto se zadání zároveň zkopíruje do schránky
 * a v aplikaci ho stačí vložit.
 */

/** Jméno konektoru, jak ho majitel přidal v aplikaci Claude (Správa znalostí → Aplikace Claude). */
export const KONEKTOR = 'Pivovarská bible';

/** Bezpečně pod limitem ≈ 14 000 znaků předvyplněného textu v claude.ai. */
const MAX_ZADANI = 12_000;

/** Zadání pro Clauda: pokyn použít konektor a otázka (u analýzy problému i jeho název). */
export function zadaniProClaude(otazka: string, problem?: { nazev: string } | null): string {
  const q = otazka.trim();
  const uvod = problem
    ? `Použij konektor „${KONEKTOR}“ a analyzuj problém „${problem.nazev}“ z Analýzy problémů: načti příznaky a dotčené várky, `
      + 'porovnej je s mými knihami, profilem pivovaru a zkušenostmi sládků a podstatná zjištění zapiš k problému s typem '
      + '(fakt se zdrojem, výpočet, hypotéza…).'
    : `Použij konektor „${KONEKTOR}“ — hledej v mých knihách (s odkazem na knihu a stranu), ve várkách, v profilu pivovaru `
      + 'a ve zkušenostech sládků, čísla počítej jeho výpočty.';
  const text = `${uvod} Odpověz česky jako zkušený sládek: krátká odpověď, co říká literatura, praxe, výpočet, doporučení `
    + `a co chybí; nic si nedomýšlej.\n\nOtázka: ${q}`;
  return text.length > MAX_ZADANI ? `${text.slice(0, MAX_ZADANI - 1)}…` : text;
}

/** Nový chat v Claude s předvyplněným zadáním. */
export function odkazNaClaude(zadani: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(zadani)}`;
}
