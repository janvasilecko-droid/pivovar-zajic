// 🔗 Na jakou stránku appku otevřít při STUDENÉM startu.
//
// Appka drží, na které stránce je, v `history.state` (viz App.tsx setPage)
// — schválně beze změny URL. To ale nefunguje pro nové okno appky otevřené
// zvenku: klik na push upozornění (public/sw.js posílal `./?page=orders`,
// appka to ale nikde nečetla — odkaz byl už rok mrtvý) nebo zkratka na
// ploše telefonu (manifest.webmanifest `shortcuts`, nový v tomhle bodě).
// Nové okno nemá žádné `history.state`, jen tu adresu.
export function zjistiStrankuZUrl(search: string, platneStranky: ReadonlySet<string>): string | null {
  const p = new URLSearchParams(search).get('page');
  return p && platneStranky.has(p) ? p : null;
}

/**
 * Podstránka z adresy (`?page=bible&sub=kniha:<id>:<list>`) — odkazy na stránku
 * knihy z odpovědí Clauda (konektor bible-mcp, 3. 11. 2026). Jen bezpečné znaky.
 */
export function zjistiPodstrankuZUrl(search: string): string | null {
  const s = new URLSearchParams(search).get('sub');
  return s && /^[A-Za-z0-9:_-]{1,80}$/.test(s) ? s : null;
}

/** Obrazovka schválení připojení aplikace Claude (OAuth, konektor bible-mcp). */
export const CESTA_CLAUDE_PRIPOJENI = '/claude-pripojeni';
export const jeClaudePripojeni = (pathname: string): boolean => pathname.replace(/\/+$/, '') === CESTA_CLAUDE_PRIPOJENI;

/**
 * Má se po otevření rovnou ukázat checklist konce stáčení?
 *
 * Připomínka v 16:00 a 18:00 (migrace 20261231140000) posílá
 * `?page=bottling&checklist=konec` — zadání znělo „upozornit na telefon
 * a tabulku k vyplnění checklistu", takže samotné přepnutí obrazovky nestačí.
 * Jiné hodnoty se ignorují, ať adresa z cizího zdroje nic neotevírá.
 */
export function jeChecklistKonceZUrl(search: string): boolean {
  return new URLSearchParams(search).get('checklist') === 'konec';
}
