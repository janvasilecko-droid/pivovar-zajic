import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mensiEfekty, nastavEfekty, initEfekty } from './efekty';

describe('méně efektů — plynulost na starším telefonu', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('výchozí stav je vypnuto — vzhled se nikomu nezmění sám od sebe', () => {
    expect(mensiEfekty()).toBe(false);
    initEfekty();
    expect(document.documentElement.classList.contains('mene-efektu')).toBe(false);
  });

  it('zapnutí nasadí třídu a přežije zavření aplikace', () => {
    nastavEfekty(true);
    expect(document.documentElement.classList.contains('mene-efektu')).toBe(true);
    // Nové spuštění appky (třída pryč, localStorage zůstává).
    document.documentElement.className = '';
    initEfekty();
    expect(document.documentElement.classList.contains('mene-efektu')).toBe(true);
  });

  it('jde zase vypnout', () => {
    nastavEfekty(true);
    nastavEfekty(false);
    expect(mensiEfekty()).toBe(false);
    expect(document.documentElement.classList.contains('mene-efektu')).toBe(false);
  });

  // CSS je tu ta podstatná část — bez pravidel by přepínač jen přepínal třídu.
  describe('co ta třída v CSS opravdu vypne', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const usek = css.slice(css.indexOf('html.mene-efektu'), css.indexOf('prefers-reduced-motion'));

    it('vypne rozostření podkladu na VŠECH prvcích', () => {
      // Nejdražší efekt v celé aplikaci: prohlížeč kvůli němu ofotí kus okna,
      // rozostří ho a složí zpátky — zvlášť pro každý prvek, při každém pohybu.
      expect(usek).toContain('backdrop-filter: none !important');
      expect(usek).toMatch(/html\.mene-efektu \*/);
    });

    it('zastaví blikající upozornění na ploše', () => {
      expect(usek).toContain('.hs-tile-alert');
      expect(usek).toContain('.hs-tile-whatsapp');
      expect(usek).toContain('animation: none !important');
    });

    it('ale upozornění musí zůstat vidět — dostanou stálý rámeček', () => {
      // Upozornění, které není vidět, je horší závada než sekání.
      const nahrada = usek.slice(usek.indexOf('Náhrada za blikání'));
      expect(nahrada).toContain('box-shadow');
      expect(nahrada).toContain('.hs-tile-whatsapp');
    });
  });

  it('appka ho zapíná dřív, než se cokoli vykreslí', () => {
    // Kdyby se to nasadilo až po prvním vykreslení, sklo by na okamžik
    // probliklo a zase zmizelo.
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    expect(main).toContain('initEfekty()');
    expect(main.indexOf('initEfekty()')).toBeLessThan(main.indexOf('createRoot'));
  });
});
