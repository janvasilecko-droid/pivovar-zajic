// Rozdíl oproti inventuře za měsíc, jen bokem a ŽIVĚ z knihy (majitel 26. a 27. 11. 2026): „…napsat bokem na konci
// měsíce rozdíl oproti inventuře, ať je vidět ztráta, ale nepočítat je" a „…pokud se bude dofasovávat zpětně, to číslo se
// může měnit, zmenšovat, ale stav skladu je daný úpravou skladu". Data i jména jsou vymyšlená.
import { describe, it, expect } from 'vitest';
import { buildMovements, stockMapAsOf } from './stockLedger';
import { jeDorovnaniUpravy, ztrataOprotiInventure } from './ztrataOprotiInventure';

const PIVA = [{ id: 'sv', name: '12° Světlá' }, { id: 'os', name: 'Osma' }];
const OBALY = [{ id: 'l1', label: '1l' }, { id: 'k50', label: 'KEG 50l' }];

type Zdroje = Parameters<typeof buildMovements>[0];
const rad = (entry_date: string, beer_id: string, package_id: string, quantity: number, extra: Record<string, unknown> = {}) =>
  ({ entry_date, beer_id, package_id, quantity, ...extra });
/** Úprava skladu: týdenní počítání uložené v den `den` (poznámka jako z tydenniJakoInventura). */
const uprava = (den: string, beer_id: string, package_id: string, quantity: number) =>
  rad(den, beer_id, package_id, quantity, { note: `Týdenní inventura týdne ${den} (konec dne)`, created_at: `${den}T08:00:00Z` });
const zaklad = (...radky: ReturnType<typeof rad>[]) => radky.map((r) => ({ ...r, note: r.note ?? 'Počáteční stav' }));
const vypocet = (zdroje: Zdroje, mesic = '2026-11') => ztrataOprotiInventure(buildMovements(zdroje), mesic, PIVA, OBALY);

describe('ztrataOprotiInventure — součet rozdílů počítání za měsíc, živě z knihy', () => {
  it('rozdíl = napočítáno − evidence před počítáním; ztráty záporné, největší nahoře, součty ztrát a přebytků', () => {
    const v = vypocet({
      inventoryRows: [
        ...zaklad(rad('2026-11-01', 'os', 'l1', 80), rad('2026-11-01', 'sv', 'k50', 10), rad('2026-11-01', 'sv', 'l1', 4)),
        uprava('2026-11-08', 'os', 'l1', 57),  // evidence 80 → −23
        uprava('2026-11-08', 'sv', 'k50', 9),  // evidence 10 → −1
        uprava('2026-11-08', 'sv', 'l1', 9),   // evidence 4 → +5
      ],
    });
    expect(v.radky.map((r) => [r.beer_name, r.package_label, r.rozdil, r.pocitani])).toEqual([
      ['Osma', '1l', -23, 1],
      ['12° Světlá', 'KEG 50l', -1, 1],
      ['12° Světlá', '1l', 5, 1],
    ]);
    expect(v.ztrata).toBe(-24);
    expect(v.prebytek).toBe(5);
    expect(v.pocitani).toBe(3);
  });

  it('více počítání za měsíc se sečte po položce (druhé počítá od napočítaného čísla prvního)', () => {
    const v = vypocet({
      inventoryRows: [
        ...zaklad(rad('2026-11-01', 'os', 'l1', 80)),
        uprava('2026-11-08', 'os', 'l1', 57),   // evidence 80 → −23
        uprava('2026-11-15', 'os', 'l1', 44),   // evidence 57 → −13
      ],
    });
    expect(v.radky[0]).toMatchObject({ rozdil: -36, pocitani: 2 });
    expect(v.pocitani).toBe(2);
  });

  it('ZPĚTNĚ dofasovaný výdej za dny před počítáním ztrátu ZMENŠÍ; stav po počítání zůstává napočítané číslo', () => {
    const bez = {
      inventoryRows: [...zaklad(rad('2026-11-01', 'os', 'l1', 80)), uprava('2026-11-08', 'os', 'l1', 57)],
    };
    expect(vypocet(bez).radky[0].rozdil).toBe(-23);
    const sFasovanim = {
      ...bez,
      // Zapsáno až po počítání, ale za den před ním.
      fasovaniRows: [rad('2026-11-05', 'os', 'l1', 10, { created_at: '2026-11-09T10:00:00Z' })],
    };
    expect(vypocet(sFasovanim).radky[0].rozdil).toBe(-13);
    // Stav skladu po Úpravě je pořád 57 — dofasování ho nezměnilo.
    expect(stockMapAsOf(buildMovements(sFasovanim), '2026-11-08')['os__l1']).toBe(57);
  });

  it('počítání v jiném měsíci se nepočítá, i když leží vedle', () => {
    const zdroje = {
      inventoryRows: [
        ...zaklad(rad('2026-10-01', 'os', 'l1', 80)),
        uprava('2026-10-20', 'os', 'l1', 70),   // říjen: −10
        uprava('2026-11-08', 'os', 'l1', 60),   // listopad: evidence 70 → −10
        uprava('2026-12-06', 'os', 'l1', 50),   // prosinec: −10
      ],
      // Dorovnání z říjnového počítání: do listopadu nepatří.
      adjustmentRows: [rad('2026-10-20', 'os', 'l1', -3, { reason: 'Dorovnání z inventury týdne 2026-10-19 — 1l', created_at: '2026-10-19T08:00:00Z' })],
    };
    const listopad = vypocet(zdroje, '2026-11');
    expect(listopad.radky.map((r) => [r.rozdil, r.pocitani])).toEqual([[-10, 1]]);
    expect(listopad.pocitani).toBe(1);
    expect(vypocet(zdroje, '2026-10').radky.map((r) => r.rozdil)).toEqual([-10]); // −7 počítání (evidence 77 po dorovnání) a −3 dorovnání
    expect(vypocet(zdroje, '2026-12').radky.map((r) => [r.rozdil, r.pocitani])).toEqual([[-10, 1]]);
    expect(vypocet(zdroje, '2026-09').pocitani).toBe(0);
  });

  it('dorovnání z Úpravy skladu (tlačítko „Dorovnat") se přičte — jinak by ztráta zmizela; jiné dorovnání ne', () => {
    const zdroje = {
      inventoryRows: [...zaklad(rad('2026-11-01', 'os', 'l1', 80)), uprava('2026-11-08', 'os', 'l1', 57)],
      // Dorovnat u rozdílu −23: evidence před počítáním už je 57, takže samotné počítání vyjde na 0.
      adjustmentRows: [rad('2026-11-08', 'os', 'l1', -23, { reason: 'Dorovnání z inventury týdne 2026-11-02 — 1l', created_at: '2026-11-07T08:00:00Z' })],
    };
    const v = vypocet(zdroje);
    expect(v.radky.map((r) => [r.beer_name, r.rozdil])).toEqual([['Osma', -23]]);
    expect(jeDorovnaniUpravy('Dorovnání z inventury týdne 2026-11-02 — 1l')).toBe(true);
    expect(jeDorovnaniUpravy('Vráceno z objednávky — 6× 1l Osma')).toBe(false);
    // Vrácení z objednávky není ztráta: evidence o 6 vzroste, napočítáno sedí, žádný řádek.
    const vraceni = vypocet({
      inventoryRows: [...zaklad(rad('2026-11-01', 'os', 'l1', 80)), uprava('2026-11-08', 'os', 'l1', 86)],
      adjustmentRows: [rad('2026-11-04', 'os', 'l1', 6, { reason: 'Vráceno z objednávky — 6× 1l Osma' })],
    });
    expect(vraceni.radky).toEqual([]);
    expect(vraceni.pocitani).toBe(1);
  });

  it('měsíc bez počítání to řekne počtem 0; měsíc, kde všechno sedělo, má počítání a žádné řádky', () => {
    const sedelo = vypocet({ inventoryRows: [...zaklad(rad('2026-11-01', 'os', 'l1', 80)), uprava('2026-11-08', 'os', 'l1', 80)] });
    expect(sedelo.pocitani).toBe(1);
    expect(sedelo.radky).toEqual([]);
    expect(sedelo.ztrata).toBe(0);
    expect(vypocet({ inventoryRows: zaklad(rad('2026-11-01', 'os', 'l1', 80)) }).pocitani).toBe(0);
  });

  it('počáteční stav měsíce počítání není a rozdíl nedělá', () => {
    const v = vypocet({ inventoryRows: zaklad(rad('2026-11-01', 'os', 'l1', 80)), bottlingRows: [rad('2026-11-03', 'os', 'l1', 5)] });
    expect(v.pocitani).toBe(0);
    expect(v.radky).toEqual([]);
  });

  it('měsíční (fyzická / schválená) inventura se počítá jako počítání a její rozdíl je vidět', () => {
    const v = vypocet({
      inventoryRows: [
        ...zaklad(rad('2026-11-01', 'os', 'l1', 80)),
        rad('2026-11-30', 'os', 'l1', 70, { note: 'Schválená inventura' }),
      ],
    });
    expect(v.pocitani).toBe(1);
    expect(v.radky[0]).toMatchObject({ rozdil: -10, pocitani: 1 });
  });

  it('neznámé pivo a obal nerozbijí výpis', () => {
    const v = ztrataOprotiInventure(
      buildMovements({ inventoryRows: [...zaklad(rad('2026-11-01', 'xx', 'yy', 10)), uprava('2026-11-08', 'xx', 'yy', 6)] }),
      '2026-11', PIVA, OBALY,
    );
    expect(v.radky[0]).toMatchObject({ beer_name: 'Neznámé pivo', package_label: '', rozdil: -4 });
  });
});
