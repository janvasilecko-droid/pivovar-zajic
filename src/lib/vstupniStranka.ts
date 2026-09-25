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
