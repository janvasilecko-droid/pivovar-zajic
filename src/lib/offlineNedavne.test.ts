// 14. 10. 2026: „nejde mi označovat, že mám připravený lahve" — na slabém signálu
// odškrtnutí na server došlo, ale přenačtení spadlo na starou mezipaměť, která
// o zápisu, co prošel rovnou, nevěděla. Teď se prošlé zápisy chvíli pamatují
// a ve staré mezipaměti se přimíchají stejně jako fronta (offline.ts).
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { aplikujOperace, getQueue, opravInMatch, NEDAVNE_MAX_STARI_MS, nedavneProslyZapisy, zapamatujProsly, zapomenProslyZapisy, type QueuedOp } from './offline';

const op = (extra: Partial<QueuedOp>): QueuedOp => ({ id: 'x', table: 'order_items', op: 'update', ts: 1, ...extra } as QueuedOp);
const radky = () => [
  { id: 'a', order_id: 'o1', is_prepared: false },
  { id: 'b', order_id: 'o1', is_prepared: false },
  { id: 'c', order_id: 'o2', is_prepared: false },
];

describe('aplikujOperace', () => {
  it('úprava podle jednoho řádku (eq) změní jen ten řádek', () => {
    const r = aplikujOperace(radky(), [op({ match: { id: 'b' }, row: { is_prepared: true } })]);
    expect(r.map((x) => x.is_prepared)).toEqual([false, true, false]);
  });

  it('úprava přes .in() změní jen vyjmenované řádky, ne celou tabulku', () => {
    const r = aplikujOperace(radky(), [op({ inMatch: { id: ['a', 'c'] }, row: { is_prepared: true } })]);
    expect(r.map((x) => x.is_prepared)).toEqual([true, false, true]);
  });

  it('úprava s filtrem v jiném sloupci (order_id) zasáhne jen ten sloupec', () => {
    const r = aplikujOperace(radky(), [op({ match: { order_id: 'o1' }, row: { is_prepared: true } })]);
    expect(r.map((x) => x.is_prepared)).toEqual([true, true, false]);
  });

  it('úprava bez jakéhokoli filtru a bez id nezmění nic', () => {
    const r = aplikujOperace(radky(), [op({ row: { is_prepared: true } })]);
    expect(r.every((x) => x.is_prepared === false)).toBe(true);
  });

  it('smazání podle eq i .in()', () => {
    expect(aplikujOperace(radky(), [op({ op: 'delete', match: { id: 'a' } })]).map((x) => x.id)).toEqual(['b', 'c']);
    expect(aplikujOperace(radky(), [op({ op: 'delete', inMatch: { id: ['a', 'c'] } })]).map((x) => x.id)).toEqual(['b']);
    expect(aplikujOperace(radky(), [op({ op: 'delete' })]).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('zápisy se skládají podle času: pozdější přebije dřívější, i když leží v poli první', () => {
    const r = aplikujOperace(radky(), [
      op({ ts: 20, match: { id: 'a' }, row: { is_prepared: false } }),
      op({ ts: 10, match: { id: 'a' }, row: { is_prepared: true } }),
    ]);
    expect(r[0].is_prepared).toBe(false);
  });

  it('nový řádek se přidá, existující se slije', () => {
    const r = aplikujOperace(radky(), [
      op({ op: 'insert', row: { id: 'd', order_id: 'o3' } }),
      op({ op: 'insert', row: { id: 'a', note: 'x' } }),
    ]);
    expect(r.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(r[0]).toMatchObject({ id: 'a', note: 'x', is_prepared: false });
  });

  it('bez zápisů vrátí tytéž řádky', () => {
    const vstup = radky();
    expect(aplikujOperace(vstup, [])).toBe(vstup);
  });
});

describe('nedávné prošlé zápisy', () => {
  beforeEach(() => { zapomenProslyZapisy(); localStorage.clear(); });

  it('pamatuje se zápis a vrátí se jen pro svou tabulku', () => {
    zapamatujProsly({ table: 'order_items', op: 'update', match: { id: 'a' }, row: { is_prepared: true } }, 1000, 1000);
    zapamatujProsly({ table: 'orders', op: 'update', match: { id: 'o1' }, row: { is_prepared: true } }, 1001, 1001);
    expect(nedavneProslyZapisy('order_items', 2000).map((o) => o.table)).toEqual(['order_items']);
    expect(nedavneProslyZapisy('orders', 2000)).toHaveLength(1);
    expect(nedavneProslyZapisy('kegging', 2000)).toEqual([]);
  });

  it('po uplynutí směny se zapomene', () => {
    zapamatujProsly({ table: 'order_items', op: 'update', match: { id: 'a' }, row: { is_prepared: true } }, 1000, 1000);
    expect(nedavneProslyZapisy('order_items', 1000 + NEDAVNE_MAX_STARI_MS - 1)).toHaveLength(1);
    expect(nedavneProslyZapisy('order_items', 1000 + NEDAVNE_MAX_STARI_MS + 1)).toEqual([]);
  });

  it('drží nejvýš 300 zápisů — nejstarší odpadnou', () => {
    for (let i = 0; i < 320; i++) {
      zapamatujProsly({ table: 'order_items', op: 'update', match: { id: String(i) }, row: { is_prepared: true } }, 1000 + i, 1000 + i);
    }
    const v = nedavneProslyZapisy('order_items', 2000);
    expect(v).toHaveLength(300);
    expect(v[0].match).toEqual({ id: '20' });
  });

  it('rozbité úložiště ani plná kvóta nic neshodí', () => {
    localStorage.setItem('pivovar_nedavne_zapisy_v1', '{rozbite');
    expect(nedavneProslyZapisy('order_items')).toEqual([]);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    expect(() => zapamatujProsly({ table: 'order_items', op: 'update', match: { id: 'a' }, row: {} })).not.toThrow();
    spy.mockRestore();
  });
});

describe('zápisy s .in() uvízlé ve frontě se závorkami (chyba do 14. 10. 2026)', () => {
  it('závorky na kraji seznamu se sundají', () => {
    expect(opravInMatch({ id: ['(a', 'b)'] })).toEqual({ id: ['a', 'b'] });
    expect(opravInMatch({ id: ['(jedno)'] })).toEqual({ id: ['jedno'] });
    expect(opravInMatch({ id: ['(a', 'b', 'c)'], order_id: ['x'] })).toEqual({ id: ['a', 'b', 'c'], order_id: ['x'] });
  });

  it('správné hodnoty zůstanou, jak jsou', () => {
    expect(opravInMatch({ id: ['a', 'b'] })).toEqual({ id: ['a', 'b'] });
    expect(opravInMatch({ nazev: ['(x', 'y'] })).toEqual({ nazev: ['(x', 'y'] });
    expect(opravInMatch(undefined)).toBeUndefined();
  });

  it('fronta v telefonu se při čtení opraví sama', () => {
    localStorage.setItem('pivovar_offline_queue_v1', JSON.stringify([
      { id: 'q1', table: 'order_items', op: 'update', inMatch: { id: ['(i1', 'i2)'] }, row: { is_prepared: true }, ts: 1 },
    ]));
    expect(getQueue()[0].inMatch).toEqual({ id: ['i1', 'i2'] });
  });
});
