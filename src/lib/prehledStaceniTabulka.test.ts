// 📊 Tabulka přehledu stáčení lahví (lib/prehledStaceniTabulka.ts).
// Zadání z 15. 10. 2026: „přehled stáčení v takové tabulce jako ten excel — ať
// je vidět, kolik se stočilo z kolika sudů, výtrata, a šlo to editovat."
import { describe, it, expect } from 'vitest';
import type { EntryRow, Package } from './supabase';
import { davkyStaceni } from './prehledStaceni';
import {
  celeCislo, klicObjemu, planDatumPivo, planLahve, planSmazaniRadku, planSudy, popisObjemu, radkyDavky,
  sloupecSudu, souctyRadku, vytrataKeKontrole, type KontextPlanu, type Operace, type Plan, type RadekTabulky,
} from './prehledStaceniTabulka';

const OBALY = [
  { id: 'l15', code: 'l15', kind: 'bottle', volume_l: 1.5, label: '1.5l', sort_order: 1 },
  { id: 'l1', code: 'l1', kind: 'bottle', volume_l: 1, label: '1l', sort_order: 2 },
  { id: 'l05', code: 'l05', kind: 'bottle', volume_l: 0.5, label: '0.5l', sort_order: 3 },
  { id: 'l033', code: 'l033', kind: 'bottle', volume_l: 0.33, label: '0.33l', sort_order: 4 },
  { id: 'l075', code: 'l075', kind: 'bottle', volume_l: 0.75, label: '0.75l', sort_order: 5 },
  { id: 'k50', code: 'k50', kind: 'keg', volume_l: 50, label: ' 50l', sort_order: 6 },
  { id: 'k30', code: 'k30', kind: 'keg', volume_l: 30, label: '30l', sort_order: 7 },
  { id: 'k20', code: 'k20', kind: 'keg', volume_l: 20, label: '20l', sort_order: 8 },
  { id: 'k15', code: 'k15', kind: 'keg', volume_l: 15, label: '15l', sort_order: 9 },
  { id: 'k10', code: 'k10', kind: 'keg', volume_l: 10, label: '10l', sort_order: 10 },
  { id: 'k100', code: 'k100', kind: 'keg', volume_l: 100, label: '100l', sort_order: 11 },
] as Package[];

const zaznam = (o: Partial<EntryRow> & { id: string }): EntryRow => ({
  entry_date: '2026-10-12',
  beer_id: 'b12',
  beer_name: '12° Světlá',
  package_id: 'l1',
  package_label: '1l',
  quantity: 10,
  note: null,
  created_at: '2026-10-12T08:00:00+00:00',
  kegs_used: 1,
  kegs_used_package_id: 'k50',
  source_volume_l: 50,
  ...o,
});

const objem = (id: string | null) => Number(OBALY.find((p) => p.id === id)?.volume_l) || 0;
const getBatchId = (r: EntryRow) => `${r.entry_date}_${r.beer_id}_${r.created_at.slice(0, 19)}_${r.kegs_used_package_id ?? ''}`;

/** Přesně to, co dělá obrazovka: kladné záznamy → dávky → řádky tabulky. */
function tabulka(zaznamy: EntryRow[]): RadekTabulky[] {
  const kladne = zaznamy.filter((z) => z.quantity > 0);
  return davkyStaceni(kladne, objem).flatMap((d) => radkyDavky(d, OBALY, getBatchId));
}
const ctx = (zaznamy: EntryRow[]): KontextPlanu => ({ zaznamy, obaly: OBALY, getBatchId });
const operace = (p: Plan): Operace => {
  if (!p.ok) throw new Error(`plán selhal: ${p.zprava}`);
  if (!p.operace) throw new Error('plán nic nemění');
  return p.operace;
};
const zprava = (p: Plan): string => (p.ok ? '' : p.zprava);

describe('celeCislo', () => {
  it('prázdné políčko je nula, číslice jsou číslo', () => {
    expect(celeCislo('')).toBe(0);
    expect(celeCislo('   ')).toBe(0);
    expect(celeCislo(null)).toBe(0);
    expect(celeCislo(undefined)).toBe(0);
    expect(celeCislo('12')).toBe(12);
    expect(celeCislo(' 7 ')).toBe(7);
    expect(celeCislo(0)).toBe(0);
    expect(celeCislo(44)).toBe(44);
  });

  it('desetinné číslo, mínus, písmena ani exponent se nezaokrouhlují — jsou chyba', () => {
    for (const spatne of ['1,5', '1.5', '-3', 'abc', '1e3', '12a', '+4', '1 2', '1234567']) {
      expect(celeCislo(spatne), spatne).toBeNull();
    }
  });
});

describe('klicObjemu a popisObjemu', () => {
  it('0,33 je 0,33 i po plovoucí čárce', () => {
    expect(klicObjemu(0.1 + 0.23)).toBe(0.33);
    expect(popisObjemu(0.33)).toBe('0,33 L');
    expect(popisObjemu(1.5)).toBe('1,5 L');
    expect(popisObjemu(50)).toBe('50 L');
  });

  it('sloupec sudu se pozná podle velikosti, jiná velikost je -1', () => {
    expect(sloupecSudu(50)).toBe(0);
    expect(sloupecSudu(30)).toBe(1);
    expect(sloupecSudu(10)).toBe(4);
    expect(sloupecSudu(100)).toBe(-1);
    expect(sloupecSudu(0)).toBe(-1);
  });
});

describe('radkyDavky — řádek je šarže', () => {
  it('jedno stáčení: sudy a lahve ve svých sloupcích, litry a výtrata', () => {
    const [r] = tabulka([
      zaznam({ id: 'a', package_id: 'l15', quantity: 30, kegs_used: 2, source_volume_l: 100 }),
      zaznam({ id: 'b', package_id: 'l1', quantity: 44, kegs_used: 2, source_volume_l: 100 }),
    ]);
    expect(r.beerName).toBe('12° Světlá');
    expect(r.sudu).toBe(2);
    expect(r.sudPkgId).toBe('k50');
    expect(r.sudObjem).toBe(50);
    expect(r.chybiVelikost).toBe(false);
    // sloupce lahví: 1,5 · 1,0 · 0,5 · 0,33
    expect(r.lahve.map((b) => b.objem)).toEqual([1.5, 1, 0.5, 0.33]);
    expect(r.lahve.map((b) => b.ks)).toEqual([30, 44, 0, 0]);
    expect(r.lahve[0].zaznamy.map((z) => z.id)).toEqual(['a']);
    expect(r.lahve[1].zaznamy.map((z) => z.id)).toEqual(['b']);
    expect(r.lahve[2].zaznamy).toEqual([]);
    // 30 × 1,5 + 44 × 1 = 89 l z 2 × 50 l = 100 l → výtrata 11 %
    expect(r.litry).toBe(89);
    expect(r.zdrojL).toBe(100);
    expect(r.vytrata).toBe(11);
    expect(r.lahveJine).toEqual([]);
  });

  it('dvě stáčení téhož piva v jeden den jsou dva řádky, v pořadí, jak přišla', () => {
    const rs = tabulka([
      zaznam({ id: 'a', package_id: 'l1', quantity: 44, kegs_used: 2, source_volume_l: 100 }),
      zaznam({ id: 'b', package_id: 'l05', quantity: 20, kegs_used: 1, created_at: '2026-10-12T10:00:00+00:00' }),
    ]);
    expect(rs).toHaveLength(2);
    expect(rs[0].zaznamy.map((z) => z.id)).toEqual(['a']);
    expect(rs[1].zaznamy.map((z) => z.id)).toEqual(['b']);
    expect(rs[0].klic).not.toBe(rs[1].klic);
  });

  it('dávka ze dvou velikostí sudů (stejný čas) jsou dva řádky, každý se svým sudem', () => {
    const rs = tabulka([
      zaznam({ id: 'a', package_id: 'l033', quantity: 10, kegs_used: 1, kegs_used_package_id: 'k30', source_volume_l: 30 }),
      zaznam({ id: 'b', package_id: 'l1', quantity: 47, kegs_used: 1, kegs_used_package_id: 'k50' }),
    ]);
    expect(rs).toHaveLength(2);
    expect(rs.map((r) => r.sudObjem).sort()).toEqual([30, 50]);
    const r30 = rs.find((r) => r.sudObjem === 30)!;
    expect(r30.lahve[3].ks).toBe(10); // 0,33 l
    expect(r30.zdrojL).toBe(30);
  });

  it('stáčení rovnou z tanku nemá sud ani výtratu', () => {
    const [r] = tabulka([zaznam({ id: 'a', kegs_used: null, kegs_used_package_id: null, source_volume_l: null, package_id: 'l05', quantity: 40 })]);
    expect(r.sudu).toBe(0);
    expect(r.sudPkgId).toBeNull();
    expect(r.chybiVelikost).toBe(false);
    expect(r.zdrojL).toBe(0);
    expect(r.vytrata).toBeNull();
    expect(r.litry).toBe(20);
  });

  it('počet sudů bez velikosti: chybí velikost, výtrata se nepočítá', () => {
    const [r] = tabulka([zaznam({ id: 'a', kegs_used: 2, kegs_used_package_id: null, source_volume_l: null })]);
    expect(r.sudu).toBe(2);
    expect(r.sudPkgId).toBeNull();
    expect(r.sudObjem).toBe(0);
    expect(r.chybiVelikost).toBe(true);
    expect(r.vytrata).toBeNull();
  });

  it('stejný obal víckrát v jedné šarži (data z Excelu) je jedna buňka se všemi záznamy', () => {
    const [r] = tabulka([
      zaznam({ id: 'a', package_id: 'l1', quantity: 81 }),
      zaznam({ id: 'b', package_id: 'l1', quantity: 46 }),
    ]);
    expect(r.lahve[1].zaznamy.map((z) => z.id)).toEqual(['a', 'b']);
    expect(r.lahve[1].ks).toBe(127);
  });

  it('obal mimo čtyři sloupce se neztratí: je v „jiných" a litry ho počítají', () => {
    const [r] = tabulka([
      zaznam({ id: 'a', package_id: 'l1', quantity: 10 }),
      zaznam({ id: 'b', package_id: 'l075', quantity: 8 }),
    ]);
    expect(r.lahveJine.map((z) => z.id)).toEqual(['b']);
    expect(r.lahve.map((b) => b.ks)).toEqual([0, 10, 0, 0]);
    expect(r.litry).toBe(16); // 10 + 8 × 0,75
  });

  it('sud mimo sloupce (100 l) má objem, ale ve sloupcích nikde není', () => {
    const [r] = tabulka([zaznam({ id: 'a', kegs_used: 1, kegs_used_package_id: 'k100', source_volume_l: 100 })]);
    expect(r.sudObjem).toBe(100);
    expect(sloupecSudu(r.sudObjem)).toBe(-1);
    expect(r.zdrojL).toBe(100);
    expect(r.chybiVelikost).toBe(false);
  });

  it('odkud se řádek vzal a vlastní poznámka jsou každá zvlášť', () => {
    const [auto] = tabulka([zaznam({ id: 'a', note: 'Doplněno z inventury 2026-08 — 1l z 50l (přebytek 3 ks)' })]);
    expect(auto.puvod).toMatch(/Doplněno po inventuře 2026-08/);
    expect(auto.poznamka).toBeNull();
    const [rucne] = tabulka([zaznam({ id: 'b', note: 'STÁČENÍ PIVOVAR' })]);
    expect(rucne.puvod).toBeNull();
    expect(rucne.poznamka).toBe('STÁČENÍ PIVOVAR');
    const [nic] = tabulka([zaznam({ id: 'c' })]);
    expect(nic.puvod).toBeNull();
    expect(nic.poznamka).toBeNull();
  });

  it('nositel zdroje je záznam, který sudy nese, i když není první', () => {
    // Starší zápisy mají počet sudů jen na JEDNOM řádku šarže.
    const [r] = tabulka([
      zaznam({ id: 'bez', package_id: 'l15', quantity: 30, kegs_used: null }),
      zaznam({ id: 'nese', package_id: 'l1', quantity: 44, kegs_used: 2, source_volume_l: 100 }),
    ]);
    expect(r.nositel?.id).toBe('nese');
    expect(r.sudu).toBe(2);
  });
});

describe('souctyRadku — „Celkem" pod tabulkou dne', () => {
  it('sečte sudy a lahve po sloupcích a litry', () => {
    const s = souctyRadku(tabulka([
      zaznam({ id: 'a', package_id: 'l15', quantity: 30, kegs_used: 2, source_volume_l: 100 }),
      zaznam({ id: 'b', package_id: 'l1', quantity: 44, kegs_used: 2, source_volume_l: 100 }),
      zaznam({ id: 'c', beer_id: 'bj', beer_name: 'Jantar', package_id: 'l1', quantity: 20, kegs_used: 1, kegs_used_package_id: 'k30', source_volume_l: 30, created_at: '2026-10-12T09:00:00+00:00' }),
    ]));
    expect(s.sudy).toEqual([2, 1, 0, 0, 0]); // 50 · 30 · 20 · 15 · 10
    expect(s.lahve).toEqual([30, 64, 0, 0]);
    expect(s.litry).toBe(109);
    expect(s.zdrojL).toBe(130);
    expect(s.sudyJine).toBe(0);
  });

  it('výtrata dne je jen z řádků se sudem — stáčení z tanku ji nesráží', () => {
    const s = souctyRadku(tabulka([
      zaznam({ id: 'a', package_id: 'l1', quantity: 90, kegs_used: 2, source_volume_l: 100 }),
      zaznam({ id: 'b', package_id: 'l1', quantity: 500, kegs_used: null, kegs_used_package_id: null, source_volume_l: null, created_at: '2026-10-12T09:00:00+00:00' }),
    ]));
    expect(s.litry).toBe(590);
    expect(s.zdrojL).toBe(100);
    expect(s.vytrata).toBe(10); // 90 l z 100 l, ne 590 l z 100 l
  });

  it('sudy mimo sloupce a obaly mimo sloupce se počítají zvlášť', () => {
    const s = souctyRadku(tabulka([
      zaznam({ id: 'a', package_id: 'l075', quantity: 8, kegs_used: 1, kegs_used_package_id: 'k100', source_volume_l: 100 }),
      zaznam({ id: 'b', package_id: 'l1', quantity: 5, kegs_used: 2, kegs_used_package_id: null, source_volume_l: null, created_at: '2026-10-12T09:00:00+00:00' }),
    ]));
    expect(s.sudyJine).toBe(3); // 1 × 100 l a 2 bez velikosti
    expect(s.lahveJine).toBe(8);
    expect(s.sudy).toEqual([0, 0, 0, 0, 0]);
  });

  it('prázdný seznam: samé nuly a žádná výtrata', () => {
    const s = souctyRadku([]);
    expect(s.sudy).toEqual([0, 0, 0, 0, 0]);
    expect(s.lahve).toEqual([0, 0, 0, 0]);
    expect(s.litry).toBe(0);
    expect(s.vytrata).toBeNull();
  });
});

describe('vytrataKeKontrole', () => {
  it('běžná výtrata je v pořádku, záporná a vysoká ne', () => {
    expect(vytrataKeKontrole(null)).toBe(false);
    expect(vytrataKeKontrole(10)).toBe(false);
    expect(vytrataKeKontrole(0)).toBe(false);
    expect(vytrataKeKontrole(-2)).toBe(false);
    expect(vytrataKeKontrole(-2.1)).toBe(true);
    expect(vytrataKeKontrole(-173)).toBe(true);
    expect(vytrataKeKontrole(25)).toBe(false);
    expect(vytrataKeKontrole(25.1)).toBe(true);
    expect(vytrataKeKontrole(91.7)).toBe(true);
  });
});

describe('planLahve — číslo v buňce lahví', () => {
  const ZAKLAD = [
    zaznam({ id: 'a', package_id: 'l15', quantity: 30, kegs_used: 2, source_volume_l: 100 }),
    zaznam({ id: 'b', package_id: 'l1', quantity: 44, kegs_used: 2, source_volume_l: 100 }),
  ];

  it('přepíše počet u existujícího záznamu', () => {
    const [r] = tabulka(ZAKLAD);
    const p = planLahve(r, 1, '40', ctx(ZAKLAD));
    expect(operace(p)).toEqual({ typ: 'update', ids: ['b'], zmena: { quantity: 40 } });
    expect(p.ok && p.popis).toMatch(/44 → 40 ks/);
  });

  it('stejné číslo nic nezapíše', () => {
    const [r] = tabulka(ZAKLAD);
    expect(planLahve(r, 1, '44', ctx(ZAKLAD))).toEqual({ ok: true, operace: null, popis: '' });
  });

  it('nula nebo prázdné políčko záznam smaže (s celým záznamem pro vrácení zpět)', () => {
    const [r] = tabulka(ZAKLAD);
    for (const text of ['0', '', '  ']) {
      const op = operace(planLahve(r, 1, text, ctx(ZAKLAD)));
      expect(op.typ).toBe('delete');
      expect(op.typ === 'delete' && op.zaznamy).toEqual([ZAKLAD[1]]);
    }
  });

  it('prázdná buňka + číslo = nový záznam ve STEJNÉ šarži (čas, sudy, den, pivo)', () => {
    const [r] = tabulka(ZAKLAD);
    const op = operace(planLahve(r, 0.5, '20', ctx(ZAKLAD)));
    expect(op).toEqual({
      typ: 'insert',
      radky: [{
        entry_date: '2026-10-12',
        beer_id: 'b12',
        beer_name: '12° Světlá',
        package_id: 'l05',
        package_label: '0.5l',
        quantity: 20,
        kegs_used: 2,
        kegs_used_package_id: 'k50',
        source_volume_l: 100,
        note: null,
        created_at: '2026-10-12T08:00:00+00:00',
      }],
    });
    // … a skutečně zapadne do téže šarže:
    const nove = (op.typ === 'insert' ? op.radky : []).map((n, i) => ({ ...n, id: `n${i}` }) as EntryRow);
    expect(getBatchId(nove[0])).toBe(getBatchId(ZAKLAD[0]));
    expect(tabulka([...ZAKLAD, ...nove])).toHaveLength(1);
  });

  it('nový záznam v šarži bez sudu sudy nepřidá', () => {
    const rs = [zaznam({ id: 'a', package_id: 'l1', quantity: 10, kegs_used: null, kegs_used_package_id: null, source_volume_l: null })];
    const [r] = tabulka(rs);
    const op = operace(planLahve(r, 0.33, '5', ctx(rs)));
    expect(op.typ === 'insert' && op.radky[0]).toMatchObject({ kegs_used: null, kegs_used_package_id: null, source_volume_l: null, package_id: 'l033' });
  });

  it('nový záznam bere sudy ze záznamu, který je nese (starší zápisy je mají jen na jednom řádku)', () => {
    const rs = [
      zaznam({ id: 'bez', package_id: 'l15', quantity: 30, kegs_used: null, kegs_used_package_id: 'k50', source_volume_l: null, created_at: '2026-10-12T08:00:00.100+00:00' }),
      zaznam({ id: 'nese', package_id: 'l1', quantity: 44, kegs_used: 2, source_volume_l: 100, created_at: '2026-10-12T08:00:00.200+00:00' }),
    ];
    const [r] = tabulka(rs);
    const op = operace(planLahve(r, 0.5, '20', ctx(rs)));
    expect(op.typ === 'insert' && op.radky[0]).toMatchObject({ kegs_used: 2, source_volume_l: 100, created_at: '2026-10-12T08:00:00.200+00:00' });
  });

  it('vlastní poznámku nový záznam zdědí, poznámku „odkud se vzal" ne', () => {
    const vlastni = [zaznam({ id: 'a', note: 'STÁČENÍ PIVOVAR' })];
    const [r1] = tabulka(vlastni);
    expect(operace(planLahve(r1, 0.5, '3', ctx(vlastni))).typ === 'insert' && (operace(planLahve(r1, 0.5, '3', ctx(vlastni))) as any).radky[0].note).toBe('STÁČENÍ PIVOVAR');
    const auto = [zaznam({ id: 'b', note: 'Doplněno z inventury 2026-08 — 1l z 50l (přebytek 3 ks)' })];
    const [r2] = tabulka(auto);
    expect((operace(planLahve(r2, 0.5, '3', ctx(auto))) as any).radky[0].note).toBeNull();
  });

  it('prázdná buňka + nula nebo prázdno nedělá nic', () => {
    const [r] = tabulka(ZAKLAD);
    expect(planLahve(r, 0.5, '0', ctx(ZAKLAD))).toEqual({ ok: true, operace: null, popis: '' });
    expect(planLahve(r, 0.5, '', ctx(ZAKLAD))).toEqual({ ok: true, operace: null, popis: '' });
  });

  it('víc záznamů v buňce: nejde říct který, proto chyba', () => {
    const rs = [zaznam({ id: 'a', quantity: 81 }), zaznam({ id: 'b', quantity: 46 })];
    const [r] = tabulka(rs);
    const p = planLahve(r, 1, '100', ctx(rs));
    expect(p.ok).toBe(false);
    expect(zprava(p)).toMatch(/2 záznamů/);
    expect(zprava(p)).toMatch(/uprav je zvlášť/);
  });

  it('neplatné číslo je chyba, ne tiché zaokrouhlení', () => {
    const [r] = tabulka(ZAKLAD);
    for (const text of ['4,5', 'abc', '-2']) {
      const p = planLahve(r, 1, text, ctx(ZAKLAD));
      expect(p.ok, text).toBe(false);
      expect(zprava(p)).toMatch(/celé číslo/);
    }
  });

  it('obal bez katalogu je chyba', () => {
    const [r] = tabulka(ZAKLAD);
    const p = planLahve(r, 0.5, '5', { ...ctx(ZAKLAD), obaly: OBALY.filter((o) => o.id !== 'l05') });
    expect(zprava(p)).toMatch(/0,5 L není v katalogu/);
  });

  it('sloupec, který v tabulce není, je chyba', () => {
    const [r] = tabulka(ZAKLAD);
    expect(zprava(planLahve(r, 0.75, '5', ctx(ZAKLAD)))).toMatch(/není/);
  });
});

describe('planSudy — číslo v buňce sudů', () => {
  const SARZE = [
    zaznam({ id: 'a', package_id: 'l15', quantity: 30, kegs_used: 2, source_volume_l: 100 }),
    zaznam({ id: 'b', package_id: 'l1', quantity: 44, kegs_used: 2, source_volume_l: 100 }),
  ];

  it('změní počet sudů stejné velikosti na VŠECH záznamech šarže', () => {
    const [r] = tabulka(SARZE);
    expect(operace(planSudy(r, 50, '3', ctx(SARZE)))).toEqual({
      typ: 'update',
      ids: ['a', 'b'],
      zmena: { kegs_used: 3, kegs_used_package_id: 'k50', source_volume_l: 150 },
    });
  });

  it('mění i skrytý záznam šarže (oprava z inventury), jinak by se sud odečetl podruhé', () => {
    const skryty = zaznam({ id: 'skryty', package_id: 'l05', quantity: -5, kegs_used: 2, source_volume_l: 100 });
    const vse = [...SARZE, skryty];
    const [r] = tabulka(vse); // záporný záznam v tabulce není
    expect(r.zaznamy.map((z) => z.id)).toEqual(['a', 'b']);
    const op = operace(planSudy(r, 50, '3', ctx(vse)));
    expect(op.typ === 'update' && op.ids.sort()).toEqual(['a', 'b', 'skryty']);
  });

  it('stejné číslo nic nezapíše', () => {
    const [r] = tabulka(SARZE);
    expect(planSudy(r, 50, '2', ctx(SARZE))).toEqual({ ok: true, operace: null, popis: '' });
  });

  it('nula ve sloupci, který šarže má, sudy odebere (velikost zůstane k dohledání)', () => {
    const [r] = tabulka(SARZE);
    for (const text of ['0', '']) {
      expect(operace(planSudy(r, 50, text, ctx(SARZE)))).toEqual({
        typ: 'update',
        ids: ['a', 'b'],
        zmena: { kegs_used: null, source_volume_l: null },
      });
    }
  });

  it('nula ve sloupci jiné velikosti nic neruší — tam stejně nic nebylo', () => {
    const [r] = tabulka(SARZE);
    expect(planSudy(r, 30, '0', ctx(SARZE))).toEqual({ ok: true, operace: null, popis: '' });
    expect(planSudy(r, 30, '', ctx(SARZE))).toEqual({ ok: true, operace: null, popis: '' });
  });

  it('číslo ve sloupci jiné velikosti sudy PŘESUNE do té velikosti', () => {
    const [r] = tabulka(SARZE);
    expect(operace(planSudy(r, 30, '2', ctx(SARZE)))).toEqual({
      typ: 'update',
      ids: ['a', 'b'],
      zmena: { kegs_used: 2, kegs_used_package_id: 'k30', source_volume_l: 60 },
    });
  });

  it('šarže bez sudu: číslo ve sloupci nastaví velikost i počet', () => {
    const rs = [zaznam({ id: 'a', kegs_used: null, kegs_used_package_id: null, source_volume_l: null })];
    const [r] = tabulka(rs);
    expect(operace(planSudy(r, 20, '4', ctx(rs)))).toEqual({
      typ: 'update',
      ids: ['a'],
      zmena: { kegs_used: 4, kegs_used_package_id: 'k20', source_volume_l: 80 },
    });
  });

  it('šarže bez sudu a nula: nic', () => {
    const rs = [zaznam({ id: 'a', kegs_used: null, kegs_used_package_id: null, source_volume_l: null })];
    const [r] = tabulka(rs);
    expect(planSudy(r, 50, '0', ctx(rs))).toEqual({ ok: true, operace: null, popis: '' });
  });

  it('počet sudů bez velikosti: klepnutí na sloupec velikost doplní', () => {
    const rs = [zaznam({ id: 'a', kegs_used: 2, kegs_used_package_id: null, source_volume_l: null })];
    const [r] = tabulka(rs);
    expect(r.chybiVelikost).toBe(true);
    expect(operace(planSudy(r, 50, '2', ctx(rs)))).toEqual({
      typ: 'update',
      ids: ['a'],
      zmena: { kegs_used: 2, kegs_used_package_id: 'k50', source_volume_l: 100 },
    });
  });

  it('počet sudů bez velikosti: nula počet odstraní', () => {
    const rs = [zaznam({ id: 'a', kegs_used: 2, kegs_used_package_id: null, source_volume_l: null })];
    const [r] = tabulka(rs);
    expect(operace(planSudy(r, 30, '0', ctx(rs)))).toEqual({
      typ: 'update',
      ids: ['a'],
      zmena: { kegs_used: null, source_volume_l: null },
    });
  });

  it('přesun na velikost, kterou má druhá šarže téže dávky, je chyba (sloučily by se)', () => {
    const rs = [
      zaznam({ id: 'a', package_id: 'l033', quantity: 10, kegs_used: 1, kegs_used_package_id: 'k30', source_volume_l: 30 }),
      zaznam({ id: 'b', package_id: 'l1', quantity: 47, kegs_used: 1, kegs_used_package_id: 'k50' }),
    ];
    const r30 = tabulka(rs).find((r) => r.sudObjem === 30)!;
    const p = planSudy(r30, 50, '1', ctx(rs));
    expect(p.ok).toBe(false);
    expect(zprava(p)).toMatch(/už má sud této velikosti/);
  });

  it('stejná velikost jako druhá šarže, ale jiný čas zápisu, kolize není', () => {
    const rs = [
      zaznam({ id: 'a', kegs_used: 1, kegs_used_package_id: 'k30', source_volume_l: 30 }),
      zaznam({ id: 'b', kegs_used: 1, kegs_used_package_id: 'k50', created_at: '2026-10-12T10:00:00+00:00' }),
    ];
    const r30 = tabulka(rs).find((r) => r.sudObjem === 30)!;
    expect(planSudy(r30, 50, '1', ctx(rs)).ok).toBe(true);
  });

  it('neplatné číslo a sud mimo katalog jsou chyby', () => {
    const [r] = tabulka(SARZE);
    expect(zprava(planSudy(r, 50, '2,5', ctx(SARZE)))).toMatch(/celé číslo/);
    expect(zprava(planSudy(r, 50, 'x', ctx(SARZE)))).toMatch(/celé číslo/);
    expect(zprava(planSudy(r, 50, '2', { ...ctx(SARZE), obaly: OBALY.filter((o) => o.id !== 'k50') }))).toMatch(/50 L není v katalogu/);
  });

  it('řádek, který mezitím zmizel, je chyba, ne zápis naslepo', () => {
    const [r] = tabulka(SARZE);
    expect(zprava(planSudy(r, 50, '3', ctx([])))).toMatch(/načti přehled znovu/);
  });
});

describe('planSmazaniRadku', () => {
  it('smaže všechny záznamy řádku a pošle je celé (pro vrácení zpět)', () => {
    const rs = [
      zaznam({ id: 'a', package_id: 'l15', quantity: 30 }),
      zaznam({ id: 'b', package_id: 'l1', quantity: 44 }),
      zaznam({ id: 'c', package_id: 'l05', quantity: 20, created_at: '2026-10-12T10:00:00+00:00' }),
    ];
    const [r1, r2] = tabulka(rs);
    const op = operace(planSmazaniRadku(r1));
    expect(op).toEqual({ typ: 'delete', zaznamy: [rs[0], rs[1]] });
    expect(operace(planSmazaniRadku(r2))).toEqual({ typ: 'delete', zaznamy: [rs[2]] });
    const p = planSmazaniRadku(r1);
    expect(p.ok && p.popis).toBe('Smazáno: 12° Světlá (2 záznamy)');
  });

  it('česky: 1 záznam, 2 záznamy, 5 záznamů', () => {
    const rs5 = ['l15', 'l1', 'l05', 'l033', 'l075'].map((p, i) => zaznam({ id: `x${i}`, package_id: p }));
    const [r] = tabulka(rs5);
    expect(planSmazaniRadku(r).ok && (planSmazaniRadku(r) as any).popis).toMatch(/5 záznamů/);
    const [r1] = tabulka([zaznam({ id: 'solo' })]);
    expect((planSmazaniRadku(r1) as any).popis).toMatch(/1 záznam\)/);
  });
});

describe('planDatumPivo', () => {
  const PIVA = [{ id: 'b12', name: '12° Světlá' }, { id: 'bj', name: 'Jantar' }];
  const SARZE = [
    zaznam({ id: 'a', package_id: 'l15', quantity: 30 }),
    zaznam({ id: 'b', package_id: 'l1', quantity: 44 }),
  ];

  it('přesune všechny záznamy šarže na jiný den a k jinému pivu', () => {
    const [r] = tabulka(SARZE);
    expect(operace(planDatumPivo(r, { datum: '2026-10-13', beerId: 'bj' }, PIVA, ctx(SARZE)))).toEqual({
      typ: 'update',
      ids: ['a', 'b'],
      zmena: { entry_date: '2026-10-13', beer_id: 'bj', beer_name: 'Jantar' },
    });
  });

  it('přesune i skryté záznamy šarže', () => {
    const vse = [...SARZE, zaznam({ id: 'skryty', package_id: 'l05', quantity: -2 })];
    const [r] = tabulka(vse);
    const op = operace(planDatumPivo(r, { datum: '2026-10-13', beerId: 'b12' }, PIVA, ctx(vse)));
    expect(op.typ === 'update' && op.ids.sort()).toEqual(['a', 'b', 'skryty']);
  });

  it('beze změny nic nezapíše', () => {
    const [r] = tabulka(SARZE);
    expect(planDatumPivo(r, { datum: '2026-10-12', beerId: 'b12' }, PIVA, ctx(SARZE))).toEqual({ ok: true, operace: null, popis: '' });
  });

  it('špatné datum, neexistující den a neznámé pivo jsou chyby', () => {
    const [r] = tabulka(SARZE);
    for (const datum of ['', '12.10.2026', '2026-13-01', '2026-02-31', '2026-10-32']) {
      expect(zprava(planDatumPivo(r, { datum, beerId: 'b12' }, PIVA, ctx(SARZE))), datum).toMatch(/Datum/);
    }
    expect(zprava(planDatumPivo(r, { datum: '2026-10-13', beerId: 'neni' }, PIVA, ctx(SARZE)))).toMatch(/Vyber pivo/);
    expect(zprava(planDatumPivo(r, { datum: '2026-10-13', beerId: '' }, PIVA, ctx(SARZE)))).toMatch(/Vyber pivo/);
  });

  it('řádek, který mezitím zmizel, je chyba', () => {
    const [r] = tabulka(SARZE);
    expect(zprava(planDatumPivo(r, { datum: '2026-10-13', beerId: 'bj' }, PIVA, ctx([])))).toMatch(/načti přehled znovu/);
  });
});
