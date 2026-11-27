// Bez shebangu schválně: skript se pouští přes `node scripts/shell-do-sw.mjs`
// (viz package.json), ale importují ho i testy — a řádek #!/usr/bin/env node
// v .mjs vitest nepřeloží (SyntaxError hned na prvním znaku).
/**
 * 🩹 Dopíše do `dist/sw.js` vstupní JS a CSS, na které odkazuje index.html.
 *
 * Proč to nejde napsat rovnou do `public/sw.js`: soubory mají v názvu otisk
 * obsahu (`index-B4LPMgHR.css`) a ten se mění s každým nasazením.
 *
 * A proč to vůbec potřebujeme: „offline shell" service workeru obsahoval
 * index.html, ikony a písma — ale NE styly. Uložené HTML tedy šlo zobrazit
 * i tehdy, když se stylopis nepodařilo stáhnout, a appka se v takové chvíli
 * vykreslila úplně bez vzhledu: patkové písmo, holá tlačítka, žádné rozvržení.
 * Vypadá to jako rozbitá grafika, přitom chybí jeden soubor.
 *
 * Pouští se v `npm run build` hned po Vite. Když se vstupní soubory
 * v index.html nenajdou, build SPADNE — tichý návrat k neúplnému shellu je
 * přesně ta chyba, kterou tenhle skript řeší.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

/**
 * Vytáhne z index.html cesty ke vstupnímu skriptu a stylopisu.
 * Modulepreload ostatních kusů se schválně NEBERE — shell má být malý;
 * zbytek se dotáhne, až ho appka potřebuje.
 */
export function vytahniShell(html) {
  const cesty = [];
  const skript = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/);
  if (skript) cesty.push('.' + skript[1]);
  for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(\/assets\/[^"]+\.css)"/g)) {
    cesty.push('.' + m[1]);
  }
  return cesty;
}

/** Vloží seznam do `const SHELL = [];` ve zdrojáku service workeru. */
export function vlozShell(sw, cesty) {
  const radek = `const SHELL = [${cesty.map((c) => `'${c}'`).join(', ')}];`;
  if (!/const SHELL = \[[^\]]*\];/.test(sw)) {
    throw new Error('V sw.js chybí `const SHELL = [];` — kam to mám doplnit?');
  }
  return sw.replace(/const SHELL = \[[^\]]*\];/, radek);
}

/**
 * 📴 Těžké knihovny, které se do telefonu předem NEukládají (čtení PDF, Excel — dohromady ~860 kB po zabalení).
 * Uloží se, až je někdo poprvé použije; všechno ostatní je v telefonu hned po instalaci verze.
 */
export const MIMO_KUSY = /^(pdf\.worker|pdf-|xlsx)/;

/**
 * Všechny kusy aplikace (obrazovky a knihovny) ze složky `assets` jako cesty pro service worker — bez těch,
 * které už jsou ve vstupním shellu, a bez těžkých knihoven (MIMO_KUSY). Seřazené, ať je výstup stabilní.
 *
 * Proč: kus se dřív uložil do telefonu až při prvním otevření obrazovky se signálem — a po každé aktualizaci
 * znovu. Bez signálu se pak obrazovka, kterou člověk předtím neotevřel, vůbec nenačetla (27. 11. 2026:
 * Sklad jako šedé obdélníky s nápisem „Jste offline").
 */
export function vyberKusy(soubory, shell) {
  const vShellu = new Set(shell);
  return soubory
    .filter((f) => /\.(js|mjs|css)$/.test(f) && !MIMO_KUSY.test(f))
    .map((f) => `./assets/${f}`)
    .filter((c) => !vShellu.has(c))
    .sort();
}

/** Vloží seznam do `const KUSY = [];` ve zdrojáku service workeru. */
export function vlozKusy(sw, cesty) {
  if (!/const KUSY = \[[^\]]*\];/.test(sw)) {
    throw new Error('V sw.js chybí `const KUSY = [];` — kam to mám doplnit?');
  }
  return sw.replace(/const KUSY = \[[^\]]*\];/, `const KUSY = [${cesty.map((c) => `'${c}'`).join(', ')}];`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = 'dist/index.html';
  const sw = 'dist/sw.js';
  for (const f of [html, sw]) {
    if (!existsSync(f)) {
      console.error(`Chybí ${f} — pusť nejdřív \`npm run build\`.`);
      process.exit(1);
    }
  }
  const cesty = vytahniShell(readFileSync(html, 'utf8'));
  const maCss = cesty.some((c) => c.endsWith('.css'));
  const maJs = cesty.some((c) => c.endsWith('.js'));
  if (!maCss || !maJs) {
    console.error(
      'V dist/index.html jsem nenašel ' +
      [!maJs && 'vstupní skript', !maCss && 'stylopis'].filter(Boolean).join(' ani ') +
      '. Bez toho by offline shell zůstal neúplný a appka by se mohla zobrazit bez vzhledu.'
    );
    process.exit(1);
  }
  const kusy = vyberKusy(readdirSync('dist/assets'), cesty);
  // Appka má přes sto kusů; kdyby jich bylo pár, sestavení se změnilo a seznam by byl k ničemu.
  if (kusy.length < 20) {
    console.error(`V dist/assets jsem našel jen ${kusy.length} kusů aplikace — čekal jsem jich přes sto. Bez nich by se obrazovky bez signálu nenačetly.`);
    process.exit(1);
  }
  writeFileSync(sw, vlozKusy(vlozShell(readFileSync(sw, 'utf8'), cesty), kusy));
  console.log(`Offline shell: do sw.js doplněno ${cesty.length} souborů (${cesty.join(', ')}).`);
  console.log(`Offline obrazovky: do sw.js doplněno ${kusy.length} kusů aplikace (uloží se v telefonu při instalaci verze).`);
}
