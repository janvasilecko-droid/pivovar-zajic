import { describe, it, expect } from 'vitest';
import { nejcastejsiMnozstvi, stackingQuickQtys } from './quickQty';

// Rychlé počty před „+" u Objednávek, Stáčení KEG a Lahví. Pravidlo ze
// zadání 22. 9. 2026: VŽDY tři hodnoty, a to ty nejčastěji zadávané pro
// konkrétní pivo + obal.
const DNES = new Date('2026-09-22T10:00:00Z');
const ZALOHA = [6, 12, 18, 24];

describe('nejcastejsiMnozstvi', () => {
  it('vybere tři nejčastější hodnoty a seřadí je vzestupně', () => {
    const rows = [
      // 12 × třikrát, 6 × dvakrát, 30 × dvakrát, 18 × jednou
      { beer_id: 'b1', package_id: 'p50', quantity: 12, entry_date: '2026-09-01' },
      { beer_id: 'b1', package_id: 'p50', quantity: 12, entry_date: '2026-09-02' },
      { beer_id: 'b1', package_id: 'p50', quantity: 12, entry_date: '2026-09-03' },
      { beer_id: 'b1', package_id: 'p50', quantity: 6, entry_date: '2026-08-10' },
      { beer_id: 'b1', package_id: 'p50', quantity: 6, entry_date: '2026-08-11' },
      { beer_id: 'b1', package_id: 'p50', quantity: 30, entry_date: '2026-07-01' },
      { beer_id: 'b1', package_id: 'p50', quantity: 30, entry_date: '2026-07-02' },
      { beer_id: 'b1', package_id: 'p50', quantity: 18, entry_date: '2026-06-01' },
    ];
    // Při shodné četnosti (6 a 30 mají po dvou) vyhrává vyšší hodnota.
    expect(nejcastejsiMnozstvi(rows, 'b1', 'p50', ZALOHA, 3, DNES)).toEqual([12, 30, 6].sort((a, b) => a - b));
  });

  it('nemíchá jiné pivo ani jiný obal', () => {
    const rows = [
      { beer_id: 'b1', package_id: 'p50', quantity: 5, entry_date: '2026-09-01' },
      { beer_id: 'b2', package_id: 'p50', quantity: 99, entry_date: '2026-09-01' },
      { beer_id: 'b1', package_id: 'p30', quantity: 77, entry_date: '2026-09-01' },
    ];
    const vysledek = nejcastejsiMnozstvi(rows, 'b1', 'p50', ZALOHA, 3, DNES);
    expect(vysledek).toContain(5);
    expect(vysledek).not.toContain(99);
    expect(vysledek).not.toContain(77);
  });

  it('doplní ze záložních hodnot, když historie nestačí na tři', () => {
    const rows = [{ beer_id: 'b1', package_id: 'p50', quantity: 7, entry_date: '2026-09-01' }];
    expect(nejcastejsiMnozstvi(rows, 'b1', 'p50', ZALOHA, 3, DNES)).toEqual([6, 7, 12]);
  });

  it('bez historie nabídne první tři záložní hodnoty', () => {
    expect(nejcastejsiMnozstvi([], 'b1', 'p50', ZALOHA, 3, DNES)).toEqual([6, 12, 18]);
    expect(nejcastejsiMnozstvi([], null, 'p50', ZALOHA, 3, DNES)).toEqual([6, 12, 18]);
    expect(nejcastejsiMnozstvi([], 'b1', null, ZALOHA, 3, DNES)).toEqual([6, 12, 18]);
  });

  it('starší než 12 měsíců se bere, jen když novějšího není nic', () => {
    // Nové pivo/obal: jediné zadání je staré dva roky — pořád je to lepší
    // vodítko než pevná tabulka, tak se použije.
    const stare = [{ beer_id: 'b1', package_id: 'p50', quantity: 9, entry_date: '2024-05-01' }];
    expect(nejcastejsiMnozstvi(stare, 'b1', 'p50', ZALOHA, 3, DNES)).toContain(9);

    // Jakmile je v posledním roce cokoli, staré zvyky už nepřebíjejí.
    const smes = [
      ...stare,
      { beer_id: 'b1', package_id: 'p50', quantity: 20, entry_date: '2026-09-01' },
    ];
    expect(nejcastejsiMnozstvi(smes, 'b1', 'p50', ZALOHA, 3, DNES)).not.toContain(9);
  });

  it('přeskočí nulové a nesmyslné počty', () => {
    const rows = [
      { beer_id: 'b1', package_id: 'p50', quantity: 0, entry_date: '2026-09-01' },
      { beer_id: 'b1', package_id: 'p50', quantity: null, entry_date: '2026-09-02' },
      { beer_id: 'b1', package_id: 'p50', quantity: -5, entry_date: '2026-09-03' },
      { beer_id: 'b1', package_id: 'p50', quantity: 8, entry_date: '2026-09-04' },
    ];
    const vysledek = nejcastejsiMnozstvi(rows, 'b1', 'p50', ZALOHA, 3, DNES);
    expect(vysledek).toContain(8);
    expect(vysledek).not.toContain(0);
    expect(vysledek).not.toContain(-5);
  });

  it('vrátí vždy tři hodnoty, i když se jedno pivo zadává pořád stejně', () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      beer_id: 'b1', package_id: 'p50', quantity: 10, entry_date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`,
    }));
    expect(nejcastejsiMnozstvi(rows, 'b1', 'p50', ZALOHA, 3, DNES)).toHaveLength(3);
  });

  it('bez záložních hodnot vrátí jen to, co historie dala', () => {
    const rows = [{ beer_id: 'b1', package_id: 'p50', quantity: 7, entry_date: '2026-09-01' }];
    expect(nejcastejsiMnozstvi(rows, 'b1', 'p50', [], 3, DNES)).toEqual([7]);
  });
});

describe('stackingQuickQtys — záložní hodnoty podle obalu', () => {
  it('sud, sklo i PET mají každý svoji řadu', () => {
    expect(stackingQuickQtys({ kind: 'keg', volume_l: 50 })[0]).toBe(6);
    expect(stackingQuickQtys({ kind: 'bottle', volume_l: 0.5 })[0]).toBe(20);
    expect(stackingQuickQtys({ kind: 'pet', volume_l: 1.5 })[0]).toBe(12);
    expect(stackingQuickQtys(null)).toEqual([]);
  });
});
