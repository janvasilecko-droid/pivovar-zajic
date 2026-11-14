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
 *
 * Odpověď zpátky do appky (R33): otázka se při předání uloží do konverzace
 * AI sládka s předem daným id (dotaz_id v zadání) a Claude hotovou odpověď
 * uloží nástrojem konektoru uloz_odpoved — appka ji pak sama načte.
 */

/** Jméno konektoru, jak ho majitel přidal v aplikaci Claude (Správa znalostí → Aplikace Claude). */
export const KONEKTOR = 'Pivovarská bible';

/** Bezpečně pod limitem ≈ 14 000 znaků předvyplněného textu v claude.ai. */
const MAX_ZADANI = 12_000;

/**
 * Zadání pro Clauda: pokyn použít konektor a otázka (u analýzy problému i jeho
 * název). S `dotaz` (R33) i pokyn uložit odpověď zpátky do appky — dotaz_id je
 * před otázkou, ať ho zkrácení dlouhé otázky nikdy neusekne.
 */
export function zadaniProClaude(otazka: string, problem?: { nazev: string } | null, dotaz?: { id: string; navazuje: boolean } | null): string {
  const q = otazka.trim();
  const uvod = problem
    ? `Použij konektor „${KONEKTOR}“ a analyzuj problém „${problem.nazev}“ z Analýzy problémů: načti příznaky a dotčené várky, `
      + 'porovnej je s mými knihami, profilem pivovaru a zkušenostmi sládků a podstatná zjištění zapiš k problému s typem '
      + '(fakt se zdrojem, výpočet, hypotéza…).'
    : `Použij konektor „${KONEKTOR}“ — hledej v mých knihách (s odkazem na knihu a stranu), ve várkách, v profilu pivovaru `
      + 'a ve zkušenostech sládků, čísla počítej jeho výpočty.';
  const ulozit = dotaz
    ? `\n\nOtázka je z appky Pivovar Zajíc (dotaz_id: ${dotaz.id}). Hotovou odpověď celou ulož do appky nástrojem uloz_odpoved `
      + 's tímto dotaz_id — odkazy na stránky knih v textu nech, appka z nich udělá citace.'
      + (dotaz.navazuje ? ' Otázka navazuje na předchozí konverzaci v appce: nejdřív si ji načti nástrojem dotaz_z_appky.' : '')
    : '';
  const text = `${uvod} Odpověz česky jako zkušený sládek: krátká odpověď, co říká literatura, praxe, výpočet, doporučení `
    + `a co chybí; nic si nedomýšlej.${ulozit}\n\nOtázka: ${q}`;
  return text.length > MAX_ZADANI ? `${text.slice(0, MAX_ZADANI - 1)}…` : text;
}

/** Nové id dotazu pro aplikaci Claude (UUID v4; appka ho dává předem, R33). */
export function noveIdDotazu(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Nový chat v Claude s předvyplněným zadáním. */
export function odkazNaClaude(zadani: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(zadani)}`;
}
