import { describe, it, expect } from 'vitest';
import { computeBottlingNeeds, BottlingNeedsInput, seskupPodlePiva, NeedsRow } from './bottlingNeeds';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';

const todayStr = '2026-08-10';
const weekKey = isoWeekKey(todayStr);

const BEER = { id: 'b1', name: 'Světlý ležák 11°' };
const PKG_BOTTLE = { id: 'p-bottle', label: 'Lahve 0,5L', kind: 'bottle', volume_l: 0.5 };
const PKG_KEG = { id: 'p-keg', label: 'KEG 50L', kind: 'keg', volume_l: 50 };

function makeInput(patch: Partial<BottlingNeedsInput> = {}): BottlingNeedsInput {
  return {
    beers: [BEER],
    packages: [PKG_BOTTLE, PKG_KEG],
    plans: [],
    orders: [],
    orderItems: [],
    inventoryRows: [],
    bottlingRows: [],
    keggingRows: [],
    fasovaniRows: [],
    prodejnaRows: [],
    writeoffsRows: [],
    weekKey,
    todayStr,
    ...patch,
  };
}

describe('computeBottlingNeeds', () => {
  it('prázdná data → žádné řádky potřeby', () => {
    expect(computeBottlingNeeds(makeInput())).toEqual([]);
  });

  it('sklad (inventura) + objednávky → „chybí stočit“ a „konec týdne“', () => {
    const rows = computeBottlingNeeds(
      makeInput({
        inventoryRows: [{ entry_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 100, note: 'Počáteční' }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'active' }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 150 }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-bottle');
    expect(row).toBeDefined();
    expect(row!.stock).toBe(100);
    expect(row!.ordered).toBe(150);
    expect(row!.missing).toBe(50); // 150 − 100
    expect(row!.afterOutgoing).toBe(-50); // 100 − 150
  });

  it('naplánované stáčení snižuje „chybí stočit“ a zlepšuje „konec týdne“', () => {
    const rows = computeBottlingNeeds(
      makeInput({
        inventoryRows: [{ entry_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 100, note: 'Počáteční' }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'active' }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 150 }],
        plans: [
          {
            id: 'pl1', beer_id: 'b1', planned_date: todayStr, status: 'planned',
            keg_pkg_id: null, keg_qty: 0,
            pkg_id: 'p-bottle', qty: 60,
            pkg2_id: null, qty2: 0,
            pkg3_id: null, qty3: 0,
            note: null, created_by: null, created_at: '', updated_at: '',
          },
        ],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-bottle');
    expect(row!.planned).toBe(60);
    expect(row!.afterBottling).toBe(160);
    expect(row!.missing).toBe(0); // 150 − 160 → max(0, …)
    expect(row!.afterOutgoing).toBe(10); // 160 − 150
  });

  it('lahve a KEG sudy se počítají odděleně (keg úkol přidá jen do KEG řádku)', () => {
    const rows = computeBottlingNeeds(
      makeInput({
        keggingRows: [{ entry_date: todayStr, beer_id: 'b1', package_id: 'p-keg', quantity: 20 }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'active' }],
        orderItems: [{ order_id: 'o1', beer_id: 'b1', package_id: 'p-keg', quantity: 25 }],
        plans: [
          {
            id: 'pl2', beer_id: 'b1', planned_date: todayStr, status: 'planned',
            keg_pkg_id: 'p-keg', keg_qty: 10,
            pkg_id: null, qty: 0,
            pkg2_id: null, qty2: 0,
            pkg3_id: null, qty3: 0,
            note: null, created_by: null, created_at: '', updated_at: '',
          },
        ],
      })
    );
    const bottleRow = rows.find((r) => r.package_id === 'p-bottle');
    const kegRow = rows.find((r) => r.package_id === 'p-keg');
    expect(bottleRow).toBeUndefined(); // žádný pohyb lahví
    expect(kegRow).toBeDefined();
    expect(kegRow!.stock).toBe(20);
    expect(kegRow!.ordered).toBe(25);
    expect(kegRow!.planned).toBe(10);
    expect(kegRow!.afterOutgoing).toBe(5); // 20 + 10 − 25
    expect(kegRow!.missing).toBe(0);
  });

  it('počítají se jen objednávky aktuálního týdne; ordered počítá VŠECHNY (i už zavezené is_delivered) — celková týdenní potřeba', () => {
    const rows = computeBottlingNeeds(
      makeInput({
        orders: [
          { id: 'o1', order_date: '2026-07-01', delivery_date: '2026-07-01', status: 'nova', is_delivered: false }, // starý týden → NE
          { id: 'o2', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: true },           // tento týden, i zavezeno → ANO
          { id: 'o3', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false },          // tento týden, nezavezeno → ANO
        ],
        orderItems: [
          { order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 40 },
          { order_id: 'o2', beer_id: 'b1', package_id: 'p-bottle', quantity: 99 },
          { order_id: 'o3', beer_id: 'b1', package_id: 'p-bottle', quantity: 7 },
        ],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-bottle');
    expect(row!.ordered).toBe(106); // 99 + 7 (o1 je mimo týden)
  });

  it('vyřízená objednávka S odpočtem nepřidá nic — odjela a sklad ji má odečtenou', () => {
    const rows = computeBottlingNeeds(
      makeInput({
        inventoryRows: [{ entry_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 10, note: 'Počáteční' }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'vyrizeno_zavoz', is_delivered: true }],
        orderItems: [{ id: 'i1', order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 6 }],
        zavozDeductionRows: [{ deduct_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 6, order_item_id: 'i1' }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-bottle')!;
    expect(row.stock).toBe(4);
    expect(row.zbyvaZavezt).toBe(0);
    expect(row.missing).toBe(0);
  });

  it('vyřízená objednávka BEZ odpočtu se počítá — pivo odjelo, sklad o tom ještě neví', () => {
    // Dřív se vyřízené vynechávaly celé. Objednávka odkliknutá jako
    // „Zavezeno" dřív, než přišel její den závozu (odpočet ještě není),
    // tak z potřeby zmizela a její kusy dál „ležely" ve skladu.
    const rows = computeBottlingNeeds(
      makeInput({
        orders: [
          { id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'vyrizeno_zavoz', is_delivered: true },
          { id: 'o2', order_date: todayStr, delivery_date: todayStr, status: 'hotova', is_delivered: false },
          { id: 'o3', order_date: todayStr, delivery_date: todayStr, status: 'storno', is_delivered: false },
        ],
        orderItems: [
          { id: 'i1', order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 6 },
          { id: 'i2', order_id: 'o2', beer_id: 'b1', package_id: 'p-bottle', quantity: 3 },
          { id: 'i3', order_id: 'o3', beer_id: 'b1', package_id: 'p-bottle', quantity: 50 },
        ],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-bottle')!;
    expect(row.ordered).toBe(9); // storno ne
    expect(row.missing).toBe(9);
  });

  it('ordered počítá i položku s vlastním odpočtem závozu — ten se místo toho odečte ze stock', () => {
    const rows = computeBottlingNeeds(
      makeInput({
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [
          { id: 'i1', order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 60 }, // ráno odečteno
          { id: 'i2', order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 40 }, // ještě čeká
        ],
        zavozDeductionRows: [{ deduct_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 60, order_item_id: 'i1' }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-bottle');
    expect(row!.ordered).toBe(100); // i1 + i2 — celková týdenní potřeba
    // Sklad bez inventury a bez stočení: 60 odjelo „na dluh" → −60, stejně
    // jako ve Skladu. Chybí 40 na zbytek + 60 dluhu (dřív se dluh ořízl na 0).
    expect(row!.stock).toBe(-60);
    expect(row!.missing).toBe(100);
  });

  // 🐛 Regrese k hlášení z 22. 9. 2026: „potreby staceni: neodecitaji se
  // stocene lahve a sudy, furt mi to ukazuje vysoky cisla."
  //
  // Objednávka se veze na dvakrát a uzavře se teprve tehdy, když má odpočet
  // KAŽDÁ položka. Do té doby zůstávala v potřebě CELÁ — ačkoli zavezenou
  // část skladová kniha ze `stock` dávno odečetla. Tytéž kusy se tak odečetly
  // dvakrát a „chybí stočit" ukazovalo víc, než kolik doopravdy chybělo.
  it('zavezená část rozvezené objednávky se do „chybí stočit" nepočítá dvakrát', () => {
    const rows = computeBottlingNeeds(
      makeInput({
        // 100 na skladě, z toho 60 už ráno odjelo → fyzicky zbývá 40.
        inventoryRows: [{ entry_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 100, note: 'Počáteční' }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [
          { id: 'i1', order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 60 }, // zavezeno
          { id: 'i2', order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 40 }, // ještě čeká
        ],
        zavozDeductionRows: [
          { deduct_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 60, order_item_id: 'i1' },
        ],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-bottle')!;
    expect(row.stock).toBe(40); // 100 − 60 (kniha si odvoz odečetla sama)
    expect(row.ordered).toBe(100); // sloupec „objednáno" zůstává celá potřeba
    // Tohle číslo se ukazuje v přehledu jako „zbývá zavézt" — podle něj se
    // rozhoduje, kolik stočit (zadání 23. 9. 2026).
    expect(row.zbyvaZavezt).toBe(40); // 100 − 60 zavezených
    // Zbývá zavézt 40 a na skladě je právě 40 → stočit není potřeba nic.
    // Dřív tu vyšlo 60 (100 − 40), tedy přesně ta zavezená část navíc.
    expect(row.missing).toBe(0);
    expect(row.afterOutgoing).toBe(0);
  });

  it('nezavezená objednávka se počítá celá (nic se neodpouští)', () => {
    const rows = computeBottlingNeeds(
      makeInput({
        inventoryRows: [{ entry_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 40, note: 'Počáteční' }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [{ id: 'i1', order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 100 }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-bottle')!;
    expect(row.missing).toBe(60); // 100 − 40
  });

  it('odpočet bez vazby na položku (order_item_id chybí) potřebu neodpouští', () => {
    // Takový odpočet kniha ze `stock` odečte, ale nedá se přiřadit k žádné
    // položce — poptávka proto zůstává celá, ať se omylem nic „neztratí".
    const rows = computeBottlingNeeds(
      makeInput({
        inventoryRows: [{ entry_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 100, note: 'Počáteční' }],
        orders: [{ id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova', is_delivered: false }],
        orderItems: [{ id: 'i1', order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 100 }],
        zavozDeductionRows: [{ deduct_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 60 }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-bottle')!;
    expect(row.stock).toBe(40);
    expect(row.missing).toBe(60); // 100 − 40
  });

  it('zavezené objednávky (zavoz_deductions) se odečtou ze skladu — stejný zdroj jako Sklad/Inventura', () => {
    const rows = computeBottlingNeeds(
      makeInput({
        inventoryRows: [{ entry_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 100, note: 'Počáteční' }],
        zavozDeductionRows: [{ deduct_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 30 }],
      })
    );
    const row = rows.find((r) => r.package_id === 'p-bottle');
    expect(row!.stock).toBe(70); // 100 − 30
  });

  // 🔴 Z provozu 24. 9. 2026: „potřeby stáčení neodečítají stočené piva".
  // Sklad byl v mínusu (−1×30 12° Světlé) a ořez na nulu způsoboval, že
  // stočení „chybí" nesnížilo o celý počet — nebo vůbec.
  describe('12° 30 l z provozu — každý stočený sud ubere z „chybí" jeden', () => {
    const PO = '2026-08-10';
    const UT = '2026-08-11';
    const vstup = (stoceno: number, pocatek: number, naStredu: number) => makeInput({
      todayStr: UT,
      packages: [PKG_KEG],
      // Pondělní ranní stav potvrzený inventurou.
      inventoryRows: [{ entry_date: PO, beer_id: 'b1', package_id: 'p-keg', quantity: pocatek, note: 'Počáteční' }],
      keggingRows: stoceno ? [{ entry_date: UT, beer_id: 'b1', package_id: 'p-keg', quantity: stoceno }] : [],
      orders: [
        { id: 'po', order_date: PO, delivery_date: PO, status: 'nova' }, // „Zavezeno" nikdo neodklikl
        { id: 'st', order_date: UT, delivery_date: '2026-08-12', status: 'nova' },
      ],
      orderItems: [
        { id: 'i-po', order_id: 'po', beer_id: 'b1', package_id: 'p-keg', quantity: 14 },
        { id: 'i-st', order_id: 'st', beer_id: 'b1', package_id: 'p-keg', quantity: naStredu },
      ],
      zavozDeductionRows: [{ deduct_date: PO, beer_id: 'b1', package_id: 'p-keg', quantity: 14, order_item_id: 'i-po' }],
    });
    const radek = (stoceno: number, pocatek: number, naStredu: number) =>
      computeBottlingNeeds(vstup(stoceno, pocatek, naStredu)).find((r) => r.package_id === 'p-keg')!;

    it('pondělí 15, odjelo 14, na středu 3 → skladem 1, chybí 2; po 2 stočených nic', () => {
      expect(radek(0, 15, 3).stock).toBe(1);
      expect(radek(0, 15, 3).zbyvaZavezt).toBe(3);
      expect(radek(0, 15, 3).missing).toBe(2);
      expect(radek(2, 15, 3).missing).toBe(0);
    });

    it('sklad v mínusu: stočení se projeví celé, ne až po vynulování dluhu', () => {
      // 6 v pondělí, 14 odjelo → Sklad −8; na středu 10 → chybí 18.
      expect(radek(0, 6, 10).stock).toBe(-8);
      expect(radek(0, 6, 10).missing).toBe(18);
      expect(radek(5, 6, 10).missing).toBe(13); // dřív pořád 10 (−3 → 0)
      expect(radek(18, 6, 10).missing).toBe(0);
    });

    it('sklad −1 a nic dalšího k zavezení → chybí 1, ne „vše stočeno"', () => {
      // Pondělí 15, v pondělí 14 a v úterý ještě 2 → Sklad −1.
      const v = vstup(0, 15, 2);
      v.zavozDeductionRows = [
        ...(v.zavozDeductionRows ?? []),
        { deduct_date: UT, beer_id: 'b1', package_id: 'p-keg', quantity: 2, order_item_id: 'i-st' },
      ];
      const r = computeBottlingNeeds(v).find((x) => x.package_id === 'p-keg')!;
      expect(r.stock).toBe(-1);
      expect(r.zbyvaZavezt).toBe(0);
      expect(r.missing).toBe(1);
    });
  });

  it('nejnaléhavější řádek (nejvíc chybí stočit) je první — dřív bylo pořadí jen podle číselníku piv', () => {
    const BEER2 = { id: 'b2', name: 'Tmavý speciál 13°' };
    const rows = computeBottlingNeeds(
      makeInput({
        beers: [BEER, BEER2],
        orders: [
          { id: 'o1', order_date: todayStr, delivery_date: todayStr, status: 'nova' },
          { id: 'o2', order_date: todayStr, delivery_date: todayStr, status: 'nova' },
        ],
        orderItems: [
          // b1 (první v číselníku): chybí jen málo
          { order_id: 'o1', beer_id: 'b1', package_id: 'p-bottle', quantity: 20 },
          // b2 (druhý v číselníku): chybí hodně — musí být v přehledu NAHOŘE
          { order_id: 'o2', beer_id: 'b2', package_id: 'p-bottle', quantity: 200 },
        ],
        inventoryRows: [
          { entry_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 15, note: 'Počáteční' },
        ],
      })
    );
    expect(rows[0].beer_id).toBe('b2');
    expect(rows[0].missing).toBeGreaterThan(rows[1].missing);
  });

  it('bez chybějícího stočení vyhrává řádek s nejmenší rezervou — ten je blíž k tomu, aby chybět začal', () => {
    const BEER2 = { id: 'b2', name: 'Tmavý speciál 13°' };
    const rows = computeBottlingNeeds(
      makeInput({
        beers: [BEER, BEER2],
        inventoryRows: [
          { entry_date: todayStr, beer_id: 'b1', package_id: 'p-bottle', quantity: 500, note: 'Počáteční' },
          { entry_date: todayStr, beer_id: 'b2', package_id: 'p-bottle', quantity: 10, note: 'Počáteční' },
        ],
      })
    );
    expect(rows.every((r) => r.missing === 0)).toBe(true);
    expect(rows[0].beer_id).toBe('b2');
  });
});

describe('seskupPodlePiva', () => {
  const radek = (beer_id: string, beer_name: string, package_id: string, missing = 0): NeedsRow => ({
    beer_id, beer_name, package_id, package_label: package_id, volume_l: 0.5,
    ordered: 0, zbyvaZavezt: 0, stock: 0, planned: 0, fasovani: 0, afterBottling: 0, missing, afterOutgoing: -missing,
  });

  it('sloučí víc obalů téhož piva do jedné skupiny', () => {
    // Přesně naměřený případ 8. 9. 2026: 12° Světlá ve třech velikostech
    // lahví byly tři samostatné řádky, teď jedna karta se třemi obaly.
    const skupiny = seskupPodlePiva([
      radek('b1', '12° Světlá', 'p-1l', 45),
      radek('b1', '12° Světlá', 'p-05l', 40),
      radek('b2', 'Jantar', 'p-1l', 28),
      radek('b1', '12° Světlá', 'p-15l', 30),
    ]);
    expect(skupiny).toHaveLength(2);
    expect(skupiny[0].beerId).toBe('b1');
    expect(skupiny[0].radky.map((r) => r.package_id)).toEqual(['p-1l', 'p-05l', 'p-15l']);
    expect(skupiny[1].radky).toHaveLength(1);
  });

  it('zachová pořadí podle naléhavosti — první výskyt piva rozhoduje o pořadí karet', () => {
    // Vstup už přichází seřazený od computeBottlingNeeds (nejvíc chybí
    // nahoře); seskupení tohle pořadí nesmí rozhodit.
    const skupiny = seskupPodlePiva([
      radek('b1', 'Naléhavé', 'p1', 100),
      radek('b2', 'V pořádku', 'p1', 0),
      radek('b1', 'Naléhavé', 'p2', 5),
    ]);
    expect(skupiny.map((s) => s.beerId)).toEqual(['b1', 'b2']);
  });

  it('prázdný seznam dá prázdné skupiny', () => {
    expect(seskupPodlePiva([])).toEqual([]);
  });
});
