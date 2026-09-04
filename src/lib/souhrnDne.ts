/**
 * 📅 Co se dnes v pivovaru stalo — na jednom místě.
 *
 * Dnes se to skládá z pěti obrazovek: stočené sudy v KEG, lahve v Lahvích,
 * výdeje ve Fasování, odpisy v Odpisu, zavezené v Závozu. Nikdo to nedělá,
 * protože to znamená pět přepnutí a pět mezisoučtů v hlavě.
 *
 * Souhrn NEPOČÍTÁ stav skladu — jen sčítá pohyby daného dne po druzích.
 * Stav skladu umí jedině `stockLedger.ts` (pravidlo repozitáře) a míchat
 * to sem by z toho udělalo druhý, tichý výpočet skladu.
 */

import { MOVEMENT_LABELS, type Movement, type MovementKind } from './stockLedger';

/** Jeden řádek souhrnu — jeden druh pohybu za den. */
export type RadekSouhrnu = {
  kind: MovementKind;
  /** Jak se to jmenuje pro člověka. */
  popis: string;
  /** Kolik kusů (vždy kladné číslo — směr říká `smer`). */
  kusu: number;
  /** 'pribylo' = sklad narostl, 'ubylo' = sklad klesl. */
  smer: 'pribylo' | 'ubylo';
  /** Kolik zápisů to bylo — „3 zápisy, 120 ks" je jiná informace než jeden. */
  zapisu: number;
};

export type SouhrnDne = {
  datum: string;
  radky: RadekSouhrnu[];
  /** Kusy, které dnes do skladu přišly (stáčení). */
  pribyloCelkem: number;
  /** Kusy, které dnes ze skladu odešly (závoz, výdej, odpis, akce…). */
  ubyloCelkem: number;
  /** Nic se nestalo — ať obrazovka může říct „dnes zatím nic" místo nul. */
  prazdny: boolean;
};

/**
 * Inventura se do souhrnu nepočítá: není to pohyb, je to RESET stavu
 * (viz stockLedger). Sečíst napočítaný stav s výdeji by dalo číslo, které
 * nic neznamená.
 */
const NEPOCITAT: MovementKind[] = ['inventura'];

/** Druhy, které sklad DOPLŇUJÍ. Zbytek ubírá. */
const PRIBYVAJICI: MovementKind[] = ['staceni', 'kegovani', 'prefuk_do', 'dorovnani'];

export function souhrnDne(pohyby: Movement[], datumISO: string): SouhrnDne {
  const podleDruhu = new Map<MovementKind, { kusu: number; zapisu: number }>();

  for (const p of pohyby) {
    if (p.date !== datumISO) continue;
    if (NEPOCITAT.includes(p.kind)) continue;
    const kusu = Math.abs(Number(p.qty) || 0);
    if (kusu <= 0) continue;
    const z = podleDruhu.get(p.kind) ?? { kusu: 0, zapisu: 0 };
    z.kusu += kusu;
    z.zapisu += 1;
    podleDruhu.set(p.kind, z);
  }

  // Dorovnání může jít oběma směry; rozhoduje ZNAMÉNKO, ne druh. Proto se
  // směr u něj počítá zvlášť z celkového součtu daného dne.
  const dorovnaniCelkem = pohyby
    .filter((p) => p.date === datumISO && p.kind === 'dorovnani')
    .reduce((a, p) => a + (Number(p.qty) || 0), 0);

  const radky: RadekSouhrnu[] = [...podleDruhu.entries()]
    .map(([kind, z]) => ({
      kind,
      popis: MOVEMENT_LABELS[kind] ?? kind,
      kusu: z.kusu,
      smer: (kind === 'dorovnani'
        ? (dorovnaniCelkem >= 0 ? 'pribylo' : 'ubylo')
        : PRIBYVAJICI.includes(kind) ? 'pribylo' : 'ubylo') as 'pribylo' | 'ubylo',
      zapisu: z.zapisu,
    }))
    // Nejvíc kusů první — to je to, co dnes dělalo největší část práce.
    .sort((a, b) => b.kusu - a.kusu);

  const pribyloCelkem = radky.filter((r) => r.smer === 'pribylo').reduce((a, r) => a + r.kusu, 0);
  const ubyloCelkem = radky.filter((r) => r.smer === 'ubylo').reduce((a, r) => a + r.kusu, 0);

  return {
    datum: datumISO,
    radky,
    pribyloCelkem,
    ubyloCelkem,
    prazdny: radky.length === 0,
  };
}
