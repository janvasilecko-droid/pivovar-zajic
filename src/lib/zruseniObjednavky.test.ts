// Z provozu 29. 9. 2026: „já je zruším a ty sudy vrať na sklad k dnešnímu
// dni, stejně jako přes formulář, ať to nerozhází uzavřenou inventuru."
import { describe, it, expect } from 'vitest';
import { chybiFunkce, vraceniZOdpoctu, zruseniSVracenim } from './zruseniObjednavky';
import { readFileSync } from 'node:fs';

const polozky = [
  { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k30', package_label: 'KEG 30l' },
  { beer_id: 'b10', beer_name: '10° Desítka', package_id: 'k50', package_label: 'KEG 50l' },
];

describe('zrušení odepsané objednávky s vrácením dnešním dnem', () => {
  it('vrací to, co se odepsalo (součet po pivu a obalu)', () => {
    const v = vraceniZOdpoctu([
      { order_id: 'o', beer_id: 'b12', package_id: 'k30', quantity: 2 },
      { order_id: 'o', beer_id: 'b12', package_id: 'k30', quantity: 1 },
      { order_id: 'o', beer_id: 'b10', package_id: 'k50', quantity: 4 },
    ], polozky);
    expect(v).toEqual([
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k30', package_label: 'KEG 30l', pocet: 3 },
      { beer_id: 'b10', beer_name: '10° Desítka', package_id: 'k50', package_label: 'KEG 50l', pocet: 4 },
    ]);
  });

  it('záznam vrácení je DNEŠNÍ, s vazbou na objednávku a poznámkou', () => {
    const v = vraceniZOdpoctu([{ order_id: 'o', beer_id: 'b12', package_id: 'k30', quantity: 2 }], polozky);
    const { zaznamy, poznamka } = zruseniSVracenim({ id: 'o', note: 'původní', place_name: 'Maneo' }, v, '2026-09-29');
    expect(zaznamy).toHaveLength(1);
    expect(zaznamy[0]).toMatchObject({ entry_date: '2026-09-29', order_id: 'o', quantity: 2, beer_id: 'b12', package_id: 'k30' });
    expect(String(zaznamy[0].reason)).toMatch(/^Zrušená objednávka, vráceno na sklad/);
    expect(poznamka.startsWith('původní\nZrušeno.')).toBe(true);
  });
});

// 30. 9. 2026: „mám vrácené dvojnásobné množství sudů 10ky" — vrácení se
// zapsalo a změna stavu na storno pak v databázi smazala i odpočet.
describe('zrušení nevrací dvakrát', () => {
  it('odečte, co se z objednávky už vrátilo dřív přes formulář', () => {
    const v = vraceniZOdpoctu([
      { order_id: 'o', beer_id: 'b12', package_id: 'k30', quantity: 3 },
      { order_id: 'o', beer_id: 'b10', package_id: 'k50', quantity: 4 },
    ], polozky, new Map([['b12__k30', 1], ['b10__k50', 4]]));
    expect(v).toEqual([{ beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k30', package_label: 'KEG 30l', pocet: 2 }]);
  });

  it('pozná chybějící funkci v databázi (migrace neproběhla)', () => {
    expect(chybiFunkce({ code: 'PGRST202', message: 'Could not find the function public.zrusit_odepsanou_objednavku' })).toBe(true);
    expect(chybiFunkce({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(chybiFunkce(null)).toBe(false);
  });

  it('storno přímým UPDATE už appka nedělá — jen přes funkci v databázi', () => {
    const zdroj = readFileSync('src/lib/zruseniObjednavky.ts', 'utf8');
    expect(zdroj).toContain("rpc('zrusit_odepsanou_objednavku'");
    expect(zdroj).not.toMatch(/from\('orders'\)\s*\.update\(\{\s*status: 'storno'/);
    expect(zdroj).not.toContain("from('inventory_adjustments').insert");
  });

  it('databáze u storna s vrácením odpočet nemaže a zdvojené opraví', () => {
    const sql = readFileSync('supabase/migrations/20261231200000_zruseni_s_vracenim_bez_zdvojeni.sql', 'utf8');
    // Značka v `reason` musí sedět s tím, co appka zapisuje (zruseniSVracenim).
    const { zaznamy } = zruseniSVracenim({ id: 'o', note: null, place_name: 'Maneo' },
      [{ beer_id: 'b', beer_name: 'x', package_id: 'p', package_label: 'KEG 10l', pocet: 1 }], '2026-09-30');
    expect(String(zaznamy[0].reason).startsWith('Zrušená objednávka, vráceno na sklad')).toBe(true);
    expect(sql).toContain("ia.reason LIKE 'Zrušená objednávka, vráceno na sklad%'");
    expect(sql).toContain('INSERT INTO public.zavoz_deductions');
  });
});
