/**
 * Hlídač tříd, které Tailwind nezná.
 *
 * Chybějící třída není v Tailwindu chyba — prostě se z ní nevygeneruje žádné
 * pravidlo a prvek zůstane bez efektu. Tiše. Právě takhle se do aplikace
 * dostalo ~200 mrtvých stylů naráz: psala se jména z Tailwindu v4
 * (shadow-xs, backdrop-blur-xs, outline-hidden), zatímco tady běží v3.
 * Spinner byl kvůli `border-3` celou dobu neviditelný, 78 souborů přišlo
 * o stín a modály nenaskakovaly.
 *
 * Skript proto vygeneruje CSS z aktuálních zdrojáků a ověří, že ke každé
 * třídě napsané v kódu opravdu nějaké pravidlo vzniklo.
 *
 * Spouští se `npm run zkontroluj-tridy` a v CI před buildem.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Třídy, které nedefinuje Tailwind — vlastní CSS, cizí knihovny, tisk. */
const VLASTNI = /^(hs-|c-|density-|print-|dark$|ikona-text$|tap$|outline-hidden$|animate-in$|fade-in$|zoom-in$|pb-safe$)/;

function vygenerujCss() {
  const ven = path.join(os.tmpdir(), `tw-kontrola-${process.pid}.css`);
  // Rovnou node + skript Tailwindu, ne npx: přes `shell: true` Node hlásí
  // DEP0190 (argumenty se jen slepují) a bez shellu zase Windows neumí
  // spustit .cmd wrapper z node_modules/.bin.
  const cli = path.join(KOREN, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
  execFileSync(process.execPath, [cli, '-i', 'src/index.css', '-o', ven], {
    cwd: KOREN, stdio: 'pipe',
  });
  const css = fs.readFileSync(ven, 'utf8');
  fs.unlinkSync(ven);
  return css;
}

function tridyVCss(css) {
  const jsou = new Set();
  for (const m of css.matchAll(/\.((?:[-a-zA-Z0-9_%.\/]|\\[^\s])+)/g)) {
    jsou.add(m[1].split('\\').join(''));
  }
  return jsou;
}

function zdrojaky() {
  const soubory = [];
  (function projdi(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) projdi(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) soubory.push(p);
    }
  })(path.join(KOREN, 'src'));
  soubory.push(path.join(KOREN, 'index.html'));
  return soubory;
}

const CLASS_ATTR = /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/g;

function main() {
  const jsou = tridyVCss(vygenerujCss());
  const chybi = new Map();

  for (const soubor of zdrojaky()) {
    const text = fs.readFileSync(soubor, 'utf8');
    for (const m of text.matchAll(CLASS_ATTR)) {
      const surove = m[1] || m[2] || m[3] || m[4] || m[5] || '';
      // Uvnitř šablonových řetězců se mezi třídami válí i kus JS
      // (`${stav ? 'a' : 'b'}`) — apostrofy a uvozovky proto berem jako
      // oddělovač a všechno, co vypadá jako výraz, zahodíme.
      for (let token of surove.split(/[\s`'"]+/)) {
        token = token.trim();
        if (!token || /[${}()?=]/.test(token)) continue;
        const trida = token.replace(/^!/, '');
        // Hranaté závorky = libovolná hodnota (w-[42px]); ty Tailwind
        // vygeneruje vždy, kontrolovat je nemá smysl.
        if (!trida || trida.includes('[')) continue;
        if (!/^-?[a-z]/i.test(trida)) continue;
        // Holé slovo bez pomlčky i dvojtečky je skoro jistě proměnná z JS.
        if (!trida.includes('-') && !trida.includes(':')) continue;
        if (VLASTNI.test(trida.split(':').pop())) continue;
        if (jsou.has(trida) || jsou.has('!' + trida)) continue;
        if (!chybi.has(trida)) chybi.set(trida, new Set());
        chybi.get(trida).add(path.relative(KOREN, soubor));
      }
    }
  }

  if (chybi.size === 0) {
    console.log('Tailwind: všechny třídy ze zdrojáků mají v CSS své pravidlo.');
    return;
  }

  console.error(`\nTailwind nezná ${chybi.size} tříd — nevygeneruje se z nich nic a prvek zůstane bez efektu:\n`);
  for (const [trida, soubory] of [...chybi].sort((a, b) => b[1].size - a[1].size)) {
    const ukazka = [...soubory].slice(0, 3).join(', ');
    const zbytek = soubory.size > 3 ? ` (+${soubory.size - 3} dalších)` : '';
    console.error(`  ${trida.padEnd(28)} ${ukazka}${zbytek}`);
  }
  console.error('\nBuď je jméno překlep / z jiné verze Tailwindu, nebo ho dodefinuj');
  console.error('v tailwind.config.js či src/index.css. Vlastní třídy patří do VLASTNI v tomhle skriptu.\n');
  process.exit(1);
}

main();
