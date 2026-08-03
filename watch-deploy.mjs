/**
 * watch-deploy.mjs — Sleduje změny v src/ a public/ a automaticky
 * buildí + deployje na Cloudflare Pages.
 *
 * Spuštění:
 *   node watch-deploy.mjs
 *
 * Při každé změně:
 *   1. Zvýší verzi v src/lib/version.ts (patch)
 *   2. Spustí npm run build
 *   3. Deployne na Cloudflare Pages přes wrangler
 */

import { watch, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_DIR = __dirname;
const SRC_DIR = resolve(PROJECT_DIR, 'src');
const PUBLIC_DIR = resolve(PROJECT_DIR, 'public');
const VERSION_FILE = resolve(PROJECT_DIR, 'src/lib/version.ts');

// Debounce — nechat změny dávkovat (např. při uložení více souborů najednou)
let debounceTimer = null;
const DEBOUNCE_MS = 3000; // 3 vteřiny po poslední změně
let isBuilding = false;
let pendingChanges = false;

function bumpVersion() {
  const content = readFileSync(VERSION_FILE, 'utf-8');
  const match = content.match(/APP_VERSION\s*=\s*'([\d.]+)'/);
  if (!match) {
    console.error('❌ Nelze najít APP_VERSION v', VERSION_FILE);
    return;
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
  const versionJsonPath = resolve(PROJECT_DIR, 'public/version.json');
  writeFileSync(versionJsonPath, JSON.stringify({ version: newVersion, date: isoDate }, null, 2), 'utf-8');

  return newVersion;
}

function buildAndDeploy() {
  if (isBuilding) {
    pendingChanges = true;
    console.log('⏳ Build/deploy právě běží — změna se zpracuje po dokončení');
    return;
  }

  isBuilding = true;
  pendingChanges = false;

  console.log('\n============================================');
  console.log('  🔄 Detekována změna — spouštím build+deploy');
  console.log('============================================\n');

  try {
    // 1. Zvýšit verzi
    const newVersion = bumpVersion();

    // 2. Build
    console.log('\n🏗️  Build...');
    execSync('npm run build', { cwd: PROJECT_DIR, stdio: 'inherit' });
    console.log('✅ Build OK');

    // 3. Deploy na Cloudflare Pages
    console.log('\n🚀 Deploy na Cloudflare Pages...');
    execSync('npx wrangler pages deploy dist --project-name zajic-pivovar --branch main', {
      cwd: PROJECT_DIR,
      stdio: 'inherit',
    });
    console.log(`\n✅✅✅ HOTOVO! Verze ${newVersion} je online na https://zajic-pivovar.pages.dev`);
  } catch (err) {
    console.error('\n❌ Build/deploy selhal:', err.message);
  } finally {
    isBuilding = false;
    if (pendingChanges) {
      console.log('📋 Zpracovávám další čekající změny...');
      buildAndDeploy();
    }
  }
}

function scheduleDeploy() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    buildAndDeploy();
  }, DEBOUNCE_MS);
}

// Sledovat src/ rekurzivně
console.log('👀 Sleduji změny v src/ a public/...');
console.log('   Každá změna automaticky zvýší verzi, buildne a deployne.');
console.log('   Stiskni Ctrl+C pro zastavení.\n');

function watchDir(dir) {
  if (!existsSync(dir)) return;
  watch(dir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    // Ignorovat .tsbuildinfo, node_modules, atd.
    const name = filename.toLowerCase();
    if (name.includes('node_modules') || name.includes('.tsbuildinfo') || name.endsWith('.d.ts')) return;
    // Ignorovat změny ve verzi, které jsme sami vyvolali (na Windows může filename obsahovat cestu, např. "lib\version.ts")
    if (name.endsWith('version.ts') || name.endsWith('version.json')) return;

    console.log(`📝 Změna: ${filename}`);
    scheduleDeploy();
  });
}

watchDir(SRC_DIR);
watchDir(PUBLIC_DIR);

// Udržet proces naživu
process.on('SIGINT', () => {
  console.log('\n👋 Zastavuji watch-deploy...');
  process.exit(0);
});

// Nechat proces běžet
setInterval(() => {}, 1 << 30);
