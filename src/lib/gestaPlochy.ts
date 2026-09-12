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

/**
 * O kolik se smí prst pohnout, než se PODRŽENÍ dlaždice vzdá.
 *
 * Z provozu: „udělej, aby se dlaždice přesouvaly jen když na nich přidržím
 * prst, ne jen přejetím." Dřív stačilo 6 px pohybu a dlaždice se zvedla —
 * takže přejetí přes plochu (listování, rolování) ji vzalo s sebou a
 * rozložení se rozházelo, aniž by o to kdo stál.
 *
 * Větší než přirozený třes prstu (pár px), menší než pohyb, kterým se listuje.
 */
export const PRAH_ZRUSENI_PODRZENI_PX = 10;

/** Co se má stát s dotykem na dlaždici, dokud se drží. */
export type StavPodrzeni = 'ceka' | 'zrusit';

/**
 * Drží prst pořád dost na místě, aby se z toho stalo zvednutí dlaždice?
 *
 * Vrací `'zrusit'`, jakmile se prst rozjede — tím se dotyk pustí a postará se
 * o něj listování stránek. Samotné zvednutí řídí časovač, ne tahle funkce:
 * ta jen říká, kdy už to podržení není.
 */
export function stavPodrzeni(dx: number, dy: number): StavPodrzeni {
  return Math.hypot(dx, dy) > PRAH_ZRUSENI_PODRZENI_PX ? 'zrusit' : 'ceka';
}

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

/**
 * Začíná gesto uvnitř něčeho, co se samo posouvá do stran?
 *
 * Na ploše jsou vodorovné pásky (záložky, řada upozornění) a jejich
 * odrolování prstem vypadá úplně stejně jako přejetí přes plochu — takže
 * se místo posunutí pásku přetočila celá stránka launcheru. Tady se od
 * místa dotyku jde nahoru po rodičích a hledá se prvek, který má obsah
 * širší než sebe a smí se v něm rolovat. Když se najde, plocha gesto
 * pouští.
 *
 * `zjistiOverflow` je vstřícnost k testům — v prohlížeči se dosadí
 * `getComputedStyle`.
 */
export function jeVeVodorovnemPasku(
  start: Element | null,
  konec: Element | null,
  zjistiOverflow: (el: Element) => string,
): boolean {
  let el: Element | null = start;
  while (el) {
    const siroky = el.scrollWidth > el.clientWidth + 4;
    if (siroky && /auto|scroll/.test(zjistiOverflow(el))) return true;
    if (el === konec) break;
    el = el.parentElement;
  }
  return false;
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
