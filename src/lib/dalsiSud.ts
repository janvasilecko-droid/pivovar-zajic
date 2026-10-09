// 🛢️🛢️ Stáčení lahví ze dvou velikostí sudů najednou.
// ---------------------------------------------------------------------------
// 9. 10. 2026: „přidej možnost do stáčení přidat další volbu sudu" — 10°
// Desítka z 6. 10. se stáčela z 1× 50 l a 1× 20 l, ale řádek stáčení unese
// jen jednu velikost (kegs_used + kegs_used_package_id).
//
// Bez změny databáze: dávka se rozdělí na části, jednu na každou velikost
// sudu, a lahve se mezi ně rozpočítají PODLE LITRŮ ze sudů — stejně jako
// u doplňku z inventury (lahvoveZapisy v inventoryFix.ts). Všechny řádky
// vzniknou v jednom insertu, takže mají stejné created_at; skladová kniha
// je rozliší podle velikosti sudu (dedupe v stockLedger.ts) a odečte každý
// sud jednou.

export type ZdrojSudu = { kegPkgId: string; kegQty: number; kegVolumeL: number };
export type LahveRadku = { pkgId: string; qty: number };
export type CastDavky = LahveRadku & { kegPkgId: string; kegQty: number; sourceL: number };

/**
 * Rozdělí lahve jednoho zápisu mezi zdrojové sudy podle jejich litrů.
 *
 * Zbytek po dělení padne na první sud, ať součet kusů u každého obalu sedí
 * přesně. Sud, na který by nevyšla ani jedna lahev, si vezme jednu od
 * největší části — jinak by v databázi nebyl řádek, který ho nese, a ze
 * skladu by se neodečetl. Vrací null, když to nejde (míň lahví než sudů).
 */
export function rozdelLahvePodleSudu(lahve: LahveRadku[], zdroje: ZdrojSudu[]): CastDavky[] | null {
  const platne = zdroje.filter((z) => z.kegQty > 0 && z.kegVolumeL > 0);
  const lahvePlatne = lahve.filter((l) => l.pkgId && l.qty > 0);
  if (platne.length === 0 || lahvePlatne.length === 0) return null;
  const litry = platne.map((z) => z.kegQty * z.kegVolumeL);
  const celkem = litry.reduce((s, l) => s + l, 0);

  // kusy[i][j] = kolik lahví obalu j připadne na sud i
  const kusy = platne.map(() => lahvePlatne.map(() => 0));
  lahvePlatne.forEach((l, j) => {
    let rozdeleno = 0;
    platne.forEach((_, i) => {
      kusy[i][j] = Math.floor((l.qty * litry[i]) / celkem);
      rozdeleno += kusy[i][j];
    });
    kusy[0][j] += l.qty - rozdeleno;
  });

  for (let i = 0; i < platne.length; i++) {
    if (kusy[i].some((k) => k > 0)) continue;
    // Najdi největší část jiného sudu, která se dá o kus zmenšit.
    let a = -1;
    let b = -1;
    for (let x = 0; x < kusy.length; x++) {
      for (let y = 0; y < kusy[x].length; y++) {
        if (x !== i && kusy[x][y] > 1 && (a < 0 || kusy[x][y] > kusy[a][b])) { a = x; b = y; }
      }
    }
    if (a < 0) return null;
    kusy[a][b] -= 1;
    kusy[i][b] += 1;
  }

  const out: CastDavky[] = [];
  platne.forEach((z, i) => lahvePlatne.forEach((l, j) => {
    if (kusy[i][j] > 0) out.push({ pkgId: l.pkgId, qty: kusy[i][j], kegPkgId: z.kegPkgId, kegQty: z.kegQty, sourceL: litry[i] });
  }));
  return out;
}
