// 🍺 Výčepy, které jsou pořád u zákazníka.
// ---------------------------------------------------------------------------
// Rezervace nese kauci i příznak vrácení, ale nikde se neukazovalo, že je
// výčep venku třetí týden. Jsou to peníze i vybavení, o kterých se neví — a
// přijde se na to, až ho bude někdo potřebovat.
//
// Počítá se od KONCE rezervace, ne od začátku: dokud termín běží, výčep má
// být u zákazníka a hlásit to by byl planý poplach.
import type { TapReservation } from '../screens/VycepyScreen';

/** Kolik dní po konci rezervace se výčep začne připomínat. */
export const TOLERANCE_DNI = 1;

export type VycepVenku = {
  rezervace: TapReservation;
  /** Kolik dní uplynulo od konce rezervace. */
  dniPoTerminu: number;
  kauceCzk: number;
};

/** Rozdíl ve dnech mezi dvěma ISO daty (YYYY-MM-DD), bez vlivu časové zóny. */
function rozdilDni(od: string, do_: string): number {
  const a = Date.parse(`${od}T00:00:00Z`);
  const b = Date.parse(`${do_}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * Které výčepy jsou po termínu a ještě se nevrátily.
 *
 * Řadí od nejdéle chybějícího — ten je nejpodezřelejší a zároveň u něj leží
 * kauce nejdéle.
 */
export function vycepyVenku(
  rezervace: TapReservation[],
  dnesISO: string,
  toleranceDni: number = TOLERANCE_DNI,
): VycepVenku[] {
  const out: VycepVenku[] = [];
  for (const r of rezervace) {
    if (r.is_returned) continue;
    const konec = r.date_to || r.date_from;
    if (!konec) continue;
    const dni = rozdilDni(konec, dnesISO);
    if (dni <= toleranceDni) continue;
    out.push({ rezervace: r, dniPoTerminu: dni, kauceCzk: Number(r.deposit_czk) || 0 });
  }
  return out.sort((a, b) => b.dniPoTerminu - a.dniPoTerminu);
}

/** Kolik korun celkem leží u zákazníků na kaucích. */
export function kauceVenku(seznam: VycepVenku[]): number {
  return seznam.reduce((s, x) => s + x.kauceCzk, 0);
}
