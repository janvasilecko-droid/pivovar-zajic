// 🔎 Audit objednávek musí být srozumitelný.
// ---------------------------------------------------------------------------
// Z provozu 18. 9. 2026: „nechápu logiku auditu objednávek." Okno ukazovalo
// šest zkratek s čísly („Neshody s WA: 3", „rozjetých odpočtů: 1") a nikde
// nestálo, co se kontroluje, proč na tom záleží ani co s nálezem dělat.
//
// Test hlídá, že texty existují, jsou to věty, a že se okno auditu opravdu
// bere odsud — kdyby se popisy vrátily do JSX, rozejdou se dřív nebo později
// dlaždice se seznamem, jako už jednou byly.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { KONTROLY_AUDITU, K_CEMU_AUDIT, popisKontroly, zaverAuditu } from './auditPopisy';

describe('popis každé kontroly', () => {
  it('audit má šest kontrol a každá svůj klíč', () => {
    expect(KONTROLY_AUDITU).toHaveLength(6);
    const klice = KONTROLY_AUDITU.map((k) => k.klic);
    expect(new Set(klice).size, 'klíče se opakují').toBe(6);
  });

  for (const k of KONTROLY_AUDITU) {
    it(`${k.klic} říká co hledá i co s tím`, () => {
      // Krátký útržek nikomu nepomůže — musí to být věta.
      expect(k.co.length, 'název je moc krátký').toBeGreaterThan(10);
      expect(k.znamena.length, '„co to znamená" je moc krátké').toBeGreaterThan(40);
      expect(k.coSTim.length, '„co s tím" je moc krátké').toBeGreaterThan(20);
      expect(k.jednotka.length).toBeGreaterThan(2);
    });
  }

  it('popisKontroly najde každý klíč', () => {
    for (const k of KONTROLY_AUDITU) expect(popisKontroly(k.klic).co).toBe(k.co);
  });
});

describe('závěr nahoře', () => {
  it('bez nálezu řekne, že je čisto, a kolik se prošlo', () => {
    expect(zaverAuditu(0, 42)).toContain('Všechno sedí');
    expect(zaverAuditu(0, 42)).toContain('42');
  });

  it('s nálezy řekne kolik a co dál', () => {
    expect(zaverAuditu(1, 10)).toContain('1 věc');
    expect(zaverAuditu(3, 10)).toContain('3 věci');
    expect(zaverAuditu(9, 10)).toContain('9 věcí');
  });

  it('k čemu audit je, stojí jednou větou', () => {
    expect(K_CEMU_AUDIT).toContain('Nic nemění');
  });
});

describe('okno auditu bere texty odsud', () => {
  const modal = readFileSync('src/components/OrderAuditModal.tsx', 'utf8');

  it('dlaždice se vykreslují ze seznamu kontrol', () => {
    expect(modal).toMatch(/KONTROLY_AUDITU\.map/);
  });

  it('hlavičky sekcí používají tentýž popis', () => {
    // Pět sekcí s nálezy (šestá, „Přišlo všechno?", má vlastní podobu).
    expect([...modal.matchAll(/<HlavickaSekce klic="/g)]).toHaveLength(5);
    expect(modal).toMatch(/popisKontroly\(klic\)/);
  });

  it('nahoře je závěr, ne jen čísla', () => {
    expect(modal).toMatch(/zaverAuditu\(/);
    expect(modal).toMatch(/K_CEMU_AUDIT/);
  });
});
