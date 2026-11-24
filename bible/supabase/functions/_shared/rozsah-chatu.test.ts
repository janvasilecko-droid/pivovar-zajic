// Rozsah AI sládka (24. 11. 2026): normální chatbot na všechno, co se řeší v pivovaru — ne jen analýza
// problémů z knihovny. Jeden text pro chat v appce i pro konektor do Claude.
import { describe, expect, it } from 'vitest';
import { kontextDotazu, SYSTEM_PROMPT } from './chat';
import { INSTRUKCE, NASTROJE } from './mcp';
import { POSTUP_PROBLEMU } from './postup-problemu';
import { FORMY_ODPOVEDI, ROZSAH_TEMAT } from './rozsah-chatu';

const BEZ_DATA = /\d{4}-\d{2}-\d{2}|\d{1,2}\. \d{1,2}\. \d{4}/;

describe('rozsah témat', () => {
  it('pokrývá, co majitel jmenoval (návod na vaření piva, varna, plísně) i celý provoz kolem toho', () => {
    const t = ROZSAH_TEMAT.toLowerCase();
    for (const tema of [
      'návod na vaření piva', 'obsluha varny', 'vystírka', 'rmutování', 'chmelovar', 'whirlpool', 'kvašení', 'filtrace',
      'stáčení', 'hygiena', 'sanitace', 'cip', 'plísně', 'infekce', 'vady', 'suroviny', 'receptury', 'výpočty', 'údržba',
      'bezpečnost práce', 'čepování',
    ]) expect(t, `chybí téma: ${tema}`).toContain(tema);
  });

  it('není to jen rozbor problémů a nic se neodmítá jen proto, že téma není v knihách', () => {
    expect(ROZSAH_TEMAT).toMatch(/ne jen na problémy/);
    expect(ROZSAH_TEMAT).toMatch(/jako zkušený kolega, ne jako vyhledávač/);
    expect(ROZSAH_TEMAT).toMatch(/neodmítáš jen proto, že v knihách není/);
  });

  it('beze data a čísel dne — text je v promptu a prompt se ukládá do mezipaměti', () => {
    for (const text of [ROZSAH_TEMAT, FORMY_ODPOVEDI]) expect(text).not.toMatch(BEZ_DATA);
  });
});

describe('tvar odpovědi', () => {
  const radky = FORMY_ODPOVEDI.split('\n');
  const bod = (zacatek: string) => radky.find((r) => r.startsWith(`- ${zacatek}`)) ?? '';

  it('návod: podrobný, v číslovaných krocích, s parametry, chybami a bezpečností; nezkracuje se', () => {
    const navod = bod('Návod nebo postup');
    expect(navod).toMatch(/podrobný, v číslovaných krocích/);
    expect(navod).toMatch(/Na začátku co je potřeba/);
    expect(navod).toMatch(/teplota, čas, množství, tlak nebo koncentrace s jednotkami/);
    expect(navod).toMatch(/na konci časté chyby a bezpečnost/);
    expect(navod).toMatch(/Návod nezkracuj/);
    expect(navod).toMatch(/profilu pivovaru/);
    for (const priklad of ['jak uvařit pivo', 'jak obsluhovat varnu', 'jak sanitovat tank']) expect(navod).toContain(priklad);
  });

  it('plíseň a hygiena: co hned, jak předejít, kdy je šarže nepoužitelná, bezpečnost chemie', () => {
    const plisen = bod('Plíseň, infekce, hygiena');
    expect(plisen).toMatch(/co udělat hned \(izolovat, vyřadit dotčené pivo nebo surovinu, vyčistit a sanitovat\)/);
    expect(plisen).toMatch(/jak tomu předejít/);
    expect(plisen).toMatch(/kdy je šarže nepoužitelná/);
    expect(plisen).toMatch(/bezpečnost \(chemie, ochranné pomůcky, větrání\)/);
  });

  it('vada nebo porucha → postup řešení problému; krátká otázka → krátká odpověď bez nadpisů', () => {
    expect(bod('Vada, odchylka, porucha')).toMatch(/postup řešení problému/);
    expect(bod('Krátká nebo jednoduchá otázka')).toMatch(/krátká přímá odpověď bez nadpisů/);
  });

  it('čísla jen nástrojem vypocet; každý nástroj, který text jmenuje, v konektoru opravdu je', () => {
    expect(bod('Čísla a výpočty')).toMatch(/nástrojem vypocet/);
    const jmena = new Set(NASTROJE.map((n) => n.name));
    const zminene = [...FORMY_ODPOVEDI.matchAll(/\b([a-z]+(?:_[a-z]+)+|vypocet)\b/g)].map((m) => m[1]);
    expect(zminene).toContain('vypocet');
    for (const jmeno of zminene) expect(jmena.has(jmeno), `nástroj ${jmeno} v konektoru není`).toBe(true);
  });

  it('nadpisy jen u delší odpovědi a podle obsahu', () => {
    expect(FORMY_ODPOVEDI).toMatch(/Nadpisy používej jen u delší odpovědi a podle obsahu/);
    for (const n of ['## Příprava', '## Postup', '## Co sledovat', '## Časté chyby', '## Bezpečnost']) expect(FORMY_ODPOVEDI).toContain(n);
  });

  it('bezpečnost: opatrně, nejistou hodnotu nevydávat za jistou; u práva a daní říct, že je třeba ověřit', () => {
    expect(FORMY_ODPOVEDI).toMatch(/nejistou hodnotu nevydávej za jistou/);
    expect(FORMY_ODPOVEDI).toMatch(/výrobce, bezpečnostní list, předpis/);
    expect(FORMY_ODPOVEDI).toMatch(/právních a daňových věcí řekni, že aktuální pravidla je třeba ověřit/);
  });
});

describe('kde se text používá', () => {
  it('chat v appce i konektor čtou přesně tentýž rozsah a tvar odpovědi', () => {
    expect(SYSTEM_PROMPT).toContain(ROZSAH_TEMAT);
    expect(SYSTEM_PROMPT).toContain(FORMY_ODPOVEDI);
    expect(INSTRUKCE).toContain(ROZSAH_TEMAT);
    expect(INSTRUKCE).toContain(FORMY_ODPOVEDI);
  });

  it('prompt otevírá sládek na jakékoli téma; tvar odpovědi je před metodou řešení problému', () => {
    expect(SYSTEM_PROMPT.startsWith('Jsi AI sládek Pivovaru Zajíc — plnohodnotný pomocník sládka na jakékoli téma')).toBe(true);
    expect(SYSTEM_PROMPT.indexOf('# Tvar odpovědi')).toBeGreaterThan(-1);
    expect(SYSTEM_PROMPT.indexOf('# Tvar odpovědi')).toBeLessThan(SYSTEM_PROMPT.indexOf('# Řešení problému'));
  });

  it('v konektoru je rozsah a tvar odpovědi na začátku (dlouhé instrukce klient může zkrátit), metoda problému na konci', () => {
    expect(INSTRUKCE.startsWith('Jsi AI sládek Pivovaru Zajíc — ')).toBe(true);
    expect(INSTRUKCE.indexOf(ROZSAH_TEMAT)).toBeLessThan(60);
    expect(INSTRUKCE.indexOf(FORMY_ODPOVEDI)).toBeLessThan(INSTRUKCE.indexOf('hledej_v_knihach'));
    expect(INSTRUKCE.indexOf(FORMY_ODPOVEDI)).toBeLessThan(INSTRUKCE.indexOf(POSTUP_PROBLEMU));
    expect(INSTRUKCE.endsWith(POSTUP_PROBLEMU)).toBe(true);
  });
});

describe('pravidla odpovědi chatu', () => {
  it('když knihy téma nemají, neodmítá: jednou větou to řekne a odpoví z obecné odborné praxe', () => {
    expect(SYSTEM_PROMPT).toContain('V nahraných knihách jsem to nenašel, odpovídám z obecné odborné praxe');
    expect(SYSTEM_PROMPT).toMatch(/odpověz naplno z obecné znalosti; neodmítej/);
  });

  it('obecná znalost se nikdy nevydává za citaci z knihy ani za údaj z provozu; citace se nevymýšlejí', () => {
    expect(SYSTEM_PROMPT).toMatch(/Obecnou znalost nikdy nevydávej za citaci z knihy ani za údaj z provozu/);
    expect(SYSTEM_PROMPT).toMatch(/nevymýšlej knihy, strany ani hodnoty/);
    expect(SYSTEM_PROMPT).toMatch(/Nepiš vlastní čísla citací ani odkazy/);
  });

  it('knihy hledá u odborné otázky a návodu; krátkou nebo obecnou otázku odpoví rovnou', () => {
    expect(SYSTEM_PROMPT).toMatch(/U odborné otázky a návodu hledej v knihách/);
    expect(SYSTEM_PROMPT).toMatch(/U krátké nebo zjevně obecné otázky, kterou knihy nepotřebují, odpověz rovnou/);
    expect(SYSTEM_PROMPT).not.toMatch(/i když odpověď znáš/); // dřívější „vždy nejdřív knihy"
  });

  it('zeptá se jen na údaj, který by odpověď zásadně změnil; jinak odpoví obecně a řekne, co by ji zpřesnilo', () => {
    expect(SYSTEM_PROMPT).toMatch(/bez kterého by se odpověď zásadně změnila/);
    expect(SYSTEM_PROMPT).toMatch(/u návodu a obecné otázky jinak odpověz obecně a řekni, co by ji zpřesnilo/);
  });

  it('rozbor problému má svoje nadpisy, návod a ostatní odpovědi nadpisy podle tvaru odpovědi', () => {
    expect(SYSTEM_PROMPT).toMatch(/U problému s rozborem používej tyto nadpisy/);
    expect(SYSTEM_PROMPT).toMatch(/u návodu a ostatních odpovědí nadpisy podle Tvaru odpovědi/);
  });

  it('konektor: neodmítá, obecnou znalost odliší od knih a nevydává ji za citaci', () => {
    expect(INSTRUKCE).toMatch(/odpověz z obecné odborné znalosti \(neodmítej\)/);
    expect(INSTRUKCE).toMatch(/obecnou znalost jasně odliš od toho, co je v knihách, a nikdy ji nevydávej za citaci/);
    expect(INSTRUKCE).toMatch(/Hlavní zdroj faktů je knihovna odborné pivovarské literatury/);
  });

  it('i bez internetu smí chat odpovídat z obecné odborné znalosti, internet ale nehledá', () => {
    const bez = kontextDotazu({ dnes: 'd', jmeno: null, zapis: false, problem: null, web: false });
    expect(bez).toContain('vypnuté');
    expect(bez).toContain('obecné odborné znalosti');
    expect(bez).toContain('internet nehledej');
    const s = kontextDotazu({ dnes: 'd', jmeno: null, zapis: false, problem: null, web: true });
    expect(s).toContain('zapnuté');
    expect(s).not.toContain('internet nehledej');
  });
});
