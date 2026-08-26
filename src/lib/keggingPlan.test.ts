import { describe, it, expect } from 'vitest';
import { computeKeggingPlan, dayKeyFromISO } from './keggingPlan';

// Týden 2026-35 = pondělí 24. 8. – neděle 30. 8. 2026 (stejný týden, na kterém
// se chyba reálně projevila v produkci).
const WEEK = '2026-35';

const beers = [
  { id: 'b-des', name: '10° Desítka' },
  { id: 'b-11', name: '11° Světlá' },
];
const packages = [
  { id: 'p30', label: '30l', kind: 'keg', volume_l: 30 },
  { id: 'p50', label: '50l', kind: 'keg', volume_l: 50 },
  { id: 'pet', label: 'PET 1.5l', kind: 'bottle', volume_l: 1.5 },
];

function plan(over: Partial<Parameters<typeof computeKeggingPlan>[0]> = {}) {
  return computeKeggingPlan({
    beers,
    packages,
    orders: [],
    orderItems: [],
    keggingRows: [],
    weekKey: WEEK,
    ...over,
  });
}
const day = (plans: ReturnType<typeof plan>, d: string) => plans.find((p) => p.day === d)!;

describe('dayKeyFromISO', () => {
  it('mapuje datum na den v týdnu', () => {
    expect(dayKeyFromISO('2026-08-24')).toBe('po');
    expect(dayKeyFromISO('2026-08-27')).toBe('ct');
    expect(dayKeyFromISO('2026-08-30')).toBe('ne');
  });
});

describe('computeKeggingPlan', () => {
  const objednavka = (id: string, date: string, extra: any = {}) => ({
    id, delivery_date: date, order_date: date, status: 'nova', place_name: `Hospoda ${id}`, ...extra,
  });
  let itemSeq = 0;
  const polozka = (order_id: string, beer_id: string, package_id: string, quantity: number, id?: string) => ({
    id: id ?? `i${++itemSeq}`, order_id, beer_id, package_id, quantity,
  });

  it('rozpadne objednávky na dny a spočítá, co chybí', () => {
    const p = plan({
      orders: [objednavka('o1', '2026-08-26'), objednavka('o2', '2026-08-28')],
      orderItems: [polozka('o1', 'b-des', 'p30', 10), polozka('o2', 'b-des', 'p30', 5)],
    });
    expect(day(p, 'st').totalOrdered).toBe(10);
    expect(day(p, 'st').totalMissing).toBe(10);
    expect(day(p, 'pa').totalMissing).toBe(5);
    expect(day(p, 'ut').totalOrdered).toBe(0);
  });

  it('stočený sud se odečte okamžitě a přesně o zapsané množství', () => {
    const orders = [objednavka('o1', '2026-08-26')];
    const orderItems = [polozka('o1', 'b-des', 'p30', 10)];
    expect(day(plan({ orders, orderItems }), 'st').totalMissing).toBe(10);

    const po4 = plan({ orders, orderItems, keggingRows: [{ entry_date: '2026-08-25', beer_id: 'b-des', package_id: 'p30', quantity: 4 }] });
    expect(day(po4, 'st').totalMissing).toBe(6);
    expect(day(po4, 'st').totalDone).toBe(4);
  });

  // Tohle je jádro původní chyby: měsíční model měl u 11° Světlé 30l saldo
  // −12 ks, ořízl se na nulu a čerstvé stáčení pak nejdřív umazávalo ten
  // neexistující dluh, místo aby snížilo „chybí stočit".
  it('minulý schodek ve skladu neschovává čerstvé stáčení', () => {
    const p = plan({
      orders: [objednavka('o1', '2026-08-26')],
      orderItems: [polozka('o1', 'b-11', 'p30', 20)],
      keggingRows: [{ entry_date: '2026-08-24', beer_id: 'b-11', package_id: 'p30', quantity: 15 }],
      // Schodek z předchozích týdnů — nesmí ovlivnit tenhle týden.
      zavozDeductionRows: [{ deduct_date: '2026-08-10', beer_id: 'b-11', package_id: 'p30', quantity: 46 }],
    });
    expect(day(p, 'st').totalMissing).toBe(5);
  });

  // Reálný stav z 25. 8. 2026: 68 sudů mělo odečet ze skladu, ale objednávky
  // byly pořád `status='nova', is_delivered=false` — sudy se chystají dřív, než
  // řidič vyjede. Plán je nesmí chtít stočit znovu.
  it('nachystané sudy s odečtem ze skladu se už stáčet nemusí, i když objednávka je „nová"', () => {
    const p = plan({
      orders: [objednavka('o1', '2026-08-26')],
      orderItems: [polozka('o1', 'b-des', 'p30', 10, 'item-1')],
      zavozDeductionRows: [{ deduct_date: '2026-08-25', beer_id: 'b-des', package_id: 'p30', quantity: 10, order_item_id: 'item-1' }],
    });
    expect(day(p, 'st').totalMissing).toBe(0);
    expect(day(p, 'st').totalDone).toBe(10);
  });

  it('částečný odečet nechá zbytek k stočení', () => {
    const p = plan({
      orders: [objednavka('o1', '2026-08-26')],
      orderItems: [polozka('o1', 'b-des', 'p30', 10, 'item-1')],
      zavozDeductionRows: [{ deduct_date: '2026-08-25', beer_id: 'b-des', package_id: 'p30', quantity: 4, order_item_id: 'item-1' }],
    });
    expect(day(p, 'st').totalMissing).toBe(6);
  });

  it('už zavezená objednávka se stáčet nemusí', () => {
    const p = plan({
      orders: [objednavka('o1', '2026-08-25', { is_delivered: true })],
      orderItems: [polozka('o1', 'b-des', 'p30', 8)],
    });
    expect(day(p, 'ut').totalMissing).toBe(0);
    expect(day(p, 'ut').totalDone).toBe(8);
  });

  it('sudy, které už odjely, nemůžou pokrýt další den', () => {
    const p = plan({
      orders: [
        objednavka('o1', '2026-08-25', { is_delivered: true }),
        objednavka('o2', '2026-08-27'),
      ],
      orderItems: [polozka('o1', 'b-des', 'p30', 6), polozka('o2', 'b-des', 'p30', 6)],
      keggingRows: [{ entry_date: '2026-08-25', beer_id: 'b-des', package_id: 'p30', quantity: 6 }],
      zavozDeductionRows: [{ deduct_date: '2026-08-25', beer_id: 'b-des', package_id: 'p30', quantity: 6 }],
    });
    expect(day(p, 'ut').totalMissing).toBe(0);
    // Úterní sudy odjely — čtvrtek si je nesmí započítat znovu.
    expect(day(p, 'ct').totalMissing).toBe(6);
  });

  it('přebytek se přelije na další den, ne zpátky', () => {
    const p = plan({
      orders: [objednavka('o1', '2026-08-25'), objednavka('o2', '2026-08-27')],
      orderItems: [polozka('o1', 'b-des', 'p30', 4), polozka('o2', 'b-des', 'p30', 4)],
      keggingRows: [{ entry_date: '2026-08-24', beer_id: 'b-des', package_id: 'p30', quantity: 6 }],
    });
    expect(day(p, 'ut').totalMissing).toBe(0);
    expect(day(p, 'ct').totalMissing).toBe(2);
  });

  it('respektuje ručně přehozený den závozu', () => {
    const p = plan({
      orders: [objednavka('o1', '2026-08-26', { delivery_day: 'pa' })],
      orderItems: [polozka('o1', 'b-des', 'p30', 3)],
    });
    expect(day(p, 'st').totalOrdered).toBe(0);
    expect(day(p, 'pa').totalOrdered).toBe(3);
  });

  it('ignoruje storno a lahve', () => {
    const p = plan({
      orders: [objednavka('o1', '2026-08-26', { status: 'storno' }), objednavka('o2', '2026-08-26')],
      orderItems: [polozka('o1', 'b-des', 'p30', 9), polozka('o2', 'b-des', 'pet', 40)],
    });
    expect(day(p, 'st').totalOrdered).toBe(0);
  });

  it('počítá litry, které ještě chybí', () => {
    const p = plan({
      orders: [objednavka('o1', '2026-08-26')],
      orderItems: [polozka('o1', 'b-des', 'p30', 2), polozka('o1', 'b-11', 'p50', 1)],
    });
    expect(day(p, 'st').missingLiters).toBe(2 * 30 + 50);
  });

  it('u položky drží seznam odběratelů', () => {
    const p = plan({
      orders: [objednavka('o1', '2026-08-26'), objednavka('o2', '2026-08-26')],
      orderItems: [polozka('o1', 'b-des', 'p30', 3), polozka('o2', 'b-des', 'p30', 2)],
    });
    const item = day(p, 'st').items[0];
    expect(item.ordered).toBe(5);
    expect(item.orders.map((o) => o.place_name).sort()).toEqual(['Hospoda o1', 'Hospoda o2']);
  });
});
