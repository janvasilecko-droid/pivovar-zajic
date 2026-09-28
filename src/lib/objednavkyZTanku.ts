// 🍺 Kolik piva z tanku je potřeba stočit na objednávky vybraného týdne.
// ---------------------------------------------------------------------------
// Počítá se Z PLÁNU STÁČENÍ (lib/keggingPlan.ts přes lib/usePlanStaceni.ts),
// tedy stejně jako okno „Co stočit" na ploše a obrazovky KEG a Lahve.
// Zadání 28. 9. 2026: „ať znova nemusíme řešit, že všude se ukazuje co
// stočit jinak."
//
// Předtím tu byly dva vlastní vzorce po sobě: nejdřív objednáno − stočeno
// TENTO TÝDEN (hlásilo „zbývá" i u objednávek pokrytých sudy z minulého
// týdne), potom objednávky − sklad. Oba se od plánu stáčení lišily v
// detailech (ruční odškrtnutí, fasování, rozdělení po dnech).
//
// Tady se z plánu jen převádějí kusy na litry po pivech a přidávají dvě
// pravidla, která patří k TANKU, ne ke skladu:
//   • Jantar se ze sklepa nestáčí — míchá se z 80 % 12° Světlé a 20 % tmavého.
//   • Když chybí lahve, bere se z tanku 50 l navíc (ztráta na lince; zadání
//     sládka).
import type { DayPlan } from './keggingPlan';
import { pivaJantaru, PODIL_SVETLE } from './jantar';

export type PivoProVypocet = { id: string; name: string };

export type ObjednavkyPiva = {
  /** Všechny objednávky týdne v hl. */
  objednanoHl: number;
  /** Co z toho už je pokryto (nachystáno, zavezeno, leží na skladě) v hl. */
  pokrytoHl: number;
  /** Co se ještě musí stočit z tanku, v hl (se 50 l rezervy na lahve). */
  zbyvaHl: number;
};

/** Lahve se stáčejí z tanku navíc s rezervou 50 l (zadání sládka). */
const REZERVA_LAHVE_L = 50;

/**
 * Převede týdenní plán sudů a lahví (mergeWeekPlan) na hektolitry po pivech.
 */
export function objednavkyZTanku(
  plany: { sudy?: DayPlan | null; lahve?: DayPlan | null },
  piva: PivoProVypocet[],
): Map<string, ObjednavkyPiva> {
  const litry = { objednano: new Map<string, number>(), pokryto: new Map<string, number>(), zbyva: new Map<string, number>() };
  const pricti = (m: Map<string, number>, pivo: string, l: number) => m.set(pivo, (m.get(pivo) ?? 0) + l);

  for (const [druh, plan] of [['sudy', plany.sudy], ['lahve', plany.lahve]] as const) {
    const lahveChybi = new Set<string>();
    for (const it of plan?.items ?? []) {
      const objem = Number(it.volume_l) || 0;
      pricti(litry.objednano, it.beer_id, it.ordered * objem);
      pricti(litry.pokryto, it.beer_id, Math.min(it.done, it.ordered) * objem);
      pricti(litry.zbyva, it.beer_id, it.missing * objem);
      if (druh === 'lahve' && it.missing > 0) lahveChybi.add(it.beer_id);
    }
    lahveChybi.forEach((pivo) => pricti(litry.zbyva, pivo, REZERVA_LAHVE_L));
  }

  // Jantar se ze sklepa nestáčí — míchá se z 80 % 12° Světlé a 20 % tmavého.
  // Stejná pravidla jako zápis stáčení Jantaru (lib/jantar.ts).
  const { jantar, svetla, tmava: tmave } = pivaJantaru(piva);
  if (jantar) {
    for (const m of [litry.objednano, litry.pokryto, litry.zbyva]) {
      const l = m.get(jantar.id) ?? 0;
      if (l <= 0) continue;
      if (svetla) pricti(m, svetla.id, l * PODIL_SVETLE);
      if (tmave) pricti(m, tmave.id, l * (1 - PODIL_SVETLE));
      m.set(jantar.id, 0);
    }
  }

  const vysledek = new Map<string, ObjednavkyPiva>();
  const hl = (l: number) => Math.round(l) / 100;
  for (const pivo of new Set([...litry.objednano.keys(), ...litry.zbyva.keys()])) {
    vysledek.set(pivo, {
      objednanoHl: hl(litry.objednano.get(pivo) ?? 0),
      pokrytoHl: hl(litry.pokryto.get(pivo) ?? 0),
      zbyvaHl: hl(litry.zbyva.get(pivo) ?? 0),
    });
  }
  return vysledek;
}
