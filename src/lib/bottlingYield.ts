// 🍾 Výtěžnost stáčení do lahví — kolik sudů padne na nastáčené lahve.
// ---------------------------------------------------------------------------
// Při lahvování se část piva ztratí (propláchnutí, pěna, zbytek v hadicích,
// nedolité kusy). V provozu to vychází zhruba na 10 %, tedy z 50l sudu je
// 45 × 1l PET. Vzorec proto počítá: nalahvované litry ÷ 0,9 = litry, které
// se musely ze sudů vzít.
//
// Slouží k DOPOČTU, ne k přepisování — kolik sudů se opravdu načalo ví
// jenom stáčeč, takže se výsledek vždycky nabízí jako návrh, který jde
// přepsat.

/** Podíl piva, který se ze sudu skutečně dostane do lahví. Zbytek je ztráta. */
export const VYTEZNOST_LAHVOVANI = 0.9;

/** Jedna položka zápisu: obal × počet kusů. */
export type LahvovaPolozka = { volumeL: number; qty: number };

/** Kolik litrů piva je v nastáčených lahvích. */
export function nalahvovaneLitry(polozky: LahvovaPolozka[]): number {
  return polozky.reduce((s, p) => {
    const v = Number(p.volumeL) || 0;
    const q = Number(p.qty) || 0;
    return v > 0 && q > 0 ? s + v * q : s;
  }, 0);
}

/**
 * Kolik litrů se muselo vzít ze sudů, aby z nich vzniklo `nalahvovanoL`
 * litrů v lahvích. Zaokrouhleno na desetinu litru — přesnější číslo nemá
 * v provozu smysl a jen by v UI dělalo nečitelné ocasy.
 */
export function zdrojoveLitry(nalahvovanoL: number, vytecnost = VYTEZNOST_LAHVOVANI): number {
  if (!(nalahvovanoL > 0) || !(vytecnost > 0)) return 0;
  return Math.round((nalahvovanoL / vytecnost) * 10) / 10;
}

/**
 * Skutečná výtrata v % — z ROZDÍLU mezi tím, co se doopravdy vzalo ze sudů
 * (podle zapsaného počtu kusů sudů), a tím, co se doopravdy nastáčelo do
 * lahví. Na rozdíl od `zdrojoveLitry` výš (dopočet TEORETICKÝM koeficientem
 * `VYTEZNOST_LAHVOVANI` při návrhu) počítá zpětně ze skutečně zapsaných
 * sudů — kolik se v provozu u tyhle šarže doopravdy ztratilo.
 *
 * Zadání z 19. 9. 2026: „u každého sudu bude navíc údaj stočeno litrů a
 * výtrata v %."
 *
 * `null`, když není co počítat (žádný zdroj nebo nulové litry) — ať to UI
 * pozná a údaj radši schová, než aby ukázalo nesmyslné číslo.
 */
export function skutecnaVytrataProcenta(nalahvovanoL: number, zdrojSkutecneL: number): number | null {
  if (!(nalahvovanoL > 0) || !(zdrojSkutecneL > 0)) return null;
  return Math.round((1 - nalahvovanoL / zdrojSkutecneL) * 1000) / 10;
}

export type NavrhSudu = {
  /** Litry v lahvích. */
  nalahvovanoL: number;
  /** Litry, které se musely vzít ze sudů (včetně ztráty). */
  zdrojL: number;
  /** Kolik sudů to je přesně, i s desetinami — pro popisek. */
  sudyPresne: number;
  /** Návrh počtu sudů k zapsání: zaokrouhlený nahoru, načatý sud se počítá celý. */
  sudy: number;
};

/**
 * Návrh, kolik sudů dané velikosti zapsat jako zdroj.
 *
 * Zaokrouhluje se NAHORU: jakmile se sud načne, je ze skladu pryč celý, i
 * když v něm zbyde. Přesná hodnota se vrací zvlášť, ať jde v UI ukázat,
 * o kolik se návrh liší od výpočtu, a stáčeč si ho mohl opravit.
 */
export function navrhSudu(
  polozky: LahvovaPolozka[],
  objemSuduL: number,
  vytecnost = VYTEZNOST_LAHVOVANI,
): NavrhSudu | null {
  const nalahvovanoL = nalahvovaneLitry(polozky);
  if (!(nalahvovanoL > 0) || !(objemSuduL > 0)) return null;
  const zdrojL = zdrojoveLitry(nalahvovanoL, vytecnost);
  const sudyPresne = zdrojL / objemSuduL;
  return {
    nalahvovanoL: Math.round(nalahvovanoL * 10) / 10,
    zdrojL,
    sudyPresne: Math.round(sudyPresne * 100) / 100,
    sudy: Math.ceil(sudyPresne - 0.001),
  };
}
