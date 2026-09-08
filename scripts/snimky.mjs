#!/usr/bin/env node
/**
 * 📸 Snímky vzorníku prvků — tři šířky, oba režimy.
 *
 * Ladit vzhled po obrazovkách znamená projít jednačtyřicet obrazovek a
 * stejně přehlédnout stav, který se běžně nezobrazí (chyba, prázdno,
 * načítání). Náhledová stránka `/prvky.html` je má všechny na jednom
 * místě; tenhle skript ji vyfotí, takže se dá porovnat „před" a „po".
 *
 * Použití:
 *   npx vite --config vite.nahled.config.ts     (v jednom okně)
 *   node scripts/snimky.mjs                     (ve druhém)
 *
 * Snímky se ukládají do `nahled/snimky/` (v .gitignore — jsou to obrázky,
 * které by v repozitáři jen bobtnaly). Kdo chce porovnat před/po, udělá
 * snímky, provede změnu a udělá je znovu do jiné složky:
 *
 *   node scripts/snimky.mjs pred
 *   …úprava…
 *   node scripts/snimky.mjs po
 *
 * Prohlížeč se hledá tam, kde ho mají Playwright i běžná instalace; když
 * není, skript řekne kde ho vzít a skončí bez chyby (aby to nepadalo
 * někomu, kdo si jen stáhl repozitář).
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
const ADRESAR = join(KOREN, 'nahled/snimky', process.argv[2] ?? 'aktualni');
const ADRESA = process.env.NAHLED_URL ?? 'http://localhost:5199/prvky.html';

/** Šířky, na kterých se aplikace opravdu používá. */
const SIRKY = [
  { jmeno: 'telefon', px: 390 },
  { jmeno: 'tablet', px: 768 },
  { jmeno: 'pocitac', px: 1280 },
];

const KANDIDATI = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.log('Chybí playwright-core — `npm install` a zkus znovu.');
  process.exit(0);
}

const prohlizec = KANDIDATI.find((c) => existsSync(c));
if (!prohlizec) {
  console.log(
    'Nenašel jsem prohlížeč. Nastav CHROMIUM_PATH na chrome/chromium,\n' +
    'nebo použij `npx playwright install chromium`.',
  );
  process.exit(0);
}

mkdirSync(ADRESAR, { recursive: true });

const b = await chromium.launch({ executablePath: prohlizec, args: ['--no-sandbox'] });
try {
  for (const { jmeno, px } of SIRKY) {
    for (const tmavy of [false, true]) {
      const stranka = await b.newPage({ viewport: { width: px, height: 900 } });
      await stranka.goto(ADRESA, { waitUntil: 'networkidle' });
      // Režim se přepíná stejnou třídou jako v aplikaci (lib/theme.ts).
      await stranka.evaluate((t) => {
        document.documentElement.classList.toggle('dark', t);
        document.documentElement.dataset.theme = t ? 'dark' : 'light';
      }, tmavy);
      // Chvíli na dokreslení přechodů, ať snímek nechytí půlku animace.
      await stranka.waitForTimeout(250);
      const soubor = join(ADRESAR, `${jmeno}-${tmavy ? 'tmavy' : 'svetly'}.png`);
      await stranka.screenshot({ path: soubor, fullPage: true });
      console.log('  ' + soubor.replace(KOREN + '/', ''));
      await stranka.close();
    }
  }
} finally {
  await b.close();
}

console.log(`Hotovo — ${SIRKY.length * 2} snímků v ${ADRESAR.replace(KOREN + '/', '')}`);
