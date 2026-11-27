// 🔑 Přihlášení, které vydrží bez signálu.
// ---------------------------------------------------------------------------
// Přihlašovací token platí hodinu a obnovuje se ze serveru. Knihovna Supabase se při každém dotazu nejdřív
// zeptá „kdo je přihlášený" (`auth.getSession()`), a když je token prošlý, zkouší ho obnovit:
//  • bez spojení to zkouší znovu a znovu ~25 vteřin (pak minutu ne a zase) — VŠECHNY dotazy appky tu dobu
//    stojí a obrazovky jen točí kolečkem, i když by data z paměti telefonu byla hned;
//  • když se obnova nepovede, vrátí „nikdo není přihlášený" — appka ukáže přihlašovací obrazovku, na které se
//    bez signálu přihlásit nedá. Přihlášení přitom v telefonu pořád je (knihovna ho při výpadku nemaže).
// Stačí tedy být hodinu ve sklepě a appka je bez signálu k ničemu (majitel 27. 11. 2026: „furt to nefunguje
// offline").
//
// Oprava: `getSession()` dostane obal. Je-li uložený token prošlý a
//  • telefon ví, že je offline, nebo server před chvílí neodpověděl (lib/jisticSpojeni.ts) → hned vrátí
//    uložené přihlášení (na obnovu se nečeká);
//  • jinak → obnově dá krátký čas; když ho nestihne, vrátí uložené přihlášení a obnova dobíhá na pozadí.
// Uložené přihlášení se vrací, jen dokud ho knihovna sama nezruší (odhlášení, neplatný obnovovací token) —
// pak je pravda „nikdo není přihlášený" a appka ukáže přihlášení.
//
// Stejně `getUser()` („kdo je přihlášený", ptá se serveru): zápisy si jím berou jméno do záznamu o změně.
// Bez spojení dřív čekal na obnovu tokenu (~25 s) nebo na server bez limitu a vrátil „nikdo". Teď bez spojení
// odpoví z přihlášení uloženého v telefonu — je to tentýž účet, jen neověřený serverem v tuhle vteřinu.
//
// Co to NEDĚLÁ: nikomu nedává přístup navíc. S prošlým tokenem server nic nevydá; bez signálu jsou vidět jen
// data, která si tenhle telefon dřív stáhl pod tímhle účtem.
import type { Session, User } from '@supabase/supabase-js';

/** Jak dlouho smí dotaz čekat na obnovu prošlého tokenu, než dostane uložené přihlášení. */
export const CEKANI_NA_OBNOVU_MS = 3000;
/** Token se bere jako prošlý už chvíli před koncem (stejná rezerva jako v knihovně). */
export const REZERVA_PLATNOSTI_MS = 90_000;

type VysledekRelace = { data: { session: Session | null }; error: unknown };
type VysledekUzivatele = { data: { user: User | null }; error: unknown };
type Auth = {
  getSession: () => Promise<VysledekRelace>;
  getUser?: (jwt?: string) => Promise<VysledekUzivatele>;
  storageKey?: unknown;
};
export type MoznostiRelace = {
  /** Jak dlouho smí dotaz čekat na obnovu prošlého tokenu. */
  cekaniMs?: number;
  /** Ví appka o výpadku, o kterém telefon sám neví (server neodpovídá)? Pak se na server nečeká vůbec. */
  vypadek?: () => boolean;
};

function jeRelace(s: unknown): s is Session {
  const r = s as { access_token?: unknown; refresh_token?: unknown; user?: { id?: unknown } } | null;
  return !!r && typeof r === 'object' && typeof r.access_token === 'string' && typeof r.refresh_token === 'string'
    && !!r.user && typeof r.user.id === 'string';
}

/**
 * Přihlášení uložené v telefonu (i s prošlým tokenem), nebo null. Čte se pod stejným klíčem, pod kterým ho
 * ukládá knihovna (`auth.storageKey`; u hlavní aplikace je to doslova „undefined" — klíč se jí nepředává).
 */
export function ulozenaRelace(auth: { storageKey?: unknown }): Session | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const text = localStorage.getItem(String(auth.storageKey));
    if (!text) return null;
    const s: unknown = JSON.parse(text);
    return jeRelace(s) ? s : null;
  } catch {
    return null;
  }
}

/** Id účtu přihlášeného v tomhle telefonu (i s prošlým tokenem), nebo null — komu patří kopie dat. */
export function idPrihlaseneho(auth: { storageKey?: unknown }): string | null {
  return ulozenaRelace(auth)?.user.id ?? null;
}

/** Je token prošlý (nebo těsně před koncem)? Bez údaje o platnosti se bere jako platný — rozhodne knihovna. */
export function jeVyprsela(s: Pick<Session, 'expires_at'>, ted: number = Date.now()): boolean {
  return typeof s.expires_at === 'number' && s.expires_at * 1000 - ted < REZERVA_PLATNOSTI_MS;
}

/** Je token v hlavičce `Authorization: Bearer …` prošlý? (Podle jeho vlastního údaje `exp`.) */
export function tokenVHlavicceVyprsel(autorizace: string | null | undefined, ted: number = Date.now()): boolean {
  try {
    const token = (autorizace ?? '').replace(/^Bearer\s+/i, '');
    const stred = token.split('.')[1];
    if (!stred) return false;
    const b64 = stred.replace(/-/g, '+').replace(/_/g, '/');
    const data = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { exp?: unknown };
    return typeof data.exp === 'number' && data.exp * 1000 <= ted;
  } catch {
    return false;
  }
}

const jeOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Server neodpověděl (chyba spojení) — ne že by dotaz odmítl. */
function jeChybaSpojeni(chyba: unknown): boolean {
  return !!chyba && typeof chyba === 'object' && (chyba as { name?: unknown }).name === 'AuthRetryableFetchError';
}

/**
 * Obalí `auth.getSession()` a `auth.getUser()` tak, aby prošlý token ani chybějící spojení nezdržely
 * a neodhlásily (viz hlavička souboru). Volá se jednou hned po vytvoření klienta.
 */
export function nainstalujRelaciBezSignalu(auth: Auth, moznosti: MoznostiRelace = {}): void {
  const cekaniMs = moznosti.cekaniMs ?? CEKANI_NA_OBNOVU_MS;
  const bezSpojeni = () => jeOffline() || !!moznosti.vypadek?.();

  // Klient bez přihlašování (atrapy v testech) nemá co obalovat.
  if (typeof auth.getSession !== 'function') return;
  const puvodni = auth.getSession.bind(auth);
  auth.getSession = async (): Promise<VysledekRelace> => {
    const ulozena = ulozenaRelace(auth);
    // Nikdo není přihlášený, nebo token platí → běžná cesta (bez sítě, hned).
    if (!ulozena || !jeVyprsela(ulozena)) return puvodni();
    if (bezSpojeni()) return { data: { session: ulozena }, error: null };
    // Obnovu spouští knihovna; víckrát naráz ji nepustí. Tady se na ni jen omezeně čeká.
    const obnova = puvodni();
    obnova.catch(() => undefined);
    const vcas = await Promise.race([
      obnova.catch((): null => null),
      new Promise<null>((hotovo) => setTimeout(() => hotovo(null), cekaniMs)),
    ]);
    if (vcas && vcas.data.session) return vcas;
    // Nestihla se, nebo selhala kvůli spojení. Uložené přihlášení platí dál — pokud ho knihovna mezitím
    // sama nezrušila (pak je správně „nepřihlášen").
    const porad = ulozenaRelace(auth);
    if (porad) return { data: { session: porad }, error: null };
    return vcas ?? obnova;
  };

  const puvodniUzivatel = auth.getUser?.bind(auth);
  if (!puvodniUzivatel) return;
  auth.getUser = async (jwt?: string): Promise<VysledekUzivatele> => {
    // Ověření cizího tokenu se nás netýká.
    if (jwt) return puvodniUzivatel(jwt);
    const ulozena = ulozenaRelace(auth);
    if (ulozena && bezSpojeni()) return { data: { user: ulozena.user }, error: null };
    const vysledek = await puvodniUzivatel();
    // Server neodpověděl (ne že by odmítl) a přihlášení v telefonu pořád je → víme, kdo to je.
    if (!vysledek.data?.user && jeChybaSpojeni(vysledek.error)) {
      const porad = ulozenaRelace(auth);
      if (porad) return { data: { user: porad.user }, error: null };
    }
    return vysledek;
  };
}
