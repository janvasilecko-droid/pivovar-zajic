import { describe, it, expect } from 'vitest';
import { rozvrhniPoznamky, kolikPoznamekZobrazit, KRATKA_POZNAMKA_ZNAKU } from './homeNotes';

const p = (text: string) => ({ text });

describe('rozvrhniPoznamky', () => {
  it('krátká poznámka zabere půl řádku, dlouhá celý', () => {
    const [kratka, dlouha] = rozvrhniPoznamky(
      [p('Víčka'), p('Zavolat Petrovi kvůli sudům na sobotu')],
      2,
    );
    expect(kratka.pres2Sloupce).toBe(false);
    expect(dlouha.pres2Sloupce).toBe(true);
  });

  it('na hranici délky ještě zůstává krátká', () => {
    const text = 'x'.repeat(KRATKA_POZNAMKA_ZNAKU);
    expect(rozvrhniPoznamky([p(text)], 2)[0].pres2Sloupce).toBe(false);
    expect(rozvrhniPoznamky([p(text + 'x')], 2)[0].pres2Sloupce).toBe(true);
  });

  it('mezery kolem textu nerozhodují o šířce', () => {
    expect(rozvrhniPoznamky([p('   Víčka   ')], 2)[0].pres2Sloupce).toBe(false);
  });

  it('v jednom sloupci je všechno přes celou šířku', () => {
    // Půlka nejužší dlaždice má kolem 60 px — nevejde se do ní ani „Víčka".
    expect(rozvrhniPoznamky([p('Víčka')], 1)[0].pres2Sloupce).toBe(true);
  });
});

describe('kolikPoznamekZobrazit', () => {
  it('širší dlaždice pobere dvojnásobek — má dva sloupce', () => {
    expect(kolikPoznamekZobrazit(2, 1)).toBe(kolikPoznamekZobrazit(1, 1) * 2);
  });

  it('vyšší dlaždice pobere víc řádků', () => {
    expect(kolikPoznamekZobrazit(1, 2)).toBeGreaterThan(kolikPoznamekZobrazit(1, 1));
  });

  it('i na nejmenší dlaždici se ukáže aspoň jedna', () => {
    // Dřív se na velikosti 1×1 neukázala žádná a vypadalo to, jako by se
    // poznámka vůbec neuložila.
    expect(kolikPoznamekZobrazit(0, 0)).toBeGreaterThanOrEqual(1);
  });
});
