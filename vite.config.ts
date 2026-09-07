import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
// Jediné místo, kde je hranice evidence migrací — přehled v Nastavení i tenhle
// build musí mít tutéž. Dvě kopie by se rozešly a build by přibalil (nebo
// vynechal) jiné migrace, než které se hlásí jako čekající.
import { ZACATEK_EVIDENCE } from './src/lib/migraceStav';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Načti aktuální verzi a datum z version.ts
const versionPath = resolve(__dirname, 'src/lib/version.ts');
const versionContent = readFileSync(versionPath, 'utf-8');
const versionMatch = versionContent.match(/APP_VERSION\s*=\s*'([^']+)'/);
const appVersion = versionMatch ? versionMatch[1] : '0.0.0';
const dateMatch = versionContent.match(/APP_VERSION_DATE\s*=\s*'([^']+)'/);
const appDateRaw = dateMatch ? dateMatch[1] : '';

// Převeď datum z formátu "DD.MM.YYYY HH:mm" do "YYYY-MM-DD HH:mm" pro version.json
let appDate = '';
if (appDateRaw) {
  const parts = appDateRaw.match(/(\d+)\.(\d+)\.(\d+)\s+(\d+):(\d+)/);
  if (parts) {
    appDate = `${parts[3]}-${String(parts[2]).padStart(2, '0')}-${String(parts[1]).padStart(2, '0')} ${String(parts[4]).padStart(2, '0')}:${String(parts[5]).padStart(2, '0')}`;
  }
}

// Vygeneruj version.json do public/ (zkopíruje se do dist/ při build)
// Používáme datum z version.ts, aby bylo konzistentní — watch-deploy.mjs ho nastaví před buildem
const versionJsonPath = resolve(__dirname, 'public/version.json');
try {
  writeFileSync(versionJsonPath, JSON.stringify({ version: appVersion, date: appDate }, null, 2));
} catch (e) {
  // public/ nemusí existovat při clean checkout, nevadí
}

// Seznam migračních souborů do public/migrace.json (stejný postup jako
// version.json výš). Nastavení pak umí říct „tyhle dvě migrace čekají" —
// bez toho soubory v supabase/migrations/ o produkci nevypovídají nic a
// čekající migrace se poznala jen tím, že nová obrazovka „nefunguje".
//
// Do bundlu se nedostane obsah SQL, jen jména souborů: obsah je zbytečný
// (nikdo ho v prohlížeči nepustí) a přidal by stovky kilobajtů.
try {
  const migraceDir = resolve(__dirname, 'supabase/migrations');
  const soubory = readdirSync(migraceDir).filter((j) => j.endsWith('.sql')).sort();
  writeFileSync(
    resolve(__dirname, 'public/migrace.json'),
    JSON.stringify({ soubory }, null, 2),
  );

  // A k tomu SQL těch migrací, které ještě můžou čekat — z něj edge funkce
  // `pust-migraci` bere, co se má pustit, když se migrace spouští z appky
  // (typicky z telefonu, kde příkazová řádka není).
  //
  // PROČ SI SQL BERE SERVER ODSUD A NE OD KLIENTA: kdyby ho posílal
  // prohlížeč, byl by z toho vzdáleně ovládaný spouštěč libovolného
  // příkazu nad databází. Takhle klient posílá jen JMÉNO souboru a obsah
  // pochází z nasazeného buildu, tedy z repozitáře.
  //
  // Starší než ZACATEK_EVIDENCE se nepřibalují: nikdy se nemůžou hlásit
  // jako čekající (viz src/lib/migraceStav.ts), takže by to byly jen
  // stovky kilobajtů navíc.
  const sql: Record<string, string> = {};
  for (const jmeno of soubory) {
    if (jmeno < ZACATEK_EVIDENCE) continue;
    sql[jmeno] = readFileSync(resolve(migraceDir, jmeno), 'utf-8');
  }
  writeFileSync(
    resolve(__dirname, 'public/migrace-sql.json'),
    JSON.stringify({ sql }, null, 2),
  );
} catch {
  // Bez složky s migracemi (nebo bez public/) se jen přeskočí — přehled
  // migrací pak řekne, že seznam není k dispozici. Build kvůli tomu padat
  // nemá.
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  base: '/', // absolutní cesty pro Cloudflare Pages
  server: { port: 5173, host: true, hmr: { overlay: false }, allowedHosts: true },
  build: {
    target: 'es2015',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-icons': ['lucide-react'],
          // Grafy (recharts) mají vlastní kus schválně. Byly zapečené
          // v chunku Statistiky, takže každá úprava History.tsx — tedy
          // i změna popisku — nutila každého stáhnout znovu celých
          // 501 kB. Jako samostatný kus se stáhnou jednou a při dalších
          // nasazeních zůstanou v mezipaměti prohlížeče.
          'vendor-charts': ['recharts'],
        },
      },
    },
  },
});
