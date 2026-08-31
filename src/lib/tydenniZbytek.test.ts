// Odznak „Chybí skladem" u objednávky.
//
// Testy schválně obsahují i pohyby, které starý výpočet v Orders.tsx
// přehlížel (přefuk, sudy na lahve, dorovnání) — právě kvůli nim odznak
// nesvítil, když měl.
import { describe, expect, it } from 'vitest';
import { schodkyObjednavky, zbytekKeKonciTydne } from './tydenniZbytek';

const KEG50 = { id: 'keg50', kind: 'keg', volume_l: 50 };
const KEG30 = { id: 'keg30', kind: 'keg', volume_l: 30 };
const PET1 = { id: 'pet1', kind: 'bottle', volume_l: 1 };
const OBALY = [KEG50, KEG30, PET1];
const PIVO = 'lezak';
const KONEC = '2026-08-09'; // neděle

const zdroje = (over: Partial<Parameters<typeof zbytekKeKonciTydne>[0]> = {}) => ({
  inventoryRows: [
    { beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-01', quantity: 20, note: 'Počáteční stav' },
  ],
  packages: OBALY,
  ...over,
});

describe('zbytekKeKonciTydne', () => {
  it('vrátí stav po pivu A OBALU, ne jen po pivu', () => {
    const z = zbytekKeKonciTydne(zdroje(), KONEC);
    expect(z.get(`${PIVO}__${KEG50.id}`)).toBe(20);
    expect(z.get(`${PIVO}__${PET1.id}`)).toBeUndefined();
  });

  it('započítá výdej v průběhu týdne', () => {
    const z = zbytekKeKonciTydne(zdroje({
      zavozDeductionRows: [{ beer_id: PIVO, package_id: KEG50.id, deduct_date: '2026-08-05', quantity: 8 }],
    }), KONEC);
    expect(z.get(`${PIVO}__${KEG50.id}`)).toBe(12);
  });

  it('započítá SUDY SPOTŘEBOVANÉ NA LAHVE — starý výpočet je přehlížel', () => {
    const z = zbytekKeKonciTydne(zdroje({
      bottlingRows: [{
        beer_id: PIVO, package_id: PET1.id, entry_date: '2026-08-04', quantity: 90,
        kegs_used: 2, kegs_used_package_id: KEG50.id, created_at: 'x',
      }],
    }), KONEC);
    expect(z.get(`${PIVO}__${KEG50.id}`)).toBe(18);
    expect(z.get(`${PIVO}__${PET1.id}`)).toBe(90);
  });

  it('započítá PŘEFUK mezi velikostmi sudů — starý výpočet ho přehlížel', () => {
    const z = zbytekKeKonciTydne(zdroje({
      prefukRows: [{
        beer_id: PIVO, entry_date: '2026-08-06',
        from_package_id: KEG50.id, from_count: 6, to_package_id: KEG30.id, to_count: 10,
      }],
    }), KONEC);
    expect(z.get(`${PIVO}__${KEG50.id}`)).toBe(14);
    expect(z.get(`${PIVO}__${KEG30.id}`)).toBe(10);
  });

  it('započítá DOROVNÁNÍ inventury — starý výpočet ho přehlížel', () => {
    const z = zbytekKeKonciTydne(zdroje({
      adjustmentRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-03', quantity: -5 }],
    }), KONEC);
    expect(z.get(`${PIVO}__${KEG50.id}`)).toBe(15);
  });

  it('pohyby po konci týdne se nezapočítají', () => {
    const z = zbytekKeKonciTydne(zdroje({
      zavozDeductionRows: [{ beer_id: PIVO, package_id: KEG50.id, deduct_date: '2026-08-20', quantity: 8 }],
    }), KONEC);
    expect(z.get(`${PIVO}__${KEG50.id}`)).toBe(20);
  });

  it('schodek se ukáže jako záporné číslo, neořezává se na nulu', () => {
    const z = zbytekKeKonciTydne(zdroje({
      fasovaniRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-05', quantity: 25 }],
    }), KONEC);
    expect(z.get(`${PIVO}__${KEG50.id}`)).toBe(-5);
  });
});

describe('schodkyObjednavky', () => {
  const zbytek = new Map([
    [`${PIVO}__${KEG50.id}`, -3],
    [`${PIVO}__${PET1.id}`, 100],
  ]);

  it('nahlásí položku, na kterou nezbývá', () => {
    const s = schodkyObjednavky([{ beer_id: PIVO, package_id: KEG50.id, beer_name: 'Ležák' }], zbytek);
    expect(s).toEqual([{ beer_id: PIVO, package_id: KEG50.id, beer_name: 'Ležák', chybi: 3 }]);
  });

  it('krytou položku nehlásí', () => {
    expect(schodkyObjednavky([{ beer_id: PIVO, package_id: PET1.id }], zbytek)).toEqual([]);
  });

  it('lahve nevykryjí chybějící sudy téhož piva', () => {
    // Tohle starý výpočet dovolil: sčítal všechny obaly jednoho piva, takže
    // 100 lahví „přebilo" schodek tří sudů a odznak nesvítil.
    const s = schodkyObjednavky([
      { beer_id: PIVO, package_id: KEG50.id, beer_name: 'Ležák' },
      { beer_id: PIVO, package_id: PET1.id, beer_name: 'Ležák' },
    ], zbytek);
    expect(s).toHaveLength(1);
    expect(s[0].package_id).toBe(KEG50.id);
  });

  it('totéž pivo a obal na víc řádcích hlásí jednou', () => {
    const s = schodkyObjednavky([
      { beer_id: PIVO, package_id: KEG50.id, beer_name: 'Ležák' },
      { beer_id: PIVO, package_id: KEG50.id, beer_name: 'Ležák' },
    ], zbytek);
    expect(s).toHaveLength(1);
  });

  it('položky bez piva nebo obalu přeskočí', () => {
    expect(schodkyObjednavky([
      { beer_id: null, package_id: KEG50.id },
      { beer_id: PIVO, package_id: null },
    ], zbytek)).toEqual([]);
  });

  it('pivo, které sklad vůbec nezná, se bere jako nulový stav (tedy bez schodku)', () => {
    expect(schodkyObjednavky([{ beer_id: 'neznamé', package_id: KEG50.id }], zbytek)).toEqual([]);
  });
});
