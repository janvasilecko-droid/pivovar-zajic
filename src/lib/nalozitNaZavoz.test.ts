// Z provozu 28. 9. 2026: dlaždice Rozvoz ukazuje, co naložit na další závoz.
import { describe, it, expect } from 'vitest';
import { coNalozitNaZavoz, nakladkyPoDnech, vychoziNakladka, kodDne, denProRozvoz, BEZ_DATA } from './nalozitNaZavoz';

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

// 6. 10. 2026: „přidej tam možnost kliknout na dny, kdy jsou další nakládky,
// pokud není datum, tak dej bez dne — Po St Čt Neuvedeno."
describe('nakladkyPoDnech', () => {
  const o = (delivery_date: string | null, kusu: number, extra: Record<string, unknown> = {}) => ({
    delivery_date, status: 'nova', place_name: 'Hospoda',
    order_items: [{ beer_name: '12° Světlá', package_label: 'KEG 50l', quantity: kusu }], ...extra,
  });

  it('dny se zbožím seřazené, Neuvedeno na konci, staré a storno pryč', () => {
    const n = nakladkyPoDnech([
      o('2026-10-08', 2), o(null, 1), o('2026-10-07', 3), o('2026-10-07', 1),
      o('2026-10-05', 9), o('2026-10-09', 4, { status: 'storno' }),
    ], '2026-10-06');
    expect(n.map((x) => [x.datum, x.kusuCelkem])).toEqual([['2026-10-07', 4], ['2026-10-08', 2], [BEZ_DATA, 1]]);
  });

  it('dnešek jen s tím, co ještě neodjelo; bez data jen nezavezené', () => {
    const n = nakladkyPoDnech([
      o('2026-10-06', 2), o('2026-10-06', 5, { is_delivered: true }), o(null, 3, { is_delivered: true }),
    ], '2026-10-06');
    expect(n.map((x) => [x.datum, x.kusuCelkem])).toEqual([['2026-10-06', 2]]);
  });

  // 5. 11. 2026: „dnes se má zvézt Lužec a Seeberg, proč je tam nevidím
  // a vidím tam závoz na příští týden?"
  it('výchozí je dnešní závoz, dokud z něj něco neodjelo', () => {
    const n = nakladkyPoDnech([
      o('2026-11-05', 48, { place_name: 'Lužec' }), o('2026-11-05', 3, { place_name: 'Seeberg' }),
      o('2026-11-12', 45, { place_name: 'Neznámý odběratel' }),
    ], '2026-11-05');
    expect(n.map((x) => [x.datum, x.kusuCelkem])).toEqual([['2026-11-05', 51], ['2026-11-12', 45]]);
    expect(vychoziNakladka(n, '2026-11-05')).toBe('2026-11-05');
    expect(n[0].mista).toEqual(['Lužec', 'Seeberg']);
  });

  it('když dnešní odjelo, je výchozí nejbližší další den, jinak to, co je', () => {
    const n = nakladkyPoDnech([
      o('2026-10-06', 2, { is_delivered: true }), o('2026-10-08', 1), o(null, 1),
    ], '2026-10-06');
    expect(vychoziNakladka(n, '2026-10-06')).toBe('2026-10-08');
    expect(vychoziNakladka(nakladkyPoDnech([o(null, 1)], '2026-10-06'), '2026-10-06')).toBe(BEZ_DATA);
    expect(vychoziNakladka([], '2026-10-06')).toBeNull();
  });

  it('appka otevřená přes půlnoc: včerejší den se nevybere', () => {
    const vcera = nakladkyPoDnech([o('2026-11-04', 5), o('2026-11-06', 2)], '2026-11-04');
    expect(vychoziNakladka(vcera, '2026-11-05')).toBe('2026-11-06');
  });
});

describe('denProRozvoz (z nakládky do Rozvozu na správný týden)', () => {
  it('datum závozu určí den i týden', () => {
    expect(denProRozvoz('2026-11-12')).toEqual({ datum: '2026-11-12', den: 'ct' });
    expect(denProRozvoz('2026-11-09')).toEqual({ datum: '2026-11-09', den: 'po' });
    expect(denProRozvoz('2026-11-08')).toEqual({ datum: '2026-11-08', den: 'ne' });
  });

  it('starší odkaz s kódem dne platí pro tento týden; nesmysl se ignoruje', () => {
    expect(denProRozvoz('ut')).toEqual({ datum: null, den: 'ut' });
    expect(denProRozvoz('xx')).toBeNull();
    expect(denProRozvoz('2026-13-01')).toBeNull();
    expect(denProRozvoz('')).toBeNull();
    expect(denProRozvoz(undefined)).toBeNull();
  });

  it('kód dne nezávisí na časovém pásmu zařízení', () => {
    expect(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map(kodDne))
      .toEqual(['po', 'ut', 'st', 'ct', 'pa', 'so', 'ne']);
  });
});

describe('zacatekTydneBezData (30. 10. 2026: minulý týden do nakládky nepatří)', () => {
  it('vrátí pondělí tohoto týdne', async () => {
    const { zacatekTydneBezData } = await import('./nalozitNaZavoz');
    expect(zacatekTydneBezData('2026-10-30')).toBe('2026-10-26'); // pátek → pondělí
    expect(zacatekTydneBezData('2026-10-26')).toBe('2026-10-26'); // pondělí
    expect(zacatekTydneBezData('2026-11-01')).toBe('2026-10-26'); // neděle
  });
});
