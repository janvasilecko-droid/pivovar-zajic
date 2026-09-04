#!/usr/bin/env node
/**
 * 🎨 Hlídač jednotného vzhledu tlačítek.
 *
 * Aplikace má vlastní systém rolí (`.btn-primary`, `.btn-ghost`,
 * `.btn-emerald`, `.btn-danger`, `.btn-pocet` — viz src/index.css a
 * docs/jednotny-styl.md), ale 4. 9. 2026 ho používalo jen 179 z 1044
 * tlačítek. Zbytek si barvu maloval sám, ve čtrnácti různých odstínech —
 * odtud „vidím tři čtyři druhy stylů".
 *
 * Přepsat 865 tlačítek naráz je nejlepší způsob, jak appku položit. Tahle
 * kontrola proto NEHLÁSÍ dluh, který už existuje — hlásí, když se dluh
 * ZVĚTŠÍ. Výchozí stav je uložený ve scripts/tlacitka-zaklad.json a
 * převádí se po obrazovkách; každá obrazovka snižuje své číslo.
 *
 * Použití:
 *   node scripts/zkontroluj-tlacitka.mjs            kontrola (CI, pre-commit)
 *   node scripts/zkontroluj-tlacitka.mjs --vypis    vypíše, co kde je
 *   node scripts/zkontroluj-tlacitka.mjs --uloz     přepíše základ (po převodu)
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const KOREN = new URL('..', import.meta.url).pathname;
const ZAKLAD = join(KOREN, 'scripts/tlacitka-zaklad.json');

/**
 * Kde vlastní barva tlačítka NENÍ dluh:
 *  - dlaždice plochy mají vlastní vizuální jazyk (rozcestník, ne formulář),
 *  - barvy piv a obalů jsou fyzická vlastnost, ne rozhodnutí o vzhledu,
 *  - náhledy v nahled/ jsou samostatné stránky mimo aplikaci.
 */
const VYJIMKY = [
  'src/screens/HomeScreen.tsx',
  'src/components/BeerTileGrid.tsx',
  'nahled/',
];

function souboryVeZdroji(dir) {
  const out = [];
  for (const jmeno of readdirSync(dir)) {
    const cesta = join(dir, jmeno);
    if (statSync(cesta).isDirectory()) { out.push(...souboryVeZdroji(cesta)); continue; }
    if (!/\.tsx$/.test(jmeno) || /\.test\.tsx$/.test(jmeno)) continue;
    out.push(cesta);
  }
  return out;
}

/**
 * Najde otevírací značku `<button …>` i s atributy (bez obsahu).
 *
 * Regulárkou to nejde: `onClick={() => del(r.id)}` obsahuje `>` z tlusté
 * šipky, takže `<button[\s\S]*?>` skončí uprostřed atributů a className
 * (a s ní barva) se do porovnání vůbec nedostane. Kvůli tomu první verze
 * téhle kontroly hlásila 174 tlačítek s vlastní barvou, i když jich je víc.
 * Značka se proto čte znak po znaku: hlídá se hloubka `{}` a řetězce, a
 * konec je až `>` mimo ně.
 */
function tlacitka(zdroj) {
  const out = [];
  const re = /<button\b/g;
  let m;
  while ((m = re.exec(zdroj)) !== null) {
    let i = m.index + m[0].length;
    let hloubka = 0;
    let uvozovka = null;
    while (i < zdroj.length) {
      const z = zdroj[i];
      if (uvozovka) {
        if (z === uvozovka) uvozovka = null;
      } else if (z === '"' || z === "'" || z === '`') {
        uvozovka = z;
      } else if (z === '{') {
        hloubka += 1;
      } else if (z === '}') {
        hloubka -= 1;
      } else if (z === '>' && hloubka === 0) {
        break;
      }
      i += 1;
    }
    out.push({
      text: zdroj.slice(m.index, i + 1),
      radek: zdroj.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

const MA_ROLI = /className="[^"]*\bbtn(-[a-z]+)?\b/;
const VLASTNI_BARVA = /\bbg-(amber|emerald|rose|sky|violet|primary|neutral)-\d00\b/;

const nalezy = new Map();
for (const cesta of souboryVeZdroji(join(KOREN, 'src'))) {
  const rel = relative(KOREN, cesta);
  if (VYJIMKY.some((v) => rel.startsWith(v))) continue;
  const zdroj = readFileSync(cesta, 'utf8');
  const rucni = tlacitka(zdroj).filter((t) => !MA_ROLI.test(t.text) && VLASTNI_BARVA.test(t.text));
  if (rucni.length > 0) nalezy.set(rel, rucni);
}

const dnes = Object.fromEntries([...nalezy].map(([k, v]) => [k, v.length]).sort());
const celkem = Object.values(dnes).reduce((a, b) => a + b, 0);

if (process.argv.includes('--uloz')) {
  writeFileSync(ZAKLAD, `${JSON.stringify(dnes, null, 2)}\n`);
  console.log(`Základ uložen: ${celkem} ručně malovaných tlačítek v ${Object.keys(dnes).length} souborech.`);
  process.exit(0);
}

if (process.argv.includes('--vypis')) {
  for (const [soubor, seznam] of [...nalezy].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${soubor} — ${seznam.length}`);
    for (const t of seznam.slice(0, 40)) {
      const barva = t.text.match(VLASTNI_BARVA)?.[0] ?? '';
      console.log(`  :${t.radek}  ${barva}`);
    }
    if (seznam.length > 40) console.log(`  … a ${seznam.length - 40} dalších`);
  }
  console.log(`\nCelkem ${celkem} ručně malovaných tlačítek.`);
  process.exit(0);
}

if (!existsSync(ZAKLAD)) {
  console.error('Chybí scripts/tlacitka-zaklad.json — spusť `node scripts/zkontroluj-tlacitka.mjs --uloz`.');
  process.exit(1);
}

const zaklad = JSON.parse(readFileSync(ZAKLAD, 'utf8'));
const zhorseni = [];
for (const [soubor, pocet] of Object.entries(dnes)) {
  const povoleno = zaklad[soubor] ?? 0;
  if (pocet > povoleno) zhorseni.push({ soubor, povoleno, pocet });
}

if (zhorseni.length > 0) {
  console.error('Tlačítka: přibyla ručně malovaná tlačítka místo rolí ze systému.\n');
  for (const z of zhorseni) {
    console.error(`  ${z.soubor}: ${z.pocet} (povoleno ${z.povoleno})`);
  }
  console.error(`
Použij roli místo vlastní barvy (src/index.css):
  .btn-primary   hlavní akce (jedna na obrazovku)
  .btn-emerald   potvrzení hotového (Hotovo, Zavezeno, Schválit)
  .btn-ghost     vedlejší akce (Excel, tisk, filtr, zrušit)
  .btn-danger    mazání a storno
  .btn-pocet     −/+ u množství

Podrobně: docs/jednotny-styl.md. Výpis stávajícího stavu:
  node scripts/zkontroluj-tlacitka.mjs --vypis`);
  process.exit(1);
}

const zbyva = Object.entries(zaklad).reduce((a, [, v]) => a + v, 0);
const prevedeno = zbyva - celkem;
console.log(
  `Tlačítka: bez zhoršení (${celkem} ručně malovaných, dluh se nezvětšil).`
  + (prevedeno > 0 ? ` Převedeno už ${prevedeno} — základ jde zmenšit přes --uloz.` : ''),
);
