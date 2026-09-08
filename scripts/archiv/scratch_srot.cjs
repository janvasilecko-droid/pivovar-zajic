const fs = require('fs');
const path = require('path');

function walk(d) {
  let r = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(e.name)) continue;
      r = r.concat(walk(p));
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      r.push(p);
    }
  }
  return r;
}

const patterns = ['srotovani', 'šrotov', 'Srotovan', 'Šrotov', '🌾'];
for (const term of patterns) {
  console.log('=== ' + term + ' ===');
  for (const f of walk('src')) {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((ln, i) => {
      if (ln.toLowerCase().includes(term.toLowerCase())) {
        console.log(f.replace(/\\/g, '/') + ':' + (i + 1) + ': ' + ln.trim());
      }
    });
  }
}
