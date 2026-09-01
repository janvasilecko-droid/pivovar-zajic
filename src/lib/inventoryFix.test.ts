import { describe, expect, it } from 'vitest';
import { doplnekVBudoucnu, vychoziMesicInventury, kegovaniZapisy, lahvoveZapisy, akceProRozdil, datumDoplnku, jeSud, nabidnoutMinulyMesic, nazevMesice, odectiZeStoceni, stoceniZapis, type InventuraPolozka } from './inventoryFix';

const lahev: InventuraPolozka = {
  beer_id: 'b1', beer_name: 'Ležák 12°',
  package_id: 'p1', package_label: 'Lahev 0,5 l', package_kind: 'bottle',
  diffQty: 0,
};
const sud: InventuraPolozka = {
  beer_id: 'b2', beer_name: 'Světlé 11°',
  package_id: 'p2', package_label: 'KEG 50 l', package_kind: 'keg',
  diffQty: 0,
};


describe('jeSud', () => {
  it('rozhoduje podle kind', () => {
    expect(jeSud('keg', 'KEG 50 l')).toBe(true);
    expect(jeSud('bottle', 'Lahev 0,5 l')).toBe(false);
  });

  it('u obalů bez vyplněného druhu sáhne po popisku', () => {
    expect(jeSud(null, 'Sud 30 l')).toBe(true);
    expect(jeSud(undefined, 'keg 20l')).toBe(true);
    expect(jeSud(undefined, 'Lahev 0,33')).toBe(false);
  });
});

describe('datumDoplnku', () => {
  it('vždy poslední den inventovaného měsíce', () => {
    expect(datumDoplnku('2026-07')).toBe('2026-07-31');
    expect(datumDoplnku('2026-08')).toBe('2026-08-31');
    expect(datumDoplnku('2026-04')).toBe('2026-04-30');
  });

  it('zvládne únor i přestupný rok', () => {
    expect(datumDoplnku('2026-02')).toBe('2026-02-28');
    expect(datumDoplnku('2028-02')).toBe('2028-02-29');
  });

  it('nezáleží na tom, kdy se inventura doklikala', () => {
    expect(datumDoplnku('2026-12')).toBe('2026-12-31');
  });

  // Pravidlo od uživatele: rozhoduje INVENTOVANÝ měsíc, ne den zápisu.
  // Inventura za srpen se připíše k srpnu, ať se dodělá 31. 8. nebo 3. 9.
  it('inventura za srpen dodělaná v září pořád patří k srpnu', () => {
    expect(datumDoplnku('2026-08')).toBe('2026-08-31');
  });
});

describe('nazevMesice', () => {
  it('píše měsíc česky, ať je omyl vidět', () => {
    expect(nazevMesice('2026-08')).toBe('srpen 2026');
    expect(nazevMesice('2026-01')).toBe('leden 2026');
    expect(nazevMesice('2026-12')).toBe('prosinec 2026');
  });
});

describe('nabidnoutMinulyMesic', () => {
  it('první dny měsíce upozorní, že jde nejspíš o ten minulý', () => {
    expect(nabidnoutMinulyMesic('2026-09', '2026-09-03')).toBe('2026-08');
    expect(nabidnoutMinulyMesic('2026-01', '2026-01-02')).toBe('2025-12');
  });

  it('mlčí, když je vybraný jiný měsíc než dnešní', () => {
    expect(nabidnoutMinulyMesic('2026-08', '2026-09-03')).toBeNull();
  });

  it('mlčí i v druhé polovině měsíce — to už se počítá ten probíhající', () => {
    expect(nabidnoutMinulyMesic('2026-09', '2026-09-20')).toBeNull();
  });
});

describe('stoceniZapis (přebytek)', () => {
  it('lahve jdou do bottling', () => {
    const z = stoceniZapis({ ...lahev, diffQty: 48 }, '2026-08-31', '2026-08');
    expect(z?.table).toBe('bottling');
    expect(z?.row.quantity).toBe(48);
    expect(z?.row.beer_id).toBe('b1');
    expect(z?.row.entry_date).toBe('2026-08-31');
    expect(z?.row.note).toContain('inventury 2026-08');
  });

  it('sudy jdou do kegging', () => {
    const z = stoceniZapis({ ...sud, diffQty: 7 }, '2026-08-31', '2026-08');
    expect(z?.table).toBe('kegging');
    expect(z?.row.quantity).toBe(7);
  });

  it('u sudů se zdrojový tank nehádá', () => {
    const sudy = stoceniZapis({ ...sud, diffQty: 7 }, '2026-08-31', '2026-08');
    expect(sudy?.row.cellar_tank_id).toBeNull();
    expect(sudy?.row.source_volume_l).toBeNull();
  });

  it('u lahví bez zadaného zdroje zůstane odečet sudů prázdný', () => {
    const lahve = stoceniZapis({ ...lahev, diffQty: 48 }, '2026-08-31', '2026-08');
    expect(lahve?.row.kegs_used).toBeNull();
    expect(lahve?.row.kegs_used_package_id).toBeNull();
    expect(lahve?.row.source_volume_l).toBeNull();
  });

  it('u lahví se zadanými sudy je odečte i s objemem', () => {
    const lahve = stoceniZapis(
      { ...lahev, diffQty: 90 }, '2026-08-31', '2026-08',
      { kegPkgId: 'keg50', kegQty: 1, kegVolumeL: 50 },
    );
    expect(lahve?.row.kegs_used).toBe(1);
    expect(lahve?.row.kegs_used_package_id).toBe('keg50');
    // Litry z NAČATÝCH sudů, ne z dopočtu — stejně jako v zápisu stáčení.
    expect(lahve?.row.source_volume_l).toBe(50);
  });

  it('nulový počet sudů se bere jako „neodečítat"', () => {
    const lahve = stoceniZapis(
      { ...lahev, diffQty: 48 }, '2026-08-31', '2026-08',
      { kegPkgId: 'keg50', kegQty: 0, kegVolumeL: 50 },
    );
    expect(lahve?.row.kegs_used).toBeNull();
    expect(lahve?.row.source_volume_l).toBeNull();
  });

  it('u manka ani nuly nevznikne žádný zápis výroby', () => {
    expect(stoceniZapis({ ...lahev, diffQty: -5 }, '2026-08-31', '2026-08')).toBeNull();
    expect(stoceniZapis({ ...lahev, diffQty: 0 }, '2026-08-31', '2026-08')).toBeNull();
  });
});


describe('kegovaniZapisy — doplněné kegování se rozpustí do tanků', () => {
  const polozka = {
    beer_id: 'b1', beer_name: '12° Světlá',
    package_id: 'p50', package_label: '50 L', package_kind: 'keg',
    diffQty: 35,
  };

  it('udělá jeden zápis na každý tank a odečte z něj litry', () => {
    const r = kegovaniZapisy(polozka, '2026-08-31', '2026-08', {
      dily: [
        { tankId: 't3', label: 'Tank 3', sudy: 28, litry: 1400 },
        { tankId: 't5', label: 'Tank 5', sudy: 7, litry: 350 },
      ],
      nepokrytoSudu: 0,
    });
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ quantity: 28, cellar_tank_id: 't3', source_volume_l: 1400 });
    expect(r[1]).toMatchObject({ quantity: 7, cellar_tank_id: 't5', source_volume_l: 350 });
  });

  it('součet kusů sedí na přebytek — ani kus navíc, ani míň', () => {
    const r = kegovaniZapisy(polozka, '2026-08-31', '2026-08', {
      dily: [{ tankId: 't3', label: 'Tank 3', sudy: 20, litry: 1000 }],
      nepokrytoSudu: 15,
    });
    expect(r.reduce((s, x) => s + Number(x.quantity), 0)).toBe(35);
  });

  it('co sklep nepokryje, zapíše se bez tanku — ne že se to ztratí', () => {
    const r = kegovaniZapisy(polozka, '2026-08-31', '2026-08', {
      dily: [{ tankId: 't3', label: 'Tank 3', sudy: 20, litry: 1000 }],
      nepokrytoSudu: 15,
    });
    expect(r[1]).toMatchObject({ quantity: 15, cellar_tank_id: null, source_volume_l: null });
    expect(String(r[1].note)).toContain('bez tanku');
  });

  it('poznámka nese tank — jinak by se sourozenecké řádky slily ve skladové knize', () => {
    const r = kegovaniZapisy(polozka, '2026-08-31', '2026-08', {
      dily: [
        { tankId: 't3', label: 'Tank 3', sudy: 10, litry: 500 },
        { tankId: 't5', label: 'Tank 5', sudy: 10, litry: 500 },
      ],
      nepokrytoSudu: 0,
    });
    expect(r[0].note).not.toBe(r[1].note);
  });

  it('manko nic nezapíše — nic se nevyrobilo', () => {
    expect(kegovaniZapisy({ ...polozka, diffQty: -5 }, '2026-08-31', '2026-08', { dily: [], nepokrytoSudu: 0 })).toEqual([]);
  });

  it('prázdný sklep zapíše všechno bez tanku', () => {
    const r = kegovaniZapisy(polozka, '2026-08-31', '2026-08', { dily: [], nepokrytoSudu: 35 });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ quantity: 35, cellar_tank_id: null });
  });
});

describe('lahvoveZapisy — stáčení lahví z víc velikostí sudů', () => {
  const polozka = {
    beer_id: 'b1', beer_name: '12° Světlá',
    package_id: 'p1', package_label: '1 L', package_kind: 'bottle',
    diffQty: 781,
  };
  const D = '2026-08-31';

  it('jedna velikost = jeden zápis', () => {
    const r = lahvoveZapisy(polozka, D, '2026-08', [{ kegPkgId: 'k50', kegQty: 18, kegVolumeL: 50 }]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ quantity: 781, kegs_used: 18, kegs_used_package_id: 'k50', source_volume_l: 900 });
  });

  it('padesátky i třicítky = zápis na každou velikost', () => {
    const r = lahvoveZapisy(polozka, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 15, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 5, kegVolumeL: 30 },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ kegs_used: 15, kegs_used_package_id: 'k50', source_volume_l: 750 });
    expect(r[1]).toMatchObject({ kegs_used: 5, kegs_used_package_id: 'k30', source_volume_l: 150 });
  });

  it('lahve se rozpočítají podle litrů ze sudů', () => {
    // 750 l z padesátek, 150 l z třicítek → 5/6 a 1/6 z 781 kusů.
    const r = lahvoveZapisy(polozka, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 15, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 5, kegVolumeL: 30 },
    ]);
    expect(Number(r[1].quantity)).toBe(130); // floor(781 × 150/900)
    expect(Number(r[0].quantity)).toBe(651); // zbytek, ať součet sedí
  });

  it('součet kusů sedí na přebytek přesně — ani lahev navíc', () => {
    const r = lahvoveZapisy(polozka, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 7, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 3, kegVolumeL: 30 },
    ]);
    expect(r.reduce((s, x) => s + Number(x.quantity), 0)).toBe(781);
  });

  it('bez zadaných sudů se zapíšou jen lahve, bez odečtu', () => {
    const r = lahvoveZapisy(polozka, D, '2026-08', []);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ quantity: 781, kegs_used: null, kegs_used_package_id: null });
  });

  it('nulové a neplatné skupiny se zahodí', () => {
    const r = lahvoveZapisy(polozka, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 0, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 4, kegVolumeL: 0 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].kegs_used).toBeNull();
  });

  it('poznámka nese velikost sudu — jinak by se řádky slily ve skladové knize', () => {
    const r = lahvoveZapisy(polozka, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 5, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 5, kegVolumeL: 30 },
    ]);
    expect(r[0].note).not.toBe(r[1].note);
  });

  it('manko nic nezapíše — nic se nevyrobilo', () => {
    expect(lahvoveZapisy({ ...polozka, diffQty: -5 }, D, '2026-08', [])).toEqual([]);
  });
});

describe('vychoziMesicInventury — inventura se řídí kalendářem', () => {
  it('prvního v měsíci se počítá měsíc PŘEDCHOZÍ', () => {
    // Přesně tenhle den se stalo, že 17 sudů Summer Ale spadlo na 30. 9.
    expect(vychoziMesicInventury('2026-09-01')).toBe('2026-08');
  });

  it('do desátého pořád ten předchozí — dodělává se uzávěrka', () => {
    expect(vychoziMesicInventury('2026-09-10')).toBe('2026-08');
  });

  it('od jedenáctého už běžící měsíc', () => {
    expect(vychoziMesicInventury('2026-09-11')).toBe('2026-09');
    expect(vychoziMesicInventury('2026-09-25')).toBe('2026-09');
  });

  it('přes Nový rok se vrátí do prosince loňska', () => {
    expect(vychoziMesicInventury('2026-01-03')).toBe('2025-12');
  });

  it('poškozené datum nespadne', () => {
    expect(vychoziMesicInventury('nesmysl')).toBe('nesmysl');
  });
});

describe('doplnekVBudoucnu — zápis výroby nesmí do budoucna', () => {
  it('běžící měsíc má datum doplňku v budoucnosti', () => {
    // Inventura za září zapisuje na 30. 9.; 1. 9. je to tři neděle dopředu.
    expect(doplnekVBudoucnu('2026-09', '2026-09-01')).toBe(true);
  });

  it('uzavřený měsíc je v pořádku', () => {
    expect(doplnekVBudoucnu('2026-08', '2026-09-01')).toBe(false);
  });

  it('poslední den měsíce už projde — měsíc končí dnes', () => {
    expect(doplnekVBudoucnu('2026-09', '2026-09-30')).toBe(false);
  });

  it('bez data se nic neblokuje', () => {
    expect(doplnekVBudoucnu('2026-09', '')).toBe(false);
  });
});


describe('akceProRozdil — manko opravuje výrobu, ne plán', () => {
  it('manko → odečet ze stáčení', () => {
    expect(akceProRozdil(-1)).toBe('odecist_staceni');
  });
  it('přebytek → zápis stáčení', () => {
    expect(akceProRozdil(5)).toBe('zapsat_staceni');
  });
  it('nula → nic', () => {
    expect(akceProRozdil(0)).toBe('zadna');
  });
});

describe('odectiZeStoceni — manko opraví zápis výroby', () => {
  const D = '2026-08-31';

  it('sklad čeká 2, fyzicky je 1 → jeden sud dolů ze stáčení KEG', () => {
    // Z provozu: „pokud je na skladě 2 a reálně má být 1, tak to ze stáčení
    // musí jeden sud odečíst."
    const z = odectiZeStoceni({ ...sud, diffQty: -1 }, D, '2026-08');
    expect(z).toHaveLength(1);
    expect(z[0].table).toBe('kegging');
    expect(z[0].row.quantity).toBe(-1);
  });

  it('datum je datum INVENTURY — stav k tomu dni se přenáší dál', () => {
    const z = odectiZeStoceni({ ...sud, diffQty: -3 }, D, '2026-08');
    expect(z[0].row.entry_date).toBe(D);
  });

  it('u sudů se tank nedotýká', () => {
    const z = odectiZeStoceni({ ...sud, diffQty: -2 }, D, '2026-08');
    expect(z[0].row.cellar_tank_id).toBeNull();
  });

  it('lahve bez zadaných sudů: jen lahve dolů, sklad sudů se nehne', () => {
    const z = odectiZeStoceni({ ...lahev, diffQty: -48 }, D, '2026-08');
    expect(z[0].table).toBe('bottling');
    expect(z[0].row.quantity).toBe(-48);
    expect(z[0].row.kegs_used).toBeNull();
  });

  it('lahve se zadanými sudy: sudy se VRACEJÍ (záporné kegs_used)', () => {
    // Lahve se nenastáčely, takže se sudy nenačaly a pořád leží ve skladu.
    const z = odectiZeStoceni({ ...lahev, diffQty: -48 }, D, '2026-08',
      [{ kegPkgId: 'k50', kegQty: 1, kegVolumeL: 50 }]);
    expect(z[0].row.quantity).toBe(-48);
    expect(z[0].row.kegs_used).toBe(-1);
    expect(z[0].row.kegs_used_package_id).toBe('k50');
    expect(z[0].row.source_volume_l).toBe(-50);
  });

  it('víc velikostí sudů → víc řádků a součet lahví sedí přesně', () => {
    const z = odectiZeStoceni({ ...lahev, diffQty: -100 }, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 1, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 1, kegVolumeL: 30 },
    ]);
    expect(z).toHaveLength(2);
    expect(z.reduce((s, x) => s + Number(x.row.quantity), 0)).toBe(-100);
    expect(z.reduce((s, x) => s + Number(x.row.kegs_used), 0)).toBe(-2);
  });

  it('poznámky se mezi řádky liší — jinak by je skladová kniha slila', () => {
    const z = odectiZeStoceni({ ...lahev, diffQty: -100 }, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 1, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 1, kegVolumeL: 30 },
    ]);
    expect(z[0].row.note).not.toBe(z[1].row.note);
  });

  it('přebytek ani nula se neodečítá', () => {
    expect(odectiZeStoceni({ ...sud, diffQty: 3 }, D, '2026-08')).toEqual([]);
    expect(odectiZeStoceni({ ...sud, diffQty: 0 }, D, '2026-08')).toEqual([]);
  });
});
