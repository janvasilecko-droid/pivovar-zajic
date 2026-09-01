// 📌 Udržení pozice na obrazovce přes přenačtení dat.
// ---------------------------------------------------------------------------
// Inventura se srovnává odshora dolů, pivo po pivu. Po každém zápisu se data
// přenačtou a obsah NAD místem, kde člověk kouká, se scvrkne — zelený panel
// „dopočet lahví na sudy" zmizí, protože už není co srovnávat, a u srovnaného
// řádku zmizí tlačítko. Prohlížeč přitom drží scrollTop (kolik je odrolováno),
// ne obsah. Všechno pod tím tedy vyskočí nahoru o výšku toho, co zmizelo, a
// člověk najednou kouká na úplně jiné pivo, než u kterého klikal. Vypadá to,
// jako by se stránka „aktualizovala".
//
// Řešení je KOTVA: před zápisem se změří, kde na obrazovce leží řádek, u
// kterého se klikalo. Po překreslení se scroll posune přesně o ten rozdíl,
// takže řádek zůstane na stejném místě, i když nad ním kus obsahu zmizel.
//
// Proč ne scrollIntoView: to řádek přisune k okraji (nebo doprostřed) a
// obrazovka se zase hne. Cílem je, aby se nehnula VŮBEC.

/** Rozdíl, který se ještě nevyplatí dorovnávat (pod pixel je to šum měření). */
const PRAH_PX = 1;

/**
 * Je prvek doopravdy vidět? Rozhoduje výška podle rozložení, ne CSS třídy.
 *
 * Inventura vykresluje KAŽDÝ řádek dvakrát — jednou jako mobilní kartu a
 * jednou jako řádek tabulky; jedna z dvojice je vždycky schovaná přes
 * `md:hidden` / `hidden md:block`. Obě mají stejnou kotvu, takže prosté
 * querySelector() by na počítači sáhlo po schované mobilní kartě. Ta má
 * rozměry samé nuly, posun by vyšel nula a obrazovka by odskočila dál.
 */
function jeVidet(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.height > 0 || r.width > 0;
}

/**
 * Vrátí tu z vykreslených kopií kotvy, která je zrovna vidět.
 * Když není vidět ani jedna, vrací null — to je pokyn nedělat nic.
 */
export function najdiKotvu(selektor: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const vsechny = Array.from(document.querySelectorAll(selektor)) as HTMLElement[];
  return vsechny.find(jeVidet) ?? null;
}

/**
 * Najde prvek, který se doopravdy roluje. V Layoutu to není okno, ale
 * `div.flex-1.overflow-y-auto` kolem obsahu stránky — kdyby se posouvalo okno,
 * neudělalo by to nic.
 */
export function najdiScroller(el: Element | null): Element | null {
  let n: Element | null = el?.parentElement ?? null;
  while (n) {
    const styl = typeof getComputedStyle === 'function' ? getComputedStyle(n as HTMLElement) : null;
    const overflow = styl?.overflowY ?? '';
    if ((overflow === 'auto' || overflow === 'scroll') && n.scrollHeight > n.clientHeight) return n;
    n = n.parentElement;
  }
  return typeof document !== 'undefined' ? document.scrollingElement : null;
}

/**
 * O kolik posunout scroll, aby kotva zůstala tam, kde byla.
 *
 * Kladné číslo = kotva se posunula dolů, roluje se dolů za ní. Když je rozdíl
 * pod pixel, vrací 0 — posouvat kvůli zaokrouhlení by jen blikalo.
 */
export function posunPodleKotvy(predTop: number, poTop: number): number {
  const posun = poTop - predTop;
  return Math.abs(posun) < PRAH_PX ? 0 : posun;
}

/** Počká, až React překreslí A prohlížeč spočítá rozložení. */
function poPrekresleni(fn: () => void) {
  if (typeof requestAnimationFrame !== 'function') { setTimeout(fn, 0); return; }
  // Dvě snímková okna schválně: první nechá React commitnout změnu, druhé
  // počká, než se dopočítá nová výška. Po jednom se měří ještě stará a posun
  // vyjde nula.
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/**
 * Zapamatuje si, kde na obrazovce leží prvek podle selektoru, a vrátí funkci,
 * která ho tam po překreslení vrátí.
 *
 * Volá se těsně před zápisem a výsledek se zavolá po `loadData()`:
 * ```
 * const vratPozici = zapamatujPozici(`[data-inv-radek="${k}"]`);
 * await loadData(true);
 * vratPozici();
 * ```
 *
 * Když kotva neexistuje (ani před, ani po), nedělá nic — radši nechat scroll
 * být než ho posunout podle špatného prvku.
 */
export function zapamatujPozici(selektor: string): () => void {
  if (typeof document === 'undefined') return () => {};
  const el = najdiKotvu(selektor);
  if (!el) return () => {};
  const scroller = najdiScroller(el);
  if (!scroller) return () => {};
  const predTop = el.getBoundingClientRect().top;

  return () => {
    poPrekresleni(() => {
      const znovu = najdiKotvu(selektor);
      if (!znovu) return; // řádek mezitím zmizel — není podle čeho rovnat
      const posun = posunPodleKotvy(predTop, znovu.getBoundingClientRect().top);
      if (posun !== 0) scroller.scrollTop += posun;
    });
  };
}
