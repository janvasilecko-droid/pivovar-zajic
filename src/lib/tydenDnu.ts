// 📅 Dny týdne jako tlačítka — „po út st čt pá" místo kalendáře.
// ---------------------------------------------------------------------------
// Zadání z 19. 9. 2026: „místo den tam dej tlačítka po, út, st, čt, pá jako
// dny, a kliknutím na den se uvidí, jaký den se co stáčelo."
//
// Výběr data přes systémový kalendář je na telefonu pět klepnutí a člověk
// u toho musí vědět, kolikátého bylo v úterý. Stáčení se přitom plánuje po
// dnech v týdnu — „ve středu se stáčely petky" — takže tlačítko s názvem dne
// je přesně ten ovladač, který tomu odpovídá.

/** Zkratky dnů tak, jak se píšou na cedulích v pivovaru (od pondělí). */
export const ZKRATKY_DNU = ['po', 'út', 'st', 'čt', 'pá', 'so', 'ne'] as const;

export type DenTydne = {
  /** `YYYY-MM-DD` */
  iso: string;
  /** „st" */
  zkratka: string;
  /** Den v měsíci bez nuly vpředu — „3", ne „03". */
  cislo: number;
  /** Sobota nebo neděle. */
  vikend: boolean;
};

/**
 * Sedm dnů týdne, ve kterém leží `iso` — od pondělí do neděle.
 *
 * ⚠️ Počítá se přes UTC. `new Date('2026-09-14')` je půlnoc UTC a v záporné
 * zóně by `getDay()` ukázal den předchozí — celý týden by se posunul o den.
 * Tatáž past jako u `denACesky` v lib/prehledStaceni.ts.
 *
 * Sobota a neděle se nevynechávají, i když se v nich stáčí málokdy: kdyby
 * v seznamu nebyly, sobotní stáčení by v přehledu nešlo vůbec najít.
 */
export function dnyTydne(iso: string): DenTydne[] {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return [];
  // getUTCDay(): neděle = 0. Posun na pondělí téhož týdne.
  const odPondeli = (d.getUTCDay() + 6) % 7;
  const pondeli = new Date(d.getTime());
  pondeli.setUTCDate(pondeli.getUTCDate() - odPondeli);

  return ZKRATKY_DNU.map((zkratka, i) => {
    const den = new Date(pondeli.getTime());
    den.setUTCDate(den.getUTCDate() + i);
    return {
      iso: den.toISOString().slice(0, 10),
      zkratka,
      cislo: den.getUTCDate(),
      vikend: i >= 5,
    };
  });
}

/** Posun o celé týdny — šipky u řádku dnů listují po týdnech, ne po dnech. */
export function posunTyden(iso: string, tydnu: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + tydnu * 7);
  return d.toISOString().slice(0, 10);
}
