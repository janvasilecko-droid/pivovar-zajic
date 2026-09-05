#!/usr/bin/env node
/**
 * 👆 Hlídač velikosti dotykových cílů.
 *
 * Aplikace se ovládá hlavně na telefonu, často v rukavicích a mokrýma
 * rukama. Doporučená nejmenší plocha je 44 px a appka to na dvou místech
 * hlídá sama: `.btn` má `min-h-[44px]` a `index.css` to na mobilu vynucuje
 * i pro `input` a `select`. Na HOLÉ `<button>` ale žádné takové pravidlo
 * nesahá — a právě těch bylo 5. 9. 2026 v aplikaci 312 s odsazením `py-1`
 * a menším, nejvíc v Lahvích, KEGu, Objednávkách a Závozu.
 *
 * Lék je třída `.tap` (index.css): přidá 6 px neviditelné plochy na každou
 * stranu přes `::after`, takže z 24px cíle je 36px a z 32px 44px — a
 * ROZLOŽENÍ SE NEZMĚNÍ. Proto se dá nasadit i do hustých řádků v tabulkách.
 *
 * Kontrola hlásí jen ZHORŠENÍ proti základu níž, stejně jako
 * `zkontroluj-tlacitka.mjs` — jinak by u každého commitu vypisovala
 * výjimky, které jsou v pořádku.
 *
 * Použití:
 *   node scripts/zkontroluj-dotyk.mjs           kontrola (CI)
 *   node scripts/zkontroluj-dotyk.mjs --vypis   vypíše, co kde je
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Kolik tlačítek smí zůstat bez zaručených 44 px.
 *
 * Základ po převodu 5. 9. 2026: 4. Zbývají čtyři ovládací prvky editoru
 * plochy (dlaždice mají vlastní vizuální jazyk i vlastní velikosti, viz
 * HomeScreen.css). Číslo se smí jen SNIŽOVAT.
 */
const ZAKLAD = 4;

/** Co dává jistotu ≥44 px, nebo je to záměrně malý cíl se zvětšenou plochou. */
const BEZPECNE = [
  /\bbtn\b/, /btn-/, /\btap\b/, /nav-tab/,
  /min-h-\[4[4-9]px\]/, /min-h-\[[5-9][0-9]px\]/,
  /\bh-1[1-9]\b/, /\bh-2[0-9]\b/, /aspect-square/,
];
/** Známky malého cíle. */
const MALE = [/\bpy-(0|0\.5|1|1\.5)\b/, /\bh-([5-9]|10)\b/, /\bp-(0|0\.5|1|1\.5)\b/];

function soubory(dir) {
  const out = [];
  for (const jmeno of readdirSync(dir)) {
    const cesta = join(dir, jmeno);
    if (statSync(cesta).isDirectory()) { out.push(...soubory(cesta)); continue; }
    if (!/\.tsx$/.test(jmeno) || /\.test\.tsx$/.test(jmeno)) continue;
    out.push(cesta);
  }
  return out;
}

/**
 * Najde otevírací značku `<button …>`. Regulárkou to nejde — `onClick={() =>
 * del(x)}` obsahuje `>` z tlusté šipky, takže se čte znak po znaku
 * s hlídáním hloubky `{}` a řetězců. Stejný postup jako
 * `zkontroluj-tlacitka.mjs`; kdyby se měnil, má se změnit na obou místech.
 */
function znacky(zdroj) {
  const out = [];
  let i = 0;
  while ((i = zdroj.indexOf('<button', i)) !== -1) {
    let j = i + 7, hloubka = 0, retezec = null;
    for (; j < zdroj.length; j++) {
      const c = zdroj[j];
      if (retezec) { if (c === retezec && zdroj[j - 1] !== '\\') retezec = null; continue; }
      if (c === '"' || c === "'" || c === '`') { retezec = c; continue; }
      if (c === '{') hloubka++;
      else if (c === '}') hloubka--;
      else if (c === '>' && hloubka === 0) break;
    }
    out.push({ znacka: zdroj.slice(i, j + 1), radek: zdroj.slice(0, i).split('\n').length });
    i = j + 1;
  }
  return out;
}

const nalezy = [];
for (const soubor of soubory(join(KOREN, 'src'))) {
  const zdroj = readFileSync(soubor, 'utf8');
  for (const { znacka, radek } of znacky(zdroj)) {
    const m = znacka.match(/className=(?:"([^"]*)"|\{`([\s\S]*?)`\}|\{([^}]*)\})/);
    const cls = (m ? (m[1] || m[2] || m[3]) : '') || '';
    if (BEZPECNE.some((r) => r.test(cls))) continue;
    if (!MALE.some((r) => r.test(cls))) continue;
    nalezy.push(`${relative(KOREN, soubor)}:${radek}`);
  }
}

if (process.argv.includes('--vypis')) {
  nalezy.forEach((n) => console.log(n));
}

if (nalezy.length > ZAKLAD) {
  console.error(
    `Dotykové cíle: ${nalezy.length} tlačítek bez zaručených 44 px, základ je ${ZAKLAD}.\n` +
    'Přidej jim třídu `tap` — zvětší dotykovou plochu o 6 px na každou stranu\n' +
    'a rozložení nechá být. Výpis: node scripts/zkontroluj-dotyk.mjs --vypis',
  );
  process.exit(1);
}

console.log(
  nalezy.length < ZAKLAD
    ? `Dotykové cíle: ${nalezy.length} (základ ${ZAKLAD}) — sniž ZAKLAD ve skriptu.`
    : `Dotykové cíle: bez zhoršení (${nalezy.length} výjimek).`,
);
