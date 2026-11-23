// 🚚❌ „Bez závozu" — odběratelé, kteří nepotřebují závozovou trasu.
// ---------------------------------------------------------------------------
// Zadání 24. 9. 2026: „do obednavek pridej zaskrtavaci volbu bez zavozu,
// automaticky ji zaskrtni kdyz bude mates,jitka,restaurace,terasa u zbytku
// se musi zadat rucne."
//
// Zadání 23. 11. 2026: „egon, martin, jitka, toužim — to jde automaticky bez
// závozu"; Mates, Restaurace a Terasa zůstávají („2 ano"). Platí pro každou
// cestu, kterou objednávka vzniká — ruční zadání, průvodce, fotka i zpráva
// z WhatsAppu („3 ano"). Do té doby se pole zaškrtlo jen při ručním zadání,
// takže objednávky z WhatsAppu (Jitka, Egon) bez závozu nikdy nebyly.
//
// Porovnává se PŘESNÝ název odběratele (po sjednocení diakritiky/velikosti
// písmen), ne jestli ve jméně jde najít slovo „restaurace" jako podřetězec —
// v katalogu je i „Restaurace Na Růžku", opravdový odběratel s vlastním
// závozem, a ten se tímhle omylem zaškrtnout nesmí.
//
// „Mates" samotný v katalogu není — odběratel se jmenuje „Mates Rybárna",
// proto tu jsou oba názvy (do 23. 11. 2026 se mu pole nezaškrtlo nikdy).
// Stejně „Toužim": v katalogu „Chlapy z Toužimi".
const AUTOMATICKY_BEZ_ZAVOZU = [
  'mates', 'mates rybarna', 'jitka', 'restaurace', 'terasa',
  'egon', 'martin', 'chlapy z touzimi', 'touzim',
];

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Má se u tohohle odběratele „Bez závozu" zaškrtnout automaticky? */
export function jeAutomatickyBezZavozu(placeName: string | null | undefined): boolean {
  const n = norm(placeName ?? '');
  if (!n) return false;
  return AUTOMATICKY_BEZ_ZAVOZU.includes(n);
}

const KLICE_DNU = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'] as const;

/** Den v týdnu ('po'…'ne') z data RRRR-MM-DD; neplatné datum → null. */
export function klicDne(datumISO: string | null | undefined): string | null {
  if (!datumISO || !/^\d{4}-\d{2}-\d{2}$/.test(datumISO)) return null;
  const d = new Date(`${datumISO}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : KLICE_DNU[(d.getUTCDay() + 6) % 7];
}

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
 * (`vychoziDen` z lib/denZavozu.ts — středa, Seeberg a Lužec pátek;
 * 17. 11. 2026: „u objednávek nastav primárně závoz středa") a datum
 * nejbližšího takového dne od data objednávky. Bez výchozího dne (Restaurace
 * se závozem, Prodejna) zůstane bez dne i data.
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
