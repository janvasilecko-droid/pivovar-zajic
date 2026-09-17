// Odznak „Chybí skladem" u objednávky.
//
// Testy schválně obsahují i pohyby, které starý výpočet v Orders.tsx
// přehlížel (přefuk, sudy na lahve, dorovnání) — právě kvůli nim odznak
// nesvítil, když měl.
import { describe, expect, it } from 'vitest';
import { schodkyObjednavky, zbytekKeKonciTydne, zbytekPodleObjednavek, type ObjednavkaKPrioritě } from './tydenniZbytek';

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

// Nález z auditu 15. 9. 2026, rozhodnutí uživatele: priorita mezi
// objednávkami stejného týdne podle dne dovozu — kdo se veze dřív, dostane
// zbytek dřív.
describe('zbytekPodleObjednavek — priorita podle dne dovozu', () => {
  const objednavka = (
    order_id: string, poradiDatum: string, qty: number, id = `${order_id}-i1`,
  ): ObjednavkaKPrioritě => ({
    order_id, poradiDatum,
    polozky: [{ order_item_id: id, beer_id: PIVO, package_id: KEG50.id, beer_name: 'Ležák', quantity: qty }],
  });

  it('dvě objednávky stejný týden, dohromady přes zásobu — dřívější vyhraje, pozdější má schodek', () => {
    const zbytek = new Map([[`${PIVO}__${KEG50.id}`, 15]]);
    const vysledek = zbytekPodleObjednavek(
      [objednavka('A', '2026-08-05', 10), objednavka('B', '2026-08-07', 10)], // st, pá
      zbytek,
      new Set(),
    );
    expect(schodkyObjednavky(objednavka('A', '', 10).polozky, vysledek.get('A')!)).toEqual([]);
    expect(schodkyObjednavky(objednavka('B', '', 10).polozky, vysledek.get('B')!)[0].chybi).toBe(5);
  });

  it('pořadí ve vstupu nerozhoduje, jen datum dovozu', () => {
    const zbytek = new Map([[`${PIVO}__${KEG50.id}`, 15]]);
    // B (pátek) je ve vstupu PRVNÍ, ale přednost má pořád A (středa).
    const vysledek = zbytekPodleObjednavek(
      [objednavka('B', '2026-08-07', 10), objednavka('A', '2026-08-05', 10)],
      zbytek,
      new Set(),
    );
    expect(schodkyObjednavky(objednavka('A', '', 10).polozky, vysledek.get('A')!)).toEqual([]);
    expect(schodkyObjednavky(objednavka('B', '', 10).polozky, vysledek.get('B')!)[0].chybi).toBe(5);
  });

  it('stejný den dovozu, dohromady se do skladu vejdou — ani jedna nemá schodek', () => {
    const zbytek = new Map([[`${PIVO}__${KEG50.id}`, 15]]);
    const vysledek = zbytekPodleObjednavek(
      [objednavka('A', '2026-08-05', 5), objednavka('B', '2026-08-05', 5)],
      zbytek,
      new Set(),
    );
    // Dohromady chtějí 10 z 15 — obě vidí zbytek po SPOLEČNÉM odečtení (5), obě v pořádku.
    expect(schodkyObjednavky(objednavka('A', '', 5).polozky, vysledek.get('A')!)).toEqual([]);
    expect(schodkyObjednavky(objednavka('B', '', 5).polozky, vysledek.get('B')!)).toEqual([]);
  });

  it('stejný den dovozu, dohromady na sklad NESTAČÍ — obě dostanou stejný sdílený schodek', () => {
    // Oprava z provozu 17. 9. 2026: "nesoutěží mezi sebou" NEZNAMENÁ, že o
    // sobě navzájem nevědí (to byl přesně Nález č. 3, jen o úroveň níž — na
    // dni místo týdne) — znamená, že se dělí o STEJNÝ výsledek dne, přesně
    // jako denní plán stáčení (keggingPlan.ts) počítá poptávku celého dne
    // dohromady, ne objednávku po objednávce.
    const zbytek = new Map([[`${PIVO}__${KEG50.id}`, 15]]);
    const vysledek = zbytekPodleObjednavek(
      [objednavka('A', '2026-08-05', 10), objednavka('B', '2026-08-05', 10)],
      zbytek,
      new Set(),
    );
    // Dohromady chtějí 20 z 15 — oběma chybí stejných 5, ne že by "kdo dřív, ten bere".
    expect(schodkyObjednavky(objednavka('A', '', 10).polozky, vysledek.get('A')!)[0].chybi).toBe(5);
    expect(schodkyObjednavky(objednavka('B', '', 10).polozky, vysledek.get('B')!)[0].chybi).toBe(5);
  });

  it('položka, která už má odpočet ze skladu (zavoz), se neodečítá podruhé', () => {
    // `zbytek` uже tuhle položku odečetl (skladová kniha), takže by se tu
    // neměla brát znovu — jinak by šlo o stejnou chybu jako u fondu v
    // keggingPlan.ts (dvojitý odpočet).
    const zbytek = new Map([[`${PIVO}__${KEG50.id}`, 5]]); // 15 − 10 (A) už v knize
    const vysledek = zbytekPodleObjednavek(
      [objednavka('A', '2026-08-05', 10, 'A-odectena'), objednavka('B', '2026-08-07', 5)],
      zbytek,
      new Set(['A-odectena']),
    );
    expect(schodkyObjednavky(objednavka('B', '', 5).polozky, vysledek.get('B')!)).toEqual([]);
  });

  it('třetí objednávka v pořadí vidí zbytek po OBOU předchozích', () => {
    const zbytek = new Map([[`${PIVO}__${KEG50.id}`, 20]]);
    const vysledek = zbytekPodleObjednavek(
      [objednavka('A', '2026-08-03', 8), objednavka('B', '2026-08-05', 8), objednavka('C', '2026-08-07', 8)],
      zbytek,
      new Set(),
    );
    expect(schodkyObjednavky(objednavka('C', '', 8).polozky, vysledek.get('C')!)[0].chybi).toBe(4); // 20-8-8=4, chybí 4 z 8
  });
});
