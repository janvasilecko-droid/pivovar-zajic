// 📥 Objednávka, kterou si člověk zrovna sám založil v appce (ručně, fotkou,
// opakováním dne, nebo schválením WhatsApp zprávy), se nemá znova „nahlásit"
// jako nová — appka to přece ví, sama ji zapsala.
//
// Layout.tsx poslouchá KAŽDÝ insert do `orders` v reálném čase (jinak by
// se objednávka z WhatsAppu na jiném zařízení neohlásila) — bez rozlišení
// spustil zvuk, vibrace, systémovou notifikaci (s `requireInteraction`,
// tedy s nutností ji odklikat) i plovoucí banner i pro objednávku, kterou
// člověk právě sám naťukal na tomhle telefonu. Z provozu: „zadám objednávku
// a appka mi ji hned hlásí jako novou, musím ji pak odklikávat".
//
// Řešení je krátkodobá paměť ID objednávek založených TÍMHLE zařízením:
// Orders.tsx označí ID hned po úspěšném zápisu, Layout.tsx se na něj zeptá,
// než pro stejné ID spustí notifikaci. Objednávka založená odjinud (jiné
// zařízení, kolega) se v mapě nenajde a notifikace proběhne normálně —
// tenhle mechanismus ztlumuje jen ohlas vlastního zápisu, ne týmovou
// informovanost o nové objednávce od někoho jiného.
const vlastni = new Map<string, number>();

/** Realtime dorazí prakticky hned po zápisu; minuta je bohatá rezerva. */
const PLATNOST_MS = 60_000;

/** Zavolat hned po úspěšném INSERTu do `orders` s ID nové objednávky. */
export function oznacVlastniObjednavku(id: string | null | undefined): void {
  if (!id) return;
  vlastni.set(id, Date.now());
}

/**
 * Byla tahle objednávka založená TÍMHLE zařízením před chvílí? Kontrola je
 * jednorázová — po prvním dotazu se ID z mapy smaže, ať se nehromadí (nová
 * objednávka stejného ID beztak nikdy nevznikne, druhý insert nehrozí).
 */
export function jeVlastniObjednavka(id: string | null | undefined): boolean {
  if (!id) return false;
  const cas = vlastni.get(id);
  if (cas === undefined) return false;
  vlastni.delete(id);
  return Date.now() - cas < PLATNOST_MS;
}
