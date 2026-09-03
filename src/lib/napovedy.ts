/**
 * Jednorázové nápovědy — „ukaž to jednou a už nikdy".
 *
 * V appce jsou dvě věci, které se nedají uhádnout: přidržením dlaždice se
 * otevřou rychlé akce a tahem dolů se otevře hledání. Obojí se používá denně
 * a obojí bylo dosud objevitelné jen náhodou.
 *
 * Nápověda se schválně ukazuje JEN JEDNOU a zavírá se klepnutím. Trvalý
 * pruh s tipem je po druhém dni šum, který lidi přeskakují očima — a
 * zabíral by místo přesně tam, kde ho je nejmíň (nad dlaždicemi).
 */

/** Nápovědy, které appka umí ukázat. Řetězce jdou do localStorage — neměnit. */
export type NapovedaId = 'plocha-gesta';

const PREDPONA = 'pivovar_napoveda_';

/** Minimální rozhraní úložiště — v testu se dá podstrčit obyčejná mapa. */
export type UlozisteNapoved = Pick<Storage, 'getItem' | 'setItem'>;

function vychoziUloziste(): UlozisteNapoved | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Prohlížeč s vypnutými cookies/úložištěm (nebo privátní režim Safari)
    // na `localStorage` hodí výjimku už při přístupu.
    return null;
  }
}

/**
 * Má se nápověda zobrazit? Když se úložiště nedá přečíst, vrací `true` —
 * radši tip ukázat znovu, než ho zamknout kvůli chybě úložiště.
 */
export function maSeZobrazit(id: NapovedaId, uloziste?: UlozisteNapoved | null): boolean {
  const store = uloziste === undefined ? vychoziUloziste() : uloziste;
  if (!store) return true;
  try {
    return store.getItem(PREDPONA + id) !== 'videno';
  } catch {
    return true;
  }
}

/** Zapíše, že nápovědu už uživatel viděl. Chyba úložiště se spolkne. */
export function oznacZobrazenou(id: NapovedaId, uloziste?: UlozisteNapoved | null): void {
  const store = uloziste === undefined ? vychoziUloziste() : uloziste;
  if (!store) return;
  try {
    store.setItem(PREDPONA + id, 'videno');
  } catch {
    // Plné nebo zamčené úložiště nesmí shodit obrazovku — nápověda se
    // v nejhorším ukáže i příště.
  }
}
