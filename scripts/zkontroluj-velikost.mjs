#!/usr/bin/env node
/**
 * 📦 Hlídač velikosti toho, co se stahuje při STARTU aplikace.
 *
 * Proč zrovna start: 5. 9. 2026 se ukázalo, že `manualChunks` v
 * `vite.config.ts` nerozdělil React tak, jak měl — skončil uvnitř kusu
 * s grafy, a protože se bez Reactu appka nespustí, dal jí vite do
 * `index.html` `modulepreload` na celých 537 kB recharts. Každý ho tedy
 * stahoval při startu, i když Statistiku nikdy neotevřel. Nikdo si toho
 * půl roku nevšiml, protože build projde a appka funguje — jen se déle
 * načítá.
 *
 * Skript proto neměří celé `dist/`, ale to, co si prohlížeč vyžádá, než
 * ukáže první obrazovku: vstupní `<script type="module">` a všechny
 * `<link rel="modulepreload">` z `dist/index.html`. Měří se v gzipu,
 * protože tak to jde po drátě.
 *
 * Použití:
 *   node scripts/zkontroluj-velikost.mjs           kontrola (CI)
 *   node scripts/zkontroluj-velikost.mjs --vypis   vypíše rozpad po kusech
 *
 * Když limit padne kvůli skutečné nové funkci, zvedne se ROZMYSLNĚ tady
 * v konstantě — ne tichým zvýšením v CI.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(KOREN, 'dist');

/**
 * Strop pro start aplikace v kB gzip.
 *
 * Naměřeno 5. 9. 2026 po opravě `manualChunks`: 226 kB
 * (index 104 + vendor-react 47 + vendor-supabase 57 + vendor-icons 19).
 * Před opravou to bylo 341 kB. Strop je 260 kB, tedy ~15 % rezerva na
 * běžný růst; kdo ho překročí, má se nejdřív podívat, jestli mu do startu
 * nespadlo něco, co tam nepatří (grafy, xlsx, celá obrazovka).
 */
const STROP_KB = 260;

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('Chybí dist/index.html — nejdřív `npm run build`.');
  process.exit(2);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');

/** Soubory, které si prohlížeč vyžádá hned: vstupní skript + modulepreload. */
const cesty = [
  ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]),
  ...[...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]),
];

const kusy = cesty.map((cesta) => {
  const soubor = join(DIST, cesta.replace(/^\//, ''));
  const obsah = readFileSync(soubor);
  return { cesta, kb: gzipSync(obsah).length / 1024 };
});

const celkem = kusy.reduce((a, k) => a + k.kb, 0);

if (process.argv.includes('--vypis')) {
  for (const k of kusy.sort((a, b) => b.kb - a.kb)) {
    console.log(`${k.kb.toFixed(1).padStart(7)} kB gzip  ${k.cesta}`);
  }
  console.log(`${celkem.toFixed(1).padStart(7)} kB gzip  CELKEM (strop ${STROP_KB} kB)`);
}

if (celkem > STROP_KB) {
  console.error(
    `Start aplikace váží ${celkem.toFixed(1)} kB gzip, strop je ${STROP_KB} kB.\n` +
    'Podívej se, co přibylo:  node scripts/zkontroluj-velikost.mjs --vypis\n' +
    'Nejčastější příčina je knihovna, která se omylem dostala do hlavního kusu\n' +
    '(grafy, xlsx, celá obrazovka) — viz manualChunks ve vite.config.ts.',
  );
  process.exit(1);
}

console.log(`Velikost startu: ${celkem.toFixed(1)} kB gzip (strop ${STROP_KB} kB).`);
