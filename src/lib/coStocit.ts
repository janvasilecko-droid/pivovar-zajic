// 🍺 „Co je potřeba stočit" — výběr pro okno na úvodní stránce.
// ---------------------------------------------------------------------------
// Počítá se to STEJNĚ jako plán stáčení na obrazovkách Sudy a Lahve
// (computeKeggingPlan), tady se jen vybírá den nebo celý týden a nechávají
// se položky, kde ještě něco chybí. Vlastní výpočet by se s plánem dřív nebo
// později rozešel a plocha by tvrdila něco jiného než obrazovka stáčení.
import { mergeWeekPlan, dayKeyFromISO, type DayPlan, type PlanItem } from './keggingPlan';
import { posunDen } from './businessDate';

/** 'tyden' = celý týden (včetně objednávek bez termínu), jinak 'po' … 'ne'. */
export type VyberObdobi = string;

export function planProVyber(plans: DayPlan[], vyber: VyberObdobi, weekLabel: string): DayPlan {
  if (vyber === 'tyden') return mergeWeekPlan(plans, weekLabel);
  return plans.find((p) => p.day === vyber) ?? mergeWeekPlan([], weekLabel);
}

/**
 * Který den má okno „Co stočit" ukázat, když ho uživatel otevře poprvé
 * (a nemá zapamatovaný „celý týden").
 *
 * Výchozí je ZÍTŘEK, ne dnešek: co se má zavézt/vydat zítra ráno, se musí
 * stočit už dneska — sud/lahev potřebuje čas na dozrání, a dnešní vlastní
 * odpočet ze skladu už proběhl brzo ráno, takže s dnešním dnem stejně nic
 * nenaděláš (viz keggingPlan.ts, komentář u `pool`). Dnešek nezmizí, jen
 * přestane být výchozí — je pořád jedno kliknutí vedle a jeho odznak (počet
 * chybějících kusů) zůstává vidět v liště dnů.
 *
 * Výjimka: v neděli je „zítra" pondělí PŘÍŠTÍHO týdne, které tenhle (jen na
 * aktuální týden vázaný) přehled vůbec nezná — ukázalo by se pondělí TOHOTO
 * týdne, tedy včerejší/starý den, ne zítřek. V neděli proto zůstává dnešek.
 */
export function vychoziDenCoStocit(dnesISO: string): string {
  const zitraISO = posunDen(dnesISO, 1);
  const dnesniDen = dayKeyFromISO(dnesISO);
  if (dnesniDen === 'ne') return dnesniDen;
  return dayKeyFromISO(zitraISO);
}

/** Jen to, co ještě zbývá stočit — nejvíc chybějících nahoře. */
export function coZbyvaStocit(plan: DayPlan): PlanItem[] {
  return plan.items
    .filter((it) => it.missing > 0)
    .sort((a, z) => z.missing - a.missing || a.beer_name.localeCompare(z.beer_name, 'cs') || z.volume_l - a.volume_l);
}
