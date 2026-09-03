/**
 * Gesta na ploše (launcheru) — rozhodovací pravidla oddělená od DOM.
 *
 * Proč vlastní modul: pravidla gest se dají zkazit jedním překlepem ve
 * znaménku a v prohlížeči se to pozná jen tím, že „appka ujela sama".
 * Tady se to dá napsat jako tabulka vstup → výsledek a otestovat.
 *
 * Souřadnice jsou vždy `client*` (od okna), stejně jako je posílají
 * pointer události.
 */

/** Co má gesto na ploše udělat. */
export type GestoPlochy = 'stranka-dalsi' | 'stranka-predchozi' | 'hledat' | null;

/** Kolik pixelů musí prst ujet do strany, aby to bylo přetočení stránky. */
export const PRAH_STRANKY_PX = 50;
/** Kolik pixelů musí prst stáhnout dolů, aby se otevřelo hledání. */
export const PRAH_TAHU_DOLU_PX = 70;

/**
 * Vyhodnotí dokončené gesto nad plochou.
 *
 * `naVrcholu` = obsah je odrolovaný úplně nahoru. Bez téhle podmínky by tah
 * dolů uprostřed dlouhé plochy znamenal „chci rolovat", a místo toho by
 * vyskočilo hledání.
 *
 * Poměr 1.5 je schválně nesymetrický: cokoliv, co je jasně vodorovné, má
 * přednost, protože přetáčení stránek je nejčastější pohyb na ploše.
 */
export function vyhodnotGesto(
  dx: number,
  dy: number,
  naVrcholu: boolean,
): GestoPlochy {
  const vodorovne = Math.abs(dx);
  const svisle = Math.abs(dy);
  if (vodorovne >= PRAH_STRANKY_PX && vodorovne >= svisle * 1.5) {
    return dx < 0 ? 'stranka-dalsi' : 'stranka-predchozi';
  }
  if (naVrcholu && dy >= PRAH_TAHU_DOLU_PX && svisle >= vodorovne * 1.5) {
    return 'hledat';
  }
  return null;
}

/** Jak vysoký je u vodorovné hrany pruh, ve kterém se plocha sama posouvá (px). */
export const VYSKA_OKRAJE_PX = 72;
/** Nejvyšší rychlost samoposunu (px na snímek, tedy ~60× za sekundu). */
export const MAX_POSUN_PX = 16;

/**
 * Rychlost samoposunu při tažení dlaždice u horní/dolní hrany.
 *
 * V edit módu mají dlaždice `touch-action: none` (jinak si prohlížeč vezme
 * gesto na scroll a tažení nefunguje) — a tím se s dlaždicí v ruce nedá
 * dostat na část plochy pod displejem. Vodorovný dvojník už v appce je
 * (držení u levého/pravého kraje přetáčí stránky, viz okrajProPrepnuti
 * v homeLayout.ts); tohle je totéž pro svislý směr.
 *
 * Vrací px na snímek: záporné = nahoru, kladné = dolů, 0 = nikam.
 * Rychlost roste s tím, jak hluboko v pruhu prst je — u samé hrany je plná,
 * na jejím okraji téměř nulová, takže se posun dá dávkovat prstem a
 * nepřestřelí se.
 */
export function rychlostPosunu(
  clientY: number,
  rect: { top: number; bottom: number },
  vyskaZony: number = VYSKA_OKRAJE_PX,
  maxPx: number = MAX_POSUN_PX,
): number {
  if (vyskaZony <= 0) return 0;
  // Na nízkém výřezu (rozdělená obrazovka, klávesnice přes půl displeje) by
  // se obě zóny potkaly a plocha by se posouvala i uprostřed. Zóna proto
  // nikdy nezabere víc než třetinu výšky — mezi nimi zůstane klidné pásmo.
  const zona = Math.min(vyskaZony, (rect.bottom - rect.top) / 3);
  if (zona <= 0) return 0;
  const doHorni = clientY - rect.top;
  if (doHorni < zona) {
    // Podíl 0 (na okraji zóny) … 1 (na hraně i za ní)
    const podil = Math.min(1, Math.max(0, (zona - doHorni) / zona));
    return -Math.round(podil * maxPx);
  }
  const doDolni = rect.bottom - clientY;
  if (doDolni < zona) {
    const podil = Math.min(1, Math.max(0, (zona - doDolni) / zona));
    return Math.round(podil * maxPx);
  }
  return 0;
}
