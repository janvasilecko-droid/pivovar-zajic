// 🥤 Limonády (Grep, Citron, Kiwi, Višeň…) žijí ve stejném katalogu piv jako
// opravdové pivo — databáze nemá sloupec, který by je rozlišil — ale do
// INVENTURY nepatří: nevaří se, nejsou to sudy/lahve, které by se počítaly
// stejně jako pivo. Rozpoznávají se podle jména, jak je pivovar sám píše.
const LIMONADOVE_KLICE = ['grep', 'citron', 'citro', 'kiwi', 'visen', 'limo'];

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
