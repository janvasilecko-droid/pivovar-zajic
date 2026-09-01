// ✍️ Rozepsaná inventura se nepřepisuje.
// ---------------------------------------------------------------------------
// Z provozu: „když tam zadám číslo do inventury, ať to číslo tam zůstane, ať
// vidím, že je zadaný, odečtený atd."
//
// Obrazovka se po každém zápisu (srovnání, dorovnání, uložení) přenačte, aby
// se přepočítala skladová kniha. Přenačtení ale dosazovalo napočítané stavy
// z databáze a localStorage rovnou přes celý stav — a s tím zmizelo i to, co
// měl člověk zrovna naťukané v poli INVENTURA. Vypadalo to, že se zadání
// ztratilo, a nešlo poznat, které řádky už jsou hotové.
//
// Pravidlo je proto jednoduché: uvnitř TÉHOŽ měsíce má přednost to, co je na
// obrazovce. Při přepnutí měsíce se naopak musí načíst všechno znovu, jinak
// by čísla ze srpna zůstala viset v září.
//
// Daň za to je vědomá: inventura uložená na JINÉM zařízení se do rozepsané
// obrazovky sama nepropíše, dokud se měsíc nepřepne nebo appka nenačte znovu.
// Přepsat člověku rozepsaná čísla pod rukama je horší.

/** Mapa `beerId__packageId` → hodnota z pole, jak ji člověk napsal. */
export type MapaInventury = Record<string, string>;

/**
 * Co má po přenačtení zůstat ve stavu obrazovky.
 *
 * @param nactene     Co přišlo z databáze / localStorage.
 * @param rozepsane   Co je právě na obrazovce.
 * @param zmenaMesice Přepnul se měsíc? Pak se rozepsané zahazuje.
 */
export function slucInventuru(
  nactene: MapaInventury,
  rozepsane: MapaInventury,
  zmenaMesice: boolean,
): MapaInventury {
  if (zmenaMesice) return nactene;
  return { ...nactene, ...rozepsane };
}

/**
 * Má se rozepsaný stav ukládat do localStorage?
 *
 * Až po prvním načtení měsíce. Bez téhle pojistky by prázdný stav při
 * otevírání obrazovky přepsal uložený koncept dřív, než se stihne načíst —
 * a rozepsaná inventura by se ztratila právě tím, že se na ni člověk podíval.
 */
export function lzeUlozitKoncept(nactenyMesic: string | null, currentMonth: string): boolean {
  return nactenyMesic === currentMonth;
}
