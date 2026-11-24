import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { adresaDruheAplikace, adresaSladek, CESTA_DRUHE_APLIKACE, CESTA_SLADEK, cestaAplikace, klicUlozistePrihlaseni, platnyProfil } from './profilAplikace';

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

  it('druhá aplikace má vlastní cestu /zajic2/', () => {
    expect(CESTA_DRUHE_APLIKACE).toBe('/zajic2/');
    expect(adresaDruheAplikace('https://zajic-pivovar.pages.dev')).toBe('https://zajic-pivovar.pages.dev/zajic2/');
  });

  it('manifest druhé aplikace má vlastní id a start_url, název Zajíc 2 a existující ikony', () => {
    const m = JSON.parse(readFileSync('public/manifest-zajic2.webmanifest', 'utf8'));
    const hlavni = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    // Vlastní rozsah: nepřekrývá se s hlavní aplikací, takže jde nainstalovat samostatně.
    expect(m.id).toBe('/zajic2/');
    expect(m.start_url).toBe('/zajic2/');
    expect(m.scope).toBe('/zajic2/');
    expect(hlavni.scope).toBe('./');
    expect(m.short_name).toBe('Zajíc 2');
    expect(m.id).not.toBe(hlavni.id);
    for (const i of m.icons as { src: string }[]) expect(existsSync(`public${i.src}`), i.src).toBe(true);
    // Zástupci z ikony nesmí otevřít hlavní aplikaci.
    for (const s of m.shortcuts as { url: string }[]) expect(s.url.startsWith('/zajic2/')).toBe(true);
    // Share target patří jen hlavní aplikaci.
    expect(m.share_target).toBeUndefined();
  });

  it('index.html přepne manifest hned při načtení a klient ukládá přihlášení pod vlastním klíčem', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain("setAttribute('href', '/manifest-zajic2.webmanifest')");
    // Odkazy v index.html jsou absolutní — na cestě /zajic2/ by relativní „./manifest…“ mířil vedle.
    expect(html).not.toMatch(/href="\.\/(manifest|icon)/);
    expect(readFileSync('src/main.tsx', 'utf8')).toContain("serviceWorker.register('/sw.js')");
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

describe('profil se pozná jen z adresy', () => {
  it('hlavní aplikace v téže kartě po návštěvě Zajíc 2 nepřevezme jeho profil', async () => {
    const { vi } = await import('vitest');
    for (const [cesta, hledani, ocekavano] of [['/zajic2/', '', '2'], ['/', '', ''], ['/', '?profil=2', '2'], ['/zajic2', '', '2']] as const) {
      vi.resetModules();
      window.history.replaceState({}, '', `${cesta}${hledani}`);
      window.sessionStorage.setItem('zajic_profil', '2'); // dřívější verze si to pamatovala — nesmí to nic ovlivnit
      const m = await import('./profilAplikace');
      expect(m.PROFIL_APLIKACE, `${cesta}${hledani}`).toBe(ocekavano);
    }
    window.history.replaceState({}, '', '/');
  });
});

describe('AI sládek: samostatná aplikace s vlastním přihlášením (R39)', () => {
  it('má vlastní cestu /sladek/ a vlastní klíč přihlášení, odlišný od hlavní aplikace i Zajíce 2', () => {
    expect(CESTA_SLADEK).toBe('/sladek/');
    expect(adresaSladek('https://zajic-pivovar.pages.dev')).toBe('https://zajic-pivovar.pages.dev/sladek/');
    expect(platnyProfil('sladek')).toBe('sladek');
    expect(klicUlozistePrihlaseni('sladek')).toBe('sb-zajic-sladek-auth-token');
    expect(klicUlozistePrihlaseni('sladek')).not.toBe(klicUlozistePrihlaseni('2'));
    expect(klicUlozistePrihlaseni('sladek')).not.toBe(klicUlozistePrihlaseni(''));
  });

  it('přihlášení z e-mailu se vrací do té aplikace, ze které přišlo', () => {
    expect(cestaAplikace('')).toBe('/');
    expect(cestaAplikace('2')).toBe('/zajic2/');
    expect(cestaAplikace('sladek')).toBe('/sladek/');
    expect(readFileSync('src/lib/odkazEmailem.ts', 'utf8')).toContain('${cestaAplikace()}');
    expect(readFileSync('src/lib/googlePrihlaseni.ts', 'utf8')).toContain('${cestaAplikace()}');
  });

  it('manifest má vlastní id, start_url a rozsah /sladek/, název AI sládek a existující ikony', () => {
    const m = JSON.parse(readFileSync('public/manifest-sladek.webmanifest', 'utf8'));
    const hlavni = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    const druhy = JSON.parse(readFileSync('public/manifest-zajic2.webmanifest', 'utf8'));
    // Vlastní rozsah: nepřekrývá se s hlavní aplikací ani se Zajícem 2, takže jde nainstalovat samostatně.
    expect(m.id).toBe('/sladek/');
    expect(m.start_url).toBe('/sladek/');
    expect(m.scope).toBe('/sladek/');
    expect(m.id).not.toBe(hlavni.id);
    expect(m.id).not.toBe(druhy.id);
    expect(m.short_name).toBe('AI sládek');
    expect(m.display).toBe('standalone');
    expect(m.theme_color).toBe('#0a0a0a');
    expect((m.icons as { src: string }[]).map((i) => i.src)).toEqual(['/icon-sladek-192-v1.png', '/icon-sladek-512-v1.png', '/icon-sladek-maskable-512-v1.png']);
    for (const i of m.icons as { src: string }[]) expect(existsSync(`public${i.src}`), i.src).toBe(true);
    expect((m.icons as { purpose: string }[]).map((i) => i.purpose)).toContain('maskable');
    // Zástupci a share target patří hlavní aplikaci.
    expect(m.shortcuts).toBeUndefined();
    expect(m.share_target).toBeUndefined();
  });

  it('index.html přepne manifest, název, lištu prohlížeče a ikonu na iPhonu hned při načtení na /sladek/', () => {
    const html = readFileSync('index.html', 'utf8');
    // Rozpoznání adresy je ve dvou skriptech (manifest a název; ikona na iPhonu) — obě musí být stejná.
    expect(html.split("/^\\/sladek(\\/|$)/.test(location.pathname)").length - 1).toBe(2);
    expect(html).toContain("setAttribute('href', '/manifest-sladek.webmanifest')");
    expect(html).toContain("document.title = 'AI sládek'");
    expect(html).toContain("document.querySelector('meta[name=\"theme-color\"]').setAttribute('content', '#0a0a0a')");
    expect(html).toContain("document.querySelector('meta[name=\"apple-mobile-web-app-title\"]').setAttribute('content', 'AI sládek')");
    expect(html).toContain("document.querySelector('link[rel=\"apple-touch-icon\"]').setAttribute('href', '/icon-sladek-192-v1.png')");
    // Skript s manifestem běží dřív, než si prohlížeč manifest stáhne; skript s ikonou iPhonu až za svými značkami.
    expect(html.indexOf('manifest-link')).toBeLessThan(html.indexOf('manifest-sladek'));
    expect(html.indexOf('<meta name="apple-mobile-web-app-title"')).toBeLessThan(html.indexOf("setAttribute('content', 'AI sládek')"));
  });

  it('main.tsx pro /sladek/ vykreslí samostatnou aplikaci jako líný kus a hlavní aplikace zůstane beze změny', () => {
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).toContain("const SladekApp = lazyStranka(() => import('./screens/SladekApp'));");
    expect(main).toContain('{JE_SLADEK ? (');
    expect(main).toContain('<SladekApp />');
    expect(main).toContain('<App />');
    // Fronta tanků hlavní aplikace se v samostatném AI sládkovi nespouští (sdílí úložiště, ale účet může být jiný).
    expect(main).toContain('if (!JE_SLADEK) zapniFrontuTanku();');
  });
});

describe('AI sládek: profil z adresy a lišta prohlížeče', () => {
  it('adresa /sladek/ (i bez lomítka) je AI sládek, podobná cesta ne a hlavní aplikace dál ne', async () => {
    const { vi } = await import('vitest');
    for (const [cesta, ocekavano, jeSladek, navrat] of [
      ['/sladek/', 'sladek', true, '/sladek/'], ['/sladek', 'sladek', true, '/sladek/'], ['/sladek/?x=1', 'sladek', true, '/sladek/'],
      ['/sladekx/', '', false, '/'], ['/', '', false, '/'], ['/zajic2/', '2', false, '/zajic2/'],
    ] as const) {
      vi.resetModules();
      window.history.replaceState({}, '', cesta);
      const m = await import('./profilAplikace');
      expect(m.PROFIL_APLIKACE, cesta).toBe(ocekavano);
      expect(m.JE_SLADEK, cesta).toBe(jeSladek);
      expect(m.cestaAplikace(), cesta).toBe(navrat);
    }
    window.history.replaceState({}, '', '/');
  });

  it('lišta prohlížeče zůstane v AI sládkovi černá bez ohledu na zvolený režim, v hlavní aplikaci se řídí režimem', async () => {
    const { vi } = await import('vitest');
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#fef9ec');
    document.head.appendChild(meta);
    try {
      for (const [cesta, svetly, tmavy] of [['/sladek/', '#0a0a0a', '#0a0a0a'], ['/', '#fef9ec', '#0f172a']] as const) {
        vi.resetModules();
        window.history.replaceState({}, '', cesta);
        const { setTheme } = await import('./theme');
        setTheme('light');
        expect(meta.getAttribute('content'), `${cesta} světlý`).toBe(svetly);
        setTheme('dark');
        expect(meta.getAttribute('content'), `${cesta} tmavý`).toBe(tmavy);
      }
    } finally {
      meta.remove();
      window.history.replaceState({}, '', '/');
      document.documentElement.classList.remove('dark');
    }
  });
});
