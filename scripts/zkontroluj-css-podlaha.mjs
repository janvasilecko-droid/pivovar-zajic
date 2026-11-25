#!/usr/bin/env node
/**
 * 📱 Kontrola sestaveného CSS a spouštěcích souborů pro starší Android (WebView / Chrome pod 90).
 *
 * Šéfovi nejde appka na starším telefonu (25. 11. 2026). Z hotového sestavení se změřilo, co je pro starý
 * prohlížeč past, a opravilo se to v nastavení sestavení: PostCSS plugin přepisuje `:is(.dark *)`
 * (scripts/postcss-starsi-prohlizece.mjs), `build.cssTarget` snižuje `inset` (vite.config.ts) a výška oken
 * má zálohu bez `dvh` (třída `max-h-ekran` v index.css). Žádná z těch oprav nic nevyhodí, když se zruší —
 * build projde a appka na novém telefonu funguje stejně; rozbije se až na starém. Proto tahle kontrola
 * čte HOTOVÉ CSS ve složce dist a selže hned, ne až u šéfa na telefonu.
 *
 * Kontroluje se:
 *  • CSS neobsahuje `:is(.dark *)` (Chrome 88+) — tmavý režim by na starším WebView vypadl;
 *  • CSS neobsahuje `inset:` (Chrome 87+) — `fixed inset-0` okna a podklady by ztratily rozměr;
 *  • každé `dvh`/`svh`/`lvh` (Chrome 108+) má v témže pravidle před sebou stejnou vlastnost s obyčejným `vh`;
 *  • index.html obsahuje záplaty a záchrannou obrazovku jako klasické skripty a nomodule skript;
 *  • public/diagnostika.html a public/instalace.html se dostaly do dist;
 *  • dist/_redirects má krátký odkaz /apk (302 na APK v nejnovějším vydání) PŘED obecným „všechno na index.html“;
 *  • dist/sw.js má stránku „Bez připojení“ místo holého „Offline“ (spuštění z ikony bez signálu a bez kopie).
 *
 * Proč i tohle: pozvánka, Nastavení i návod posílají lidi na /instalace a /apk (25. 11. 2026, šéfovi se z ikony na
 * starším Androidu aplikace nespustila). Kdyby soubor nebo pravidlo z dist vypadlo, adresa by tiše ukázala přihlašovací
 * obrazovku aplikace (obecné pravidlo `/*` → index.html) a nikdo by si nevšiml, dokud by to nezkusil člověk.
 *
 * Použití:  node scripts/zkontroluj-css-podlaha.mjs   (po `npm run build`)
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Najde ve CSS to, co starší prohlížeč nerozebere. Vrací seznam textů problémů (prázdný = v pořádku).
 * Oddělené od čtení souborů kvůli testům.
 * @param {string} css
 * @returns {string[]}
 */
export function zkontrolujCss(css) {
  const problemy = [];

  const dark = css.split(':is(.dark *)').length - 1;
  if (dark > 0) {
    problemy.push(`${dark}× \`:is(.dark *)\` — varianty \`dark:\` by na Chromu pod 88 vypadly. Zkontroluj, že v postcss.config.js běží scripts/postcss-starsi-prohlizece.mjs PO Tailwindu.`);
  }

  // `inset:` jako vlastnost (ne `safe-area-inset-…`, `--tw-ring-inset:` ani `inset-inline`).
  const inset = (css.match(/(^|[{;])inset:/g) || []).length;
  if (inset > 0) {
    problemy.push(`${inset}× \`inset:\` — na Chromu pod 87 by okna a podklady \`fixed inset-0\` ztratily rozměr. Zkontroluj \`build.cssTarget: 'chrome64'\` ve vite.config.ts.`);
  }

  // Výška okna ve dvh/svh/lvh musí mít v témže pravidle před sebou stejnou vlastnost s obyčejným vh.
  for (const blok of css.split('}')) {
    const otevreni = blok.lastIndexOf('{');
    if (otevreni < 0) continue;
    const selektor = blok.slice(0, otevreni).split('{').pop().trim();
    const deklarace = blok.slice(otevreni + 1).split(';').map((d) => d.trim()).filter(Boolean);
    deklarace.forEach((d, i) => {
      const dvojtecka = d.indexOf(':');
      if (dvojtecka < 0) return;
      const vlastnost = d.slice(0, dvojtecka).trim();
      const hodnota = d.slice(dvojtecka + 1);
      if (!/\d(d|s|l)vh\b/.test(hodnota) || vlastnost.startsWith('--')) return;
      const zaloha = deklarace.slice(0, i).some((p) => {
        const k = p.indexOf(':');
        return k > 0 && p.slice(0, k).trim() === vlastnost && /\dvh\b/.test(p.slice(k + 1)) && !/\d(d|s|l)vh\b/.test(p.slice(k + 1));
      });
      if (!zaloha) {
        problemy.push(`\`${selektor}\` má \`${vlastnost}: ${hodnota.trim()}\` bez zálohy s obyčejným vh před sebou — na Chromu pod 108 by vlastnost vypadla úplně.`);
      }
    });
  }

  return problemy;
}

/**
 * Zkontroluje index.html: záplaty a záchranná obrazovka jsou KLASICKÉ skripty (bez type, async a defer) a nomodule
 * skript existuje. Pořadí vůči modulu se nehlídá, protože moduly jsou vždycky odložené — spustí se až po rozebrání
 * celé stránky, takže klasický skript je rozběhne dřív, ať stojí kdekoli (Vite navíc vstupní modul při sestavení
 * přesouvá do hlavičky a skript nomodule zůstane v těle). Rozhoduje jen to, že je skript klasický.
 * @param {string} html
 * @returns {string[]}
 */
export function zkontrolujIndexHtml(html) {
  const problemy = [];
  const skripty = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ atr: m[1].trim(), kod: m[2] }));
  if (!skripty.some((s) => /type="module"/.test(s.atr))) {
    problemy.push('index.html nemá vstupní <script type="module"> — nic by se nespustilo.');
  }
  const klasicky = (hledej) => skripty.find((s) => s.atr === '' && s.kod.includes(hledej));
  if (!klasicky("'randomUUID'")) problemy.push('index.html nemá klasický skript (bez type, async a defer) se záplatami crypto.randomUUID aj. — starý WebView by nešel ukládat.');
  if (!klasicky('__zajicZachrana = ')) problemy.push('index.html nemá klasický skript se záchrannou obrazovkou — starý telefon by ukázal jen bílou stránku.');
  if (!skripty.some((s) => /\bnomodule\b/.test(s.atr) && s.kod.includes("__zajicZachrana('moduly')"))) {
    problemy.push('index.html nemá <script nomodule>, který ukáže záchrannou obrazovku v prohlížeči bez modulů.');
  }
  return problemy;
}

/**
 * Zkontroluje _redirects: /apk musí dočasně (302) přesměrovat na pivovar-zajic.apk v nejnovějším vydání na GitHubu
 * a stát PŘED obecným pravidlem `/*` — platí první shoda, jinak by /apk ukázal přihlašovací obrazovku.
 * @param {string} txt
 * @returns {string[]}
 */
export function zkontrolujRedirects(txt) {
  const pravidla = txt.split(/\r?\n/).map((r) => r.trim()).filter((r) => r && !r.startsWith('#'))
    .map((r) => r.split(/\s+/)).filter((t) => t.length >= 2 && t.length <= 3 && t[0].startsWith('/'));
  const apk = pravidla.findIndex((t) => t[0] === '/apk');
  if (apk < 0) {
    return ['_redirects nemá pravidlo pro /apk — krátký odkaz na stažení aplikace (pozvánka, stránka Instalace) by ukázal přihlašovací obrazovku.'];
  }
  const problemy = [];
  const [, cil, stav] = pravidla[apk];
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/latest\/download\/pivovar-zajic\.apk$/.test(cil)) {
    problemy.push(`/apk míří na „${cil}“ — má na https://github.com/<vlastník>/<repozitář>/releases/latest/download/pivovar-zajic.apk (soubor, který vystavuje deploy.yml).`);
  }
  if (stav !== '302') {
    problemy.push(`/apk má stav ${stav || '(žádný = 301)'} — má být 302 (dočasné), jinak si odkaz prohlížeče a telefony zapamatují natrvalo.`);
  }
  const zaloha = pravidla.findIndex((t) => t[0] === '/*');
  if (zaloha >= 0 && zaloha < apk) problemy.push('/apk stojí až za pravidlem `/*` — platí první shoda, takže se nikdy nepoužije.');
  return problemy;
}

/**
 * Zkontroluje sw.js: bez připojení a bez uložené kopie se místo holého „Offline“ vrací stránka (odpovedOffline).
 * @param {string} js
 * @returns {string[]}
 */
export function zkontrolujSw(js) {
  const problemy = [];
  if (!js.includes('const STRANKA_OFFLINE = `')) {
    problemy.push('sw.js nemá stránku „Bez připojení“ (STRANKA_OFFLINE) — spuštění z ikony bez signálu a bez uložené kopie by ukázalo holé „Offline“.');
  }
  if (!/matchInInstalledCache\('\.\/index\.html'\)[\s\S]{0,400}return fallback \|\| odpovedOffline\(\);/.test(js)) {
    problemy.push('Navigace v sw.js po neúspěchu sítě i uložené kopie nevrací odpovedOffline() — místo stránky by se ukázalo holé „Offline“.');
  }
  return problemy;
}

/**
 * Zkontroluje stránku Instalace v dist: odkaz ke stažení míří na /apk a skript je na místě.
 * @param {string} html
 * @returns {string[]}
 */
export function zkontrolujInstalaci(html) {
  const problemy = [];
  if (!/<a [^>]*id="stahnout"[^>]*href="\/apk"/.test(html)) problemy.push('instalace.html nemá odkaz ke stažení aplikace na /apk (id="stahnout").');
  if (!html.includes('window.__instalace')) problemy.push('instalace.html nemá skript, který pozná telefon — ukázala by všechny postupy najednou.');
  return problemy;
}

function hlavni() {
  const koren = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dist = join(koren, 'dist');
  if (!existsSync(join(dist, 'index.html'))) {
    console.error('Chybí dist/index.html — nejdřív `npm run build`.');
    process.exit(2);
  }
  const problemy = [];
  const css = readdirSync(join(dist, 'assets')).filter((j) => j.endsWith('.css'));
  if (css.length === 0) problemy.push('V dist/assets není žádné CSS.');
  for (const j of css) {
    for (const p of zkontrolujCss(readFileSync(join(dist, 'assets', j), 'utf8'))) problemy.push(`${j}: ${p}`);
  }
  for (const p of zkontrolujIndexHtml(readFileSync(join(dist, 'index.html'), 'utf8'))) problemy.push(p);
  if (!existsSync(join(dist, 'diagnostika.html'))) problemy.push('Do dist se nedostala diagnostika.html (public/diagnostika.html) — APK i záchranná obrazovka na ni odkazují.');

  if (!existsSync(join(dist, 'instalace.html'))) {
    problemy.push('Do dist se nedostala instalace.html (public/instalace.html) — pozvánka, Nastavení i návod na ni odkazují.');
  } else {
    for (const p of zkontrolujInstalaci(readFileSync(join(dist, 'instalace.html'), 'utf8'))) problemy.push(p);
  }
  if (!existsSync(join(dist, '_redirects'))) {
    problemy.push('Do dist se nedostal _redirects (public/_redirects) — nefunguje /apk ani přesměrování ostatních adres na aplikaci.');
  } else {
    for (const p of zkontrolujRedirects(readFileSync(join(dist, '_redirects'), 'utf8'))) problemy.push(p);
  }
  if (!existsSync(join(dist, 'sw.js'))) {
    problemy.push('Do dist se nedostal sw.js.');
  } else {
    for (const p of zkontrolujSw(readFileSync(join(dist, 'sw.js'), 'utf8'))) problemy.push(p);
  }

  if (problemy.length > 0) {
    console.error('✗ Sestavení není v pořádku pro starší Android:\n');
    for (const p of problemy) console.error(`  • ${p}`);
    console.error('\nSouvislosti: src/lib/podlahaProhlizece.ts');
    process.exit(1);
  }
  console.log('Kontrola pro starší Android: CSS i spouštěcí soubory v pořádku.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) hlavni();
