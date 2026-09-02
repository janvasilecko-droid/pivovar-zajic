// Vite pro náhledovou stránku (`nahled/`). S produkčním buildem nemá nic
// společného — ten bere `index.html` v korenu a tenhle soubor nečte.
//
//   npx vite --config vite.nahled.config.ts
//
// Jediný trik je podstrčení Supabase: `src/lib/supabase.ts` si při načtení
// vytvoří klienta z `VITE_SUPABASE_*` a bez nich spadne na „supabaseUrl is
// required". Náhled proto ten modul vymění za `nahled/mock/supabase.ts` —
// přesměrovává se podle CESTY, ne podle textu importu, takže to platí i pro
// moduly, které si ho tahají z jiné hloubky (`./supabase` vs `../lib/supabase`).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRAVY = resolve(__dirname, 'src/lib/supabase.ts');
const NAHRADA = resolve(__dirname, 'nahled/mock/supabase.ts');

export default defineConfig({
  root: resolve(__dirname, 'nahled'),
  plugins: [
    {
      name: 'nahled-podstrc-supabase',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (source.includes('mock/supabase')) return null; // sama náhrada
        const vysledek = await this.resolve(source, importer, { ...options, skipSelf: true });
        if (vysledek && resolve(vysledek.id.split('?')[0]) === PRAVY) return NAHRADA;
        return null;
      },
    },
    react(),
  ],
  resolve: { dedupe: ['react', 'react-dom'] },
  define: { __APP_VERSION__: JSON.stringify('nahled') },
  server: { port: 5199, host: true, allowedHosts: true },
});
