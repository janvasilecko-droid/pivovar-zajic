// ✏️ Provedení úprav z tabulky přehledu stáčení (lib/upravyStaceni.ts).
// Co se má zapsat, hlídají testy plánů (prehledStaceniTabulka.test.ts); tady se
// kontroluje, že se plán skutečně provede: správný příkaz do databáze, seznam
// na obrazovce, hlášení chyb, „Vrátit zpět" a kontrola podezřelého čísla.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntryRow, Package } from './supabase';

const h = vi.hoisted(() => {
  type Operace = { typ: 'update' | 'delete' | 'insert'; tabulka: string; zmena?: any; ids?: string[]; radky?: any[] };
  return {
    operace: [] as Operace[],
    /** Co vrátí databáze při dalším zápisu (null = povede se). */
    chybaDb: null as { message: string } | null,
    /** Co vrátí `insert(...).select('*')`. */
    vraceneRadky: null as any[] | null,
    /** Doběhne těsně před odpovědí na insert (např. rychlejší přenačtení seznamu). */
    predOdpovedi: null as (() => void) | null,
    toastZpet: vi.fn(),
    chyba: vi.fn(),
    potvrd: vi.fn(),
    zavibruj: vi.fn(),
  };
});

vi.mock('./supabase', () => {
  const retez = (op: any) => {
    const c: any = Promise.resolve({ data: null, error: h.chybaDb });
    c.in = vi.fn((_k: string, ids: string[]) => { op.ids = ids; return c; });
    c.eq = vi.fn((_k: string, id: string) => { op.ids = [id]; return c; });
    return c;
  };
  return {
    supabase: {
      from: vi.fn((tabulka: string) => ({
        update: vi.fn((zmena: any) => { const op = { typ: 'update' as const, tabulka, zmena }; h.operace.push(op); return retez(op); }),
        delete: vi.fn(() => { const op = { typ: 'delete' as const, tabulka }; h.operace.push(op); return retez(op); }),
        insert: vi.fn((radky: any) => {
          const op = { typ: 'insert' as const, tabulka, radky: Array.isArray(radky) ? radky : [radky] };
          h.operace.push(op);
          const c: any = Promise.resolve({ data: null, error: h.chybaDb });
          c.select = vi.fn(() => { h.predOdpovedi?.(); return Promise.resolve({ data: h.vraceneRadky, error: h.chybaDb }); });
          return c;
        }),
      })),
    },
  };
});
vi.mock('./toast', () => ({ chyba: h.chyba, potvrd: h.potvrd, toastZpet: h.toastZpet }));
vi.mock('./haptika', () => ({ zavibruj: h.zavibruj }));

import { supabase } from './supabase';
import { davkyStaceni } from './prehledStaceni';
import { radkyDavky, type RadekTabulky } from './prehledStaceniTabulka';
import { upravyStaceni } from './upravyStaceni';

const OBALY = [
  { id: 'l15', code: 'l15', kind: 'bottle', volume_l: 1.5, label: '1.5l', sort_order: 1 },
  { id: 'l1', code: 'l1', kind: 'bottle', volume_l: 1, label: '1l', sort_order: 2 },
  { id: 'l05', code: 'l05', kind: 'bottle', volume_l: 0.5, label: '0.5l', sort_order: 3 },
  { id: 'k50', code: 'k50', kind: 'keg', volume_l: 50, label: '50l', sort_order: 4 },
  { id: 'k30', code: 'k30', kind: 'keg', volume_l: 30, label: '30l', sort_order: 5 },
] as Package[];
const PIVA = [
  { id: 'b12', name: '12° Světlá' },
  { id: 'bj', name: 'Jantar' },
] as any[];

const zaznam = (o: Partial<EntryRow> & { id: string }): EntryRow => ({
  entry_date: '2026-10-12', beer_id: 'b12', beer_name: '12° Světlá', package_id: 'l1', package_label: '1l',
  quantity: 10, note: null, created_at: '2026-10-12T08:00:00+00:00',
  kegs_used: 2, kegs_used_package_id: 'k50', source_volume_l: 100,
  ...o,
});
const objem = (id: string | null) => Number(OBALY.find((p) => p.id === id)?.volume_l) || 0;
const getBatchId = (r: EntryRow) => `${r.entry_date}_${r.beer_id}_${r.created_at.slice(0, 19)}_${r.kegs_used_package_id ?? ''}`;

const SARZE = [
  zaznam({ id: 'a', package_id: 'l15', quantity: 30 }),
  zaznam({ id: 'b', package_id: 'l1', quantity: 44 }),
];

/** Obrazovka v malém: seznam v „stavu" a hook nad ním. */
function nastav(pocatek: EntryRow[], opts: { piva?: any[] } = {}) {
  let rows = pocatek;
  const setRows = vi.fn((u: any) => { rows = typeof u === 'function' ? u(rows) : u; });
  const nacti = vi.fn();
  const sestav = () => upravyStaceni({ rows, setRows, packages: OBALY, beers: opts.piva ?? PIVA, getBatchId, nacti });
  const radky = (): RadekTabulky[] =>
    davkyStaceni(rows.filter((r) => r.quantity > 0), objem).flatMap((d) => radkyDavky(d, OBALY, getBatchId));
  const radek = (i = 0): RadekTabulky => radky()[i];
  /** Řádek tabulky, ve kterém je záznam s tímhle id. */
  const radekSId = (id: string): RadekTabulky => radky().find((r) => r.zaznamy.some((z) => z.id === id))!;
  return { aktualni: () => rows, setRows, nacti, radek, radekSId, uprava: () => sestav() };
}

beforeEach(() => {
  h.operace.length = 0;
  h.chybaDb = null;
  h.vraceneRadky = null;
  h.predOdpovedi = null;
  h.toastZpet.mockReset();
  h.chyba.mockReset();
  h.potvrd.mockReset();
  h.potvrd.mockResolvedValue(true);
  h.zavibruj.mockReset();
  vi.mocked(supabase.from).mockClear();
});

describe('upravLahve', () => {
  it('přepíše počet: jeden update jen toho záznamu a nové číslo v seznamu', async () => {
    const t = nastav(SARZE);
    const ok = await t.uprava().upravLahve(t.radek(), 1, '40');
    expect(ok).toBe(true);
    expect(h.operace).toEqual([{ typ: 'update', tabulka: 'bottling', zmena: { quantity: 40 }, ids: ['b'] }]);
    expect(t.aktualni().find((r) => r.id === 'b')?.quantity).toBe(40);
    expect(t.aktualni().find((r) => r.id === 'a')?.quantity).toBe(30);
    expect(h.chyba).not.toHaveBeenCalled();
  });

  it('stejné číslo nezapíše nic', async () => {
    const t = nastav(SARZE);
    expect(await t.uprava().upravLahve(t.radek(), 1, '44')).toBe(true);
    expect(h.operace).toEqual([]);
  });

  it('chyba databáze: ohlásí se, seznam se nezmění, vrací false', async () => {
    h.chybaDb = { message: 'síť spadla' };
    const t = nastav(SARZE);
    expect(await t.uprava().upravLahve(t.radek(), 1, '40')).toBe(false);
    expect(h.chyba).toHaveBeenCalledWith('Uložení se nepovedlo: síť spadla');
    expect(t.setRows).not.toHaveBeenCalled();
    expect(t.aktualni().find((r) => r.id === 'b')?.quantity).toBe(44);
  });

  it('neplatné číslo se do databáze vůbec nedostane', async () => {
    const t = nastav(SARZE);
    for (const text of ['4,5', 'abc', '-3']) {
      expect(await t.uprava().upravLahve(t.radek(), 1, text)).toBe(false);
    }
    expect(h.operace).toEqual([]);
    expect(h.chyba).toHaveBeenCalledTimes(3);
    expect(String(h.chyba.mock.calls[0][0])).toMatch(/celé číslo/);
  });

  it('nula smaže záznam a nabídne „Vrátit zpět", které ho vrátí i s původním id', async () => {
    const t = nastav(SARZE);
    expect(await t.uprava().upravLahve(t.radek(), 1, '0')).toBe(true);
    expect(h.operace).toEqual([{ typ: 'delete', tabulka: 'bottling', ids: ['b'] }]);
    expect(t.aktualni().map((r) => r.id)).toEqual(['a']);
    expect(h.zavibruj).toHaveBeenCalled();
    expect(h.toastZpet).toHaveBeenCalledTimes(1);
    expect(h.toastZpet.mock.calls[0][0]).toMatch(/Smazáno: 12° Světlá · 1 L × 44 ks/);

    h.operace.length = 0;
    await h.toastZpet.mock.calls[0][1]();
    expect(h.operace).toEqual([{ typ: 'insert', tabulka: 'bottling', radky: [SARZE[1]] }]);
    expect(t.aktualni().map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(t.nacti).toHaveBeenCalledWith(true);
  });

  it('„Vrátit zpět", které databáze odmítne, vyhodí chybu (toastZpet ji ohlásí)', async () => {
    const t = nastav(SARZE);
    await t.uprava().upravLahve(t.radek(), 1, '');
    h.chybaDb = { message: 'nejde' };
    await expect(h.toastZpet.mock.calls[0][1]()).rejects.toMatchObject({ message: 'nejde' });
    expect(t.aktualni().map((r) => r.id)).toEqual(['a']); // zpět se nepovedlo → seznam zůstal
  });

  it('smazání se nepovedlo: záznam v seznamu zůstává a žádné „zpět" se nenabízí', async () => {
    h.chybaDb = { message: 'zamčeno' };
    const t = nastav(SARZE);
    expect(await t.uprava().upravLahve(t.radek(), 1, '0')).toBe(false);
    expect(h.chyba).toHaveBeenCalledWith('Smazání se nepovedlo: zamčeno');
    expect(t.aktualni()).toHaveLength(2);
    expect(h.toastZpet).not.toHaveBeenCalled();
  });

  it('nová velikost lahví vloží záznam do téže šarže a seznam se přenačte', async () => {
    const vlozeny = { ...SARZE[0], id: 'novy', package_id: 'l05', package_label: '0.5l', quantity: 20 };
    h.vraceneRadky = [vlozeny];
    const t = nastav(SARZE);
    expect(await t.uprava().upravLahve(t.radek(), 0.5, '20')).toBe(true);
    expect(h.operace).toHaveLength(1);
    expect(h.operace[0].typ).toBe('insert');
    expect(h.operace[0].radky).toEqual([{
      entry_date: '2026-10-12', beer_id: 'b12', beer_name: '12° Světlá', package_id: 'l05', package_label: '0.5l',
      quantity: 20, kegs_used: 2, kegs_used_package_id: 'k50', source_volume_l: 100, note: null,
      created_at: '2026-10-12T08:00:00+00:00',
    }]);
    expect(t.aktualni().map((r) => r.id)).toContain('novy');
    expect(t.nacti).toHaveBeenCalledWith(true);
  });

  it('odpověď na insert přišla až po přenačtení seznamu: nový záznam se nezdvojí', async () => {
    const vlozeny = { ...SARZE[0], id: 'novy', package_id: 'l05', package_label: '0.5l', quantity: 20 };
    h.vraceneRadky = [vlozeny];
    const t = nastav(SARZE);
    h.predOdpovedi = () => t.setRows((rs: EntryRow[]) => [...rs, vlozeny]); // realtime přenačtení bylo rychlejší
    await t.uprava().upravLahve(t.radek(), 0.5, '20');
    expect(t.aktualni().filter((r) => r.id === 'novy')).toHaveLength(1);
  });

  it('chyba při vkládání: ohlásí se a seznam se nemění', async () => {
    h.chybaDb = { message: 'duplicita' };
    const t = nastav(SARZE);
    expect(await t.uprava().upravLahve(t.radek(), 0.5, '20')).toBe(false);
    expect(h.chyba).toHaveBeenCalledWith('Uložení se nepovedlo: duplicita');
    expect(t.setRows).not.toHaveBeenCalled();
    expect(t.nacti).not.toHaveBeenCalled();
  });

  describe('podezřelé číslo (přehmat o řád)', () => {
    // pět dřívějších stáčení téhož piva a obalu po 10 ks → obvykle 10
    const HISTORIE = ['h1', 'h2', 'h3', 'h4', 'h5'].map((id, i) =>
      zaznam({ id, package_id: 'l1', quantity: 10, kegs_used: null, kegs_used_package_id: null, source_volume_l: null, created_at: `2026-09-0${i + 1}T08:00:00+00:00`, entry_date: `2026-09-0${i + 1}` }));
    const SOUCASNE = [zaznam({ id: 'x', package_id: 'l1', quantity: 10 })];

    it('zeptá se, a po „ne" nezapíše nic', async () => {
      h.potvrd.mockResolvedValue(false);
      const t = nastav([...HISTORIE, ...SOUCASNE]);
      expect(await t.uprava().upravLahve(t.radekSId('x'), 1, '100')).toBe(false);
      expect(h.potvrd).toHaveBeenCalledTimes(1);
      expect(h.potvrd.mock.calls[0][0]).toMatch(/12° Světlá · 1 L: zadáno 100 ks/);
      expect(h.potvrd.mock.calls[0][1]).toMatchObject({ titulek: 'Zkontrolujte množství' });
      expect(h.operace).toEqual([]);
    });

    it('po „ano" zapíše', async () => {
      const t = nastav([...HISTORIE, ...SOUCASNE]);
      expect(await t.uprava().upravLahve(t.radekSId('x'), 1, '100')).toBe(true);
      expect(h.potvrd).toHaveBeenCalledTimes(1);
      expect(h.operace).toHaveLength(1);
      expect(h.operace[0].zmena).toEqual({ quantity: 100 });
    });

    it('obvyklé číslo se na nic neptá', async () => {
      const t = nastav([...HISTORIE, ...SOUCASNE]);
      await t.uprava().upravLahve(t.radekSId('x'), 1, '12');
      expect(h.potvrd).not.toHaveBeenCalled();
    });

    it('smazání (nula) se na nic neptá', async () => {
      const t = nastav([...HISTORIE, ...SOUCASNE]);
      await t.uprava().upravLahve(t.radekSId('x'), 1, '0');
      expect(h.potvrd).not.toHaveBeenCalled();
    });

    it('historie jiného piva se nepočítá', async () => {
      const jinePivo = HISTORIE.map((z) => ({ ...z, id: `${z.id}-j`, beer_id: 'bj', beer_name: 'Jantar' }));
      const t = nastav([...jinePivo, ...SOUCASNE]);
      await t.uprava().upravLahve(t.radekSId('x'), 1, '100');
      expect(h.potvrd).not.toHaveBeenCalled();
    });

    it('historie jiného obalu se nepočítá', async () => {
      // pět záznamů po 10 ks, ale u 1,5 l — pro 1 l žádná historie není → neptá se
      const jinyObal = HISTORIE.map((z) => ({ ...z, id: `${z.id}-x`, package_id: 'l15' }));
      const t = nastav([...jinyObal, ...SOUCASNE]);
      await t.uprava().upravLahve(t.radekSId('x'), 1, '100');
      expect(h.potvrd).not.toHaveBeenCalled();
    });
  });
});

describe('upravSudy', () => {
  it('změní počet sudů na všech záznamech šarže včetně zdrojového objemu', async () => {
    const t = nastav(SARZE);
    expect(await t.uprava().upravSudy(t.radek(), 50, '3')).toBe(true);
    expect(h.operace).toEqual([{
      typ: 'update', tabulka: 'bottling', zmena: { kegs_used: 3, kegs_used_package_id: 'k50', source_volume_l: 150 }, ids: ['a', 'b'],
    }]);
    expect(t.aktualni().every((r) => r.kegs_used === 3 && r.source_volume_l === 150)).toBe(true);
  });

  it('přesun do jiné velikosti změní obal sudu na všech záznamech', async () => {
    const t = nastav(SARZE);
    await t.uprava().upravSudy(t.radek(), 30, '2');
    expect(h.operace[0].zmena).toEqual({ kegs_used: 2, kegs_used_package_id: 'k30', source_volume_l: 60 });
    expect(t.aktualni().every((r) => r.kegs_used_package_id === 'k30')).toBe(true);
  });

  it('i skrytý záznam šarže (oprava z inventury) se změní s ostatními', async () => {
    const skryty = zaznam({ id: 'skryty', package_id: 'l05', quantity: -4 });
    const t = nastav([...SARZE, skryty]);
    await t.uprava().upravSudy(t.radek(), 50, '3');
    expect([...(h.operace[0].ids ?? [])].sort()).toEqual(['a', 'b', 'skryty']);
    expect(t.aktualni().find((r) => r.id === 'skryty')?.kegs_used).toBe(3);
  });

  it('nula odebere sudy, ale nechá velikost', async () => {
    const t = nastav(SARZE);
    await t.uprava().upravSudy(t.radek(), 50, '0');
    expect(h.operace[0].zmena).toEqual({ kegs_used: null, source_volume_l: null });
    expect(t.aktualni().every((r) => r.kegs_used === null && r.kegs_used_package_id === 'k50')).toBe(true);
  });

  it('kolize velikosti u druhé šarže téže dávky je chyba a nic se nezapíše', async () => {
    const t = nastav([
      zaznam({ id: 'a', package_id: 'l05', quantity: 10, kegs_used: 1, kegs_used_package_id: 'k30', source_volume_l: 30 }),
      zaznam({ id: 'b', package_id: 'l1', quantity: 47, kegs_used: 1, kegs_used_package_id: 'k50', source_volume_l: 50 }),
    ]);
    const r30 = t.radekSId('a');
    expect(await t.uprava().upravSudy(r30, 50, '1')).toBe(false);
    expect(h.operace).toEqual([]);
    expect(String(h.chyba.mock.calls[0][0])).toMatch(/už má sud této velikosti/);
  });

  it('chyba databáze: ohlásí se a seznam zůstane', async () => {
    h.chybaDb = { message: 'bum' };
    const t = nastav(SARZE);
    expect(await t.uprava().upravSudy(t.radek(), 50, '3')).toBe(false);
    expect(h.chyba).toHaveBeenCalledWith('Uložení se nepovedlo: bum');
    expect(t.aktualni().every((r) => r.kegs_used === 2)).toBe(true);
  });

  it('podezřelé číslo se u sudů neptá (to je jen u lahví)', async () => {
    const t = nastav(SARZE);
    await t.uprava().upravSudy(t.radek(), 50, '40');
    expect(h.potvrd).not.toHaveBeenCalled();
  });
});

describe('smazRadek', () => {
  it('smaže všechny záznamy řádku jedním příkazem a nabídne vrácení všech zpět', async () => {
    const jina = zaznam({ id: 'jina', package_id: 'l05', quantity: 20, created_at: '2026-10-12T10:00:00+00:00' });
    const t = nastav([...SARZE, jina]);
    expect(await t.uprava().smazRadek(t.radek(0))).toBe(true);
    expect(h.operace).toEqual([{ typ: 'delete', tabulka: 'bottling', ids: ['a', 'b'] }]);
    expect(t.aktualni().map((r) => r.id)).toEqual(['jina']);
    expect(h.toastZpet.mock.calls[0][0]).toBe('Smazáno: 12° Světlá (2 záznamy)');

    h.operace.length = 0;
    await h.toastZpet.mock.calls[0][1]();
    expect(h.operace).toEqual([{ typ: 'insert', tabulka: 'bottling', radky: [SARZE[0], SARZE[1]] }]);
    expect(t.aktualni().map((r) => r.id).sort()).toEqual(['a', 'b', 'jina']);
  });

  it('chyba databáze: záznamy zůstávají', async () => {
    h.chybaDb = { message: 'nelze' };
    const t = nastav(SARZE);
    expect(await t.uprava().smazRadek(t.radek())).toBe(false);
    expect(t.aktualni()).toHaveLength(2);
    expect(h.toastZpet).not.toHaveBeenCalled();
  });
});

describe('upravDatumPivo', () => {
  it('přesune všechny záznamy šarže na jiný den a k jinému pivu', async () => {
    const t = nastav(SARZE);
    expect(await t.uprava().upravDatumPivo(t.radek(), { datum: '2026-10-13', beerId: 'bj' })).toBe(true);
    expect(h.operace).toEqual([{
      typ: 'update', tabulka: 'bottling', zmena: { entry_date: '2026-10-13', beer_id: 'bj', beer_name: 'Jantar' }, ids: ['a', 'b'],
    }]);
    expect(t.aktualni().every((r) => r.entry_date === '2026-10-13' && r.beer_id === 'bj' && r.beer_name === 'Jantar')).toBe(true);
  });

  it('neznámé pivo nebo špatné datum je chyba bez zápisu', async () => {
    const t = nastav(SARZE);
    expect(await t.uprava().upravDatumPivo(t.radek(), { datum: '2026-10-13', beerId: 'neni' })).toBe(false);
    expect(await t.uprava().upravDatumPivo(t.radek(), { datum: '2026-02-31', beerId: 'b12' })).toBe(false);
    expect(h.operace).toEqual([]);
    expect(h.chyba).toHaveBeenCalledTimes(2);
  });

  it('chyba databáze vrací false', async () => {
    h.chybaDb = { message: 'ne' };
    const t = nastav(SARZE);
    expect(await t.uprava().upravDatumPivo(t.radek(), { datum: '2026-10-13', beerId: 'bj' })).toBe(false);
    expect(t.aktualni().every((r) => r.entry_date === '2026-10-12')).toBe(true);
  });
});
