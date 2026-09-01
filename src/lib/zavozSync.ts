// 🔗 Skladový odpočet zavozu drží krok s objednávkou.
// ---------------------------------------------------------------------------
// Objednávka je pravda. Řádek v `zavoz_deductions` je jen její otisk k okamžiku,
// kdy se zavezlo — a otisk se sám neaktualizuje. Když se po zavozu opraví
// množství, pivo nebo obal, sklad zůstane odepsaný podle starých hodnot a
// rozdíl se objeví až v inventuře jako manko, které nemá původ ve výrobě.
//
// Přesně takhle vznikly tři rozjeté řádky (stav k 1. 9. 2026):
//   • Radek, 20. 8. — Summer Ale 30 l: objednávka 9, odpočet 15 (o 6 víc)
//   • Duck and Dog, 3. 7. — 11° Světlá 50 l: objednávka 8, odpočet 4
//   • Jona, 3. 7. — Osma 1 l: objednávka 30, odpočet 10
//
// Databáze na to má funkci `reconcile_zavoz_deduction_for_item` (migrace
// 20261201000000) a `replace_order_with_items` ji volá. Jenže rychlé úpravy
// přímo v detailu objednávky — přepsat kus, přehodit pivo, přehodit obal —
// jdou obyčejným UPDATE na `order_items` a RPC míjejí. Tenhle soubor spočítá,
// co se má té funkci poslat.

/** Položka objednávky v rozsahu, který se propisuje do skladu. */
export type PolozkaObjednavky = {
  id: string;
  beer_id: string | null;
  package_id: string | null;
  quantity: number;
};

/** Změna, kterou člověk udělal v detailu objednávky. */
export type UpravaPolozky = Partial<Pick<PolozkaObjednavky, 'beer_id' | 'package_id' | 'quantity'>>;

/** Parametry pro RPC `reconcile_zavoz_deduction_for_item`. */
export type SrovnaniOdpoctu = {
  p_order_item_id: string;
  p_beer_id: string | null;
  p_package_id: string | null;
  p_quantity: number;
};

/**
 * Co poslat do RPC po ruční úpravě položky — nebo `null`, když volat netřeba.
 *
 * Vrací null ve třech případech:
 *  • nic se doopravdy nezměnilo (přepsání na stejnou hodnotu),
 *  • množství není kladné číslo (na to je mazání položky, ne odpočet nula),
 *  • položka nemá id (ještě neuložený řádek — odpočet k ní existovat nemůže).
 *
 * Posílají se VŽDY všechny tři hodnoty, i když se měnila jen jedna: funkce v
 * databázi přepisuje řádek celý a doplnit ji půlkou hodnot by odpočet rozhodila
 * ještě víc.
 */
export function srovnaniPoUprave(
  puvodni: PolozkaObjednavky,
  zmena: UpravaPolozky,
): SrovnaniOdpoctu | null {
  if (!puvodni.id) return null;

  const nova: PolozkaObjednavky = {
    id: puvodni.id,
    beer_id: zmena.beer_id !== undefined ? zmena.beer_id : puvodni.beer_id,
    package_id: zmena.package_id !== undefined ? zmena.package_id : puvodni.package_id,
    quantity: zmena.quantity !== undefined ? Number(zmena.quantity) : Number(puvodni.quantity),
  };

  if (!Number.isFinite(nova.quantity) || nova.quantity <= 0) return null;

  const beze_zmeny =
    nova.beer_id === puvodni.beer_id &&
    nova.package_id === puvodni.package_id &&
    nova.quantity === Number(puvodni.quantity);
  if (beze_zmeny) return null;

  return {
    p_order_item_id: nova.id,
    p_beer_id: nova.beer_id,
    p_package_id: nova.package_id,
    p_quantity: nova.quantity,
  };
}
