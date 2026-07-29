import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Načti aktuální verzi z version.ts
const versionPath = resolve(__dirname, 'src/lib/version.ts');
const versionContent = readFileSync(versionPath, 'utf-8');
const versionMatch = versionContent.match(/APP_VERSION\s*=\s*'([^']+)'/);
const appVersion = versionMatch ? versionMatch[1] : '0.0.0';

// Použij aktuální timestamp při buildu
const now = new Date();
const appDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

// Vygeneruj version.json do public/ (zkopíruje se do dist/ při build)
const versionJsonPath = resolve(__dirname, 'public/version.json');
try {
  writeFileSync(versionJsonPath, JSON.stringify({ version: appVersion, date: appDate }, null, 2));
} catch (e) {
  // public/ nemusí existovat při clean checkout, nevadí
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  base: '/pivovar-zajic/', // GitHub Pages
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
        },
      },
    },
  },
});
