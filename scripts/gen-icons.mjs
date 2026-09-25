// 🐇 Ikony a úvodní obrazovka — všechno z jedné vektorové předlohy.
// ---------------------------------------------------------------------------
// Z provozu 18. 9. 2026: „když poprvé načítá aplikace na telefonu, je tam ten
// rozmazanej zajíc v černým čtverci." Bylo to takhle:
//   • icon-192.png a icon-512.png byl JEDEN A TENTÝŽ soubor 420×322 —
//     ani jedna z deklarovaných velikostí a k tomu ne čtverec, takže ho
//     Android roztáhl na 512×512 (rozmazání) a doplnil na čtverec,
//   • icon-maskable-512.png sice 512×512 měl, ale zvětšený z něčeho malého —
//     nápis „KYNŠPERSKÝ PIVOVAR" v něm byl rozpitý,
//   • ikona aplikace v APK i úvodní obrazovka byly pořád VÝCHOZÍ LOGO
//     CAPACITORU (modrý křížek), ne pivovar.
//
// Původní generátor kreslil monogram „P" po pixelech a s pivovarem neměl nic
// společného; v repozitáři přitom celou dobu ležel vektor public/logo-zajic-znak.svg.
// Ten je teď jediným zdrojem — všechno ostatní se z něj dopočítá, takže
// změna loga znamená jedno spuštění tohohle skriptu.
//
// Použití: node scripts/gen-icons.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ZNAK = resolve(KOREN, 'public/logo-zajic-znak.svg');
const BILA = { r: 255, g: 255, b: 255, alpha: 1 };
const PRUHLEDNA = { r: 255, g: 255, b: 255, alpha: 0 };

/**
 * Znak doprostřed čtverce.
 *
 * `podil` = jakou část šířky čtverce znak zabere. Liší se podle použití:
 *   • běžná ikona   ~0.84 — zabere skoro celou plochu,
 *   • maskable      ~0.58 — Android ji ořízne do kruhu, takže se všechno
 *                           důležité musí vejít doprostřed (bezpečná zóna je
 *                           vnitřních 80 %); s plnou šířkou by zajícovi
 *                           uřízlo uši,
 *   • úvodní obrazovka ~0.38 — je to celá plocha telefonu, ne ikona.
 *
 * `density` (DPI při rasterizaci) je schválně vysoká: vektor má viewBox
 * 130×88, takže při výchozích 72 DPI by z něj vyšel obrázek menší než cíl a
 * zvětšoval by se — přesně ta chyba, která se opravuje.
 */
async function znakNaCtverec(velikost, podil) {
  const sirkaZnaku = Math.round(velikost * podil);
  const znak = await sharp(ZNAK, { density: 1200 })
    .resize({ width: sirkaZnaku, fit: 'inside' })
    .png()
    .toBuffer();
  return sharp({
    create: { width: velikost, height: velikost, channels: 4, background: BILA },
  })
    .composite([{ input: znak, gravity: 'center' }])
    .png()
    .toBuffer();
}

/**
 * Znak doprostřed čtverce, ale BEZ podkladu (průhledné pozadí).
 *
 * Pro vrstvu adaptivní ikony a pro znak na systémové úvodní obrazovce:
 * obojí si podklad kreslí Android sám (adaptivní ikona z
 * `ic_launcher_background`, úvodní obrazovka z `windowSplashScreenBackground`).
 * Když se do nich pošle obrázek s natvrdo bílým čtvercem, je ten čtverec na
 * tmavém podkladu vidět — a přesně tak vypadalo hlášení z provozu
 * 23. 9. 2026: „jako první se zobrazí rozmazaný logo pivovaru v černém
 * čtverci".
 */
async function znakNaPruhledno(velikost, podil) {
  const sirkaZnaku = Math.round(velikost * podil);
  const znak = await sharp(ZNAK, { density: 1200 })
    .resize({ width: sirkaZnaku, fit: 'inside' })
    .png()
    .toBuffer();
  return sharp({
    create: { width: velikost, height: velikost, channels: 4, background: PRUHLEDNA },
  })
    .composite([{ input: znak, gravity: 'center' }])
    .png()
    .toBuffer();
}

/** Znak doprostřed obdélníku (úvodní obrazovka na výšku i na šířku). */
async function znakNaPlochu(sirka, vyska) {
  const kratsi = Math.min(sirka, vyska);
  const znak = await sharp(ZNAK, { density: 1200 })
    .resize({ width: Math.round(kratsi * 0.38), fit: 'inside' })
    .png()
    .toBuffer();
  return sharp({ create: { width: sirka, height: vyska, channels: 4, background: BILA } })
    .composite([{ input: znak, gravity: 'center' }])
    .png()
    .toBuffer();
}

function zapis(cesta, buffer) {
  const cil = resolve(KOREN, cesta);
  mkdirSync(dirname(cil), { recursive: true });
  writeFileSync(cil, buffer);
  console.log(' ✓', cesta);
}

// --- PWA (plocha telefonu, úvodní obrazovka v prohlížeči) ------------------
console.log('PWA ikony:');
zapis('public/icon-192-v2.png', await znakNaCtverec(192, 0.84));
zapis('public/icon-512-v2.png', await znakNaCtverec(512, 0.84));
zapis('public/icon-maskable-512-v2.png', await znakNaCtverec(512, 0.58));
// 1024 px navíc: telefon s hustým displejem si na úvodní obrazovku webové
// verze bere ikonu zvětšenou, a z 512 px byla na velkém telefonu měkká.
zapis('public/icon-1024-v2.png', await znakNaCtverec(1024, 0.84));

// --- Android: ikona aplikace ----------------------------------------------
// Velikosti podle hustoty displeje. `ic_launcher_foreground` je vrstva
// adaptivní ikony (108dp), a protože se z ní zobrazuje jen prostředek,
// dostane znak menší podíl.
console.log('Ikona aplikace (Android):');
const HUSTOTY = [
  ['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432],
];
for (const [hustota, ikona, popredi] of HUSTOTY) {
  const ctverec = await znakNaCtverec(ikona, 0.8);
  zapis(`android/app/src/main/res/mipmap-${hustota}/ic_launcher.png`, ctverec);
  zapis(`android/app/src/main/res/mipmap-${hustota}/ic_launcher_round.png`, ctverec);
  // Popředí adaptivní ikony PRŮHLEDNÉ — podklad kreslí Android sám
  // (ic_launcher_background). S bílým čtvercem uvnitř se ikona na tmavém
  // pozadí tvářila jako obrázek v rámečku.
  zapis(`android/app/src/main/res/mipmap-${hustota}/ic_launcher_foreground.png`, await znakNaPruhledno(popredi, 0.58));
}

// --- Android 12+: znak na systémové úvodní obrazovce -----------------------
// Android 12 a výš si úvodní obrazovku kreslí sám a znak na ní zobrazuje
// ve 288dp (uvnitř je vidět prostředních 192dp). Na dnešním telefonu (3–4×)
// to je 864 až 1152 px — dosavadní `ic_launcher_foreground` má přitom jen
// 432 px, takže se zvětšoval skoro trojnásobně a byl ROZMAZANÝ. Z provozu
// 23. 9. 2026: „jako první se zobrazí rozmazaný logo pivovaru v černém
// čtverci … až pak se tam dá to ostrý."
//
// Proto vlastní soubor v jedné velké velikosti (a `-nodpi`, ať ho Android
// nepřepočítává podle hustoty): 1152 px, průhledné pozadí, znak na 0.55
// šířky — tedy uvnitř bezpečné zóny, aby se nic neuřízlo.
console.log('Znak na úvodní obrazovce (Android 12+):');
zapis('android/app/src/main/res/drawable-nodpi/splash_icon.png', await znakNaPruhledno(1152, 0.55));

// --- Android: úvodní obrazovka --------------------------------------------
console.log('Úvodní obrazovka (Android):');
const SPLASH = [
  ['mdpi', 320, 480], ['hdpi', 480, 800], ['xhdpi', 720, 1280],
  ['xxhdpi', 960, 1600], ['xxxhdpi', 1280, 1920],
];
for (const [hustota, sirka, vyska] of SPLASH) {
  zapis(`android/app/src/main/res/drawable-port-${hustota}/splash.png`, await znakNaPlochu(sirka, vyska));
  zapis(`android/app/src/main/res/drawable-land-${hustota}/splash.png`, await znakNaPlochu(vyska, sirka));
}
zapis('android/app/src/main/res/drawable/splash.png', await znakNaPlochu(480, 320));

console.log('\nHotovo. Ikony i úvodní obrazovka jsou z public/logo-zajic-znak.svg.');
