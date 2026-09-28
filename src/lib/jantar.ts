// 🍺 Jantar — pivo, které ve sklepě nemá vlastní tank.
// ---------------------------------------------------------------------------
// Jantar se míchá z 80 % 12° Světlé a 20 % tmavého (zadání sládka). Plán
// stáčení to tak počítal odjakživa (lib/objednavkyZTanku.ts), jenže zápis
// stáčení ne: řádek Jantaru nenašel tank se stejným pivem, uložil se „bez
// tanku" a ve Sklepě ho nešlo přiřadit („Toto pivo teď není v žádném
// tanku"). Z tanků Světlé a tmavého se tak za Jantar nikdy nic neodečetlo.
// Našla to simulace týdne 28. 9. 2026; oprava schválená týž den („vše ano").
//
// Teď se stočený Jantar zapíše takhle:
//   • řádek stáčení patří k tanku 12° Světlé a nese 80 % objemu
//     (tank ho započítá jako stočené — % vystočeno, ztráty),
//   • 20 % se odečte z tanku tmavého jako přetočení „do Jantaru"
//     (cellar_transfers bez cílového tanku; tank ho počítá jako odtok, ne
//     jako ztrátu). Přetočení nese značku `[jantar:<id řádku>]`, podle které
//     ho úprava i smazání řádku stáčení najdou.

export const PODIL_SVETLE = 0.8;

export type PivoJmeno = { id: string; name: string };

const maly = (s: string) => s.toLowerCase();

/** Najde Jantar a piva, ze kterých se míchá. Stejná pravidla jako plán stáčení. */
export function pivaJantaru<T extends PivoJmeno>(piva: T[]): { jantar?: T; svetla?: T; tmava?: T } {
  return {
    jantar: piva.find((b) => maly(b.name).includes('jantar')),
    svetla: piva.find((b) => maly(b.name).includes('12° svět') || maly(b.name).includes('12sv')),
    tmava: piva.find((b) => maly(b.name).includes('tmav')),
  };
}

export function jeJantar(beerId: string | null | undefined, piva: PivoJmeno[]): boolean {
  const { jantar } = pivaJantaru(piva);
  return !!beerId && !!jantar && beerId === jantar.id;
}

/**
 * Z jakého piva se řádek stáčí do tanku. U Jantaru je to 12° Světlá
 * (hlavní složka), u ostatních pivo samo.
 */
export function pivoZdrojovehoTanku(beerId: string, piva: PivoJmeno[]): string {
  const { jantar, svetla } = pivaJantaru(piva);
  return jantar && svetla && beerId === jantar.id ? svetla.id : beerId;
}

/** Rozdělí litry Jantaru na část ze Světlé a z tmavého (na desetiny litru). */
export function rozdelJantar(litry: number): { svetlaL: number; tmavaL: number } {
  const svetlaL = Math.round(litry * PODIL_SVETLE * 10) / 10;
  return { svetlaL, tmavaL: Math.round((litry - svetlaL) * 10) / 10 };
}

/** Značka v poznámce přetočení, která ho váže na řádek stáčení. */
export function znackaJantaru(keggingId: string): string {
  return `[jantar:${keggingId}]`;
}
