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

const KLICE_DNU = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'] as const;

/**
 * Den a datum závozu, se kterými se nová objednávka uloží.
 *
 * „Bez závozu" = odběratel si pivo bere sám. Když se u takové objednávky den
 * nevybere, pivo odchází v den objednávky. Z provozu 16. 11. 2026: objednávka
 * Restaurace bez vybraného dne se ve skladu neodečetla („nevidím ji
 * v rozboru") — databáze objednávce bez dne dává pátek, tady až pátek
 * příštího týdne.
 *
 * Objednávka se závozem bez vybraného dne dostane výchozí den odběratele
 * (`vychoziDen` z lib/denZavozu.ts — středa; 17. 11. 2026: „u objednávek
 * nastav primárně závoz středa") a datum nejbližšího takového dne od data
 * objednávky. Bez výchozího dne (Restaurace se závozem, Lužec…) zůstane bez
 * dne i data.
 *
 * Vybraný den nebo datum se nikdy nepřepisuje; stejná pravidla má databáze
 * (doplnit_datum_zavozu).
 */
export function denZavozuProUlozeni(p: {
  bezZavozu: boolean;
  den: string | null | undefined;
  datum: string | null | undefined;
  datumObjednavky: string;
  /** Výchozí den odběratele ('po'…'ne'), null = žádný. */
  vychoziDen?: string | null;
}): { den: string | null; datum: string | null } {
  const den = (p.den ?? '').trim();
  const datum = (p.datum ?? '').trim();
  if (den || datum) return { den: den || null, datum: datum || null };
  const d = new Date(`${p.datumObjednavky}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.datumObjednavky) || Number.isNaN(d.getTime())) return { den: null, datum: null };
  const denObjednavky = (d.getUTCDay() + 6) % 7;
  if (p.bezZavozu) return { den: KLICE_DNU[denObjednavky], datum: p.datumObjednavky };
  const cil = (KLICE_DNU as readonly string[]).indexOf(p.vychoziDen ?? '');
  if (cil < 0) return { den: null, datum: null };
  // Nejbližší takový den od data objednávky (ten den včetně) — jako databáze.
  d.setUTCDate(d.getUTCDate() + ((cil - denObjednavky + 7) % 7));
  return { den: KLICE_DNU[cil], datum: d.toISOString().slice(0, 10) };
}
