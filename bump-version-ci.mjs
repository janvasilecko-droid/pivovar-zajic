/**
 * bump-version-ci.mjs — Zvýší verzi aplikace (patch) v src/lib/version.ts
 * a public/version.json. Funguje v CI (GitHub Actions) i lokálně.
 *
 * Použití:
 *   node bump-version-ci.mjs
 *
 * Zvýší poslední číslo verze (patch) a nastaví aktuální datum.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_DIR = __dirname;
const VERSION_FILE = resolve(PROJECT_DIR, 'src/lib/version.ts');
const VERSION_JSON = resolve(PROJECT_DIR, 'public/version.json');

if (!existsSync(VERSION_FILE)) {
  console.error('❌ Nelze najít src/lib/version.ts v', PROJECT_DIR);
  process.exit(1);
}

const content = readFileSync(VERSION_FILE, 'utf-8');
const match = content.match(/APP_VERSION\s*=\s*'([\d.]+)'/);
if (!match) {
  console.error('❌ Nelze najít APP_VERSION v', VERSION_FILE);
  process.exit(1);
}

const parts = match[1].split('.').map(Number);
parts[parts.length - 1]++; // zvýšit poslední číslo (patch)
const newVersion = parts.join('.');

const now = new Date();
const dateStr = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

const newContent = content
  .replace(/APP_VERSION\s*=\s*'[\d.]+'/, `APP_VERSION = '${newVersion}'`)
  .replace(/APP_VERSION_DATE\s*=\s*'[^']*'/, `APP_VERSION_DATE = '${dateStr}'`);

writeFileSync(VERSION_FILE, newContent, 'utf-8');
console.log(`📦 Verze zvýšena na ${newVersion} (${dateStr})`);

// Aktualizovat i version.json v public/
writeFileSync(VERSION_JSON, JSON.stringify({ version: newVersion, date: isoDate }, null, 2), 'utf-8');
console.log(`📄 version.json aktualizován na ${newVersion}`);

// Vypiš verzi pro použití v CI (např. do GITHUB_ENV)
console.log(`NEW_VERSION=${newVersion}`);
