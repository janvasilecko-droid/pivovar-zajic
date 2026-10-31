// 📚 Klient Pivovarské bible — samostatný projekt Supabase, BEZ offline mezipaměti.
// ---------------------------------------------------------------------------
// Od 31. 10. 2026 (rozhodnutí R12) žijí knihy, jejich zpracování a náklady
// na AI v samostatném projektu Supabase (cegrelgvkygcatupqwrx), appka
// pivovaru v hlavním. Databáze bible je pro prohlížeč zavřená: všechno jde
// přes edge funkci bible-api (migrace přes bible-migrace) s tokenem
// přihlášení z hlavní appky. Funkce ho ověří v hlavním projektu i s právy
// do bible — appka nic jiného nepotřebuje, žádný klíč projektu bible.
//
// Nic z bible nejde do offline mezipaměti telefonu (rozhodnutí R4): obyčejný
// fetch, žádný zápis do IndexedDB. Nahrání souboru (desítky MB) časový limit
// nemá — po pomalé síti trvá déle a nesmí se uprostřed utnout.
import { fetchWithTimeout, supabase, VELKY_DOTAZ_TIMEOUT_MS } from './supabase';

/** Adresa projektu bible (veřejná, jako adresa hlavního projektu). */
export const BIBLE_URL = 'https://cegrelgvkygcatupqwrx.supabase.co';

export type FunkceBible = 'bible-api' | 'bible-migrace';

export type ChybaBible = { kod: string; zprava: string; status: number };

export type VysledekBible<T> = { ok: true; data: T } | { ok: false; chyba: ChybaBible };

export const chybaBible = (kod: string, zprava: string, status = 0): { ok: false; chyba: ChybaBible } => ({
  ok: false,
  chyba: { kod, zprava, status },
});

function jeOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Token přihlášení z hlavní appky (supabase-js ho při vypršení sám obnoví). */
export async function tokenPrihlaseni(): Promise<string | null> {
  try {
    return (await supabase.auth.getSession()).data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Zavolá funkci projektu bible. Odpověď je vždy { ok, data } nebo { ok: false,
 * chyba: { kod, zprava, status } } — zprava je česky a jde rovnou ukázat.
 */
export async function volejBibli<T>(
  funkce: FunkceBible,
  telo: Record<string, unknown>,
  limitMs: number = VELKY_DOTAZ_TIMEOUT_MS,
): Promise<VysledekBible<T>> {
  const token = await tokenPrihlaseni();
  if (!token) return chybaBible('neprihlasen', 'Přihlášení vypršelo. Obnov stránku a přihlas se znovu.', 401);

  let odpoved: Response;
  try {
    odpoved = await fetchWithTimeout(`${BIBLE_URL}/functions/v1/${funkce}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(telo),
    }, limitMs);
  } catch {
    return jeOffline()
      ? chybaBible('sit', 'Spojení se přerušilo. Zkus to znovu, až bude signál.')
      : chybaBible('nedostupna', 'Databáze bible neodpovídá — bot ještě nemusí být nasazený, nebo má Supabase výpadek. Zkus to za chvíli.');
  }

  let json: unknown = null;
  try {
    json = await odpoved.json();
  } catch {
    json = null;
  }
  const j = (json && typeof json === 'object' ? json : {}) as { ok?: unknown; data?: unknown; kod?: unknown; zprava?: unknown };
  if (odpoved.ok && j.ok === true) return { ok: true, data: j.data as T };
  if (typeof j.kod === 'string' && typeof j.zprava === 'string') return chybaBible(j.kod, j.zprava, odpoved.status);
  if (odpoved.status === 404) {
    return chybaBible('nenasazeno', `Bot (funkce ${funkce}) ještě není v projektu bible nasazený.`, 404);
  }
  if (odpoved.status === 503 || odpoved.status === 540 || odpoved.status === 546) {
    return chybaBible('nedostupna', 'Projekt bible je uspaný nebo nedostupný. Zkus to za chvíli.', odpoved.status);
  }
  return chybaBible('chyba', `Databáze bible vrátila chybu (HTTP ${odpoved.status}).`, odpoved.status);
}

/**
 * Adresa souboru v úložišti bible z odkazu, který vydala bible-api — vždy na
 * adrese projektu bible a jen podepsaná cesta do úložiště (nic jiného appka
 * neotevře). null = podivný odkaz.
 */
export function odkazDoUloziste(odkaz: unknown): string | null {
  if (typeof odkaz !== 'string') return null;
  try {
    const u = new URL(odkaz, BIBLE_URL);
    if (!/^\/storage\/v1\/object\/sign\/knihovna\/[^?#]+$/.test(u.pathname) || !u.searchParams.get('token')) return null;
    return `${BIBLE_URL}${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}
