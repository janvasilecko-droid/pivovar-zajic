#!/usr/bin/env node
/**
 * ⏱️ MĚŘENÍ PLYNULOSTI — „seká se to" změřené, ne odhadnuté.
 *
 * Proč to vzniklo: z hlášení „seká se to" nejde poznat, jestli za to může
 * překreslování, JavaScript, nebo počet prvků. Hádat a přitom sahat na
 * vzhled, který si majitel navrhl, je ta nejhorší kombinace.
 *
 * Co měří:
 *  1) Kolik prvků na stránce má `backdrop-filter` (rozostření podkladu).
 *     Každý takový prvek je pro prohlížeč SAMOSTATNÝ průchod — okno se
 *     ofotí, rozostří a složí zpátky. Na telefonu je to nejdražší efekt,
 *     jaký se dá v CSS zapnout, a jejich POČET je to, co rozhoduje.
 *  2) Kolik prvků má nekonečnou animaci a jestli animuje vlastnost, která
 *     nutí překreslovat (`background`, `filter`, `box-shadow`) — proti
 *     `transform`/`opacity`, které umí složit grafická karta.
 *  3) Délky snímků při rolování se ZPOMALENÝM procesorem (výchozí 4×), což
 *     je hrubá náhrada za prostřední Android. Plynulé je 16,7 ms na snímek.
 *
 * Použití:
 *   npx vite --config vite.nahled.config.ts     (v jednom okně)
 *   node scripts/vykon.mjs                      (ve druhém)
 *   node scripts/vykon.mjs --zpomaleni 6        (pomalejší telefon)
 *
 * Bez prohlížeče nebo bez běžícího náhledu NEPADÁ — řekne proč a skončí nulou.
 */
import { existsSync } from 'node:fs';

const ADRESA = process.env.NAHLED_URL ?? 'http://localhost:5199';
const argv = process.argv.slice(2);
const ZPOMALENI = Number(argv[argv.indexOf('--zpomaleni') + 1]) || 4;
const KANDIDATI = [
  process.env.CHROMIUM_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

function preskoc(duvod) {
  console.log(`Měření přeskočeno: ${duvod}`);
  process.exit(0);
}

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  preskoc('chybí playwright-core (npm install)');
}
const prohlizec = KANDIDATI.find((c) => existsSync(c));
if (!prohlizec) preskoc('nenašel jsem prohlížeč (nastav CHROMIUM_PATH)');
try {
  const r = await fetch(`${ADRESA}/plocha-ram.html`);
  if (!r.ok) throw new Error(String(r.status));
} catch {
  preskoc(`na ${ADRESA} nic neběží (npx vite --config vite.nahled.config.ts)`);
}

/** Co na stránce stojí výkon. Běží v prohlížeči. */
const SBER = () => {
  const vse = Array.from(document.querySelectorAll('*'));
  const rozostreni = [];
  const animace = [];
  const DRAHE = ['background', 'background-color', 'filter', 'box-shadow', 'all'];
  for (const el of vse) {
    const s = getComputedStyle(el);
    const bf = s.backdropFilter || s.webkitBackdropFilter;
    if (bf && bf !== 'none') {
      rozostreni.push({ trida: el.className?.toString().slice(0, 40) || el.tagName, efekt: bf });
    }
    if (s.animationIterationCount.split(',').includes('infinite')) {
      animace.push({ trida: el.className?.toString().slice(0, 40) || el.tagName, jmeno: s.animationName });
    }
    // `transition: all` překresluje i to, co se vůbec nemění. POZOR:
    // výchozí hodnota `transition-property` JE `all`, takže se musí ptát
    // i na dobu trvání — jinak se napočítají úplně všechny prvky (což byla
    // první verze tohohle měření a hlásila nesmysl: 159 ze 159).
    const doba = s.transitionDuration.split(', ').some((d) => parseFloat(d) > 0);
    if (doba && s.transitionProperty.split(', ').some((p) => DRAHE.includes(p))) {
      el.dataset.drahyPrechod = '1';
    }
  }
  return {
    rozostreni,
    animace,
    drahePrechody: document.querySelectorAll('[data-drahy-prechod]').length,
    prvku: vse.length,
  };
};

/** Délky snímků při rolování. Rolujeme uvnitř dokumentu i v případných iframe. */
const ROLUJ = async () => {
  const snimky = [];
  let posledni = performance.now();
  let bezi = true;
  const tik = () => {
    const ted = performance.now();
    snimky.push(ted - posledni);
    posledni = ted;
    if (bezi) requestAnimationFrame(tik);
  };
  requestAnimationFrame(tik);
  const cil = document.scrollingElement || document.documentElement;
  for (let i = 0; i < 60; i++) {
    cil.scrollTop = (i % 2 === 0 ? 1 : 0) * 400 + i * 4;
    await new Promise((r) => setTimeout(r, 16));
  }
  bezi = false;
  await new Promise((r) => setTimeout(r, 50));
  return snimky.slice(2); // první dva snímky jsou rozjezd
};

const b = await chromium.launch({ executablePath: prohlizec, args: ['--no-sandbox'] });
const vysledky = [];
try {
  for (const stranka of ['plocha-ram.html', 'prvky.html']) {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } });
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: ZPOMALENI });
    await p.goto(`${ADRESA}/${stranka}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(300);

    // Náhled plochy staví varianty do iframe — měříme uvnitř nich.
    const ramy = p.frames().filter((f) => f !== p.mainFrame());
    const kdeMerit = ramy.length ? ramy : [p.mainFrame()];

    const secti = async () => {
      const sber = { rozostreni: [], animace: [], drahePrechody: 0, prvku: 0 };
      for (const f of kdeMerit) {
        const d = await f.evaluate(SBER);
        sber.rozostreni.push(...d.rozostreni);
        sber.animace.push(...d.animace);
        sber.drahePrechody += d.drahePrechody;
        sber.prvku += d.prvku;
      }
      return sber;
    };
    const sber = await secti();

    // A totéž se zapnutým „méně efektů" (lib/efekty.ts), ať je vidět, co
    // ten přepínač uživateli doopravdy ubere — ne co si o tom myslíme.
    for (const f of kdeMerit) {
      await f.evaluate(() => document.documentElement.classList.add('mene-efektu'));
    }
    await p.waitForTimeout(200);
    const sberBezEfektu = await secti();
    for (const f of kdeMerit) {
      await f.evaluate(() => document.documentElement.classList.remove('mene-efektu'));
    }
    await p.waitForTimeout(200);

    const snimky = await kdeMerit[0].evaluate(ROLUJ);
    const serazene = [...snimky].sort((a, z) => a - z);
    const median = serazene[Math.floor(serazene.length / 2)] ?? 0;
    const nejhorsi = serazene[serazene.length - 1] ?? 0;
    const zahozene = snimky.filter((s) => s > 32).length;

    vysledky.push({ stranka, ...sber, sberBezEfektu, median, nejhorsi, zahozene, snimku: snimky.length });
    await p.close();
  }
} finally {
  await b.close();
}

console.log(`\nMěření plynulosti (procesor zpomalený ${ZPOMALENI}×, okno 390 px)\n`);
for (const v of vysledky) {
  const skupiny = {};
  for (const r of v.rozostreni) skupiny[r.efekt] = (skupiny[r.efekt] || 0) + 1;
  console.log(`── ${v.stranka} (${v.prvku} prvků)`);
  console.log(`   rozostření podkladu:  ${v.rozostreni.length} prvků` +
    (v.rozostreni.length ? `  [${Object.entries(skupiny).map(([e, n]) => `${n}× ${e}`).join(', ')}]` : ''));
  console.log(`   nekonečné animace:    ${v.animace.length} prvků` +
    (v.animace.length ? `  [${[...new Set(v.animace.map((a) => a.jmeno))].join(', ')}]` : ''));
  console.log(`   drahé přechody:       ${v.drahePrechody} prvků`);
  console.log(`   snímek při rolování:  medián ${v.median.toFixed(1)} ms, nejhorší ${v.nejhorsi.toFixed(1)} ms` +
    `, přes 32 ms: ${v.zahozene} z ${v.snimku}`);
  console.log(`   se „MÉNĚ EFEKTŮ":     rozostření ${v.rozostreni.length} → ${v.sberBezEfektu.rozostreni.length}` +
    `, nekonečné animace ${v.animace.length} → ${v.sberBezEfektu.animace.length}`);
  console.log('');
}
console.log('Plynulé je 16,7 ms na snímek. Rozostření podkladu je na telefonu');
console.log('nejdražší efekt v CSS a rozhoduje jejich POČET, ne síla rozostření.\n');
