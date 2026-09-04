/**
 * 📉 Za kolik dní dojde pivo.
 *
 * Při plánování stáčení se dnes odhaduje z hlavy: „desítky je ještě dost,
 * jedenáctka bude chybět". Přitom se to dá spočítat — stav skladu zná
 * `stockLedger.ts` a rychlost, jakou pivo odchází, jsou tytéž pohyby.
 *
 * TŘI VĚCI, KTERÉ TU JSOU ZÁMĚRNĚ:
 *
 * 1. Počítá se jen VÝDEJ, ne příjem. Stáčení sklad doplňuje a kdyby se
 *    započítalo, vyšlo by u čerstvě stočeného piva „vydrží navždy".
 * 2. Používá se MEDIÁN denního výdeje, ne průměr. Jeden festival by
 *    průměrem posunul odhad tak, že by aplikace hlásila docházející pivo
 *    každý týden — a po třetím falešném poplachu si toho nikdo nevšimne.
 * 3. Když se nedá odhadnout, řekne se to (`stav: 'nevim'`). Vymyšlené
 *    číslo je horší než žádné: podle „vydrží 9 dní" se plánuje várka.
 *
 * Modul NEPOČÍTÁ stav skladu — ten dělá jen `stockLedger.ts` (pravidlo
 * repozitáře). Bere ho hotový jako vstup.
 */

import type { Movement, MovementKind } from './stockLedger';

/** Pohyby, které pivo ze skladu UBÍRAJÍ, tedy „spotřeba". */
export const VYDEJOVE_POHYBY: MovementKind[] = [
  'zavoz', 'fasovani', 'prodejna', 'odpis', 'akce', 'sud_na_lahve', 'prefuk_z',
];

/** Kolik dnů zpátky se dívá na spotřebu. Čtyři týdny = měsíční rytmus. */
export const OKNO_DNI = 28;
/** Pod tímhle počtem dnů se spotřebou se odhad nedělá. */
export const MIN_DNU_SE_SPOTREBOU = 4;
/** Do kolika dnů je to „dochází". */
export const PRAH_DOCHAZI = 7;

export type StavPredpovedi = 'dochazi' | 'staci' | 'nevim' | 'prazdno';

export type Predpoved = {
  /** Kolik dní vydrží při obvyklé spotřebě. null = nedá se říct. */
  dni: number | null;
  /** Obvyklá denní spotřeba (medián ze dnů, kdy se vydávalo). */
  denne: number;
  stav: StavPredpovedi;
  /** Věta pro člověka. */
  popis: string;
};

function median(cisla: number[]): number {
  if (!cisla.length) return 0;
  const s = [...cisla].sort((a, b) => a - b);
  const p = Math.floor(s.length / 2);
  return s.length % 2 ? s[p] : (s[p - 1] + s[p]) / 2;
}

function oDniZpet(datumISO: string, dni: number): string {
  const d = new Date(`${datumISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dni);
  return d.toISOString().slice(0, 10);
}

/**
 * Obvyklá DENNÍ spotřeba jedné kombinace pivo+obal.
 *
 * Sčítá se po dnech a medián se bere jen ze DNŮ, KDY SE OPRAVDU VYDÁVALO.
 * Kdyby se počítaly i nulové dny, vyšla by u piva vydávaného dvakrát týdně
 * nula — a „vydrží navždy" u piva, které za deset dní dojde.
 */
export function obvyklaDenniSpotreba(
  pohyby: Movement[],
  dnesISO: string,
  oknoDni: number = OKNO_DNI,
): { denne: number; dnuSeSpotrebou: number } {
  const od = oDniZpet(dnesISO, oknoDni);
  const podleDne = new Map<string, number>();
  for (const p of pohyby) {
    if (!VYDEJOVE_POHYBY.includes(p.kind)) continue;
    if (p.date < od || p.date > dnesISO) continue;
    const ubylo = Math.abs(Number(p.qty) || 0);
    if (ubylo <= 0) continue;
    podleDne.set(p.date, (podleDne.get(p.date) ?? 0) + ubylo);
  }
  const dny = [...podleDne.values()];
  return { denne: median(dny), dnuSeSpotrebou: dny.length };
}

/**
 * Za kolik dní dojde pivo daného obalu.
 *
 * `stavSkladu` je hotové číslo ze `stockLedger.ts` — tenhle modul si sklad
 * nepočítá sám.
 */
export function predpovedDojiti(
  stavSkladu: number,
  pohyby: Movement[],
  dnesISO: string,
  oknoDni: number = OKNO_DNI,
): Predpoved {
  const { denne, dnuSeSpotrebou } = obvyklaDenniSpotreba(pohyby, dnesISO, oknoDni);

  if (stavSkladu <= 0) {
    return { dni: 0, denne, stav: 'prazdno', popis: 'Došlo — na skladě nic není' };
  }
  // Málo dat = mlčet. Odhad ze dvou dnů je hádání a podle hádání se
  // plánuje várka.
  if (dnuSeSpotrebou < MIN_DNU_SE_SPOTREBOU || denne <= 0) {
    return { dni: null, denne, stav: 'nevim', popis: 'Zatím málo pohybů na odhad' };
  }

  const dni = Math.floor(stavSkladu / denne);
  const stav: StavPredpovedi = dni <= PRAH_DOCHAZI ? 'dochazi' : 'staci';
  return {
    dni,
    denne,
    stav,
    popis: dni === 0
      ? 'Vydrží necelý den'
      : `Vydrží ${dni} ${dni === 1 ? 'den' : dni < 5 ? 'dny' : 'dní'} (obvykle ${zaokrouhli(denne)} ks/den)`,
  };
}

function zaokrouhli(n: number): string {
  return n >= 10 ? String(Math.round(n)) : n.toFixed(1).replace('.', ',').replace(',0', '');
}
