/**
 * Hlášení chyb aplikace do tabulky `app_errors`.
 *
 * Dosud chyba skončila u uživatele: ErrorBoundary ji vykreslil, případně
 * zůstala bílá obrazovka — a nikam se nezapsala. O rozbité obrazovce se tak
 * dalo dozvědět jedině telefonátem. Při deseti nasazeních za den je to
 * nejpomalejší možná cesta.
 *
 * TŘI PRAVIDLA, KTERÁ TU PLATÍ BEZ VÝJIMKY:
 *
 * 1. Hlášení chyby nesmí nikdy shodit aplikaci. Všechno je v try/catch a
 *    každá cesta končí tichem, ne výjimkou. Chyba v hlášení chyb je ta
 *    nejhorší možná — schová původní problém a přidá nový.
 * 2. Nesmí to zaplavit databázi. Jedna smyčka v renderu umí vyrobit tisíce
 *    stejných výjimek za minutu, takže se stejná chyba pošle jednou za
 *    okno (viz OKNO_MS) a zbytek se jen počítá.
 * 3. Když tabulka ještě neexistuje (migrace se pouští ručně), NESMÍ se to
 *    nikde projevit. Appka běží dál a hlášení se prostě zahodí.
 *
 * Do hlášení nejde nic z obsahu obrazovky — jen zpráva, začátek stacku,
 * jméno obrazovky, verze a user agent.
 */

import { APP_VERSION } from './version';

/**
 * Odkud chyba přišla.
 *
 * `odchycena` je pro chyby z `catch` bloků. Do 5. 9. 2026 takové chyby
 * končily jen v `console.error` (bylo jich 60) — uživatel viděl prázdno
 * nebo nic a v tabulce `chyby_aplikace` po nich nezůstala stopa, protože
 * globální posluchači chytají jen to, co spadne až nahoru. Přitom právě
 * tyhle jsou nejčastější: selhaný dotaz do databáze, nepovedený zápis,
 * fotka, kterou se nepodařilo nahrát.
 */
export type DruhChyby = 'boundary' | 'unhandled' | 'rejection' | 'odchycena';

export type HlaseniChyby = {
  druh: DruhChyby;
  zprava: string;
  stack?: string | null;
  obrazovka?: string | null;
  app_version: string;
  user_agent?: string | null;
};

/** Delší stack nemá cenu — podstatné je vždy na začátku. */
export const MAX_STACK = 4000;
/** Delší zprávu nikdo nečte a v tabulce jen zabírá. */
export const MAX_ZPRAVA = 500;
/** Jak dlouho se tatáž chyba považuje za „už nahlášenou" (30 minut). */
export const OKNO_MS = 30 * 60 * 1000;

function zkrat(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/**
 * Vytáhne z čehokoliv, co přijde jako chyba, čitelnou zprávu.
 * Chyby v JS umí být cokoliv — Error, string, objekt, i `undefined`.
 */
export function popisChyby(chyba: unknown): string {
  if (chyba instanceof Error) return chyba.message || chyba.name || 'Error';
  if (typeof chyba === 'string') return chyba;
  if (chyba && typeof chyba === 'object') {
    const zprava = (chyba as any).message;
    if (typeof zprava === 'string' && zprava) return zprava;
    try { return JSON.stringify(chyba); } catch { return 'Neznámá chyba (objekt)'; }
  }
  return chyba === undefined ? 'Neznámá chyba' : String(chyba);
}

/** Připraví řádek k zápisu — zkrácený, bez prázdných hodnot. */
export function pripravHlaseni(
  druh: DruhChyby,
  chyba: unknown,
  obrazovka?: string | null,
  userAgent?: string | null,
): HlaseniChyby {
  const stack = chyba instanceof Error && chyba.stack ? zkrat(chyba.stack, MAX_STACK) : null;
  return {
    druh,
    zprava: zkrat(popisChyby(chyba), MAX_ZPRAVA) || 'Neznámá chyba',
    stack,
    obrazovka: obrazovka || null,
    app_version: APP_VERSION,
    user_agent: userAgent ? zkrat(userAgent, MAX_ZPRAVA) : null,
  };
}

/**
 * Klíč pro rozpoznání „to samé znovu". Schválně bez čísel řádků z minifikace
 * a bez celého stacku: tatáž chyba má po každém nasazení jiný hash souboru,
 * takže by se s celým stackem počítala jako nová.
 */
export function klicChyby(h: Pick<HlaseniChyby, 'druh' | 'zprava' | 'obrazovka'>): string {
  return `${h.druh}|${h.obrazovka ?? '-'}|${h.zprava}`;
}

/**
 * Rozhodne, jestli se má hlášení poslat. Čistá funkce: dostane, kdy byla
 * tatáž chyba naposled poslána, a teď.
 */
export function maSePoslat(poslednePoslano: number | undefined, ted: number, okno = OKNO_MS): boolean {
  if (poslednePoslano === undefined) return true;
  return ted - poslednePoslano >= okno;
}

/**
 * Chybí tabulka `app_errors`? PostgREST na to má dva různé kódy podle verze
 * a Supabase mezi nimi v minulosti přeskočil, proto se hledají oba i podle
 * textu. Tohle je jediná chyba, kterou modul považuje za normální stav.
 */
export function chybiTabulka(chyba: { code?: string; message?: string } | null | undefined): boolean {
  if (!chyba) return false;
  if (chyba.code === '42P01' || chyba.code === 'PGRST205' || chyba.code === 'PGRST204') return true;
  const zprava = (chyba.message ?? '').toLowerCase();
  return zprava.includes('does not exist') || zprava.includes('could not find the table');
}

/** Kdy byla která chyba naposled poslána — jen v paměti záložky. */
const poslano = new Map<string, number>();
/** Když tabulka chybí, přestane se to zkoušet do konce běhu aplikace. */
let tabulkaChybi = false;

/** Jméno obrazovky, na které uživatel je. Nastavuje ho Layout při přepnutí. */
let aktualniObrazovka: string | null = null;
export function nastavObrazovkuProChyby(obrazovka: string | null): void {
  aktualniObrazovka = obrazovka;
}

/** Kvůli testu: vymaže paměť odeslaných hlášení. */
export function resetPametiChyb(): void {
  poslano.clear();
  tabulkaChybi = false;
  aktualniObrazovka = null;
}

/**
 * Nahlásí chybu. Nikdy nevyhodí výjimku a nikdy nečeká — volající se
 * návratovou hodnotou nemusí zabývat.
 */
export function nahlasChybu(druh: DruhChyby, chyba: unknown): void {
  void nahlasChybuAsync(druh, chyba);
}

/** Verze s promise — pro testy a pro místa, kde se na dokončení dá počkat. */
export async function nahlasChybuAsync(druh: DruhChyby, chyba: unknown): Promise<void> {
  try {
    if (tabulkaChybi) return;
    const hlaseni = pripravHlaseni(
      druh,
      chyba,
      aktualniObrazovka,
      typeof navigator === 'undefined' ? null : navigator.userAgent,
    );
    const klic = klicChyby(hlaseni);
    const ted = Date.now();
    if (!maSePoslat(poslano.get(klic), ted)) return;
    poslano.set(klic, ted);

    // Supabase se natahuje až tady: modul se importuje z main.tsx ještě
    // před přihlášením a nemá cenu kvůli hlášení chyb tahat klienta dřív,
    // než je opravdu potřeba.
    const { supabase } = await import('./supabase');
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } } as any));
    const { error } = await supabase.from('app_errors').insert({
      ...hlaseni,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
    });
    if (chybiTabulka(error)) {
      // Migrace ještě neproběhla. Tohle NENÍ chyba k řešení za běhu —
      // appka jede dál a hlášení se zahodí.
      tabulkaChybi = true;
    }
  } catch {
    // Ticho je tady záměr: hlášení chyby nesmí vyrobit další chybu.
  }
}

/**
 * Zapne odchytávání neodchycených chyb a promisů. Volá se jednou z main.tsx.
 * Vrací funkci pro odhlášení (kvůli testům a hot reloadu).
 */
export function zapniHlaseniChyb(): () => void {
  const naChybu = (e: ErrorEvent) => nahlasChybu('unhandled', e.error ?? e.message);
  const naRejection = (e: PromiseRejectionEvent) => nahlasChybu('rejection', e.reason);
  window.addEventListener('error', naChybu);
  window.addEventListener('unhandledrejection', naRejection);
  return () => {
    window.removeEventListener('error', naChybu);
    window.removeEventListener('unhandledrejection', naRejection);
  };
}

/**
 * Zaloguj do konzole A NAHLAS. Náhrada za `console.error(...)` v `catch`
 * blocích — jeden zápis místo dvou, ať se na to hlášení nezapomene.
 *
 *   } catch (e) {
 *     zalogujANahlas('uložení stáčení', e);
 *   }
 *
 * `kde` je krátký popis místa, ne obsah dat — do hlášení jde jen text
 * chyby, začátek stacku a jméno obrazovky, nic z toho, co člověk zapsal.
 */
export function zalogujANahlas(kde: string, chyba: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[${kde}]`, chyba);
  nahlasChybu('odchycena', chyba instanceof Error ? chyba : new Error(`${kde}: ${popisChyby(chyba)}`));
}
