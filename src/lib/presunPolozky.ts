/**
 * Přesun části objednávky na jiný den stáčení.
 *
 * Z provozu 9. 9. 2026: „část objednávky od Radka se vezla o den dřív, takže
 * potřebuju část odškrtnout ve středu a část ve čtvrtek." Plán přitom
 * přiřazuje den CELÉ objednávce, takže ve středu nebylo co odškrtnout.
 *
 * Řádek objednávky proto může mít vlastní den (`order_items.delivery_day`,
 * migrace 20261231000000). Když se přesouvá jen ČÁST řádku, musí vzniknout
 * řádek druhý — deset sudů nemůže být napůl ve středu a napůl ve čtvrtek
 * jedním číslem.
 *
 * Tenhle modul jen SPOČÍTÁ, co se má zapsat. Zápis dělá volající; díky tomu
 * jde rozdělování otestovat bez databáze.
 *
 * ⚠️ PŮVODNÍ ŘÁDEK SI VŽDYCKY DRŽÍ SVÉ ID a zůstává na svém dni; odchází
 * teprve nově založený řádek. Není to kosmetika: na `order_items.id` visí
 * odpočty závozu (`zavoz_deductions.order_item_id`). Kdyby se přesouval
 * původní řádek a na místě zůstal nový, odpočty by se rozešly s tím, co
 * doopravdy odešlo, a plán by žádal stočit znovu něco, co je dávno pryč.
 */

export type PolozkaKPresunu = {
  id: string;
  order_id: string;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  package_label: string | null;
  quantity: number;
  /** Den, který si nese samotná položka. `null` = platí den objednávky. */
  delivery_day: string | null;
};

/** Nový řádek k založení — tvarem odpovídá tabulce `order_items`. */
export type NovyRadek = {
  order_id: string;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  package_label: string | null;
  quantity: number;
  delivery_day: string | null;
};

export type PresunPlan =
  /** Není co dělat (nulový počet, stejný den, nesmyslný vstup). */
  | { druh: 'nic'; duvod: string }
  /** Celý řádek jde na jiný den — stačí přepsat jeho `delivery_day`. */
  | { druh: 'cely'; id: string; delivery_day: string | null }
  /** Řádek se dělí: původnímu se ubere, zbytek odejde jako nový řádek. */
  | { druh: 'rozdeleni'; zmensit: { id: string; quantity: number }; zalozit: NovyRadek };

/**
 * Co se má zapsat, aby `kusu` kusů z řádku jelo na `cilovyDen`.
 *
 * `cilovyDen === null` znamená „vrátit zpět pod den objednávky".
 */
export function naplanujPresun(
  polozka: PolozkaKPresunu,
  cilovyDen: string | null,
  kusu: number,
  /** Den, na kterém řádek stojí teď — tedy den objednávky, když nemá vlastní. */
  soucasnyDen: string,
): PresunPlan {
  const celkem = Number(polozka.quantity || 0);
  const pocet = Math.floor(Number(kusu) || 0);

  if (celkem <= 0) return { druh: 'nic', duvod: 'Řádek nemá žádné kusy.' };
  if (pocet <= 0) return { druh: 'nic', duvod: 'Přesouvá se nula kusů.' };
  if (pocet > celkem) return { druh: 'nic', duvod: 'Na řádku není tolik kusů.' };

  // Den, kam se míří, je ten, na kterém řádek stejně už stojí.
  const cil = cilovyDen ?? null;
  const stojiTam = cil === null ? polozka.delivery_day === null : cil === soucasnyDen;
  if (stojiTam) return { druh: 'nic', duvod: 'Řádek už na tenhle den patří.' };

  if (pocet === celkem) {
    return { druh: 'cely', id: polozka.id, delivery_day: cil };
  }

  return {
    druh: 'rozdeleni',
    zmensit: { id: polozka.id, quantity: celkem - pocet },
    zalozit: {
      order_id: polozka.order_id,
      beer_id: polozka.beer_id,
      beer_name: polozka.beer_name,
      package_id: polozka.package_id,
      package_label: polozka.package_label,
      quantity: pocet,
      delivery_day: cil,
    },
  };
}
