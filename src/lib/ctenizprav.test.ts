// 📖 Čtení zpráv: kontext, odpovědi a možnost zeptat se.
// ---------------------------------------------------------------------------
// Zadání z 18. 9. 2026: „vylepši algoritmus čtení zpráv z toho, co jsme všechno
// za poslední měsíc řešili — hlavně ať AI čte kontext a odpovědi, a pokud není
// něco jasný, tak se má zeptat."
//
// Pravidla jsou text v promptu, takže je nejde spustit — dá se ale hlídat, že
// v něm ZŮSTANOU. Přesně tohle se tu už jednou stalo: stejná pravidla měl
// každý ze tří promptů ve vlastní kopii a kopie se rozešly, takže se táž
// zpráva četla jinak podle toho, kudy přišla.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const PRAVIDLA = readFileSync('supabase/functions/_shared/order-rules.ts', 'utf8');

describe('pravidla pro odpovědi a kontext', () => {
  // Každý řádek je skutečná zpráva z provozu za poslední měsíc.
  const PRIPADY: [string, string][] = [
    ['úprava jen části objednávky', 'třicítky a petky sedí'],
    ['odpověď, která je vlastní objednávkou', '60x0,5l'],
    ['vrácení není objednávka', 'Tady vrací 1x50l'],
    ['prázdné obaly bez napsaného piva', 'vrací 3x30'],
    ['vratné lahve v objednávce nejsou vrácení', 'vratné lahve'],
    ['odběratel z citované zprávy', 'z CITOVANÉ zprávy'],
    ['skloňování jmen', 'pro Radka'],
    ['obecná čeština s předsazeným v-', 'Vosmy'],
  ];

  for (const [co, hledane] of PRIPADY) {
    it(`pamatuje si: ${co}`, () => {
      expect(PRAVIDLA, `z pravidel zmizel případ „${co}"`).toContain(hledane);
    });
  }

  it('rozlišuje čtyři druhy odpovědi', () => {
    for (const druh of ['ÚPRAVA', 'PŘÍDAVEK', 'VLASTNÍ OBJEDNÁVKA', 'VRÁCENÍ']) {
      expect(PRAVIDLA).toContain(druh);
    }
  });
});

describe('když si AI není jistá, zeptá se', () => {
  it('pravidla popisují pole otazky', () => {
    expect(PRAVIDLA).toContain('otazky');
    expect(PRAVIDLA).toContain('ZEPTEJ SE');
  });

  it('otázka nenahrazuje položky — co jde přečíst, se přečte', () => {
    expect(PRAVIDLA).toContain('NENAHRAZUJE');
  });

  it('prompt na otázky pamatuje ve výstupním formátu', () => {
    const prompt = readFileSync('supabase/functions/parse-order-text/index.ts', 'utf8');
    expect(prompt).toMatch(/"otazky":\s*\[\]/);
    // Normalizace: jen neprázdné věty, nejvýš tři.
    expect(prompt).toMatch(/\.slice\(0, 3\)/);
  });

  it('otázky se ukládají ke zprávě', () => {
    const autoParse = readFileSync('supabase/functions/whatsapp-auto-parse/index.ts', 'utf8');
    expect(autoParse).toMatch(/parsed_otazky/);
    const migrace = readFileSync('supabase/migrations/20261231120000_otazky_ke_zprave.sql', 'utf8');
    expect(migrace).toMatch(/ADD COLUMN IF NOT EXISTS parsed_otazky/);
  });

  it('kontrola objednávky je ukáže', () => {
    const modal = readFileSync('src/components/WhatsAppOrderReviewModal.tsx', 'utf8');
    expect(modal).toMatch(/otazkyAi\.length > 0/);
    // Musí se brát i z čerstvého přečtení, nejen z uložené zprávy.
    expect(modal).toMatch(/setOtazkyAi\(parsed\.otazky/);
  });
});

describe('pravidla jsou pořád jen na jednom místě', () => {
  it('všechny tři prompty berou tentýž blok', () => {
    for (const cesta of [
      'supabase/functions/parse-order-text/index.ts',
      'supabase/functions/parse-order-image/index.ts',
    ]) {
      expect(readFileSync(cesta, 'utf8'), `${cesta} si nebere sdílená pravidla`)
        .toMatch(/PRAVIDLA_CTENI_OBJEDNAVEK/);
    }
  });

  it('nový blok je součástí sdílených pravidel', () => {
    expect(PRAVIDLA).toMatch(/\$\{CISLA_STUPEN_VS_OBJEM\}\$\{VZORY_ZAPISU\}\$\{KONTEXT_A_ODPOVEDI\}\$\{KDYZ_NEVIS\}/);
  });
});
