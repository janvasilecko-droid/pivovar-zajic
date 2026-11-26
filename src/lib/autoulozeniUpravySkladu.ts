// 💾 Úprava skladu se ukládá sama — pravidla, kdy smí a kdy ne.
// ---------------------------------------------------------------------------
// Majitel 26. 11. 2026: „…úprava skladu, z toho se to musí ukládat a počítat." Číslo napsané v Úpravě skladu
// (záložka Inventury, dřív „týdenní inventura") platí jako skutečný stav, jakmile je ULOŽENÉ — jenže se ukládalo
// jen tlačítkem a nula u Osmy 1 l se prostě neuložila. Teď se uloží samo, když člověk na chvilku přestane psát.
//
// Co se ukládá samo a co ne (správnost má přednost před pohodlím):
//  • Jen čísla zadaná v TOMHLE otevření obrazovky (psaní, Popořadě, sčítadlo). Počítání platí OD OKAMŽIKU uložení
//    (tydenniJakoInventura bere den uložení), takže číslo napsané před týdnem a dosud neuložené by se tichým uložením
//    přiřadilo dnešku a smazalo by všechno, co se mezitím stočilo. To zůstává na člověku: pruh a „Uložit vše".
//  • Ne při načítání, ne při jiném ukládání, ne když jsou čísla „Čeká se" z paměti telefonu nebo se nepodařilo načíst
//    aktuální stav (rozdíl uložený z nich by byl nepravdivý — stejná pojistka jako u tlačítka).
//  • Po selhání se nezkouší dokola: další pokus až po další změně čísla, nebo tlačítkem.
import type { TydenniRadek } from './tydenniInventura';

/** Jak dlouho po POSLEDNÍ změně čísla se napočítané uloží samo. Pod hranicí vnímání je to příliš rychle (uložila by se rozepsaná čísla), nad ní se čeká zbytečně. */
export const AUTOUKLADANI_MS = 2500;

type RadekPocitani = Pick<TydenniRadek, 'klic' | 'napocitano'>;

/** Napočítané řádky, které se liší od toho, co je v databázi (nebo tam nejsou). Nula je napočítaná stejně jako pět. */
export function radkyNeulozene<R extends RadekPocitani>(radky: R[], ulozene: ReadonlyMap<string, number>): R[] {
  return radky.filter((r) => r.napocitano !== null && ulozene.get(r.klic) !== r.napocitano);
}

export type RozdeleniNeulozenych<R> = {
  /** Zadané v tomhle otevření obrazovky — smí se uložit samo. */
  cerstve: R[];
  /** Zbylé z dřívějška (koncept z paměti telefonu) — samo se neukládá. */
  starsi: R[];
};

export function rozdelNeulozene<R extends RadekPocitani>(neulozene: R[], cerstveKlice: ReadonlySet<string>): RozdeleniNeulozenych<R> {
  return {
    cerstve: neulozene.filter((r) => cerstveKlice.has(r.klic)),
    starsi: neulozene.filter((r) => !cerstveKlice.has(r.klic)),
  };
}

export type DuvodBlokace = 'nacita' | 'uklada' | 'z-pameti' | 'chyba-nacteni' | 'chyba-ulozeni';

/** Proč se teď samo neukládá; `null` = smí. */
export function duvodBlokace(s: {
  maKnihu: boolean;
  bezi: boolean;
  uklada: boolean;
  zPameti: boolean;
  chybaNacteni: boolean;
  selhaloUlozeni: boolean;
}): DuvodBlokace | null {
  if (!s.maKnihu || s.bezi) return 'nacita';
  if (s.uklada) return 'uklada';
  if (s.zPameti) return 'z-pameti';
  if (s.chybaNacteni) return 'chyba-nacteni';
  if (s.selhaloUlozeni) return 'chyba-ulozeni';
  return null;
}

/** Česká množná čísla: 1 položka, 2–4 položky, 5 a víc položek. */
export function polozek(n: number): string {
  return `${n} ${n === 1 ? 'položka' : n < 5 ? 'položky' : 'položek'}`;
}

/**
 * Věty žlutého pruhu nad počítáním. Prázdné pole = není co hlásit.
 * `cerstve` čekají na samočinné uložení, `starsi` ne (viz výš). Věty jsou psané „štítkem“ („Čeká na uložení: 2 položky“),
 * ať se shoda s počtem (1 položka, 2 položky, 5 položek) nemusí tahat přes celou větu.
 */
export function vetyPruhu(p: { cerstve: number; starsi: number; blokace: DuvodBlokace | null }): string[] {
  const vety: string[] = [];
  const nepocitaji = 'Sklad ani Rozbor s tím zatím nepočítají.';
  if (p.cerstve > 0) {
    switch (p.blokace) {
      case 'z-pameti':
        vety.push(`Napočítáno, ale neuloženo: ${polozek(p.cerstve)}. Samo se to neuloží, protože čísla „Čeká se“ jsou z paměti telefonu — klepni na „Načíst znovu“ a pak na „Uložit vše“. ${nepocitaji}`);
        break;
      case 'chyba-nacteni':
        vety.push(`Napočítáno, ale neuloženo: ${polozek(p.cerstve)}. Samo se to neuloží, protože se nepodařilo načíst aktuální stav — klepni na „Načíst znovu“ a pak na „Uložit vše“. ${nepocitaji}`);
        break;
      case 'chyba-ulozeni':
        vety.push(`Napočítáno, ale neuloženo: ${polozek(p.cerstve)} — automatické uložení se nepovedlo. Klepni na „Uložit vše“. ${nepocitaji}`);
        break;
      default:
        vety.push(`Čeká na uložení: ${polozek(p.cerstve)} — uloží se samo za chvilku (nebo klepni na „Uložit vše“). ${nepocitaji}`);
    }
  }
  if (p.starsi > 0) {
    vety.push(`Napočítáno dřív a neuloženo: ${polozek(p.starsi)}. Čísla leží jen v tomhle zařízení a sama se neuloží (platila by až od dneška). Zkontroluj je a klepni na „Uložit vše“, nebo je přepiš. Sklad ani Rozbor s tím nepočítají.`);
  }
  return vety;
}
