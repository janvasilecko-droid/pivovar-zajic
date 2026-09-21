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
    expect(PRAVIDLA).toMatch(
      /\$\{CISLA_STUPEN_VS_OBJEM\}\$\{VZORY_ZAPISU\}\$\{KONTEXT_A_ODPOVEDI\}\$\{ODBERATEL_A_HISTORIE\}\$\{KDYZ_NEVIS\}/,
    );
  });
});

// ── Odběratel a historie ─────────────────────────────────────────────
// Zadání z 19. 9. 2026: „nauč aplikaci na základě i předchozích objednávek
// pořádně číst kontexty a odpovědi na zprávy, pořádně číst odběratele ve
// zprávách i pokud není již uložený, aby ho aplikace dokázala vždy najít."
describe('odběratel, který ještě není uložený', () => {
  it('seznam odběratelů je nápověda, ne číselník', () => {
    expect(PRAVIDLA).toContain('NE číselník povolených hodnot');
  });

  it('neznámé jméno z textu není důvod k null', () => {
    expect(PRAVIDLA).toContain('NENÍ to důvod k null');
  });

  it('nikdy nevybírat ze seznamu někoho, kdo ve zprávě není', () => {
    expect(PRAVIDLA).toMatch(/Nikdy nevybírej ze seznamu/);
  });

  it('jméno se očišťuje od předložky, ne ohýbá do 1. pádu na sílu', () => {
    expect(PRAVIDLA).toContain('na Vildštejn');
  });
});

describe('historie objednávek jako kontext', () => {
  const HISTORIE = readFileSync('supabase/functions/_shared/historie-objednavek.ts', 'utf8');

  it('historie rozhoduje mezi výklady, položky nedoplňuje', () => {
    expect(PRAVIDLA).toContain('nikdy z ní neber položky');
    expect(HISTORIE).toContain('NENÍ k doplňování položek');
  });

  it('whatsapp-auto-parse historii načte a pošle do promptu', () => {
    const autoParse = readFileSync('supabase/functions/whatsapp-auto-parse/index.ts', 'utf8');
    expect(autoParse).toMatch(/nactiHistorii\(supabase/);
    expect(autoParse).toMatch(/historie: historieText/);
  });

  it('selhání dotazu nesmí shodit čtení zprávy — bez historie se čte jako dřív', () => {
    expect(HISTORIE).toMatch(/catch[\s\S]{0,160}Historie objednávek se nenačetla/);
  });

  it('parse-order-text blok vloží do promptu', () => {
    const prompt = readFileSync('supabase/functions/parse-order-text/index.ts', 'utf8');
    expect(prompt).toMatch(/historieSection/);
  });

  it('jméno z historie musí být v historii odesílatele opravdu obsažené', () => {
    const autoParse = readFileSync('supabase/functions/whatsapp-auto-parse/index.ts', 'utf8');
    expect(autoParse).toMatch(/odberatelZHistorie\(/);
    // Až jako poslední — text i citace mají přednost.
    expect(autoParse.lastIndexOf('odberatelZHistorie(')).toBeGreaterThan(autoParse.indexOf('quotedPlaceName;'));
  });

  it('ukotvení jména smí vycházet i z citované zprávy', () => {
    const autoParse = readFileSync('supabase/functions/whatsapp-auto-parse/index.ts', 'utf8');
    expect(autoParse).toMatch(/resolvePlace\(matchCandidates, freeformCandidates, ukotveniText/);
    expect(autoParse).toMatch(/message\.quoted_text\]\.filter\(Boolean\)/);
  });
});

// ── Vrácení jako odpověď s citací ────────────────────────────────────
// Z provozu 21. 9. 2026: „SKONTROLUJ A UPRAV TY ODPOVEDI NA ZPRAVY VCETNE
// TECH VRACENYCH SUDU ABY TO FUNGOVALO." Zpráva o vrácení, která ZÁROVEŇ
// cituje jinou zprávu (dostane amends_order_id), se brala jako ÚPRAVA té
// citované objednávky — AI dostala „SOUČASNÝ obsah, vrať výsledný stav po
// zapracování odpovědi", což pro vrácení nedává smysl a appka navíc
// nechávala aktivní tlačítko, které by tu objednávku přepsalo.
describe('vrácení jako odpověď s citací se nechová jako úprava objednávky', () => {
  it('pravidla už nežádají prázdné items u vrácení — checklist k zaškrtnutí by jinak zůstal prázdný', () => {
    expect(PRAVIDLA).not.toContain('Vrať items prázdné');
    expect(PRAVIDLA).toContain('POLOŽKY PŘESTO PŘEČTI NORMÁLNĚ');
  });

  it('detekce vrácení je sdílená mezi klientem a edge funkcí, ne dvě kopie', () => {
    const klient = readFileSync('src/lib/vraceniZeZpravy.ts', 'utf8');
    expect(klient).toMatch(/from '\.\.\/\.\.\/supabase\/functions\/_shared\/vraceni-detekce'/);
    const sdilene = readFileSync('supabase/functions/_shared/vraceni-detekce.ts', 'utf8');
    expect(sdilene).toMatch(/export function vypadaJakoVraceni/);
  });

  it('whatsapp-auto-parse nebere vrácení jako úpravu citované objednávky', () => {
    const autoParse = readFileSync('supabase/functions/whatsapp-auto-parse/index.ts', 'utf8');
    expect(autoParse).toMatch(/import \{ vypadaJakoVraceni \} from "\.\.\/_shared\/vraceni-detekce\.ts"/);
    expect(autoParse).toMatch(/amendsOrderId && !vypadaJakoVraceni\(message\.message_text\)/);
  });

  it('modál nikdy nenechá vrácení schválit jako přepis/založení objednávky', () => {
    const modal = readFileSync('src/components/WhatsAppOrderReviewModal.tsx', 'utf8');
    // Schválit je u vrácení vždy zamčené…
    expect(modal).toMatch(/disabled=\{jeVraceni \|\| approving/);
    // …a banner „upraví existující objednávku" se u vrácení vůbec neukáže.
    expect(modal).toMatch(/msg\?\.amends_order_id && !jeVraceni && \(/);
  });
});
