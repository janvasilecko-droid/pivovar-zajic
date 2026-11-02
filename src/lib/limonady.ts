// 🥤 Limonády (Grep, Citron, Kiwi, Višeň…) žijí ve stejném katalogu piv jako
// opravdové pivo — databáze nemá sloupec, který by je rozlišil — ale do
// INVENTURY nepatří: nevaří se, nejsou to sudy/lahve, které by se počítaly
// stejně jako pivo. Rozpoznávají se podle jména, jak je pivovar sám píše.
const LIMONADOVE_KLICE = ['grep', 'citron', 'citro', 'kiwi', 'visen', 'visn', 'limo'];

function bezDiakritiky(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Je tohle jméno limonáda, ne pivo? */
export function jeLimonada(nazevPiva: string | null | undefined): boolean {
  const n = bezDiakritiky((nazevPiva || '').toLowerCase());
  return LIMONADOVE_KLICE.some((k) => n.includes(k));
}

/**
 * Musí mít stáčení tohohle zboží tank? Limonáda ne — nestáčí se z tanku piva
 * ve sklepě. 16. 10. 2026 majitel: „limonády celkově nemají tank" (Citron se
 * v auditu hlásil jako „Stáčení KEG bez tanku" a svítil na záložce Stáčení bez
 * tanku). Stáčení limonády do sudů se do skladu píše normálně, jen bez tanku
 * a bez odečtu objemu ze sklepa. Neznámé jméno se bere jako pivo — radši
 * nahlásit, než přehlédnout.
 */
export function potrebujeTank(nazevPiva: string | null | undefined): boolean {
  return !jeLimonada(nazevPiva);
}

// ---------------------------------------------------------------------------
// 🥤 Limonády ZVLÁŠŤ. 2. 11. 2026 majitel: „do inventury a výstavu nikdy
// nepočítej Limonády citron kiwi višeň grep, počítej je zvlášť". Jedno pravidlo
// pro všechna místa: řádek je limonáda, když ji pozná ID z CELÉHO katalogu
// (i neaktivní pivo) nebo jméno na řádku. Nikdy se nesrovnává jméno na rovnost
// („Grep " s mezerou v katalogu × „Grep" v zápisech).
// ---------------------------------------------------------------------------

export type RadekSPivem = { beer_id?: string | null; beer_name?: string | null };

/** Sada ID limonád z katalogu piv — dej sem VŠECHNA piva, i neaktivní. */
export function idLimonad(piva: { id: string; name?: string | null }[] | null | undefined): Set<string> {
  return new Set((piva ?? []).filter((p) => jeLimonada(p.name)).map((p) => p.id));
}

/** Je řádek (stáčení, fasování, odpis, pohyb…) limonáda? */
export function jeLimonadaRadek(r: RadekSPivem, idL: Set<string>): boolean {
  return (r.beer_id != null && idL.has(r.beer_id)) || jeLimonada(r.beer_name);
}

/** Řádky bez limonád — do inventury a výstavu. */
export function bezLimonad<T extends RadekSPivem>(radky: T[] | null | undefined, idL: Set<string>): T[] {
  return (radky ?? []).filter((r) => !jeLimonadaRadek(r, idL));
}

/** Jen limonády — pro samostatný součet. */
export function jenLimonady<T extends RadekSPivem>(radky: T[] | null | undefined, idL: Set<string>): T[] {
  return (radky ?? []).filter((r) => jeLimonadaRadek(r, idL));
}

export type SouctyLimonad = { sudyKs: number; lahveKs: number; ks: number; litry: number };

/** Samostatný součet limonád: sudy a lahve v kusech a celkem litry. */
export function souctyLimonad(
  radky: { package_id: string | null; quantity: number | string | null }[],
  obalPodleId: Map<string, { kind?: string | null; volume_l?: number | string | null }>,
): SouctyLimonad {
  const s: SouctyLimonad = { sudyKs: 0, lahveKs: 0, ks: 0, litry: 0 };
  for (const r of radky) {
    const q = Number(r.quantity) || 0;
    const o = r.package_id ? obalPodleId.get(r.package_id) : undefined;
    s.ks += q;
    if (o?.kind === 'keg') s.sudyKs += q;
    else if (o?.kind === 'bottle') s.lahveKs += q;
    if (o) s.litry += q * (Number(o.volume_l) || 0);
  }
  return s;
}
