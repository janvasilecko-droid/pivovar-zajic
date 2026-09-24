import { describe, it, expect } from 'vitest';
import { buildMovements } from './stockLedger';
import { sestavPohybyObdobi } from './pohybySkladu';

// Týden 21.–27. 9. 2026, 12° Světlá (b12) v sudech 30 l a 50 l.
const PO = '2026-09-21';
const UT = '2026-09-22';
const ST = '2026-09-23';
const NE = '2026-09-27';

const pohyby = buildMovements({
  inventoryRows: [
    { entry_date: PO, beer_id: 'b12', package_id: 'k30', quantity: 15, note: 'Počáteční stav' },
    { entry_date: PO, beer_id: 'b12', package_id: 'k50', quantity: 4, note: 'Počáteční stav' },
  ],
  keggingRows: [
    { entry_date: UT, beer_id: 'b12', package_id: 'k30', quantity: 6 },
    { entry_date: '2026-09-14', beer_id: 'b12', package_id: 'k30', quantity: 99 }, // minulý týden
    { entry_date: UT, beer_id: 'b10', package_id: 'k30', quantity: 5 },            // jiné pivo
  ],
  zavozDeductionRows: [
    { deduct_date: PO, beer_id: 'b12', package_id: 'k30', quantity: 14, order_id: 'o1' },
    { deduct_date: ST, beer_id: 'b12', package_id: 'k30', quantity: 3, order_id: 'o2' },
    { deduct_date: ST, beer_id: 'b12', package_id: 'k50', quantity: 5, order_id: 'o2' },
  ],
  fasovaniRows: [{ entry_date: UT, beer_id: 'b12', package_id: 'k50', quantity: 1 }],
});
const jmena: Record<string, string> = { o1: 'U Zajíce', o2: 'Maneo' };
const odberatel = (id: string) => jmena[id];

describe('sestavPohybyObdobi', () => {
  it('jen vybraný týden a pivo — minulý týden ani jiné pivo se nevypíšou', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12' }, odberatel);
    expect(r.dny).toHaveLength(7);
    const vsechny = r.dny.flatMap((d) => d.radky);
    expect(vsechny.every((x) => x.beer_id === 'b12')).toBe(true);
    expect(vsechny.some((x) => x.mnozstvi === 99)).toBe(false);
  });

  it('stav večer sedí se skladovou knihou den po dni', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12', packageId: 'k30' }, odberatel);
    const vecer = (datum: string) => r.dny.find((d) => d.datum === datum)!.vecer[0].mnozstvi;
    expect(vecer(PO)).toBe(1);  // 15 − 14
    expect(vecer(UT)).toBe(7);  // + 6 stočeno
    expect(vecer(ST)).toBe(4);  // − 3 Maneo
    expect(vecer(NE)).toBe(4);
  });

  it('u závozu je jméno odběratele', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12', packageId: 'k30' }, odberatel);
    const pondeli = r.dny[0].radky;
    const zavoz = pondeli.find((x) => x.druh === 'zavoz')!;
    expect(zavoz.kdo).toBe('U Zajíce');
    expect(zavoz.mnozstvi).toBe(-14);
    // Inventura je v rámci dne první — výchozí bod.
    expect(pondeli[0].druh).toBe('inventura');
  });

  it('filtr druhu schová řádky, ale stav večer zůstává stejný jako ve Skladu', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12', packageId: 'k30', skupiny: ['zavoz'] }, odberatel);
    const vsechny = r.dny.flatMap((d) => d.radky);
    expect(vsechny.every((x) => x.druh === 'zavoz')).toBe(true);
    expect(r.dny.find((d) => d.datum === UT)!.vecer[0].mnozstvi).toBe(7);
  });

  it('souhrn: ráno, přibylo, ubylo a konec pro každý obal zvlášť', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12' }, odberatel);
    const k30 = r.souhrn.find((s) => s.package_id === 'k30')!;
    const k50 = r.souhrn.find((s) => s.package_id === 'k50')!;
    expect(k30).toMatchObject({ rano: 15, prijem: 6, vydej: 17, inventura: true, konec: 4 });
    expect(k50).toMatchObject({ rano: 4, prijem: 0, vydej: 6, konec: -2 });
  });

  it('bez filtru piva jsou vidět všechna piva, co se hýbala', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE }, odberatel);
    expect(new Set(r.souhrn.map((s) => s.beer_id))).toEqual(new Set(['b12', 'b10']));
  });
});
