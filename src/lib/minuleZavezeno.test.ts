// Rozvoz: zápis „minulé závozy = zavezeno" nesmí zdržet načtení obrazovky. Na slabém signálu (server
// neodpovídá) na něj Rozvoz dřív čekal 10 s při každém otevření — a závozy jsou přesně to, co má jít bez signálu.
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Odpoved = { data: { id: string }[] | null; error: { message: string } | null };
const h = vi.hoisted(() => ({
  volani: [] as { filtry: string[]; hodnota: unknown }[],
  dokonci: [] as ((o: unknown) => void)[],
  zamitni: [] as ((e: unknown) => void)[],
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: (tabulka: string) => ({
      update: (hodnota: unknown) => {
        const filtry: string[] = [tabulka];
        const q: Record<string, unknown> = {};
        for (const op of ['eq', 'neq', 'lt']) q[op] = (sloupec: string, v: unknown) => { filtry.push(`${sloupec} ${op} ${String(v)}`); return q; };
        q.select = (sloupce: string) => {
          filtry.push(`select ${sloupce}`);
          h.volani.push({ filtry, hodnota });
          return new Promise((ok, chyba) => { h.dokonci.push(ok); h.zamitni.push(chyba); });
        };
        return q;
      },
    }),
  },
}));

import { KLIC_MINULE_ZAVEZENO, oznacMinuleZavezene, zapomenMinuleZavezenoProTesty } from './minuleZavezeno';

const DNES = '2026-11-27';
const odpovez = async (o: Odpoved) => { h.dokonci.shift()!(o); await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  localStorage.clear();
  h.volani.length = 0; h.dokonci.length = 0; h.zamitni.length = 0;
  zapomenMinuleZavezenoProTesty();
});

describe('oznacMinuleZavezene', () => {
  it('vrátí se hned — na server se nečeká — a označí jen nezavezené, nestornované, starší než dnes', () => {
    const poZmene = vi.fn();
    expect(oznacMinuleZavezene(DNES, poZmene)).toBeUndefined();        // žádný slib, na který by šlo čekat
    expect(h.volani).toEqual([{
      filtry: ['orders', 'is_delivered eq false', 'status neq storno', `delivery_date lt ${DNES}`, 'select id'],
      hodnota: { is_delivered: true },
    }]);
    expect(poZmene).not.toHaveBeenCalled();
    expect(localStorage.getItem(KLIC_MINULE_ZAVEZENO)).toBeNull();     // hotovo je až po odpovědi serveru
  });

  it('když se něco změnilo, řekne si o přenačtení; když nic, tak ne', async () => {
    const poZmene = vi.fn();
    oznacMinuleZavezene(DNES, poZmene);
    await odpovez({ data: [{ id: 'o1' }, { id: 'o2' }], error: null });
    expect(poZmene).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(KLIC_MINULE_ZAVEZENO)).toBe(DNES);

    localStorage.clear();
    const nic = vi.fn();
    oznacMinuleZavezene(DNES, nic);
    await odpovez({ data: [], error: null });
    expect(nic).not.toHaveBeenCalled();
    expect(localStorage.getItem(KLIC_MINULE_ZAVEZENO)).toBe(DNES);
  });

  it('jednou denně: po úspěchu se už ten den nezapisuje, další den zase ano', async () => {
    oznacMinuleZavezene(DNES, () => {});
    await odpovez({ data: [], error: null });
    oznacMinuleZavezene(DNES, () => {});
    oznacMinuleZavezene(DNES, () => {});
    expect(h.volani).toHaveLength(1);
    oznacMinuleZavezene('2026-11-28', () => {});
    expect(h.volani).toHaveLength(2);
  });

  it('dokud zápis běží (slabý signál), další přenačtení obrazovky ho nepustí znovu', async () => {
    oznacMinuleZavezene(DNES, () => {});
    oznacMinuleZavezene(DNES, () => {});
    oznacMinuleZavezene(DNES, () => {});
    expect(h.volani).toHaveLength(1);
    await odpovez({ data: null, error: { message: 'Failed to fetch' } });
    oznacMinuleZavezene(DNES, () => {});                               // po neúspěchu se zkusí příště znovu
    expect(h.volani).toHaveLength(2);
  });

  it('chyba serveru nic neoznačí a nic nepřenačítá; spadlé spojení taky ne', async () => {
    const poZmene = vi.fn();
    oznacMinuleZavezene(DNES, poZmene);
    await odpovez({ data: null, error: { message: 'bez práv' } });
    expect(localStorage.getItem(KLIC_MINULE_ZAVEZENO)).toBeNull();
    oznacMinuleZavezene(DNES, poZmene);
    h.zamitni.pop()!(new TypeError('Failed to fetch'));
    await Promise.resolve(); await Promise.resolve();
    expect(poZmene).not.toHaveBeenCalled();
    expect(localStorage.getItem(KLIC_MINULE_ZAVEZENO)).toBeNull();
    oznacMinuleZavezene(DNES, poZmene);
    expect(h.volani).toHaveLength(3);                                  // ani výjimka zápis „nezamkne"
  });
});
