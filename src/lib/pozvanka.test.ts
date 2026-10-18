import { describe, it, expect } from 'vitest';
import { mailtoPozvanky, odkazAplikace, ODKAZ_APLIKACE, PREDMET_POZVANKY, textPozvanky } from './pozvanka';

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
    expect(mailtoPozvanky('a@b.cz', 'https://x.cz/', 'Abc123xyz9')).toContain(encodeURIComponent('Dočasné heslo: Abc123xyz9').replace(/%20/g, '%20'));
    expect(mailtoPozvanky('a@b.cz', 'https://x.cz/')).not.toContain('Abc123xyz9');
  });

  it('bez přístupu heslo v e-mailu není — posílá se zvlášť', () => {
    const t = textPozvanky();
    expect(t).toContain('Přijde ti e-mail s odkazem');
    expect(t).toContain('Zapomněl(a) jsem heslo');
    expect(t).not.toMatch(/heslo:\s*\S+/i);
  });

  it('mailto má předmět i text a mezery se píšou %20 (ne „+“)', () => {
    const m = mailtoPozvanky('jan.novak@example.cz', 'https://priklad.cz/');
    expect(m.startsWith('mailto:jan.novak%40example.cz?')).toBe(true);
    const q = new URLSearchParams(m.split('?')[1].replace(/%20/g, '+'));
    expect(q.get('subject')).toBe(PREDMET_POZVANKY);
    expect(q.get('body')).toBe(textPozvanky('https://priklad.cz/'));
    expect(m).not.toContain('+');
  });

  it('odkaz mimo prohlížeč je adresa ostrého provozu', () => {
    expect(ODKAZ_APLIKACE).toBe('https://zajic-pivovar.pages.dev/');
    expect(odkazAplikace()).toMatch(/^https?:\/\/.+\/$/);
  });
});
