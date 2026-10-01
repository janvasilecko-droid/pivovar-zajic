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
