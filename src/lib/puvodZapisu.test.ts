import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { puvodZapisu, vlastniPoznamka } from './puvodZapisu';
import { POZNAMKA_AUTOMATICKY } from './staceniZPolozky';

describe('puvodZapisu', () => {
  it('pozná řádek ze zaškrtnuté kapky u objednávky', () => {
    expect(puvodZapisu(POZNAMKA_AUTOMATICKY)?.popis).toContain('Stočeno');
    // Poznámka bývá delší — pozná se podle začátku.
    expect(puvodZapisu(`${POZNAMKA_AUTOMATICKY} (Lužec)`)?.automaticky).toBe(true);
  });

  it('pozná doplnění z inventury i s obdobím', () => {
    const p = puvodZapisu('Doplněno z inventury 2026-09 — KEG 30l (přebytek 14 ks)');
    expect(p?.popis).toContain('Doplněno po inventuře 2026-09');
    expect(p?.automaticky).toBe(true);
  });

  it('pozná odečet po manku', () => {
    expect(puvodZapisu('Odečteno z inventury 2026-09 — KEG 30l (manko 2 ks)')?.popis)
      .toContain('Odečteno po inventuře');
  });

  it('bere i týdenní kontrolu, která píše štítek týdne', () => {
    expect(puvodZapisu('Doplněno z inventury týdne 2026-09-14 — KEG 30l z Tank 6 (přebytek 5 ks)')?.popis)
      .toContain('týdne 2026-09-14');
  });

  it('ruční zápis původ nemá', () => {
    expect(puvodZapisu(null)).toBeNull();
    expect(puvodZapisu('')).toBeNull();
    expect(puvodZapisu('stáčeno ráno, Tank 6')).toBeNull();
  });
});

describe('vlastniPoznamka', () => {
  it('ruční poznámku vrátí, aby nezmizela', () => {
    expect(vlastniPoznamka('stáčeno ráno, Tank 6')).toBe('stáčeno ráno, Tank 6');
  });

  it('automatickou poznámku ne — tu ukazuje původ', () => {
    expect(vlastniPoznamka(POZNAMKA_AUTOMATICKY)).toBeNull();
    expect(vlastniPoznamka('Doplněno z inventury 2026-09 — KEG 30l (přebytek 14 ks)')).toBeNull();
  });

  it('prázdná poznámka nic nevrací', () => {
    expect(vlastniPoznamka(null)).toBeNull();
    expect(vlastniPoznamka('   ')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Značka musí být tam, kde se lidé ptají — v seznamech stáčení
// ---------------------------------------------------------------------------
describe('seznamy stáčení ukazují původ záznamu', () => {
  // Poprvé se to řešilo 12. 9. a značka se doplnila jen do mobilních karet.
  // 18. 9. přišla ta samá otázka znovu — nad tabulkou na počítači, kde
  // značka nebyla. Tenhle test hlídá obojí najednou.
  for (const cesta of ['src/screens/Kegging.tsx', 'src/screens/BottlingScreen.tsx']) {
    it(`${cesta} kreslí původ záznamu`, () => {
      expect(readFileSync(cesta, 'utf8')).toMatch(/puvodZapisu\(r\.note\)/);
    });
  }

  it('KEG obrazovka ho kreslí na víc místech — v kartách i v tabulce', () => {
    const zdroj = readFileSync('src/screens/Kegging.tsx', 'utf8');
    const kolik = [...zdroj.matchAll(/puvodZapisu\(r\.note\) &&/g)].length;
    expect(kolik, 'karty na telefonu i tabulka na počítači').toBeGreaterThanOrEqual(3);
  });
});
