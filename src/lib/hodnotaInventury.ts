// 💰 Hodnota inventury v korunách.
// ---------------------------------------------------------------------------
// Z provozu 10. 10. 2026: „přidej do týdenní inventury i hodnotu týdenní
// inventury". Měsíční inventura ukazuje rozdíl v Kč podle jedné orientační
// ceny podle velikosti obalu; týdenní teď ukáže hodnotu napočítaného a hodnotu
// rozdílů.
//
// Cena řádku:
//  1. platná cena z ceníku (`price_list`, pivo × obal) ke dni, ke kterému se
//     počítá — stejná cena, jakou má objednávka (lib/hodnotaObjednavky.ts);
//  2. kde ceník cenu nemá, ORIENTAČNÍ cena podle objemu obalu — táž, kterou
//     používá měsíční inventura. Řádek se pak počítá jako „orientační" a UI to
//     řekne, ať nikdo nebere odhad za fakturu.
// Nic se nehádá potichu: kolik řádků jde na odhad, vrací `hodnotaInventury`.
import { cenaKeDni, type CenaPolozky } from './hodnotaObjednavky';

/** Orientační cena kusu podle objemu obalu (sud / velká lahev / malá lahev). */
export function orientacniCena(objemL: number): number {
  return objemL > 20 ? 1500 : objemL > 0.6 ? 250 : 45;
}

export type CenaRadku = { cena: number; zCeniku: boolean };

/**
 * Cena jednoho kusu. Cena z ceníku se bere jen v korunách a jen když je
 * kladná — nulová nebo cizí měna by hodnotu zkreslila, tak se jede na odhad.
 */
export function cenaKusu(
  radek: { beer_id: string; package_id: string },
  objemL: number,
  cenik: CenaPolozky[],
  datum: string,
): CenaRadku {
  const c = cenaKeDni(cenik, radek.beer_id, radek.package_id, datum);
  const cena = c ? Number(c.price_per_unit) : NaN;
  const mena = (c?.currency ?? 'CZK').toUpperCase();
  if (c && Number.isFinite(cena) && cena > 0 && mena === 'CZK') return { cena, zCeniku: true };
  return { cena: orientacniCena(objemL), zCeniku: false };
}

export type RadekKOhodnoceni = { napocitano: number | null; rozdil: number };

export type HodnotaInventury = {
  /** Kolik řádků je spočítaných (jen ty mají hodnotu). */
  spocitano: number;
  /** Hodnota toho, co se napočítalo. */
  napocitanoKc: number;
  /** Hodnota přebytků (kladné číslo). */
  prebytekKc: number;
  /** Hodnota manek (kladné číslo — o tolik je míň, než se čekalo). */
  mankoKc: number;
  /** Přebytky − manka. Záporné = celkově chybí. */
  rozdilKc: number;
  /** Kolik spočítaných řádků nemá cenu v ceníku a jde na orientační cenu. */
  orientacnichRadku: number;
};

/**
 * Hodnota spočítaných řádků. `cena` dodá kus ceny pro řádek, ať se tu nemusí
 * znát katalog ani ceník (a jde to snadno otestovat).
 *
 * Součty se zaokrouhlují na koruny AŽ nakonec; `rozdilKc` je rozdíl už
 * zaokrouhlených přebytků a manek, takže čísla na obrazovce sedí na sebe.
 */
export function hodnotaInventury<R extends RadekKOhodnoceni>(
  radky: R[],
  cena: (r: R) => CenaRadku,
): HodnotaInventury {
  let spocitano = 0, napocitano = 0, prebytek = 0, manko = 0, orientacnich = 0;
  for (const r of radky) {
    if (r.napocitano === null) continue;
    const c = cena(r);
    spocitano += 1;
    if (!c.zCeniku) orientacnich += 1;
    napocitano += r.napocitano * c.cena;
    if (r.rozdil > 0) prebytek += r.rozdil * c.cena;
    else if (r.rozdil < 0) manko += -r.rozdil * c.cena;
  }
  const prebytekKc = Math.round(prebytek);
  const mankoKc = Math.round(manko);
  return {
    spocitano,
    napocitanoKc: Math.round(napocitano),
    prebytekKc,
    mankoKc,
    rozdilKc: prebytekKc - mankoKc,
    orientacnichRadku: orientacnich,
  };
}

/** „12 345 Kč", se znaménkem jen když ho chci (rozdíl). */
export function formatKc(kc: number, sZnamenkem = false): string {
  // Znaménko se řídí zaokrouhlenou hodnotou: −0,4 Kč je „0 Kč", ne „−0 Kč".
  const k = Math.round(kc);
  const cislo = Math.abs(k).toLocaleString('cs-CZ').replace(/\s/g, '\u00A0');
  const znamenko = k < 0 ? '−' : sZnamenkem && k > 0 ? '+' : '';
  return `${znamenko}${cislo}\u00A0Kč`;
}
