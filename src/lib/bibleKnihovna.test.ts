import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  OBNOVA_MIMO_BEH_MS, OBNOVA_PRI_CEKANI_MS, OBNOVA_PRI_ZPRACOVANI_MS, PLAN_ZPRACOVANI_CRON, PRIJIMANE_PRIPONY,
  TYPY_SOUBORU, bezpecneJmeno, casBehuText, chybiMigrace, dalsiBehZpracovani, hlaskaChyby, intervalObnovy, jeZpracovany,
  nazevZeSouboru, posledniBehZpracovani, postupText, pripona, procentZpracovani, prubehText, sha256Hex, souhrnNakladu,
  textCekani, typSouboru, velikostText,
} from './bibleKnihovna';
import { BIBLE_OBLASTI, nazevOblasti, platneOblasti } from './bibleOblasti';

// Knihovna žije v samostatném projektu bible (R12) — bucket a oblasti hlídá jeho migrace.
const MIGRACE = readFileSync('bible/supabase/migrations/20261101000000_bible_zaklad.sql', 'utf8');

describe('typy souborů knihovny', () => {
  it('pozná typ podle přípony bez ohledu na velikost písmen', () => {
    expect(typSouboru('Kunze - Technology Brewing.PDF')).toBe('application/pdf');
    expect(typSouboru('kniha.djvu')).toBe('image/vnd.djvu');
    expect(typSouboru('poznamky.md')).toBe('text/markdown');
    expect(typSouboru('sken.TIF')).toBe('image/tiff');
    expect(typSouboru('kniha.mobi')).toBeNull();
    expect(typSouboru('bez-pripony')).toBeNull();
    expect(pripona('.skryty')).toBe('');
  });

  it('bucket v migraci přijme přesně ty typy, které appka posílá', () => {
    const m = MIGRACE.match(/INSERT INTO storage\.buckets[\s\S]*?ARRAY\[([\s\S]*?)\]/);
    expect(m).toBeTruthy();
    const vBucketu = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    expect([...new Set(Object.values(TYPY_SOUBORU))].sort()).toEqual(vBucketu);
  });

  it('accept pro výběr souborů obsahuje všechny přípony', () => {
    expect(PRIJIMANE_PRIPONY.split(',')).toContain('.pdf');
    expect(PRIJIMANE_PRIPONY.split(',')).toHaveLength(Object.keys(TYPY_SOUBORU).length);
  });
});

describe('jména souborů', () => {
  it('bezpečné jméno pro úložiště: bez diakritiky a mezer, přípona zůstává', () => {
    expect(bezpecneJmeno('Pivovarství — Základy výroby piva (2. vyd.).pdf')).toBe('Pivovarstvi-Zaklady-vyroby-piva-2.-vyd.pdf');
    expect(bezpecneJmeno('Würze & Hopfen.PDF')).toBe('Wurze-Hopfen.pdf');
    expect(bezpecneJmeno('###.pdf')).toBe('dokument.pdf');
    expect(bezpecneJmeno('bez pripony')).toBe('bez-pripony');
  });

  it('dlouhé jméno se zkrátí', () => {
    expect(bezpecneJmeno(`${'a'.repeat(300)}.pdf`).length).toBeLessThanOrEqual(104);
  });

  it('název ze jména souboru: bez přípony, podtržítka na mezery', () => {
    expect(nazevZeSouboru('Kunze_Technology_Brewing_and_Malting_6th.pdf')).toBe('Kunze Technology Brewing and Malting 6th');
    expect(nazevZeSouboru('Chmel  a  chmelovar.docx')).toBe('Chmel a chmelovar');
  });
});

describe('popisy', () => {
  it('velikost souboru česky', () => {
    expect(velikostText(512)).toBe('512 B');
    expect(velikostText(2048)).toBe('2 kB');
    expect(velikostText(412 * 1024 * 1024)).toBe('412,0 MB');
    expect(velikostText(1.5 * 1024 * 1024 * 1024)).toBe('1,50 GB');
  });

  it('postup zpracování ukazuje jen to, co je známé', () => {
    expect(postupText({}, null)).toBe('');
    expect(postupText({ stran: 412, ocr: 30, kapitol: 18, pasazi: 950, ke_kontrole: 3 })).toBe('412 stran · 30 přes OCR · 18 kapitol · 950 pasáží · 3 ke kontrole');
    expect(postupText(null, 120)).toBe('120 stran');
  });

  it('zpracovaná je jen kniha ve stavu hotovo nebo ke kontrole', () => {
    expect(jeZpracovany('hotovo')).toBe(true);
    expect(jeZpracovany('ke_kontrole')).toBe(true);
    for (const s of ['ceka', 'zpracovava', 'chyba', 'pozastaveno'] as const) expect(jeZpracovany(s)).toBe(false);
  });
});

describe('hlášky chyb', () => {
  it('rozliší duplicitu, velikost, typ, práva, migraci a síť', () => {
    expect(hlaskaChyby({ code: '23505', message: 'duplicate key value' })).toMatch(/už v knihovně je/);
    expect(hlaskaChyby({ statusCode: '413', message: 'The object exceeded the maximum allowed size' })).toMatch(/50 MB/);
    expect(hlaskaChyby({ statusCode: '415', message: 'mime type text/html is not supported' })).toMatch(/typ souboru/);
    expect(hlaskaChyby({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/Nemáš právo/);
    expect(hlaskaChyby({ code: '42P01', message: 'relation "bible_dokumenty" does not exist' })).toMatch(/migraci/);
    expect(hlaskaChyby(new TypeError('Failed to fetch'))).toMatch(/Spojení/);
    expect(hlaskaChyby({ message: 'něco jiného' })).toBe('něco jiného');
  });

  it('chybějící tabulka nebo funkce = migrace ještě neběžela', () => {
    expect(chybiMigrace({ code: 'PGRST205', message: "Could not find the table 'public.bible_dokumenty'" })).toBe(true);
    expect(chybiMigrace({ code: 'PGRST202', message: 'Could not find the function public.bible_kapacita' })).toBe(true);
    expect(chybiMigrace({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(chybiMigrace(null)).toBe(false);
  });
});

describe('SHA-256', () => {
  it('spočítá otisk souboru (známá hodnota pro „abc")', async () => {
    expect(await sha256Hex(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('tematické oblasti A–T', () => {
  it('je jich 20, A až T, přesně podle zadání', () => {
    expect(BIBLE_OBLASTI.map((o) => o.kod).join('')).toBe('ABCDEFGHIJKLMNOPQRST');
    expect(nazevOblasti('F')).toBe('Chmelovar');
    expect(nazevOblasti('T')).toBe('Řešení technologických problémů');
  });

  it('platné oblasti: velká písmena, bez opakování, seřazené, nic navíc', () => {
    expect(platneOblasti(['f', 'A', 'F', 'Z', ' d '])).toEqual(['A', 'D', 'F']);
  });

  it('databáze přijme stejná písmena', () => {
    const m = MIGRACE.match(/oblasti <@ ARRAY\[([^\]]*)\]/);
    expect(m).toBeTruthy();
    expect([...m![1].matchAll(/'([A-Z])'/g)].map((x) => x[1]).join('')).toBe('ABCDEFGHIJKLMNOPQRST');
  });
});

describe('útrata za AI', () => {
  it('sečte řádky ai_naklady celkem a po účelech', () => {
    expect(souhrnNakladu([])).toEqual({ usd: 0, volani: 0, podleUcelu: {} });
    const s = souhrnNakladu([
      { ucel: 'ocr', cena_usd: '0.250000', volani: 300 },
      { ucel: 'ocr', cena_usd: 0.05, volani: 40 },
      { ucel: 'chat', cena_usd: 0.12, volani: 1 },
    ]);
    expect(s.usd).toBeCloseTo(0.42, 6);
    expect(s.volani).toBe(341);
    expect(s.podleUcelu.ocr).toBeCloseTo(0.3, 6);
    expect(s.podleUcelu.chat).toBeCloseTo(0.12, 6);
  });
});

describe('průběh zpracování (procenta v knihovně)', () => {
  const prubeh = (p: Record<string, unknown>) => ({ prubeh: p });

  it('procenta z hotových a všech stran, nejvýš 99 (100 % je až „Zpracováno")', () => {
    expect(procentZpracovani(prubeh({ hotovo: 46, celkem: 100 }))).toBe(46);
    expect(procentZpracovani(prubeh({ hotovo: 1, celkem: 3 }))).toBe(33);
    expect(procentZpracovani(prubeh({ hotovo: 412, celkem: 412 }))).toBe(99);
    expect(procentZpracovani(prubeh({ hotovo: 500, celkem: 412 }))).toBe(99);
    expect(procentZpracovani(prubeh({ hotovo: -3, celkem: 10 }))).toBe(0);
  });

  it('bez počtu stran žádná procenta (nevymýšlí se)', () => {
    expect(procentZpracovani(null)).toBeNull();
    expect(procentZpracovani({ stran: 400 })).toBeNull();
    expect(procentZpracovani(prubeh({ faze: 'stahovani', hotovo: 0, celkem: 0 }))).toBeNull();
    expect(procentZpracovani(prubeh({ hotovo: '5', celkem: 10 }))).toBeNull();
    expect(procentZpracovani(prubeh({ hotovo: Number.NaN, celkem: 10 }))).toBeNull();
  });

  it('text u zpracovávaného dokumentu: procenta, fáze a u přepisu skenů kolik stran', () => {
    expect(prubehText('zpracovava', prubeh({ faze: 'prepis', hotovo: 46, celkem: 100, ocr_hotovo: 20, ocr_celkem: 74 })))
      .toBe('46 % · přepisuje skeny (20 z 74 stran)');
    expect(prubehText('zpracovava', prubeh({ faze: 'cteni', hotovo: 200, celkem: 800 }))).toBe('25 % · čte text');
    expect(prubehText('zpracovava', prubeh({ faze: 'ukladani', hotovo: 412, celkem: 412 }))).toBe('99 % · ukládá kapitoly a pasáže');
    expect(prubehText('zpracovava', prubeh({ faze: 'stahovani', hotovo: 0, celkem: 0 }))).toBe('stahuje soubor');
    expect(prubehText('zpracovava', {})).toBe('začíná — procenta se ukážou za chvíli');
    expect(prubehText('zpracovava', prubeh({ faze: 'neco_noveho', hotovo: 1, celkem: 2 }))).toBe('50 % · zpracovává');
  });

  it('u čekajícího dokumentu řekne jen přepsané skenované strany (ty se znovu neplatí); jinak nic', () => {
    expect(prubehText('ceka', prubeh({ faze: 'prepis', hotovo: 30, celkem: 100, ocr_hotovo: 4, ocr_celkem: 74 })))
      .toBe('Už přepsáno 4 z 74 naskenovaných stran — znovu se neplatí');
    // Kniha s 325 stranami textu a 2 skeny, odložená kvůli kreditu: žádné klamavé „99 %".
    expect(prubehText('ceka', prubeh({ faze: 'prepis', hotovo: 325, celkem: 327, ocr_hotovo: 0, ocr_celkem: 2 }))).toBeNull();
    expect(prubehText('ceka', prubeh({ faze: 'cteni', hotovo: 0, celkem: 100 }))).toBeNull();
    expect(prubehText('ceka', { stran: 10 })).toBeNull();
    expect(prubehText('hotovo', prubeh({ hotovo: 10, celkem: 10 }))).toBeNull();
    expect(prubehText('chyba', prubeh({ hotovo: 5, celkem: 10, ocr_hotovo: 5, ocr_celkem: 10 }))).toBeNull();
  });

  it('když se worker dlouho neozval, připíše „bez zprávy" (spadlý běh drží zámek až 2 h)', () => {
    const ted = new Date('2026-10-31T19:30:00Z');
    const p = (cas: string) => prubeh({ faze: 'prepis', hotovo: 46, celkem: 100, ocr_hotovo: 20, ocr_celkem: 74, cas });
    expect(prubehText('zpracovava', p('2026-10-31T19:20:00+00:00'), ted)).toBe('46 % · přepisuje skeny (20 z 74 stran)');
    expect(prubehText('zpracovava', p('2026-10-31T19:10:00+00:00'), ted)).toBe('46 % · přepisuje skeny (20 z 74 stran) · bez zprávy 20 min');
    expect(prubehText('zpracovava', p('2026-10-31T18:05:00+00:00'), ted)).toBe('46 % · přepisuje skeny (20 z 74 stran) · bez zprávy 85 min');
    expect(prubehText('zpracovava', p('nesmysl'), ted)).toBe('46 % · přepisuje skeny (20 z 74 stran)');
  });

  it('text čekání: konkrétní běh slibuje, jen když je jistý (GitHub běhy zdržuje o hodiny)', () => {
    const fronta = 'Čeká ve frontě — přijde na řadu v tomhle běhu, až doběhne rozpracovaná kniha.';
    const dalsi = 'Čeká na další běh zpracování — podle plánu v 22:17, GitHub ho ale často o hodinu i víc zdrží.';
    const plan = 'Čeká na běh zpracování — spouští se samo každé 3 hodiny (plán 19:17, 22:17, …), GitHub ho ale často o hodinu i víc zdrží.';
    const v19 = new Date('2026-10-31T19:00:00Z');   // 20:00 v Praze, po plánu 18:17 UTC (19:17 Praha)
    // Jiná kniha se zpracovává a tuhle běh ještě neprošel → v tomhle běhu (i nahranou až během něj).
    expect(textCekani(true, {}, null, v19)).toBe(fronta);
    expect(textCekani(true, { prubeh: { faze: 'prepis', cas: '2026-10-31T16:00:00+00:00' } }, null, v19)).toBe(fronta);
    // Tenhle běh ji už odložil (skeny bez kreditu) → ve stejném běhu ji znovu nevezme.
    expect(textCekani(true, { prubeh: { faze: 'prepis', cas: '2026-10-31T18:40:00+00:00' } }, null, v19)).toBe(dalsi);
    // Tenhle běh ji dokončil a správce ji vrátil přes „Zpracovat znovu" → taky až další běh.
    expect(textCekani(true, { stran: 10 }, '2026-10-31T18:45:00+00:00', v19)).toBe(dalsi);
    expect(textCekani(false, { stran: 10 }, '2026-10-31T18:45:00+00:00', v19)).toBe(dalsi);
    // Dokončená v minulém běhu → nic jistého, jen plán.
    expect(textCekani(false, { stran: 10 }, '2026-10-31T17:00:00+00:00', v19)).toBe(plan);
    // Jinak se neví, jestli běh z 19:17 už proběhl (GitHub ho zdržuje) → jen plán, žádný slib.
    expect(textCekani(false, {}, null, new Date('2026-10-31T18:30:00Z'))).toBe(plan);
    expect(textCekani(false, {}, null, new Date('2026-10-31T20:59:00Z'))).toBe(plan);
    expect(textCekani(false, { prubeh: { faze: 'prepis', cas: '2026-10-31T17:45:00+00:00' } }, null, new Date('2026-10-31T18:30:00Z'))).toBe(plan);
    // Neplatné datum nic neslibuje.
    expect(textCekani(true, { prubeh: { faze: 'prepis', cas: 'nesmysl' } }, 'nesmysl', v19)).toBe(fronta);
    // Přesně v plánovaném čase už platí nový plán (21:17 UTC = 22:17 Praha je poslední, další 01:17).
    expect(textCekani(false, {}, null, new Date('2026-10-31T21:17:00Z')))
      .toBe('Čeká na běh zpracování — spouští se samo každé 3 hodiny (plán 22:17, 01:17, …), GitHub ho ale často o hodinu i víc zdrží.');
    expect(posledniBehZpracovani(new Date('2026-10-31T18:16:00Z')).toISOString()).toBe('2026-10-31T15:17:00.000Z');
  });

  it('interval obnovy: zpracování 20 s; čekání 60 s jen do 90 min po plánovaném běhu, jinak 10 min; jinak nic', () => {
    expect(intervalObnovy(true, true, new Date('2026-10-31T20:00:00Z'))).toBe(OBNOVA_PRI_ZPRACOVANI_MS);
    expect(intervalObnovy(false, true, new Date('2026-10-31T18:30:00Z'))).toBe(OBNOVA_PRI_CEKANI_MS);
    expect(intervalObnovy(false, true, new Date('2026-10-31T19:46:00Z'))).toBe(OBNOVA_PRI_CEKANI_MS);
    expect(intervalObnovy(false, true, new Date('2026-10-31T19:48:00Z'))).toBe(OBNOVA_MIMO_BEH_MS);
    expect(intervalObnovy(false, false, new Date('2026-10-31T18:30:00Z'))).toBeNull();
    expect([OBNOVA_PRI_ZPRACOVANI_MS, OBNOVA_PRI_CEKANI_MS, OBNOVA_MIMO_BEH_MS]).toEqual([20_000, 60_000, 600_000]);
  });

  it('další plánovaný běh: každé 3 hodiny v :17 UTC, vždy až po teď', () => {
    expect(dalsiBehZpracovani(new Date('2026-10-31T17:44:00Z')).toISOString()).toBe('2026-10-31T18:17:00.000Z');
    expect(dalsiBehZpracovani(new Date('2026-10-31T18:17:00Z')).toISOString()).toBe('2026-10-31T21:17:00.000Z');
    expect(dalsiBehZpracovani(new Date('2026-10-31T18:16:59Z')).toISOString()).toBe('2026-10-31T18:17:00.000Z');
    expect(dalsiBehZpracovani(new Date('2026-10-31T23:30:00Z')).toISOString()).toBe('2026-11-01T00:17:00.000Z');
    expect(dalsiBehZpracovani(new Date('2026-12-31T22:00:00Z')).toISOString()).toBe('2027-01-01T00:17:00.000Z');
  });

  it('čas běhu po pražsku (zima +1 h, léto +2 h)', () => {
    expect(casBehuText(new Date('2026-10-31T18:17:00Z'))).toBe('19:17');
    expect(casBehuText(new Date('2026-07-01T09:17:00Z'))).toBe('11:17');
  });

  it('plán v knihovně odpovídá cronu workflow zpracování', () => {
    const workflow = readFileSync('.github/workflows/bible-zpracovani.yml', 'utf8');
    expect(workflow).toContain(`- cron: '${PLAN_ZPRACOVANI_CRON}'`);
    expect(PLAN_ZPRACOVANI_CRON).toBe('17 */3 * * *');
  });
});
