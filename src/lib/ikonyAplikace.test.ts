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
    const mala = MANIFEST.icons.find((i) => i.sizes === '192x192')!;
    const velka = MANIFEST.icons.find((i) => i.sizes === '512x512' && i.purpose !== 'maskable')!;
    const a = readFileSync(`public/${mala.src.replace('./', '')}`);
    const b = readFileSync(`public/${velka.src.replace('./', '')}`);
    expect(a.equals(b), `${mala.src} a ${velka.src} mají stejný obsah`).toBe(false);
  });
});

// ⚠️ Správný soubor na staré adrese je pořád špatná ikona.
// ---------------------------------------------------------------------------
// Z provozu 19. 9. 2026: „v telefonu když tu aplikaci po delší době otevřu,
// objeví se nejdřív bílé pozadí s rozmazaným logem zajíce v černém obdélníku —
// tohle už mělo být smazané."
//
// Ikony se opravily už 18. 9., ale na telefonu se nic nezměnilo: prohlížeč si
// ikonu přidané aplikace uloží při INSTALACI a znovu ji nesthává jen proto, že
// se na stejné adrese změnil obsah souboru. Jediné, co ho donutí ikonu načíst
// znovu, je JINÁ ADRESA v manifestu. Proto mají soubory pořadové číslo.
describe('ikony mají adresu, která se při změně mění', () => {
  for (const ikona of MANIFEST.icons) {
    it(`${ikona.src} nese pořadové číslo`, () => {
      expect(ikona.src, 'bez čísla si telefon nechá starou ikonu napořád').toMatch(/-v\d+\.png$/);
    });
  }

  it('index.html, offline režim i manifest ukazují na tytéž soubory', () => {
    const vManifestu = new Set(MANIFEST.icons.map((i) => i.src.replace('./', '')));
    for (const cesta of ['index.html', 'public/sw.js']) {
      const zdroj = readFileSync(cesta, 'utf8');
      for (const odkaz of zdroj.match(/icon-[\w-]*\.png/g) ?? []) {
        expect(vManifestu.has(odkaz), `${cesta} odkazuje na ${odkaz}, která v manifestu není`).toBe(true);
      }
    }
  });

  it('generátor vyrábí právě ty soubory, co manifest slíbil', () => {
    const skript = readFileSync('scripts/gen-icons.mjs', 'utf8');
    for (const ikona of MANIFEST.icons) {
      const jmeno = ikona.src.replace('./', '');
      expect(skript, `gen-icons.mjs nevyrábí ${jmeno}`).toContain(`public/${jmeno}`);
    }
  });

  it('rozmazané staré logo je pryč a nikdo ho nepoužívá', () => {
    // public/logo.png bylo 540×260 rozmazané a výstřižkové. Vektory
    // (logo-zajic.svg, logo-zajic-znak.svg) zůstávají — ty jsou ostré.
    expect(() => readFileSync('public/logo.png'), 'public/logo.png se vrátilo').toThrow();
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
