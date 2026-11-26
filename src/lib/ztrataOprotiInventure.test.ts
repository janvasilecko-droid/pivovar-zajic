// Rozdíl oproti inventuře za měsíc, jen bokem (majitel 26. 11. 2026). Data i jména jsou vymyšlená.
import { describe, it, expect } from 'vitest';
import { ztrataOprotiInventure, type ZaznamKontroly } from './ztrataOprotiInventure';

const PIVA = [{ id: 'sv', name: '12° Světlá' }, { id: 'os', name: 'Osma' }];
const OBALY = [{ id: 'l1', label: '1l' }, { id: 'k50', label: 'KEG 50l' }];
const posun = (iso: string, dny: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + dny * 86_400_000).toISOString().slice(0, 10);
/** Týdenní kontrola: pondělí je o šest dní před nedělí (`tyden_do`), jako v databázi. */
const z = (tyden_do: string, beer_id: string, package_id: string, rozdil: number | string | null, vyreseno: string | null = 'ponechano'): ZaznamKontroly =>
  ({ tyden_od: posun(tyden_do, -6), tyden_do, beer_id, package_id, rozdil, vyreseno });
const vypocet = (zaznamy: ZaznamKontroly[], mesic = '2026-11') => ztrataOprotiInventure(zaznamy, mesic, PIVA, OBALY);

describe('ztrataOprotiInventure — součet rozdílů týdenních kontrol za měsíc', () => {
  it('sečte rozdíly po položce, ztráty jsou záporné, největší nahoře', () => {
    const v = vypocet([
      z('2026-11-08', 'os', 'l1', -23), z('2026-11-15', 'os', 'l1', -4),
      z('2026-11-08', 'sv', 'k50', -1), z('2026-11-15', 'sv', 'l1', 5),
    ]);
    expect(v.radky.map((r) => [r.beer_name, r.package_label, r.rozdil, r.tydnu])).toEqual([
      ['Osma', '1l', -27, 2],
      ['12° Světlá', 'KEG 50l', -1, 1],
      ['12° Světlá', '1l', 5, 1],
    ]);
    expect(v.ztrata).toBe(-28);
    expect(v.prebytek).toBe(5);
    expect(v.kontrol).toBe(4);
  });

  it('týden patří do měsíce podle neděle', () => {
    const zaznamy = [z('2026-11-01', 'os', 'l1', -9), z('2026-11-29', 'os', 'l1', -2), z('2026-12-06', 'os', 'l1', -7)];
    expect(vypocet(zaznamy, '2026-11').ztrata).toBe(-11);
    expect(vypocet(zaznamy, '2026-12').ztrata).toBe(-7);
    expect(vypocet(zaznamy, '2026-10').radky).toEqual([]);
  });

  it('rozdíl vyřešený dopsáním stáčení ztráta není; dorovnaný i ponechaný ano', () => {
    const v = vypocet([z('2026-11-08', 'os', 'l1', -5, 'staceni'), z('2026-11-15', 'os', 'l1', -3, 'dorovnani'), z('2026-11-22', 'os', 'l1', -2, null)]);
    expect(v.radky[0].rozdil).toBe(-5);
    expect(v.kontrol).toBe(3);
  });

  it('plus a minus ve stejné položce se vyruší a řádek zmizí; kontrola se přesto počítá', () => {
    const v = vypocet([z('2026-11-08', 'os', 'l1', -4), z('2026-11-15', 'os', 'l1', 4)]);
    expect(v.radky).toEqual([]);
    expect(v).toMatchObject({ ztrata: 0, prebytek: 0, kontrol: 2 });
  });

  it('nula, text a prázdné pole jsou bez rozdílu; chybějící pivo nebo obal se přeskočí; rozdíl jako text se přečte', () => {
    const v = vypocet([
      z('2026-11-08', 'os', 'l1', 0), z('2026-11-08', 'os', 'k50', null), z('2026-11-08', 'sv', 'l1', 'abc'),
      { tyden_do: '2026-11-08', beer_id: null, package_id: 'l1', rozdil: -9 },
      z('2026-11-15', 'sv', 'k50', '-6'),
    ]);
    expect(v.radky.map((r) => [r.beer_name, r.rozdil])).toEqual([['12° Světlá', -6]]);
  });

  it('žádná uložená kontrola → prázdný výsledek s nulovým počtem kontrol', () => {
    expect(vypocet([])).toEqual({ radky: [], ztrata: 0, prebytek: 0, kontrol: 0 });
  });

  it('neznámé pivo nebo obal dostane popisek místo pádu', () => {
    const v = ztrataOprotiInventure([z('2026-11-08', 'xx', 'yy', -1)], '2026-11', [], []);
    expect(v.radky[0]).toMatchObject({ beer_name: 'Neznámé pivo', package_label: '' });
  });
});
