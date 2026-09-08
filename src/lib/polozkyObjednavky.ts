/**
 * Odškrtávání položek objednávky — jedno pravidlo pro Objednávky i Závoz.
 *
 * Objednávka jde třemi kroky: pivo se STOČÍ, pak se PŘIPRAVÍ k odvozu
 * a nakonec ZAVEZE. První dva se odškrtávají po položkách
 * (`order_items.is_bottled`, `order_items.is_prepared`), protože objednávka
 * běžně obsahuje čtyři piva a stáčí se v různých dnech.
 *
 * Obě obrazovky sahají na tytéž sloupce záměrně: kdyby si každá držela svůj
 * příznak, odškrtnutí v Závozu by se v Objednávkách neprojevilo a člověk by
 * podle jedné obrazovky stáčel to, co je podle druhé dávno hotové.
 */

/** Příznaky, které se u položky odškrtávají. */
export type PriznakPolozky = 'is_bottled' | 'is_prepared';

export type OdskrtavatelnaPolozka = {
  is_bottled?: boolean | null;
  is_prepared?: boolean | null;
};

/**
 * Je celá objednávka v daném příznaku hotová?
 *
 * Prázdná objednávka hotová NENÍ: „všechny položky jsou připravené" u nuly
 * položek by objednávku bez řádků označilo za nachystanou a zmizela by
 * z práce, aniž by se čehokoliv týkala.
 */
export function vseHotovo(polozky: OdskrtavatelnaPolozka[], klic: PriznakPolozky): boolean {
  if (polozky.length === 0) return false;
  return polozky.every((p) => !!p[klic]);
}

/** Kolik položek zbývá odškrtnout — do popisku „2 ze 4". */
export function zbyvaHotovych(polozky: OdskrtavatelnaPolozka[], klic: PriznakPolozky): number {
  return polozky.filter((p) => !p[klic]).length;
}

/**
 * Stočené, ale nepřipravené položky. Přesně tohle leží mezi sklepem
 * a autem — pivo je hotové, ale nikdo ho nenachystal k závozu.
 */
export function stoceneNepripravene(polozky: OdskrtavatelnaPolozka[]): OdskrtavatelnaPolozka[] {
  return polozky.filter((p) => !!p.is_bottled && !p.is_prepared);
}
