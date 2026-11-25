// @vitest-environment node
// 🩹 Startovní pojistka v index.html — záplaty pro starší WebView a záchranná obrazovka.
// ---------------------------------------------------------------------------
// Šéfovi nejde appka na starším telefonu s Androidem (25. 11. 2026). Měřením se ukázalo, že kód volá
// `crypto.randomUUID()` (Chrome 92+) na 23 místech — mimo jiné ve frontě offline zápisů — a že na starším
// WebView appka naběhne, ale uložení tiše selže. Záplaty proto žijí v klasickém skriptu v hlavičce
// index.html (vendor balíky se vyhodnotí dřív než vstupní modul) a testují se tady proti NATIVNÍM funkcím:
// stejný vstup, jednou nativně a jednou přes záplatu v okně, kde se nativní funkce předem smazala.
//
// Okno je jsdom s vlastním světem vestavěných objektů (Array, Object, String…), takže smazání nativní
// funkce v něm nezasáhne test ani ostatní testy.
// Pole s dírami ([1, , 2]) jsou tu schválně: záplata flat/flatMap musí díry přeskakovat stejně jako nativní funkce.
/* eslint-disable no-sparse-arrays */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { transformSync } from 'esbuild';

const HTML = readFileSync('index.html', 'utf8');

const UA_STARY = 'Mozilla/5.0 (Linux; Android 7.0; SM-G930F) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/58.0.3029.83 Mobile Safari/537.36';
const UA_NOVY = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 9_3 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13E233 Safari/601.1';

/** Funkce, které má starý WebView NEMÁ — v testovacím okně se před spuštěním skriptu smažou. */
const CHYBEJICI: [string, string][] = [
  ['Array.prototype', 'flat'],
  ['Array.prototype', 'flatMap'],
  ['Object', 'fromEntries'],
  ['Object', 'hasOwn'],
  ['String.prototype', 'matchAll'],
  ['crypto', 'randomUUID'],
  ['Element.prototype', 'replaceChildren'],
  ['Document.prototype', 'replaceChildren'],
  ['DocumentFragment.prototype', 'replaceChildren'],
  ['', 'queueMicrotask'],
];

type Okno = Window & typeof globalThis & { eval: (s: string) => unknown; __zajicZachrana?: (d?: string) => void; __testChyby: string[] };

const otevrena: JSDOM[] = [];
afterEach(() => { while (otevrena.length) otevrena.pop()!.window.close(); });

function smaz(w: any, objekt: string, jmeno: string) {
  const cil = objekt ? objekt.split('.').reduce((o: any, k) => o[k], w) : w;
  try { delete cil[jmeno]; } catch { /* nepovedlo se — níž se přepíše */ }
  if (typeof cil[jmeno] === 'function') Object.defineProperty(cil, jmeno, { value: undefined, configurable: true, writable: true });
}

/** Otevře index.html v jsdom jako prohlížeč s daným UA; `bezModulu: false` = moderní prohlížeč (nomodule se přeskočí). */
function otevri(opts: {
  ua?: string;
  chybi?: [string, string][];
  html?: string;
  bezModulu?: boolean;
  predSpustenim?: (w: any) => void;
} = {}): Okno {
  const { ua = UA_NOVY, chybi = [], bezModulu = false, predSpustenim } = opts;
  let html = opts.html ?? HTML;
  // jsdom neumí navigovat, takže pokus o obnovení stránky (location.reload) hlásí jako „not implemented: navigation“.
  const chyby: string[] = [];
  const konzole = new VirtualConsole();
  konzole.on('jsdomError', (e: Error) => chyby.push(e.message));
  // jsdom moduly neumí, takže nomodule skript by spustil i v „moderním“ prohlížeči — ten se tu odebere.
  if (!bezModulu) html = html.replace(/<script nomodule>[\s\S]*?<\/script>/, '');
  const dom = new JSDOM(html, {
    url: 'https://zajic-pivovar.pages.dev/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: konzole,
    beforeParse(w) {
      Object.defineProperty(w, '__testChyby', { value: chyby });
      // userAgent není volba konstruktoru JSDOM (jen ResourceLoaderu, který by začal stahovat zdroje) — nastaví se tady.
      Object.defineProperty(w.navigator, 'userAgent', { get: () => ua, configurable: true });
      for (const [o, j] of chybi) smaz(w, o, j);
      predSpustenim?.(w);
    },
  });
  otevrena.push(dom);
  return dom.window as unknown as Okno;
}

/** Totéž co `otevri`, ale vrátí okno s funkcemi, které starý WebView nemá (jen kvůli záplatám). */
const staryWebView = () => otevri({ ua: UA_STARY, chybi: CHYBEJICI });

const json = (w: Okno, kod: string) => w.eval(`JSON.stringify((function(){ try { return ${kod}; } catch (e) { return { vyjimka: e.constructor.name }; } })())`) as string;
/** Totéž v testu (nativně) — výsledek se pak porovná s tím z okna se záplatou. */
const nativne = (f: () => unknown) => { try { return JSON.stringify(f()); } catch (e: any) { return JSON.stringify({ vyjimka: e.constructor.name }); } };

describe('startovní pojistka — základní předpoklady', () => {
  it('záplaty a záchranná obrazovka jsou klasické skripty v hlavičce (bez type, async a defer)', () => {
    const skripty = [...HTML.matchAll(/<script(?<atr>[^>]*)>(?<kod>[\s\S]*?)<\/script>/g)];
    const poradi = skripty.map((s) => ({ atr: s.groups!.atr.trim(), kod: s.groups!.kod }));
    const zaplaty = poradi.findIndex((s) => s.kod.includes("'randomUUID'"));
    const zachrana = poradi.findIndex((s) => s.kod.includes('__zajicZachrana = '));
    expect(zaplaty, 'chybí skript se záplatami').toBeGreaterThanOrEqual(0);
    expect(zachrana, 'chybí skript se záchrannou obrazovkou').toBeGreaterThanOrEqual(0);
    // Moduly jsou vždycky odložené, takže klasický skript je předběhne, ať stojí kdekoli (Vite modul navíc přesouvá).
    // Rozhoduje, že je skript KLASICKÝ — s type="module", async nebo defer by se spustil až po knihovnách.
    for (const i of [zaplaty, zachrana]) expect(poradi[i].atr, `skript #${i} musí být klasický`).toBe('');
    expect(HTML.indexOf(poradi[zaplaty].kod)).toBeLessThan(HTML.indexOf('<body>'));
    expect(HTML.indexOf(poradi[zachrana].kod)).toBeLessThan(HTML.indexOf('<body>'));
  });

  it('nomodule skript volá záchrannou obrazovku s důvodem „moduly“', () => {
    const m = /<script nomodule>([\s\S]*?)<\/script>/.exec(HTML);
    expect(m, 'chybí <script nomodule>').toBeTruthy();
    expect(m![1]).toContain("__zajicZachrana('moduly')");
    // Musí být až po skriptu, který __zajicZachrana definuje (jinak by nebylo co volat).
    expect(HTML.indexOf('<script nomodule>')).toBeGreaterThan(HTML.indexOf('__zajicZachrana = '));
  });

  it('oba skripty jsou čisté ES5 — starý prohlížeč by novější syntax vůbec nerozebral', () => {
    const kody = [...HTML.matchAll(/<script(?:\s+nomodule)?>([\s\S]*?)<\/script>/g)].map((s) => s[1]);
    expect(kody.length).toBeGreaterThanOrEqual(4);
    for (const kod of kody) {
      // esbuild s cílem es5 odmítne let/const, šipky, šablony, třídy i spread — přesně to, co starý prohlížeč neumí.
      expect(() => transformSync(kod, { target: 'es5', loader: 'js' })).not.toThrow();
    }
  });

  it('v prohlížeči, který funkce má, nic nepřidá ani nepřepíše (jen jednu vlastnost okna)', () => {
    // Odkazy na funkce, které okno má před spuštěním skriptů (jsdom má část z nich napsanou v JS, ne nativně).
    const pred: Record<string, unknown> = {};
    const w = otevri({
      ua: UA_NOVY,
      predSpustenim: (win) => {
        pred.flat = win.Array.prototype.flat;
        pred.flatMap = win.Array.prototype.flatMap;
        pred.fromEntries = win.Object.fromEntries;
        pred.hasOwn = win.Object.hasOwn;
        pred.matchAll = win.String.prototype.matchAll;
        pred.randomUUID = win.crypto.randomUUID;
        pred.replaceChildren = win.Element.prototype.replaceChildren;
        pred.replaceChildrenDoc = win.Document.prototype.replaceChildren;
        pred.replaceChildrenFrag = win.DocumentFragment.prototype.replaceChildren;
        pred.queueMicrotask = win.queueMicrotask;
        pred.globalThis = win.globalThis;
      },
    });
    for (const [jmeno, funkce] of Object.entries(pred)) expect(typeof funkce, `${jmeno} má být v okně hned od začátku`).toMatch(/function|object/);
    expect(w.Array.prototype.flat).toBe(pred.flat);
    expect(w.Array.prototype.flatMap).toBe(pred.flatMap);
    expect(w.Object.fromEntries).toBe(pred.fromEntries);
    expect(w.Object.hasOwn).toBe(pred.hasOwn);
    expect(w.String.prototype.matchAll).toBe(pred.matchAll);
    expect(w.crypto.randomUUID).toBe(pred.randomUUID);
    expect(w.Element.prototype.replaceChildren).toBe(pred.replaceChildren);
    expect(w.Document.prototype.replaceChildren).toBe(pred.replaceChildrenDoc);
    expect(w.DocumentFragment.prototype.replaceChildren).toBe(pred.replaceChildrenFrag);
    expect(w.queueMicrotask).toBe(pred.queueMicrotask);
    expect(w.globalThis).toBe(pred.globalThis);
    // A jediná nová vlastnost okna je ruční spuštění záchranné obrazovky.
    const nove = Object.getOwnPropertyNames(w).filter((n) => /zajic/i.test(n));
    expect(nove).toEqual(['__zajicZachrana']);
  });
});

describe('záplata crypto.randomUUID', () => {
  const FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('na starém WebView doplní funkci, která dává platné UUID verze 4 a jiné pokaždé', () => {
    const w = staryWebView();
    expect(typeof w.crypto.randomUUID).toBe('function');
    const ids = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const id = w.crypto.randomUUID();
      expect(id).toMatch(FORMAT);
      ids.add(id);
    }
    expect(ids.size).toBe(300);
  });

  it('bity verze a varianty se nastaví vždy, ať přijdou z generátoru jakékoli bajty', () => {
    const jednicky = otevri({
      ua: UA_STARY, chybi: CHYBEJICI,
      predSpustenim: (w) => { w.crypto.getRandomValues = (a: Uint8Array) => { a.fill(0xff); return a; }; },
    });
    expect(jednicky.crypto.randomUUID()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    const nuly = otevri({
      ua: UA_STARY, chybi: CHYBEJICI,
      predSpustenim: (w) => { w.crypto.getRandomValues = (a: Uint8Array) => { a.fill(0); return a; }; },
    });
    expect(nuly.crypto.randomUUID()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('bajty bere z crypto.getRandomValues (ne z Math.random) a pomlčky dává na správná místa', () => {
    const w = otevri({
      ua: UA_STARY, chybi: CHYBEJICI,
      predSpustenim: (win) => {
        let n = 0;
        win.crypto.getRandomValues = (a: Uint8Array) => { for (let i = 0; i < a.length; i++) a[i] = n++; return a; };
        win.Math.random = () => { throw new Error('Math.random se tu nemá volat'); };
      },
    });
    // 00 01 02 03 – 04 05 – (06|40) 07 – (08|80→88&3f|80) 09 – 0a 0b 0c 0d 0e 0f
    expect(w.crypto.randomUUID()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });

  it('bez getRandomValues spadne na Math.random a nehodí výjimku', () => {
    const w = otevri({
      ua: UA_STARY, chybi: CHYBEJICI,
      predSpustenim: (win) => { win.crypto.getRandomValues = undefined; win.Math.random = () => 0.5; },
    });
    expect(w.crypto.randomUUID()).toBe('80808080-8080-4080-8080-808080808080');
  });

  it('doplněná funkce není vypsatelná (neláme for…in) a jde přepsat', () => {
    const w = staryWebView();
    expect(Object.keys(w.crypto)).not.toContain('randomUUID');
    expect(Object.getOwnPropertyDescriptor(w.crypto, 'randomUUID')).toMatchObject({ enumerable: false, writable: true, configurable: true });
  });
});

describe('záplata Array.prototype.flat / flatMap — stejné výsledky jako nativně', () => {
  const vstupy: [string, unknown[], unknown[]][] = [
    ['bez argumentu', [[1, [2, [3, [4]]]]], []],
    ['hloubka 0', [[1, [2, [3, [4]]]]], [0]],
    ['hloubka 1', [[1, [2, [3, [4]]]]], [1]],
    ['hloubka 2', [[1, [2, [3, [4]]]]], [2]],
    ['Infinity', [[1, [2, [3, [4]]]]], [Infinity]],
    ['záporná', [[1, [2]]], [-1]],
    ['NaN', [[1, [2]]], [NaN]],
    ['řetězec "2"', [[1, [2, [3, [4]]]]], ['2']],
    ['null', [[1, [2]]], [null]],
    ['desetinná 1.9', [[1, [2, [3]]]], [1.9]],
    ['díry v poli', [[1, , 2, [3, , 4]]], [1]],
    ['prázdné pole', [[]], []],
    ['objekty a řetězce zůstanou', [['ab', { a: [1] }, [['x']]]], [Infinity]],
  ];
  for (const [popis, [pole], arg] of vstupy) {
    it(`flat — ${popis}`, () => {
      const w = staryWebView();
      const kod = `${JSON.stringify(pole).replace(/null/g, 'null')}`; // díry se níž dopíšou
      expect(kod).toBeTruthy();
      const vstup = popis === 'díry v poli' ? '[1, , 2, [3, , 4]]' : JSON.stringify(pole);
      const proOkno = `(${vstup}).flat(${arg.map((a) => (typeof a === 'string' ? JSON.stringify(a) : String(a))).join(',')})`;
      const proTest = (popis === 'díry v poli' ? [1, , 2, [3, , 4]] : pole) as any[];
      expect(json(w, proOkno)).toBe(nativne(() => proTest.flat(...(arg as [number]))));
    });
  }

  it('flatMap — pole i hodnoty z mapovací funkce, díry, thisArg', () => {
    const w = staryWebView();
    expect(json(w, '[1, 2, 3].flatMap(function (x) { return [x, [x * 10]]; })')).toBe(nativne(() => [1, 2, 3].flatMap((x) => [x, [x * 10]])));
    expect(json(w, '[1, 2, 3].flatMap(function (x) { return x % 2 ? [] : x; })')).toBe(nativne(() => [1, 2, 3].flatMap((x) => (x % 2 ? [] : x))));
    expect(json(w, '[1, , 3].flatMap(function (x) { return [x, x]; })')).toBe(nativne(() => [1, , 3].flatMap((x) => [x, x])));
    expect(json(w, '[1].flatMap(function () { return [1, , 3]; })')).toBe(nativne(() => [1].flatMap(() => [1, , 3])));
    expect(json(w, '[1, 2].flatMap(function (x, i, a) { return [this.k, i, a.length]; }, { k: "K" })'))
      .toBe(nativne(function () { return [1, 2].flatMap(function (this: any, _x, i, a) { return [this.k, i, a.length]; }, { k: 'K' }); }));
  });

  it('flatMap bez funkce hodí TypeError jako nativní — i na prázdném poli (funkce se kontroluje dřív než pole)', () => {
    const w = staryWebView();
    for (const [kod, fn] of [
      ['[1].flatMap()', () => ([1] as any).flatMap()],
      ['[1].flatMap(5)', () => ([1] as any).flatMap(5)],
      ['[].flatMap()', () => ([] as any).flatMap()],
      ['[].flatMap(5)', () => ([] as any).flatMap(5)],
      ['[].flatMap(null)', () => ([] as any).flatMap(null)],
    ] as [string, () => unknown][]) {
      expect(json(w, kod), kod).toBe(nativne(fn));
    }
    expect(json(w, '[].flatMap()')).toBe('{"vyjimka":"TypeError"}');
  });

  it('nepřidá do polí vypsatelné vlastnosti (for…in zůstane prázdné)', () => {
    const w = staryWebView();
    expect(w.eval('(function(){ var k = []; for (var x in [1, 2]) k.push(x); return k.join(","); })()')).toBe('0,1');
  });
});

describe('záplata Object.fromEntries / Object.hasOwn', () => {
  it('fromEntries — pole dvojic, Map, generátor, číselné a duplicitní klíče', () => {
    const w = staryWebView();
    const pripady = [
      '[["a", 1], ["b", 2]]',
      'new Map([["a", 1], ["b", 2]])',
      '(function* () { yield ["x", 1]; yield ["y", 2]; })()',
      '[[1, "a"], [2, "b"]]',
      '[["k", 1], ["k", 2]]',
      '[]',
      '[[undefined, 1]]',
    ];
    for (const p of pripady) {
      const nat = nativne(() => Object.fromEntries(new Function(`return ${p}`)()));
      expect(json(w, `Object.fromEntries(${p})`), p).toBe(nat);
    }
  });

  it('fromEntries — klíč __proto__ je obyčejná vlastnost, prototyp se nezmění', () => {
    const w = staryWebView();
    const kod = 'var o = Object.fromEntries([["__proto__", { zlo: 1 }]]); [Object.getPrototypeOf(o) === Object.prototype, Object.keys(o).join(","), o.zlo].join("|")';
    const o = Object.fromEntries([['__proto__', { zlo: 1 }]]);
    expect(w.eval(kod)).toBe([Object.getPrototypeOf(o) === Object.prototype, Object.keys(o).join(','), (o as any).zlo].join('|'));
  });

  it('fromEntries — vlastnosti jsou vypsatelné, zapisovatelné a přepsatelné, jako nativně', () => {
    const w = staryWebView();
    expect(json(w, 'Object.getOwnPropertyDescriptor(Object.fromEntries([["a", 1]]), "a")'))
      .toBe(nativne(() => Object.getOwnPropertyDescriptor(Object.fromEntries([['a', 1]]), 'a')));
  });

  it('fromEntries — špatný vstup hodí TypeError jako nativní', () => {
    const w = staryWebView();
    for (const p of ['undefined', 'null', '[1]', '["ab"]', '[null]', '5']) {
      const nat = nativne(() => Object.fromEntries(new Function(`return ${p}`)()));
      expect(json(w, `Object.fromEntries(${p})`), p).toBe(nat);
    }
  });

  it('hasOwn — vlastní, zděděné, symbol, primitivum i null', () => {
    const w = staryWebView();
    const pripady = [
      'Object.hasOwn({ a: 1 }, "a")',
      'Object.hasOwn({ a: 1 }, "b")',
      'Object.hasOwn(Object.create({ a: 1 }), "a")',
      'Object.hasOwn("abc", "length")',
      'Object.hasOwn([1, 2], 1)',
      'Object.hasOwn([1, 2], "1")',
      'Object.hasOwn({ undefined: 1 }, undefined)',
      'Object.hasOwn(null, "a")',
      'Object.hasOwn(undefined, "a")',
    ];
    for (const p of pripady) {
      expect(json(w, p), p).toBe(nativne(() => new Function('return ' + p.replace('Object.hasOwn', 'Object.hasOwn'))()));
    }
    const symbol = 'var s = Symbol("s"); var o = {}; o[s] = 1; [Object.hasOwn(o, s), Object.hasOwn(o, Symbol("s"))].join()';
    expect(w.eval(symbol)).toBe('true,false');
  });
});

describe('záplata String.prototype.matchAll', () => {
  const pripady: [string, string][] = [
    ['"a1b22c333".matchAll(/\\d+/g)', 'čísla'],
    ['"a1b22".matchAll(/([a-z])(\\d+)/g)', 'skupiny'],
    ['"ab".matchAll(/(?:)/g)', 'prázdné shody'],
    ['"a😀b".matchAll(/(?:)/gu)', 'prázdné shody s unicode'],
    ['"a😀b".matchAll(/(?:)/g)', 'prázdné shody bez unicode (rozpůlí pár)'],
    ['"abc".matchAll("b")', 'řetězec jako vzor'],
    ['"abc".matchAll(undefined)', 'bez vzoru'],
    ['"aaa".matchAll(/a/g)', 'souvislé shody'],
    ['"xyz".matchAll(/a/g)', 'žádná shoda'],
    ['"A1a2".matchAll(/a\\d/gi)', 'ignorovat velikost'],
    ['"a.b".matchAll(".")', 'řetězec s tečkou je regulár'],
  ];
  for (const [kod, popis] of pripady) {
    it(`výsledek stejný jako nativně — ${popis}`, () => {
      const w = staryWebView();
      const vypis = (expr: string) => `Array.from(${expr}).map(function (m) { return [m[0], m.index, m.input, m.slice(1)]; })`;
      const nat = nativne(() => {
        const it = new Function(`return ${kod}`)();
        return Array.from(it as Iterable<RegExpMatchArray>).map((m) => [m[0], m.index, m.input, m.slice(1)]);
      });
      expect(json(w, vypis(kod))).toBe(nat);
    });
  }

  it('nezačíná od nuly, když má vzor lastIndex, a vzor se nezmění', () => {
    const w = staryWebView();
    const kod = 'var r = /\\d/g; r.lastIndex = 2; var v = Array.from("1234".matchAll(r)).map(function (m) { return m[0]; }); [v.join(""), r.lastIndex].join("|")';
    const r = /\d/g; r.lastIndex = 2;
    const nat = Array.from('1234'.matchAll(r)).map((m) => m[0]).join('') + '|' + r.lastIndex;
    expect(w.eval(kod)).toBe(nat);
  });

  it('negobální regulár hodí TypeError jako nativní, null/undefined jako this také', () => {
    const w = staryWebView();
    expect(json(w, '"a".matchAll(/a/)')).toBe(nativne(() => ('a' as any).matchAll(/a/)));
    expect(json(w, 'String.prototype.matchAll.call(null, /a/g)')).toBe(nativne(() => String.prototype.matchAll.call(null as any, /a/g)));
  });

  it('vrací iterátor, který je sám sobě iterovatelný a po vyčerpání zůstane hotový', () => {
    const w = staryWebView();
    const kod = 'var it = "ab".matchAll(/./g); var a = it.next(); var b = it.next(); var c = it.next(); var d = it.next(); [it[Symbol.iterator]() === it, a.done, b.done, c.done, d.done, c.value, [..."ab".matchAll(/./g)].length].join("|")';
    const it = 'ab'.matchAll(/./g); const a = it.next(); const b = it.next(); const c = it.next(); const d = it.next();
    expect(w.eval(kod)).toBe([it[Symbol.iterator]() === it, a.done, b.done, c.done, d.done, c.value, [...'ab'.matchAll(/./g)].length].join('|'));
  });
});

describe('záplata queueMicrotask a globalThis', () => {
  it('queueMicrotask poběží až po dokončení běžícího kódu, ale před časovačem', async () => {
    const w = staryWebView();
    const poradi: string[] = [];
    (w as any).poradi = poradi;
    // „promise“ je zaregistrovaná až po queueMicrotask: obě fronty mikroúloh jsou jedna a ta se vyprazdňuje po pořadí,
    // takže „mikro“ musí přijít před „promise“ a oboje před časovačem. Záplata na setTimeout by se prozradila hned.
    w.eval('queueMicrotask(function () { poradi.push("mikro"); }); Promise.resolve().then(function () { poradi.push("promise"); }); setTimeout(function () { poradi.push("casovac"); }, 0); poradi.push("synchronne");');
    await new Promise((r) => setTimeout(r, 30));
    expect(poradi).toEqual(['synchronne', 'mikro', 'promise', 'casovac']);
  });

  it('globalThis ukazuje na okno, i když ho prohlížeč nemá', () => {
    const w = otevri({ ua: UA_STARY, chybi: CHYBEJICI, predSpustenim: (win) => { delete win.globalThis; } });
    expect(w.eval('typeof globalThis')).toBe('object');
    expect(w.eval('globalThis === window')).toBe(true);
  });
});

describe('záplata replaceChildren', () => {
  it('nahradí potomky uzly i řetězci, jako nativní', () => {
    const w = staryWebView();
    const kod = `
      var d = document.createElement('div');
      d.innerHTML = '<b>staré</b> text <i>x</i>';
      var novy = document.createElement('u'); novy.textContent = 'nový';
      var r = d.replaceChildren('ahoj ', novy, 5);
      [String(r), d.innerHTML, d.childNodes.length].join('|')`;
    const dom = new JSDOM('<!doctype html><div id="x"></div>');
    const nd = dom.window.document;
    const d = nd.createElement('div'); d.innerHTML = '<b>staré</b> text <i>x</i>';
    const novy = nd.createElement('u'); novy.textContent = 'nový';
    const r = (d as any).replaceChildren('ahoj ', novy, 5);
    expect(w.eval(kod)).toBe([String(r), d.innerHTML, d.childNodes.length].join('|'));
    dom.window.close();
  });

  it('bez argumentů vyprázdní prvek; uzel, který už v prvku je, se přesune', () => {
    const w = staryWebView();
    expect(w.eval('var d = document.createElement("div"); d.innerHTML = "<b>a</b><i>b</i>"; d.replaceChildren(); d.innerHTML')).toBe('');
    expect(w.eval('var d = document.createElement("div"); d.innerHTML = "<b>a</b><i>b</i>"; d.replaceChildren(d.lastChild, d.firstChild); d.innerHTML')).toBe('<i>b</i><b>a</b>');
  });

  it('funguje i na DocumentFragment a na dokumentu', () => {
    const w = staryWebView();
    expect(w.eval('var f = document.createDocumentFragment(); f.appendChild(document.createElement("p")); f.replaceChildren("x"); f.childNodes.length + ":" + f.textContent')).toBe('1:x');
    expect(typeof (w.Document.prototype as any).replaceChildren).toBe('function');
  });
});

describe('záchranná obrazovka — kdy se ukáže', () => {
  /** HTML s rychlými časovači, ať testy netrvají minuty (limit 20 s → 600 ms, rychlý důvod 4 s → 100 ms, kontrola každou vteřinu → po 20 ms). */
  function rychle(): string {
    const h = HTML
      .replace('LIMIT_MS = 20000', 'LIMIT_MS = 600')
      .replace('RYCHLE_MS = 4000', 'RYCHLE_MS = 100')
      .replace('setInterval(tick, 1000)', 'setInterval(tick, 20)')
      .replace('termin += 1000', 'termin += 20');
    expect(h).toContain('LIMIT_MS = 600');
    expect(h).toContain('RYCHLE_MS = 100');
    expect(h).toContain('setInterval(tick, 20)');
    expect(h).toContain('termin += 20');
    return h;
  }
  const cekej = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const panel = (w: Okno) => w.document.getElementById('zajic-zachrana');
  const spust = (w: Okno) => { w.document.getElementById('root')!.appendChild(w.document.createElement('main')); };

  it('na funkčním telefonu se nikdy neukáže, i když appka naběhne až těsně před limitem', async () => {
    const w = otevri({ html: rychle() });
    await cekej(300);
    spust(w);
    await cekej(700);
    expect(panel(w)).toBeNull();
  });

  it('když appka nenaběhne do limitu, ukáže se s důvodem „dlouho“ a údaji o telefonu', async () => {
    const w = otevri({ html: rychle(), ua: UA_STARY });
    expect(panel(w)).toBeNull();
    await cekej(250);
    expect(panel(w)).toBeNull(); // ještě je v limitu
    await cekej(900);
    const p = panel(w)!;
    expect(p).toBeTruthy();
    expect(p.getAttribute('role')).toBe('alert');
    expect(p.textContent).toContain('Aplikace se na tomhle telefonu nespustila');
    expect(p.textContent).toContain('načítá nezvykle dlouho');
    expect(p.textContent).toContain('Technické údaje: Chrome 58 · Android 7.0 · důvod: dlouho');
  });

  it('odkazy: WebView a Chrome v Obchodě Play (Android) a Diagnostika telefonu', async () => {
    const w = otevri({ html: rychle(), ua: UA_STARY });
    await cekej(1000);
    const hrefy = [...panel(w)!.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefy).toEqual([
      'https://play.google.com/store/apps/details?id=com.google.android.webview',
      'https://play.google.com/store/apps/details?id=com.android.chrome',
      '/diagnostika.html',
    ]);
  });

  it('nespoléhá na CSS aplikace: nadpis je tučný a kroky mají čísla i s Tailwind preflightem, který to ruší', async () => {
    // Když se nenačte skript, ale CSS ano, platí na stránce Tailwind preflight: `ol { list-style: none }` a
    // `h1 { font-weight: inherit }`. Obrazovka proto vše nutné píše přímo do stylů prvků (zjištěno v prohlížeči 25. 11. 2026).
    const w = otevri({
      html: rychle().replace('</head>', '<style>ol, ul { list-style: none; margin: 0; padding: 0 } h1 { font-size: inherit; font-weight: inherit }</style></head>'),
      ua: UA_STARY,
    });
    await cekej(1000);
    const p = panel(w)!;
    expect(p.querySelector('h1')!.getAttribute('style')).toContain('font-weight:700');
    expect(p.querySelector('ol')!.getAttribute('style')).toContain('list-style:decimal');
    const polozky = [...p.querySelectorAll('ol > li')];
    expect(polozky).toHaveLength(4);
    for (const li of polozky) expect(li.getAttribute('style')).toContain('display:list-item');
  });

  it('mimo Android (starý iPhone) nenabízí Obchod Play', async () => {
    const w = otevri({ html: rychle(), ua: UA_IPHONE });
    await cekej(1000);
    const p = panel(w)!;
    expect(p.textContent).toContain('Aktualizuj prohlížeč (na iPhonu aktualizací systému iOS)');
    expect(p.textContent).toContain('neznámý prohlížeč');
    expect([...p.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/diagnostika.html']);
  });

  it('když se appka rozběhne až po zobrazení, obrazovka sama zmizí', async () => {
    const w = otevri({ html: rychle() });
    await cekej(1000);
    expect(panel(w)).toBeTruthy();
    spust(w);
    await cekej(200);
    expect(panel(w)).toBeNull();
  });

  it('nenačtený soubor aplikace (chyba u <script src="/assets/…">) ukáže obrazovku rychle a s důvodem „soubor“', async () => {
    const w = otevri({ html: rychle() });
    const s = w.document.createElement('script');
    s.src = '/assets/index-abc123.js';
    w.document.head.appendChild(s);
    s.dispatchEvent(new w.Event('error'));
    await cekej(40);
    expect(panel(w)).toBeNull();
    await cekej(300); // rychlý důvod (100 ms) už uplynul, limit (600 ms) ještě ne
    const p = panel(w)!;
    expect(p).toBeTruthy();
    expect(p.textContent).toContain('Nepodařilo se stáhnout soubory aplikace');
    expect(p.textContent).toContain('důvod: soubor');
  });

  it('chyba syntaxe při startu ukáže obrazovku rychle, s důvodem „chyba“ a zkráceným textem chyby', async () => {
    const w = otevri({ html: rychle() });
    const dlouhy = 'Uncaught SyntaxError: Unexpected token ' + 'x'.repeat(300);
    w.dispatchEvent(new w.ErrorEvent('error', { message: dlouhy }));
    await cekej(350);
    const p = panel(w)!;
    expect(p).toBeTruthy();
    expect(p.textContent).toContain('narazila na chybu');
    const radek = /důvod: chyba \((.*)\)$/.exec(p.textContent!.trim());
    expect(radek).toBeTruthy();
    expect(radek![1].length).toBe(100);
    expect(radek![1].startsWith('Uncaught SyntaxError: Unexpected token')).toBe(true);
  });

  for (const zprava of [
    'Foo is not defined',
    'x is not a function',
    "Cannot read properties of undefined (reading 'a')",
    'Unexpected identifier',
    'Unexpected end of input',
    // Zprávy, ve kterých se „Unexpected …“ nevyskytuje — rozpozná je jen slovo SyntaxError:
    'Uncaught SyntaxError: Invalid or unexpected token',
    'SyntaxError: Cannot use import statement outside a module',
  ]) {
    it(`chyba „${zprava}“ při startu urychlí obrazovku`, async () => {
      const w = otevri({ html: rychle() });
      w.dispatchEvent(new w.ErrorEvent('error', { message: zprava }));
      await cekej(350);
      expect(panel(w), zprava).toBeTruthy();
    });
  }

  it('nesouvisející chyby obrazovku neurychlí (ResizeObserver, cizí skript, obrázek, cizí styl)', async () => {
    const w = otevri({ html: rychle() });
    w.dispatchEvent(new w.ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' }));
    w.dispatchEvent(new w.ErrorEvent('error', { message: 'Script error.' }));
    const img = w.document.createElement('img');
    w.document.body.appendChild(img);
    img.dispatchEvent(new w.Event('error'));
    const cizi = w.document.createElement('script');
    cizi.src = 'https://cizi.example/analytika.js';
    w.document.head.appendChild(cizi);
    cizi.dispatchEvent(new w.Event('error'));
    const css = w.document.createElement('link');
    css.href = '/ikony/jina.css';
    w.document.head.appendChild(css);
    css.dispatchEvent(new w.Event('error'));
    await cekej(350);
    expect(panel(w)).toBeNull(); // limit (600 ms) ještě neuplynul a „rychlý“ důvod (100 ms) se nespustil
    await cekej(700);
    expect(panel(w)).toBeTruthy(); // ale po limitu se ukáže i tak
    expect(panel(w)!.textContent).toContain('důvod: dlouho');
  });

  it('chyba načtení stylů z /assets/ se bere jako nenačtený soubor', async () => {
    const w = otevri({ html: rychle() });
    const css = w.document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/assets/index-abc.css';
    w.document.head.appendChild(css);
    css.dispatchEvent(new w.Event('error'));
    await cekej(350);
    expect(panel(w)!.textContent).toContain('důvod: soubor');
  });

  it('když se appka rozběhne dřív, než doběhne „rychlý“ důvod, nic se neukáže', async () => {
    const w = otevri({ html: rychle() });
    w.dispatchEvent(new w.ErrorEvent('error', { message: 'Foo is not defined' }));
    spust(w);
    await cekej(800);
    expect(panel(w)).toBeNull();
  });

  it('na pozadí (skrytá stránka) se čas do limitu nepočítá', async () => {
    let skryta = true;
    const w = otevri({
      html: rychle(),
      predSpustenim: (win) => { Object.defineProperty(win.document, 'hidden', { get: () => skryta, configurable: true }); },
    });
    await cekej(1000);
    expect(panel(w)).toBeNull();
    skryta = false;
    await cekej(300);
    expect(panel(w)).toBeNull(); // po návratu je do limitu ještě celých ~600 ms
    await cekej(900);
    expect(panel(w)).toBeTruthy();
  });

  it('prohlížeč bez modulů (nomodule) ukáže obrazovku hned, bez čekání na limit', () => {
    const w = otevri({ ua: UA_STARY, bezModulu: true });
    const p = panel(w)!;
    expect(p).toBeTruthy();
    expect(p.textContent).toContain('příliš starý a aplikaci vůbec neumí spustit');
    expect(p.textContent).toContain('důvod: moduly');
  });

  it('prohlížeč s moduly nomodule skript nespustí a obrazovka se hned neukáže', () => {
    const w = otevri({ ua: UA_NOVY });
    expect(panel(w)).toBeNull();
  });

  it('obrazovka se neukáže, když už v #root něco je (appka běží) — ani přímým zavoláním', () => {
    const w = otevri({ ua: UA_NOVY });
    spust(w);
    w.__zajicZachrana!('moduly');
    expect(panel(w)).toBeNull();
  });

  it('dvojí zavolání nevyrobí dvě obrazovky', () => {
    const w = otevri({ ua: UA_NOVY });
    w.__zajicZachrana!('moduly');
    w.__zajicZachrana!('chyba');
    expect(w.document.querySelectorAll('#zajic-zachrana').length).toBe(1);
  });

  it('volání bez důvodu použije výchozí „dlouho“', () => {
    const w = otevri({ ua: UA_NOVY });
    w.__zajicZachrana!();
    expect(panel(w)!.textContent).toContain('důvod: dlouho');
  });
});

describe('záchranná obrazovka — tlačítka', () => {
  const cekej = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const tlacitka = (w: Okno) => [...w.document.querySelectorAll('#zajic-zachrana button')] as HTMLButtonElement[];
  const stav = (w: Okno) => w.document.getElementById('zajic-zachrana-stav')!.textContent;
  /** jsdom navigovat neumí, takže pokus o obnovení stránky (location.reload) hlásí jako „not implemented: navigation“. */
  const obnovilo = (w: Okno) => w.__testChyby.some((m) => /navigation/i.test(m));

  it('jsou dvě: „Zkusit znovu“ a „Vyčistit mezipaměť a zkusit znovu“', () => {
    const w = otevri({ ua: UA_STARY, bezModulu: true });
    expect(tlacitka(w).map((b) => b.textContent)).toEqual(['Zkusit znovu', 'Vyčistit mezipaměť a zkusit znovu']);
    for (const b of tlacitka(w)) expect(b.getAttribute('type')).toBe('button');
  });

  it('„Zkusit znovu“ obnoví stránku', async () => {
    const w = otevri({ ua: UA_STARY, bezModulu: true });
    expect(obnovilo(w)).toBe(false);
    tlacitka(w)[0].click();
    await cekej(30);
    expect(obnovilo(w)).toBe(true);
  });

  it('offline se mezipaměť nemaže (appka by se pak nedala spustit) a vysvětlí se proč', async () => {
    const volano: string[] = [];
    const w = otevri({
      ua: UA_STARY, bezModulu: true,
      predSpustenim: (win) => {
        Object.defineProperty(win.navigator, 'onLine', { get: () => false, configurable: true });
        Object.defineProperty(win.navigator, 'serviceWorker', {
          value: { getRegistrations: () => { volano.push('sw'); return Promise.resolve([]); } }, configurable: true,
        });
        win.caches = { keys: () => { volano.push('caches'); return Promise.resolve([]); }, delete: () => Promise.resolve(true) };
      },
    });
    tlacitka(w)[1].click();
    await cekej(60);
    expect(volano).toEqual([]);
    expect(obnovilo(w)).toBe(false);
    expect(stav(w)).toContain('Telefon je offline');
  });

  it('online odregistruje service worker, smaže všechny mezipaměti a pak stránku obnoví', async () => {
    const volano: string[] = [];
    const w = otevri({
      ua: UA_STARY, bezModulu: true,
      predSpustenim: (win) => {
        Object.defineProperty(win.navigator, 'serviceWorker', {
          value: {
            getRegistrations: () => Promise.resolve([
              { unregister: () => { volano.push('odregistrovan 1'); return Promise.resolve(true); } },
              { unregister: () => { volano.push('odregistrovan 2'); return Promise.resolve(true); } },
            ]),
          },
          configurable: true,
        });
        win.caches = {
          keys: () => Promise.resolve(['pivovar-v1', 'pivovar-v2']),
          delete: (n: string) => { volano.push('smazano ' + n); return Promise.resolve(true); },
        };
      },
    });
    tlacitka(w)[1].click();
    await cekej(100);
    expect([...volano].sort()).toEqual(['odregistrovan 1', 'odregistrovan 2', 'smazano pivovar-v1', 'smazano pivovar-v2']);
    expect(obnovilo(w)).toBe(true);
  });

  it('i když mazání mezipaměti selže, stránka se přesto obnoví', async () => {
    const w = otevri({
      ua: UA_STARY, bezModulu: true,
      predSpustenim: (win) => {
        Object.defineProperty(win.navigator, 'serviceWorker', {
          value: { getRegistrations: () => Promise.reject(new Error('zakázáno')) }, configurable: true,
        });
      },
    });
    tlacitka(w)[1].click();
    await cekej(100);
    expect(obnovilo(w)).toBe(true);
  });

  it('prohlížeč bez service workeru a bez Cache API se obnoví také (není co mazat)', async () => {
    const w = otevri({ ua: UA_STARY, bezModulu: true });
    tlacitka(w)[1].click();
    await cekej(100);
    expect(obnovilo(w)).toBe(true);
  });
});
