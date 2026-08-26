import { describe, it, expect } from 'vitest';
import { computeKeggingPlan, dayKeyFromISO, mergeWeekPlan } from './keggingPlan';

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

describe('mergeWeekPlan — souhrn za celý týden', () => {
  const objednavka = (id: string, date: string, extra: any = {}) => ({
    id, delivery_date: date, order_date: date, status: 'nova', place_name: `Hospoda ${id}`, ...extra,
  });
  const polozka = (order_id: string, beer_id: string, package_id: string, quantity: number, id = `x${Math.random()}`) => ({
    id, order_id, beer_id, package_id, quantity,
  });

  it('sečte stejnou položku napříč dny', () => {
    const plans = computeKeggingPlan({
      beers, packages, weekKey: WEEK, keggingRows: [],
      orders: [objednavka('o1', '2026-08-25'), objednavka('o2', '2026-08-27')],
      orderItems: [polozka('o1', 'b-des', 'p30', 4), polozka('o2', 'b-des', 'p30', 6)],
    });
    const tyden = mergeWeekPlan(plans, '24. 8. – 30. 8.');
    expect(tyden.items).toHaveLength(1);
    expect(tyden.items[0].ordered).toBe(10);
    expect(tyden.totalMissing).toBe(10);
    expect(tyden.missingLiters).toBe(300);
    expect(tyden.items[0].orders).toHaveLength(2);
  });

  // Souhrn musí vždy odpovídat součtu dnů — právě tím, že se počítá z nich
  // a ne vlastní cestou, se nemůže rozejít (bývalá záložka „Potřeba stočit
  // KEGy" ukazovala jiná čísla než denní rozpad).
  it('nikdy se nerozejde se součtem dnů', () => {
    const plans = computeKeggingPlan({
      beers, packages, weekKey: WEEK,
      orders: [objednavka('o1', '2026-08-25'), objednavka('o2', '2026-08-27'), objednavka('o3', '2026-08-28')],
      orderItems: [polozka('o1', 'b-des', 'p30', 4), polozka('o2', 'b-11', 'p50', 6), polozka('o3', 'b-des', 'p30', 2)],
      keggingRows: [{ entry_date: '2026-08-24', beer_id: 'b-des', package_id: 'p30', quantity: 5 }],
    });
    const tyden = mergeWeekPlan(plans, 'T');
    expect(tyden.totalMissing).toBe(plans.reduce((s, p) => s + p.totalMissing, 0));
    expect(tyden.totalOrdered).toBe(plans.reduce((s, p) => s + p.totalOrdered, 0));
    expect(tyden.totalDone).toBe(plans.reduce((s, p) => s + p.totalDone, 0));
  });
});

// Odškrtávátko je pracovní pomůcka, ne evidence stáčení. Do `kegging` nic
// nezapisuje, takže se s ním musí počítat zvlášť — a hlavně se nesmí sečíst
// se skutečným stočením, protože stáčeč běžně udělá obojí.
describe('ruční odškrtnutí (kegging_plan_checks)', () => {
  const objednavka = (id: string, date: string) => ({
    id, delivery_date: date, order_date: date, status: 'nova', place_name: 'Hospoda', is_delivered: false,
  });
  const zaklad = {
    beers, packages, weekKey: WEEK,
    orders: [objednavka('o1', '2026-08-26')],
    orderItems: [{ id: 'oi-1', order_id: 'o1', beer_id: 'b-des', package_id: 'p30', quantity: 10 }],
  };
  const check = (qty: number) => [{ week_key: WEEK, day: 'st', beer_id: 'b-des', package_id: 'p30', qty }];
  const st = (over: any) => computeKeggingPlan({ keggingRows: [], ...zaklad, ...over }).find((p) => p.day === 'st')!;

  it('odškrtnutí sníží „chybí", i když se nic nestočilo', () => {
    const d = st({ checkRows: check(4) });
    expect(d.totalMissing).toBe(6);
    expect(d.items[0].checked).toBe(4);
    expect(d.items[0].autoDone).toBe(0);
  });

  it('odškrtnutí a stejné stočení se NEsečtou', () => {
    const d = st({
      checkRows: check(4),
      keggingRows: [{ entry_date: '2026-08-25', beer_id: 'b-des', package_id: 'p30', quantity: 4 }],
    });
    // 4 odškrtnuté a 4 stočené jsou tytéž sudy — ne osm.
    expect(d.totalMissing).toBe(6);
    expect(d.items[0].done).toBe(4);
  });

  it('vyšší z obou rozhoduje', () => {
    const d = st({
      checkRows: check(2),
      keggingRows: [{ entry_date: '2026-08-25', beer_id: 'b-des', package_id: 'p30', quantity: 7 }],
    });
    expect(d.items[0].done).toBe(7);
    expect(d.totalMissing).toBe(3);
  });

  it('odškrtnout jde nejvýš tolik, kolik je objednáno', () => {
    expect(st({ checkRows: check(99) }).items[0].checked).toBe(10);
  });

  it('odškrtnutí z jiného týdne nebo dne se nepoužije', () => {
    expect(st({ checkRows: [{ week_key: '2026-34', day: 'st', beer_id: 'b-des', package_id: 'p30', qty: 10 }] }).totalMissing).toBe(10);
    expect(st({ checkRows: [{ week_key: WEEK, day: 'pa', beer_id: 'b-des', package_id: 'p30', qty: 10 }] }).totalMissing).toBe(10);
  });
});
