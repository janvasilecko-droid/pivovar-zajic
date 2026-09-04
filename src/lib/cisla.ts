/**
 * Jeden způsob, jak se v aplikaci píší čísla a jednotky.
 *
 * V přehledech se mísily litry, hektolitry a kusy, někde s jednotkou a někde
 * bez ní, někde na desetiny a někde na celá — a sloupec se pak nedá přeběhnout
 * okem. Nejhorší je jednotka, která chybí: „84" u tanku může být litr,
 * hektolitr i procento a člověk to musí hádat z okolí.
 *
 * PRAVIDLA:
 *  1. Jednotka se píše VŽDY. Číslo bez jednotky je v pivovaru past.
 *  2. Litry celé, hektolitry na desetiny. 0,5 hl je rozdíl, který se pozná;
 *     půl litru v tanku ne.
 *  3. Kusy jsou celé. Půl sudu neexistuje.
 *  4. Mezera před jednotkou je NEZLOMITELNÁ, aby „30 l" nezůstalo rozdělené
 *     na konci řádku.
 *  5. Tisíce se oddělují (`cs-CZ`), takže 12 000 l se pozná od 1 200 l na
 *     první pohled.
 *
 * Vedle toho patří na čísla v tabulkách třída `tabular-nums` (v CSS už je) —
 * bez ní se sloupec rozjede, protože číslice mají různou šířku.
 */

/** Nezlomitelná mezera — číslo a jednotka se nesmí rozejít na konec řádku. */
const MEZERA = ' ';

function naDesetiny(n: number, desetiny: number): string {
  return n.toLocaleString('cs-CZ', {
    minimumFractionDigits: desetiny,
    maximumFractionDigits: desetiny,
  });
}

/** Cokoliv nečitelného (null, text, NaN) se čte jako nula, ne jako „NaN". */
function cislo(hodnota: unknown): number {
  const n = typeof hodnota === 'number' ? hodnota : Number(hodnota);
  return Number.isFinite(n) ? n : 0;
}

/** Kusy — celá čísla. „12 ks" */
export function kusy(hodnota: unknown): string {
  return `${Math.round(cislo(hodnota)).toLocaleString('cs-CZ')}${MEZERA}ks`;
}

/** Litry — celé. „1 250 l" */
export function litry(hodnota: unknown): string {
  return `${Math.round(cislo(hodnota)).toLocaleString('cs-CZ')}${MEZERA}l`;
}

/** Hektolitry na desetiny. „12,5 hl" */
export function hektolitry(hodnota: unknown): string {
  return `${naDesetiny(cislo(hodnota), 1)}${MEZERA}hl`;
}

/** Litry přepočtené na hektolitry — jedno místo pro dělení stem. */
export function litryJakoHl(litruHodnota: unknown): string {
  return hektolitry(cislo(litruHodnota) / 100);
}

/** Korunys celými čísly. „1 250 Kč" */
export function koruny(hodnota: unknown): string {
  return `${Math.round(cislo(hodnota)).toLocaleString('cs-CZ')}${MEZERA}Kč`;
}

/** Procenta bez desetin. „62 %" */
export function procenta(hodnota: unknown): string {
  return `${Math.round(cislo(hodnota)).toLocaleString('cs-CZ')}${MEZERA}%`;
}

/**
 * Objem, který si sám vybere jednotku: pod 1000 l litry, nad hektolitry.
 * Pro dlaždice a souhrny, kde se nevejde „12 500 l", ale „125,0 hl" ano.
 */
export function objem(litruHodnota: unknown): string {
  const l = cislo(litruHodnota);
  return Math.abs(l) >= 1000 ? litryJakoHl(l) : litry(l);
}

/**
 * Znaménko se píše i u plusu — u rozdílu inventury je „+3 ks" jiná
 * informace než „3 ks" a bez znaménka se to plete s absolutním stavem.
 */
export function rozdilKusy(hodnota: unknown): string {
  const n = Math.round(cislo(hodnota));
  return `${n > 0 ? '+' : ''}${kusy(n)}`;
}

/**
 * České skloňování počtu: „1 vozidlo", „2 vozidla", „5 vozidel".
 *
 * Appka to doteď nedělala vůbec — v Knize jízd stálo „2 vozidel" a „1 jízd",
 * což je věta, kterou by nikdo v pivovaru nevyslovil. Tvary se předávají
 * jako trojice, protože v češtině nejde spočítat z čísla samotného, jak se
 * které slovo chová.
 *
 * @param tvary [pro 1, pro 2–4, pro 0 a 5+]
 */
export function mnozne(pocet: unknown, tvary: [string, string, string]): string {
  const n = Math.abs(Math.round(cislo(pocet)));
  const tvar = n === 1 ? tvary[0] : n >= 2 && n <= 4 ? tvary[1] : tvary[2];
  return `${Math.round(cislo(pocet)).toLocaleString('cs-CZ')}${MEZERA}${tvar}`;
}
