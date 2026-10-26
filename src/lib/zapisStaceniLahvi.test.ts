// 🍾 Zápis stáčení lahví — řádek formuláře → záznamy do `bottling`.
// Zadání z 15. 10. 2026: „přiřadíš sud, množství sudů a počet lahví z nich
// stočený a importuješ do tabulky" — řádek z tabulky na fotce má až čtyři druhy
// lahví (jako sloupce excelu) a každý má dostat svůj sud; dřív se čtvrtý
// druh zapsal bez sudu.
import { describe, it, expect } from 'vitest';
import {
  casyRadku, chybiPivo, datumRadku, indexRadkuProDlazdici, jeVyplneny, lahveRadku, maLahve,
  popisekLahviPoObjemu, souctyLahviPoObjemu, zaznamyZRadku,
  type KontextZapisu, type RadekStaceniLahvi,
} from './zapisStaceniLahvi';

const OBALY = [
  { id: 'k50', label: ' 50l', volume_l: 50 },
  { id: 'k30', label: '30l', volume_l: 30 },
  { id: 'k20', label: '20l', volume_l: 20 },
  { id: 'l15', label: '1.5l', volume_l: 1.5 },
  { id: 'l1', label: '1l', volume_l: 1 },
  { id: 'l05', label: '0.5l', volume_l: 0.5 },
  { id: 'l033', label: '0.33l', volume_l: 0.33 },
];
const ctx = (o: Partial<KontextZapisu> = {}): KontextZapisu => ({
  datum: '2026-10-15', poznamka: '', obaly: OBALY, piva: [{ id: 'b12', name: '12° Světlá' }], ...o,
});
const radek = (o: Partial<RadekStaceniLahvi> = {}): RadekStaceniLahvi => ({
  beerId: 'b12',
  pkgId: '', qty: '', pkg2Id: '', qty2: '', pkg3Id: '', qty3: '', pkg4Id: '', qty4: '',
  kegPkgId: '', kegQty: '', keg2PkgId: '', keg2Qty: '',
  ...o,
});
const zaznamy = (r: RadekStaceniLahvi, c = ctx()) => {
  const v = zaznamyZRadku(r, c);
  if ('nelzeRozdelit' in v) throw new Error('nelzeRozdelit');
  return v.zaznamy;
};

describe('jeden sud, víc druhů lahví', () => {
  it('každý druh lahví je vlastní řádek a všechny nesou stejný zdroj ze sudů', () => {
    const z = zaznamy(radek({
      kegPkgId: 'k50', kegQty: '1',
      pkgId: 'l15', qty: '11', pkg2Id: 'l05', qty2: '20', pkg3Id: 'l033', qty3: '60',
    }));
    expect(z.map((x) => [x.package_id, x.quantity])).toEqual([['l15', 11], ['l05', 20], ['l033', 60]]);
    for (const x of z) {
      expect(x).toMatchObject({
        entry_date: '2026-10-15', beer_id: 'b12', beer_name: '12° Světlá',
        kegs_used: 1, kegs_used_package_id: 'k50', source_volume_l: 50,
      });
    }
  });

  it('ČTVRTÝ druh lahví nese stejný sud jako ostatní (dřív se zapsal bez sudu)', () => {
    const z = zaznamy(radek({
      kegPkgId: 'k50', kegQty: '2',
      pkgId: 'l15', qty: '30', pkg2Id: 'l1', qty2: '44', pkg3Id: 'l05', qty3: '20', pkg4Id: 'l033', qty4: '60',
    }));
    expect(z).toHaveLength(4);
    expect(z.map((x) => x.package_id)).toEqual(['l15', 'l1', 'l05', 'l033']);
    for (const x of z) expect(x).toMatchObject({ kegs_used: 2, kegs_used_package_id: 'k50', source_volume_l: 100 });
  });

  it('zdrojový objem = počet sudů × objem sudu', () => {
    const z = zaznamy(radek({ kegPkgId: 'k30', kegQty: '6', pkgId: 'l1', qty: '100' }));
    expect(z[0]).toMatchObject({ kegs_used: 6, kegs_used_package_id: 'k30', source_volume_l: 180 });
  });

  it('popisky obalů se berou z katalogu', () => {
    const z = zaznamy(radek({ kegPkgId: 'k50', kegQty: '1', pkgId: 'l15', qty: '5' }));
    expect(z[0].package_label).toBe('1.5l');
  });
});

describe('bez sudu a zápis na sud', () => {
  it('bez sudu: kegs_used, velikost i zdrojový objem jsou prázdné', () => {
    const z = zaznamy(radek({ pkgId: 'l1', qty: '45' }));
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ kegs_used: null, kegs_used_package_id: null, source_volume_l: null });
  });

  it('počet sudů bez velikosti: počet se zapíše, velikost zůstane prázdná', () => {
    const z = zaznamy(radek({ kegQty: '2', pkgId: 'l1', qty: '45' }));
    expect(z[0]).toMatchObject({ kegs_used: 2, kegs_used_package_id: null, source_volume_l: null });
  });

  it('není-li vybraná první lahev, počet prvního slotu jde na obal sudu', () => {
    const z = zaznamy(radek({ kegPkgId: 'k50', kegQty: '1', qty: '3' }));
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ package_id: 'k50', quantity: 3 });
  });

  it('druhý ani další slot bez obalu se nezapíše', () => {
    const z = zaznamy(radek({ pkgId: 'l1', qty: '45', qty2: '7', qty4: '9' }));
    expect(z).toHaveLength(1);
  });

  it('nulový počet se nezapíše', () => {
    const z = zaznamy(radek({ pkgId: 'l1', qty: '45', pkg2Id: 'l05', qty2: '0' }));
    expect(z.map((x) => x.package_id)).toEqual(['l1']);
  });
});

describe('dva sudy — lahve se rozpočítají podle litrů', () => {
  const r = radek({
    kegPkgId: 'k50', kegQty: '1', keg2PkgId: 'k20', keg2Qty: '1',
    pkgId: 'l15', qty: '14', pkg2Id: 'l1', qty2: '56', pkg3Id: 'l05', qty3: '28', pkg4Id: 'l033', qty4: '14',
  });

  it('součet kusů každého obalu zůstane, i u čtvrtého druhu', () => {
    const z = zaznamy(r);
    const soucet = (id: string) => z.filter((x) => x.package_id === id).reduce((s, x) => s + x.quantity, 0);
    expect(soucet('l15')).toBe(14);
    expect(soucet('l1')).toBe(56);
    expect(soucet('l05')).toBe(28);
    expect(soucet('l033')).toBe(14);
  });

  it('každý záznam nese JEDEN sud a jeho litry; oba sudy jsou zastoupené', () => {
    const z = zaznamy(r);
    expect(new Set(z.map((x) => x.kegs_used_package_id))).toEqual(new Set(['k50', 'k20']));
    for (const x of z) {
      expect(x.source_volume_l).toBe(x.kegs_used_package_id === 'k50' ? 50 : 20);
      expect(x.kegs_used).toBe(1);
    }
  });

  it('míň lahví než sudů nejde rozdělit — nezapíše se nic napůl', () => {
    const v = zaznamyZRadku(radek({ kegPkgId: 'k50', kegQty: '1', keg2PkgId: 'k20', keg2Qty: '1', pkgId: 'l1', qty: '1' }), ctx());
    expect(v).toEqual({ nelzeRozdelit: true });
  });

  it('druhý sud bez počtu se nebere — zapíše se jako jeden sud', () => {
    const z = zaznamy(radek({ kegPkgId: 'k50', kegQty: '1', keg2PkgId: 'k20', keg2Qty: '', pkgId: 'l1', qty: '40' }));
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ kegs_used_package_id: 'k50' });
  });
});

describe('datum řádku', () => {
  it('řádek z tabulky má vlastní den; ostatní berou datum formuláře', () => {
    expect(zaznamy(radek({ datum: '2026-10-13', pkgId: 'l1', qty: '5' }))[0].entry_date).toBe('2026-10-13');
    expect(zaznamy(radek({ pkgId: 'l1', qty: '5' }))[0].entry_date).toBe('2026-10-15');
    expect(zaznamy(radek({ datum: null, pkgId: 'l1', qty: '5' }))[0].entry_date).toBe('2026-10-15');
  });

  it('datumRadku: prázdné datum řádku = výchozí', () => {
    expect(datumRadku(radek({ datum: '' }), '2026-10-01')).toBe('2026-10-01');
    expect(datumRadku(radek({ datum: '2026-10-02' }), '2026-10-01')).toBe('2026-10-02');
  });
});

describe('poznámka a pivo', () => {
  it('poznámka se zapíše ke každému záznamu; prázdná je null', () => {
    expect(zaznamy(radek({ pkgId: 'l1', qty: '5' }), ctx({ poznamka: 'šarže 12' }))[0].note).toBe('šarže 12');
    expect(zaznamy(radek({ pkgId: 'l1', qty: '5' }))[0].note).toBeNull();
  });

  it('pivo mimo katalog má jméno null, ale id zůstane', () => {
    const z = zaznamy(radek({ beerId: 'jine', pkgId: 'l1', qty: '5' }));
    expect(z[0]).toMatchObject({ beer_id: 'jine', beer_name: null });
  });
});

describe('které řádky se zapisují', () => {
  it('maLahve: stačí jeden nenulový počet v kterémkoli ze čtyř slotů', () => {
    expect(maLahve(radek())).toBe(false);
    expect(maLahve(radek({ qty: '0' }))).toBe(false);
    expect(maLahve(radek({ qty4: '3' }))).toBe(true);
    expect(maLahve(radek({ qty2: '1' }))).toBe(true);
  });

  it('jeVyplneny: pivo + nějaký obal + počet lahví', () => {
    expect(jeVyplneny(radek({ pkgId: 'l1', qty: '5' }))).toBe(true);
    expect(jeVyplneny(radek({ pkg4Id: 'l033', qty4: '5' }))).toBe(true);
    expect(jeVyplneny(radek({ pkgId: 'l1', qty: '' }))).toBe(false);
    expect(jeVyplneny(radek({ beerId: '', pkgId: 'l1', qty: '5' }))).toBe(false);
    expect(jeVyplneny(radek({ qty: '5' }))).toBe(false); // počet bez jakéhokoli obalu
  });

  it('chybiPivo: vyplněný řádek bez piva — musí se zastavit, ne zahodit', () => {
    expect(chybiPivo(radek({ beerId: '', pkgId: 'l1', qty: '5' }))).toBe(true);
    expect(chybiPivo(radek({ beerId: '', pkg4Id: 'l033', qty4: '5' }))).toBe(true);
    expect(chybiPivo(radek({ beerId: '' }))).toBe(false); // prázdný řádek
    expect(chybiPivo(radek({ pkgId: 'l1', qty: '5' }))).toBe(false);
  });

  it('lahveRadku: jen sloty s obalem i počtem, v pořadí', () => {
    const r = radek({ pkgId: 'l15', qty: '3', pkg2Id: '', qty2: '9', pkg3Id: 'l05', qty3: '0', pkg4Id: 'l033', qty4: '7' });
    expect(lahveRadku(r)).toEqual([{ pkgId: 'l15', qty: 3 }, { pkgId: 'l033', qty: 7 }]);
  });
});

describe('casyRadku — každý řádek z fotky jiný čas, ať se sudy nesloučí', () => {
  it('vzestupně po vteřině, poslední je „teď"', () => {
    const ted = Date.parse('2026-10-15T10:00:10.000Z');
    expect(casyRadku(3, ted)).toEqual([
      '2026-10-15T10:00:08.000Z', '2026-10-15T10:00:09.000Z', '2026-10-15T10:00:10.000Z',
    ]);
  });

  it('jeden řádek = „teď"; nula řádků = prázdné pole', () => {
    const ted = Date.parse('2026-10-15T10:00:10.000Z');
    expect(casyRadku(1, ted)).toEqual(['2026-10-15T10:00:10.000Z']);
    expect(casyRadku(0, ted)).toEqual([]);
  });

  it('časy se liší na celou vteřinu — jinak by je skupina podle created_at.slice(0, 19) sloučila', () => {
    const c = casyRadku(5, Date.parse('2026-10-15T10:00:10.500Z'));
    expect(new Set(c.map((x) => x.slice(0, 19))).size).toBe(5);
  });
});

// ── Skladová kniha: sud se odečte jednou na dávku ────────────────────────
// Kniha (stockLedger.buildMovements) pozná sourozence jedné dávky podle
// (den, pivo, počet a velikost sudů, created_at). Tady se ověřuje, že to, co
// tahle funkce zapíše, dá v knize správný odpočet sudů — i pro víc řádků z
// fotky najednou.
import { buildMovements } from './stockLedger';

describe('zápis řádků z fotky ve skladové knize', () => {
  const sudy = (rows: any[]) => {
    const m = buildMovements({ bottlingRows: rows, packages: OBALY.map((o) => ({ ...o, kind: o.id.startsWith('k') ? 'keg' : 'bottle' })) as any })
      .filter((x) => x.kind === 'sud_na_lahve');
    const soucet: Record<string, number> = {};
    for (const x of m) soucet[`${x.date}|${x.package_id}`] = (soucet[`${x.date}|${x.package_id}`] ?? 0) + x.qty;
    return soucet;
  };
  const zapis = (radky: RadekStaceniLahvi[], casy: string[] | null) =>
    radky.flatMap((r, i) => zaznamy(r).map((z) => ({ ...z, ...(casy ? { created_at: casy[i] } : { created_at: '2026-10-15T10:00:00Z' }) })));

  const dve = [
    radek({ datum: '2026-10-13', kegPkgId: 'k50', kegQty: '1', pkgId: 'l15', qty: '11', pkg2Id: 'l1', qty2: '4', pkg3Id: 'l05', qty3: '20', pkg4Id: 'l033', qty4: '60' }),
    radek({ datum: '2026-10-13', kegPkgId: 'k50', kegQty: '1', pkgId: 'l1', qty: '45' }),
  ];

  it('dvě dávky téhož piva a dne se stejným sudem: s různým created_at se odečtou oba sudy', () => {
    expect(sudy(zapis(dve, casyRadku(2, Date.parse('2026-10-15T10:00:10Z'))))).toEqual({ '2026-10-13|k50': -2 });
  });

  it('se stejným created_at by se slily a druhý sud by se neodečetl (proto casyRadku)', () => {
    expect(sudy(zapis(dve, null))).toEqual({ '2026-10-13|k50': -1 });
  });

  it('čtyři druhy lahví z jednoho sudu odečtou sud JEDNOU, ne čtyřikrát', () => {
    expect(sudy(zapis([dve[0]], null))).toEqual({ '2026-10-13|k50': -1 });
  });

  it('dva sudy různé velikosti: každý se odečte jednou, i když lahve jsou čtyř druhů', () => {
    const r = radek({
      datum: '2026-10-13', kegPkgId: 'k50', kegQty: '1', keg2PkgId: 'k20', keg2Qty: '1',
      pkgId: 'l15', qty: '12', pkg2Id: 'l1', qty2: '10', pkg3Id: 'l05', qty3: '28', pkg4Id: 'l033', qty4: '12',
    });
    expect(sudy(zapis([r], null))).toEqual({ '2026-10-13|k50': -1, '2026-10-13|k20': -1 });
  });

  it('dlaždice otevře řádek z fotky, když ruční řádek množství nemá', () => {
    const radky = [
      radek({ beerId: 'p12' }),
      radek({ beerId: 'p12', datum: '2026-10-13', pkgId: 'l05', qty: '20', pkg2Id: 'l1', qty2: '10' }),
    ];
    expect(indexRadkuProDlazdici(radky, 'p12', null)).toBe(1);
    expect(indexRadkuProDlazdici(radky, 'p12', 1)).toBe(1);
  });

  it('0,5 l a 1 l se v přehledu nesčítají do jednoho součtu', () => {
    expect(popisekLahviPoObjemu(souctyLahviPoObjemu([
      { objemL: 1, ks: 40 },
      { objemL: 0.5, ks: 12 },
      { objemL: 1, ks: 4 },
    ]))).toBe('1 l: 44 · 0,5 l: 12');
  });

  it('každý řádek se odečte ke svému dni', () => {
    const r1 = radek({ datum: '2026-10-06', kegPkgId: 'k50', kegQty: '3', pkgId: 'l1', qty: '140' });
    const r2 = radek({ datum: '2026-10-13', kegPkgId: 'k50', kegQty: '1', pkgId: 'l1', qty: '45' });
    expect(sudy(zapis([r1, r2], casyRadku(2)))).toEqual({ '2026-10-06|k50': -3, '2026-10-13|k50': -1 });
  });
});
