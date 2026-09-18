// 🐇 Ikony aplikace musí odpovídat tomu, co slibuje manifest.
// ---------------------------------------------------------------------------
// Z provozu 18. 9. 2026: „když poprvé načítá aplikace na telefonu, je tam ten
// rozmazanej zajíc v černým čtverci."
//
// Příčina byla v souborech, ne v kódu, a proto si jí nikdo nevšiml:
// icon-192.png a icon-512.png byl JEDEN A TENTÝŽ soubor 420×322 — ani jedna
// z deklarovaných velikostí a k tomu ne čtverec. Android si ho natáhl na
// 512×512 a doplnil na čtverec. Maskable ikona sice 512×512 měla, ale byla
// zvětšená z malého obrázku.
//
// Rozměry PNG jdou přečíst z hlavičky (IHDR, bajty 16–24) bez jakékoli
// knihovny, takže tenhle test nic nestojí a chytí to dřív než telefon.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/** Šířka a výška PNG z hlavičky IHDR. */
function rozmery(cesta: string): { w: number; h: number } {
  const d = readFileSync(cesta);
  expect(d.subarray(1, 4).toString('ascii'), `${cesta} není PNG`).toBe('PNG');
  return { w: d.readUInt32BE(16), h: d.readUInt32BE(20) };
}

const MANIFEST = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
  icons: { src: string; sizes: string; purpose?: string }[];
};

describe('ikony v manifestu mají slíbenou velikost', () => {
  for (const ikona of MANIFEST.icons) {
    it(`${ikona.src} je ${ikona.sizes}`, () => {
      const cesta = `public/${ikona.src.replace('./', '')}`;
      const [w, h] = ikona.sizes.split('x').map(Number);
      expect(rozmery(cesta)).toEqual({ w, h });
    });
  }

  it('192 a 512 nejsou tentýž soubor', () => {
    // Přesně tohle bylo špatně: jeden soubor ve dvou rolích.
    const a = readFileSync('public/icon-192.png');
    const b = readFileSync('public/icon-512.png');
    expect(a.equals(b), 'icon-192.png a icon-512.png mají stejný obsah').toBe(false);
  });
});

describe('ikona aplikace a úvodní obrazovka nejsou výchozí Capacitor', () => {
  // Modrý křížek Capacitoru je malý soubor s pár barvami. Skutečný znak
  // pivovaru má výrazně víc dat — hrubé, ale spolehlivé rozlišení, které
  // nepotřebuje dekódovat obrázek.
  const podezrele: string[] = [];
  for (const cesta of [
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png',
    'android/app/src/main/res/drawable-port-xxxhdpi/splash.png',
  ]) {
    const { w, h } = rozmery(cesta);
    if (w < 100 || h < 100) podezrele.push(`${cesta} je moc malá (${w}x${h})`);
  }

  it('mají rozumné rozměry', () => {
    expect(podezrele).toEqual([]);
  });

  it('generátor bere jedinou předlohu — vektor', () => {
    const skript = readFileSync('scripts/gen-icons.mjs', 'utf8');
    expect(skript).toMatch(/logo-zajic-znak\.svg/);
    // Dřívější generátor si kreslil obrázek po pixelech a vlastním kódem
    // skládal PNG — s pivovarem neměl nic společného. Hledá se ten kód, ne
    // slovo v komentáři: napoprvé si tenhle test sáhl na popis té chyby
    // v záhlaví skriptu a spadl sám na sobě.
    expect(skript).not.toMatch(/function makePng|function deflateStore/);
  });
});
