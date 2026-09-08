import { describe, it, expect } from 'vitest';
import { computeKeggingPlan, dayKeyFromISO, mergeWeekPlan, datumProDenVTydnu, rozpadPoObalech } from './keggingPlan';

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

  // ── HLÁŠENÍ Z PROVOZU 8. 9. 2026 ────────────────────────────────────────
  // „Mám tam na úterý co stočit sudy, některý co se mají stočit až ve středu."
  //
  // Objednávka bez uvedeného dne dovozu se plánovala na den, kdy se ZADALA
  // (`order_date`) — u WhatsApp objednávky je to den, kdy ji někdo schválil.
  // Kdo v úterý schválil objednávku na středu, u které AI den nevytáhla,
  // dostal její sudy na úterý. Appka to ale nemůže vědět, takže si to nesmí
  // domýšlet: patří do vlastní přihrádky „bez termínu", kde je vidět a dá se
  // s tím něco udělat.
  describe('objednávka bez uvedeného dne dovozu', () => {
    it('se NEPLÁNUJE na den, kdy se zadala', () => {
      // Zadáno v úterý 25. 8., žádný den ani datum dovozu.
      const p = plan({
        orders: [{ id: 'o1', delivery_date: null, delivery_day: null, order_date: '2026-08-25', status: 'nova', place_name: 'Hospoda' }],
        orderItems: [polozka('o1', 'b-des', 'p30', 4)],
      });
      expect(day(p, 'ut').totalOrdered).toBe(0);
    });

    it('ale nezmizí — čeká v přihrádce „bez termínu"', () => {
      // Zmizet by bylo horší než špatný den: nikdo by ty sudy nestočil.
      const p = plan({
        orders: [{ id: 'o1', delivery_date: null, delivery_day: null, order_date: '2026-08-25', status: 'nova', place_name: 'Hospoda' }],
        orderItems: [polozka('o1', 'b-des', 'p30', 4)],
      });
      expect(day(p, 'bez').totalOrdered).toBe(4);
      expect(day(p, 'bez').totalMissing).toBe(4);
    });

    it('počítá se do týdenního součtu — stočit se musí tak jako tak', () => {
      const p = plan({
        orders: [{ id: 'o1', delivery_date: null, delivery_day: null, order_date: '2026-08-25', status: 'nova', place_name: 'Hospoda' }],
        orderItems: [polozka('o1', 'b-des', 'p30', 4)],
      });
      expect(mergeWeekPlan(p, 'týden').totalMissing).toBe(4);
    });

    it('zásobu z chlaďáku dostanou nejdřív dny s termínem', () => {
      // Stočené sudy patří přednostně tomu, co se opravdu veze; teprve zbytek
      // pokrývá objednávky, u kterých se ještě neví kdy.
      const p = plan({
        orders: [
          objednavka('o1', '2026-08-26'),
          { id: 'o2', delivery_date: null, delivery_day: null, order_date: '2026-08-25', status: 'nova', place_name: 'Hospoda' },
        ],
        orderItems: [polozka('o1', 'b-des', 'p30', 3), polozka('o2', 'b-des', 'p30', 3)],
        keggingRows: [{ entry_date: '2026-08-24', beer_id: 'b-des', package_id: 'p30', quantity: 3 }],
      });
      expect(day(p, 'st').totalMissing).toBe(0);
      expect(day(p, 'bez').totalMissing).toBe(3);
    });

    it('stačí SAMOTNÝ den dovozu — pak se plánuje podle něj', () => {
      // Objednávka z duplikace („To co posledně") nemá datum, jen den.
      const p = plan({
        orders: [{ id: 'o1', delivery_date: null, delivery_day: 'st', order_date: '2026-08-25', status: 'nova', place_name: 'Hospoda' }],
        orderItems: [polozka('o1', 'b-des', 'p30', 4)],
      });
      expect(day(p, 'st').totalOrdered).toBe(4);
      expect(day(p, 'bez').totalOrdered).toBe(0);
    });
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

describe('datumProDenVTydnu — přehození dne musí posunout i datum', () => {
  // `delivery_day` a `delivery_date` popisují tutéž věc. Dřív se při přehození
  // dne měnil jen den, takže si mohla odporovat: plán stáčení se řídí dnem,
  // ale filtr týdne, Závoz a přehledy datem.
  it('najde datum dne ve stejném týdnu', () => {
    // Středa 26. 8. 2026 → úterý téhož týdne je 25. 8.
    expect(datumProDenVTydnu('ut', '2026-08-26')).toBe('2026-08-25');
    expect(datumProDenVTydnu('pa', '2026-08-26')).toBe('2026-08-28');
  });

  it('funguje i z pondělí a z neděle — týden začíná pondělím', () => {
    expect(datumProDenVTydnu('ne', '2026-08-24')).toBe('2026-08-30');
    expect(datumProDenVTydnu('po', '2026-08-30')).toBe('2026-08-24');
  });

  it('stejný den vrátí totéž datum', () => {
    expect(datumProDenVTydnu('st', '2026-08-26')).toBe('2026-08-26');
  });

  it('neznámý den ani nesmyslné datum nic nemění', () => {
    // Volající pak `delivery_date` nechá být — radši staré datum než vymyšlené.
    expect(datumProDenVTydnu('xx', '2026-08-26')).toBeNull();
    expect(datumProDenVTydnu('ut', 'nesmysl')).toBeNull();
  });

  it('po přehození dne sedí plán stáčení s datem dovozu', () => {
    // Celý smysl: den i datum ukazují na totéž, takže je jedno, podle čeho
    // se která obrazovka řídí.
    const kotva = '2026-08-26';
    const noveDatum = datumProDenVTydnu('pa', kotva)!;
    expect(dayKeyFromISO(noveDatum)).toBe('pa');
  });
});

describe('rozpadPoObalech — kolik čeho zbývá stočit', () => {
  // Z provozu: „musí tam být i přehled, kolik jednotlivých KEG sudů zbývá
  // stočit — kolik dohromady třicítek, padesátek atd." U linky se chystají
  // OBALY, ne piva: prázdné sudy se tahají po velikostech.
  const den = (items: any[]): any => ({
    day: 'st', label: 'Středa', date: '2026-08-26', items,
    totalOrdered: 0, totalDone: 0, totalMissing: 0, missingLiters: 0,
  });
  const polozka = (package_id: string, package_label: string, volume_l: number, ordered: number, missing: number) => ({
    key: `${package_id}`, beer_id: 'b', beer_name: 'Pivo', package_id, package_label, volume_l,
    ordered, done: ordered - missing, autoDone: ordered - missing, checked: 0, missing, orders: [],
  });

  it('sečte stejný obal přes všechna piva', () => {
    // Tři piva ve třicítkách → jedna třicítková položka se součtem.
    const r = rozpadPoObalech(den([
      { ...polozka('p30', 'KEG 30l', 30, 5, 3), beer_id: 'des' },
      { ...polozka('p30', 'KEG 30l', 30, 4, 2), beer_id: '11sv' },
      { ...polozka('p30', 'KEG 30l', 30, 2, 1), beer_id: 'jantar' },
    ]));
    expect(r).toHaveLength(1);
    expect(r[0].missing).toBe(6);
    expect(r[0].ordered).toBe(11);
  });

  it('řadí od největšího sudu — tak se o nich mluví i tak se staví na paletu', () => {
    const r = rozpadPoObalech(den([
      polozka('p20', 'KEG 20l', 20, 2, 2),
      polozka('p50', 'KEG 50l', 50, 3, 3),
      polozka('p30', 'KEG 30l', 30, 4, 4),
    ]));
    expect(r.map((x) => x.package_label)).toEqual(['KEG 50l', 'KEG 30l', 'KEG 20l']);
  });

  it('počítá litry z chybějících kusů, ne z objednaných', () => {
    // 5 objednaných třicítek, 2 chybí → 60 L, ne 150 L.
    const r = rozpadPoObalech(den([polozka('p30', 'KEG 30l', 30, 5, 2)]));
    expect(r[0].missingLiters).toBe(60);
  });

  it('obal, který je celý hotový, v rozpadu zůstane s nulou', () => {
    // Zmizet nesmí: „padesátky 0" je informace „hotovo", prázdné místo
    // vypadá jako by se na ně zapomnělo. Skrývání řeší až obrazovka.
    const r = rozpadPoObalech(den([
      polozka('p50', 'KEG 50l', 50, 3, 0),
      polozka('p30', 'KEG 30l', 30, 4, 4),
    ]));
    expect(r).toHaveLength(2);
    expect(r.find((x) => x.package_label === 'KEG 50l')!.missing).toBe(0);
  });

  it('prázdný den dá prázdný rozpad', () => {
    expect(rozpadPoObalech(den([]))).toEqual([]);
  });

  it('sedí se součtem celého plánu', () => {
    // Kdyby se rozešly, ukazovala by obrazovka dvě různá čísla o téže věci.
    const p = plan({
      orders: [{ id: 'o1', delivery_date: '2026-08-26', order_date: '2026-08-26', status: 'nova', place_name: 'Hospoda' }],
      orderItems: [
        { id: 'r1', order_id: 'o1', beer_id: 'b-des', package_id: 'p30', quantity: 4 },
        { id: 'r2', order_id: 'o1', beer_id: 'b-11', package_id: 'p50', quantity: 3 },
      ],
    });
    const streda = day(p, 'st');
    const soucet = rozpadPoObalech(streda).reduce((s, x) => s + x.missing, 0);
    expect(soucet).toBe(streda.totalMissing);
    expect(soucet).toBe(7);
  });
});
