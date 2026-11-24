import { afterEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  htmlCitelnePozvanky, mailtoPozvanky, naCrlf, odkazAplikace, odkazCitelnePozvanky, ODKAZ_APLIKACE, PREDMET_POZVANKY, prehledAplikace,
  sablonaEmailuSupabase, sdilejPozvanku, SOUBOR_CITELNE_POZVANKY, textPozvanky,
} from './pozvanka';
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
    expect(textPozvanky('https://x.cz/', { email: 'a@b.cz', heslo: 'docasne-test' })).toContain('Dočasné heslo: docasne-test');
    expect(decodeURIComponent(mailtoPozvanky('a@b.cz', 'https://x.cz/', 'docasne-test'))).toContain('docasne-test');
    expect(mailtoPozvanky('a@b.cz', 'https://x.cz/')).not.toContain('docasne-test');
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
    const m = mailtoPozvanky('a@b.cz', 'https://x.cz/', 'docasne-test');
    expect(m.length).toBeLessThanOrEqual(16000);
    expect(decodeURIComponent(m)).toContain('Info');
    expect(decodeURIComponent(m)).toContain('Založte si své heslo');
    expect(decodeURIComponent(m)).toContain('docasne-test');
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

// 24. 11. 2026 (screenshot e-mailu v Email.cz): „Jo, to nečitelný, ta pozvánka" — text pozvánky dorazil
// bez zalomení řádků, v jednom odstavci. Dvě pojistky: konce řádků jako CRLF (RFC 6068) a odkaz
// na čitelnou kopii (public/pozvanka.html) hned v první větě.
describe('pozvánka: zalomení řádků a čitelná kopie', () => {
  const holeLf = /(?<!\r)\n/;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('naCrlf: každé LF je CRLF, hotové CRLF se nezdvojí', () => {
    expect(naCrlf('a\nb\n\nc')).toBe('a\r\nb\r\n\r\nc');
    expect(naCrlf('a\r\nb')).toBe('a\r\nb');
    expect(naCrlf('bez zalomení')).toBe('bez zalomení');
  });

  it('mailto píše konce řádků jako %0D%0A — žádné samotné %0A (některé pošty ho zahodí)', () => {
    const m = mailtoPozvanky('a@b.cz', 'https://x.cz/');
    expect(m).toContain('%0D%0A');
    expect(m).not.toMatch(/(?<!%0D)%0A/);
    const body = decodeURIComponent(m.split('body=')[1]);
    expect(body).toContain('KROK 1');
    expect(body).not.toMatch(holeLf);
    expect(body.split('\r\n').length).toBeGreaterThan(50);
  });

  it('mailto s CRLF se pořád vejde do limitu adresy a nese celý text (KROK 5, „Umí:")', () => {
    const m = mailtoPozvanky('a@b.cz', 'https://x.cz/');
    expect(m.length).toBeLessThanOrEqual(16000);
    expect(decodeURIComponent(m)).toContain('KROK 5');
  });

  it('i zkrácená pozvánka (heslo, krátký text) má konce řádků CRLF', () => {
    const m = mailtoPozvanky('a@b.cz', 'https://x.cz/', 'docasne-test');
    expect(m).not.toMatch(/(?<!%0D)%0A/);
  });

  it('sdílení pošle text s CRLF; schránka (bez sdílení) dostane původní text s LF', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { share });
    expect(await sdilejPozvanku('a@b.cz')).toBe('sdileno');
    const poslano = (share.mock.calls[0] as unknown as [{ title: string; text: string }])[0];
    expect(poslano.title).toBe(PREDMET_POZVANKY);
    expect(poslano.text).toContain('\r\n');
    expect(poslano.text).not.toMatch(holeLf);

    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await sdilejPozvanku('a@b.cz')).toBe('zkopirovano');
    const zkopirovano = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(zkopirovano).not.toContain('\r');
    expect(zkopirovano).toContain('\n');
  });

  it('odkaz na čitelnou kopii: odkaz aplikace + pozvanka.html', () => {
    expect(SOUBOR_CITELNE_POZVANKY).toBe('pozvanka.html');
    expect(odkazCitelnePozvanky('https://x.cz/')).toBe('https://x.cz/pozvanka.html');
    expect(odkazCitelnePozvanky()).toMatch(/^https?:\/\/.+\/pozvanka\.html$/);
  });

  it('pozvánka bez hesla odkazuje na čitelnou kopii hned za úvodem; s heslem ne (stránka je veřejná)', () => {
    const bez = textPozvanky('https://x.cz/').split('\n');
    const i = bez.findIndex((r) => r.startsWith('Čitelná verze v prohlížeči'));
    expect(i).toBeGreaterThan(0);
    expect(bez[i]).toContain('https://x.cz/pozvanka.html');
    expect(bez[i - 1]).toContain('Tady je celý postup krok za krokem');
    expect(textPozvanky('https://x.cz/', { email: 'a@b.cz', heslo: 'docasne-test' })).not.toContain('Čitelná verze');
  });

  it('čitelná stránka: celý text bez hesla, řádky zachované, odkazy klepnutelné, nic z textu nepřeskakuje HTML', () => {
    const h = htmlCitelnePozvanky('https://x.cz/');
    expect(h).toContain('<!doctype html>');
    expect(h).toContain('white-space:pre-wrap');
    expect(h).toContain('<meta name="viewport"');
    expect(h).toContain('<a href="https://x.cz/">https://x.cz/</a>');
    for (const kus of ['KROK 1', 'KROK 2', 'KROK 3', 'KROK 4', 'KROK 5', 'Založte si své heslo', 'Přidat na plochu', 'Umí:']) {
      expect(h, kus).toContain(kus);
    }
    expect(h).toContain('<strong>━━ KROK 1 — OTEVŘI APLIKACI ━━</strong>');
    expect(h).toContain('Správce ti poslal druhý e-mail');
    expect(h).not.toMatch(/Dočasné heslo:/);
    expect(h).not.toContain('Čitelná verze v prohlížeči'); // na stránce odkaz na sebe samu nedává smysl
    // Řádky jsou opravdu na řádcích (ne slité): nadpis kroku 2 stojí na vlastním řádku.
    expect(h.split('\n').some((r) => r === '<strong>━━ KROK 2 — NASTAV SI SVOJE HESLO ━━</strong>')).toBe(true);
  });

  it('čitelná stránka escapuje HTML z textu (např. názvy oddílů s „&")', () => {
    const h = htmlCitelnePozvanky('https://x.cz/');
    expect(h).not.toMatch(/<(?!\/?(?:a|strong|pre|main|h1|html|head|body|meta|title|style|!doctype)\b)[a-z]/i);
    expect(h).toContain('&amp;');
  });

  it('public/pozvanka.html odpovídá tomu, co se z textu pozvánky vygeneruje (po změně textu: npm run pozvanka)', () => {
    const naDisku = readFileSync('public/pozvanka.html', 'utf-8');
    expect(naDisku, 'public/pozvanka.html je zastaralá — spusť `npm run pozvanka`').toBe(htmlCitelnePozvanky());
  });
});
