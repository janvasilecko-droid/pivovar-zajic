/**
 * Hlídač kontrastu písma vůči podkladu.
 *
 * Kontrast se do téhle chvíle kontroloval okem, obrazovku po obrazovce —
 * což najde jen to, co je zrovna vidět. Kombinace „světlé písmo na světlé
 * výplni" ale často sedí ve stavu, který se běžně nezobrazí (chybová hláška,
 * prázdný seznam, jiná role uživatele), a hlavně: aplikace má DVA režimy
 * a v každém má tatáž třída jinou barvu.
 *
 * Skript proto vygeneruje CSS z aktuálních zdrojáků (stejně jako
 * zkontroluj-tridy.mjs), z něj si vytáhne SKUTEČNÉ barvy tříd i hodnoty
 * proměnných pro světlý i tmavý režim, a pak projde všechny řetězce tříd
 * v kódu. Kde na jednom prvku stojí barva písma i barva podkladu, spočítá
 * poměr kontrastu podle WCAG — zvlášť pro světlý a zvlášť pro tmavý režim.
 *
 * Co skript NEUMÍ a co je potřeba pořád projít okem:
 *   - písmo a podklad zapsané na různých prvcích (dědí se z rodiče),
 *   - barvy z databáze (barva piva) — ty řeší beerInk() v lib/supabase.ts,
 *   - podklad z přechodu (from-/to-) a obrázku.
 *
 * Spouští se `npm run zkontroluj-kontrast`.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Poměr, pod kterým je běžné písmo podle WCAG AA nečitelné. */
const MEZ = 4.5;
/** Poměr pro velké písmo (>= 18,66 px tučně nebo >= 24 px). */
const MEZ_VELKE = 3;

/** Pozadí stránky — přes něj se skládají poloprůhledné výplně. */
const STRANKA = { svetly: [248, 250, 252], tmavy: [27, 36, 56] };

function vygenerujCss() {
  const ven = path.join(os.tmpdir(), `tw-kontrast-${process.pid}.css`);
  const cli = path.join(KOREN, 'node_modules', 'tailwindcss', 'lib', 'cli.js');
  execFileSync(process.execPath, [cli, '-i', 'src/index.css', '-o', ven], {
    cwd: KOREN, stdio: 'pipe',
  });
  const css = fs.readFileSync(ven, 'utf8');
  fs.unlinkSync(ven);
  return css;
}

/** Hodnoty proměnných z :root a z :root.dark (zapsané jako „15 23 42"). */
function promenne(css) {
  const najdi = (selektor) => {
    const bloky = css.match(new RegExp(`${selektor}\\s*\\{([^}]*)\\}`, 'g')) || [];
    const mapa = {};
    for (const blok of bloky) {
      for (const d of blok.matchAll(/--([\w-]+):\s*([0-9]+ [0-9]+ [0-9]+)\s*[;}]/g)) {
        mapa[d[1]] = d[2].split(' ').map(Number);
      }
    }
    return mapa;
  };
  const svetly = najdi('(?<![\\w.-]):root(?![\\w.-])');
  const tmavy = { ...svetly, ...najdi(':root\\.dark') };
  return { svetly, tmavy };
}

/**
 * Z deklarace typu `rgb(var(--bg-amber-50) / 0.9)` udělá [r,g,b,a].
 *
 * Průhlednost bývá sama zapsaná jako `var(--tw-bg-opacity)`, tedy s vlastní
 * závorkou — proto se vnitřek nevykrajuje vzorcem, ale od první závorky
 * po POSLEDNÍ. S `[^)]+` se na tom vzorec zasekl a barvu vrátil jako
 * neznámou; skript pak tiše neměřil skoro nic.
 */
function barvaZDeklarace(hodnota, vars) {
  const h = hodnota.trim();
  if (/^rgba?\(/.test(h) && h.endsWith(')')) {
    const vnitrek = h.slice(h.indexOf('(') + 1, h.lastIndexOf(')'));
    const [zaklad, alfa] = vnitrek.includes('/') ? rozdel(vnitrek, '/') : [vnitrek, null];
    const z = zaklad.trim();
    const a = pruhlednost(alfa);

    const mv = z.match(/^var\(--([\w-]+)\)$/);
    if (mv) return vars[mv[1]] ? [...vars[mv[1]], a] : null;

    const cisla = z.split(/[\s,]+/).filter(Boolean);
    if (cisla.length >= 3 && cisla.slice(0, 3).every((c) => /^[\d.]+$/.test(c))) {
      // zápis s čárkami nese průhlednost jako čtvrté číslo
      const alfaZeSeznamu = cisla.length === 4 ? parseFloat(cisla[3]) : a;
      return [+cisla[0], +cisla[1], +cisla[2], alfaZeSeznamu];
    }
    return null;
  }
  let m = h.match(/^#([0-9a-f]{6})$/i);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  m = h.match(/^#([0-9a-f]{3})$/i);
  if (m) return m[1].split('').map((c) => parseInt(c + c, 16)).concat(1);
  return null;
}

/** Rozdělí text na první výskyt oddělovače (zbytek zůstane vcelku). */
function rozdel(text, oddelovac) {
  const i = text.indexOf(oddelovac);
  return [text.slice(0, i), text.slice(i + 1)];
}

function pruhlednost(cast) {
  if (cast === undefined || cast === null) return 1;
  const c = cast.trim();
  // var(--tw-bg-opacity) apod. je vždy 1, pokud ji nepřepíše varianta /xx
  if (c.startsWith('var(')) return 1;
  if (c.endsWith('%')) return parseFloat(c) / 100;
  const n = parseFloat(c);
  return Number.isNaN(n) ? 1 : n;
}

/**
 * Mapa: název třídy -> { text, pozadi } jako deklarované hodnoty.
 * Bereme jen jednoduchá pravidla `.trida{…}` — složené selektory
 * (pseudotřídy, potomci) sem nepatří, ty se na prvek nemusí vztahovat.
 */
function barvyTrid(css) {
  const mapa = new Map();
  // Selektor se nesmí kotvit předchozí `}`: dvě sousední pravidla ji sdílejí,
  // a protože se nálezy nepřekrývají, přeskočilo by se každé druhé pravidlo.
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selektory = m[1].split(',').map((s) => s.trim());
    const telo = m[2];
    const text = telo.match(/(?:^|;)\s*color:\s*([^;!]+)/);
    const pozadi = telo.match(/(?:^|;)\s*background-color:\s*([^;!]+)/);
    if (!text && !pozadi) continue;
    for (const s of selektory) {
      // `.trida` nebo `.dark .trida` (tmavá varianta)
      const md = s.match(/^(\.dark\s+)?\.((?:[-\w%.\/[\]#()]|\\.)+)$/);
      if (!md) continue;
      const jmeno = md[2].split('\\').join('');
      const zaznam = mapa.get(jmeno) || {};
      if (text) zaznam.text = text[1];
      if (pozadi) zaznam.pozadi = pozadi[1];
      mapa.set(jmeno, zaznam);
    }
  }
  return mapa;
}

function nalozNaPodklad([r, g, b, a], podklad) {
  if (a >= 1) return [r, g, b];
  return [0, 1, 2].map((i) => Math.round(a * [r, g, b][i] + (1 - a) * podklad[i]));
}

function jas([r, g, b]) {
  const k = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
}

function pomer(a, b) {
  const [x, y] = [jas(a), jas(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Řetězce tříd ve zdrojáku — hledáme jen ty, co vypadají jako className. */
/**
 * Poloprůhledný podklad (`bg-white/10`) leží na rodiči, kterého skript
 * nezná — a bez něj se kontrast spočítat nedá. Element proto může říct,
 * na čem leží, komentářem těsně nad sebou:
 *
 *   {/* podklad: bg-neutral-900 *\/}
 *   <div className="bg-white/10 text-white">…
 *
 * Je to i dokumentace pro člověka: „tenhle prvek počítá s tmavým rodičem".
 * Když se rodič přebarví a komentář zůstane, kontrola začne hlásit chybu —
 * což je přesně to, co se má stát.
 */
const DEKLAROVANY_PODKLAD = /podklad:\s*(bg-[\w[\]#./%-]+)/;

function retezceTrid(text) {
  const nalezy = [];
  for (const m of text.matchAll(/['"`]([^'"`\n]{4,400})['"`]/g)) {
    const s = m[1];
    if (!/(^|\s)!?(?:dark:)?(?:bg|text)-[\w[\]#./%-]+(\s|$)/.test(s)) continue;
    // Hledá se v 300 znacích před řetězcem tříd, tedy zhruba v pár řádcích
    // nad ním — dál už by to chytalo cizí komentáře.
    const okoli = text.slice(Math.max(0, m.index - 300), m.index);
    const d = okoli.match(DEKLAROVANY_PODKLAD);
    nalezy.push({ retezec: s, index: m.index, deklarovanyPodklad: d ? d[1] : null });
  }
  return nalezy;
}

/** Je řetězec velkého písma? (mírnější mez podle WCAG) */
function velkePismo(retezec) {
  if (/\btext-(2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b/.test(retezec)) return true;
  return /\btext-(lg|xl)\b/.test(retezec) && /\bfont-(bold|black|extrabold|semibold)\b/.test(retezec);
}

function zdrojaky() {
  const soubory = [];
  (function projdi(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) projdi(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) soubory.push(p);
    }
  })(path.join(KOREN, 'src'));
  return soubory;
}

// ── běh ────────────────────────────────────────────────────────────────
const css = vygenerujCss();
const vars = promenne(css);
const barvy = barvyTrid(css);

/**
 * Sytá výplň (odstíny 400–500) se v tmavém režimu nemění, a index.css na ní
 * proto drží písmo natvrdo tmavé — jinak by se otočilo se zbytkem palety
 * a svítilo světle na světlém. Skript to musí znát, jinak by ta tlačítka
 * hlásil jako chybu. Obě strany musí sedět se selektorem v index.css.
 */
function sytaVypln(tridaPozadi, tridaText) {
  if (!tridaPozadi || !tridaText) return false;
  const pozadi = /^!?bg-(amber|primary|emerald|sky|rose|violet)-(400|500)$/.test(tridaPozadi);
  const pismo = /^!?text-(neutral-[89]\d\d|amber-[789]\d\d|primary-[789]\d\d|(emerald|sky|rose|violet)-[89]\d\d)$/.test(tridaText);
  return pozadi && pismo;
}

/** Vytáhne z řetězce tříd barvu písma a podkladu pro daný režim. */
function barvyProRezim(retezec, rezim) {
  const tokeny = retezec.split(/\s+/).filter(Boolean);
  let text = null, pozadi = null, tridaText = null, tridaPozadi = null;
  for (const t of tokeny) {
    const tmavaVarianta = t.startsWith('dark:');
    if (tmavaVarianta && rezim !== 'tmavy') continue;
    // varianty se stavem (hover:, focus:, group-hover:…) neřešíme — to není klidový stav
    const holy = tmavaVarianta ? t.slice(5) : t;
    if (holy.includes(':')) continue;
    const zaznam = barvy.get(holy) || barvy.get(holy.replace(/^!/, ''));
    if (!zaznam) continue;
    if (zaznam.text !== undefined && /^!?text-/.test(holy)) {
      const b = barvaZDeklarace(zaznam.text, vars[rezim]);
      if (b) { text = b; tridaText = t; }
    }
    if (zaznam.pozadi !== undefined && /^!?bg-/.test(holy)) {
      const b = barvaZDeklarace(zaznam.pozadi, vars[rezim]);
      if (b) { pozadi = b; tridaPozadi = t; }
    }
  }
  if (rezim === 'tmavy' && sytaVypln(tridaPozadi, tridaText)) text = [15, 23, 42, 1];
  return { text, pozadi, tridaText, tridaPozadi };
}

const nalezy = [];
for (const soubor of zdrojaky()) {
  const obsah = fs.readFileSync(soubor, 'utf8');
  for (const { retezec, index, deklarovanyPodklad } of retezceTrid(obsah)) {
    const radek = obsah.slice(0, index).split('\n').length;
    for (const rezim of ['svetly', 'tmavy']) {
      const { text, pozadi, tridaText, tridaPozadi } = barvyProRezim(retezec, rezim);
      if (!text || !pozadi) continue;
      // Deklarovaný rodič (komentář „podklad: bg-…" nad prvkem) se použije
      // místo pozadí stránky — jinak se poloprůhledná vrstva počítá proti
      // bílé, což u prvku v tmavém modálu nesedí ani náhodou.
      let zaklad = STRANKA[rezim];
      let znamyRodic = false;
      if (deklarovanyPodklad) {
        const z = barvy.get(deklarovanyPodklad) || barvy.get(deklarovanyPodklad.replace(/^!/, ''));
        const b = z && z.pozadi !== undefined ? barvaZDeklarace(z.pozadi, vars[rezim]) : null;
        if (b) { zaklad = nalozNaPodklad(b, STRANKA[rezim]); znamyRodic = true; }
      }
      const podklad = nalozNaPodklad(pozadi, zaklad);
      const pismo = nalozNaPodklad(text, podklad);
      const p = pomer(pismo, podklad);
      const mez = velkePismo(retezec) ? MEZ_VELKE : MEZ;
      if (p >= mez) continue;
      nalezy.push({
        soubor: path.relative(KOREN, soubor).split(path.sep).join('/'),
        radek, rezim, pomer: p, mez,
        dvojice: `${tridaPozadi} + ${tridaText}`,
        // Poloprůhledný podklad leží na rodiči, kterého skript nezná — počítá
        // se přes pozadí stránky, což u prvků v tmavé hlavičce nesedí. Takové
        // nálezy se hlásí zvlášť a build kvůli nim nepadá.
        jiste: pozadi[3] >= 0.8 || znamyRodic,
      });
    }
  }
}

function seskup(vybrane) {
  const podleDvojice = new Map();
  for (const n of vybrane) {
    const klic = `${n.dvojice} [${n.rezim}]`;
    if (!podleDvojice.has(klic)) podleDvojice.set(klic, { ...n, mista: [] });
    podleDvojice.get(klic).mista.push(`${n.soubor}:${n.radek}`);
  }
  return [...podleDvojice.values()].sort((a, b) => a.pomer - b.pomer);
}

function vypis(skupiny) {
  for (const n of skupiny) {
    const rezim = n.rezim === 'tmavy' ? 'tmavý' : 'světlý';
    console.log(`${n.pomer.toFixed(2)} : 1  (mez ${n.mez})  ${rezim} režim  —  ${n.dvojice}`);
    const ukazka = [...new Set(n.mista)];
    for (const m of ukazka.slice(0, 6)) console.log(`      ${m}`);
    if (ukazka.length > 6) console.log(`      … a dalších ${ukazka.length - 6}`);
    console.log('');
  }
}

const jiste = seskup(nalezy.filter((n) => n.jiste));
const nejiste = seskup(nalezy.filter((n) => !n.jiste));

if (nejiste.length > 0 && process.argv.includes('--vse')) {
  console.log(`Nejisté (poloprůhledný podklad, rodič není známý): ${nejiste.length} dvojic\n`);
  vypis(nejiste);
  console.log('─'.repeat(70) + '\n');
}

if (jiste.length === 0) {
  console.log('Kontrast: všechny dvojice písmo/podklad na jednom prvku projdou (světlý i tmavý režim).');
  if (nejiste.length > 0) {
    console.log(`(${nejiste.length} dvojic s poloprůhledným podkladem se nedá spočítat — vypíše je přepínač --vse.)`);
  }
  process.exit(0);
}

console.log(`Kontrast: ${jiste.length} podezřelých dvojic (${nalezy.filter((n) => n.jiste).length} výskytů).\n`);
vypis(jiste);
process.exit(1);
