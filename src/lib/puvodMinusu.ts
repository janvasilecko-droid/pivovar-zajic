// ➖ Odkud je mínus ve skladu — pohyby jednoho piva a obalu od poslední
// inventury (resetu stavu) do daného dne, s průběžným stavem.
// ---------------------------------------------------------------------------
// 9. 10. 2026: „v týdenní inventuře mám mínus 12 sv 50 l". Mínus = vydalo se
// víc, než se zapsalo do stáčení; nejčastěji automatický odpočet závozu,
// ke kterému chybí zápis stáčení (typicky sudy do vlastních sudů odběratele
// — Duck and Dog, Fojtovice). Tohle ukáže, které pohyby ho udělaly.
import { MOVEMENT_LABELS, type Movement } from './stockLedger';
import { vlastniSudyOdberatele } from './vlastniSudy';

export type RadekPuvodu = {
  datum: string;
  popis: string;
  /** + příjem, − výdej; u inventury nastavený stav. */
  kusu: number;
  stavPo: number;
  /** Závoz odběrateli s vlastními sudy — sklad ho odepsal, stáčení k němu chybí? */
  vlastniSudy: boolean;
};

export function puvodStavu(
  pohyby: Movement[],
  beerId: string,
  packageId: string,
  doDne: string,
  mistoObjednavky: Map<string, string | null>,
): RadekPuvodu[] {
  const moje = pohyby
    .filter((m) => m.beer_id === beerId && m.package_id === packageId && m.date <= doDne)
    .sort((a, z) => a.date.localeCompare(z.date) || Number(z.kind === 'inventura') - Number(a.kind === 'inventura'));
  let od = 0;
  moje.forEach((m, i) => { if (m.kind === 'inventura') od = i; });
  let stav = 0;
  return moje.slice(od).map((m) => {
    stav = m.kind === 'inventura' ? m.qty : stav + m.qty;
    const misto = m.orderId ? mistoObjednavky.get(m.orderId) ?? null : null;
    return {
      datum: m.date,
      kusu: m.qty,
      stavPo: stav,
      popis: m.kind === 'inventura'
        ? `Inventura = ${m.qty}`
        : m.kind === 'zavoz'
          ? `Závoz${misto ? ` ${misto}` : ''}`
          : MOVEMENT_LABELS[m.kind],
      vlastniSudy: m.kind === 'zavoz' && !!vlastniSudyOdberatele(misto),
    };
  });
}
