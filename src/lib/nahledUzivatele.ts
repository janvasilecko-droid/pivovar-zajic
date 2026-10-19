// 👀 Náhled „jak aplikaci vidí nový běžný uživatel“ — přímo v hlavní aplikaci.
// ---------------------------------------------------------------------------
// Majitel 19. 10. 2026: chce kontrolovat, jak aplikace vypadá obyčejnému účtu.
// Druhá instalace („Zajíc 2“) se mu na telefonu po instalaci neotevřela, proto
// tohle: správce klepne na tlačítko a aplikace se zobrazí tak, jak ji dostane
// čerstvě založený běžný uživatel — role „user“, výchozí plocha (barvy a
// rozložení správce), jen dlaždice, na které má běžný uživatel právo, a žádné
// správcovské dlaždice. Zůstává přihlášený jako správce (žádné přepínání účtů).
//
// Bezpečnost: změny plochy, poznámek a odpočtů se v náhledu NEUKLÁDAJÍ do
// správcova profilu (viz profileSync → jeNahled), ať si správce omylem
// nepřepíše vlastní plochu. Ostatní zápisy (objednávky, sklad) jsou skutečné —
// pruh nahoře na to upozorňuje. Stav drží jen karta (sessionStorage).
const KLIC = 'zajic_nahled';

export function jeNahled(): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(KLIC) === '1';
  } catch {
    return false;
  }
}

/** Zapne/vypne náhled a načte aplikaci znovu, ať se všude projeví stejně. */
export function nastavNahled(zapnout: boolean): void {
  try {
    if (zapnout) window.sessionStorage.setItem(KLIC, '1');
    else window.sessionStorage.removeItem(KLIC);
  } catch {
    // bez úložiště se náhled prostě nezapne
  }
  if (typeof window !== 'undefined') window.location.reload();
}

/** Profil tak, jak by ho měl nově založený běžný uživatel (id a jméno zůstávají). */
export function profilNovehoUzivatele<T extends { role?: string; permissions?: unknown; home_layout?: unknown }>(profil: T): T {
  return { ...profil, role: 'user', permissions: null, home_layout: {} };
}
