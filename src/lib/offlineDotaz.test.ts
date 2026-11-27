// Místní odpověď na dotaz nad kopií tabulky v telefonu (offline). Majitel 27. 11. 2026: „napíše to, že to je
// offline, a neukážou se mi žádný data." Data i jména jsou vymyšlená (repozitář je veřejný); tvary dotazů jsou
// ty, které appka opravdu posílá (plocha, Objednávky, Stáčení, Sklad).
import { describe, expect, it } from 'vitest';
import { hodnotySeznamu, vyhodnotDotaz, type Radek } from './offlineDotaz';

const OBJEDNAVKY: Radek[] = [
  { id: 'o1', place_name: 'Hospoda U Lípy', status: 'nova', is_delivered: false, delivery_date: '2026-11-25', order_date: '2026-11-23', created_at: '2026-11-23T08:00:00+00:00', note: null, no_delivery: false },
  { id: 'o2', place_name: 'Bistro Mlýn', status: 'nova', is_delivered: true, delivery_date: '2026-11-27', order_date: '2026-11-26', created_at: '2026-11-26T09:30:00.5+00:00', note: 'do jejich sudu', no_delivery: false },
  { id: 'o3', place_name: 'Kavárna Sad', status: 'storno', is_delivered: false, delivery_date: null, order_date: '2026-11-20', created_at: '2026-11-20T10:00:00+00:00', note: 'zrušeno', no_delivery: true },
  { id: 'o4', place_name: 'penzion Skála', status: 'vyrizeno_zavoz', is_delivered: true, delivery_date: '2026-12-18', order_date: '2026-11-27', created_at: '2026-11-27T07:46:35.123456+00:00', note: null, no_delivery: false },
];
const POLOZKY: Radek[] = [
  { id: 'p1', order_id: 'o1', beer_id: 'b12', package_id: 'k50', quantity: 2 },
  { id: 'p2', order_id: 'o1', beer_id: 'b10', package_id: 'l1', quantity: 12 },
  { id: 'p3', order_id: 'o2', beer_id: 'b12', package_id: 'k20', quantity: 1 },
  { id: 'p4', order_id: null, beer_id: 'b12', package_id: 'k20', quantity: 0.5 },
];
const TABULKY: Record<string, Radek[]> = { orders: OBJEDNAVKY, order_items: POLOZKY, prazdna: [] };
const zdroj = (t: string) => TABULKY[t] ?? null;
const dotaz = (tabulka: string, q: string) => vyhodnotDotaz(tabulka, new URLSearchParams(q), zdroj);
const idcka = (tabulka: string, q: string) => dotaz(tabulka, q)?.radky.map((r) => r.id);

describe('vyhodnotDotaz — filtry', () => {
  it('bez filtru vrátí celou tabulku (kopii řádků, ne tytéž objekty)', () => {
    const v = dotaz('orders', 'select=*')!;
    expect(v.radky).toEqual(OBJEDNAVKY);
    expect(v.radky[0]).not.toBe(OBJEDNAVKY[0]);
    expect(v.celkem).toBe(4);
  });

  it('eq a neq na textu, čísle, datu a pravdě/nepravdě', () => {
    expect(idcka('orders', 'status=eq.nova')).toEqual(['o1', 'o2']);
    expect(idcka('orders', 'status=neq.nova')).toEqual(['o3', 'o4']);
    expect(idcka('orders', 'delivery_date=eq.2026-11-27')).toEqual(['o2']);
    expect(idcka('orders', 'is_delivered=eq.false')).toEqual(['o1', 'o3']);
    expect(idcka('order_items', 'quantity=eq.12')).toEqual(['p2']);
    expect(idcka('order_items', 'quantity=eq.0.5')).toEqual(['p4']);
  });

  it('porovnání s NULL je „nevím": řádek se nevrátí ani u neq, ani u not.eq (jako v databázi)', () => {
    // o3 má delivery_date NULL.
    expect(idcka('orders', 'delivery_date=neq.2026-11-27')).toEqual(['o1', 'o4']);
    expect(idcka('orders', 'delivery_date=not.eq.2026-11-27')).toEqual(['o1', 'o4']);
    expect(idcka('orders', 'delivery_date=not.in.(2026-11-27)')).toEqual(['o1', 'o4']);
    expect(idcka('orders', 'note=neq.zrušeno')).toEqual(['o2']);
  });

  it('gt, gte, lt, lte na datech a číslech', () => {
    expect(idcka('orders', 'delivery_date=gte.2026-11-27')).toEqual(['o2', 'o4']);
    expect(idcka('orders', 'delivery_date=gt.2026-11-27')).toEqual(['o4']);
    expect(idcka('orders', 'delivery_date=lt.2026-11-27')).toEqual(['o1']);
    expect(idcka('orders', 'delivery_date=lte.2026-11-27')).toEqual(['o1', 'o2']);
    expect(idcka('order_items', 'quantity=gt.1')).toEqual(['p1', 'p2']);
    expect(idcka('order_items', 'quantity=lte.1')).toEqual(['p3', 'p4']);
  });

  it('čas se porovnává jako čas, ne jako text: jiný zápis pásma a zlomků vteřin nevadí', () => {
    // created_at o2 = 09:30:00.5 UTC
    expect(idcka('orders', 'created_at=gte.2026-11-26T09:30:00.500Z')).toEqual(['o2', 'o4']);
    expect(idcka('orders', 'created_at=gt.2026-11-26T10:30:00.5%2B01:00')).toEqual(['o4']);
    expect(idcka('orders', 'created_at=eq.2026-11-26T09:30:00.500000%2B00:00')).toEqual(['o2']);
    // Jen datum proti času = půlnoc UTC toho dne.
    expect(idcka('orders', 'created_at=gte.2026-11-26')).toEqual(['o2', 'o4']);
    expect(idcka('orders', 'created_at=lt.2026-11-23')).toEqual(['o3']);
  });

  it('in se seznamem, i s uvozovkami a čárkou v hodnotě', () => {
    expect(idcka('orders', 'id=in.(o1,o4)')).toEqual(['o1', 'o4']);
    expect(idcka('orders', 'status=in.(nova,storno)')).toEqual(['o1', 'o2', 'o3']);
    expect(idcka('orders', 'place_name=in.("Hospoda U Lípy","Bistro Mlýn")')).toEqual(['o1', 'o2']);
    expect(idcka('orders', 'id=not.in.(o1,o4)')).toEqual(['o2', 'o3']);
    expect(idcka('order_items', 'quantity=in.(1,2)')).toEqual(['p1', 'p3']);
    expect(hodnotySeznamu('(a,"b,c", d )')).toEqual(['a', 'b,c', 'd']);
    expect(hodnotySeznamu('()')).toEqual([]);
    expect(hodnotySeznamu('("")')).toEqual(['']);
  });

  it('is.null, not.is.null, is.true, is.false', () => {
    expect(idcka('orders', 'delivery_date=is.null')).toEqual(['o3']);
    expect(idcka('orders', 'delivery_date=not.is.null')).toEqual(['o1', 'o2', 'o4']);
    expect(idcka('orders', 'is_delivered=is.true')).toEqual(['o2', 'o4']);
    expect(idcka('orders', 'no_delivery=is.false')).toEqual(['o1', 'o2', 'o4']);
    expect(idcka('order_items', 'order_id=is.null')).toEqual(['p4']);
  });

  it('like a ilike s hvězdičkou i procentem', () => {
    expect(idcka('orders', 'place_name=like.*Mlýn')).toEqual(['o2']);
    expect(idcka('orders', 'place_name=ilike.*SK%25')).toEqual(['o4']);
    expect(idcka('orders', 'place_name=like.*sk*')).toEqual([]);            // like rozlišuje velikost
    expect(idcka('orders', 'place_name=ilike.*martin*')).toEqual([]);
    expect(idcka('orders', 'note=not.ilike.*sud*')).toEqual(['o3']);        // NULL poznámky vypadnou
  });

  it('víc filtrů naráz = A ZÁROVEŇ', () => {
    expect(idcka('orders', 'status=eq.nova&is_delivered=eq.false')).toEqual(['o1']);
    expect(idcka('orders', 'delivery_date=gte.2026-11-23&delivery_date=lte.2026-11-29')).toEqual(['o1', 'o2']);
  });

  it('skupina or=(…) tak, jak ji posílá appka; null hodnoty v ní neshodí celý řádek', () => {
    expect(idcka('orders', 'or=(delivery_date.gte.2026-11-27,order_date.gte.2026-11-27)')).toEqual(['o2', 'o4']);
    // o3: delivery_date NULL (nevím), is_delivered false → true
    expect(idcka('orders', 'status=neq.storno&or=(is_delivered.eq.false,delivery_date.gte.2026-11-26,created_at.gte.2026-11-27T00:00:00Z)'))
      .toEqual(['o1', 'o2', 'o4']);
    expect(idcka('orders', 'or=(delivery_date.is.null,status.eq.vyrizeno_zavoz)')).toEqual(['o3', 'o4']);
  });

  it('vnořené skupiny, and=(…) a not.or=(…)', () => {
    expect(idcka('orders', 'or=(and(status.eq.nova,is_delivered.eq.true),id.eq.o3)')).toEqual(['o2', 'o3']);
    expect(idcka('orders', 'and=(status.eq.nova,or(id.eq.o1,id.in.(o2,o9)))')).toEqual(['o1', 'o2']);
    expect(idcka('orders', 'not.or=(status.eq.nova,status.eq.storno)')).toEqual(['o4']);
    expect(idcka('orders', 'or=(not.and(status.eq.nova,is_delivered.eq.false),id.eq.o1)')).toEqual(['o1', 'o2', 'o3', 'o4']);
  });

  it('prázdná tabulka dá prázdný výsledek, i s filtrem a výběrem sloupců', () => {
    expect(dotaz('prazdna', 'select=id,cokoliv&cokoliv=eq.1')).toEqual({ radky: [], celkem: 0 });
  });
});

describe('vyhodnotDotaz — řazení, stránkování, počet', () => {
  it('řazení vzestupně a sestupně; NULL vzestupně na konci, sestupně na začátku (jako v databázi)', () => {
    expect(idcka('orders', 'order=delivery_date.asc')).toEqual(['o1', 'o2', 'o4', 'o3']);
    expect(idcka('orders', 'order=delivery_date.desc')).toEqual(['o3', 'o4', 'o2', 'o1']);
    expect(idcka('orders', 'order=delivery_date.desc.nullslast')).toEqual(['o4', 'o2', 'o1', 'o3']);
    expect(idcka('orders', 'order=delivery_date.asc.nullsfirst')).toEqual(['o3', 'o1', 'o2', 'o4']);
    expect(idcka('orders', 'order=delivery_date')).toEqual(['o1', 'o2', 'o4', 'o3']);
  });

  it('víc sloupců; čísla číselně, časy jako čas', () => {
    expect(idcka('orders', 'order=is_delivered.desc,created_at.desc')).toEqual(['o4', 'o2', 'o1', 'o3']);
    expect(idcka('order_items', 'order=quantity.desc')).toEqual(['p2', 'p1', 'p3', 'p4']);
    expect(idcka('order_items', 'order=beer_id.asc,quantity.asc')).toEqual(['p2', 'p4', 'p3', 'p1']);
  });

  it('offset a limit řežou až PO filtru a seřazení; `celkem` je počet před řezem', () => {
    const v = dotaz('orders', 'order=created_at.asc&offset=1&limit=2')!;
    expect(v.radky.map((r) => r.id)).toEqual(['o1', 'o2']);
    expect(v.celkem).toBe(4);
    expect(dotaz('orders', 'status=eq.nova&limit=1')).toMatchObject({ celkem: 2 });
    expect(idcka('orders', 'offset=10&limit=1000')).toEqual([]);
    expect(idcka('orders', 'limit=0')).toEqual([]);
    expect(idcka('orders', 'order=created_at.desc&limit=1')).toEqual(['o4']);
  });
});

describe('vyhodnotDotaz — výběr sloupců', () => {
  it('jen vyjmenované sloupce, v daném pořadí; přejmenování přes dvojtečku', () => {
    expect(dotaz('orders', 'select=id,status&id=eq.o1')!.radky).toEqual([{ id: 'o1', status: 'nova' }]);
    expect(dotaz('orders', 'select=kdo:place_name,id&id=eq.o1')!.radky).toEqual([{ kdo: 'Hospoda U Lípy', id: 'o1' }]);
    expect(dotaz('orders', 'select=id, status &id=eq.o1')!.radky).toEqual([{ id: 'o1', status: 'nova' }]);
  });

  it('vnoření „mnoho": objednávka s položkami (i přejmenované), bez položek prázdné pole', () => {
    const v = dotaz('orders', 'select=id,place_name,status,order_items(quantity)&id=in.(o1,o3)')!;
    expect(v.radky).toEqual([
      { id: 'o1', place_name: 'Hospoda U Lípy', status: 'nova', order_items: [{ quantity: 2 }, { quantity: 12 }] },
      { id: 'o3', place_name: 'Kavárna Sad', status: 'storno', order_items: [] },
    ]);
    const p = dotaz('orders', 'select=place_name,items:order_items(beer_id,package_id,quantity)&id=eq.o2')!;
    expect(p.radky).toEqual([{ place_name: 'Bistro Mlýn', items: [{ beer_id: 'b12', package_id: 'k20', quantity: 1 }] }]);
  });

  it('vnoření „jeden": položka s objednávkou; bez objednávky null', () => {
    const v = dotaz('order_items', 'select=id,orders(place_name)&id=in.(p3,p4)')!;
    expect(v.radky).toEqual([{ id: 'p3', orders: { place_name: 'Bistro Mlýn' } }, { id: 'p4', orders: null }]);
  });

  it('hvězdička s vnořením: všechny sloupce + vnořené řádky celé', () => {
    const v = dotaz('orders', 'select=*,order_items(*)&id=eq.o2')!;
    expect(v.radky[0]).toEqual({ ...OBJEDNAVKY[1], order_items: [POLOZKY[2]] });
  });
});

describe('vyhodnotDotaz — co neumí, to nehádá (vrátí null)', () => {
  const NEUMI: [string, string, string][] = [
    ['tabulka, kterou telefon nemá', 'neznama', 'select=*'],
    ['jiný operátor (cs)', 'orders', 'note=cs.{a}'],
    ['fulltext', 'orders', 'note=fts.sud'],
    ['is s jinou hodnotou', 'orders', 'note=is.unknown'],
    ['neznámý sloupec ve filtru', 'orders', 'neexistuje=eq.1'],
    ['neznámý sloupec ve výběru', 'orders', 'select=id,neexistuje'],
    ['neznámý sloupec v řazení', 'orders', 'order=neexistuje.asc'],
    ['neznámý sloupec uvnitř or', 'orders', 'or=(neexistuje.eq.1,id.eq.o1)'],
    ['filtr na vnořené tabulce', 'orders', 'select=id,order_items(quantity)&order_items.quantity=gt.1'],
    ['JSON cesta ve filtru', 'orders', 'note->>x=eq.1'],
    ['přetypování ve výběru', 'orders', 'select=id,delivery_date::text'],
    ['JSON cesta ve výběru', 'orders', 'select=id,note->x'],
    ['neznámé vnoření', 'orders', 'select=id,places(name)'],
    ['vnoření s !inner', 'orders', 'select=id,order_items!inner(quantity)'],
    ['neznámý sloupec ve vnoření', 'orders', 'select=id,order_items(neexistuje)'],
    ['řazení podle vnořené tabulky', 'orders', 'select=id,order_items(quantity)&order=order_items(quantity).asc'],
    ['číslo porovnávané s textem', 'order_items', 'quantity=eq.dva'],
    ['pravda/nepravda porovnávaná s textem', 'orders', 'is_delivered=eq.ano'],
    ['záporný limit', 'orders', 'limit=-1'],
    ['rozbitá skupina', 'orders', 'or=(status.eq.nova'],
    ['prázdná skupina', 'orders', 'or=()'],
    ['výraz bez operátoru', 'orders', 'status=nova'],
  ];
  for (const [co, tabulka, q] of NEUMI) {
    it(co, () => { expect(dotaz(tabulka, q)).toBeNull(); });
  }

  it('chybí-li kopie VNOŘENÉ tabulky, taky neumí', () => {
    const bezPolozek = (t: string) => (t === 'orders' ? OBJEDNAVKY : null);
    expect(vyhodnotDotaz('orders', new URLSearchParams('select=id,order_items(quantity)'), bezPolozek)).toBeNull();
  });

  it('parametry, které nejsou filtr (on_conflict, columns), nevadí', () => {
    expect(idcka('orders', 'on_conflict=id&columns=id&id=eq.o1')).toEqual(['o1']);
  });
});

describe('vyhodnotDotaz — dotazy tak, jak je posílá appka', () => {
  it('stáčení dne, plán týdne, objednávky na dnešek s položkami', () => {
    TABULKY.kegging = [
      { id: 'k1', entry_date: '2026-11-27', beer_id: 'b12', package_id: 'k50', quantity: 4, note: null, created_at: '2026-11-27T06:00:00+00:00' },
      { id: 'k2', entry_date: '2026-11-26', beer_id: 'b12', package_id: 'k50', quantity: 2, note: '[mimo-sklad]', created_at: '2026-11-26T06:00:00+00:00' },
    ];
    TABULKY.kegging_plan_checks = [
      { id: 'c1', week_key: '2026-48', day: 'st', beer_id: 'b12', package_id: 'k50', qty: 3 },
      { id: 'c2', week_key: '2026-47', day: 'st', beer_id: 'b12', package_id: 'k50', qty: 9 },
    ];
    expect(dotaz('kegging', 'select=entry_date,beer_id,package_id,quantity&entry_date=eq.2026-11-27&offset=0&limit=1000')).toEqual({
      radky: [{ entry_date: '2026-11-27', beer_id: 'b12', package_id: 'k50', quantity: 4 }], celkem: 1,
    });
    expect(dotaz('kegging_plan_checks', 'select=week_key,day,beer_id,package_id,qty&week_key=eq.2026-48&offset=0&limit=1000')!.radky)
      .toEqual([{ week_key: '2026-48', day: 'st', beer_id: 'b12', package_id: 'k50', qty: 3 }]);
    expect(dotaz('orders', 'select=id,place_name,status,order_items(quantity)&delivery_date=eq.2026-11-27&status=neq.storno')!.radky)
      .toEqual([{ id: 'o2', place_name: 'Bistro Mlýn', status: 'nova', order_items: [{ quantity: 1 }] }]);
    expect(idcka('order_items', 'select=id,order_id,package_id,quantity,beer_id&order_id=in.(o1,o2)&offset=0&limit=1000')).toEqual(['p1', 'p2', 'p3']);
  });

  it('DRUHÝ DEN bez signálu: dotaz s novým datem dostane odpověď z téže kopie (dřív prázdno)', () => {
    // Včera se signálem se nikdo na 28. 11. neptal — přesná adresa v paměti není. Kopie tabulky ale ano.
    expect(dotaz('orders', 'select=id&delivery_date=eq.2026-11-28&status=neq.storno')).toEqual({ radky: [], celkem: 0 });
    expect(idcka('orders', 'select=id&delivery_date=gte.2026-11-28&status=neq.storno')).toEqual(['o4']);
  });
});
