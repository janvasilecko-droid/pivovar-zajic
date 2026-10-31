import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PRIJIMANE_PRIPONY, TYPY_SOUBORU, bezpecneJmeno, chybiMigrace, hlaskaChyby, jeZpracovany,
  nazevZeSouboru, postupText, pripona, sha256Hex, souhrnNakladu, typSouboru, velikostText,
} from './bibleKnihovna';
import { BIBLE_OBLASTI, nazevOblasti, platneOblasti } from './bibleOblasti';

const MIGRACE = readFileSync('supabase/migrations/20261231410000_pivovarska_bible_knihovna.sql', 'utf8');

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
