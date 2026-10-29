// 🛢️ Bilanční konto sudů — řádek pivo × obal ze skladové knihy.
// ---------------------------------------------------------------------------
// 29. 10. 2026: „ať se vše bere z jednoho místa". Měsíční inventura si
// bilanci sudů dřív sčítala z řádků tabulek sama (bez přefuku, dorovnání
// a Úprav skladu, akce ořezané na nulu a doplněné z paměti telefonu) a „Stav
// konec měsíce" se lišil od sloupce SKLAD. Teď: sloupce z rozpadu měsíce,
// konec = SKLAD, a co sloupce nevysvětlí (přefuk, vrácení a dorovnání, Úprava
// skladu během měsíce), je v „Ostatní".
import type { StockLine } from './stockLedger';

export type RadekBilanceSudu = {
  initialQty: number;
  stacenoKegQty: number;
  objednavkyQty: number;
  stacenoLahveQty: number;
  fasovaniQty: number;
  prodejnaQty: number;
  akceQty: number;
  odpisyQty: number;
  ostatniQty: number;
  endStockQty: number;
};

/**
 * @param rozpad řádek expectedForMonth (počátek a pohyby měsíce)
 * @param sklad  řádek stavu k poslednímu dni (sloupec SKLAD)
 * @param pocatekBezRadku počáteční stav, když položka v rozpadu není
 */
export function radekBilanceSudu(rozpad: StockLine | undefined, sklad: StockLine | undefined, pocatekBezRadku = 0): RadekBilanceSudu {
  const k = rozpad?.byKind ?? {};
  const initialQty = rozpad?.baselineQty ?? pocatekBezRadku;
  const stacenoKegQty = k.kegovani ?? 0;
  const objednavkyQty = -(k.zavoz ?? 0);
  const stacenoLahveQty = -(k.sud_na_lahve ?? 0);
  const fasovaniQty = -(k.fasovani ?? 0);
  const prodejnaQty = -(k.prodejna ?? 0);
  const akceQty = -(k.akce ?? 0);
  const odpisyQty = -(k.odpis ?? 0);
  const endStockQty = sklad?.qty ?? 0;
  const ostatniQty = endStockQty
    - (initialQty + stacenoKegQty - (objednavkyQty + stacenoLahveQty + fasovaniQty + prodejnaQty + akceQty + odpisyQty));
  return { initialQty, stacenoKegQty, objednavkyQty, stacenoLahveQty, fasovaniQty, prodejnaQty, akceQty, odpisyQty, ostatniQty, endStockQty };
}
