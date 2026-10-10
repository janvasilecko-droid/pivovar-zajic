// Odznak Obchodu na ploše načítá JEN data od poslední inventury — musí ale vyjít
// stejně, jako kdyby se spočítala nad celou historií (10. 10. 2026).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

type Radek = Record<string, any>;
const db: Record<string, Radek[]> = {};
/** Co se z databáze opravdu vyžádalo: tabulka → seznam filtrů. */
const dotazy: { tabulka: string; filtry: string[] }[] = [];

vi.mock('./supabase', () => ({
  useRealtime: () => {},
  fetchAllRows: (tabulka: string) => {
    let radky = [...(db[tabulka] ?? [])];
    const zaznam = { tabulka, filtry: [] as string[] };
    dotazy.push(zaznam);
    const b: any = {
      gt: (c: string, v: any) => { zaznam.filtry.push(`${c}>${v}`); radky = radky.filter((r) => r[c] > v); return b; },
      in: (c: string, vals: any[]) => { zaznam.filtry.push(`${c} in [${vals.join(',')}]`); radky = radky.filter((r) => vals.includes(r[c])); return b; },
      order: () => b,
      then: (res: any, rej: any) => Promise.resolve({ data: radky, error: null }).then(res, rej),
    };
    return b;
  },
}));
vi.mock('./businessDate', () => ({ businessDateISO: () => '2026-10-10' }));

import { useObchodUpozorneni } from './useObchodUpozorneni';
import { spoctiUpozorneni } from './obchodUpozorneni';

function naplnDb() {
  db.obchod_zbozi = [
    { kod: 'A', nazev: 'Pivo A', beer_id: 'b1', package_id: 'p1', min_ks: 10, aktivni: true },
    { kod: 'B', nazev: 'Limo', beer_id: null, package_id: null, min_ks: 5, aktivni: true },
  ];
  db.obchod_inventura = [
    { kod: 'A', datum: '2026-08-31', napocitano: 500 }, // stará inventura — nahrazená
    { kod: 'A', datum: '2026-09-30', napocitano: 20 },
    { kod: 'B', datum: '2026-09-30', napocitano: 9 },
  ];
  db.obchod_uzaverky = [
    { id: 'u-stara', datum_od: '2026-08-01', datum_do: '2026-09-30', stredisko: '2' },
    { id: 'u1', datum_od: '2026-10-01', datum_do: '2026-10-04', stredisko: '2' },
    // 5. 10. chybí (6. 10. je zavřeno), 9. 10. (včerejšek) chybí taky:
    { id: 'u2', datum_od: '2026-10-07', datum_do: '2026-10-08', stredisko: '2' },
  ];
  db.obchod_uzaverky_radky = [
    { uzaverka_id: 'u-stara', kod: 'A', mnozstvi: 400 },
    { uzaverka_id: 'u1', kod: 'A', mnozstvi: 9 },
    { uzaverka_id: 'u1', kod: 'B', mnozstvi: 3 },
    { uzaverka_id: 'u2', kod: 'A', mnozstvi: 4 },
  ];
  db.fasovani_private = [
    { beer_id: 'b1', package_id: 'p1', quantity: 100, entry_date: '2026-09-01' }, // před poslední inventurou
    { beer_id: 'b1', package_id: 'p1', quantity: 2, entry_date: '2026-10-02' },
    { beer_id: 'b9', package_id: 'p9', quantity: 6, entry_date: '2026-10-03' }, // pivo, ke kterému chybí zboží
  ];
  db.obchod_prijem = [{ kod: 'B', datum: '2026-10-02', mnozstvi: 1 }, { kod: 'B', datum: '2026-09-05', mnozstvi: 50 }];
  db.obchod_odpis = [{ kod: 'B', datum: '2026-10-05', mnozstvi: 3, duvod: 'rozbite' }];
  db.obchod_zavreno = [{ datum: '2026-10-06' }];
}

beforeEach(() => {
  vi.useFakeTimers();
  for (const k of Object.keys(db)) delete db[k];
  dotazy.length = 0;
  naplnDb();
});
afterEach(() => { vi.useRealTimers(); });

async function nactiOdznak(povoleno = true) {
  const { result } = renderHook(() => useObchodUpozorneni(povoleno));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  return { result, dotazy };
}

describe('useObchodUpozorneni', () => {
  it('vyjde stejně jako výpočet nad celou historií', async () => {
    const { result } = await nactiOdznak();
    const celyVstup = {
      zbozi: db.obchod_zbozi as any,
      fasovani: db.fasovani_private as any,
      prijmy: db.obchod_prijem as any,
      odpisy: db.obchod_odpis as any,
      uzaverky: db.obchod_uzaverky as any,
      radky: db.obchod_uzaverky_radky as any,
      inventury: db.obchod_inventura as any,
    };
    const ocekavano = spoctiUpozorneni(celyVstup, db.obchod_zavreno as any, '2026-10-10');
    expect(result.current).toEqual(ocekavano);
    // A není to prázdné číslo: A = 20 + 2 − 9 − 4 = 9 (pod minimem 10), B = 9 + 1 − 3 − 3 odpis = 4 (pod minimem 5; bez odpisu by bylo 7), fasování bez zboží, dvě mezery (5. a 9. 10.).
    expect(result.current).toMatchObject({ zasoby: 2, fasovaniBezZbozi: 1, mezery: 2 });
  });

  it('nestahuje starou historii: jen řádky uzávěrek, příjmů a odpisů po nejstarší z posledních inventur', async () => {
    await nactiOdznak();
    const radkyDotaz = dotazy.find((d) => d.tabulka === 'obchod_uzaverky_radky')!;
    expect(radkyDotaz.filtry.join(' ')).toContain('u1');
    expect(radkyDotaz.filtry.join(' ')).not.toContain('u-stara');
    expect(dotazy.find((d) => d.tabulka === 'obchod_prijem')!.filtry).toEqual(['datum>2026-09-30']);
    expect(dotazy.find((d) => d.tabulka === 'obchod_odpis')!.filtry).toEqual(['datum>2026-09-30']);
    // fasování od PRVNÍ inventury (kvůli „fasování bez zboží"), ne od všeho
    expect(dotazy.find((d) => d.tabulka === 'fasovani_private')!.filtry).toEqual(['entry_date>2026-08-31']);
  });

  it('komu je dlaždice skrytá nebo ji nesmí vidět, nic se nenačítá', async () => {
    const { result } = await nactiOdznak(false);
    expect(result.current).toBeNull();
    expect(dotazy).toEqual([]);
  });

  it('bez inventur se řádky uzávěrek nestahují vůbec (není od čeho počítat sklad) a mezery se hlídají dál', async () => {
    db.obchod_inventura = [];
    const { result } = await nactiOdznak();
    expect(dotazy.some((d) => d.tabulka === 'obchod_uzaverky_radky')).toBe(false);
    expect(result.current).toMatchObject({ zasoby: 0, fasovaniBezZbozi: 0, inventura: false });
    expect(result.current!.mezery).toBe(2);
  });
});
