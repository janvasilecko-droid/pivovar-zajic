import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import starsiProhlizece from './scripts/postcss-starsi-prohlizece.mjs';

export default {
  // Pořadí je důležité: starsiProhlizece musí běžet až nad hotovým CSS z Tailwindu
  // (přepisuje selektory tmavé varianty, aby je rozebral i starší Android WebView).
  plugins: [tailwindcss, autoprefixer, starsiProhlizece()],
};
