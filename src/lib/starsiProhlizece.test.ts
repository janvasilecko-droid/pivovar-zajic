// @vitest-environment node
// 📱 Starší Android: hlídače, aby se oprava nerozbila tiše.
// ---------------------------------------------------------------------------
// Šéfovi nejde appka na starším telefonu (25. 11. 2026). Opravy žijí v nastavení sestavení, ne v kódu obrazovek,
// a žádná po zrušení nespadne — build projde a na novém telefonu je všechno stejné. Tenhle soubor hlídá tři věci:
//  1. nastavení sestavení (jazyková a CSS úroveň, plugin PostCSS) a skript, který čte hotové CSS;
//  2. plugin PostCSS na skutečném Tailwindu s ostrou konfigurací;
//  3. nový kód nesmí sáhnout na funkci prohlížeče novější než podlaha, kterou nedoplňují záplaty v index.html.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { join } from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import starsiProhlizece from '../../scripts/postcss-starsi-prohlizece.mjs';
import { zkontrolujCss, zkontrolujIndexHtml } from '../../scripts/zkontroluj-css-podlaha.mjs';

const zpracuj = async (css: string) => (await postcss([starsiProhlizece()]).process(css, { from: undefined })).css;

describe('PostCSS plugin starsiProhlizece (tmavá varianta bez :is())', () => {
  it('přepíše X:is(.dark *) na .dark X', async () => {
    expect(await zpracuj('.dark\\:bg-neutral-800:is(.dark *) { color: red }')).toBe('.dark .dark\\:bg-neutral-800 { color: red }');
  });

  it('zachová pseudotřídu před i kombinátory za třídou', async () => {
    expect(await zpracuj('.dark\\:hover\\:bg-x:hover:is(.dark *) { a: b }')).toBe('.dark .dark\\:hover\\:bg-x:hover { a: b }');
    expect(await zpracuj('.dark\\:divide-x:is(.dark *) > :not([hidden]) ~ :not([hidden]) { a: b }'))
      .toBe('.dark .dark\\:divide-x > :not([hidden]) ~ :not([hidden]) { a: b }');
  });

  it('přepíše jen ty selektory čárkového seznamu, které :is(.dark *) mají (na kterémkoli místě)', async () => {
    expect(await zpracuj('.a:is(.dark *), .b { c: d }')).toBe('.dark .a, .b { c: d }');
    expect(await zpracuj('.b, .a:is(.dark *) { c: d }')).toBe('.b, .dark .a { c: d }');
    expect(await zpracuj('.a:is(.dark *), .b:is(.dark *) { c: d }')).toBe('.dark .a, .dark .b { c: d }');
  });

  it('pravidla v @media zůstanou v @media a ve stejném pořadí', async () => {
    const vystup = await zpracuj('.a:is(.dark *) { x: 1 }\n@media (min-width: 640px) { .sm\\:b:is(.dark *) { x: 2 } }\n.c { x: 3 }');
    expect(vystup).toBe('.dark .a { x: 1 }\n@media (min-width: 640px) { .dark .sm\\:b { x: 2 } }\n.c { x: 3 }');
  });

  it('ostatní :is() (ruční pravidla v index.css) nechá být', async () => {
    const vstup = ':root.dark :is([class~="bg-amber-400"]):is([class*="text-neutral-9"]) { color: #0f172a !important }';
    expect(await zpracuj(vstup)).toBe(vstup);
    expect(await zpracuj('.a:is(.light *) { x: y }')).toBe('.a:is(.light *) { x: y }');
  });

  it('běží i na CSS bez jediné tmavé třídy a nic nemění', async () => {
    const vstup = '.a { b: c }\n@media print { .d { e: f } }';
    expect(await zpracuj(vstup)).toBe(vstup);
  });

  it('s ostrou konfigurací Tailwindu: žádné :is(.dark *) a pravidla dark: zůstanou před responzivními (pořadí)', async () => {
    const konfigurace = (await import('../../tailwind.config.js')).default as Record<string, unknown>;
    const html = '<div class="dark:bg-neutral-900 dark:hover:bg-neutral-700 dark:divide-neutral-700 divide-y sm:dark:bg-neutral-800 sm:p-4 md:p-6"></div>';
    const vstup = '@tailwind utilities;';
    const bez = (await postcss([tailwindcss({ ...konfigurace, content: [{ raw: html }] })]).process(vstup, { from: undefined })).css;
    const s = (await postcss([tailwindcss({ ...konfigurace, content: [{ raw: html }] }), starsiProhlizece()]).process(vstup, { from: undefined })).css;
    // Předpoklad testu: bez pluginu Tailwind opravdu píše :is(.dark *) — jinak by test nic nedokazoval.
    expect(bez).toContain(':is(.dark *)');
    expect(s).not.toContain(':is(.dark *)');
    for (const trida of ['.dark .dark\\:bg-neutral-900', '.dark .dark\\:hover\\:bg-neutral-700:hover', '.dark .dark\\:divide-neutral-700 > :not([hidden]) ~ :not([hidden])']) {
      expect(s, trida).toContain(trida);
    }
    // Pořadí pravidel i počet jsou beze změny proti výstupu bez pluginu (selektor se v obou výstupech sjednotí).
    const poradi = (css: string) => {
      const out: string[] = [];
      postcss.parse(css).walkRules((r) => {
        const media = r.parent && r.parent.type === 'atrule' ? `@${(r.parent as postcss.AtRule).params} ` : '';
        out.push(media + r.selector.replace(/^\.dark /, '').replace(':is(.dark *)', ''));
      });
      return out;
    };
    expect(poradi(s)).toEqual(poradi(bez));
    // …a to pořadí je to, které Tailwind dává záměrně: obyčejné → dark: → responzivní, a sm:dark: až za sm: (jinak by dark: přebilo sm:dark:).
    expect(poradi(s)).toEqual([
      '.divide-y > :not([hidden]) ~ :not([hidden])',
      '.dark\\:divide-neutral-700 > :not([hidden]) ~ :not([hidden])',
      '.dark\\:bg-neutral-900',
      '.dark\\:hover\\:bg-neutral-700:hover',
      '@(min-width: 640px) .sm\\:p-4',
      '@(min-width: 640px) .sm\\:dark\\:bg-neutral-800',
      '@(min-width: 768px) .md\\:p-6',
    ]);
    expect(s.indexOf('.dark .dark\\:bg-neutral-900')).toBeLessThan(s.indexOf('@media (min-width: 640px)'));
  }, 30000);
});

describe('zkontrolujCss — hotové CSS bez pastí pro starší prohlížeč', () => {
  it('čisté CSS projde', () => {
    expect(zkontrolujCss('.a{top:0;right:0}.dark .b{color:red}.c{max-height:calc(100vh - 1rem);max-height:calc(100dvh - 1rem)}')).toEqual([]);
  });

  it(':is(.dark *) hlásí s počtem', () => {
    const p = zkontrolujCss('.a:is(.dark *){x:y}.b:is(.dark *){x:y}');
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('2×');
    expect(p[0]).toContain('postcss-starsi-prohlizece');
  });

  it('inset: hlásí, ale safe-area-inset, --tw-ring-inset a inset-inline ne', () => {
    expect(zkontrolujCss('.a{inset:0}')[0]).toContain('inset:');
    expect(zkontrolujCss('.a{position:fixed;inset:0px}')).toHaveLength(1);
    expect(zkontrolujCss('.a{padding:env(safe-area-inset-bottom)}.b{--tw-ring-inset: ;}.c{inset-inline:0}.d{margin-inset:0}')).toEqual([]);
    expect(zkontrolujCss('.a{inset:0}')[0]).toContain('cssTarget');
  });

  it('dvh bez zálohy hlásí s názvem pravidla a vlastnosti', () => {
    const p = zkontrolujCss('.okno{max-height:calc(100dvh - 1rem)}');
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('.okno');
    expect(p[0]).toContain('max-height');
  });

  it('svh a lvh se berou stejně jako dvh', () => {
    expect(zkontrolujCss('.a{height:100svh}')).toHaveLength(1);
    expect(zkontrolujCss('.a{min-height:100lvh}')).toHaveLength(1);
  });

  it('záloha musí být PŘED dvh, ve stejném pravidle a pro stejnou vlastnost', () => {
    expect(zkontrolujCss('.a{height:100vh;height:100dvh}')).toEqual([]);
    expect(zkontrolujCss('.a{height:100dvh;height:100vh}')).toHaveLength(1);
    expect(zkontrolujCss('.a{width:100vh;height:100dvh}')).toHaveLength(1);
    expect(zkontrolujCss('.a{height:100vh}.b{height:100dvh}')).toHaveLength(1);
  });

  it('dvh v pravidle uvnitř @media se kontroluje taky', () => {
    expect(zkontrolujCss('@media (min-width:640px){.a{height:100dvh}}')).toHaveLength(1);
    expect(zkontrolujCss('@media (min-width:640px){.a{height:100vh;height:100dvh}}')).toEqual([]);
  });

  it('proměnné (--x: 100dvh) se nekontrolují — jen se uloží, ne použijí', () => {
    expect(zkontrolujCss('.a{--vyska:100dvh}')).toEqual([]);
  });

  it('víc problémů najednou se vypíše všechno', () => {
    expect(zkontrolujCss('.a:is(.dark *){inset:0}.b{height:100dvh}')).toHaveLength(3);
  });
});

describe('zkontrolujIndexHtml — záplaty a záchranná obrazovka přežily sestavení', () => {
  const ok = [
    "<script>var z = 'randomUUID';</script>",
    '<script>window.__zajicZachrana = function () {};</script>',
    '<script type="module" crossorigin src="/assets/index-abc.js"></script>',
    "<script nomodule>window.__zajicZachrana('moduly');</script>",
  ].join('\n');

  it('hotový index.html projde — i když Vite modul přesunul před nomodule skript', () => {
    expect(zkontrolujIndexHtml(ok)).toEqual([]);
  });

  it('skutečný index.html z repozitáře projde (zdroj, ne sestavení)', () => {
    expect(zkontrolujIndexHtml(readFileSync('index.html', 'utf8').replace('/src/main.tsx" ', '/src/main.tsx" '))).toEqual([]);
  });

  it('chybějící části hlásí jednotlivě', () => {
    expect(zkontrolujIndexHtml(ok.replace("'randomUUID'", "'x'"))[0]).toContain('záplatami');
    expect(zkontrolujIndexHtml(ok.replace('__zajicZachrana = ', 'jinak = '))[0]).toContain('záchrannou obrazovkou');
    expect(zkontrolujIndexHtml(ok.replace(/<script nomodule>.*<\/script>/, ''))[0]).toContain('nomodule');
    expect(zkontrolujIndexHtml(ok.replace('type="module" ', ''))[0]).toContain('type="module"');
  });

  it('skript s async/defer/type="module" není klasický (spustil by se až po knihovnách)', () => {
    for (const atr of ['async', 'defer', 'type="module"']) {
      const html = ok.replace('<script>var z', `<script ${atr}>var z`);
      expect(zkontrolujIndexHtml(html).join(' '), atr).toContain('záplatami');
    }
  });
});

describe('service worker se rozebere i na Chromu 66', () => {
  // public/sw.js se nezpracovává Vitem — jde do prohlížeče tak, jak je napsaný. Starší Chrome ho při první
  // syntaxi, které nerozumí, vůbec nezaregistruje (offline režim pak tiše chybí). `?.` a `??` umí Chrome 80.
  // Esbuild ví přesně, co Chrome 66 neumí: pro tenhle cíl by novější zápis přepsal, a výstup by se pak lišil od
  // výstupu bez přepisu.
  it('public/sw.js nepoužívá syntaxi, kterou Chrome 66 nezná (?. ?? ??= třídní pole …)', () => {
    const zdroj = readFileSync('public/sw.js', 'utf8');
    const pro66 = transformSync(zdroj, { target: 'chrome66', loader: 'js' }).code;
    const bezPrepisu = transformSync(zdroj, { target: 'esnext', loader: 'js' }).code;
    expect(pro66 === bezPrepisu, 'sw.js obsahuje novější syntaxi — přepiš ji (info && info.version místo info?.version)').toBe(true);
  });

  it('kontrola umí novější syntaxi poznat (jinak by nic nehlídala)', () => {
    const novejsi = 'const a = x?.y; const b = x ?? 1;';
    expect(transformSync(novejsi, { target: 'chrome66', loader: 'js' }).code).not.toBe(transformSync(novejsi, { target: 'esnext', loader: 'js' }).code);
  });
});

describe('nastavení sestavení drží podlahu prohlížeče', () => {
  it('vite.config.ts snižuje JS na es2015 a CSS na chrome64', () => {
    const v = readFileSync('vite.config.ts', 'utf8');
    expect(v).toMatch(/target:\s*'es2015'/);
    expect(v).toMatch(/cssTarget:\s*'chrome64'/);
  });

  it('postcss.config.js pouští plugin starsiProhlizece po Tailwindu', () => {
    const p = readFileSync('postcss.config.js', 'utf8');
    expect(p).toContain('starsiProhlizece()');
    expect(p.indexOf('tailwindcss')).toBeLessThan(p.lastIndexOf('starsiProhlizece()'));
    expect(p).toMatch(/plugins:\s*\[tailwindcss,\s*autoprefixer,\s*starsiProhlizece\(\)\]/);
  });

  it('workflow nasazení pouští kontrolu sestavení pro starší Android a skript je v package.json', () => {
    expect(readFileSync('.github/workflows/deploy.yml', 'utf8')).toContain('npm run zkontroluj-css-podlaha');
    expect(JSON.parse(readFileSync('package.json', 'utf8')).scripts['zkontroluj-css-podlaha']).toBe('node scripts/zkontroluj-css-podlaha.mjs');
  });
});

describe('kód aplikace nesahá na funkce novější než podlaha prohlížeče', () => {
  /** Všechny zdrojové soubory aplikace (bez testů). */
  function zdroje(dir = 'src'): string[] {
    return readdirSync(dir).flatMap((j) => {
      const c = join(dir, j);
      if (statSync(c).isDirectory()) return j === 'test' ? [] : zdroje(c);
      return /\.(ts|tsx)$/.test(j) && !/\.(test|spec)\.(ts|tsx)$/.test(j) && !/\.d\.ts$/.test(j) ? [c] : [];
    });
  }
  const SOUBORY = zdroje().map((c) => ({ cesta: c, radky: readFileSync(c, 'utf8').split('\n') }));
  const najdi = (re: RegExp, vyjimka?: (radek: string) => boolean) =>
    SOUBORY.flatMap(({ cesta, radky }) => radky
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => re.test(r) && !/^\s*(\/\/|\*|\/\*)/.test(r) && !(vyjimka && vyjimka(r)))
      .map(({ r, i }) => `${cesta}:${i + 1}  ${r.trim().slice(0, 110)}`));

  // Funkce, které záplaty v index.html NEdoplňují. Když je kód potřebuje, buď se přidá záplata (index.html +
  // test v startovniPojistka.test.ts + řádek v diagnostika.html), nebo se použije starší zápis.
  const ZAKAZANE: [string, RegExp, string][] = [
    ['String.replaceAll (Chrome 85)', /\.replaceAll\(/, 'použij .replace(/…/g, …)'],
    ['Array/String.at (Chrome 92)', /\.at\(-?\d/, 'použij [i] nebo [length - 1]'],
    ['findLast / findLastIndex (Chrome 97)', /\.findLast(Index)?\(/, 'použij cyklus od konce'],
    ['toSorted / toReversed / toSpliced (Chrome 110)', /\.(toSorted|toReversed|toSpliced)\(/, 'použij [...pole].sort() apod.'],
    ['Object.groupBy / Map.groupBy (Chrome 117)', /\b(Object|Map)\.groupBy\(/, 'použij reduce'],
    ['Promise.any (Chrome 85)', /Promise\.any\(/, 'použij Promise.race nebo allSettled'],
    ['Promise.withResolvers (Chrome 119)', /Promise\.withResolvers\(/, 'napiš vlastní'],
    ['AbortSignal.timeout / any (Chrome 103 / 116)', /AbortSignal\.(timeout|any)\(/, 'použij AbortController + setTimeout'],
    ['Array.fromAsync (Chrome 121)', /Array\.fromAsync\(/, 'použij cyklus s await'],
    ['URL.canParse (Chrome 120)', /URL\.canParse\(/, 'použij try { new URL(…) }'],
    ['Intl.Segmenter (Chrome 87)', /Intl\.Segmenter/, 'použij jiný způsob dělení textu'],
    ['dvh / svh / lvh ve třídě nebo stylu (Chrome 108)', /\d(d|s|l)vh/, 'použij třídu max-h-ekran (index.css) nebo vlastní třídu se zálohou vh'],
  ];
  for (const [nazev, re, rada] of ZAKAZANE) {
    it(`bez ${nazev}`, () => {
      expect(najdi(re), `Nalezeno ${nazev} — ${rada}. Souvislosti: src/lib/podlahaProhlizece.ts`).toEqual([]);
    });
  }

  it('structuredClone jen s kontrolou typeof (Chrome 98)', () => {
    expect(najdi(/structuredClone\(/, (r) => /typeof structuredClone/.test(r))).toEqual([]);
  });

  it('crypto.randomUUID smí zůstat — doplňuje ho záplata v index.html (a tu hlídá startovniPojistka.test.ts)', () => {
    expect(najdi(/randomUUID\(/).length).toBeGreaterThan(0); // předpoklad: kód ho používá
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain("pridej(c, 'randomUUID'");
  });

  it('každá novější funkce, kterou kód volá bez kontroly, má v index.html záplatu', () => {
    const html = readFileSync('index.html', 'utf8');
    const PODMINENE: [RegExp, string][] = [
      [/Object\.fromEntries\(/, "pridej(Object, 'fromEntries'"],
      [/Object\.hasOwn\(/, "pridej(Object, 'hasOwn'"],
      [/\.flatMap\(/, "pridej(Array.prototype, 'flatMap'"],
      [/\.flat\(/, "pridej(Array.prototype, 'flat'"],
      [/\.matchAll\(/, "pridej(String.prototype, 'matchAll'"],
      [/\.replaceChildren\(/, "'replaceChildren'"],
      [/queueMicrotask\(/, "pridej(g, 'queueMicrotask'"],
      [/\bglobalThis\b/, "'globalThis'"],
    ];
    for (const [re, zaplata] of PODMINENE) {
      if (najdi(re).length > 0) expect(html, `kód používá ${re}, ale index.html nemá záplatu ${zaplata}`).toContain(zaplata);
    }
  });
});

describe('dvh v ručním CSS má zálohu', () => {
  it('každé dvh/svh/lvh v src/index.css stojí za řádkem s obyčejným vh', () => {
    const css = readFileSync('src/index.css', 'utf8');
    // Komentáře se vynechají (v nich se o dvh píše).
    const bezKomentaru = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(zkontrolujCss(bezKomentaru.replace(/\s+/g, ' ').replace(/ ?\{ ?/g, '{').replace(/ ?\} ?/g, '}').replace(/ ?; ?/g, ';'))
      .filter((p) => /vh/.test(p))).toEqual([]);
  });
});
