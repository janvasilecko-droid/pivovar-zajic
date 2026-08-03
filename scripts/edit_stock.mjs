import fs from 'fs';

const path = 'd:/stazene/zajic/project/src/screens/Stock.tsx';
let content = fs.readFileSync(path, 'utf-8');

const nl = content.includes('\r\n') ? '\r\n' : '\n';
const L = (s) => s.replace(/\n/g, nl);

const old = L(`        const currentStock = fromInv + brewedW;
        const remaining = currentStock - orderedW - woW - (akT - akR) - kegsUsedW;`);
const new_ = L(`        // Sudy použité na stočení do lahví (kegs_used) se odečítají z fyzického stavu skladu sudů,
        // takže "Skladem" ukazuje reálný stav (např. 20 sudů − 2 na lahve = 18).
        const currentStock = fromInv + brewedW - kegsUsedW;
        const remaining = currentStock - orderedW - woW - (akT - akR);`);

if (content.split(old).length - 1 !== 1) throw new Error('anchor not unique/found');
content = content.replace(old, new_);

fs.writeFileSync(path, content, 'utf-8');
console.log('OK - stock edit applied');
