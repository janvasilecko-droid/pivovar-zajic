/**
 * Filtr druhu obalu v Přehledu objednávek: sudy / petky / lahve.
 *
 * PROČ VZNIKL: filtr uměl jen „sud" a „všechno ostatní", takže petky byly
 * slité dohromady se sklem. Jenže na středeční závoz se chystá jedno a na
 * stáčení do PET druhé — a kdo si chtěl vypsat jen petky, musel je hledat
 * očima mezi lahvemi.
 *
 * KLASIFIKACE SE TADY NEDĚLÁ. Od toho je `skupinaObalu()` ve
 * `whatsappAmendment.ts` — má na sobě testy a hlídá i případ, kvůli kterému
 * vznikla („petka 15" není patnáctilitrový sud, ale ztracená čárka v 1,5 l).
 * Druhá kopie téhle úvahy by se dřív nebo později rozešla s první.
 */
import { skupinaObalu, type ObalInfo } from './whatsappAmendment';

export type DruhObaluFiltr = 'all' | 'keg' | 'pet' | 'lahev';

/** Jak se která volba jmenuje v hlášce „filtrováno na…". */
export const NAZEV_DRUHU: Record<Exclude<DruhObaluFiltr, 'all'>, string> = {
  keg: 'Pouze sudy (KEG)',
  pet: 'Pouze petky (PET)',
  lahev: 'Pouze lahve (sklo)',
};

/**
 * Vyhovuje obal zvolenému filtru?
 *
 * Tři volby dohromady pokrývají VŠECHNY obaly, žádný nepropadne. Proto se
 * k lahvím počítá i skupina `jine` (nekeg bez zadaného objemu): kdyby
 * vypadla, zmizel by takový řádek ze všech tří filtrů naráz a objednávka by
 * se tvářila, že neexistuje — přesně ten druh ticha, které se pak hledá
 * půl hodiny.
 *
 * Obal, který v katalogu není (`null`), nevyhovuje ničemu — u zapnutého
 * filtru je poctivější řádek skrýt než ho vydávat za lahev.
 */
export function vyhovujeDruhu(obal: ObalInfo | null | undefined, filtr: DruhObaluFiltr): boolean {
  if (filtr === 'all') return true;
  if (!obal) return false;
  const skupina = skupinaObalu(obal);
  if (filtr === 'keg') return skupina === 'maly_sud' || skupina === 'tricitka' || skupina === 'padesatka';
  if (filtr === 'pet') return skupina === 'petka';
  return skupina === 'lahev' || skupina === 'jine';
}
