import { describe, it, expect } from 'vitest';
import { objednavkaJakoText } from './objednavkaJakoText';

describe('objednavkaJakoText', () => {
  it('poskládá pivo, obal a množství do čitelných řádků', () => {
    const text = objednavkaJakoText(
      { order_date: '2026-09-09', place_name: 'Restaurace U Zajíce' },
      [
        { beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: 2 },
        { beer_name: '11° Světlá', package_label: 'Lahve 0,5l', quantity: 40 },
      ],
    );
    expect(text).toContain('Objednávka — Restaurace U Zajíce');
    expect(text).toContain('2× 12° Světlá KEG 50l');
    expect(text).toContain('40× 11° Světlá Lahve 0,5l');
    expect(text).toContain('Celkem: 42 ks');
  });

  it('bez místa nadepíše jen "Objednávka"', () => {
    const text = objednavkaJakoText({ order_date: '2026-09-09' }, []);
    expect(text.split('\n')[0]).toBe('Objednávka');
  });

  it('den závozu se přidá, jen když je vyplněný', () => {
    const bez = objednavkaJakoText({ order_date: '2026-09-09' }, []);
    expect(bez).not.toContain('Závoz:');
    const se = objednavkaJakoText({ order_date: '2026-09-09', delivery_date: '2026-09-12' }, []);
    expect(se).toContain('Závoz: 2026-09-12');
  });

  it('poznámka se přidá jen když není prázdná', () => {
    const bez = objednavkaJakoText({ order_date: '2026-09-09', note: '   ' }, []);
    expect(bez).not.toContain('Poznámka');
    const se = objednavkaJakoText({ order_date: '2026-09-09', note: 'vratný sud' }, []);
    expect(se).toContain('Poznámka: vratný sud');
  });

  it('chybějící pivo nebo obal nespadne, jen vynechá prázdné místo', () => {
    const text = objednavkaJakoText({ order_date: '2026-09-09' }, [
      { beer_name: null, package_label: null, quantity: 5 },
    ]);
    expect(text).toContain('5× ?');
  });

  it('žádné markdown hvězdičky ani emoji — jde rovnou do SMS', () => {
    const text = objednavkaJakoText(
      { order_date: '2026-09-09', place_name: 'Test' },
      [{ beer_name: 'Pivo', package_label: 'KEG', quantity: 1 }],
    );
    expect(text).not.toMatch(/[*_`]/);
  });
});
