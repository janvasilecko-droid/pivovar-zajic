// Čtení objednávek se z ručních změn NEUČÍ samo.
//
// Do 23. 11. 2026 volaly tyhle obrazovky při každé změně piva nebo obalu
// saveAlias() a potichu tak ukládaly „naučené zkratky" (parser_aliases) — i když
// šlo o záměnu jen pro jednu objednávku. Vzniklo 184 pravidel typu „30l → 1 l",
// „0.33l → 0,5 l", „keg 15l → 20 l", podle kterých se pak četly další zprávy.
// Chování kontrolního okna a úpravy objednávky hlídají jejich vlastní testy
// (*.neuci-se.test.tsx); tohle je pojistka proti návratu volání do zdrojáků —
// i u „Načíst z fotky", kde se celé okno v testu rozjíždí těžko.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const zdroj = (cesta: string) => readFileSync(fileURLToPath(new URL(cesta, import.meta.url)), 'utf8');

describe('tiché učení z ručních změn je pryč', () => {
  it.each([
    '../components/WhatsAppOrderReviewModal.tsx',
    '../components/EditOrderModal.tsx',
    '../components/ImportFromImage.tsx',
    '../components/objednavky/OrderDetail.tsx',
    '../screens/Orders.tsx',
  ])('%s nevolá saveAlias', (cesta) => {
    expect(zdroj(cesta)).not.toMatch(/\bsaveAlias\b/);
  });

  it('čtečka zpráv z WhatsAppu tabulku naučených zkratek vůbec nečte a AI ji neposílá', () => {
    const server = zdroj('../../supabase/functions/whatsapp-auto-parse/index.ts');
    expect(server).not.toMatch(/from\(["']parser_aliases["']\)/);
    expect(server).not.toMatch(/\baliases,/);
    for (const funkce of ['parse-order-text', 'parse-order-image']) {
      expect(zdroj(`../../supabase/functions/${funkce}/index.ts`)).not.toMatch(/body\.aliases/);
    }
  });
});
