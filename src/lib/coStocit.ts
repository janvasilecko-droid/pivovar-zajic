// 🍺 „Co je potřeba stočit" — výběr pro okno na úvodní stránce.
// ---------------------------------------------------------------------------
// Počítá se to STEJNĚ jako plán stáčení na obrazovkách Sudy a Lahve
// (computeKeggingPlan), tady se jen vybírá den nebo celý týden a nechávají
// se položky, kde ještě něco chybí. Vlastní výpočet by se s plánem dřív nebo
// později rozešel a plocha by tvrdila něco jiného než obrazovka stáčení.
import { mergeWeekPlan, type DayPlan, type PlanItem } from './keggingPlan';

/** 'tyden' = celý týden (včetně objednávek bez termínu), jinak 'po' … 'ne'. */
export type VyberObdobi = string;

export function planProVyber(plans: DayPlan[], vyber: VyberObdobi, weekLabel: string): DayPlan {
  if (vyber === 'tyden') return mergeWeekPlan(plans, weekLabel);
  return plans.find((p) => p.day === vyber) ?? mergeWeekPlan([], weekLabel);
}

/** Jen to, co ještě zbývá stočit — nejvíc chybějících nahoře. */
export function coZbyvaStocit(plan: DayPlan): PlanItem[] {
  return plan.items
    .filter((it) => it.missing > 0)
    .sort((a, z) => z.missing - a.missing || a.beer_name.localeCompare(z.beer_name, 'cs') || z.volume_l - a.volume_l);
}
