import { describe, it, expect } from 'vitest';
import { rozpadSuduVCyklech, popisRozpaduSudu, type CyklusOkno, type StaceniRadek } from './cyklyTanku';

const OBALY = new Map([
  ['keg50', { label: 'KEG 50 l' }],
  ['keg30', { label: 'KEG 30 l' }],
  ['keg10', { label: 'KEG 10 l' }],
]);

// Tank A má dva cykly za sebou, tank B jeden.
const cykly: CyklusOkno[] = [
  { id: 'c1', tank_id: 'A', started_at: '2026-08-01T06:00:00Z', ended_at: '2026-08-05T18:00:00Z' },
  { id: 'c2', tank_id: 'A', started_at: '2026-08-06T06:00:00Z', ended_at: '2026-08-12T18:00:00Z' },
  { id: 'c3', tank_id: 'B', started_at: '2026-08-02T06:00:00Z', ended_at: '2026-08-09T18:00:00Z' },
];

const staceni: StaceniRadek[] = [
  { cellar_tank_id: 'A', package_id: 'keg50', quantity: 8, created_at: '2026-08-03T09:00:00Z' },
  { cellar_tank_id: 'A', package_id: 'keg30', quantity: 4, created_at: '2026-08-04T09:00:00Z' },
  { cellar_tank_id: 'A', package_id: 'keg50', quantity: 2, created_at: '2026-08-04T15:00:00Z' },
  // Druhý cyklus téhož tanku — jiné velikosti.
  { cellar_tank_id: 'A', package_id: 'keg10', quantity: 20, created_at: '2026-08-07T09:00:00Z' },
  { cellar_tank_id: 'B', package_id: 'keg50', quantity: 5, created_at: '2026-08-03T09:00:00Z' },
];

describe('rozpad sudů v cyklu tanku', () => {
  it('sečte tentýž obal a seřadí od nejpočetnějšího', () => {
    const v = rozpadSuduVCyklech(cykly, staceni, OBALY);
    expect(v.get('c1')).toEqual([
      { id: 'keg50', nazev: 'KEG 50 l', kusy: 10 },
      { id: 'keg30', nazev: 'KEG 30 l', kusy: 4 },
    ]);
  });

  // 🐛 Tohle je ta chyba, kvůli které se rozpad nedá počítat z `entry_date`:
  // dva cykly téhož tanku můžou být pár dní po sobě a datum bez času je
  // od sebe nerozliší.
  it('dva cykly téhož tanku se nepletou dohromady', () => {
    const v = rozpadSuduVCyklech(cykly, staceni, OBALY);
    expect(v.get('c2')).toEqual([{ id: 'keg10', nazev: 'KEG 10 l', kusy: 20 }]);
    expect(v.get('c1')!.find((o) => o.id === 'keg10')).toBeUndefined();
  });

  it('stáčení z jiného tanku se do cyklu nepřilepí', () => {
    const v = rozpadSuduVCyklech(cykly, staceni, OBALY);
    expect(v.get('c3')).toEqual([{ id: 'keg50', nazev: 'KEG 50 l', kusy: 5 }]);
  });

  it('řádek mimo každé okno se zahodí, ne přiřadí k nejbližšímu', () => {
    const v = rozpadSuduVCyklech(
      cykly,
      [{ cellar_tank_id: 'A', package_id: 'keg50', quantity: 3, created_at: '2026-09-30T09:00:00Z' }],
      OBALY,
    );
    expect(v.size).toBe(0);
  });

  it('cyklus bez dohledaného stáčení v mapě není — volající pak ukáže jen souhrn', () => {
    expect(rozpadSuduVCyklech(cykly, [], OBALY).get('c1')).toBeUndefined();
  });

  it('řádek bez tanku, obalu nebo času nespadne, jen se přeskočí', () => {
    const v = rozpadSuduVCyklech(cykly, [
      { cellar_tank_id: null, package_id: 'keg50', quantity: 1, created_at: '2026-08-03T09:00:00Z' },
      { cellar_tank_id: 'A', package_id: null, quantity: 1, created_at: '2026-08-03T09:00:00Z' },
      { cellar_tank_id: 'A', package_id: 'keg50', quantity: 1, created_at: null },
    ], OBALY);
    expect(v.size).toBe(0);
  });

  // Manko z inventury (viz lib/inventoryFix.ts) je záporný řádek `kegging`.
  // Do cyklu patří stejně jako kladný — snižuje, co z tanku vyšlo.
  it('záporný řádek se započítá, nezahodí', () => {
    const v = rozpadSuduVCyklech(cykly, [
      ...staceni,
      { cellar_tank_id: 'A', package_id: 'keg50', quantity: -3, created_at: '2026-08-05T09:00:00Z' },
    ], OBALY);
    expect(v.get('c1')!.find((o) => o.id === 'keg50')!.kusy).toBe(7);
  });

  it('cyklus bez `started_at` bere všechno do svého konce', () => {
    const v = rozpadSuduVCyklech(
      [{ id: 'x', tank_id: 'A', started_at: null, ended_at: '2026-08-05T18:00:00Z' }],
      staceni,
      OBALY,
    );
    expect(v.get('x')!.reduce((s, o) => s + o.kusy, 0)).toBe(14);
  });
});

describe('popis rozpadu', () => {
  it('vypíše kusy i název, ne jen barvu nebo číslo', () => {
    expect(popisRozpaduSudu([
      { id: 'keg50', nazev: 'KEG 50 l', kusy: 8 },
      { id: 'keg30', nazev: 'KEG 30 l', kusy: 4 },
    ])).toBe('8× KEG 50 l · 4× KEG 30 l');
  });

  it('prázdný rozpad je prázdný řetězec, ne „undefined"', () => {
    expect(popisRozpaduSudu(undefined)).toBe('');
    expect(popisRozpaduSudu([])).toBe('');
  });
});
