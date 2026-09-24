// 🗓️🔎 Rozklad skladu na týden a dny — pro jedno pivo × obal vidět KAŽDÝ
// den v týdnu a co se ten den dělo (stáčení, fasování, objednávky…) i stav
// na skladě před a po. Vzniklo z provozu: „mám teď 2×50, ale nesedí mi to
// se stáčením a výdejem — kde je ten jeden sud?" Dřívější záložka „Rozpad
// piva" uměla jen jedno dlouhé období bez rozdělení po dnech; tenhle modul
// bere STEJNOU skladovou knihu (lib/stockLedger) a jen ji nakrájí po dnech
// uvnitř týdne — vlastní počítání by byla další, možná jiná pravda o tomtéž.
import { posunDnu } from './tydenniInventura';
import { movementsFor, stockAtStartOfDay, stockKey, type Movement } from './stockLedger';

export type DenRozkladu = {
  datum: string;
  pohyby: Movement[];
  stavNaZacatku: number;
  stavNaKonci: number;
};

/** Všechny dny od `od` do `doDne` (včetně krajů), typicky pondělí až neděle. */
export function dnyObdobi(od: string, doDne: string): string[] {
  const dny: string[] = [];
  for (let d = od; d <= doDne; d = posunDnu(d, 1)) dny.push(d);
  return dny;
}

/**
 * Rozdělí pohyby jednoho piva × obalu po dnech uvnitř zadaného období.
 *
 * Stav na začátku prvního dne je `stockAtStartOfDay` — TATÁŽ funkce, kterou
 * počítá týdenní i měsíční inventura, aby číslo na začátku rozkladu sedělo
 * s číslem, které ukazuje zbytek appky. Dál se jen přičítají pohyby dne po
 * dni.
 */
export function denniRozpad(
  movements: Movement[],
  beerId: string,
  packageId: string,
  od: string,
  doDne: string,
): DenRozkladu[] {
  const zacatek = stockAtStartOfDay(movements, od).get(stockKey(beerId, packageId))?.qty ?? 0;
  const vsechnyVObdobi = movementsFor(movements, beerId, packageId, od, doDne);

  let bezici = zacatek;
  return dnyObdobi(od, doDne).map((datum) => {
    // V rámci dne se řadí podle druhu pohybu, ať se stejný den nezobrazuje
    // pokaždé v jiném pořadí (movementsFor řadí jen podle data).
    const dnesni = vsechnyVObdobi
      .filter((m) => m.date === datum)
      .sort((a, b) => a.kind.localeCompare(b.kind));
    const stavNaZacatku = bezici;
    bezici += dnesni.reduce((s, m) => s + m.qty, 0);
    return { datum, pohyby: dnesni, stavNaZacatku, stavNaKonci: bezici };
  });
}
