// Ikony druhé aplikace „Zajíc 2“ = původní ikony se štítkem „2“ v rohu.
// Spuštění: node scripts/vyrob-ikony-zajic2.mjs  (zapíše public/icon-2-*.png)
import sharp from 'sharp';

const ikony = [
  ['icon-192-v2.png', 'icon-2-192.png', 192, 0.30, 0.04],
  ['icon-512-v2.png', 'icon-2-512.png', 512, 0.30, 0.04],
  // maskable: důležité je jen střed (kruh ~80 %), štítek proto dál od okraje
  ['icon-maskable-512-v2.png', 'icon-2-maskable-512.png', 512, 0.27, 0.17],
];

function stitek(velikost, podil, okraj) {
  const d = Math.round(velikost * podil);
  const x = Math.round(velikost - d - velikost * okraj);
  const y = x;
  const r = d / 2;
  const t = d * 0.075; // tloušťka tahu číslice
  // „2“ nakreslená čarou (bez písma, ať se nespoléhá na fonty serveru)
  const u = d / 100;
  const cesta = `M ${30 * u} ${38 * u} C ${30 * u} ${24 * u}, ${70 * u} ${24 * u}, ${70 * u} ${40 * u} C ${70 * u} ${52 * u}, ${40 * u} ${62 * u}, ${28 * u} ${76 * u} L ${72 * u} ${76 * u}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${velikost}" height="${velikost}">
    <circle cx="${x + r}" cy="${y + r}" r="${r}" fill="#c1121f" stroke="#ffffff" stroke-width="${d * 0.06}"/>
    <g transform="translate(${x} ${y})"><path d="${cesta}" fill="none" stroke="#ffffff" stroke-width="${t * 2.2}" stroke-linecap="round" stroke-linejoin="round"/></g>
  </svg>`;
  return Buffer.from(svg);
}

for (const [zdroj, cil, v, podil, okraj] of ikony) {
  await sharp(`public/${zdroj}`).composite([{ input: stitek(v, podil, okraj) }]).png().toFile(`public/${cil}`);
  console.log('hotovo', cil);
}
