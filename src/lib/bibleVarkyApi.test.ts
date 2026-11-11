import { describe, it, expect, vi, beforeEach } from 'vitest';

type Volani = { funkce: string; telo: Record<string, unknown> };
const volani: Volani[] = [];
let odpoved: unknown = null;

vi.mock('./bibleKlient', async (puvodni) => ({
  ...(await puvodni<typeof import('./bibleKlient')>()),
  volejBibli: vi.fn(async (funkce: string, telo: Record<string, unknown>) => {
    volani.push({ funkce, telo });
    return odpoved;
  }),
}));

import {
  chybaVarky, cisloSRozsahem, hodnotyKOdeslani, nactiVarky, recepturaKOdeslani, smazVarku, ulozRecepturu, ulozVarku,
  type RecepturaVstup, type VarkaVstup,
} from './bibleVarkyApi';

const REC = 'aaaaaaaa-1111-2222-3333-444444444444';
const VAR = 'bbbbbbbb-1111-2222-3333-444444444444';
const PIV = 'cccccccc-1111-2222-3333-444444444444';
beforeEach(() => { volani.length = 0; });

const varka = (navic: Partial<VarkaVstup> = {}): VarkaVstup => ({
  recepturaId: REC, pivovarId: PIV, cislo: ' 12 ', pivo: ' Ležák ', datumVaru: '2026-11-03', hodnoty: { mladina_p: '11,3', sypani_kg: ' 180 ', pivo_ibu: '' }, poznamka: '', ...navic,
});
const receptura = (navic: Partial<RecepturaVstup> = {}): RecepturaVstup => ({
  pivovarId: null, nazev: ' Ležák ', styl: '', cilObjem: '10', cilStupnovitost: '11,2', cilAlkohol: '', cilIbu: '', cilBarva: '',
  suroviny: [{ druh: 'slad', nazev: 'Plzeňský', mnozstvi: '180', jednotka: 'kg', kdy: '', poznamka: '' }, { druh: 'chmel', nazev: ' ', mnozstvi: '', jednotka: 'g', kdy: '', poznamka: '' }],
  kroky: [{ faze: 'rmutovani', nazev: 'Nástřik', teplota: '52', minut: '15', poznamka: '' }, { faze: 'rmutovani', nazev: '', teplota: '', minut: '', poznamka: '' }],
  poznamka: '', ...navic,
});

describe('receptury a várky přes bible-api', () => {
  it('načte přehled sdíleným parserem; stará funkce se řekne srozumitelně', async () => {
    odpoved = { ok: true, data: { receptury: [], varky: [{ id: VAR, pivo: 'Ležák', datum_varu: '2026-11-03', hodnoty: { mladina_p: 11.3, x: 1 } }], migrace: true } };
    const r = await nactiVarky();
    expect(volani[0]).toEqual({ funkce: 'bible-api', telo: { akce: 'varky' } });
    expect(r.stav === 'ok' && r.prehled.varky[0].hodnoty).toEqual({ mladina_p: 11.3 });
    expect(r.stav === 'ok' && r.migrace).toBe(true);
    odpoved = { ok: false, chyba: { kod: 'neplatny_vstup', zprava: 'Neznámá akce.', status: 400 } };
    expect(await nactiVarky()).toEqual({ stav: 'nenasazeno', zprava: 'Receptury a várky se právě nasazují — zkus to za pár minut.' });
  });

  it('číslo s rozsahem: čárka, prázdné = nic, text a mimo rozsah česky', () => {
    expect(cisloSRozsahem('11,3', 'Extrakt', 1, 35)).toEqual({ cislo: 11.3 });
    expect(cisloSRozsahem(' ', 'Extrakt', 1, 35)).toEqual({ cislo: null });
    expect(cisloSRozsahem('11 °P', 'Extrakt', 1, 35)).toEqual({ chyba: 'Extrakt: „11 °P" není číslo.' });
    expect(cisloSRozsahem('40', 'Extrakt', 1, 35)).toEqual({ chyba: 'Extrakt: 40 je mimo rozsah 1 až 35.' });
    expect(cisloSRozsahem('2,5', 'Generace', 0, 100, true)).toEqual({ chyba: 'Generace musí být celé číslo.' });
  });

  it('hodnoty várky: jen vyplněná pole, první chyba s názvem hodnoty', () => {
    expect(hodnotyKOdeslani({ mladina_p: '11,3', sypani_kg: '180', pivo_ibu: '' })).toEqual({ hodnoty: { sypani_kg: 180, mladina_p: 11.3 } });
    expect(hodnotyKOdeslani({ mladina_p: '113' })).toEqual({ chyba: 'Extrakt mladiny (původní extrakt): 113 je mimo rozsah 1 až 35.' });
    expect(chybaVarky(varka({ pivo: ' ' }))).toBe('Doplň pivo.');
    expect(chybaVarky(varka({ datumVaru: '' }))).toBe('Doplň datum varu.');
    expect(chybaVarky(varka())).toBeNull();
  });

  it('uložení várky pošle oříznuté údaje a čísla; chyba se neodešle', async () => {
    odpoved = { ok: true, data: { id: VAR } };
    expect(await ulozVarku(null, varka())).toEqual({ stav: 'ok', data: VAR });
    expect(volani[0].telo).toEqual({ akce: 'varka_ulozit', varka: {
      pivovar_id: PIV, receptura_id: REC, cislo: '12', pivo: 'Ležák', datum_varu: '2026-11-03', hodnoty: { sypani_kg: 180, mladina_p: 11.3 },
    } });
    await ulozVarku(VAR, varka({ recepturaId: '', pivovarId: null, cislo: '', poznamka: ' pomalé scezování ' }));
    expect(volani[1].telo).toEqual({ akce: 'varka_ulozit', varka: {
      id: VAR, pivo: 'Ležák', datum_varu: '2026-11-03', hodnoty: { sypani_kg: 180, mladina_p: 11.3 }, poznamka: 'pomalé scezování',
    } });
    expect(await ulozVarku(null, varka({ hodnoty: { mladina_p: 'jedenáct' } }))).toEqual({ stav: 'chyba', zprava: 'Extrakt mladiny (původní extrakt): „jedenáct" není číslo.' });
    expect(volani).toHaveLength(2);
    odpoved = { ok: false, chyba: { kod: 'zakazano', zprava: 'Smazat smíš jen svoje várky.', status: 403 } };
    expect(await smazVarku(VAR)).toEqual({ stav: 'chyba', zprava: 'Smazat smíš jen svoje várky.' });
    expect(volani[2].telo).toEqual({ akce: 'varka_smazat', id: VAR });
  });

  it('receptura: cíle jako čísla, prázdné řádky surovin a kroků pryč, neúplný řádek je chyba', async () => {
    expect(recepturaKOdeslani(receptura())).toEqual({ receptura: {
      nazev: 'Ležák', cil_objem_hl: 10, cil_stupnovitost: 11.2,
      suroviny: [{ druh: 'slad', nazev: 'Plzeňský', mnozstvi: 180, jednotka: 'kg' }],
      kroky: [{ faze: 'rmutovani', nazev: 'Nástřik', teplota_c: 52, minut: 15 }],
    } });
    expect(recepturaKOdeslani(receptura({ nazev: ' ' }))).toEqual({ chyba: 'Doplň název receptury.' });
    expect(recepturaKOdeslani(receptura({ cilStupnovitost: '50' }))).toEqual({ chyba: 'Cíl — stupňovitost: 50 je mimo rozsah 1 až 35.' });
    expect(recepturaKOdeslani(receptura({ suroviny: [{ druh: 'slad', nazev: '', mnozstvi: '5', jednotka: '', kdy: '', poznamka: '' }] }))).toEqual({ chyba: 'Surovina s množstvím nemá název.' });
    expect(recepturaKOdeslani(receptura({ suroviny: [{ druh: 'slad', nazev: 'X', mnozstvi: '0', jednotka: '', kdy: '', poznamka: '' }] }))).toEqual({ chyba: 'Množství „X" musí být kladné.' });
    expect(recepturaKOdeslani(receptura({ kroky: [{ faze: 'rmutovani', nazev: '', teplota: '52', minut: '', poznamka: '' }] }))).toEqual({ chyba: 'Krok s teplotou nebo délkou nemá název.' });
    odpoved = { ok: true, data: { id: REC } };
    expect(await ulozRecepturu(REC, receptura())).toEqual({ stav: 'ok', data: REC });
    expect(volani[0].telo).toMatchObject({ akce: 'receptura_ulozit', receptura: { id: REC, nazev: 'Ležák' } });
  });
});
