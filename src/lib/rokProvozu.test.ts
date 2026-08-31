// 🗓️ Rok provozu — kontrola, že po roce používání pořád všechno sedí.
// ---------------------------------------------------------------------------
// Ostatní testy zkoušejí jednotlivé situace na pár řádcích dat. Tenhle
// nasimuluje 52 týdnů skutečného provozu (stáčení, kegování, fasování,
// prodejna, odpisy, závoz, akce, přefuk, měsíční inventury, dorovnání,
// objednávky) a vedle toho si nezávisle vede vlastní evidenci — obyčejné
// sčítání den po dni. Pak porovná, jestli aplikace počítá to samé.
//
// Proč zrovna rok: chyby, které jsou na týdnu dat neviditelné, se přes rok
// nasčítají. Hlídají se čtyři věci, na kterých to nejčastěji padá:
//   1. DRIFT — stav ke KAŽDÉMU dni roku, ne jen k poslednímu.
//   2. INVENTURA JAKO ŘEZ — po inventuře se rok staré pohyby nesmí přilepit.
//   3. TÝDENNÍ POHLED — objednávky z 51 minulých týdnů nesmí přetéct do
//      toho aktuálního a „Sklad" v potřebě stáčení musí sedět se skladovou
//      knihou i po roce.
//   4. VÝKON — roční objem dat se musí spočítat ve zlomku vteřiny, jinak
//      aplikace po roce „zhoustne".
import { describe, it, expect } from 'vitest';
import { buildMovements, stockAsOf, stockAtStartOfDay, stockKey, expectedForMonth } from './stockLedger';
import { computePackageNeeds } from './packageNeeds';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';

// ── Katalog ────────────────────────────────────────────────────────────────
const PIVA = [
  { id: 'b-11', name: '11° Světlá' },
  { id: 'b-12', name: '12° Polotmavá' },
  { id: 'b-ale', name: 'Summer Ale' },
];
const OBALY = [
  { id: 'keg30', label: 'KEG 30 l', kind: 'keg', volume_l: 30 },
  { id: 'keg50', label: 'KEG 50 l', kind: 'keg', volume_l: 50 },
  { id: 'lahev05', label: 'Lahev 0,5 l', kind: 'bottle', volume_l: 0.5 },
  { id: 'pet15', label: 'PET 1,5 l', kind: 'bottle', volume_l: 1.5 },
];
const KLICE = PIVA.flatMap((b) => OBALY.map((p) => stockKey(b.id, p.id)));

function posun(iso: string, dnu: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dnu);
  return d.toISOString().slice(0, 10);
}
/** 0 = pondělí … 6 = neděle. */
function denVTydnu(iso: string): number {
  return (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7;
}

const ZACATEK = '2025-09-01'; // pondělí
const DNU = 364;              // přesně 52 týdnů
const KONEC = posun(ZACATEK, DNU - 1);
const FYZICKA_INVENTURA_DEN = '2026-03-15';
const FYZICKA_INVENTURA_KLIC = stockKey('b-11', 'keg30');
const FYZICKA_INVENTURA_PREBYTEK = 7;
const OBJEDNAVEK_TYDNE = 8;

// Deterministický generátor — test musí dopadnout pokaždé stejně, jinak se
// nedá poznat, jestli spadl kvůli změně kódu, nebo kvůli jiným náhodným datům.
function generator(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Objednavka = {
  id: string; order_date: string; delivery_date: string; delivery_day: string;
  status: string; is_delivered: boolean; place_name: string; poradiVTydnu: number;
};
type Polozka = { id: string; order_id: string; beer_id: string; package_id: string; quantity: number };

function simulujRok() {
  const rnd = generator(20260826);
  const cislo = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const vyber = <T>(pole: T[]): T => pole[Math.floor(rnd() * pole.length)];

  const inventoryRows: any[] = [];
  const bottlingRows: any[] = [];
  const keggingRows: any[] = [];
  const fasovaniRows: any[] = [];
  const prodejnaRows: any[] = [];
  const writeoffsRows: any[] = [];
  const zavozDeductionRows: any[] = [];
  const akceRows: any[] = [];
  const prefukRows: any[] = [];
  const adjustmentRows: any[] = [];
  const orders: Objednavka[] = [];
  const orderItems: Polozka[] = [];

  // Nezávislá evidence: stav ke konci každého dne, stav k ránu každého dne
  // a součet POHYBŮ (bez inventur) po měsících — proti tomu se pak měří.
  const stav: Record<string, number> = {};
  const konecDne = new Map<string, Record<string, number>>();
  const ranoDne = new Map<string, Record<string, number>>();
  const mesicniDelty = new Map<string, Record<string, number>>();
  // Dorovnání se drží zvlášť: do skutečného skladu patří jako každý jiný
  // pohyb, ale do OČEKÁVANÉHO stavu svého měsíce ne — je to oprava, se
  // kterou se očekávaný stav teprve porovnává (viz expectedForMonth).
  const mesicniDorovnani = new Map<string, Record<string, number>>();
  const inventuraKPrvnimu = new Map<string, Record<string, number>>();

  const pohyb = (den: string, klic: string, delta: number) => {
    stav[klic] = (stav[klic] ?? 0) + delta;
    const mesic = den.slice(0, 7);
    const m = mesicniDelty.get(mesic) ?? {};
    m[klic] = (m[klic] ?? 0) + delta;
    mesicniDelty.set(mesic, m);
  };
  const reset = (klic: string, mnozstvi: number) => { stav[klic] = mnozstvi; };

  let poradiPolozky = 0;
  // Unikátní created_at — skladová kniha podle něj rozlišuje jinak shodné
  // řádky stáčení (deduplikace sudů spotřebovaných na lahve).
  let poradiStaceni = 0;

  for (let i = 0; i < DNU; i++) {
    const den = posun(ZACATEK, i);
    const dt = denVTydnu(den);

    // ── Inventura ────────────────────────────────────────────────────────
    // 1. den měsíce = počáteční stav (tak to dělá appka), plus jedna fyzická
    // inventura uprostřed března, na které se ověřuje řez historií.
    if (den.endsWith('-01')) {
      const zapsano: Record<string, number> = {};
      for (const klic of KLICE) {
        const [beer_id, package_id] = klic.split('__');
        // Napočítaný stav se od evidence občas liší (manko/přebytek) — přesně
        // proto se inventura dělá. Záporný nikdy není, počítají se kusy.
        const rozdil = rnd() < 0.25 ? cislo(-3, 3) : 0;
        const zaklad = i === 0 ? cislo(20, 120) : (stav[klic] ?? 0);
        const mnozstvi = Math.max(0, zaklad + rozdil);
        inventoryRows.push({ entry_date: den, beer_id, package_id, quantity: mnozstvi, note: 'Počáteční stav' });
        reset(klic, mnozstvi);
        zapsano[klic] = mnozstvi;
      }
      inventuraKPrvnimu.set(den.slice(0, 7), zapsano);
    }
    if (den === FYZICKA_INVENTURA_DEN) {
      const [beer_id, package_id] = FYZICKA_INVENTURA_KLIC.split('__');
      const mnozstvi = (stav[FYZICKA_INVENTURA_KLIC] ?? 0) + FYZICKA_INVENTURA_PREBYTEK;
      inventoryRows.push({ entry_date: den, beer_id, package_id, quantity: mnozstvi, note: 'Fyzická inventura' });
      reset(FYZICKA_INVENTURA_KLIC, mnozstvi);
    }

    ranoDne.set(den, { ...stav });

    // ── Výroba ───────────────────────────────────────────────────────────
    for (const pivo of dt <= 4 ? PIVA : []) {
      if (dt === 0 || dt === 2) {
        const ks30 = cislo(8, 18);
        const ks50 = cislo(4, 10);
        keggingRows.push({ entry_date: den, beer_id: pivo.id, package_id: 'keg30', quantity: ks30 });
        keggingRows.push({ entry_date: den, beer_id: pivo.id, package_id: 'keg50', quantity: ks50 });
        pohyb(den, stockKey(pivo.id, 'keg30'), ks30);
        pohyb(den, stockKey(pivo.id, 'keg50'), ks50);
      }
      if (dt === 1 || dt === 3) {
        const lahve = cislo(40, 90);
        const sudy = cislo(1, 3);
        bottlingRows.push({
          entry_date: den, beer_id: pivo.id, package_id: 'lahev05', quantity: lahve,
          kegs_used: sudy, kegs_used_package_id: 'keg50', created_at: `st-${poradiStaceni++}`,
        });
        pohyb(den, stockKey(pivo.id, 'lahev05'), lahve);
        pohyb(den, stockKey(pivo.id, 'keg50'), -sudy);

        const pet = cislo(20, 50);
        bottlingRows.push({
          entry_date: den, beer_id: pivo.id, package_id: 'pet15', quantity: pet,
          created_at: `st-${poradiStaceni++}`,
        });
        pohyb(den, stockKey(pivo.id, 'pet15'), pet);
      }
    }

    // ── Denní výdeje ─────────────────────────────────────────────────────
    for (let smena = 0; smena < 2 && dt <= 4; smena++) {
      const pivo = vyber(PIVA);
      const obal = vyber(OBALY);
      const ks = cislo(1, 3);
      fasovaniRows.push({ entry_date: den, beer_id: pivo.id, package_id: obal.id, quantity: ks });
      pohyb(den, stockKey(pivo.id, obal.id), -ks);
    }
    if (dt <= 5) {
      const pivo = vyber(PIVA);
      const obal = vyber(OBALY);
      const ks = cislo(1, 6);
      prodejnaRows.push({ entry_date: den, beer_id: pivo.id, package_id: obal.id, quantity: ks });
      pohyb(den, stockKey(pivo.id, obal.id), -ks);
    }
    if (rnd() < 0.08) {
      const pivo = vyber(PIVA);
      const obal = vyber(OBALY);
      const ks = cislo(1, 4);
      writeoffsRows.push({ entry_date: den, beer_id: pivo.id, package_id: obal.id, quantity: ks, note: 'zmetek' });
      pohyb(den, stockKey(pivo.id, obal.id), -ks);
    }

    // ── Akce a festivaly ─────────────────────────────────────────────────
    if (rnd() < 0.05) {
      const pivo = vyber(PIVA);
      const odvezeno = cislo(4, 12);
      const vraceno = cislo(0, 3);
      akceRows.push({
        entry_date: den,
        items: [{ beer_id: pivo.id, package_id: 'keg30', quantity_taken: odvezeno, quantity_returned: vraceno }],
      });
      pohyb(den, stockKey(pivo.id, 'keg30'), -(odvezeno - vraceno));
    }

    // ── Přefuk 50 l → 30 l ───────────────────────────────────────────────
    if (rnd() < 0.06) {
      const pivo = vyber(PIVA);
      const zeSudu = cislo(1, 3);
      const doSudu = zeSudu + cislo(0, 2);
      prefukRows.push({
        entry_date: den, beer_id: pivo.id,
        from_package_id: 'keg50', from_count: zeSudu,
        to_package_id: 'keg30', to_count: doSudu,
      });
      pohyb(den, stockKey(pivo.id, 'keg50'), -zeSudu);
      pohyb(den, stockKey(pivo.id, 'keg30'), doSudu);
    }

    // ── Objednávky: zadávají se v pondělí na páteční závoz ────────────────
    if (dt === 0) {
      for (let n = 0; n < OBJEDNAVEK_TYDNE; n++) {
        const id = `obj-${orders.length + 1}`;
        orders.push({
          id, order_date: den, delivery_date: posun(den, 4), delivery_day: 'pa',
          status: 'nova', is_delivered: false, place_name: `Hospoda ${n + 1}`,
          poradiVTydnu: n,
        });
        const jenKegy = n === 0; // viz test na nepřetékání objednávek mezi týdny
        for (let j = 0; j < 2; j++) {
          const pivo = vyber(PIVA);
          const obal = vyber(jenKegy ? OBALY.filter((p) => p.kind === 'keg') : OBALY);
          orderItems.push({
            id: `pol-${++poradiPolozky}`, order_id: id,
            beer_id: pivo.id, package_id: obal.id, quantity: cislo(2, 10),
          });
        }
      }
    }

    // ── Páteční závoz: odečet ze skladu + uzavření objednávky ────────────
    if (dt === 4) {
      const pondeli = posun(den, -4);
      for (const o of orders.filter((x) => x.order_date === pondeli)) {
        // Část objednávek se zaveze až příští týden. První v týdnu vždycky —
        // ať je na čem měřit, že do týdne nepřetečou objednávky odjinud.
        if (o.poradiVTydnu === 0 || rnd() < 0.2) continue;
        for (const it of orderItems.filter((x) => x.order_id === o.id)) {
          zavozDeductionRows.push({
            deduct_date: den, order_item_id: it.id, beer_id: it.beer_id,
            package_id: it.package_id, quantity: it.quantity,
          });
          pohyb(den, stockKey(it.beer_id, it.package_id), -it.quantity);
        }
        // Plně odečtená objednávka se uzavírá — stejně jako to od migrace
        // 20261215000000_zavoz_datum_a_uzavreni.sql dělá databázový trigger.
        o.status = 'vyrizeno_zavoz';
        o.is_delivered = true;
      }
    }

    // ── Dorovnání inventury k poslednímu dni měsíce ──────────────────────
    if (posun(den, 1).endsWith('-01') && rnd() < 0.7) {
      const klic = vyber(KLICE);
      const [beer_id, package_id] = klic.split('__');
      const ks = cislo(-4, 4) || 1;
      adjustmentRows.push({ entry_date: den, beer_id, package_id, quantity: ks, note: 'dorovnání' });
      pohyb(den, klic, ks);
      const mesic = den.slice(0, 7);
      const d = mesicniDorovnani.get(mesic) ?? {};
      d[klic] = (d[klic] ?? 0) + ks;
      mesicniDorovnani.set(mesic, d);
    }

    konecDne.set(den, { ...stav });
  }

  const zdroje = {
    inventoryRows, bottlingRows, keggingRows, fasovaniRows, prodejnaRows,
    writeoffsRows, zavozDeductionRows, akceRows, prefukRows, adjustmentRows,
    packages: OBALY,
  };
  return { zdroje, orders, orderItems, konecDne, ranoDne, mesicniDelty, mesicniDorovnani, inventuraKPrvnimu };
}

const ROK = simulujRok();
const POHYBY = buildMovements(ROK.zdroje);

describe('rok provozu — skladová kniha', () => {
  it('nasimuluje opravdu roční objem dat', () => {
    expect(POHYBY.length).toBeGreaterThan(3000);
    expect(ROK.orders.length).toBe(52 * OBJEDNAVEK_TYDNE);
    expect(ROK.orderItems.length).toBe(52 * OBJEDNAVEK_TYDNE * 2);
  });

  it('stav ke KONCI každého z 364 dnů sedí s nezávislou evidencí', () => {
    const rozdily: string[] = [];
    for (let i = 0; i < DNU; i++) {
      const den = posun(ZACATEK, i);
      const kniha = stockAsOf(POHYBY, den);
      const ocekavano = ROK.konecDne.get(den)!;
      for (const klic of KLICE) {
        const spocteno = kniha.get(klic)?.qty ?? 0;
        if (spocteno !== ocekavano[klic]) {
          rozdily.push(`${den} ${klic}: kniha ${spocteno} ≠ evidence ${ocekavano[klic]}`);
        }
      }
    }
    expect(rozdily.slice(0, 10)).toEqual([]);
  });

  it('stav k RÁNU každého dne sedí — inventura toho dne se započítá, pohyby ne', () => {
    const rozdily: string[] = [];
    for (let i = 0; i < DNU; i++) {
      const den = posun(ZACATEK, i);
      const kniha = stockAtStartOfDay(POHYBY, den);
      const ocekavano = ROK.ranoDne.get(den)!;
      for (const klic of KLICE) {
        const spocteno = kniha.get(klic)?.qty ?? 0;
        if (spocteno !== ocekavano[klic]) {
          rozdily.push(`${den} ${klic}: ráno ${spocteno} ≠ evidence ${ocekavano[klic]}`);
        }
      }
    }
    expect(rozdily.slice(0, 10)).toEqual([]);
  });

  it('inventura utne historii — po roce se stav počítá jen od poslední inventury', () => {
    const kniha = stockAsOf(POHYBY, KONEC);
    for (const klic of KLICE) {
      const radek = kniha.get(klic)!;
      expect(radek.baselineDate).not.toBeNull();
      // Poslední inventura musí být ta z posledního měsíce, ne nic staršího.
      expect(radek.baselineDate!.slice(0, 7)).toBe(KONEC.slice(0, 7));
      // A stav = ta inventura + pohyby po ní. Rok starých pohybů se nepřilepí.
      const poInventure = POHYBY
        .filter((m) => m.kind !== 'inventura' && stockKey(m.beer_id, m.package_id) === klic)
        .filter((m) => m.date >= radek.baselineDate! && m.date <= KONEC)
        .reduce((soucet, m) => soucet + m.qty, 0);
      expect(radek.qty).toBe(radek.baselineQty + poInventure);
    }
  });

  it('žádné číslo se cestou nerozbije na NaN', () => {
    for (const den of [ZACATEK, '2025-12-31', FYZICKA_INVENTURA_DEN, KONEC]) {
      stockAsOf(POHYBY, den).forEach((radek) => {
        expect(Number.isFinite(radek.qty)).toBe(true);
        expect(Number.isFinite(radek.baselineQty)).toBe(true);
      });
    }
  });
});

describe('rok provozu — očekávaný stav pro inventuru', () => {
  // Očekávaný stav je ČISTÁ TEORIE: co má podle papírů být, než se cokoli
  // opraví. Proto se do něj nepočítají opravy pořízené při téhle inventuře —
  // ani napočítaný stav, ani dorovnání. Obrazovka Inventura si dorovnání
  // přičítá sama („Po dorovnání"), takže kdyby ho nesl i očekávaný stav,
  // sedělo by dvakrát a k nule by se nikdy nedopočítalo.
  it('měsíční očekávaný stav = počáteční stav + pohyby měsíce bez dorovnání, a to každý měsíc roku', () => {
    const mesice = [...ROK.inventuraKPrvnimu.keys()];
    expect(mesice.length).toBe(12);
    for (const mesic of mesice) {
      const ocekavano = expectedForMonth(POHYBY, mesic);
      const zaklad = ROK.inventuraKPrvnimu.get(mesic)!;
      const delty = ROK.mesicniDelty.get(mesic) ?? {};
      const dorovnani = ROK.mesicniDorovnani.get(mesic) ?? {};
      for (const klic of KLICE) {
        expect(`${mesic} ${klic}: ${ocekavano.get(klic)?.qty ?? 0}`)
          .toBe(`${mesic} ${klic}: ${zaklad[klic] + (delty[klic] ?? 0) - (dorovnani[klic] ?? 0)}`);
      }
    }
  });

  it('dorovnání se přesto někde stalo — jinak test výše nic nehlídá', () => {
    // Pojistka proti tomu, aby simulace jednou přestala dorovnání generovat
    // a předchozí test začal procházet jen proto, že odečítá samé nuly.
    const celkem = [...ROK.mesicniDorovnani.values()]
      .flatMap((m) => Object.values(m))
      .filter((v) => v !== 0).length;
    expect(celkem).toBeGreaterThan(0);
  });

  it('inventura uprostřed měsíce se do očekávaného stavu NEpromítne (jinak by manko vyšlo vždy nula)', () => {
    const konecBrezna = '2026-03-31';
    const skutecnost = stockAsOf(POHYBY, konecBrezna).get(FYZICKA_INVENTURA_KLIC)!.qty;
    const ocekavano = expectedForMonth(POHYBY, '2026-03').get(FYZICKA_INVENTURA_KLIC)!.qty;
    // Skutečnost jde z fyzické inventury (nalezený přebytek), očekávání z
    // evidence — rozdíl je přesně ten přebytek, a to je to, co má inventura ukázat.
    expect(skutecnost - ocekavano).toBe(FYZICKA_INVENTURA_PREBYTEK);
  });
});

/** Pondělí týdne, který uvnitř (út–ne) inventuru buď má, nebo nemá. */
function najdiTyden(sInventurouUvnitr: boolean): string {
  for (let i = DNU - 7; i > 0; i -= 7) {
    const pondeli = posun(ZACATEK, i);
    const maInventuru = Array.from({ length: 6 }, (_, k) => posun(pondeli, k + 1))
      .some((d) => ROK.zdroje.inventoryRows.some((r: any) => r.entry_date === d));
    if (maInventuru === sInventurouUvnitr) return pondeli;
  }
  throw new Error(`nenašel se týden ${sInventurouUvnitr ? 's inventurou' : 'bez inventury'} uvnitř`);
}

function potrebaKegu(pondeli: string) {
  return computePackageNeeds(
    {
      beers: PIVA,
      packages: OBALY,
      orders: ROK.orders,
      orderItems: ROK.orderItems,
      ...ROK.zdroje,
      weekKey: isoWeekKey(pondeli),
      todayStr: posun(pondeli, 6),
    },
    (kind) => kind === 'keg',
  );
}

describe('rok provozu — týdenní „co je potřeba stočit"', () => {
  const tydenPondeli = najdiTyden(false);
  const tydenNedele = posun(tydenPondeli, 6);
  const weekKey = isoWeekKey(tydenPondeli);
  const potreba = potrebaKegu(tydenPondeli);

  it('„Sklad" v týdenním pohledu sedí se skladovou knihou i po roce dat', () => {
    const kniha = stockAsOf(POHYBY, tydenNedele);
    expect(potreba.length).toBeGreaterThan(0);
    for (const radek of potreba) {
      const klic = stockKey(radek.beer_id, radek.package_id);
      expect(`${klic}=${radek.stockQty}`).toBe(`${klic}=${Math.max(0, kniha.get(klic)?.qty ?? 0)}`);
    }
  });

  it('objednávky z 51 předchozích týdnů nepřetečou do toho aktuálního', () => {
    const idTydne = new Set(
      ROK.orders
        .filter((o) => o.status !== 'vyrizeno_zavoz' && isoWeekKey(o.delivery_date) === weekKey)
        .map((o) => o.id),
    );
    const ocekavano: Record<string, number> = {};
    ROK.orderItems
      .filter((it) => idTydne.has(it.order_id) && it.package_id.startsWith('keg'))
      .forEach((it) => {
        const klic = stockKey(it.beer_id, it.package_id);
        ocekavano[klic] = (ocekavano[klic] ?? 0) + it.quantity;
      });
    for (const radek of potreba) {
      const klic = stockKey(radek.beer_id, radek.package_id);
      expect(`${klic}=${radek.orderedQty}`).toBe(`${klic}=${ocekavano[klic] ?? 0}`);
    }
    // Pojistka, že test opravdu něco měří — v tom týdnu nějaké KEGy objednané jsou.
    expect(Object.values(ocekavano).reduce((soucet, v) => soucet + v, 0)).toBeGreaterThan(0);
  });

  it('„chybí stočit" nikdy nevyjde záporně ani jako NaN', () => {
    for (const radek of potreba) {
      expect(Number.isFinite(radek.neededQty)).toBe(true);
      expect(radek.neededQty).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('rok provozu — výkon', () => {
  it('roční objem dat se přepočítá do 1,5 s (aplikace po roce nezhoustne)', () => {
    const start = performance.now();
    const pohyby = buildMovements(ROK.zdroje);
    for (let i = 0; i < DNU; i += 7) stockAsOf(pohyby, posun(ZACATEK, i));
    for (const mesic of ROK.inventuraKPrvnimu.keys()) expectedForMonth(pohyby, mesic);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});

describe('rok provozu — inventura uprostřed týdne', () => {
  // K 1. dni měsíce se zapisuje počáteční stav. Když ten den padne doprostřed
  // týdne, je to nový výchozí bod skladu — a týdenní „co je potřeba stočit"
  // s ním musí počítat okamžitě, ne až od dalšího pondělí. Dřív si sklad
  // sčítalo samo od pondělí, takže do konce týdne ukazovalo jiné číslo než
  // Sklad a Inventura.
  const tydenPondeli = najdiTyden(true);
  const tydenNedele = posun(tydenPondeli, 6);
  const potreba = potrebaKegu(tydenPondeli);

  it('týden s inventurou uprostřed se opravdu našel a něco se v něm počítá', () => {
    const dnyUvnitr = Array.from({ length: 6 }, (_, k) => posun(tydenPondeli, k + 1));
    expect(dnyUvnitr.some((d) => ROK.zdroje.inventoryRows.some((r: any) => r.entry_date === d))).toBe(true);
    expect(potreba.length).toBeGreaterThan(0);
  });

  it('„Sklad" sedí se skladovou knihou i v týdnu, do kterého padne 1. den měsíce', () => {
    const kniha = stockAsOf(POHYBY, tydenNedele);
    for (const radek of potreba) {
      const klic = stockKey(radek.beer_id, radek.package_id);
      expect(`${klic}=${radek.stockQty}`).toBe(`${klic}=${Math.max(0, kniha.get(klic)?.qty ?? 0)}`);
    }
  });

  it('„chybí stočit" se počítá proti skladu bez závozů tohoto týdne', () => {
    const bezZavozu = stockAsOf(
      POHYBY.filter((m) => !(m.kind === 'zavoz' && isoWeekKey(m.date) === isoWeekKey(tydenPondeli))),
      tydenNedele,
    );
    for (const radek of potreba) {
      const klic = stockKey(radek.beer_id, radek.package_id);
      const dostupne = Math.max(0, bezZavozu.get(klic)?.qty ?? 0);
      expect(`${klic}=${radek.neededQty}`).toBe(`${klic}=${Math.max(0, radek.orderedQty - dostupne)}`);
    }
  });
});
