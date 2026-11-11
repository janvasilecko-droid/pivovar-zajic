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
  cisloZPole, nactiTechnologii, parametrDoFormulare, parametryKOdeslani, prevezmiZarizeni, smazPivovar, tankyZeSklepa, ulozPivovar,
  ulozPostup, ulozZarizeni,
} from './bibleTechnologieApi';

const PIV = 'aaaaaaaa-1111-2222-3333-444444444444';
const ZAR = 'bbbbbbbb-1111-2222-3333-444444444444';
beforeEach(() => { volani.length = 0; });

describe('technologie pivovaru přes bible-api', () => {
  it('načte profil; vadné řádky a parametry vynechá, neznámý zdroj = odhad', async () => {
    odpoved = { ok: true, data: {
      pivovary: [{ id: PIV, nazev: 'Zajíc', popis: null, hlavni: true, zalozil_jmeno: 'Honza', upraveno_at: 'u' }, { nazev: 'bez id' }],
      pivovar_id: PIV,
      zarizeni: [
        { id: ZAR, druh: 'tank_kvasny', nazev: 'Spilka 1', pocet: 1, parametry: [
          { nazev: 'Objem užitný', hodnota: 80, jednotka: 'hl', zdroj: 'sklep' },
          { nazev: 'Chlazení', text: 'duplikátor', zdroj: 'neco' },
          { nazev: 'Prázdný' },
          { hodnota: 3 },
        ], poznamka: null, zapsal_jmeno: 'Honza', upraveno_at: 'u' },
        { id: 'x', druh: 'raketa', nazev: 'X' },
      ],
      postupy: [{ id: 'p1', nazev: 'CIP', oblast: 'L', kroky: '1.', zdroj: null, zapsal_jmeno: null, upraveno_at: null }],
      migrace: true,
    } };
    const r = await nactiTechnologii();
    expect(volani[0]).toEqual({ funkce: 'bible-api', telo: { akce: 'technologie' } });
    expect(r).toEqual({ stav: 'ok', technologie: {
      pivovary: [{ id: PIV, nazev: 'Zajíc', popis: null, hlavni: true, zalozilJmeno: 'Honza', upraveno: 'u' }],
      pivovarId: PIV,
      zarizeni: [{ id: ZAR, druh: 'tank_kvasny', nazev: 'Spilka 1', pocet: 1, parametry: [
        { nazev: 'Objem užitný', hodnota: 80, jednotka: 'hl', zdroj: 'sklep' },
        { nazev: 'Chlazení', text: 'duplikátor', zdroj: 'odhad' },
      ], poznamka: null, zapsalJmeno: 'Honza', upraveno: 'u' }],
      postupy: [{ id: 'p1', nazev: 'CIP', oblast: 'L', kroky: '1.', zdroj: null, zapsalJmeno: null, upraveno: null }],
      migrace: true,
    } });
  });

  it('výběr pivovaru se pošle; bez migrace a stará funkce se řeknou srozumitelně', async () => {
    odpoved = { ok: true, data: { pivovary: [], pivovar_id: null, zarizeni: [], postupy: [], migrace: false } };
    const r = await nactiTechnologii(PIV);
    expect(volani[0].telo).toEqual({ akce: 'technologie', pivovar_id: PIV });
    expect(r).toEqual({ stav: 'ok', technologie: { pivovary: [], pivovarId: null, zarizeni: [], postupy: [], migrace: false } });
    odpoved = { ok: false, chyba: { kod: 'neplatny_vstup', zprava: 'Neznámá akce.', status: 400 } };
    expect(await nactiTechnologii()).toEqual({ stav: 'nenasazeno', zprava: 'Technologie pivovaru se právě nasazuje — zkus to za pár minut.' });
  });

  it('číslo z pole: čárka i tečka, mezery v tisících; jiný text je chyba, ne odhad', () => {
    expect(cisloZPole('7,5')).toBe(7.5);
    expect(cisloZPole(' 1 200 ')).toBe(1200);
    expect(cisloZPole('-2')).toBe(-2);
    expect(cisloZPole('')).toBeNull();
    expect(cisloZPole('80 hl')).toBe('chyba');
    expect(cisloZPole('1.200,5')).toBe('chyba');
  });

  it('parametry k odeslání: číslo jako hodnota, jinak text, prázdné řádky pryč', () => {
    expect(parametryKOdeslani([
      { nazev: 'Objem užitný', hodnota: '80', jednotka: 'hl', zdroj: 'stitek' },
      { nazev: 'Materiál', hodnota: ' nerez 1.4301 ', jednotka: '', zdroj: 'odhad' },
      { nazev: 'Max. přetlak', hodnota: '', jednotka: 'bar', zdroj: 'odhad' },
      { nazev: ' ', hodnota: '', jednotka: '', zdroj: 'odhad' },
    ])).toEqual([
      { nazev: 'Objem užitný', hodnota: 80, jednotka: 'hl', zdroj: 'stitek' },
      { nazev: 'Materiál', text: 'nerez 1.4301', zdroj: 'odhad' },
    ]);
    expect(parametrDoFormulare({ nazev: 'Objem', hodnota: 7.5, jednotka: 'hl', zdroj: 'zmereno' }))
      .toEqual({ nazev: 'Objem', hodnota: '7,5', jednotka: 'hl', zdroj: 'zmereno' });
    expect(parametrDoFormulare({ nazev: 'Materiál', text: 'nerez', zdroj: 'odhad' }))
      .toEqual({ nazev: 'Materiál', hodnota: 'nerez', jednotka: '', zdroj: 'odhad' });
  });

  it('zápisy pošlou oříznuté údaje: nové s pivovarem, úprava s id', async () => {
    odpoved = { ok: true, data: { id: PIV } };
    expect(await ulozPivovar(null, { nazev: ' Zajíc ', popis: '  ', hlavni: true })).toEqual({ stav: 'ok', data: PIV });
    expect(volani[0].telo).toEqual({ akce: 'pivovar_ulozit', pivovar: { nazev: 'Zajíc', hlavni: true } });
    await ulozZarizeni(null, PIV, { druh: 'cerpadlo', nazev: ' Čerpadlo ', pocet: 2, parametry: [{ nazev: 'Průtok', hodnota: '5,5', jednotka: 'm³/h', zdroj: 'stitek' }], poznamka: '' });
    expect(volani[1].telo).toEqual({ akce: 'zarizeni_ulozit', zarizeni: {
      pivovar_id: PIV, druh: 'cerpadlo', nazev: 'Čerpadlo', pocet: 2, parametry: [{ nazev: 'Průtok', hodnota: 5.5, jednotka: 'm³/h', zdroj: 'stitek' }],
    } });
    await ulozZarizeni(ZAR, PIV, { druh: 'cerpadlo', nazev: 'Čerpadlo', pocet: 1, parametry: [], poznamka: ' tiché ' });
    expect(volani[2].telo).toEqual({ akce: 'zarizeni_ulozit', zarizeni: { id: ZAR, druh: 'cerpadlo', nazev: 'Čerpadlo', pocet: 1, parametry: [], poznamka: 'tiché' } });
    await ulozPostup(null, PIV, { nazev: ' CIP ', oblast: '', kroky: ' 1. ', zdroj: '' });
    expect(volani[3].telo).toEqual({ akce: 'postup_provozu_ulozit', postup: { pivovar_id: PIV, nazev: 'CIP', kroky: '1.' } });
  });

  it('chyba práva se vrátí česky', async () => {
    odpoved = { ok: false, chyba: { kod: 'zakazano', zprava: 'Smazat celý profil pivovaru smí jen správce.', status: 403 } };
    expect(await smazPivovar(PIV)).toEqual({ stav: 'chyba', zprava: 'Smazat celý profil pivovaru smí jen správce.' });
    expect(volani[0].telo).toEqual({ akce: 'pivovar_smazat', id: PIV });
  });

  it('tanky ze Sklepa: Spilka = kvasný, ostatní ležácký, objem v hl ze zdroje „sklep"; bez kapacity bez objemu', async () => {
    const s = tankyZeSklepa([
      { label: 'Spilka 1', capacity_l: 8000 },
      { label: 'Tank 1', capacity_l: 7500 },
      { label: 'tank 1', capacity_l: 7500 },
      { label: 'Tank 9', capacity_l: 0 },
      { label: '  ', capacity_l: 100 },
    ]);
    expect(s).toEqual([
      { druh: 'tank_kvasny', nazev: 'Spilka 1', pocet: 1, parametry: [{ nazev: 'Objem užitný', hodnota: 80, jednotka: 'hl', zdroj: 'sklep' }] },
      { druh: 'tank_lezacky', nazev: 'Tank 1', pocet: 1, parametry: [{ nazev: 'Objem užitný', hodnota: 75, jednotka: 'hl', zdroj: 'sklep' }] },
      { druh: 'tank_lezacky', nazev: 'Tank 9', pocet: 1, parametry: [] },
    ]);
    odpoved = { ok: true, data: { prevzato: 2 } };
    expect(await prevezmiZarizeni(PIV, s)).toEqual({ stav: 'ok', data: 2 });
    expect(volani[0].telo).toEqual({ akce: 'zarizeni_prevzit', pivovar_id: PIV, seznam: s });
  });
});
