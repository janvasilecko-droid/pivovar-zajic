// @vitest-environment node
// Přísný režim odpovědí „Jen z knih a dat“ (R37): zadání majitele z RAG šablony — „odpovídat výhradně
// na základě mých oborových dat“. Jen vymyšlené věty — žádný text skutečných knih (repo je veřejné).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { kontextDotazu, kontextZPozadavku, pozadavekChatu, SYSTEM_PROMPT } from './chat';
import { INSTRUKCE } from './mcp';
import { REZIM_JEN_Z_DAT, REZIMY_ODPOVEDI } from './rozsah-chatu';
import { ChybaVstupu } from './vstupy';

const ID = '11111111-2222-3333-4444-555555555555';
const K = { dnes: 'středa 24. 11. 2026', jmeno: null, zapis: false, problem: null, web: false };

describe('režim odpovědí v požadavku', () => {
  it('jsou právě dva: sládek (výchozí) a knihy', () => {
    expect([...REZIMY_ODPOVEDI]).toEqual(['sladek', 'knihy']);
  });

  it('bez režimu (chybí, null, prázdný) je výchozí „sladek“', () => {
    for (const telo of [{ otazka: 'pěna' }, { otazka: 'pěna', rezim: null }, { otazka: 'pěna', rezim: '' }, { otazka: 'pěna', rezim: undefined }]) {
      expect(pozadavekChatu(telo).rezim).toBe('sladek');
    }
  });

  it('přijme „sladek“ i „knihy“; cokoli jiného odmítne (přísný režim se omylem ani nezapne, ani nevypne)', () => {
    expect(pozadavekChatu({ otazka: 'pěna', rezim: 'sladek' }).rezim).toBe('sladek');
    expect(pozadavekChatu({ otazka: 'pěna', rezim: 'knihy' }).rezim).toBe('knihy');
    for (const spatny of ['KNIHY', 'Knihy', 'prisny', 'strict', 1, true, {}, []]) {
      expect(() => pozadavekChatu({ otazka: 'pěna', rezim: spatny }), String(spatny)).toThrow(ChybaVstupu);
    }
    expect(() => pozadavekChatu({ otazka: 'pěna', rezim: 'strict' })).toThrow('Neplatný režim odpovědí.');
  });

  it('v přísném režimu je internet vždy vypnutý, i když ho appka (omylem) pošle zapnutý; ve výchozím režimu zůstává', () => {
    expect(pozadavekChatu({ otazka: 'pěna', rezim: 'knihy', web: true }).web).toBe(false);
    expect(pozadavekChatu({ otazka: 'pěna', rezim: 'sladek', web: true }).web).toBe(true);
    expect(pozadavekChatu({ otazka: 'pěna', web: true }).web).toBe(true);
  });
});

describe('text přísného režimu', () => {
  it('odpovídá výhradně z dat, bez obecné znalosti, odhadů a vlastních doporučení; má přednost před obecnou praxí', () => {
    expect(REZIM_JEN_Z_DAT).toContain('JEN Z KNIH A DAT');
    expect(REZIM_JEN_Z_DAT).toContain('Odpovídej výhradně z toho, co vrátily nástroje');
    for (const zdroj of ['knihy', 'zkušenosti sládků', 'várky', 'profil pivovaru', 'stav sklepa', 'výpočty']) expect(REZIM_JEN_Z_DAT).toContain(zdroj);
    expect(REZIM_JEN_Z_DAT).toContain('Nepřidávej obecnou znalost, vlastní doporučení ani odhady mimo tato data, ani když odpověď znáš');
    expect(REZIM_JEN_Z_DAT).toContain('toto pravidlo má přednost před pravidlem o obecné odborné praxi');
  });

  it('doporučení jen ze zdrojů; když v datech odpověď není, řekne to a co by pomohlo; internet nehledá', () => {
    expect(REZIM_JEN_Z_DAT).toContain('Doporučení a postupy uváděj jen tehdy, když je obsahují zdroje (s citací)');
    expect(REZIM_JEN_Z_DAT).toContain('„V nahraných datech jsem odpověď nenašel“');
    expect(REZIM_JEN_Z_DAT).toContain('řekni, co by pomohlo nahrát nebo zapsat');
    expect(REZIM_JEN_Z_DAT).toContain('podej jen to, co data opravdu říkají');
    expect(REZIM_JEN_Z_DAT).toContain('Internet nehledej.');
  });

  it('beze data — jde do kontextu dotazu, ne do cachovaného promptu, ale i tak žádná čísla dne', () => {
    expect(REZIM_JEN_Z_DAT).not.toMatch(/\d{4}-\d{2}-\d{2}|\d{1,2}\. \d{1,2}\. \d{4}/);
  });
});

describe('kontext dotazu podle režimu', () => {
  it('přísný režim: blok režimu místo věty o internetu a obecné znalosti', () => {
    const s = kontextDotazu({ ...K, rezim: 'knihy' });
    expect(s).toContain(REZIM_JEN_Z_DAT);
    expect(s).not.toContain('obecné odborné znalosti, internet nehledej');
    expect(s).not.toContain('Hledání na internetu je zapnuté');
    expect(s.startsWith('Dnes je středa 24. 11. 2026.')).toBe(true);
  });

  it('přísný režim zůstává přísný, i když by bylo zapnuté hledání na internetu (blok režimu má přednost)', () => {
    const s = kontextDotazu({ ...K, web: true, rezim: 'knihy' });
    expect(s).toContain(REZIM_JEN_Z_DAT);
    expect(s).not.toContain('Hledání na internetu je zapnuté');
  });

  it('výchozí režim (i bez uvedení režimu): žádný blok režimu, věta o internetu jako dřív', () => {
    for (const rezim of [undefined, 'sladek' as const]) {
      const s = kontextDotazu({ ...K, rezim });
      expect(s).not.toContain('REŽIM ODPOVĚDÍ');
      expect(s).toContain('Hledání na internetu je vypnuté — odpovídej z knihovny, dat appky a obecné odborné znalosti, internet nehledej.');
    }
    expect(kontextDotazu({ ...K, web: true, rezim: 'sladek' })).toContain('Hledání na internetu je zapnuté.');
  });

  it('stav sklepa, analýza problému a zápis zjištění fungují i v přísném režimu (jsou to data appky)', () => {
    const s = kontextDotazu({ ...K, zapis: true, problem: { id: ID, nazev: 'Málo pěny' }, provoz: 'Tank 7: 12° Světlá, 3 800 l', rezim: 'knihy' });
    expect(s).toContain(REZIM_JEN_Z_DAT);
    expect(s).toContain(`problem_id ${ID}`);
    expect(s).toContain('zapis_zjisteni');
    expect(s).toContain('<provoz>\nTank 7: 12° Světlá, 3 800 l\n</provoz>');
  });
});

describe('prompt a konektor znají přísný režim', () => {
  it('systémový prompt: pravidlo přísného režimu je mezi pravidly a před tvarem odpovědi; obecnou praxi tehdy ruší', () => {
    expect(SYSTEM_PROMPT).toContain('Řídí-li kontext dotazu „REŽIM ODPOVĚDÍ: JEN Z KNIH A DAT“, platí přísně');
    expect(SYSTEM_PROMPT).toContain('pravidlo o obecné odborné praxi níže se tehdy nepoužije');
    const i = SYSTEM_PROMPT.indexOf('Řídí-li kontext dotazu');
    expect(i).toBeGreaterThan(SYSTEM_PROMPT.indexOf('# Pravidla'));
    expect(i).toBeLessThan(SYSTEM_PROMPT.indexOf('odpověz naplno z obecné znalosti'));
    expect(i).toBeLessThan(SYSTEM_PROMPT.indexOf('# Tvar odpovědi'));
  });

  it('konektor: zadání s přísným režimem ruší obecnou znalost i internet a říká, co napsat, když v datech nic není', () => {
    expect(INSTRUKCE).toContain('Když zadání z appky říká „REŽIM ODPOVĚDÍ: JEN Z KNIH A DAT“, toto neplatí');
    expect(INSTRUKCE).toContain('odpovídej přísně jen z výsledků nástrojů');
    expect(INSTRUKCE).toContain('obecnou znalost ani vlastní doporučení nepřidávej, internet nehledej');
    expect(INSTRUKCE).toContain('řekni „V nahraných datech jsem odpověď nenašel“');
    // věta stojí hned za pravidlem o obecné znalosti, které ruší
    expect(INSTRUKCE.indexOf('Když zadání z appky říká')).toBeGreaterThan(INSTRUKCE.indexOf('nikdy ji nevydávej za citaci'));
    expect(INSTRUKCE.indexOf('Když zadání z appky říká')).toBeLessThan(INSTRUKCE.indexOf('Praxi sládků'));
  });
});

describe('kontext z požadavku appky', () => {
  const o = { dnes: 'středa 24. 11. 2026', jmeno: null, zapis: false, problem: null };

  it('přísný režim a stav sklepa z požadavku se opravdu dostanou do kontextu; internet je tehdy vypnutý', () => {
    const p = pozadavekChatu({ otazka: 'pěna', rezim: 'knihy', web: true, provoz: 'Tank 7: 12° Světlá' });
    const s = kontextZPozadavku(p, o);
    expect(s).toContain(REZIM_JEN_Z_DAT);
    expect(s).toContain('<provoz>\nTank 7: 12° Světlá\n</provoz>');
    expect(s).not.toContain('Hledání na internetu je zapnuté');
  });

  it('výchozí požadavek: žádný blok režimu, internet podle požadavku', () => {
    expect(kontextZPozadavku(pozadavekChatu({ otazka: 'pěna' }), o)).not.toContain('REŽIM ODPOVĚDÍ');
    expect(kontextZPozadavku(pozadavekChatu({ otazka: 'pěna', web: true }), o)).toContain('Hledání na internetu je zapnuté.');
  });

  it('funkce bible-chat skládá kontext právě touto funkcí (jinak by se režim do promptu nedostal)', () => {
    const zdroj = readFileSync('bible/supabase/functions/bible-chat/index.ts', 'utf-8');
    expect(zdroj).toMatch(/kontextZPozadavku\(\s*k\.pozadavek,/);
    expect(zdroj).not.toMatch(/kontextDotazu\(/);
  });
});
