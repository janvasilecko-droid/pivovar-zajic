// 🦆 Kačena v databázi (orders.second_car): kdo jede druhým autem, přenos označení
// z prohlížeče a zápis. Zadání majitele 29. 10. 2026 (Kniha jízd) — označení dosud
// žilo jen v localStorage jednoho zařízení.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const od = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { from: od.from } }));

import {
  getPrenesenoKachny,
  jeKachna,
  kachnaVDatabazi,
  kachnyKPrenosu,
  pridejPrenesenoKachny,
  PRENOS_DNI,
} from './zavozSecondCar';
import { preneseMistniKachnu, zapisKachnu } from './zavozKachnaDb';

const MISTNI_KLIC = 'zavoz_second_car_order_ids';
const PRENESENO_KLIC = 'zavoz_second_car_preneseno_ids';
const DNES = '2026-10-29';

/** Odpověď řetězu supabase.from('orders').update(…).in('id', …).select('id'). */
function odpoved(vysledek: { data?: { id: string }[] | null; error?: { message: string } | null }) {
  const select = vi.fn().mockResolvedValue({ data: vysledek.data ?? null, error: vysledek.error ?? null });
  const inFn = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ in: inFn }));
  od.from.mockReturnValue({ update });
  return { update, inFn, select };
}

beforeEach(() => {
  localStorage.removeItem(MISTNI_KLIC);
  localStorage.removeItem(PRENESENO_KLIC);
  od.from.mockReset();
});

describe('kachnaVDatabazi / jeKachna', () => {
  it('sloupec v databázi je, když ho má aspoň jedna načtená objednávka', () => {
    expect(kachnaVDatabazi([{ second_car: false }, { second_car: true }])).toBe(true);
    expect(kachnaVDatabazi([{}, { second_car: false }])).toBe(true);
  });

  it('bez migrace sloupec v řádcích chybí — a prázdný seznam nic neříká', () => {
    expect(kachnaVDatabazi([{}, {}])).toBe(false);
    expect(kachnaVDatabazi([])).toBe(false);
  });

  it('databáze má přednost před prohlížečem — v obou směrech', () => {
    localStorage.setItem(MISTNI_KLIC, JSON.stringify(['a']));
    expect(jeKachna({ id: 'a', second_car: false })).toBe(false); // v prohlížeči označená, v databázi odškrtnutá
    expect(jeKachna({ id: 'b', second_car: true })).toBe(true); // v databázi označená, v prohlížeči ne
  });

  it('bez sloupce se jede podle prohlížeče jako dřív', () => {
    localStorage.setItem(MISTNI_KLIC, JSON.stringify(['a']));
    expect(jeKachna({ id: 'a' })).toBe(true);
    expect(jeKachna({ id: 'b' })).toBe(false);
  });
});

describe('kachnyKPrenosu — co se z prohlížeče přenese do databáze', () => {
  const obj = (id: string, second_car: boolean | undefined, datum: string | null, order_date: string | null = null) =>
    ({ id, second_car, delivery_date: datum, order_date });

  it('přenese označené v prohlížeči, které databáze zatím nemá', () => {
    const o = [obj('a', false, '2026-10-20'), obj('b', false, '2026-10-21')];
    expect(kachnyKPrenosu(o, ['a'], [], DNES)).toEqual(['a']);
  });

  it('co už databáze má označené, se nepřenáší', () => {
    expect(kachnyKPrenosu([obj('a', true, '2026-10-20')], ['a'], [], DNES)).toEqual([]);
  });

  it('bez sloupce (second_car chybí) se nepřenáší nic — není kam', () => {
    expect(kachnyKPrenosu([obj('a', undefined, '2026-10-20')], ['a'], [], DNES)).toEqual([]);
  });

  it('co se už jednou přenášelo, se znovu nepřenáší — odškrtnutí v databázi platí', () => {
    expect(kachnyKPrenosu([obj('a', false, '2026-10-20')], ['a'], ['a'], DNES)).toEqual([]);
  });

  it(`jen objednávky z posledních ${PRENOS_DNI} dní (hranice včetně), starší ne`, () => {
    const o = [obj('hranice', false, '2026-08-30'), obj('stara', false, '2026-08-29'), obj('budouci', false, '2026-11-15')];
    expect(kachnyKPrenosu(o, ['hranice', 'stara', 'budouci'], [], DNES).sort()).toEqual(['budouci', 'hranice']);
  });

  it('bez delivery_date se bere order_date; objednávka bez jakéhokoli data se nepřenáší', () => {
    const o = [obj('a', false, null, '2026-10-10'), obj('b', false, null, null)];
    expect(kachnyKPrenosu(o, ['a', 'b'], [], DNES)).toEqual(['a']);
  });

  it('prázdné označení v prohlížeči = nic k přenosu', () => {
    expect(kachnyKPrenosu([obj('a', false, '2026-10-20')], [], [], DNES)).toEqual([]);
  });
});

describe('seznam už přenesených označení', () => {
  it('ukládá se bez duplicit a čte zpátky', () => {
    expect(getPrenesenoKachny()).toEqual([]);
    pridejPrenesenoKachny(['a', 'b']);
    pridejPrenesenoKachny(['b', 'c']);
    expect(getPrenesenoKachny()).toEqual(['a', 'b', 'c']);
  });

  it('rozbitý záznam v úložišti se zahodí', () => {
    localStorage.setItem(PRENESENO_KLIC, '{nesmysl');
    expect(getPrenesenoKachny()).toEqual([]);
    localStorage.setItem(PRENESENO_KLIC, JSON.stringify(['a', 5, null]));
    expect(getPrenesenoKachny()).toEqual(['a']);
  });
});

describe('zapisKachnu', () => {
  it('označí objednávky a ohlásí úspěch', async () => {
    const { update, inFn, select } = odpoved({ data: [{ id: 'a' }, { id: 'b' }] });
    expect(await zapisKachnu(['a', 'b'], true)).toEqual({ ok: true });
    expect(od.from).toHaveBeenCalledWith('orders');
    expect(update).toHaveBeenCalledWith({ second_car: true });
    expect(inFn).toHaveBeenCalledWith('id', ['a', 'b']);
    expect(select).toHaveBeenCalledWith('id');
  });

  it('odznačení posílá second_car = false', async () => {
    const { update } = odpoved({ data: [{ id: 'a' }] });
    await zapisKachnu(['a'], false);
    expect(update).toHaveBeenCalledWith({ second_car: false });
  });

  it('chyba databáze se vrátí s textem', async () => {
    odpoved({ error: { message: 'Could not find the \'second_car\' column' } });
    const v = await zapisKachnu(['a'], true);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.chyba).toContain('second_car');
  });

  it('přeskočené řádky (uzavřený měsíc, bez oprávnění) se nepřejdou mlčením', async () => {
    odpoved({ data: [{ id: 'a' }] }); // ze tří se změnil jen jeden
    const v = await zapisKachnu(['a', 'b', 'c'], true);
    expect(v).toMatchObject({ ok: false, zapsano: 1 });
    expect(!v.ok && v.chyba).toMatch(/1 z 3/);
  });

  it('bez objednávek se databáze ani nevolá', async () => {
    expect(await zapisKachnu([], true)).toEqual({ ok: true });
    expect(od.from).not.toHaveBeenCalled();
  });
});

describe('preneseMistniKachnu', () => {
  const obj = (id: string, second_car: boolean | undefined, datum = '2026-10-20') => ({ id, second_car, delivery_date: datum, order_date: null });

  it('přenese označené z prohlížeče a zapamatuje si, že už to udělala', async () => {
    localStorage.setItem(MISTNI_KLIC, JSON.stringify(['a', 'b']));
    const { update, inFn } = odpoved({ data: [{ id: 'a' }, { id: 'b' }] });
    const o = [obj('a', false), obj('b', false), obj('c', false)];
    expect(await preneseMistniKachnu(o, DNES)).toEqual(['a', 'b']);
    expect(update).toHaveBeenCalledWith({ second_car: true });
    expect(inFn).toHaveBeenCalledWith('id', ['a', 'b']);
    expect(getPrenesenoKachny()).toEqual(['a', 'b']);

    // podruhé už nic — i kdyby byla objednávka v databázi mezitím odškrtnutá
    od.from.mockClear();
    expect(await preneseMistniKachnu(o, DNES)).toEqual([]);
    expect(od.from).not.toHaveBeenCalled();
  });

  it('bez sloupce v databázi nedělá nic a nic si nepamatuje', async () => {
    localStorage.setItem(MISTNI_KLIC, JSON.stringify(['a']));
    expect(await preneseMistniKachnu([obj('a', undefined)], DNES)).toEqual([]);
    expect(od.from).not.toHaveBeenCalled();
    expect(getPrenesenoKachny()).toEqual([]);
  });

  it('chyba databáze nic neblokuje a nezapamatuje se — zkusí se příště', async () => {
    localStorage.setItem(MISTNI_KLIC, JSON.stringify(['a']));
    odpoved({ error: { message: 'síť' } });
    expect(await preneseMistniKachnu([obj('a', false)], DNES)).toEqual([]);
    expect(getPrenesenoKachny()).toEqual([]);
  });

  it('řádky, které databáze přeskočila (uzavřený měsíc), se příště nezkouší znovu', async () => {
    localStorage.setItem(MISTNI_KLIC, JSON.stringify(['a', 'b']));
    odpoved({ data: [{ id: 'a' }] });
    expect(await preneseMistniKachnu([obj('a', false), obj('b', false)], DNES)).toEqual(['a']);
    expect(getPrenesenoKachny()).toEqual(['a', 'b']);
  });

  it('není co přenášet = databáze se nevolá', async () => {
    expect(await preneseMistniKachnu([obj('a', false)], DNES)).toEqual([]);
    expect(od.from).not.toHaveBeenCalled();
  });
});
