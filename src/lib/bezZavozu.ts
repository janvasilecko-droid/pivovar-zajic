// 🚚❌ „Bez závozu" — odběratelé, kteří nepotřebují závozovou trasu.
// ---------------------------------------------------------------------------
// Zadání 24. 9. 2026: „do obednavek pridej zaskrtavaci volbu bez zavozu,
// automaticky ji zaskrtni kdyz bude mates,jitka,restaurace,terasa u zbytku
// se musi zadat rucne."
//
// Porovnává se PŘESNÝ název odběratele (po sjednocení diakritiky/velikosti
// písmen), ne jestli ve jméně jde najít slovo „restaurace" jako podřetězec —
// v katalogu je i „Restaurace Na Růžku", opravdový odběratel s vlastním
// závozem, a ten se tímhle omylem zaškrtnout nesmí.
const AUTOMATICKY_BEZ_ZAVOZU = ['mates', 'jitka', 'restaurace', 'terasa'];

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Má se u tohohle odběratele „Bez závozu" zaškrtnout automaticky? */
export function jeAutomatickyBezZavozu(placeName: string | null | undefined): boolean {
  const n = norm(placeName ?? '');
  if (!n) return false;
  return AUTOMATICKY_BEZ_ZAVOZU.includes(n);
}
