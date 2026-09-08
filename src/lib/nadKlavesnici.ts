// ⌨️ Aby bylo vidět, co se píše.
//
// Na telefonu vyjede klávesnice přes spodní polovinu displeje. Prohlížeč
// stránku sám neposune — políčko, do kterého se zrovna píše, tak často
// zůstane schované pod klávesnicí. U poznámky k zápisu stáčení to znamená
// psát naslepo.
//
// Řešení je záměrně malé: sleduje se `visualViewport` (to je ta část
// stránky, která po vyjetí klávesnice opravdu zůstane vidět) a když je
// zaostřené políčko pod její hranicí, stránka se o ten kus posune. Nic
// jiného modul nedělá — žádné zamykání rolování, žádné skrývání lišty.

/** Rezerva pod políčkem, ať nesedí přesně na hraně klávesnice. */
const REZERVA = 24;

/**
 * O kolik pixelů posunout stránku, aby bylo políčko celé vidět.
 *
 * Kladné číslo = rolovat dolů. Nula = políčko je vidět a nesahá se na to;
 * zbytečné posouvání při každém úhozu je horší než nic.
 *
 * `vrsekPrvku` je záporný, když políčko uteklo nad horní okraj — pak se
 * roluje nahoru (záporný výsledek).
 */
export function kolikPosunout(
  vrsekPrvku: number,
  spodekPrvku: number,
  vyskaViditelne: number,
  rezerva = REZERVA,
): number {
  // Pod klávesnicí: posunout tak, aby spodek políčka byl nad hranicí.
  if (spodekPrvku + rezerva > vyskaViditelne) {
    const chybi = spodekPrvku + rezerva - vyskaViditelne;
    // Nikdy neposouvat tak, aby vršek políčka utekl nad obrazovku —
    // u vysokého textového pole je důležitější vidět jeho začátek.
    return Math.min(chybi, Math.max(0, vrsekPrvku - rezerva));
  }
  // Nad horním okrajem (stalo se po zavření klávesnice a otočení displeje).
  if (vrsekPrvku < 0) return vrsekPrvku;
  return 0;
}

/** Píše se do tohohle prvku? */
export function jeZapisovaci(el: Element | null): boolean {
  if (!el) return false;
  const n = el.nodeName;
  if (n === 'TEXTAREA' || n === 'SELECT') return true;
  if (n === 'INPUT') {
    const typ = (el as HTMLInputElement).type;
    // Zaškrtávátka a tlačítka klávesnici nevyvolají.
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color'].includes(typ);
  }
  return (el as HTMLElement).isContentEditable === true;
}

let zapnuto = false;

/**
 * Zapne hlídání. Volá se jednou při startu aplikace (main.tsx).
 * Bez `visualViewport` (starší WebView) se nic neděje — chování zůstane
 * takové, jaké bylo.
 */
export function zapniPosunNadKlavesnici(): () => void {
  if (zapnuto) return () => {};
  const vv = typeof window !== 'undefined' ? window.visualViewport : undefined;
  if (!vv) return () => {};
  zapnuto = true;

  let casovac: ReturnType<typeof setTimeout> | null = null;

  const srovnej = () => {
    const el = document.activeElement;
    if (!jeZapisovaci(el)) return;
    const r = (el as HTMLElement).getBoundingClientRect();
    const posun = kolikPosunout(r.top, r.bottom, vv.height);
    if (posun === 0) return;
    // Rolování řeší nejbližší rolovatelný rodič sám — scrollBy na okně by
    // v aplikaci s vlastním rolovacím kontejnerem nic neudělalo.
    (el as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  // Klávesnice nevyjede hned; `resize` viditelné oblasti přijde až po ní.
  // Zpoždění po zaostření je pojistka pro prohlížeče, které `resize`
  // nepošlou (klávesnice tam překrývá stránku, místo aby ji zmenšila).
  const naZaostreni = () => {
    if (casovac) clearTimeout(casovac);
    casovac = setTimeout(srovnej, 350);
  };

  document.addEventListener('focusin', naZaostreni);
  vv.addEventListener('resize', srovnej);

  return () => {
    if (casovac) clearTimeout(casovac);
    document.removeEventListener('focusin', naZaostreni);
    vv.removeEventListener('resize', srovnej);
    zapnuto = false;
  };
}
