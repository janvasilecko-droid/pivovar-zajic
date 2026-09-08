/**
 * 🎨 PÍSMO NA BARVĚ PIVA — past, na kterou aplikace narazila potřetí.
 *
 * Barva piva jde z databáze a s režimem aplikace se NEMĚNÍ. Cokoliv, co na
 * ní leží, si proto nesmí barvu písma brát z palety ani ji dědit z okolí:
 * v tmavém režimu se inkoust obrací na světlý a na světle žluté „11° Světlé"
 * pak svítí bílá na bílo.
 *
 * Předchozí dva výskyty (křížek v panelu piva, štítek zdroje ve Lahvích)
 * se opravily jednotlivě. Tenhle test hlídá vzorec, ne konkrétní řádek.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beerInk, beerText } from './supabase';

const SVETLE_PIVO = { beer_color: '#FEF3C7' };   // 11° Světlá ze snímku
const TMAVE_PIVO = { beer_color: '#7F1D1D' };    // Jantar

describe('barva písma na barvě piva', () => {
  it('na světlém pivu je písmo tmavé, na tmavém světlé', () => {
    expect(beerInk(SVETLE_PIVO)).toBe('#0f172a');
    expect(beerInk(TMAVE_PIVO)).toBe('#ffffff');
    expect(beerText(SVETLE_PIVO)).not.toBe('text-white');
    expect(beerText(TMAVE_PIVO)).toBe('text-white');
  });

  it('rozhoduje jas, ne odstín — vínová je tmavá, žlutá světlá', () => {
    // „Krvavý pomeranč" má tmavě vínovou; pevně tmavý text by na ní byl
    // stejně nečitelný jako pevně světlý na žluté.
    expect(beerInk({ beer_color: '#DC2626' })).toBe('#ffffff');
    expect(beerInk({ beer_color: '#FDE68A' })).toBe('#0f172a');
  });

  it('pivo bez barvy nedostane bílé písmo', () => {
    // Náhradní podklad je světlý, takže tmavé písmo je správně.
    expect(beerInk(null)).toBe('#0f172a');
    expect(beerInk({ beer_color: null })).toBe('#0f172a');
  });

  it('NIKDE se barva písma na barvě piva nenechává zdědit', () => {
    // Přesně tenhle zápis vyrobil bílé písmo na světle žlutém štítku
    // v Objednávkách (snímek z provozu 8. 9. 2026): u tmavého piva se
    // barva nastavila, u světlého se nechalo `undefined`, tedy „poděď" —
    // a v tmavém režimu se dědí světlá.
    const podezrele = /(?:beerText|pkgText)\([^)]*\)\s*===\s*'text-white'\s*\?[^:]*:\s*undefined/;
    const soubory = [
      'src/screens/Orders.tsx',
      'src/screens/InventoryScreen.tsx',
      'src/screens/PriceList.tsx',
      'src/components/QuickCountModal.tsx',
      'src/components/BeerTileGrid.tsx',
      'src/components/WeeklyOrderSummaryCard.tsx',
    ];
    const spatne = soubory.filter((f) =>
      podezrele.test(readFileSync(resolve(process.cwd(), f), 'utf8')));
    expect(spatne, 'použij beerInk() — nastaví barvu v OBOU případech').toEqual([]);
  });

  it('buňka s barvou piva v Inventuře řeší i barvu písma', () => {
    // Přilepený první sloupec má barvu piva jako pozadí. Bez `--ink-plochy`
    // by si text vzal odstín z palety, který v tmavém režimu zesvětlá.
    const zdroj = readFileSync(resolve(process.cwd(), 'src/screens/InventoryScreen.tsx'), 'utf8');
    for (const kus of zdroj.split('<td').slice(1)) {
      const hlavicka = kus.slice(0, kus.indexOf('>'));
      if (!hlavicka.includes('beerBg(')) continue;
      expect(hlavicka, 'buňka s barvou piva musí posílat i --ink-plochy').toContain('--ink-plochy');
    }
  });
});
