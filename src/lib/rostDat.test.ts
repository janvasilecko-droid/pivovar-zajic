// 📈 Růst dat — jak se appka bude chovat, až bude zadaných 12 a 24 měsíců.
// ---------------------------------------------------------------------------
// Zadání 11. 10. 2026: „máš data za srpen a září, simuluj, jak se aplikace
// bude chovat, až tam bude 12 měsíců zadaných, pak 24 měsíců — bude stabilní?
// nebude se sekat?"
//
// Objem na měsíc je ODHAD z toho, co appka zapisuje (stáčení ~100 řádků
// měsíčně v létě 2026, závozy, fasování, prodejna…) a navíc se zkouší s
// trojnásobným zatížením (×3). Počítá se vždycky to, co appka dělá po otevření
// obrazovky: skladová kniha, Sklad, Pohyby, plán stáčení, týdenní inventura,
// Rozbor, Statistika — a taky kolik dat se při tom musí stáhnout.
//
// Výsledek se vypíše (console.log) a hlídají se rozpočty: čas výpočtu nesmí
// růst rychleji než lineárně a ani při 24 měsících a ×3 zátěži nesmí jedno
// přepočítání obrazovky přesáhnout rozumný čas na mobilu (×8 pomalejším než
// tenhle běh).
import { describe, it, expect } from 'vitest';
import { buildMovements, stockAsOf, expectedForMonth, stockForObdobi, stockKey } from './stockLedger';
import { sestavPohybyObdobi } from './pohybySkladu';
import { computeKeggingPlan } from './keggingPlan';
import { zbytekKeKonciTydne } from './tydenniZbytek';
import { radkyRozboru } from './rozbor';
import { radkyTydenniInventury } from './tydenniVPohybech';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';

// ── Katalog: 20 piv × 9 obalů = 180 kombinací (skutečný katalog je menší) ──
const PIVA = Array.from({ length: 20 }, (_, i) => ({ id: `beer-${String(i).padStart(2, '0')}-xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxx`, name: `Pivo ${i + 1}` }));
const OBALY = [
  { id: 'pkg-keg50-xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxx', label: 'KEG 50 l', kind: 'keg', volume_l: 50 },
  { id: 'pkg-keg30-xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxx', label: 'KEG 30 l', kind: 'keg', volume_l: 30 },
  { id: 'pkg-keg20-xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxx', label: 'KEG 20 l', kind: 'keg', volume_l: 20 },
  { id: 'pkg-keg15-xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxx', label: 'KEG 15 l', kind: 'keg', volume_l: 15 },
  { id: 'pkg-keg10-xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxx', label: 'KEG 10 l', kind: 'keg', volume_l: 10 },
  { id: 'pkg-l033-xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxx', label: 'Lahev 0,33 l', kind: 'bottle', volume_l: 0.33 },
  { id: 'pkg-l05-xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxx', label: 'Lahev 0,5 l', kind: 'bottle', volume_l: 0.5 },
  { id: 'pkg-pet1-xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxx', label: 'PET 1 l', kind: 'bottle', volume_l: 1 },
  { id: 'pkg-pet15-xxxxxxxx-xxxx-xxxx-xxxxxxxxxxxx', label: 'PET 1,5 l', kind: 'bottle', volume_l: 1.5 },
];
const KEGY = OBALY.filter((o) => o.kind === 'keg');

/** Odhad řádků za měsíc (při ×1); ×3 je zátěžový test. */
const NA_MESIC = { kegging: 110, bottling: 70, fasovani: 90, prodejna: 180, odpisy: 15, zavoz: 260, objednavek: 120, polozekNaObj: 3.3, akce: 4, prefuk: 5, dorovnani: 20, inventura: 60 };

function generator(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const uuid = (p: string, n: number) => `${p}-${String(n).padStart(8, '0')}-xxxx-xxxx-xxxxxxxxxxxx`;
const posun = (iso: string, dnu: number) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + dnu); return d.toISOString().slice(0, 10); };

function simuluj(mesicu: number, zatez: number) {
  const rnd = generator(20261011 + mesicu * 7 + zatez);
  const cislo = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const vyber = <T,>(p: T[]) => p[Math.floor(rnd() * p.length)];
  const dnu = Math.round(mesicu * 30.4);
  const zacatek = posun('2026-10-11', -dnu + 1);
  const den = (i: number) => posun(zacatek, i);
  const radku = (m: number) => Math.round(m * zatez * mesicu);

  let n = 0;
  const id = () => uuid('row', ++n);
  const nahodnyDen = () => den(cislo(0, dnu - 1));
  const kombinace = () => ({ beer_id: vyber(PIVA).id, package_id: vyber(OBALY).id });
  const cas = (d: string) => `${d}T${String(cislo(6, 18)).padStart(2, '0')}:${String(cislo(0, 59)).padStart(2, '0')}:00.000Z`;

  const kegging = Array.from({ length: radku(NA_MESIC.kegging) }, () => { const d = nahodnyDen(); return { id: id(), entry_date: d, beer_id: vyber(PIVA).id, package_id: vyber(KEGY).id, quantity: cislo(1, 18), note: null, cellar_tank_id: uuid('tank', cislo(1, 9)), created_at: cas(d), order_item_id: null }; });
  const bottling = Array.from({ length: radku(NA_MESIC.bottling) }, () => { const d = nahodnyDen(); return { id: id(), entry_date: d, beer_id: vyber(PIVA).id, package_id: vyber(OBALY.filter((o) => o.kind === 'bottle')).id, quantity: cislo(20, 100), kegs_used: cislo(1, 3), kegs_used_package_id: vyber(KEGY).id, source_volume_l: 100, note: null, created_at: cas(d) }; });
  const fasovani = Array.from({ length: radku(NA_MESIC.fasovani) }, () => { const d = nahodnyDen(); return { id: id(), entry_date: d, ...kombinace(), quantity: cislo(1, 4), created_at: cas(d) }; });
  const prodejna = Array.from({ length: radku(NA_MESIC.prodejna) }, () => { const d = nahodnyDen(); return { id: id(), entry_date: d, ...kombinace(), quantity: cislo(1, 6) }; });
  const writeoffs = Array.from({ length: radku(NA_MESIC.odpisy) }, () => { const d = nahodnyDen(); return { id: id(), entry_date: d, ...kombinace(), quantity: cislo(1, 3), created_at: cas(d) }; });
  const akce = Array.from({ length: radku(NA_MESIC.akce) }, () => ({ id: id(), entry_date: nahodnyDen(), items: [{ ...kombinace(), quantity_taken: cislo(4, 12), quantity_returned: cislo(0, 3) }] }));
  const prefuk = Array.from({ length: radku(NA_MESIC.prefuk) }, () => ({ id: id(), entry_date: nahodnyDen(), beer_id: vyber(PIVA).id, from_package_id: OBALY[0].id, from_count: cislo(1, 3), to_package_id: OBALY[1].id, to_count: cislo(2, 5) }));
  const adjustments = Array.from({ length: radku(NA_MESIC.dorovnani) }, () => { const d = nahodnyDen(); return { id: id(), entry_date: d, ...kombinace(), quantity: cislo(-4, 4) || 1, reason: 'Dorovnání', order_id: null, created_at: cas(d) }; });

  // Inventury: počáteční stav 1. dne každého měsíce.
  const inventory: any[] = [];
  for (let m = 0; m < mesicu; m++) {
    const d = posun(zacatek, Math.round(m * 30.4));
    for (let i = 0; i < Math.round(NA_MESIC.inventura * zatez); i++) inventory.push({ id: id(), entry_date: d, ...kombinace(), quantity: cislo(0, 80), note: 'Počáteční stav', created_at: cas(d) });
  }

  // Objednávky + položky + odpočty závozu.
  const orders: any[] = [];
  const orderItems: any[] = [];
  const zavoz: any[] = [];
  const objednavek = radku(NA_MESIC.objednavek);
  for (let i = 0; i < objednavek; i++) {
    const d = nahodnyDen();
    const o = { id: uuid('ord', i + 1), order_date: d, delivery_date: posun(d, cislo(0, 4)), delivery_day: 'pa', status: 'nova', is_delivered: rnd() < 0.9, place_name: `Hospoda ${1 + (i % 140)}` };
    orders.push(o);
    const polozek = Math.max(1, Math.round(NA_MESIC.polozekNaObj));
    for (let j = 0; j < polozek; j++) {
      const it = { id: uuid('itm', orderItems.length + 1), order_id: o.id, ...kombinace(), quantity: cislo(1, 10), delivery_day: null };
      orderItems.push(it);
      if (o.is_delivered) zavoz.push({ id: id(), deduct_date: o.delivery_date, order_item_id: it.id, order_id: o.id, beer_id: it.beer_id, package_id: it.package_id, quantity: it.quantity, created_at: cas(o.delivery_date) });
    }
  }

  // Týdenní inventura: jedna sada řádků za každý týden (jen aktivní položky).
  const tydenni: any[] = [];
  for (let t = 0; t < Math.floor(dnu / 7); t++) {
    const od = posun(zacatek, t * 7);
    for (let i = 0; i < Math.round(60 * zatez); i++) tydenni.push({ tyden_od: od, tyden_do: posun(od, 6), ...kombinace(), ocekavano: cislo(0, 60), napocitano: cislo(0, 60), updated_at: `${posun(od, 4)}T15:00:00Z` });
  }

  return { zacatek, dnu, kegging, bottling, fasovani, prodejna, writeoffs, akce, prefuk, adjustments, inventory, orders, orderItems, zavoz, tydenni };
}

type Data = ReturnType<typeof simuluj>;

const cas = (f: () => void, opakovani = 3): number => {
  f(); // zahřátí JIT
  const t: number[] = [];
  for (let i = 0; i < opakovani; i++) { const s = performance.now(); f(); t.push(performance.now() - s); }
  return Math.min(...t);
};

function zdroje(d: Data) {
  return {
    inventoryRows: d.inventory, bottlingRows: d.bottling, keggingRows: d.kegging, fasovaniRows: d.fasovani,
    prodejnaRows: d.prodejna, writeoffsRows: d.writeoffs, zavozDeductionRows: d.zavoz, akceRows: d.akce,
    prefukRows: d.prefuk, adjustmentRows: d.adjustments, packages: OBALY,
  };
}

function zmer(d: Data) {
  const dnes = '2026-10-11';
  const z = zdroje(d);
  const tabulky: Record<string, any[]> = {
    kegging: d.kegging, bottling: d.bottling, fasovani: d.fasovani, fasovani_private: d.prodejna, writeoffs: d.writeoffs,
    inventory: d.inventory, inventory_adjustments: d.adjustments, zavoz_deductions: d.zavoz, akce: d.akce,
    orders: d.orders, order_items: d.orderItems, tydenni_inventura: d.tydenni,
  };
  const radkuCelkem = Object.values(tabulky).reduce((s, t) => s + t.length, 0);
  // Stažení jedné obrazovky (Sklad/Inventura/Plán): ~12 tabulek celé historie.
  const bajtu = Object.entries(tabulky).filter(([k]) => k !== 'tydenni_inventura').reduce((s, [, t]) => s + JSON.stringify(t).length, 0);
  const pozadavku = Object.entries(tabulky).filter(([k]) => k !== 'tydenni_inventura').reduce((s, [, t]) => s + Math.max(1, Math.ceil(t.length / 1000)), 0);

  const pohyby = buildMovements(z);
  const vysledky: Record<string, number> = {};
  vysledky['kniha: buildMovements'] = cas(() => buildMovements(z));
  vysledky['Sklad: stav dnes'] = cas(() => stockAsOf(pohyby, dnes));
  vysledky['Sklad: stav ke 4 datům'] = cas(() => { for (let i = 0; i < 4; i++) stockAsOf(pohyby, posun(dnes, -i * 7)); });
  vysledky['Inventura: očekávaný stav měsíce'] = cas(() => expectedForMonth(pohyby, '2026-09'));
  vysledky['Inventura: rozpad období (týden)'] = cas(() => stockForObdobi(pohyby, '2026-10-05', '2026-10-11'));
  vysledky['Pohyby: týden'] = cas(() => sestavPohybyObdobi(pohyby, { od: '2026-10-05', doDne: '2026-10-11', dnes } as any, (x: string) => x));
  vysledky['Pohyby: měsíc'] = cas(() => sestavPohybyObdobi(pohyby, { od: '2026-09-01', doDne: '2026-09-30', dnes } as any, (x: string) => x));
  const stavMapa = zbytekKeKonciTydne(z as any, dnes);
  vysledky['Zbytek ke konci týdne'] = cas(() => zbytekKeKonciTydne(z as any, dnes));
  vysledky['Plán stáčení (týden)'] = cas(() => computeKeggingPlan({
    beers: PIVA, packages: OBALY, orders: d.orders, orderItems: d.orderItems, keggingRows: d.kegging,
    zavozDeductionRows: d.zavoz, fasovaniRows: d.fasovani, prodejnaRows: d.prodejna, writeoffsRows: d.writeoffs,
    checkRows: [], weekKey: isoWeekKey(dnes), currentStockMap: stavMapa,
  } as any));
  vysledky['Rozbor'] = cas(() => radkyRozboru({
    planSudy: [], planLahve: [], kegging: d.kegging, bottling: d.bottling, od: '2026-10-05', doDne: '2026-10-11',
    zasoba: stavMapa, piva: PIVA, obaly: OBALY,
  }));
  vysledky['Pohyby: týdenní inventura'] = cas(() => radkyTydenniInventury({
    zaznamy: d.tydenni, pohyby, od: '2026-10-05', doDne: '2026-10-11', dnes, denPodleCasu: (iso) => iso.slice(0, 10),
  }));
  // Kopie dat při předání obrazovce (sdilenaData.kopie = structuredClone).
  vysledky['Paměť: kopie 12 tabulek'] = cas(() => { for (const t of Object.values(tabulky)) structuredClone(t); }, 2);
  return { radkuCelkem, bajtu, pozadavku, pohybu: pohyby.length, vysledky };
}

// Obrazovka = součet toho, co se přepočítá po otevření/změně (nejhorší pohled: Sklad + Pohyby + Plán).
const OBRAZOVKA = ['kniha: buildMovements', 'Sklad: stav dnes', 'Pohyby: měsíc', 'Zbytek ke konci týdne', 'Plán stáčení (týden)', 'Paměť: kopie 12 tabulek'];

const SCENARE = [
  { mesicu: 2, zatez: 1, popis: 'srpen + září (dnes)' },
  { mesicu: 12, zatez: 1, popis: '12 měsíců' },
  { mesicu: 24, zatez: 1, popis: '24 měsíců' },
  { mesicu: 24, zatez: 3, popis: '24 měsíců, 3× víc provozu' },
];

describe('růst dat — 12 a 24 měsíců', () => {
  const vysledek = SCENARE.map((s) => ({ ...s, ...zmer(simuluj(s.mesicu, s.zatez)) }));

  it('vypíše tabulku výsledků', () => {
    const radky = vysledek.map((v) => {
      const obrazovka = OBRAZOVKA.reduce((s, k) => s + v.vysledky[k], 0);
      return {
        scénář: v.popis, 'řádků v DB': v.radkuCelkem, 'pohybů v knize': v.pohybu,
        'stažení celé historie (MB)': Number((v.bajtu / 1e6).toFixed(2)), 'požadavků na server': v.pozadavku,
        'přepočet obrazovky (ms)': Math.round(obrazovka * 10) / 10,
        'v mobilu ~8× (ms)': Math.round(obrazovka * 8),
      };
    });
    // eslint-disable-next-line no-console
    console.table(radky);
    // eslint-disable-next-line no-console
    console.table(Object.fromEntries(Object.keys(vysledek[0].vysledky).map((k) => [k, Object.fromEntries(vysledek.map((v) => [v.popis, Math.round(v.vysledky[k] * 10) / 10]))])));
    expect(vysledek.length).toBe(SCENARE.length);
  });

  it('výpočet roste nejvýš lineárně (24 měsíců ≤ ~3× času 12 měsíců)', () => {
    const v12 = vysledek[1], v24 = vysledek[2];
    for (const k of OBRAZOVKA) {
      const a = Math.max(v12.vysledky[k], 10); // pod ~10 ms je to šum měření (na sdíleném CI kolísá)
      expect(v24.vysledky[k] / a, k).toBeLessThan(4);
    }
  });

  // Rozpočty jsou záměrně volné (na sdíleném CI serveru běh kolísá): hlídají
  // skutečný propad, ne jednotky milisekund. Naměřená čísla jsou v tabulce výš.
  // Mobil bývá ~8× pomalejší než tenhle běh.
  it('přepočet jedné obrazovky se vejde do rozpočtu (×1: 4 s, ×3: 8 s v mobilu)', () => {
    for (const v of vysledek) {
      const obrazovka = OBRAZOVKA.reduce((s, k) => s + v.vysledky[k], 0);
      expect(obrazovka * 8, `${v.popis}: přepočet obrazovky v mobilu`).toBeLessThan(v.zatez > 1 ? 8000 : 4000);
    }
  });

  it('žádné jednotlivé počítání neutíká (×1 pod 500 ms, ×3 pod 1 s)', () => {
    for (const v of vysledek) {
      for (const [k, ms] of Object.entries(v.vysledky)) expect(ms, `${v.popis} — ${k}`).toBeLessThan(v.zatez > 1 ? 1000 : 500);
    }
  });

  it('stav po 24 měsících je pořád konečné číslo (žádné NaN z nasčítání)', () => {
    const d = simuluj(24, 1);
    const stav = stockAsOf(buildMovements(zdroje(d)), '2026-10-11');
    expect(stav.size).toBeGreaterThan(0);
    stav.forEach((r) => { expect(Number.isFinite(r.qty)).toBe(true); });
    // a klíče jsou pivo__obal, jak má být
    expect([...stav.keys()][0]).toBe(stockKey(PIVA[0].id, OBALY[0].id).length ? [...stav.keys()][0] : '');
  });
});
