import { describe, it, expect } from 'vitest';
import { mailtoPozvanky, odkazAplikace, ODKAZ_APLIKACE, PREDMET_POZVANKY, prehledAplikace, sablonaEmailuSupabase, textPozvanky } from './pozvanka';
import { NAVOD_ODDILY } from '../components/NavodPouziti';

describe('pozvánka do aplikace', () => {
  it('text nese odkaz, instalaci bez obchodu, přihlášení a odkaz na návod', () => {
    const t = textPozvanky('https://priklad.cz/');
    expect(t).toContain('https://priklad.cz/');
    expect(t).toContain('Google Play');
    expect(t).toContain('Přidat na plochu');
    expect(t).toContain('Info');
  });

  it('s přístupem nese e-mail a dočasné heslo, bez něj ne', () => {
    expect(textPozvanky('https://x.cz/', { email: 'a@b.cz', heslo: 'Abc123xyz9' })).toContain('Dočasné heslo: Abc123xyz9');
    expect(decodeURIComponent(mailtoPozvanky('a@b.cz', 'https://x.cz/', 'Abc123xyz9'))).toContain('Abc123xyz9');
    expect(mailtoPozvanky('a@b.cz', 'https://x.cz/')).not.toContain('Abc123xyz9');
  });

  it('bez přístupu heslo v e-mailu není — posílá se zvlášť', () => {
    const t = textPozvanky();
    expect(t).toContain('Správce ti poslal druhý e-mail');
    expect(t).toContain('Zapomněl(a) jsem heslo');
    expect(t).not.toMatch(/heslo:\s*\S+/i);
  });

  it('mailto má předmět i text, mezery se píšou %20 (ne „+“) a vejde se do limitu', () => {
    const m = mailtoPozvanky('jan.novak@example.cz', 'https://priklad.cz/');
    expect(m.startsWith('mailto:jan.novak%40example.cz?')).toBe(true);
    const q = new URLSearchParams(m.split('?')[1].replace(/%20/g, '+'));
    expect(q.get('subject')).toBe(PREDMET_POZVANKY);
    expect(q.get('body')).toContain('Ahoj');
    expect(q.get('body')).toContain('https://priklad.cz/');
    expect(m).not.toContain('+');
    expect(m.length).toBeLessThanOrEqual(16000);
  });

  it('odkaz mimo prohlížeč je adresa ostrého provozu', () => {
    expect(ODKAZ_APLIKACE).toBe('https://zajic-pivovar.pages.dev/');
    expect(odkazAplikace()).toMatch(/^https?:\/\/.+\/$/);
  });
});

describe('pozvánka: co v aplikaci všechno je', () => {
  it('přehled má řádek na každý oddíl návodu kromě „Začínáme“ a výčet funkcí', () => {
    const r = prehledAplikace(true).join('\n');
    for (const o of NAVOD_ODDILY.filter((x) => x.klic !== 'zaciname')) expect(r).toContain(o.nazev);
    expect(r).toContain('Umí:');
    expect(prehledAplikace(false).join('\n')).not.toContain('Umí:');
  });

  it('plný text pozvánky nese přehled; krátký ho vynechá', () => {
    expect(textPozvanky('https://x.cz/')).toContain('KROK 5 — CO V APLIKACI VŠECHNO JE');
    expect(textPozvanky('https://x.cz/', undefined, 'zadny')).not.toContain('KROK 5');
  });

  it('mailto se vejde do limitu adresy a vždy nese odkaz na Info; plný text jde zkopírovat', () => {
    const m = mailtoPozvanky('a@b.cz', 'https://x.cz/', 'Abc123xyz9');
    expect(m.length).toBeLessThanOrEqual(16000);
    expect(decodeURIComponent(m)).toContain('Info');
    expect(decodeURIComponent(m)).toContain('Založte si své heslo');
    expect(decodeURIComponent(m)).toContain('Abc123xyz9');
  });

  it('šablona e-mailu pro Supabase má odkaz pro heslo, instalaci a přehled aplikace', () => {
    for (const druh of ['pozvanka', 'obnova'] as const) {
      const h = sablonaEmailuSupabase(druh, 'https://x.cz/');
      expect(h).toContain('{{ .ConfirmationURL }}');
      expect(h).toContain('Google Play');
      expect(h).toContain('Info');
      for (const o of NAVOD_ODDILY.filter((x) => x.klic !== 'zaciname')) expect(h).toContain(o.nazev.replace(/&/g, '&amp;'));
    }
    expect(sablonaEmailuSupabase('pozvanka')).toContain('Správce ti schválil přístup');
    expect(sablonaEmailuSupabase('obnova')).toContain('Nastavit nové heslo');
  });

  it('e-mail s pozvánkou nese postup hesla, instalace (s ikonami), použití i přehled aplikace', () => {
    const t = textPozvanky('https://x.cz/');
    for (const kus of ['KROK 1', 'KROK 2', 'KROK 3', 'KROK 4', 'KROK 5', 'Založte si své heslo', '⋮', '⬆', 'Přidat na plochu', 'Nový uživatel', 'Zelená tečka', 'Uložit']) {
      expect(t, kus).toContain(kus);
    }
    const m = decodeURIComponent(mailtoPozvanky('a@b.cz', 'https://x.cz/'));
    // Celý text se do telefonního mailto: vejde — žádné zkrácení na pár řádků.
    expect(m).toContain('KROK 5');
    expect(m).toContain('Umí:');
  });
});
