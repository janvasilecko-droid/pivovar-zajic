import { describe, expect, it } from 'vitest';
import { navrhniPripojeniZapsaneho, otevrenePolozkyVlastnich, priradDoVlastnich, rozdelRadkyNaVlastni } from './stoceniDoVlastnich';

const obaly = [
  { id: 'k30', kind: 'keg', volume_l: 30 },
  { id: 'k15', kind: 'keg', volume_l: 15 },
  { id: 'k50', kind: 'keg', volume_l: 50 },
];
const objednavky = [
  { id: 'o1', place_name: 'Duck and Dog', status: 'nova', is_delivered: false, delivery_date: '2026-10-09' },
  { id: 'o2', place_name: 'Michal fojtovice', status: 'nova', is_delivered: false, delivery_date: '2026-10-08' },
  { id: 'o3', place_name: 'Martin', status: 'nova', is_delivered: false, delivery_date: '2026-10-08' },
  { id: 'o4', place_name: 'Restaurace U Zajíce', status: 'nova', is_delivered: false, delivery_date: '2026-10-08' },
  { id: 'o5', place_name: 'Duck and Dog', status: 'storno', is_delivered: false, delivery_date: '2026-10-08' },
  { id: 'o6', place_name: 'Duck and Dog', status: 'nova', is_delivered: true, delivery_date: '2026-10-01' },
];
const polozky = [
  { id: 'i1', order_id: 'o1', beer_id: 'b12', package_id: 'k30', quantity: 2 },
  { id: 'i2', order_id: 'o2', beer_id: 'b12', package_id: 'k30', quantity: 3 },
  { id: 'i3', order_id: 'o3', beer_id: 'b12', package_id: 'k15', quantity: 1 },
  { id: 'i3b', order_id: 'o3', beer_id: 'b12', package_id: 'k50', quantity: 1 },
  { id: 'i4', order_id: 'o4', beer_id: 'b12', package_id: 'k30', quantity: 5 },
  { id: 'i5', order_id: 'o5', beer_id: 'b12', package_id: 'k30', quantity: 1 },
  { id: 'i6', order_id: 'o6', beer_id: 'b12', package_id: 'k30', quantity: 1 },
  { id: 'i7', order_id: 'o1', beer_id: 'b10', package_id: 'k30', quantity: 1 },
];

describe('stáčení do vlastních sudů odběratele', () => {
  it('nabídne jen otevřené položky odběratelů s vlastními sudy, nejdřívější napřed', () => {
    const o = otevrenePolozkyVlastnich({ objednavky, polozky, obaly, stoceni: [{ order_item_id: 'i7' }] });
    // Martin jen malé sudy (15 l ano, 50 l ne); běžná restaurace, storno,
    // zavezené a už stočená položka ne.
    expect(o.map((x) => x.polozkaId)).toEqual(['i2', 'i3', 'i1']);
  });

  // 8. 10. 2026: sklad se odepisuje automaticky ráno v den závozu, ne po
  // stočení — položka „odepsaná" proto NEZNAMENÁ, že odjela. Bez nabídky
  // „Do jejich sudů?" zůstalo „Zbývá stočit" i po zapsaném stáčení.
  it('položka odepsaná automatickým odpočtem závozu se nabízí dál', () => {
    const o = otevrenePolozkyVlastnich({ objednavky, polozky, obaly, stoceni: [] });
    expect(o.map((x) => x.polozkaId)).toEqual(['i2', 'i3', 'i1', 'i7']);
  });

  it('objednávka ve stavu Zavezeno se nenabízí', () => {
    const o = otevrenePolozkyVlastnich({
      objednavky: [{ id: 'oz', place_name: 'Duck and Dog', status: 'vyrizeno_zavoz', is_delivered: false, delivery_date: '2026-10-08' }],
      polozky: [{ id: 'iz', order_id: 'oz', beer_id: 'b12', package_id: 'k30', quantity: 2 }],
      obaly, stoceni: [],
    });
    expect(o).toEqual([]);
  });

  it('rozdělí řádek: část do sudů odběratelů, zbytek do sudů pivovaru', () => {
    const otevrene = otevrenePolozkyVlastnich({ objednavky, polozky, obaly, stoceni: [] });
    const radky = [{ beerId: 'b12', pkgId: 'k30', qty: '10', tankId: 't1' }, { beerId: 'b10', pkgId: 'k50', qty: '4', tankId: '' }];
    const prirazeni = priradDoVlastnich(radky.map((r) => ({ beerId: r.beerId, pkgId: r.pkgId, pocet: Number(r.qty) })), otevrene);
    expect(prirazeni).toEqual([
      { radek: 0, polozkaId: 'i2', odberatel: 'Michal fojtovice', kusu: 3 },
      { radek: 0, polozkaId: 'i1', odberatel: 'Duck and Dog', kusu: 2 },
    ]);
    const rozdelene = rozdelRadkyNaVlastni(radky, prirazeni);
    expect(rozdelene).toEqual([
      { beerId: 'b12', pkgId: 'k30', qty: '3', tankId: 't1', orderItemId: 'i2' },
      { beerId: 'b12', pkgId: 'k30', qty: '2', tankId: 't1', orderItemId: 'i1' },
      { beerId: 'b12', pkgId: 'k30', qty: '5', tankId: 't1', orderItemId: null },
      { beerId: 'b10', pkgId: 'k50', qty: '4', tankId: '', orderItemId: null },
    ]);
    // Součet kusů se nemění.
    expect(rozdelene.reduce((s, r) => s + Number(r.qty), 0)).toBe(14);
  });

  it('méně sudů, než odběratel chce: celý řádek jde k jeho položce', () => {
    const otevrene = otevrenePolozkyVlastnich({ objednavky, polozky, obaly, stoceni: [] });
    const prirazeni = priradDoVlastnich([{ beerId: 'b12', pkgId: 'k30', pocet: 1 }], otevrene);
    expect(prirazeni).toEqual([{ radek: 0, polozkaId: 'i2', odberatel: 'Michal fojtovice', kusu: 1 }]);
    expect(rozdelRadkyNaVlastni([{ qty: '1' }], prirazeni)).toEqual([{ qty: '1', orderItemId: 'i2' }]);
  });
});

// 8. 10. 2026: stáčení zapsané bez dotazu „Do jejich sudů?" zůstalo sudem
// pivovaru a „Zbývá stočit" u DaD se nehnulo.
describe('navrhniPripojeniZapsaneho', () => {
  const dd = [{ id: 'od', place_name: 'Duck and Dog', status: 'nova', is_delivered: false, delivery_date: '2026-10-08' }];
  const polDD = [
    { id: 'p50', order_id: 'od', beer_id: 'b11', package_id: 'k50', quantity: 10 },
    { id: 'p30', order_id: 'od', beer_id: 'b11', package_id: 'k30', quantity: 17 },
  ];
  const radek = (id: string, pkg: string, qty: number, extra: object = {}) => ({
    id, beer_id: 'b11', package_id: pkg, quantity: qty, entry_date: '2026-10-08', order_item_id: null, ...extra,
  });
  const navrh = (stoceni: ReturnType<typeof radek>[]) => navrhniPripojeniZapsaneho({
    objednavky: dd, polozky: polDD, obaly, stoceni, odData: '2026-10-05',
  });

  it('řádek, který sedí na položku DaD, navrhne připojit', () => {
    expect(navrh([radek('r1', 'k50', 10), radek('r2', 'k30', 17)]).map((n) => [n.radekId, n.polozkaId, n.kusu]))
      .toEqual([['r1', 'p50', 10], ['r2', 'p30', 17]]);
  });
  it('menší počet než objednávka se připojí celý (zbytek zůstane k stočení)', () => {
    expect(navrh([radek('r1', 'k50', 4)]).map((n) => [n.polozkaId, n.kusu])).toEqual([['p50', 4]]);
  });
  it('větší počet než položka se nenavrhuje (musel by se dělit)', () => {
    expect(navrh([radek('r1', 'k50', 14)])).toEqual([]);
  });
  it('už připojený řádek, jiné pivo, starší týden a lahve se nenavrhují', () => {
    expect(navrh([
      radek('r1', 'k50', 10, { order_item_id: 'p50' }),
      radek('r2', 'k30', 17, { beer_id: 'b12' }),
      radek('r3', 'k30', 17, { entry_date: '2026-10-02' }),
    ])).toEqual([]);
  });
  it('jedna položka dostane nejvýš jeden řádek', () => {
    const n = navrh([radek('r1', 'k50', 5), radek('r2', 'k50', 5)]);
    expect(n.map((x) => x.radekId)).toEqual(['r1']);
  });
  it('objednávka běžné restaurace se nenabízí', () => {
    const n = navrhniPripojeniZapsaneho({
      objednavky: [{ id: 'od', place_name: 'Restaurace U Zajíce', status: 'nova', is_delivered: false, delivery_date: '2026-10-08' }],
      polozky: polDD, obaly, stoceni: [radek('r1', 'k50', 10)], odData: '2026-10-05',
    });
    expect(n).toEqual([]);
  });
});
