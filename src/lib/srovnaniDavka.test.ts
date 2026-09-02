import { describe, expect, it } from 'vitest';
import { davkySrovnani, zapisyDavky, type RadekSrovnani } from './srovnaniDavka';

const SV = { beer_id: 'b1', beer_name: '12° Světlá' };
const lahev = (label: string, volume: number, diffQty: number): RadekSrovnani => ({
  ...SV, package_id: `p${label}`, package_label: label,
  package_kind: 'bottle', package_volume: volume, diffQty,
});
const sud = (label: string, volume: number, diffQty: number): RadekSrovnani => ({
  ...SV, package_id: `k${label}`, package_label: label,
  package_kind: 'keg', package_volume: volume, diffQty,
});

describe('davkySrovnani', () => {
  it('sečte lahvové přebytky jednoho piva do litrů', () => {
    const d = davkySrovnani([lahev('1 L', 1, 781), lahev('0.5 L', 0.5, 111)]);
    expect(d[0].litryCelkem).toBe(836.5);
    expect(d[0].lahve.map((l) => l.kusy)).toEqual([781, 111]);
  });

  it('sudy počítá ze SOUČTU litrů, ne sečtením zaokrouhlených řádků', () => {
    // 1017,1 l ÷ 0,9 = 1130,1 ÷ 50 = 22,6 → 23. Po řádcích by vyšlo 25.
    const d = davkySrovnani([
      lahev('1.5 L', 1.5, 116), lahev('1 L', 1, 781),
      lahev('0.5 L', 0.5, 111), lahev('0.33 L', 0.33, 20),
    ]);
    expect(d[0].litryCelkem).toBe(1017.1);
    expect(d[0].orientacneSudu).toBe(23);
  });

  it('manko se sbírá taky — jen opačným směrem', () => {
    // Dřív se manko zahazovalo a mířilo do plánu dostáčení. Ten model padl:
    // nechával sklad nafouklý a rozdíl se táhl do dalšího měsíce. Kusy
    // zůstávají KLADNÉ, směr nese pole `smer`.
    const d = davkySrovnani([lahev('1 L', 1, -300)]);
    expect(d).toHaveLength(1);
    expect(d[0].smer).toBe('manko');
    expect(d[0].lahve[0].kusy).toBe(300);
    expect(d[0].litryCelkem).toBe(300);
  });

  it('pivo s oběma stranami dá dvě dávky, ať se litry nemíchají', () => {
    const d = davkySrovnani([lahev('1 L', 1, 100), lahev('0.5 L', 0.5, -40)]);
    expect(d.map((x) => x.smer).sort()).toEqual(['manko', 'prebytek']);
  });

  it('sudové řádky do lahvové dávky nepatří', () => {
    const d = davkySrovnani([lahev('1 L', 1, 100), sud('50 L', 50, 10)]);
    expect(d[0].lahve).toHaveLength(1);
  });

  it('piva se nemíchají a řadí se podle objemu', () => {
    const d = davkySrovnani([
      lahev('1 L', 1, 50),
      { beer_id: 'b2', beer_name: '11° Tmavá', package_id: 'x', package_label: '1 L', package_kind: 'bottle', package_volume: 1, diffQty: 900 },
    ]);
    expect(d.map((x) => x.beer_id)).toEqual(['b2', 'b1']);
  });

  it('lahev bez objemu se přeskočí', () => {
    const d = davkySrovnani([{ ...SV, package_id: 'x', package_label: '?', package_kind: 'bottle', diffQty: 100 }]);
    expect(d).toEqual([]);
  });
});


describe('zapisyDavky', () => {
  const davka = davkySrovnani([lahev('1 L', 1, 800), lahev('0.5 L', 0.5, 400)])[0];
  const D = '2026-08-31';

  it('bez sudů zapíše jen lahve a sklad sudů nechá být', () => {
    const r = zapisyDavky(davka, D, '2026-08', []);
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.kegs_used === null)).toBe(true);
    expect(r.reduce((s, x) => s + Number(x.quantity), 0)).toBe(1200);
  });

  it('součet lahví sedí na přebytek u každého obalu zvlášť', () => {
    const r = zapisyDavky(davka, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 15, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 5, kegVolumeL: 30 },
    ]);
    const proObal = (id: string) => r.filter((x) => x.package_id === id).reduce((s, x) => s + Number(x.quantity), 0);
    expect(proObal('p1 L')).toBe(800);
    expect(proObal('p0.5 L')).toBe(400);
  });

  it('sudy skupiny sedí na zadané číslo a nesou je VŠECHNY obaly z ní', () => {
    // Dřív se počet sudů dělil mezi obaly podle litrů. U malých balení vedle
    // velkých z toho po zaokrouhlení vyšla nula: Summer Ale za srpen 2026 měl
    // u 0,33 l a 0,5 l nula sudů, zatímco litrovky si vzaly 16 ze 17 — a
    // v přehledu stáčení to vypadalo, že ty lahve vznikly bez sudu.
    const r = zapisyDavky(davka, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 15, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 5, kegVolumeL: 30 },
    ]);
    const zeSkupiny = (id: string) => r.filter((x) => x.kegs_used_package_id === id);
    expect(zeSkupiny('k50').every((x) => x.kegs_used === 15)).toBe(true);
    expect(zeSkupiny('k30').every((x) => x.kegs_used === 5)).toBe(true);
    // Každý obal, který ze skupiny něco dostal, má její sudy vyplněné.
    expect(r.every((x) => Number(x.kegs_used) > 0)).toBe(true);
  });

  it('sourozenecké řádky jedné skupiny mají STEJNOU poznámku — kniha je slučuje', () => {
    // Opak dřívějška: dokud každý řádek nesl jiný počet sudů, musely se
    // poznámky lišit, aby se nesloučily. Teď nesou počet celé skupiny, takže
    // se sloučit MUSÍ — jinak by se sudy započítaly tolikrát, kolik je obalů.
    const r = zapisyDavky(davka, D, '2026-08', [
      { kegPkgId: 'k50', kegQty: 15, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 5, kegVolumeL: 30 },
    ]);
    const podleSkupiny = (id: string) => new Set(r.filter((x) => x.kegs_used_package_id === id).map((x) => x.note));
    expect(podleSkupiny('k50').size).toBe(1);
    expect(podleSkupiny('k30').size).toBe(1);
    // Mezi skupinami se poznámka pořád liší — jsou to dva různé zdroje.
    expect(new Set(r.map((x) => x.note)).size).toBe(2);
  });

  it('jedna velikost sudu = jeden řádek na obal, každý s celým počtem', () => {
    const r = zapisyDavky(davka, D, '2026-08', [{ kegPkgId: 'k50', kegQty: 20, kegVolumeL: 50 }]);
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.kegs_used === 20)).toBe(true);
    expect(r.every((x) => x.source_volume_l === 1000)).toBe(true);
  });

  it('nulové skupiny se ignorují', () => {
    const r = zapisyDavky(davka, D, '2026-08', [{ kegPkgId: 'k50', kegQty: 0, kegVolumeL: 50 }]);
    expect(r.every((x) => x.kegs_used === null)).toBe(true);
  });
});

describe('zapisyDavky — znaménka lahví a sudů', () => {
  const davkaManko = davkySrovnani([lahev('1 L', 1, -59)])[0];
  const davkaPrebytek = davkySrovnani([lahev('1 L', 1, 59)])[0];
  const sudy = [{ kegPkgId: 'k50', kegQty: 1, kegVolumeL: 50 }];

  it('MANKO zapíše lahve záporně — bez toho odečet nikdy neprošel', () => {
    // Tabulka bottling měla CHECK (quantity > 0) a každý odečet skončil na
    // "violates check constraint bottling_quantity_positive". Migrace
    // 20261225000000 to povolila; tenhle test hlídá, že se záporný řádek
    // opravdu tvoří.
    const rady = zapisyDavky(davkaManko, '2026-08-31', '2026-08', []);
    expect(rady).toHaveLength(1);
    expect(rady[0].quantity).toBe(-59);
    expect(String(rady[0].note)).toContain('Odečteno z inventury 2026-08');
  });

  it('PŘEBYTEK zapíše lahve kladně', () => {
    const rady = zapisyDavky(davkaPrebytek, '2026-08-31', '2026-08', []);
    expect(rady[0].quantity).toBe(59);
    expect(String(rady[0].note)).toContain('Doplněno z inventury 2026-08');
  });

  it('sudy „odečíst" ubírají ze skladu, „vrátit" je vracejí', () => {
    const odecist = zapisyDavky(davkaManko, '2026-08-31', '2026-08', sudy, 'odecist');
    expect(odecist[0].kegs_used).toBe(1);
    expect(odecist[0].source_volume_l).toBe(50);

    const vratit = zapisyDavky(davkaManko, '2026-08-31', '2026-08', sudy, 'vratit');
    expect(vratit[0].kegs_used).toBe(-1);
    expect(vratit[0].source_volume_l).toBe(-50);
  });

  it('směr sudů je NEZÁVISLÝ na směru lahví — rozhoduje člověk', () => {
    // Přebytek lahví se sudy vrácenými dává smysl stejně jako manko se sudy
    // odečtenými; svazovat to natvrdo by některé opravy znemožnilo.
    const rady = zapisyDavky(davkaPrebytek, '2026-08-31', '2026-08', sudy, 'vratit');
    expect(rady[0].quantity).toBe(59);
    expect(rady[0].kegs_used).toBe(-1);
  });

  it('součet kusů sedí přesně na napočítaný rozdíl i se znaménkem', () => {
    const davka = davkySrovnani([lahev('1 L', 1, -100), lahev('0.5 L', 0.5, -40)])[0];
    const rady = zapisyDavky(davka, '2026-08-31', '2026-08', [
      { kegPkgId: 'k50', kegQty: 1, kegVolumeL: 50 },
      { kegPkgId: 'k30', kegQty: 1, kegVolumeL: 30 },
    ], 'vratit');
    const soucet = (pkg: string) => rady.filter((r) => r.package_label === pkg).reduce((s, r) => s + Number(r.quantity), 0);
    expect(soucet('1 L')).toBe(-100);
    expect(soucet('0.5 L')).toBe(-40);
    // Každá skupina nese svůj celý počet na obou obalech: 2 obaly × (−1) za
    // skupinu. Skladová kniha sourozence slučuje, takže se vrátí −1 a −1.
    const proSkupinu = (id: string) => new Set(rady.filter((r) => r.kegs_used_package_id === id).map((r) => r.kegs_used));
    expect([...proSkupinu('k50')]).toEqual([-1]);
    expect([...proSkupinu('k30')]).toEqual([-1]);
  });
});

describe('směr sudů „nastocit"', () => {
  const davka = davkySrovnani([lahev('1 L', 1, 717), lahev('1.5 L', 1.5, 15)])[0];
  const sudy = [{ kegPkgId: 'k50', kegQty: 17, kegVolumeL: 50 }];

  it('spotřebu sudů zapisuje stejně jako „odecist" — výrobu řeší obrazovka zvlášť', () => {
    // Z provozu: „musí se to vepsat do stáčení KEG, protože to jsou stočený
    // sudy." Sud se nejdřív nastáčel a hned se z něj stáčely lahve — jsou to
    // DVA pohyby. Řádek stáčení lahví nese jen tu spotřebu; výroba jde do
    // tabulky kegging a tu zakládá InventoryScreen.
    const jakoOdecist = zapisyDavky(davka, '2026-08-31', '2026-08', sudy, 'odecist');
    const jakoNastocit = zapisyDavky(davka, '2026-08-31', '2026-08', sudy, 'nastocit');
    expect(jakoNastocit).toEqual(jakoOdecist);
    expect(jakoNastocit.every((r) => r.kegs_used === 17)).toBe(true);
  });

  it('„vratit" je pořád jediný směr, který sudy vrací', () => {
    const vratit = zapisyDavky(davka, '2026-08-31', '2026-08', sudy, 'vratit');
    expect(vratit.every((r) => r.kegs_used === -17)).toBe(true);
  });
});

describe('Summer Ale ze srpna 2026 — malá balení nesmí zůstat bez sudů', () => {
  // Přesně ta dávka, která to odhalila: 717 litrovek, 15 půldruhalitrů a po
  // deseti kusech 0,5 l a 0,33 l, všechno ze sedmnácti 50l sudů. Dokud se
  // sudy dělily podle litrů, vyšlo 0,33 l i 0,5 l na nula sudů (podíl 0,075
  // a 0,114 sudu) a v přehledu stáčení u nich nebyl žádný zdroj.
  const davka = davkySrovnani([
    lahev('1 L', 1, 717),
    lahev('1.5 L', 1.5, 15),
    lahev('0.5 L', 0.5, 10),
    lahev('0.33 L', 0.33, 10),
  ])[0];

  it('každý obal má vyplněné sudy i zdrojový objem', () => {
    const r = zapisyDavky(davka, '2026-08-31', '2026-08', [{ kegPkgId: 'k50', kegQty: 17, kegVolumeL: 50 }]);
    expect(r).toHaveLength(4);
    expect(r.every((x) => x.kegs_used === 17)).toBe(true);
    expect(r.every((x) => x.kegs_used_package_id === 'k50')).toBe(true);
    expect(r.every((x) => x.source_volume_l === 850)).toBe(true);
  });

  it('a kusy lahví se přitom nezměnily', () => {
    const r = zapisyDavky(davka, '2026-08-31', '2026-08', [{ kegPkgId: 'k50', kegQty: 17, kegVolumeL: 50 }]);
    const kusy = (label: string) => r.filter((x) => x.package_label === label).reduce((s, x) => s + Number(x.quantity), 0);
    expect(kusy('1 L')).toBe(717);
    expect(kusy('1.5 L')).toBe(15);
    expect(kusy('0.5 L')).toBe(10);
    expect(kusy('0.33 L')).toBe(10);
  });
});
