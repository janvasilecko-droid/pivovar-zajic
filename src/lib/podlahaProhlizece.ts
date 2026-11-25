/**
 * 📱 Podlaha prohlížeče — nejstarší Chrome / WebView, na kterém se aplikace spustí, a od jaké verze
 * vypadá i se chová jako na novém telefonu.
 *
 * Proč to je zapsané na jednom místě: šéfovi nejde aplikace na starším telefonu s Androidem (25. 11. 2026) a
 * nikdo nevěděl, kde je hranice. Změřilo se to z hotového sestavení (nástroje es-check, doiuse a údaje MDN
 * o podpoře funkcí v prohlížečích):
 *
 *  • Syntaxe JavaScriptu je ES2015 + dynamický `import()` (vite.config.ts → build.target = 'es2015').
 *    Nejstarší Chrome, který ji rozebere, je 64 (regulární výraz s `\p{L}` v Objednávkách).
 *  • Moduly `<script type="module">` umí Chrome 61, dynamický import 63, `AbortController` (supabase-js
 *    ho volá při každém dotazu s časovým limitem) až 66. Pod 66 se tedy aplikace nespustí = PODLAHA.
 *  • Novější funkce, které kód volá bez zálohy (crypto.randomUUID 92, replaceChildren 86, Object.fromEntries
 *    a String.matchAll 73, Array.flat a flatMap 69, globalThis a queueMicrotask 71, Object.hasOwn 93),
 *    doplňují záplaty v index.html — díky nim jede aplikace od Chromu 66.
 *  • CSS: mezery v řádcích `gap` umí Chrome 84, `:is()` 88, `dvh` 108, `:has()` 105. Pod 90 se proto
 *    vzhled může lišit (zálohy jsou v tailwind.config.js a index.css). Od 90 je vzhled stejný jako na novém.
 *
 * Čísla jsou i v public/diagnostika.html (ten je samostatný soubor bez importů) — hlídá to
 * src/lib/diagnostika.test.ts. Kdo novým kódem podlahu zvedne (typicky novou funkcí prohlížeče), musí ji
 * zvednout tady, v diagnostice a v textech pro uživatele; hlídač src/lib/podlahaProhlizece.test.ts mu
 * novou funkci vytkne dřív, než se dostane na starý telefon.
 */

/** Nejstarší Chrome / WebView, na kterém se aplikace spustí. */
export const PODLAHA_CHROME = 66;

/** Od této verze vypadá a chová se aplikace jako na novém telefonu. */
export const DOPORUCENO_CHROME = 90;

/** Verze Chromu (i WebView) z řetězce prohlížeče; `null`, když to Chromium není (Firefox, Safari…). */
export function verzeChromu(ua: string): number | null {
  const m = /Chrom(?:e|ium)\/(\d+)/.exec(ua);
  return m ? parseInt(m[1], 10) : null;
}

export type StavProhlizece = 'neznamy' | 'nepodporovany' | 'stary' | 'v-poradku';

/**
 * Jak na tom prohlížeč je:
 *  • `nepodporovany` — pod podlahou, aplikace se nespustí;
 *  • `stary` — poběží, ale vzhled a chování se mohou lišit, doporučuje se aktualizace;
 *  • `v-poradku` — od doporučené verze výš;
 *  • `neznamy` — není to Chromium (verzi neznáme, nic neodhadujeme).
 */
export function stavProhlizece(ua: string): StavProhlizece {
  const v = verzeChromu(ua);
  if (v === null) return 'neznamy';
  if (v < PODLAHA_CHROME) return 'nepodporovany';
  if (v < DOPORUCENO_CHROME) return 'stary';
  return 'v-poradku';
}
