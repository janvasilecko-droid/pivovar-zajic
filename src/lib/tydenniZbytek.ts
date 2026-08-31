// 📦 „Chybí skladem" u objednávky — kolik zbývá ke konci týdne závozu.
// ---------------------------------------------------------------------------
// Odznak na kartě objednávky, který varuje, že na ni nemusí být dost piva.
//
// Dřív to Orders.tsx počítal vlastní cestou: poslední inventura z měsíce před
// aktuálním + stočené TENTO týden − objednané − výdeje. Mělo to tři vady:
//
//  1. Byl to SEDMÝ nezávislý výpočet skladu a jediný, který nešel přes
//     skladovou knihu. Chyběly mu přefuk, sudy spotřebované na lahve i
//     dorovnání inventury — a jednou už se opravoval kvůli chybějícímu
//     fasování/prodejně/akcím. Přesně proto skladová kniha vznikla.
//  2. Míchal období: základ z inventury starý klidně měsíce, ale výrobu jen za
//     jeden týden. Co se stočilo mezitím, se ztratilo.
//  3. Sčítal VŠECHNY obaly jednoho piva do jednoho čísla. Pět sudů a sto
//     lahví dalo „105" — a objednávka na deset sudů pak vypadala krytá.
//
// Teď se ptáme skladové knihy na stav ke konci týdne závozu, po pivu A OBALU.
import { buildMovements, stockAsOf, stockKey, type StockSources } from './stockLedger';

/** Stav skladu ke konci daného týdne, klíč `beer_id__package_id`. */
export function zbytekKeKonciTydne(
  zdroje: StockSources,
  konecTydneISO: string,
): Map<string, number> {
  const stavy = stockAsOf(buildMovements(zdroje), konecTydneISO);
  const out = new Map<string, number>();
  stavy.forEach((line, key) => { out.set(key, line.qty); });
  return out;
}

export type Schodek = {
  beer_id: string;
  package_id: string;
  beer_name: string;
  /** Kolik kusů chybí (kladné číslo). */
  chybi: number;
};

export type PolozkaObjednavky = {
  beer_id: string | null;
  package_id: string | null;
  beer_name?: string | null;
};

/**
 * Které položky objednávky nejsou ke konci týdne kryté.
 *
 * Rozhoduje kombinace PIVO + OBAL, ne jen pivo: chybějící sudy nevykryjí
 * lahve, i když je v nich totéž pivo.
 *
 * Stejné pivo+obal se ve výsledku objeví jednou, i když je objednávka nese
 * na víc řádcích — odznak má říct „tohohle je málo", ne to opakovat.
 */
export function schodkyObjednavky(
  polozky: PolozkaObjednavky[],
  zbytek: Map<string, number>,
): Schodek[] {
  const videno = new Set<string>();
  const out: Schodek[] = [];
  for (const p of polozky) {
    if (!p.beer_id || !p.package_id) continue;
    const key = stockKey(p.beer_id, p.package_id);
    if (videno.has(key)) continue;
    const zbyva = zbytek.get(key) ?? 0;
    if (zbyva >= 0) continue;
    videno.add(key);
    out.push({
      beer_id: p.beer_id,
      package_id: p.package_id,
      beer_name: p.beer_name ?? '?',
      chybi: -zbyva,
    });
  }
  return out;
}
