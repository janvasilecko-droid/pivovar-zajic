#!/usr/bin/env node
/**
 * Vyřeší opakující se konflikt ve version.ts + version.json při rebase.
 *
 * CI po každém pushi samo commitne "chore: bump version [skip ci]", takže
 * při dalším rebase vždycky koliduje APP_VERSION / APP_VERSION_DATE.
 * Řešení je pokaždé stejné: vzít vyšší číslo verze a zvednout ho o 1.
 *
 * Použití: node scripts/resolve-version-conflict.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const TS = 'src/lib/version.ts';
const JSON_FILE = 'public/version.json';

let ts = readFileSync(TS, 'utf8');

// Posbírej všechna čísla verzí, která v konfliktu figurují, a vezmi nejvyšší.
const versions = [...ts.matchAll(/APP_VERSION\s*=\s*'([\d.]+)'/g)].map((m) => m[1]);
const conflictVersions = [...ts.matchAll(/v(\d+\.\d+)'/g)].map((m) => m[1]);
const all = [...versions, ...conflictVersions].map(Number).filter((n) => !Number.isNaN(n));
if (all.length === 0) {
  console.error('Nenašel jsem žádné číslo verze — nic neměním.');
  process.exit(1);
}
const next = (Math.max(...all) + 0.001).toFixed(3);

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const dateCs = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
const dateIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

// Vyhoď konfliktní bloky a nahraď je jednou platnou dvojicí řádků.
ts = ts.replace(
  /export const APP_VERSION = '[\d.]+';\s*<<<<<<<[^\n]*\n(?:[^\n]*\n)*?>>>>>>>[^\n]*\n/,
  `export const APP_VERSION = '${next}';\nexport const APP_VERSION_DATE = '${dateCs}';\n`
);
// Kdyby konflikt nebyl (běžný bump), aspoň srovnej hodnoty.
ts = ts.replace(/export const APP_VERSION = '[\d.]+';/, `export const APP_VERSION = '${next}';`);
ts = ts.replace(/export const APP_VERSION_DATE = '[^']*';/, `export const APP_VERSION_DATE = '${dateCs}';`);
// Poslední changelog řádek přečísluj na novou verzi.
ts = ts.replace(/v\d+\.\d+',/, `v${next}',`);

writeFileSync(TS, ts, 'utf8');
writeFileSync(JSON_FILE, `{\n  "version": "${next}",\n  "date": "${dateIso}"\n}\n`, 'utf8');

if (ts.includes('<<<<<<<') || ts.includes('>>>>>>>')) {
  console.error('POZOR: ve version.ts pořád zůstal konfliktní blok — zkontroluj ručně.');
  process.exit(1);
}
console.log(`Verze srovnána na ${next} (${dateCs}).`);
