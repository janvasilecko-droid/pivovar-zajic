/**
 * Plnost tanku jako podíl a jako stav.
 *
 * Sklep dosud říkal jen litry (nebo hektolitry). Z „zbývá 4,20 hl" se
 * v hlavě dopočítává, jestli je to skoro plný tank nebo dojezd — a to je
 * přesně ten výpočet, který má udělat appka.
 *
 * `stav` je záměrně jen ČTYŘI hodnoty. Ukazatel má odpovědět na jednu
 * otázku („můžu z něj ještě stáčet?"), ne dát desetinu procenta.
 */

export type StavPlnosti = 'prazdny' | 'dojezd' | 'stred' | 'plny';

export type Plnost = {
  /** 0 … 1. Nad kapacitu se nejde — 110 % tank neumí. */
  podil: number;
  stav: StavPlnosti;
  /** Procenta na celá čísla, kvůli popisku a `aria-valuenow`. */
  procent: number;
};

/** Pod tímhle podílem je to „dojezd" — začíná se plánovat další várka. */
export const PRAH_DOJEZD = 0.15;
/** Nad tímhle podílem je tank „plný". */
export const PRAH_PLNY = 0.66;

export function plnostTanku(zbyvaLitru: unknown, kapacitaLitru: unknown): Plnost {
  const zbyva = Number(zbyvaLitru);
  const kapacita = Number(kapacitaLitru);
  // Bez kapacity se podíl spočítat nedá. Vrací se prázdný, ne NaN —
  // ukazatel pak nic nekreslí, což je správná odpověď na „nevím".
  if (!Number.isFinite(zbyva) || !Number.isFinite(kapacita) || kapacita <= 0) {
    return { podil: 0, stav: 'prazdny', procent: 0 };
  }
  const podil = Math.min(1, Math.max(0, zbyva / kapacita));
  const procent = Math.round(podil * 100);
  const stav: StavPlnosti =
    podil <= 0 ? 'prazdny'
    : podil < PRAH_DOJEZD ? 'dojezd'
    : podil < PRAH_PLNY ? 'stred'
    : 'plny';
  return { podil, stav, procent };
}

/** Popis pro člověka — jde i do `title` a pro čtečku. */
export function popisPlnosti(p: Plnost): string {
  switch (p.stav) {
    case 'prazdny': return 'prázdný';
    case 'dojezd': return `na dojezdu (${p.procent} %)`;
    case 'stred': return `${p.procent} % objemu`;
    default: return `skoro plný (${p.procent} %)`;
  }
}
