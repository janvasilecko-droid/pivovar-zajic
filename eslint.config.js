// 🧹 ESLint — do 5. 9. 2026 projekt žádný neměl.
//
// 96 tisíc řádků bez lintu znamená, že se celá třída chyb hledala rukama.
// Nejdražší z nich je `react-hooks/exhaustive-deps`: dvanáct obrazovek mělo
// načítání dat v `useEffect` bez úklidu a bez zrušení, takže se odpověď
// vracela do komponenty, která už není vidět — a při dvou odpovědích
// v opačném pořadí přepsal starší stav ten novější. To se hlásí jako
// „ukázalo mi to staré číslo" a nedá se zopakovat.
//
// ZÁMĚRNĚ MÍRNÉ NASTAVENÍ. Zapnout všechno doporučené by dalo tisíce hlášek
// a nikdo by je nečetl. Tady jsou jako CHYBA jen pravidla, která odpovídají
// skutečné chybě v provozu; zbytek je varování, aby šel dluh vidět a
// utahovat se po částech. CI pouští `npm run lint`, který varování toleruje
// a padá jen na chybách.
//
// Prettier tu schválně NENÍ: přeformátovat 96 tisíc řádků by pohřbilo
// historii gitu a hlavně komentáře, které v tomhle projektu vysvětlují, PROČ
// je něco tak, jak je. Odsazení hlídá .editorconfig.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    // Sem lint nechodí: sestavené soubory, závislosti, nativní obal a
    // pomocné skripty (ty běží v Node a mají vlastní styl).
    ignores: [
      'dist/**', 'node_modules/**', 'android/**', 'coverage/**',
      'public/sw.js', 'scripts/**', 'nahled/**', 'whatsapp-bridge/**',
      'supabase/functions/**', '*.mjs', '*.cjs', '*.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', sessionStorage: 'readonly', console: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        fetch: 'readonly', crypto: 'readonly', caches: 'readonly',
        alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
        Blob: 'readonly', File: 'readonly', FileReader: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', Image: 'readonly',
        FormData: 'readonly', Headers: 'readonly', Request: 'readonly', Response: 'readonly',
        AbortController: 'readonly', IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly', MutationObserver: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        matchMedia: 'readonly', getComputedStyle: 'readonly',
        performance: 'readonly', structuredClone: 'readonly',
        HTMLElement: 'readonly', HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly', HTMLSelectElement: 'readonly',
        HTMLCanvasElement: 'readonly', HTMLImageElement: 'readonly',
        HTMLDivElement: 'readonly', HTMLIFrameElement: 'readonly',
        SVGSVGElement: 'readonly', Element: 'readonly', Node: 'readonly',
        Event: 'readonly', CustomEvent: 'readonly', KeyboardEvent: 'readonly',
        MouseEvent: 'readonly', TouchEvent: 'readonly', PointerEvent: 'readonly',
        MessageEvent: 'readonly', ErrorEvent: 'readonly',
        PromiseRejectionEvent: 'readonly', StorageEvent: 'readonly',
        MediaRecorder: 'readonly', AudioContext: 'readonly',
        Notification: 'readonly', ServiceWorkerRegistration: 'readonly',
        WebSocket: 'readonly', DOMParser: 'readonly', TextDecoder: 'readonly',
        TextEncoder: 'readonly', btoa: 'readonly', atob: 'readonly',
        __APP_VERSION__: 'readonly', process: 'readonly',
        React: 'readonly', JSX: 'readonly', NodeJS: 'readonly',
      },
    },
    rules: {
      // ── Chyby: odpovídají skutečné chybě, která se v provozu stala ──
      // Chybějící úklid a chybějící závislosti v useEffect — viz hlavička.
      'react-hooks/rules-of-hooks': 'error',
      // Prázdný `catch {}` spolkne chybu i s důvodem. Aplikace má hlášení
      // chyb do tabulky `chyby_aplikace`, ale to, co se spolkne, se do něj
      // nedostane.
      'no-empty': ['error', { allowEmptyCatch: true }],
      // `==` mezi číslem a řetězcem je v appce, kde množství chodí z pole
      // jako text a ze skladu jako číslo, tichá past.
      eqeqeq: ['error', 'smart'],
      'no-fallthrough': 'error',
      'no-dupe-keys': 'error',
      'no-unsafe-optional-chaining': 'error',

      // ── Varování: dluh, který je vidět a utahuje se po částech ──
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none',
      }],

      // ── Vypnuto s důvodem ──
      // 42 hlášek, všechny neškodné: `\.` uvnitř třídy znaků (`[\.,;:!?]`)
      // je čitelnější než holá tečka a `\"` v jednoduchých uvozovkách je
      // zbytek po převodu textů. Bug to není ani v jednom případě.
      'no-useless-escape': 'off',
      // `onRefreshOrders && onRefreshOrders()` je v tomhle kódu zavedený
      // zápis pro nepovinnou obsluhu. Přepisovat šest míst na `?.()` by byl
      // hluk bez užitku.
      '@typescript-eslint/no-unused-expressions': ['warn', {
        allowShortCircuit: true, allowTernary: true,
      }],
      // Prázdný objektový typ hlásí i `{}` v generikách u Supabase klienta.
      '@typescript-eslint/no-empty-object-type': 'off',
      // `require` se v projektu nepoužívá, ale pravidlo hlásí i `import()`
      // v testech.
      '@typescript-eslint/no-require-imports': 'off',
      // Nefunkční u proměnných deklarovaných přes `var` v service workeru.
      'no-undef': 'off',
    },
  },
);
