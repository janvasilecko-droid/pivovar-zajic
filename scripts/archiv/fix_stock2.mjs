import { readFileSync, writeFileSync } from 'fs';

const file = 'd:/stazene/zajic/project/src/screens/Stock.tsx';
let content = readFileSync(file, 'utf8');

const old = '      const stockLiters = pkgLiters(stockByPkg);';
const neu = '      const stockLiters = stockByPkg.reduce((s, p) => s + p.currentStock * p.volume_l, 0);';

if (!content.includes(old)) {
  console.error('Target line not found');
  process.exit(1);
}

content = content.replace(old, neu);
writeFileSync(file, content, 'utf8');
console.log('Fixed stockLiters line');
