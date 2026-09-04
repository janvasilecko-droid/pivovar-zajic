/**
 * ✍️ Podpis převzetí prstem na displeji.
 *
 * Řidič dnes veze papír, na něm se podepisuje a papír se vrací do
 * pivovaru — takže dokud se nevrátí, není jak zjistit, co bylo doopravdy
 * převzato. Podpis na displeji je u objednávky hned.
 *
 * V tomhle modulu je jen to, co se dá spočítat a otestovat: sbírání bodů
 * tahu, poznání „tohle není podpis" a přepočet do plochy, ve které se
 * podpis kreslí zpátky. Samotné kreslení do canvasu je v komponentě.
 *
 * Dvě věci schválně:
 *
 *  - Prázdný podpis se ODMÍTÁ. Jedno klepnutí na plátno není podpis a
 *    uložit tečku jako doklad o převzetí je horší než nemít nic — u
 *    dohadování „to jsme nedostali" je taková tečka bezcenná.
 *  - Body se ředí. Prst na 60 Hz udělá stovky bodů na centimetr; bez
 *    ředění by podpis přerostl přes limit velikosti a nakreslený vypadá
 *    stejně.
 */

export type Bod = { x: number; y: number };
/** Jeden tah = od přiložení prstu do zvednutí. */
export type Tah = Bod[];

/** Menší posun než tohle (v px) se do tahu nepřidává. */
export const MIN_POSUN = 1.5;
/**
 * Strop velikosti uloženého obrázku. Podpis je černobílá čmáranice —
 * když PNG přeroste, je něco špatně (velké plátno, plná barva) a do
 * databáze se to posílat nemá.
 */
export const PODPIS_MAX_BAJTU = 200_000;
/** Kolik px „inkoustu" ještě není podpis, jen klepnutí nebo škrábnutí. */
export const MIN_DELKA_PODPISU = 40;

function vzdalenost(a: Bod, b: Bod): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Přidá bod do posledního tahu. Vrací NOVÉ pole (React state), a když je
 * bod moc blízko předchozímu, vrátí ho beze změny.
 */
export function pridejBod(tahy: Tah[], bod: Bod, minPosun = MIN_POSUN): Tah[] {
  if (tahy.length === 0) return [[bod]];
  const posledni = tahy[tahy.length - 1];
  const predchozi = posledni[posledni.length - 1];
  if (predchozi && vzdalenost(predchozi, bod) < minPosun) return tahy;
  return [...tahy.slice(0, -1), [...posledni, bod]];
}

/** Začne nový tah (zvednutí a nové přiložení prstu). */
export function novyTah(tahy: Tah[]): Tah[] {
  const posledni = tahy[tahy.length - 1];
  // Prázdný tah na konci by při dalším bodu vyrobil čáru odnikud.
  if (posledni && posledni.length === 0) return tahy;
  return [...tahy, []];
}

/** Celková délka nakreslené linky v px. */
export function delkaPodpisu(tahy: Tah[]): number {
  let d = 0;
  for (const tah of tahy) {
    for (let i = 1; i < tah.length; i += 1) d += vzdalenost(tah[i - 1], tah[i]);
  }
  return d;
}

/**
 * Je to podpis, nebo jen klepnutí? Tečka jako doklad o převzetí je
 * horší než nic.
 */
export function jePodpisPrazdny(tahy: Tah[], minDelka = MIN_DELKA_PODPISU): boolean {
  return delkaPodpisu(tahy) < minDelka;
}

/**
 * Přepočet bodů z plochy, ve které se kreslilo, do plochy, ve které se
 * kreslí zpátky (jiný telefon, tisk, náhled v detailu). Zachovává
 * proporce a podpis vystředí — roztažený podpis na šířku by u
 * dohadování o převzetí nebyl k ničemu.
 */
export function prepocitejNaPlochu(
  tahy: Tah[],
  zdroj: { sirka: number; vyska: number },
  cil: { sirka: number; vyska: number },
): Tah[] {
  if (zdroj.sirka <= 0 || zdroj.vyska <= 0) return tahy;
  const meritko = Math.min(cil.sirka / zdroj.sirka, cil.vyska / zdroj.vyska);
  const posunX = (cil.sirka - zdroj.sirka * meritko) / 2;
  const posunY = (cil.vyska - zdroj.vyska * meritko) / 2;
  return tahy.map((tah) => tah.map((b) => ({
    x: b.x * meritko + posunX,
    y: b.y * meritko + posunY,
  })));
}

/** Kolik bajtů zabere obrázek zapsaný jako data URL. */
export function velikostDataUrl(dataUrl: string): number {
  const carka = dataUrl.indexOf(',');
  if (carka < 0) return 0;
  const base64 = dataUrl.slice(carka + 1);
  const doplnky = (base64.match(/=+$/)?.[0].length) ?? 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - doplnky);
}

/** Projde obrázek do databáze? */
export function podpisJeMocVelky(dataUrl: string, max = PODPIS_MAX_BAJTU): boolean {
  return velikostDataUrl(dataUrl) > max;
}
