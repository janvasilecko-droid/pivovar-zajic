/* ─────────────────────────────────────────────────────────────────────────
   BARVY, KTERÉ SE OTÁČEJÍ V TMAVÉM REŽIMU
   ─────────────────────────────────────────────────────────────────────────
   Dřív to řešila v index.css ruční převodní tabulka `[class~="bg-amber-50"]`
   — jeden řádek na každou třídu. Měla dvě slabiny, které se nedaly zalepit:
   nešlo do ní vypsat varianty s průhledností (bg-amber-50/90, bg-white/95…),
   protože každá je pro Tailwind samostatná třída s napečenou barvou, a
   nepokrývala barevné rámečky vůbec. Chybělo v ní 907 použití — mimo jiné
   bílá hlavička každého modálu a 170× border-amber-200 svítící kolem tmavých
   karet.

   Teď je barva schovaná za CSS proměnnou a v tmavém režimu se mění jen její
   HODNOTA (viz :root.dark v index.css). Průhlednost si Tailwind dopočítá
   sám přes <alpha-value>, takže /90 i /15 fungují zadarmo — a co se napíše
   příště, funguje taky.

   Klíčové je, že se NEOTÁČÍ celá škála. Z čísel v kódu vyplývají tři role
   a každá se chová jinak:
     50–300   povrchy a rámečky (bg-amber-50, border-amber-200) → ztmavnou
     400–500  syté výplně (bg-amber-500 = hlavní tlačítko)      → beze změny
     600–950  písmo na podbarvení (text-rose-700)               → zesvětlá
   Proto se sahá zvlášť na backgroundColor, borderColor a textColor — kdyby
   šla přes jednu proměnnou celá paleta, `text-neutral-900` by zesvětlalo
   správně, ale `bg-neutral-900` (tmavé patičky tabulek) by se změnilo na
   bílý obdélník s bílým textem.
   ───────────────────────────────────────────────────────────────────────── */
const prom = (jmeno) => `rgb(var(--${jmeno}) / <alpha-value>)`;

const RODINY = ['neutral', 'amber', 'primary', 'emerald', 'rose', 'sky', 'violet'];

/** Odstíny, které v tmavém režimu slouží jako povrch (pozadí) — ztmavnou. */
const POVRCHY = ['50', '100', '200', '300'];
/** Tmavé plochy, které tmavé zůstávají, jen se musí odlišit od pozadí stránky. */
const TMAVE_PLOCHY = ['700', '800', '900', '950'];
/** Odstíny, které v tmavém režimu slouží jako rámeček — ztmavnou. */
const RAMECKY = ['100', '200', '300'];
/** Odstíny používané jako písmo — zesvětlají. */
const INKOUSTY = ['600', '700', '800', '900', '950'];

const skalaProm = (role, rodina, odstiny) =>
  Object.fromEntries(odstiny.map((o) => [o, prom(`${role}-${rodina}-${o}`)]));

const proRodiny = (role, odstiny, navic = {}) => ({
  ...Object.fromEntries(RODINY.map((r) => [r, skalaProm(role, r, odstiny)])),
  ...navic,
});

/** @type {import('tailwindcss').Config} */
export default {
  // Tmavý režim se řídí třídou .dark na <html>, ne nastavením systému.
  // Ve výchozím režimu (media) se všech 95 dark: variant v aplikaci spouštělo
  // samo podle telefonu a nešlo to vypnout — proto byly v index.css zneškodněné
  // tím, že se v tmavém režimu nastavovaly zpátky světlé barvy. Tohle je
  // příčina, kvůli které byl tmavý režim v lib/theme.ts natvrdo zakázaný.
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Inter a Sora tu stály jako záloha a v index.html se kvůli nim
        // stahovaly další dva soubory z Googlu — přitom se nikdy nepoužily,
        // protože první písmo v řadě je vždy k dispozici. Teď jsou obě
        // rodiny vlastní (public/fonts), takže záloha je jen systémová.
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Barvy jsou schválně JEN tyhle. Dřív tu vedle sebe stály dvě sady:
        // hlavní (amber / rose / emerald / sky, předělaná do vlastních tónů)
        // a druhá v původních, syrovějších odstínech (success, warning,
        // danger, accent, amberBeer). Znamenaly totéž, ale vypadaly jinak,
        // takže stejný stav svítil na různých obrazovkách jinou barvou —
        // a tmavý režim tu druhou sadu neznal, takže ji nepřebarvoval vůbec.
        //
        // Kdyby přibyl další význam, patří sem nová barva s vlastním jménem,
        // ne druhá varianta něčeho, co už tu je.
        // Hlavní akce (btn-primary, focus/selection) — hluboká měděná, sesterská
        // barva k amber níže. Dřív syté červená, která s jantarovým brandem
        // appky (nav, amber tlačítka) nesouzněla — teď tvoří jednu rodinu "zlato + měď".
        primary: {
          50:  '#fdf4ec',
          100: '#fbe3cc',
          200: '#f6c494',
          300: '#ef9e5c',
          400: '#e27c33',
          500: '#c85f1e',
          600: '#a64714',
          700: '#7f3612',
          800: '#5f2a12',
          900: '#451f10',
          950: '#271109',
        },
        // Přebarvení výchozí Tailwind palety amber-* (nejpoužívanější barva appky —
        // navigace, hlavní tlačítka) na hlubší, méně neonový "cínovaný zlatý" tón.
        amber: {
          50:  '#fef9ec',
          100: '#fcefc7',
          200: '#f8dd8a',
          300: '#f2c555',
          400: '#e6a62e',
          500: '#d4900f',
          600: '#b3730a',
          700: '#8c5a08',
          800: '#6b4508',
          900: '#4a2f08',
          950: '#2e1d05',
        },
        neutral: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#060a12',
        },
      },

      // Tři role, tři samostatné mapy — vysvětlení nahoře u definice `prom`.
      // Hodnoty proměnných (světlé i tmavé) jsou v src/index.css.
      backgroundColor: proRodiny('bg', POVRCHY, {
        // Tmavé plochy (patičky tabulek, tmavá tlačítka) musejí zůstat tmavé,
        // ale odlišit se od pozadí stránky — v tmavém režimu by jinak splynuly.
        neutral: skalaProm('bg', 'neutral', [...POVRCHY, ...TMAVE_PLOCHY]),
        // Kvůli tomuhle jednomu řádku funguje bg-white/95 (hlavička modálu),
        // bg-white/80 (skleněné lišty) i všechny ostatní varianty najednou.
        white: prom('bg-white'),
      }),
      borderColor: proRodiny('bd', RAMECKY),
      textColor: proRodiny('ink', INKOUSTY, {
        // U šedé je jako písmo v provozu i 400 a 500 (tlumené popisky).
        neutral: skalaProm('ink', 'neutral', ['400', '500', ...INKOUSTY]),
      }),
      // Přechody na kartách a na přihlašovací obrazovce (from-amber-100/90
      // via-amber-50/80 to-white) jsou plocha jako každá jiná — musí ztmavnout
      // se zbytkem, jinak zůstane svítit celé pozadí za kartami.
      // Sytější konce (from-amber-500/10) se neuvádějí schválně: ty jsou
      // barevný akcent a v tmavém režimu fungují stejně dobře.
      gradientColorStops: proRodiny('bg', POVRCHY, { white: prom('bg-white') }),
      boxShadow: {
        // `shadow-xs` a `shadow-2xs` jsou jména z Tailwindu v4. Tady běží v3,
        // který je nezná — na 78 souborech (karty, štítky, malá tlačítka,
        // hlavičky tabulek) se tedy negenerovalo vůbec nic a prvky zůstaly
        // úplně ploché. Doplňujeme je pod stejným jménem, ať se těch 78 míst
        // nemusí přepisovat; hodnoty jsou z v4, jen přebarvené do stejného
        // teplého hnědého tónu jako `card` níž.
        '2xs': '0 1px 1px 0 rgba(69, 31, 16, 0.05)',
        xs: '0 1px 2px 0 rgba(69, 31, 16, 0.07)',
        // Jemně teplý (hnědý, ne studeně šedý) odstín stínu — sedí s jantarovým
        // brandem líp než neutrální slate, aniž by byl nápadný.
        card: '0 2px 10px -2px rgba(69, 31, 16, 0.06), 0 1px 4px -1px rgba(69, 31, 16, 0.04)',
        cardHover: '0 16px 32px -8px rgba(69, 31, 16, 0.16), 0 6px 14px -3px rgba(69, 31, 16, 0.08)',
        glow: '0 0 20px -3px rgba(200, 95, 30, 0.35)',
        glowGold: '0 0 20px -3px rgba(212, 144, 15, 0.35)',
        sidebar: '6px 0 30px rgba(0, 0, 0, 0.35)',
        glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      borderRadius: {
        // Holé `rounded` je v aplikaci na 1600+ místech a Tailwind mu dává 4 px —
        // vedle karet (1,25 rem) a tlačítek (0,875 rem) to působilo tvrdě
        // a nesourodě. Změna výchozí hodnoty sjednotí vzhled naráz, bez
        // přepisování těch 1600 tříd.
        DEFAULT: '0.625rem',
        md: '0.5rem',
        xl: '0.875rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
      backdropBlur: {
        // Zase jméno z v4 (`backdrop-blur-xs`), na 15 místech — hlavně
        // ztmavená pozadí pod modály. Bez definice se rozmazání nedělo vůbec.
        xs: '4px',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-subtle': 'pulseSubtle 3s infinite',
        // Chybové hlášky u přihlášení a u změny hesla se na `animate-shake`
        // odvolávaly, ale nikde nebyl definovaný — zpráva jen tiše naskočila.
        shake: 'shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        // Pruh „je nová verze" nahoře (Layout.tsx). Třikrát poskočí a přestane;
        // věčné poskakování by u lišty, která zůstává na obrazovce, otravovalo.
        'bounce-short': 'bounceShort 1.1s ease-in-out 3',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(12px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.96)' }, to: { opacity: '1', transform: 'scale(1)' } },
        pulseSubtle: { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.6' } },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-4px)' },
          '40%, 80%': { transform: 'translateX(4px)' },
        },
        // Pruh je vodorovně vystředěný přes -translate-x-1/2, takže si posun
        // o -50 % musí nést i klíčové snímky — jinak by ho animace na dobu
        // svého běhu přetáhla doprava.
        bounceShort: {
          '0%, 100%': { transform: 'translate(-50%, 0)' },
          '50%': { transform: 'translate(-50%, -6px)' },
        },
      },
    },
  },
  plugins: [],
};
