// 🧹 Sklep začíná znovu od 1. 10. 2026.
// ---------------------------------------------------------------------------
// Zadání 2. 10. 2026: „vymaž data ze sklepa, uděláme data od října, nebo ty
// data ulož, ale v appce ať je to prázdný — všechny tanky a historie, jako
// kdyby se ta položka udělala znova, a já nastavím tanky teď."
//
// Nic se nemaže. Starší historie sklepa (přečerpání, uzavřené cykly tanků,
// várky a měření, stáčení „bez tanku") v databázi zůstává, jen ji appka
// ve Sklepu neukazuje. Obsah tanků se vyprázdnil migrací
// 20261231240000_sklep_od_rijna.sql, předchozí stav je v tabulce
// cellar_tanks_archiv_2026_10. Stáčení a sklad (skladová kniha) se tím
// nemění — na nich data sklepa nezávisí.
export const SKLEP_OD = '2026-10-01';

/** Patří záznam s tímhle datem (YYYY-MM-DD nebo ISO čas) do nového sklepa? */
export function vNovemSklepu(datum: string | null | undefined): boolean {
  return !!datum && String(datum).slice(0, 10) >= SKLEP_OD;
}
