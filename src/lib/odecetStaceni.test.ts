// Manko z inventury → odečet přímo ze stočených řádků (30. 10. 2026).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMovements, stockAsOf } from './stockLedger';

type Radek = Record<string, any>;
const db: { kegging: Radek[]; bottling: Radek[]; stoceni_upravy: Radek[] } = { kegging: [], bottling: [], stoceni_upravy: [] };
const h = vi.hoisted(() => ({ selhatNaDelete: false }));

vi.mock('./supabase', () => {
  // Napodobenina dotazů Supabase nad polem `db`: filtry eq/gte/lte, update,
  // delete, insert a `select` — vykoná se při `await` (then). Čtení vrací
  // KOPIE řádků jako skutečný server, ať „původní" řádky nejsou živé odkazy.
  const dotaz = (tabulka: keyof typeof db) => {
    const filtry: ((r: Radek) => boolean)[] = [];
    let akce: { typ: 'update' | 'delete' | 'insert'; data?: Radek; nove?: Radek[] } | null = null;
    const proved = () => {
      if (akce?.typ === 'insert') return { data: akce.nove!.map((r) => ({ id: r.id })), error: null };
      const zasah = db[tabulka].filter((r) => filtry.every((f) => f(r)));
      if (akce?.typ === 'delete') {
        if (h.selhatNaDelete) return { data: null, error: { message: 'síť spadla' } };
        db[tabulka] = db[tabulka].filter((r) => !zasah.includes(r));
        return { data: zasah.map((r) => ({ id: r.id })), error: null };
      }
      if (akce?.typ === 'update') {
        zasah.forEach((r) => Object.assign(r, akce!.data));
        return { data: zasah.map((r) => ({ id: r.id })), error: null };
      }
      return { data: zasah.map((r) => ({ ...r })), error: null };
    };
    const q: any = {
      eq: (c: string, v: any) => { filtry.push((r) => r[c] === v); return q; },
      gte: (c: string, v: any) => { filtry.push((r) => r[c] >= v); return q; },
      lte: (c: string, v: any) => { filtry.push((r) => r[c] <= v); return q; },
      update: (data: Radek) => { akce = { typ: 'update', data }; return q; },
      delete: () => { akce = { typ: 'delete' }; return q; },
      insert: (rows: Radek[]) => {
        const nove = rows.map((r, i) => ({ id: r.id ?? `n${db[tabulka].length + i + 1}`, ...r }));
        db[tabulka].push(...nove);
        akce = { typ: 'insert', nove };
        return q;
      },
      select: () => q,
      then: (ok: any, ko: any) => Promise.resolve(proved()).then(ok, ko),
    };
    return q;
  };
  return { supabase: { from: dotaz }, fetchAllRows: (t: keyof typeof db) => dotaz(t) };
});

import { odectiZeStocenych, vratOdecet, hlaskaOdectu } from './odecetStaceni';

const B = 'pivo';
const K = 'sud50';
const zakladniRadky = (): Radek[] => [
  { id: 'pred', entry_date: '2026-10-20', beer_id: B, package_id: K, quantity: 8, created_at: '2026-10-20T10:00:00Z', note: null },
  { id: 'po1', entry_date: '2026-10-28', beer_id: B, package_id: K, quantity: 3, created_at: '2026-10-28T10:00:00Z', note: null },
  { id: 'po2', entry_date: '2026-10-29', beer_id: B, package_id: K, quantity: 2, created_at: '2026-10-29T10:00:00Z', note: null },
];
const pohyby = () => buildMovements({
  inventoryRows: [{ entry_date: '2026-10-26', beer_id: B, package_id: K, quantity: 5, note: 'Počáteční stav (týden)', created_at: '2026-10-26T06:00:00Z' }],
  keggingRows: db.kegging,
});
const vstup = (kusy: number) => ({
  tabulka: 'kegging' as const, beer_id: B, beer_name: '12° Světlá', package_id: K, package_label: '50l',
  datum: '2026-10-31', kusy, pohyby: pohyby(),
  ocekavano: (p: ReturnType<typeof pohyby>) => stockAsOf(p, '2026-10-31').get(`${B}__${K}`)?.qty ?? 0,
});

beforeEach(() => {
  db.kegging = zakladniRadky();
  db.bottling = [];
  db.stoceni_upravy = [];
  h.selhatNaDelete = false;
});

describe('odečet manka ze stočených sudů — bez záporného řádku', () => {
  it('sníží a smaže jen řádky po posledním počítání, zapíše deník, žádný minus', async () => {
    const v = await odectiZeStocenych(vstup(4));
    expect(v).toMatchObject({ odecteno: 4, zbytek: 0 });
    expect(db.kegging.map((r) => [r.id, r.quantity])).toEqual([['pred', 8], ['po1', 1]]);
    expect(db.kegging.some((r) => r.quantity < 0)).toBe(false);
    expect(db.stoceni_upravy).toHaveLength(1);
    expect(db.stoceni_upravy[0]).toMatchObject({ druh: 'odecteno', kusu: 4, mesic: '2026-10' });
  });

  it('co odečíst nejde, se nezapíše — hláška pošle zbytek do Dorovnání', async () => {
    const v = await odectiZeStocenych(vstup(7));
    expect(v).toMatchObject({ odecteno: 5, zbytek: 2 });
    expect(db.kegging.map((r) => r.id)).toEqual(['pred']);
    expect(hlaskaOdectu(v, 'Stáčení KEG')).toMatch(/Odečteno 5 ks.*Zbylých 2 ks.*Dorovnání/);
  });

  it('„Vrátit zpět" vrátí snížený i smazaný řádek přesně, jak byl', async () => {
    const v = await odectiZeStocenych(vstup(4));
    await vratOdecet(v);
    expect(db.kegging.map((r) => [r.id, r.quantity, r.created_at]).sort()).toEqual(
      zakladniRadky().map((r) => [r.id, r.quantity, r.created_at]).sort(),
    );
  });

  it('když zápis v půlce spadne, už provedené snížení se vrátí — nezůstane polovičatý odečet', async () => {
    h.selhatNaDelete = true;
    await expect(odectiZeStocenych(vstup(4))).rejects.toThrow('síť spadla');
    expect(db.kegging.map((r) => [r.id, r.quantity])).toEqual([['pred', 8], ['po1', 3], ['po2', 2]]);
    expect(db.stoceni_upravy).toHaveLength(0);
  });
});
