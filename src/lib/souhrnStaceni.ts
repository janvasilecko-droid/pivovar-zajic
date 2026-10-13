// 🧮 Souhrn stáčení za období: stočeno celkem × manko z inventury × po odečtu.
// ---------------------------------------------------------------------------
// Z provozu 13. 10. 2026: „ukazuje to všude 172,9, ale ve vzorci je mínus 16,3 —
// potřebuju celkem stočeno v sudech za měsíc." „Celkem" ve Stáčení KEG je
// po odečtu manka z inventury (záporné řádky, viz 21. 9. 2026), takže ukazuje
// míň, než se doopravdy stočilo. Tady se obě čísla rozdělí a ukážou vedle sebe.
export type RadekStaceni = { package_id: string | null; quantity: number | string | null };
export type ObalObjem = { id: string; volume_l: number | string | null };

export type SouhrnStaceni = {
  /** Skutečně stočeno (jen kladné řádky). */
  stocenoKs: number;
  stocenoL: number;
  /** Manko z inventury (záporné řádky) — kusy a litry jsou záporné nebo nula. */
  mankoKs: number;
  mankoL: number;
  /** Po odečtu manka — tohle je „Celkem" ve Stáčení KEG. */
  poOdecteKs: number;
  poOdecteL: number;
};

const zaokr = (n: number) => Math.round(n * 100) / 100;

export function souhrnStaceni(radky: RadekStaceni[], obaly: ObalObjem[]): SouhrnStaceni {
  const objem = new Map(obaly.map((o) => [o.id, Number(o.volume_l) || 0]));
  let stocenoKs = 0, stocenoL = 0, mankoKs = 0, mankoL = 0;
  for (const r of radky) {
    const ks = Number(r.quantity) || 0;
    const l = ks * (objem.get(r.package_id ?? '') ?? 0);
    if (ks > 0) { stocenoKs += ks; stocenoL += l; } else { mankoKs += ks; mankoL += l; }
  }
  return {
    stocenoKs: zaokr(stocenoKs), stocenoL: zaokr(stocenoL),
    mankoKs: zaokr(mankoKs), mankoL: zaokr(mankoL),
    poOdecteKs: zaokr(stocenoKs + mankoKs), poOdecteL: zaokr(stocenoL + mankoL),
  };
}
