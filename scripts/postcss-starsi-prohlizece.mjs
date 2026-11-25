/**
 * 🩹 PostCSS: výsledné CSS bez funkcí, které starší Android WebView (Chrome pod 88) nezná.
 *
 * Šéfovi nejde appka na starším telefonu s Androidem (25. 11. 2026). Z hotového sestavení se změřilo
 * (nástroj doiuse), co je ve CSS pro starý prohlížeč past. Největší byl tmavý režim: Tailwind 3.4 píše
 * každou třídu `dark:` jako `.dark\:bg-x:is(.dark *)`, a `:is()` umí Chrome až od 88. Starší prohlížeč
 * pravidlo, kterému nerozumí, zahodí CELÉ — všech 44 tříd `dark:` v aplikaci by v tmavém režimu
 * vypadlo a zůstala by směs světlých a tmavých barev.
 *
 * Co plugin dělá: každé `X:is(.dark *)` přepíše na `.dark X`. Je to totéž:
 *  • třída `.dark` je v aplikaci vždycky na <html> (lib/theme.ts), tedy předek všeho — `:is(.dark *)` i
 *    `.dark …` vybere stejné prvky;
 *  • specifičnost zůstává stejná (0,2,0), takže pořadí a přebíjení pravidel se nemění.
 *
 * Proč plugin a ne `darkMode: ['variant', '.dark &']` v tailwind.config.js: Tailwind při volbě „variant“
 * přesune pravidla `dark:` za všechny responzivní (`sm:`, `md:`…). Dvojice jako `dark:bg-a sm:dark:bg-b` by pak
 * přestala fungovat, protože by pozdější pravidlo `dark:` přebilo `sm:dark:`. Přepis selektoru na místě
 * pořadí nechává.
 *
 * Pravidla, která mají `:is()` jinak (ruční pravidlo v index.css se seznamem tříd), se nemění — jejich rozbalení
 * by dalo stovky selektorů kvůli jednomu kontrastu v tmavém režimu na starém telefonu.
 *
 * Testy: src/lib/postcssStarsiProhlizece.test.ts.
 */

/** Přesně takhle píše Tailwind 3.4 selektor tmavé varianty (`darkMode: 'class'`). */
const TMAVA_IS = ':is(.dark *)';

/** @returns {import('postcss').Plugin} */
export default function starsiProhlizece() {
  return {
    postcssPlugin: 'starsi-prohlizece',
    Rule(rule) {
      if (!rule.selector.includes(TMAVA_IS)) return;
      rule.selectors = rule.selectors.map((s) => (s.includes(TMAVA_IS) ? `.dark ${s.split(TMAVA_IS).join('')}` : s));
    },
  };
}
starsiProhlizece.postcss = true;
