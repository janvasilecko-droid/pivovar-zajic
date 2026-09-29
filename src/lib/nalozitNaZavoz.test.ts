// Z provozu 28. 9. 2026: dlaždice Rozvoz ukazuje, co naložit na další závoz.
import { describe, it, expect } from 'vitest';
import { coNalozitNaZavoz } from './nalozitNaZavoz';

const o = (delivery_date: string, items: [string, string, number][], status = 'nova', place_name = 'U Zajíce') => ({
  delivery_date, status, place_name,
  order_items: items.map(([beer_name, package_label, quantity]) => ({ beer_name, package_label, quantity })),
});

describe('coNalozitNaZavoz', () => {
  it('sečte kusy po pivu a obalu na nejbližší den po dnešku', () => {
    const r = coNalozitNaZavoz([
      o('2026-09-28', [['12° Světlá', 'KEG 50l', 99]]), // dnešek — ne
      o('2026-09-29', [['12° Světlá', 'KEG 50l', 4], ['10° Desítka', 'KEG 30l', 2]], 'nova', 'Hospoda A'),
      o('2026-09-29', [['12° Světlá', 'KEG 50l', 3]], 'nova', 'Hospoda B'),
      o('2026-09-30', [['13° Tmavé', 'KEG 30l', 5]]),
    ], '2026-09-28');
    expect(r!.datum).toBe('2026-09-29');
    expect(r!.objednavek).toBe(2);
    expect(r!.mista).toEqual(['Hospoda A', 'Hospoda B']);
    expect(r!.polozky).toEqual([
      { pivo: '12° Světlá', obal: 'KEG 50l', kusu: 7 },
      { pivo: '10° Desítka', obal: 'KEG 30l', kusu: 2 },
    ]);
    expect(r!.kusuCelkem).toBe(9);
  });

  it('v pátek ukáže pondělí, když o víkendu nic nejede', () => {
    const r = coNalozitNaZavoz([o('2026-10-05', [['12° Světlá', 'KEG 50l', 1]])], '2026-10-02');
    expect(r!.datum).toBe('2026-10-05');
  });

  it('storno a objednávky bez data se nepočítají', () => {
    expect(coNalozitNaZavoz([
      o('2026-09-29', [['12° Světlá', 'KEG 50l', 1]], 'storno'),
      { delivery_date: null, status: 'nova', order_items: [] },
    ], '2026-09-28')).toBeNull();
  });
});

import { tabulkaNakladky } from './nalozitNaZavoz';

describe('nakládka jako tabulka (styl Co stočit)', () => {
  it('řádek = pivo, sloupce sudy od největšího, pak lahve, součty', () => {
    const t = tabulkaNakladky([
      { pivo: '12° Světlá', obal: 'KEG 50l', kusu: 7 },
      { pivo: '12° Světlá', obal: 'KEG 30l', kusu: 3 },
      { pivo: '10° Desítka', obal: 'KEG 50l', kusu: 2 },
      { pivo: '10° Desítka', obal: 'Lahve 0,5l', kusu: 20 },
    ]);
    expect(t.sloupce.map((s) => s.kratce)).toEqual(['50l', '30l', '0,5l']);
    expect(t.radky.map((r) => r.pivo)).toEqual(['10° Desítka', '12° Světlá']);
    expect(t.radky[1].kusy.get('KEG 50l')).toBe(7);
    expect(t.soucty.get('KEG 50l')).toBe(9);
  });
});
