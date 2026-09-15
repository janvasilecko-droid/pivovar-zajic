// 📋 „Zbývá stočit tento týden" — ZJEDNODUŠENÝ týdenní přehled po OBALECH.
// ---------------------------------------------------------------------------
// Z provozu 15. 9. 2026: denní plán (lib/keggingPlan.ts) den po dni odečítá
// zavezené objednávky a rozděluje zásobu podle priority dnů — přesné, ale
// složité, a u týdenního součtu to bylo matoucí („stočil jsem přes 20,
// appka pořád píše chybí"). Obsluha chtěla u tenhle SOUHRNNÉ dlaždice
// jednodušší, hrubší pravidlo — přesný den-po-dni rozpad zůstává v
// „Co je potřeba stočit" (KeggingDayPlan.tsx), beze změny.
//
// Vzorec (na pivo+obal se NEDĚLÍ, jen na OBAL, stejně jako dřív):
//   zbývá = max(0, (objednávky_tyden + fasování_tyden)
//                − (zásoba_v_pondělí_ráno + stočeno_tento_týden))
// Objednávky se počítají CELÉ za týden, bez ohledu na to, jestli už byly
// zavezené — a zásoba v pondělí je FIXNÍ počáteční bod (stav ke konci
// předchozí neděle), ne "co je skladem právě teď". Žádné rozdělování podle
// priority dnů, žádné vyjímání zavezených objednávek ze zásoby.
//
// Rozklik jedné velikosti na jednotlivá piva (Kegging.tsx/BottlingScreen.tsx,
// `rozpisPiv`) MUSÍ počítat stejným vzorcem, jinak by se součet piv v
// rozkliku nesešel s číslem na dlaždici — z provozu 15. 9. 2026 to byl přesně
// tenhle nesoulad mezi dlaždicí a denním plánem, jen na jednu úroveň níž.
// `zbyvaStocitPrehledTydnePodlePiv` proto počítá stejné `soucet` a
// `zbyvaStocitPrehledTydne` z něj jen sečte obaly — obal je tedy vždycky
// přesně součtem svých piv.
import { buildMovements, stockAsOf, type StockSources } from './stockLedger';
import type { RozpadObalu } from './keggingPlan';

export type TydenniPrehledVstup = {
  /** Pro pondělní počáteční zásobu — CELÁ historie do konce předchozí neděle. */
  zdroje: StockSources;
  packages: { id: string; label: string; kind: string; volume_l: number }[];
  /** Stočené řádky TOHOTO týdne (kegging, nebo bottling u lahví). */
  stoceniTydne: { beer_id?: string | null; package_id?: string | null; quantity?: number | string | null }[];
  /** Položky objednávek TOHOTO týdne — VŠECHNY, bez ohledu na stav zavezení. */
  objednavkyTydne: { beer_id?: string | null; package_id?: string | null; quantity?: number | string | null }[];
  /** Fasování TOHOTO týdne. */
  fasovaniTydne: { beer_id?: string | null; package_id?: string | null; quantity?: number | string | null }[];
  /** Pondělí aktuálního týdne, YYYY-MM-DD. */
  pondeliISO: string;
  /** Které obaly počítat — výchozí sudy, pro lahve `(kind) => kind !== 'keg'`. */
  jeCilovyObal?: (kind: string) => boolean;
};

export type ChybiPivoObal = { beer_id: string; package_id: string; missing: number };

/** Den před `datumISO` — čistě kalendářně, bez časové zóny. */
function denPred(datumISO: string): string {
  const d = new Date(datumISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Součet (nabídka − poptávka) za tento týden, na klíč pivo__obal. */
function spocitejSoucetPodlePiv(vstup: TydenniPrehledVstup): { soucet: Record<string, number>; cilovePkg: Map<string, TydenniPrehledVstup['packages'][number]> } {
  const jeCilovy = vstup.jeCilovyObal ?? ((kind: string) => kind === 'keg');
  const cilovePkg = new Map(vstup.packages.filter((p) => jeCilovy(p.kind)).map((p) => [p.id, p]));

  // Zásoba PŘESNĚ na začátku týdne — pohyby TOHOTO týdne (objednávky,
  // fasování, stočení) do ní nesmí vstoupit, jinak by se počítaly dvakrát.
  const nedeleMinulehoTydne = denPred(vstup.pondeliISO);
  const pondelniZasoba = stockAsOf(buildMovements(vstup.zdroje), nedeleMinulehoTydne);

  const soucet: Record<string, number> = {};
  const pricti = (rows: TydenniPrehledVstup['stoceniTydne'], znamenko: 1 | -1) => {
    rows.forEach((r) => {
      if (!r.beer_id || !r.package_id || !cilovePkg.has(r.package_id)) return;
      const k = `${r.beer_id}__${r.package_id}`;
      soucet[k] = (soucet[k] || 0) + znamenko * Number(r.quantity || 0);
    });
  };

  // Nabídka: pondělní zásoba + co se tento týden stočilo.
  pondelniZasoba.forEach((radek, k) => {
    if (!cilovePkg.has(radek.package_id)) return;
    soucet[k] = (soucet[k] || 0) + radek.qty;
  });
  pricti(vstup.stoceniTydne, 1);
  // Poptávka: objednávky + fasování celého týdne (odečet).
  pricti(vstup.objednavkyTydne, -1);
  pricti(vstup.fasovaniTydne, -1);

  return { soucet, cilovePkg };
}

/**
 * Totéž číslo jako `zbyvaStocitPrehledTydne`, ale nerozpadlé podle obalu —
 * podle KONKRÉTNÍHO PIVA. Pro rozklik jedné velikosti obalu na jednotlivá
 * piva (viz komentář na začátku souboru).
 */
export function zbyvaStocitPrehledTydnePodlePiv(vstup: TydenniPrehledVstup): ChybiPivoObal[] {
  const { soucet, cilovePkg } = spocitejSoucetPodlePiv(vstup);
  const vysledek: ChybiPivoObal[] = [];
  Object.entries(soucet).forEach(([k, zbytek]) => {
    if (zbytek >= 0) return; // zásoba stačí, nic nechybí
    const [beerId, packageId] = k.split('__');
    if (!cilovePkg.has(packageId)) return;
    vysledek.push({ beer_id: beerId, package_id: packageId, missing: -zbytek });
  });
  return vysledek.sort((a, z) => z.missing - a.missing);
}

export function zbyvaStocitPrehledTydne(vstup: TydenniPrehledVstup): RozpadObalu[] {
  const chybiPodlePiv = zbyvaStocitPrehledTydnePodlePiv(vstup);
  const jeCilovy = vstup.jeCilovyObal ?? ((kind: string) => kind === 'keg');
  const cilovePkg = new Map(vstup.packages.filter((p) => jeCilovy(p.kind)).map((p) => [p.id, p]));

  const objednanoSoucet: Record<string, number> = {};
  vstup.objednavkyTydne.forEach((r) => {
    if (!r.beer_id || !r.package_id || !cilovePkg.has(r.package_id)) return;
    const k = `${r.beer_id}__${r.package_id}`;
    objednanoSoucet[k] = (objednanoSoucet[k] || 0) + Number(r.quantity || 0);
  });

  const podleObalu = new Map<string, RozpadObalu>();
  chybiPodlePiv.forEach(({ package_id, missing }) => {
    const pkg = cilovePkg.get(package_id);
    if (!pkg) return;
    const zaznam = podleObalu.get(package_id) ?? {
      package_id,
      package_label: pkg.label,
      volume_l: Number(pkg.volume_l),
      ordered: 0,
      missing: 0,
      missingLiters: 0,
    };
    zaznam.missing += missing;
    zaznam.missingLiters += missing * Number(pkg.volume_l);
    podleObalu.set(package_id, zaznam);
  });
  // `ordered` je součet za VŠECHNA piva daného obalu (i ta, co nechybí) —
  // ať title na dlaždici pořád umí říct "objednáno X".
  Object.entries(objednanoSoucet).forEach(([k, qty]) => {
    const packageId = k.split('__')[1];
    const zaznam = podleObalu.get(packageId);
    if (zaznam) zaznam.ordered += qty;
  });

  return [...podleObalu.values()].sort(
    (a, z) => z.volume_l - a.volume_l || a.package_label.localeCompare(z.package_label, 'cs')
  );
}
