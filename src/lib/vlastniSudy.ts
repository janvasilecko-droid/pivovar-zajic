// 🛢️ Odběratelé s VLASTNÍMI sudy — stáčí se jim do jejich sudů.
// ---------------------------------------------------------------------------
// Z provozu 6. 10. 2026: „Duck and Dog a Michal Fojtovice počítej zvlášť,
// mimo zásoby skladu, stáčí se do jejich sudů, to samý Martin malý sudy."
//
// Plné sudy pivovaru skladem jejich objednávku nepokryjí (do jejich sudů se
// musí stočit zvlášť) a jejich naplněné sudy zase nepokryjí objednávky
// ostatních (lib/keggingPlan.ts). Martinovy malé sudy navíc neberou
// z naklikaných prázdných malých sudů pivovaru (lib/maleSudy.ts).
//
// Seznam je v kódu schválně: jsou to tři odběratelé a pravidlo platí hned
// po nasazení, bez úpravy databáze.

export type VlastniSudy = 'vse' | 'male';
/** Obal tak, jak ho mají plán stáčení i malé sudy. */
export type ObalSudu = { kind?: string | null; volume_l?: number | string | null };

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

/** Jaké sudy si odběratel vozí sám: všechny ('vse'), jen malé ('male'), nebo žádné (null). */
export function vlastniSudyOdberatele(placeName: string | null | undefined): VlastniSudy | null {
  const n = norm(placeName);
  if (!n) return null;
  if (n.includes('duck') && n.includes('dog')) return 'vse';
  // „Michal fojtovice" (tak je v objednávkách) i „vojtovice" (tak se to vyslovuje).
  if (n.includes('fojtovic') || n.includes('vojtovic')) return 'vse';
  // Přesně „Martin" — ne „Martinice" ani jiný odběratel, co Martina má v názvu.
  if (n === 'martin') return 'male';
  return null;
}

/** Stáčí se tahle položka do sudu odběratele (ne do sudu pivovaru)? */
export function doSuduOdberatele(placeName: string | null | undefined, obal: ObalSudu | undefined): boolean {
  const vlastni = vlastniSudyOdberatele(placeName);
  if (!vlastni || !obal || obal.kind !== 'keg') return false;
  // Malý sud = KEG pod 30 l, stejně jako jeMalySud v lib/maleSudy.ts (ten
  // se sem neimportuje — maleSudy.ts importuje tenhle soubor).
  const objem = Number(obal.volume_l ?? 0);
  return vlastni === 'vse' || (objem > 0 && objem < 30);
}
