// 📅 Den závozu z objednávky — čisté funkce bez napojení na databázi, ať je
// může použít i výpočet malých sudů (lib/maleSudy.ts) a testy bez Supabase.
// Stejný vzorec jako databáze (ucinny_den_zavozu). Dřív žily v
// lib/zavozDeduction.ts, ten je dál vyváží.

const DAY_OFFSET: Record<string, number> = {
  po: 0,
  ut: 1,
  st: 2,
  ct: 3,
  pa: 4,
  so: 5,
  ne: 6,
};

function getMondayOfWeekISO(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function deliveryDayToISO(orderDate: string, deliveryDay: string | null): string {
  const firstDay = (deliveryDay ?? 'pa').split('/')[0].trim();
  const offset = DAY_OFFSET[firstDay] ?? DAY_OFFSET.pa;
  const monday = getMondayOfWeekISO(orderDate);
  const d = new Date(monday + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function computeDeliveryDateISO(
  orderDate: string,
  deliveryDay: string | null,
  deliveryDate: string | null,
): string {
  if (deliveryDate) return deliveryDate.slice(0, 10);
  return deliveryDayToISO(orderDate, deliveryDay);
}

/** „ve středu", „v pátek" — den závozu ve větě. */
export const DEN_KDY: Record<string, string> = {
  po: 'v pondělí', ut: 'v úterý', st: 've středu', ct: 've čtvrtek', pa: 'v pátek', so: 'v sobotu', ne: 'v neděli',
};

/** Den, který objednávka dostane, když ho nikdo nezadá — pražské závozy jezdí ve středu. */
export const VYCHOZI_DEN_ZAVOZU = 'st';

/** Odběratel v rozsahu, který rozhoduje o výchozím dni závozu. */
export type MistoSVychozimDnem = { id: string; name: string; vychozi_den_zavozu?: string | null };

/**
 * Výchozí den závozu odběratele — stejné pravidlo jako databáze
 * (vychozi_den_zavozu, migrace 20261231260000): středa; odběratel s vlastním
 * dnem ten den (Seeberg a Lužec pátek — 17. 11. 2026: „u objednávek Seeberg,
 * Lužec dávej automaticky objednávky na pátek", migrace 20261231470000);
 * 'zadny' (Restaurace, Prodejna) žádný den.
 * Odběratel se hledá podle id, jinak podle jména (bez ohledu na velikost
 * písmen a mezery kolem); neznámý odběratel má středu.
 *
 * Majitel 17. 11. 2026: „u objednávek nastav primárně závoz středa, pokud není
 * jinak označeno ve zprávě — objednávka typu 2x30 se automaticky označí středa,
 * ale uživatel si ji může změnit." Okna čtení objednávky podle toho den rovnou
 * ukážou, místo aby ho databáze doplnila potichu až po uložení.
 */
export function vychoziDenZavozu(
  mista: readonly MistoSVychozimDnem[],
  placeId: string | null | undefined,
  placeName: string | null | undefined,
): string | null {
  const jmeno = (placeName ?? '').trim().toLowerCase();
  const shody = mista.filter((p) => (!!placeId && p.id === placeId)
    || (jmeno !== '' && (p.name ?? '').trim().toLowerCase() === jmeno));
  const misto = shody.find((p) => !!placeId && p.id === placeId)
    ?? shody.find((p) => p.vychozi_den_zavozu != null)
    ?? shody[0];
  const den = misto?.vychozi_den_zavozu ?? null;
  if (den === 'zadny') return null;
  return den && den in DAY_OFFSET ? den : VYCHOZI_DEN_ZAVOZU;
}

const KLICE_DNU_OD_PONDELI = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'] as const;

/**
 * Den a datum závozu objednávky založené ze zprávy rovnou, bez kontrolního
 * okna („Importovat objednávku" v přehledu čtení WhatsAppu).
 *
 * Co říká zpráva, platí. Zpráva bez dne dostane výchozí den odběratele
 * (středa) a datum nejbližšího takového dne od dneška; „příští týden" ve
 * zprávě ho posune o týden (`pristiTyden`). Dřív se tu bez dne dosazovalo
 * pondělí s dnešním datem — objednávka se pak hned odečetla ze skladu, i když
 * měla jet až ve středu. Odběratel bez výchozího dne (Restaurace, Prodejna)
 * zůstává na dnešku jako dřív, jen se správným dnem v týdnu.
 */
export function denADatumZeZpravyNeboVychozi(p: {
  den?: string | null;
  datum?: string | null;
  mista: readonly MistoSVychozimDnem[];
  placeId?: string | null;
  placeName?: string | null;
  dnes: string;
  pristiTyden?: boolean;
}): { den: string; datum: string } {
  const dnesD = new Date(`${p.dnes}T00:00:00Z`);
  const denDnes = KLICE_DNU_OD_PONDELI[(dnesD.getUTCDay() + 6) % 7];
  const den = (p.den ?? '').trim() || vychoziDenZavozu(p.mista, p.placeId, p.placeName);
  if (p.datum) return { den: den || denDnes, datum: p.datum.slice(0, 10) };
  if (!den || !(den in DAY_OFFSET)) return { den: denDnes, datum: p.dnes };
  // Nejbližší takový den od dneška (dnešek včetně); s „příští týden" den příštího týdne.
  const posun = (DAY_OFFSET[den] - DAY_OFFSET[denDnes] + 7) % 7;
  const d = new Date(dnesD);
  d.setUTCDate(d.getUTCDate() + posun);
  if (p.pristiTyden && getMondayOfWeekISO(d.toISOString().slice(0, 10)) === getMondayOfWeekISO(p.dnes)) d.setUTCDate(d.getUTCDate() + 7);
  return { den, datum: d.toISOString().slice(0, 10) };
}
