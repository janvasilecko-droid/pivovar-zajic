import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildMovements, expectedForMonth, stockAsOf, stockKey } from './stockLedger';
import { tydenniJakoInventura } from './tydenniInventura';
import { radekBilanceSudu } from './bilanceSudu';

const B = 'sv12';
const P = 'k50';
const K = stockKey(B, P);
const packages = [{ id: P, kind: 'keg', volume_l: 50 }];

describe('Bilanční konto sudů ze skladové knihy (29. 10. 2026)', () => {
  // Říjen: počáteční 12, stočeno 18 + 2, závozy −10 −2, přefuk do 20 l −1,
  // vrácení z objednávky +1 a Úprava skladu 23. 10.: napočítáno 9.
  const pohyby = buildMovements({
    packages,
    inventoryRows: [
      { entry_date: '2026-10-01', beer_id: B, package_id: P, quantity: 12, note: 'Počáteční stav' },
      ...(tydenniJakoInventura([{ tyden_od: '2026-10-19', tyden_do: '2026-10-25', beer_id: B, package_id: P, napocitano: 9, updated_at: '2026-10-23T07:19:00Z' }]) as any),
    ],
    keggingRows: [
      { entry_date: '2026-10-05', beer_id: B, package_id: P, quantity: 18, created_at: '2026-10-05T18:14:00Z' },
      { entry_date: '2026-10-26', beer_id: B, package_id: P, quantity: 2, created_at: '2026-10-26T10:00:00Z' },
    ],
    zavozDeductionRows: [
      { deduct_date: '2026-10-07', beer_id: B, package_id: P, quantity: 10, created_at: '2026-10-06T22:05:00Z' },
      { deduct_date: '2026-10-27', beer_id: B, package_id: P, quantity: 2, created_at: '2026-10-26T22:05:00Z' },
    ],
    prefukRows: [{ entry_date: '2026-10-08', beer_id: B, from_package_id: P, from_count: 1, to_package_id: 'k20', to_count: 2 }],
    adjustmentRows: [{ entry_date: '2026-10-09', beer_id: B, package_id: P, quantity: 1, reason: 'Vráceno z objednávky — 1× 50l', order_id: 'o1' }],
  });
  const r = radekBilanceSudu(expectedForMonth(pohyby, '2026-10').get(K), stockAsOf(pohyby, '2026-10-31').get(K));

  it('konec měsíce = stav Skladu (Úprava skladu 9 + po ní stočeno 2 − závoz 2)', () => {
    expect(r.endStockQty).toBe(9);
  });

  it('sloupce + Ostatní sečtou přesně na konec', () => {
    const soucet = r.initialQty + r.stacenoKegQty
      - (r.objednavkyQty + r.stacenoLahveQty + r.fasovaniQty + r.prodejnaQty + r.akceQty + r.odpisyQty) + r.ostatniQty;
    expect(soucet).toBe(r.endStockQty);
    expect(r).toMatchObject({ initialQty: 12, stacenoKegQty: 20, objednavkyQty: 12 });
  });

  it('Ostatní = přefuk −1 + vrácení +1 + Úprava skladu (9 proti 18 podle pohybů)', () => {
    // Podle pohybů k 23. 10.: 12 + 18 − 10 − 1 + 1 = 20, napočítáno 9 → úprava −11.
    expect(r.ostatniQty).toBe(-1 + 1 - 11);
  });

  it('bez úprav a přefuků je Ostatní nula', () => {
    const jednoduse = buildMovements({
      packages,
      inventoryRows: [{ entry_date: '2026-10-01', beer_id: B, package_id: P, quantity: 4, note: 'Počáteční stav' }],
      keggingRows: [{ entry_date: '2026-10-05', beer_id: B, package_id: P, quantity: 3 }],
      zavozDeductionRows: [{ deduct_date: '2026-10-07', beer_id: B, package_id: P, quantity: 5 }],
    });
    const j = radekBilanceSudu(expectedForMonth(jednoduse, '2026-10').get(K), stockAsOf(jednoduse, '2026-10-31').get(K));
    expect(j).toMatchObject({ initialQty: 4, stacenoKegQty: 3, objednavkyQty: 5, ostatniQty: 0, endStockQty: 2 });
  });
});

describe('Sklad a měsíční inventura ukazují Úpravu skladu, ne druhé číslo (29. 10. 2026)', () => {
  const sklad = readFileSync(resolve(__dirname, '../screens/Stock.tsx'), 'utf8');
  const inventura = readFileSync(resolve(__dirname, '../screens/InventoryScreen.tsx'), 'utf8');

  it('Sklad: rozpad má řádek Úprava skladu a mínus se bere ze stavu', () => {
    expect(sklad).toMatch(/const upravaW = rawStock - \(line\?\.qty \?\? 0\)/);
    expect(sklad).toMatch(/\(úprava skladu\)/);
    expect(sklad).toMatch(/stavKDni\.forEach\(\(line\) => \{/);
  });

  it('Inventura: místo „očekáváno podle evidence" sloupec ÚPRAVA SKLADU, bilance ze skladové knihy', () => {
    expect(inventura).not.toMatch(/OČEK\. \(EVIDENCE\)|Očekáváno podle evidence|oček\. podle evidence/);
    expect(inventura).toMatch(/ÚPRAVA SKLADU \(±\)/);
    expect(inventura).toMatch(/radekBilanceSudu\(rozpad\.get\(k\), sklad\.get\(k\)/);
    expect(inventura).not.toMatch(/getKegsUsed|akce_records_v2|setStacenoKegMap/);
  });
});
