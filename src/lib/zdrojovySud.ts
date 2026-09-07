/**
 * Zdrojový sud pro stáčení lahví — který se nabídne sám.
 *
 * Do lahví se stáčí ze sudů a v Kynšperku je to skoro vždycky padesátka.
 * Políčko přesto začínalo na „— žádný —", takže se u každého piva muselo
 * vybírat znovu; kdo to přeskočil, zapsal stáčení bez odečtu sudů a schodek
 * se našel až na inventuře.
 *
 * Padesátka je proto předvolená. Když ji pivovar v katalogu nemá (nebo je
 * schovaná), vezme se největší dostupný sud — pořád lepší než nic, a stáčeč
 * to vidí v rozbalovátku nad políčkem počtu.
 */

/** Objem sudu, který se předvolí, když je v katalogu. */
export const PRIMARNI_OBJEM_SUDU = 50;

export type SudNaVyber = { id: string; volume_l: number | null };

export function vychoziZdrojovySud<T extends SudNaVyber>(sudy: T[]): string {
  if (sudy.length === 0) return '';
  const padesatka = sudy.find((p) => Number(p.volume_l) === PRIMARNI_OBJEM_SUDU);
  if (padesatka) return padesatka.id;
  // Bez padesátky největší dostupný. `?? 0` schválně: sud bez zadaného
  // objemu nesmí vyhrát jen proto, že se null porovnává divně.
  const nejvetsi = [...sudy].sort((a, b) => (Number(b.volume_l) ?? 0) - (Number(a.volume_l) ?? 0))[0];
  return nejvetsi?.id ?? '';
}
