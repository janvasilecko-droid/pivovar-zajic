import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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
        /**
         * Rozdělení knihoven do vlastních kusů — ZÁPISEM PŘES FUNKCI, ne
         * objektem.
         *
         * Objektový zápis (`{'vendor-react': ['react','react-dom'], …}`)
         * pojmenuje jen ty konkrétní moduly; co si React vtáhne dovnitř
         * (`react/jsx-runtime`, `scheduler`) a co ho sdílí s recharts, si
         * rollup rozdělí sám — a rozdělil si to tak, že celý React skončil
         * v `vendor-charts`. Naměřeno na buildu: `vendor-react` měl 0,07 kB
         * (jen dva importy), `createRoot` i „Minified React error" seděly
         * v `vendor-charts`, a protože se bez Reactu appka nespustí, dal
         * jí vite do `index.html` `modulepreload` na celý ten kus. Každý
         * tedy při startu stahoval 537 kB grafů, i když Statistiku nikdy
         * neotevřel.
         *
         * Funkční zápis rozhoduje podle CESTY modulu, takže do
         * `vendor-react` spadne i jsx-runtime a scheduler a recharts si
         * React nemůže odnést s sebou. Pořadí větví je podstatné: react-dom
         * i scheduler obsahují „react" v cestě, proto se testuje celý
         * `/node_modules/<jméno>/`.
         */
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          const cesta = id.replace(/\\/g, '/');
          const je = (...jmena: string[]) =>
            jmena.some((j) => cesta.includes(`/node_modules/${j}/`) || cesta.includes(`/node_modules/.pnpm/${j}@`));

          if (je('react', 'react-dom', 'scheduler', 'react-is')) return 'vendor-react';
          if (je('@supabase/supabase-js', '@supabase/auth-js', '@supabase/postgrest-js',
                 '@supabase/realtime-js', '@supabase/storage-js', '@supabase/functions-js',
                 '@supabase/node-fetch')) return 'vendor-supabase';
          if (je('lucide-react')) return 'vendor-icons';
          // Grafy (recharts) mají vlastní kus schválně. Byly zapečené
          // v chunku Statistiky, takže každá úprava History.tsx — tedy
          // i změna popisku — nutila každého stáhnout znovu celých
          // 501 kB. Jako samostatný kus se stáhnou jednou a při dalších
          // nasazeních zůstanou v mezipaměti prohlížeče. Sem patří
          // i knihovny, které recharts používá jen ony (d3-*, victory-vendor),
          // ať se s ním stáhnou naráz a ne po kouskách.
          if (je('recharts', 'victory-vendor') || cesta.includes('/node_modules/d3-')) return 'vendor-charts';
          return undefined;
        },
      },
    },
  },
});
