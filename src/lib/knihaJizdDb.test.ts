// 🚐 Kniha jízd — volání databáze (uzavřené měsíce, dávka změn, uzavření a otevření).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { from: db.from, rpc: db.rpc } }));

import {
  chybiMigrace,
  nactiUzavreneMesice,
  otevritMesic,
  smiOtevritMesic,
  ulozDavku,
  ulozDavkuStarymZpusobem,
  uzavritMesic,
} from './knihaJizdDb';

beforeEach(() => {
  db.from.mockReset();
  db.rpc.mockReset();
});

function odpovedTabulky(vysledek: { data?: unknown[] | null; error?: { message: string; code?: string } | null }) {
  const order = vi.fn().mockResolvedValue({ data: vysledek.data ?? null, error: vysledek.error ?? null });
  const select = vi.fn(() => ({ order }));
  db.from.mockReturnValue({ select });
  return { select, order };
}

describe('chybiMigrace', () => {
  it('pozná, že v databázi chybí funkce nebo tabulka z migrace', () => {
    expect(chybiMigrace({ code: 'PGRST202', message: 'x' })).toBe(true);
    expect(chybiMigrace({ code: 'PGRST205', message: 'x' })).toBe(true);
    expect(chybiMigrace({ code: '42883', message: 'x' })).toBe(true);
    expect(chybiMigrace({ code: '42P01', message: 'x' })).toBe(true);
    expect(chybiMigrace({ message: "Could not find the function public.kniha_jizd_uloz_davku(p_smazat) in the schema cache" })).toBe(true);
    expect(chybiMigrace({ message: 'relation "logbook_closures" does not exist' })).toBe(true);
  });

  it('jiné chyby (síť, oprávnění, naše hlášky) za chybějící migraci nepovažuje', () => {
    expect(chybiMigrace(null)).toBe(false);
    expect(chybiMigrace({ message: 'Failed to fetch' })).toBe(false);
    expect(chybiMigrace({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(chybiMigrace({ message: 'Měsíc 2026-10 auta X je uzavřený.' })).toBe(false);
    expect(chybiMigrace({ message: 'relation "orders" does not exist' })).toBe(false);
  });
});

describe('smiOtevritMesic', () => {
  it('jen vedení (stejný okruh jako is_admin_tier_role v databázi)', () => {
    for (const r of ['admin', 'sef', 'sladek', 'boss', 'manager', ' Admin ']) expect(smiOtevritMesic(r)).toBe(true);
    for (const r of ['driver', 'user', 'vyroba', '', undefined, null]) expect(smiOtevritMesic(r as any)).toBe(false);
  });
});

describe('nactiUzavreneMesice', () => {
  it('načte a přetypuje řádky', async () => {
    const { select, order } = odpovedTabulky({
      data: [{ id: 'u1', vehicle_name: 'Boxer', month: '2026-10', km_start: '100050', km_end: '100500', km_trasa: '460.7', km_dorovnani: '-10.7', rezim: 'umerne', pocet_jizd: 4, closed_at: '2026-11-02T08:00:00Z', closed_by: null }],
    });
    const v = await nactiUzavreneMesice();
    expect(db.from).toHaveBeenCalledWith('logbook_closures');
    expect(select).toHaveBeenCalledWith('*');
    expect(order).toHaveBeenCalledWith('month', { ascending: false });
    expect(v.dostupne).toBe(true);
    expect(v.mesice).toEqual([{
      id: 'u1', vehicle_name: 'Boxer', month: '2026-10', km_start: 100050, km_end: 100500, km_trasa: 460.7, km_dorovnani: -10.7,
      rezim: 'umerne', pocet_jizd: 4, closed_at: '2026-11-02T08:00:00Z', closed_by: null,
    }]);
  });

  it('neznámý způsob rozpočítání se bere jako rovnoměrný', async () => {
    odpovedTabulky({ data: [{ id: 'u1', vehicle_name: 'B', month: '2026-10', rezim: 'cokoli' }] });
    expect((await nactiUzavreneMesice()).mesice[0].rezim).toBe('rovnomerne');
  });

  it('bez migrace (tabulka neexistuje) je dostupne = false a nic nepadá', async () => {
    odpovedTabulky({ error: { code: 'PGRST205', message: "Could not find the table 'public.logbook_closures' in the schema cache" } });
    expect(await nactiUzavreneMesice()).toEqual({ dostupne: false, mesice: [] });
  });

  it('výpadek spojení migraci nevyvrací — funkce se kvůli němu neschovají', async () => {
    odpovedTabulky({ error: { message: 'Failed to fetch' } });
    expect(await nactiUzavreneMesice()).toEqual({ dostupne: true, mesice: [], chyba: 'Failed to fetch' });
  });
});

describe('ulozDavku', () => {
  it('pošle tři seznamy a vrátí počty', async () => {
    db.rpc.mockResolvedValue({ data: { smazano: 1, upraveno: 2, vlozeno: 3 }, error: null });
    const v = await ulozDavku({
      smazat: ['a'],
      upravit: [{ id: 'b', km_start: 10, km_end: 20 }],
      vlozit: [{ id: 'c', entry_date: '2026-10-05', vehicle_name: 'Boxer' }],
    });
    expect(db.rpc).toHaveBeenCalledWith('kniha_jizd_uloz_davku', {
      p_smazat: ['a'],
      p_upravit: [{ id: 'b', km_start: 10, km_end: 20 }],
      p_vlozit: [{ id: 'c', entry_date: '2026-10-05', vehicle_name: 'Boxer' }],
    });
    expect(v).toEqual({ ok: true, smazano: 1, upraveno: 2, vlozeno: 3 });
  });

  it('prázdná dávka databázi vůbec nevolá', async () => {
    expect(await ulozDavku({})).toEqual({ ok: true, smazano: 0, upraveno: 0, vlozeno: 0 });
    expect(await ulozDavku({ smazat: [], upravit: [], vlozit: [] })).toEqual({ ok: true, smazano: 0, upraveno: 0, vlozeno: 0 });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('chybějící položky se pošlou jako prázdné seznamy', async () => {
    db.rpc.mockResolvedValue({ data: { smazano: 1, upraveno: 0, vlozeno: 0 }, error: null });
    await ulozDavku({ smazat: ['a'] });
    expect(db.rpc).toHaveBeenCalledWith('kniha_jizd_uloz_davku', { p_smazat: ['a'], p_upravit: [], p_vlozit: [] });
  });

  it('chybu databáze (naše česká hláška) vrátí tak, jak je', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'Měsíc 2026-10 auta Boxer je uzavřený — jízdu do něj nejde přidat.' } });
    const v = await ulozDavku({ smazat: ['a'] });
    expect(v).toEqual({ ok: false, chyba: 'Měsíc 2026-10 auta Boxer je uzavřený — jízdu do něj nejde přidat.', chybiMigrace: false });
  });

  it('bez migrace řekne, kde ji spustit', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.kniha_jizd_uloz_davku' } });
    const v = await ulozDavku({ smazat: ['a'] });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.chybiMigrace).toBe(true);
    expect(!v.ok && v.chyba).toMatch(/Systém → Databázové migrace/);
  });
});

describe('ulozDavkuStarymZpusobem (před migrací)', () => {
  function tabulka(o: { insertChyba?: { message: string }; smazano?: number; smazaniChyba?: { message: string } } = {}) {
    const insert = vi.fn().mockResolvedValue({ error: o.insertChyba ?? null });
    const select = vi.fn().mockResolvedValue({ data: Array.from({ length: o.smazano ?? 0 }, (_, i) => ({ id: `s${i}` })), error: o.smazaniChyba ?? null });
    const dotazIn = vi.fn(() => ({ select }));
    const smazat = vi.fn(() => ({ in: dotazIn }));
    db.from.mockReturnValue({ insert, delete: smazat });
    return { insert, smazat, dotazIn, select };
  }

  it('vloží nové jízdy bez nových sloupců a potom smaže staré', async () => {
    const t = tabulka({ smazano: 2 });
    const v = await ulozDavkuStarymZpusobem({
      smazat: ['a', 'b'],
      vlozit: [{ id: 'c', entry_date: '2026-10-05', vehicle_name: 'Boxer', km_start: 1, km_end: 2, km_driven: 1, km_trasa: 1, km_dorovnani: 0, fuel_liters: null }],
    });
    expect(v).toEqual({ ok: true, smazano: 2, upraveno: 0, vlozeno: 1 });
    expect(db.from).toHaveBeenCalledWith('logbook_entries');
    expect(t.insert).toHaveBeenCalledWith([{ id: 'c', entry_date: '2026-10-05', vehicle_name: 'Boxer', km_start: 1, km_end: 2, km_driven: 1, fuel_liters: null }]);
    expect(t.dotazIn).toHaveBeenCalledWith('id', ['a', 'b']);
    // vkládá se první — kdyby selhalo, staré jízdy zůstanou
    expect(t.insert.mock.invocationCallOrder[0]).toBeLessThan(t.smazat.mock.invocationCallOrder[0]);
  });

  it('když se vložení nepovede, nic nemaže', async () => {
    const t = tabulka({ insertChyba: { message: 'Failed to fetch' } });
    const v = await ulozDavkuStarymZpusobem({ smazat: ['a'], vlozit: [{ id: 'c' }] });
    expect(v).toEqual({ ok: false, chyba: 'Failed to fetch', chybiMigrace: false });
    expect(t.smazat).not.toHaveBeenCalled();
  });

  it('smazalo-li se míň záznamů, než mělo (chybí oprávnění), hlásí chybu', async () => {
    tabulka({ smazano: 1 });
    const v = await ulozDavkuStarymZpusobem({ smazat: ['a', 'b'] });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.chyba).toMatch(/Smazalo se jen 1 z 2/);
  });

  it('chybu mazání vrátí', async () => {
    tabulka({ smazaniChyba: { message: 'permission denied' } });
    expect(await ulozDavkuStarymZpusobem({ smazat: ['a'] })).toEqual({ ok: false, chyba: 'permission denied', chybiMigrace: false });
  });

  it('úpravy bez migrace nejdou — odkáže na její spuštění a nic nezapíše', async () => {
    const t = tabulka();
    const v = await ulozDavkuStarymZpusobem({ upravit: [{ id: 'a', km_start: 5 }], vlozit: [{ id: 'c' }] });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.chybiMigrace).toBe(true);
    expect(!v.ok && v.chyba).toMatch(/Systém → Databázové migrace/);
    expect(t.insert).not.toHaveBeenCalled();
  });

  it('prázdná dávka databázi nevolá', async () => {
    expect(await ulozDavkuStarymZpusobem({})).toEqual({ ok: true, smazano: 0, upraveno: 0, vlozeno: 0 });
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('uzavritMesic / otevritMesic', () => {
  const radky = [{ id: 'a', poradi: 1, km_trasa: 80, km_dorovnani: 1, km_driven: 81, km_start: 100, km_end: 181 }];

  it('uzavření pošle parametry funkce', async () => {
    db.rpc.mockResolvedValue({ data: 5, error: null });
    const v = await uzavritMesic({ vozidlo: 'Boxer', mesic: '2026-10', tachometrZacatek: 100, tachometrKonec: 181, rezim: 'rovnomerne', radky });
    expect(db.rpc).toHaveBeenCalledWith('kniha_jizd_uzavrit_mesic', {
      p_vozidlo: 'Boxer', p_mesic: '2026-10', p_tachometr_zacatek: 100, p_tachometr_konec: 181, p_rezim: 'rovnomerne', p_radky: radky,
    });
    expect(v).toEqual({ ok: true, pocet: 5 });
  });

  it('chyba uzavření se vrátí česky', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'Jízdy měsíce se mezitím změnily (někdo je přidal, smazal nebo přesunul).' } });
    const v = await uzavritMesic({ vozidlo: 'Boxer', mesic: '2026-10', tachometrZacatek: 100, tachometrKonec: 181, rezim: 'umerne', radky });
    expect(v).toEqual({ ok: false, chyba: 'Jízdy měsíce se mezitím změnily (někdo je přidal, smazal nebo přesunul).' });
  });

  it('otevření pošle auto a měsíc', async () => {
    db.rpc.mockResolvedValue({ data: 5, error: null });
    expect(await otevritMesic('Boxer', '2026-10')).toEqual({ ok: true, pocet: 5 });
    expect(db.rpc).toHaveBeenCalledWith('kniha_jizd_otevrit_mesic', { p_vozidlo: 'Boxer', p_mesic: '2026-10' });
  });

  it('otevření bez práva vrátí hlášku z databáze', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { message: 'Uzavřený měsíc smí otevřít jen admin, šéf, sládek nebo manažer.' } });
    const v = await otevritMesic('Boxer', '2026-10');
    expect(v.ok).toBe(false);
    expect(!v.ok && v.chyba).toMatch(/jen admin/);
  });

  it('bez migrace odkáže na Databázové migrace', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
    const v = await uzavritMesic({ vozidlo: 'Boxer', mesic: '2026-10', tachometrZacatek: 100, tachometrKonec: 181, rezim: 'umerne', radky });
    expect(!v.ok && v.chyba).toMatch(/Databázové migrace/);
  });
});
