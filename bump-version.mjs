import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const projectDir = 'd:/stazene/zajic/project';
const f = join(projectDir, 'src/lib/version.ts');
let c = readFileSync(f, 'utf-8');
let v = c.match(/APP_VERSION\s*=\s*'([\d.]+)'/);
if (v) {
  let p = v[1].split('.').map(Number);
  p[p.length - 1]++;
  let nv = p.join('.');
  let d = new Date();
  let ds = d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  c = c.replace(/APP_VERSION\s*=\s*'[\d.]+'/, "APP_VERSION = '" + nv + "'");
  c = c.replace(/APP_VERSION_DATE\s*=\s*'[^']*'/, "APP_VERSION_DATE = '" + ds + "'");
  writeFileSync(f, c, 'utf-8');
  console.log('Verze: ' + nv + ' (' + ds + ')');
  let iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  writeFileSync(join(projectDir, 'public/version.json'), JSON.stringify({ version: nv, date: iso }, null, 2));
}
