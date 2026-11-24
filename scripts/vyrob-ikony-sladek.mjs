// Ikony samostatné aplikace „AI sládek“ (R39) = původní ikony se žlutým štítkem s bublinou chatu v rohu.
// Spuštění: node scripts/vyrob-ikony-sladek.mjs  (zapíše public/icon-sladek-*-v1.png)
// Při změně ikony zvyš číslo v názvu (-v2…) i v manifest-sladek.webmanifest a index.html: telefon si ikonu uloží při
// instalaci a znovu ji stáhne jen z jiné adresy (viz src/lib/ikonyAplikace.test.ts).
import sharp from 'sharp';

const ikony = [
  ['icon-192-v2.png', 'icon-sladek-192-v1.png', 192, 0.36, 0.03],
  ['icon-512-v2.png', 'icon-sladek-512-v1.png', 512, 0.36, 0.03],
  // maskable: důležitý je jen střed (kruh ~80 %), štítek proto dál od okraje
  ['icon-maskable-512-v2.png', 'icon-sladek-maskable-512-v1.png', 512, 0.27, 0.17],
];

function stitek(velikost, podil, okraj) {
  const d = Math.round(velikost * podil);
  const x = Math.round(velikost - d - velikost * okraj);
  const y = x;
  const r = d / 2;
  const u = d / 100;
  // Bublina chatu s ocáskem a třemi tečkami — nakreslená tvary (bez písma, ať se nespoléhá na fonty serveru).
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${velikost}" height="${velikost}">
    <circle cx="${x + r}" cy="${y + r}" r="${r}" fill="#f59e0b" stroke="#ffffff" stroke-width="${d * 0.06}"/>
    <g transform="translate(${x} ${y})">
      <rect x="${22 * u}" y="${27 * u}" width="${56 * u}" height="${38 * u}" rx="${10 * u}" fill="#1c1917"/>
      <path d="M ${36 * u} ${64 * u} L ${34 * u} ${79 * u} L ${52 * u} ${64 * u} Z" fill="#1c1917"/>
      <circle cx="${37 * u}" cy="${46 * u}" r="${4.6 * u}" fill="#f59e0b"/>
      <circle cx="${50 * u}" cy="${46 * u}" r="${4.6 * u}" fill="#f59e0b"/>
      <circle cx="${63 * u}" cy="${46 * u}" r="${4.6 * u}" fill="#f59e0b"/>
    </g>
  </svg>`;
  return Buffer.from(svg);
}

for (const [zdroj, cil, v, podil, okraj] of ikony) {
  await sharp(`public/${zdroj}`).composite([{ input: stitek(v, podil, okraj) }]).png().toFile(`public/${cil}`);
  console.log('hotovo', cil);
}
