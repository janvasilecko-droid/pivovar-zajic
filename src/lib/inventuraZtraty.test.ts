// 1. 10. 2026: „co to píše v inventuře ‚očekáváno po ztrátách'… žádné
// ztráty nejsou" — vrácení z objednávek se v inventuře ukazovalo jako
// ztráty a uložení inventury je přepisovalo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const obrazovka = readFileSync('src/screens/InventoryScreen.tsx', 'utf8');
const migrace = readFileSync('supabase/migrations/20261231210000_inventura_nemaze_vraceni.sql', 'utf8');

describe('inventura: ztráty nejsou vrácení', () => {
  it('jako ztráty bere jen záznamy bez objednávky a bez důvodu', () => {
    expect(obrazovka).toMatch(/!r\.order_id && !String\(r\.reason \?\? ''\)\.trim\(\)/);
  });

  it('ukládá přes _v2, která maže jen ztráty', () => {
    expect(obrazovka).toContain("rpc('save_physical_inventory_v2'");
    expect(obrazovka).not.toContain("rpc('save_physical_inventory',");
    expect(migrace).toMatch(/AND order_id IS NULL\s+AND NULLIF\(btrim\(COALESCE\(reason, ''\)\), ''\) IS NULL;/);
  });

  it('sdílené načtení vrací i důvod (bez něj by filtr nefungoval)', () => {
    expect(readFileSync('src/lib/sdilenaData.ts', 'utf8')).toMatch(/inventory_adjustments: '[^']*\breason\b/);
  });
});

import { buildMovements, expectedForMonth } from './stockLedger';

describe('měsíční očekávaný stav: vrácení ano, ztráty zvlášť', () => {
  const zaklad = { entry_date: '2026-09-01', beer_id: 'b', package_id: 'k20', quantity: 0, note: 'Počáteční stav' };
  const pohyby = buildMovements({
    inventoryRows: [zaklad],
    zavozDeductionRows: [{ deduct_date: '2026-09-22', beer_id: 'b', package_id: 'k20', quantity: 2, order_id: 'maneo' }],
    adjustmentRows: [
      // zrušení Manea s vrácením — patří do očekávaného stavu
      { entry_date: '2026-09-29', beer_id: 'b', package_id: 'k20', quantity: 2, order_id: 'maneo', reason: 'Zrušená objednávka, vráceno na sklad — 2× KEG 20l' },
      // dorovnání týdenní inventury — taky
      { entry_date: '2026-09-27', beer_id: 'b', package_id: 'k20', quantity: 1, reason: 'Dorovnání z inventury týden 39 — KEG 20l' },
      // ztráta z měsíční inventury — ne (přičítá ji obrazovka zvlášť)
      { entry_date: '2026-09-30', beer_id: 'b', package_id: 'k20', quantity: -1 },
    ],
  });

  it('vrácené sudy a týdenní dorovnání jsou v očekávaném stavu, ztráta ne', () => {
    expect(expectedForMonth(pohyby, '2026-09').get('b__k20')?.qty).toBe(0 - 2 + 2 + 1);
    expect(expectedForMonth(pohyby, '2026-09', true).get('b__k20')?.qty).toBe(0 - 2 + 2 + 1 - 1);
  });
});
