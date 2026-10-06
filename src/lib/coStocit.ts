// 🍺 „Co je potřeba stočit" — výběr pro okno na úvodní stránce.
// ---------------------------------------------------------------------------
// Počítá se to STEJNĚ jako plán stáčení na obrazovkách Sudy a Lahve
// (computeKeggingPlan), tady se jen vybírá den nebo celý týden a nechávají
// se položky, kde ještě něco chybí. Vlastní výpočet by se s plánem dřív nebo
// později rozešel a plocha by tvrdila něco jiného než obrazovka stáčení.
import { mergeWeekPlan, dayKeyFromISO, type DayPlan, type PlanItem } from './keggingPlan';

/** 'tyden' = celý týden (včetně objednávek bez termínu), jinak 'po' … 'ne'. */
export type VyberObdobi = string;

export function planProVyber(plans: DayPlan[], vyber: VyberObdobi, weekLabel: string): DayPlan {
  if (vyber === 'tyden') return mergeWeekPlan(plans, weekLabel);
  return plans.find((p) => p.day === vyber) ?? mergeWeekPlan([], weekLabel);
}

const DNY_TYDNE = ['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne'];

/**
 * Co okno „Co stočit" ukáže po otevření — podle zapamatované volby.
 *
 * 6. 10. 2026: „primárně ať to ukazuje na týden, pokud si překliknu na
 * středu, ať si to pamatuje středu a ukazuje to středu, dokud nekliknu na
 * jiný." Výchozí je proto CELÝ TÝDEN (dřív zítřek a automatický skok na
 * nejbližší den, kde něco chybí) a zapamatuje se i konkrétní den v týdnu.
 * Stará hodnota „dnes" (z dřívější verze) = dnešní den.
 */
export function ulozeneObdobi(ulozeno: string | null, dnesniDen: string): VyberObdobi {
  if (ulozeno === 'dnes') return dnesniDen;
  if (ulozeno && DNY_TYDNE.includes(ulozeno)) return ulozeno;
  return 'tyden';
}

/**
 * Den dalšího závozu — první den PO dnešku (v tomhle týdnu), kdy jsou
 * objednávky. Okno ho jen barevně označí, nevybírá ho (6. 10. 2026: „den
 * dalšího závozu jen označ barevně"). Po dnešku proto, že co jede dnes, už
 * je stočené nebo na cestě — a co jede zítra, se musí stočit dneska.
 */
export function denDalsihoZavozu(plans: DayPlan[], dnesISO: string): string | null {
  const odZitra = DNY_TYDNE.slice(DNY_TYDNE.indexOf(dayKeyFromISO(dnesISO)) + 1);
  return odZitra.find((den) => plans.some((p) => p.day === den && p.totalOrdered > 0)) ?? null;
}

/**
 * Kolik kusů chybí stočit MIMO právě vybraný den (celý týden minus výběr).
 *
 * Z provozu 22. 9. 2026: „na skladě mi to ukazuje −1×30 12sv, ale Co stočit
 * na středu ukazuje, že je vše stočené". Obojí byla pravda — středa pokrytá
 * byla, ale chybějící sud visel na jiném dni (nebo na objednávce bez dne
 * dovozu). Sklad počítá celý týden, denní plán jen vybraný den, takže si
 * navzájem odporovaly a schodek se našel až u závozu.
 *
 * Při výběru „tyden" vrací 0 — tam je celý týden vidět.
 */
export function chybiMimoVyber(plans: DayPlan[], vyber: VyberObdobi): number {
  const celkem = plans.reduce((s, p) => s + p.totalMissing, 0);
  const veVyberu = planProVyber(plans, vyber, '').totalMissing;
  return Math.max(0, celkem - veVyberu);
}

/** Jen to, co ještě zbývá stočit — nejvíc chybějících nahoře. */
export function coZbyvaStocit(plan: DayPlan): PlanItem[] {
  return plan.items
    .filter((it) => it.missing > 0)
    .sort((a, z) => z.missing - a.missing || a.beer_name.localeCompare(z.beer_name, 'cs') || z.volume_l - a.volume_l);
}
