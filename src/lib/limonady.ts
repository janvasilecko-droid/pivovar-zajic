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
