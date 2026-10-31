// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  AKCE, ChybaVstupu, idDokumentu, jeAkce, popisDokumentu, prekladChybyDb, souborKNahrani, stavDokumentu, zacatekObdobi,
} from './vstupy';

const SHA = 'a'.repeat(64);
const soubor = (navic: Record<string, unknown> = {}) => ({ nazev: 'Kunze.pdf', jmeno: 'Kunze.pdf', velikost: 1234, mime: 'application/pdf', sha256: SHA, ...navic });

describe('akce a práva', () => {
  it('čtení pro čtenáře, zápis pro přispěvatele, kapacita a útrata jen pro správce', () => {
    expect(AKCE.dokumenty).toBe('cte');
    expect(AKCE.odkaz).toBe('cte');
    expect(AKCE.zalozit_nahrani).toBe('prispiva');
    expect(AKCE.upravit_popis).toBe('prispiva');
    expect(AKCE.kapacita).toBe('spravuje');
    expect(AKCE.naklady).toBe('spravuje');
    expect(jeAkce('dokumenty')).toBe(true);
    expect(jeAkce('toString')).toBe(false);
    expect(jeAkce('__proto__')).toBe(false);
    expect(jeAkce(undefined)).toBe(false);
  });
});

describe('kontrola vstupů', () => {
  it('id dokumentu jen jako uuid', () => {
    expect(idDokumentu({ id: 'AAAAAAAA-1111-2222-3333-444444444444' })).toBe('aaaaaaaa-1111-2222-3333-444444444444');
    expect(() => idDokumentu({ id: "1' OR '1'='1" })).toThrow(ChybaVstupu);
    expect(() => idDokumentu({})).toThrow(ChybaVstupu);
  });

  it('popis bere jen známá pole', () => {
    const p = popisDokumentu({ nazev: 'Kunze', rok: 2016, oblasti: ['A'], stav: 'hotovo', nahral: 'x', pokusy: 9 });
    expect(p).toEqual({ nazev: 'Kunze', autor: null, vydani: null, rok: 2016, isbn: null, jazyk: null, druh: null, oblasti: ['A'], zdroj: null, licence: null });
    expect(Object.keys(p)).not.toContain('stav');
  });

  it.each([
    [{ nazev: '' }, /Název/],
    [{ nazev: 'x', rok: '2016' }, /Rok/],
    [{ nazev: 'x', rok: 20.5 }, /Rok/],
    [{ nazev: 'x', oblasti: 'A' }, /Oblasti/],
    [{ nazev: 'x', oblasti: ['AAA'] }, /Oblasti/],
    [{ nazev: 'x', autor: 5 }, /Autor/],
    [{ nazev: 'x'.repeat(501) }, /dlouhý/],
    [null, /popis/],
  ])('neplatný popis %j', (vstup, chyba) => {
    expect(() => popisDokumentu(vstup)).toThrow(chyba);
  });

  it('soubor: velikost, otisk a bezpečné jméno', () => {
    expect(souborKNahrani(soubor())).toEqual({
      soubor_nazev: 'Kunze.pdf', soubor_jmeno: 'Kunze.pdf', soubor_velikost: 1234, soubor_mime: 'application/pdf', soubor_sha256: SHA,
    });
    expect(() => souborKNahrani(soubor({ velikost: 0 }))).toThrow(/velikost/);
    expect(() => souborKNahrani(soubor({ velikost: '1234' }))).toThrow(/velikost/);
    expect(() => souborKNahrani(soubor({ sha256: 'A'.repeat(64) }))).toThrow(/SHA-256/);
    expect(() => souborKNahrani(soubor({ jmeno: '../auth/x.pdf' }))).toThrow(/jméno/);
    expect(() => souborKNahrani(soubor({ jmeno: '..' }))).toThrow(/jméno/);
    expect(() => souborKNahrani(soubor({ jmeno: 'a b.pdf' }))).toThrow(/jméno/);
    expect(() => souborKNahrani(soubor({ mime: undefined }))).toThrow(/Typ/);
  });

  it('stav ručně jen „čeká" nebo „pozastaveno"', () => {
    expect(stavDokumentu('ceka')).toBe('ceka');
    expect(stavDokumentu('pozastaveno')).toBe('pozastaveno');
    expect(() => stavDokumentu('hotovo')).toThrow(ChybaVstupu);
  });

  it('začátek období útraty', () => {
    const ted = new Date('2026-10-31T12:00:00Z');
    expect(zacatekObdobi('2026-10-01T00:00:00.000Z', ted)).toBe('2026-10-01T00:00:00.000Z');
    expect(() => zacatekObdobi('včera', ted)).toThrow(ChybaVstupu);
    expect(() => zacatekObdobi('1900-01-01', ted)).toThrow(/rozsah/);
    expect(() => zacatekObdobi(5, ted)).toThrow(ChybaVstupu);
  });
});

describe('překlad chyb databáze', () => {
  it.each([
    ['PGRST205', 503, 'bez_migrace'],
    ['PGRST202', 503, 'bez_migrace'],
    ['42P01', 503, 'bez_migrace'],
    ['42501', 403, 'zakazano'],
    ['23505', 409, 'duplicita'],
    ['54000', 413, 'velky_soubor'],
    ['22023', 400, 'neplatny_vstup'],
    ['23514', 400, 'neplatny_vstup'],
    ['XX000', 500, 'chyba'],
  ])('%s → %i %s', (code, status, kod) => {
    expect(prekladChybyDb({ code, message: 'zpráva' })).toMatchObject({ status, kod });
  });
  it('migrace chybí → rada, kde ji spustit', () => {
    expect(prekladChybyDb({ code: 'PGRST205' }).zprava).toMatch(/Databáze bible/);
  });
  it('neznámá chyba neprozradí text z databáze', () => {
    expect(prekladChybyDb({ code: 'XX000', message: 'tajný řádek' }).zprava).not.toMatch(/tajný/);
    expect(prekladChybyDb(null)).toMatchObject({ status: 500 });
  });
});
