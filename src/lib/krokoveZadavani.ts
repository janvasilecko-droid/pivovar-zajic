// 🚶 Krokové zadávání stáčení a fasování — čistá logika (bez Reactu).
// ---------------------------------------------------------------------------
// Zadání z 29. 10. 2026: u Lahví, KEG i Fasování se po klepnutí na pivo
// otevře jedna otázka s velkým polem a klávesnicí (stejný princip jako
// Popořadě v inventuře). Nahoře se klikem vybere velikost obalu, pod polem
// je pět nejčastějších čísel. U lahví jsou kroky dva: nejdřív z kolika sudů,
// pak kolik lahví.
//
// Co se zadává, se nemění: lahve jsou čtyři sloty obal+počet, zdrojový sud
// dva sloty (dvě velikosti, viz dalsiSud.ts), KEG a fasování jeden řádek na
// pivo+obal. Tady je jen překlad „obal → slot", ať obrazovky nehádají, do
// kterého políčka číslo patří.

import { nejcastejsiMnozstvi, type QtyHistoryRow } from './quickQty';
import { VYTEZNOST_LAHVOVANI } from './bottlingYield';

/** Kolik nejčastějších čísel se nabízí pod polem. */
export const POCET_RYCHLYCH = 5;

/** Rozepsaná dlaždice Lahví: až čtyři druhy lahví a až dvě velikosti sudů. */
export type KonceptLahve = {
  pkgId: string; qty: string;
  pkg2Id: string; qty2: string;
  pkg3Id: string; qty3: string;
  pkg4Id: string; qty4: string;
  kegPkgId: string; kegQty: string;
  keg2PkgId: string; keg2Qty: string;
};

/** Text z pole → celé kladné číslo, jinak 0. */
export function kusy(hodnota: string | number | null | undefined): number {
  const n = Number(hodnota);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

const text = (n: number) => (n > 0 ? String(n) : '');

const SLOTY_LAHVI = [
  ['pkgId', 'qty'],
  ['pkg2Id', 'qty2'],
  ['pkg3Id', 'qty3'],
  ['pkg4Id', 'qty4'],
] as const;

/** Kolik lahví tohohle obalu je v rozepsané dlaždici. */
export function mnozstviLahve(d: KonceptLahve, pkgId: string): number {
  if (!pkgId) return 0;
  return SLOTY_LAHVI.reduce((s, [p, q]) => (d[p] === pkgId ? s + kusy(d[q]) : s), 0);
}

/**
 * Nastaví počet lahví daného obalu. Obal, který už v nějakém slotu je,
 * přepíše; nový vezme první slot bez počtu. Nula slot uvolní.
 */
export function nastavLahve(d: KonceptLahve, pkgId: string, n: number): KonceptLahve {
  if (!pkgId) return d;
  const pocet = kusy(n);
  const existujici = SLOTY_LAHVI.find(([p]) => d[p] === pkgId);
  if (existujici) {
    const [p, q] = existujici;
    return pocet > 0 ? { ...d, [q]: text(pocet) } : { ...d, [p]: '', [q]: '' };
  }
  if (pocet === 0) return d;
  const volny = SLOTY_LAHVI.find(([, q]) => kusy(d[q]) === 0);
  if (!volny) return d;
  return { ...d, [volny[0]]: pkgId, [volny[1]]: text(pocet) };
}

/** Kolik sudů tuhle velikost je v rozepsané dlaždici (zdroj lahví). */
export function mnozstviSudu(d: KonceptLahve, pkgId: string): number {
  if (!pkgId) return 0;
  return (d.kegPkgId === pkgId ? kusy(d.kegQty) : 0) + (d.keg2PkgId === pkgId ? kusy(d.keg2Qty) : 0);
}

/** Zdrojové sudy s počtem, v pořadí slotů. */
export function sudyDavky(d: KonceptLahve): { pkgId: string; qty: number }[] {
  return [
    { pkgId: d.kegPkgId, qty: kusy(d.kegQty) },
    { pkgId: d.keg2PkgId, qty: kusy(d.keg2Qty) },
  ].filter((s) => s.pkgId && s.qty > 0);
}

/**
 * Nastaví počet sudů dané velikosti. Dvě velikosti jsou strop datového
 * modelu (jeden řádek stáčení nese jednu velikost, druhá je druhý řádek).
 * Nová velikost vezme první slot bez počtu, a když by třetí už nebylo kam
 * dát, nic se nezmění — obrazovka ji v tu chvíli stejně nenabízí.
 *
 * Druhý slot bez prvního se přesune na první: prvním slotem se řídí
 * předvolba (padesátka) a kontrola „chybí zdrojový sud".
 */
export function nastavSud(d: KonceptLahve, pkgId: string, n: number): KonceptLahve {
  if (!pkgId) return d;
  const pocet = kusy(n);
  let dal: KonceptLahve = d;
  if (d.kegPkgId === pkgId) {
    dal = { ...d, kegQty: text(pocet) };
  } else if (d.keg2PkgId === pkgId) {
    dal = pocet > 0 ? { ...d, keg2Qty: text(pocet) } : { ...d, keg2PkgId: '', keg2Qty: '' };
  } else if (pocet > 0) {
    if (kusy(d.kegQty) === 0) dal = { ...d, kegPkgId: pkgId, kegQty: text(pocet) };
    else if (kusy(d.keg2Qty) === 0) dal = { ...d, keg2PkgId: pkgId, keg2Qty: text(pocet) };
    else return d;
  } else {
    return d;
  }
  if (kusy(dal.kegQty) === 0 && kusy(dal.keg2Qty) > 0) {
    dal = { ...dal, kegPkgId: dal.keg2PkgId, kegQty: dal.keg2Qty, keg2PkgId: '', keg2Qty: '' };
  }
  return dal;
}

/**
 * Kolik lahví daného objemu vyjde ze sudů, když se ztrátu (10 %) odečte
 * i to, co už je nastáčené do jiných lahví. Jen odhad, nikdy se nevyplní samo.
 */
export function odhadLahviZeSudu(zdrojL: number, jinychL: number, objemL: number): number {
  if (!(zdrojL > 0) || !(objemL > 0)) return 0;
  const zbyva = zdrojL * VYTEZNOST_LAHVOVANI - Math.max(0, jinychL);
  return zbyva > 0 ? Math.floor(zbyva / objemL + 1e-9) : 0;
}

type RadekDavky = {
  entry_date?: string | null;
  beer_id: string | null;
  created_at?: string | null;
  kegs_used?: number | null;
  kegs_used_package_id?: string | null;
};

/**
 * Z řádků stáčení lahví udělá po jednom záznamu na dávku: kolik sudů dané
 * velikosti se do ní vzalo. Řádek stáčení je jeden na druh lahve, takže
 * počet sudů by se bez tohohle počítal tolikrát, kolik druhů lahví se
 * stáčelo. Dávka = stejný čas zápisu, pivo a velikost sudu.
 */
export function sudyNaDavku(rows: RadekDavky[]): QtyHistoryRow[] {
  const videno = new Set<string>();
  const out: QtyHistoryRow[] = [];
  for (const r of rows) {
    const q = Number(r.kegs_used);
    if (!r.beer_id || !r.kegs_used_package_id || !(q > 0)) continue;
    const klic = `${r.created_at ?? r.entry_date ?? ''}|${r.beer_id}|${r.kegs_used_package_id}`;
    if (videno.has(klic)) continue;
    videno.add(klic);
    out.push({ beer_id: r.beer_id, package_id: r.kegs_used_package_id, quantity: q, entry_date: r.entry_date ?? null });
  }
  return out;
}

/** Pět nejčastějších čísel pro pivo + obal; chybějící doplní záloha. */
export function rychleHodnoty(
  rows: QtyHistoryRow[],
  beerId: string | null | undefined,
  pkgId: string | null | undefined,
  zaloha: number[] = [],
): number[] {
  return nejcastejsiMnozstvi(rows, beerId, pkgId, zaloha, POCET_RYCHLYCH);
}

/** Pořadí obalů v kroku „kolik lahví": litr, pak půltoraka, půllitr a 0,33 l. */
export function poradiLahvi<T extends { volume_l: number | string | null }>(obaly: T[]): T[] {
  const poradi = [1, 1.5, 0.5, 0.33];
  const misto = (o: T) => {
    const i = poradi.findIndex((v) => Math.abs(v - Number(o.volume_l)) < 0.01);
    return i < 0 ? poradi.length : i;
  };
  return [...obaly].sort((a, b) => misto(a) - misto(b));
}
