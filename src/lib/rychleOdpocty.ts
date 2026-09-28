// ⏱️ Rychlé odpočty v liště nahoře na ploše — jedno klepnutí, pevný čas.
// ---------------------------------------------------------------------------
// Z provozu 28. 9. 2026: „nahoru, jak je lupa, dej kulatou ikonu CO2 — když
// na ni kliknu, spustí se časovač 2 minuty, stejně jako u dlaždice CO2; ať
// je ikona barevná; přidej ikonu stejné barvy s ikonou kotel, odpočet
// 2 minuty; dej tam sud malý a sud velký — sud malý odpočet 8 minut,
// velký 15 minut."
//
// Chovají se jako dlaždice CO2 (lib/co2Foukani.ts): klepnutí spustí, další
// klepnutí zastaví a odpočet zmizí. Ukládají se mezi běžné odpočty
// (lib/stopwatchTimers.ts), takže je hlídá stejný alarm i pásek upozornění
// na ploše. Každý má pevné id — stejný odpočet nemůže běžet dvakrát.
import { countdownRemainingMs, type CountdownTimer } from './stopwatchTimers';
import { CO2_DELKA_MS, CO2_ID, CO2_POPIS } from './co2Foukani';

export type RychlyOdpocet = { id: string; popis: string; kratce: string; delkaMs: number };

const MIN = 60 * 1000;

export const RYCHLE_ODPOCTY: RychlyOdpocet[] = [
  { id: CO2_ID, popis: CO2_POPIS, kratce: 'CO2', delkaMs: CO2_DELKA_MS },
  { id: 'rychly-kotel', popis: 'Kotel', kratce: 'Kotel', delkaMs: 2 * MIN },
  { id: 'rychly-sud-maly', popis: 'Sud malý', kratce: 'Malý sud', delkaMs: 8 * MIN },
  { id: 'rychly-sud-velky', popis: 'Sud velký', kratce: 'Velký sud', delkaMs: 15 * MIN },
];

export function rychlyOdpocet(id: string): RychlyOdpocet | undefined {
  return RYCHLE_ODPOCTY.find((r) => r.id === id);
}

export function jeRychlyOdpocet(id: string): boolean {
  return !!rychlyOdpocet(id);
}

export function rychlyBezi(list: CountdownTimer[], id: string): boolean {
  return list.find((t) => t.id === id)?.targetAt != null;
}

/** Zbývající čas; když neběží, celá délka. */
export function rychlyZbyva(list: CountdownTimer[], id: string): number {
  const t = list.find((x) => x.id === id);
  return t ? countdownRemainingMs(t) : (rychlyOdpocet(id)?.delkaMs ?? 0);
}

/** Klepnutí na ikonu: běží → zastav a smaž, neběží → spusť od začátku. */
export function prepniRychlyOdpocet(list: CountdownTimer[], id: string, ted: number = Date.now()): CountdownTimer[] {
  const def = rychlyOdpocet(id);
  if (!def) return list;
  const bez = list.filter((t) => t.id !== id);
  if (rychlyBezi(list, id)) return bez;
  return [...bez, {
    id: def.id,
    label: def.popis,
    durationMs: def.delkaMs,
    initialDurationMs: def.delkaMs,
    targetAt: ted + def.delkaMs,
    notifiedAt: null,
  }];
}
