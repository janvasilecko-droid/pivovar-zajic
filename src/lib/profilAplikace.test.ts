import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { adresaDruheAplikace, klicUlozistePrihlaseni, platnyProfil } from './profilAplikace';

describe('Zajíc 2: druhá aplikace s vlastním přihlášením', () => {
  it('profil je jen pár písmen a číslic', () => {
    expect(platnyProfil('2')).toBe('2');
    expect(platnyProfil('TEST')).toBe('test');
    expect(platnyProfil('')).toBe('');
    expect(platnyProfil('../x')).toBe('');
    expect(platnyProfil('devětdevět99')).toBe('');
    expect(platnyProfil(null)).toBe('');
  });

  it('běžná aplikace drží výchozí klíč přihlášení, Zajíc 2 má svůj', () => {
    expect(klicUlozistePrihlaseni('')).toBeUndefined();
    expect(klicUlozistePrihlaseni('2')).toBe('sb-zajic-2-auth-token');
    expect(klicUlozistePrihlaseni('2')).not.toBe(klicUlozistePrihlaseni('3'));
  });

  it('adresa druhé aplikace má ?profil=2', () => {
    expect(adresaDruheAplikace('https://zajic-pivovar.pages.dev')).toBe('https://zajic-pivovar.pages.dev/?profil=2');
  });

  it('manifest druhé aplikace má vlastní id a start_url, název Zajíc 2 a existující ikony', () => {
    const m = JSON.parse(readFileSync('public/manifest-zajic2.webmanifest', 'utf8'));
    const hlavni = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    expect(m.id).toBe('./?profil=2');
    expect(m.start_url).toBe('./?profil=2');
    expect(m.short_name).toBe('Zajíc 2');
    expect(m.id).not.toBe(hlavni.id);
    for (const i of m.icons as { src: string }[]) expect(existsSync(`public/${i.src.replace('./', '')}`), i.src).toBe(true);
    // Zástupci z ikony nesmí otevřít hlavní aplikaci.
    for (const s of m.shortcuts as { url: string }[]) expect(s.url).toContain('profil=2');
    // Share target patří jen hlavní aplikaci.
    expect(m.share_target).toBeUndefined();
  });

  it('index.html přepne manifest hned při načtení a klient ukládá přihlášení pod vlastním klíčem', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain("setAttribute('href', './manifest-zajic2.webmanifest')");
    expect(html.indexOf('manifest-link')).toBeLessThan(html.indexOf('manifest-zajic2'));
    expect(readFileSync('src/lib/supabase.ts', 'utf8')).toContain('storageKey: klicUlozistePrihlaseni()');
    expect(readFileSync('public/sw.js', 'utf8')).toContain("url.pathname.startsWith('/manifest')");
  });

  it('Nastavení nabízí Otevřít Zajíc 2 a zkopírování odkazu', () => {
    const z = readFileSync('src/screens/AppSettingsScreen.tsx', 'utf8');
    expect(z).toContain('Otevřít Zajíc 2');
    expect(z).toContain('adresaDruheAplikace()');
  });
});
