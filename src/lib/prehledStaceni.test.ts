// 📋 Přehled stáčení: jeden záznam na den a pivo — viz hlavička prehledStaceni.ts.
// Zadání z 19. 9. 2026: „na den stáčecí jen jeden záznam druhu 11 sv, barevný
// pozadí a v tom všechny obaly a množství" a vzápětí „to samý i u lahví".
import { describe, it, expect } from 'vitest';
import {
  chybiVelikostSudu, davkyStaceni, denACesky, dnyStaceni, nazevDne, obalyDavky, pocetSuduCesky, sarzeDavky, souhrnDavek, souhrnSarze,
  type ZaznamStaceni,
} from './prehledStaceni';

const OBJEMY: Record<string, number> = { p50: 50, p30: 30, p20: 20, p05: 0.5 };
const objem = (id: string | null) => (id ? OBJEMY[id] ?? 0 : 0);

const z = (o: Partial<ZaznamStaceni> & { id: string }): ZaznamStaceni => ({
  entry_date: '2026-09-15',
  beer_id: 'b11',
  beer_name: '11° Světlá',
  package_id: 'p50',
  quantity: 1,
  ...o,
});

describe('davkyStaceni', () => {
  it('tři obaly téhož piva v jednom dni dají JEDNU dávku', () => {
    const davky = davkyStaceni([
      z({ id: '1', package_id: 'p50', quantity: 4 }),
      z({ id: '2', package_id: 'p30', quantity: 6 }),
      z({ id: '3', package_id: 'p20', quantity: 2 }),
    ], objem);
    expect(davky).toHaveLength(1);
    expect(davky[0].beerName).toBe('11° Světlá');
    expect(davky[0].polozky).toHaveLength(3);
  });

  it('spočítá kusy i litry za celý den', () => {
    const davky = davkyStaceni([
      z({ id: '1', package_id: 'p50', quantity: 4 }), // 200 l
      z({ id: '2', package_id: 'p30', quantity: 6 }), // 180 l
    ], objem);
    expect(davky[0].celkemKs).toBe(10);
    expect(davky[0].celkemL).toBe(380);
  });

  it('uvnitř dávky od největšího sudu — tak se o tom mluví', () => {
    const davky = davkyStaceni([
      z({ id: '1', package_id: 'p20' }),
      z({ id: '2', package_id: 'p50' }),
      z({ id: '3', package_id: 'p30' }),
    ], objem);
    expect(davky[0].polozky.map((p) => p.objemL)).toEqual([50, 30, 20]);
  });

  it('jiné pivo je jiná dávka', () => {
    const davky = davkyStaceni([
      z({ id: '1', beer_id: 'b11' }),
      z({ id: '2', beer_id: 'b12', beer_name: '12° Světlá' }),
    ], objem);
    expect(davky).toHaveLength(2);
  });

  it('jiný den je jiná dávka, i u téhož piva', () => {
    const davky = davkyStaceni([
      z({ id: '1', entry_date: '2026-09-15' }),
      z({ id: '2', entry_date: '2026-09-16' }),
    ], objem);
    expect(davky).toHaveLength(2);
  });

  it('záznamy BEZ piva se neslučují — „nevíme které" není totéž pivo', () => {
    const davky = davkyStaceni([
      z({ id: '1', beer_id: null, beer_name: null }),
      z({ id: '2', beer_id: null, beer_name: null }),
    ], objem);
    expect(davky, 'dvě neznámá piva nesmí splynout v jedno').toHaveLength(2);
  });

  it('jméno piva se doplní z prvního záznamu, který ho má', () => {
    // Starší řádky mívají beer_name prázdné, i když beer_id sedí.
    const davky = davkyStaceni([
      z({ id: '1', beer_name: null }),
      z({ id: '2', beer_name: '11° Světlá' }),
    ], objem);
    expect(davky[0].beerName).toBe('11° Světlá');
  });

  it('obal mimo katalog nerozbije součet — počítá se jako nula litrů', () => {
    const davky = davkyStaceni([
      z({ id: '1', package_id: 'neznamy', quantity: 3 }),
      z({ id: '2', package_id: 'p50', quantity: 1 }),
    ], objem);
    expect(davky[0].celkemKs).toBe(4);
    expect(davky[0].celkemL).toBe(50);
  });

  it('funguje i na lahve — obal je obal', () => {
    const davky = davkyStaceni([
      z({ id: '1', package_id: 'p05', quantity: 60 }),
    ], objem);
    expect(davky[0].celkemL).toBe(30);
  });

  it('prázdný seznam nedá žádnou dávku', () => {
    expect(davkyStaceni([], objem)).toEqual([]);
  });

  it('zachová pořadí, v jakém dávky přišly — řadí se už dřív', () => {
    const davky = davkyStaceni([
      z({ id: '1', entry_date: '2026-09-16' }),
      z({ id: '2', entry_date: '2026-09-15' }),
    ], objem);
    expect(davky.map((d) => d.datum)).toEqual(['2026-09-16', '2026-09-15']);
  });
});

describe('souhrnDavek', () => {
  it('sečte všechny dávky dohromady', () => {
    const davky = davkyStaceni([
      z({ id: '1', package_id: 'p50', quantity: 4 }),
      z({ id: '2', beer_id: 'b12', package_id: 'p30', quantity: 2 }),
    ], objem);
    expect(souhrnDavek(davky)).toEqual({ ks: 6, litry: 260 });
  });
});

// Obě obrazovky berou totéž seskupení — dvě kopie by se rozešly.
// Lahve mají dlaždici ve vlastní komponentě (PrehledStaceniLahvi.tsx, od
// 15. 10. 2026 po dnech), KEG ji má pořád přímo v Kegging.tsx.
describe('přehledy KEG i lahví seskupují stejně', () => {
  const { readFileSync } = require('node:fs');
  const KEG = readFileSync('src/screens/Kegging.tsx', 'utf8');
  const LAHVE = readFileSync('src/screens/BottlingScreen.tsx', 'utf8');
  const LAHVE_DLAZDICE = readFileSync('src/components/PrehledStaceniLahvi.tsx', 'utf8');

  it('obě obrazovky volají davkyStaceni', () => {
    expect(KEG).toMatch(/davkyStaceni\(sortedRows/);
    expect(LAHVE).toMatch(/davkyStaceni\(sortedRows/);
  });

  it('lahve předávají dávky komponentě s dlaždicemi, ne si je kreslí samy', () => {
    expect(LAHVE).toMatch(/<PrehledStaceniLahvi/);
    expect(LAHVE, 'v obrazovce zůstala stará dlaždice').not.toMatch(/sarzeDavky\(/);
  });

  it('dlaždice má barvu podle piva a čitelný text', () => {
    for (const [kde, zdroj] of [['KEG', KEG], ['lahve', LAHVE_DLAZDICE]] as const) {
      expect(zdroj, `${kde}: chybí barva piva`).toMatch(/backgroundColor: beerBg\(beer\)/);
      expect(zdroj, `${kde}: chybí čitelný text na barvě`).toMatch(/beerText\(beer\)/);
    }
  });

  it('upravovat jde dál po jednotlivých záznamech', () => {
    // KEG: tlačítka jsou přímo v obrazovce.
    expect(KEG, 'KEG: zmizelo mazání záznamu').toMatch(/onClick=\{\(\) => del\(r\.id\)\}/);
    expect(KEG, 'KEG: zmizela úprava záznamu').toMatch(/setEditingRow\(r\)/);
    // Lahve: tlačítka jsou v komponentě a obrazovka jim dává skutečné zápisy.
    expect(LAHVE_DLAZDICE, 'lahve: zmizelo mazání záznamu').toMatch(/onClick=\{\(\) => onSmazat\(r\.id\)\}/);
    expect(LAHVE_DLAZDICE, 'lahve: zmizela úprava záznamu').toMatch(/onUpravit\(r\)/);
    expect(LAHVE, 'lahve: smazání není napojené na databázi').toMatch(/onSmazat=\{del\}/);
    expect(LAHVE, 'lahve: úprava není napojená').toMatch(/onUpravit=\{setEditingRow\}/);
    expect(LAHVE, 'lahve: ±1 kus není napojené').toMatch(/onKus=\{increment\}/);
    expect(LAHVE, 'lahve: počet sudů není napojený').toMatch(/onSudy=\{incrementKegs\}/);
    expect(LAHVE, 'lahve: velikost sudu není napojená').toMatch(/onZmenSud=\{updateKegPackage\}/);
    expect(LAHVE, 'lahve: „Další sud" není napojený').toMatch(/onDalsiSud=\{pridejDalsiSud\}/);
  });

  it('u lahví se zdrojový sud ukazuje po ŠARŽÍCH, ne po řádcích', () => {
    // Zdroj nese uvnitř šarže jen jeden řádek; u ostatních se dřív psalo jen
    // „〃 stejná dávka" a vypadalo to, že se zdroj ztratil.
    expect(LAHVE_DLAZDICE).toMatch(/sarzeDavky\(davka\.polozky, getBatchId\)/);
    // Nadpis „Stočeno ze sudu" je pryč — šarži drží pohromadě čára po straně.
    // Z provozu: „má tam být sud a počet, jen nějak označ třeba čarou."
    expect(LAHVE_DLAZDICE, 'nadpis se vrátil místo sudu a počtu').not.toMatch(/Stočeno ze sudu/);
    expect(LAHVE_DLAZDICE, 'chybí čára, která šarži drží pohromadě').toMatch(/border-l-4 border-l-amber-500/);
    expect(LAHVE_DLAZDICE, 'v dlaždici zůstalo „stejná dávka" místo sudu').not.toMatch(/stejná dávka/);
  });

  it('dlaždice jsou v jednom dni rozbalené rovnou, v týdnu a měsíci sbalené', () => {
    expect(LAHVE).toMatch(/vychoziOtevrene=\{recordsView === 'day'\}/);
  });

  it('dny jsou nadřazená skupina s vlastním pásem — ne popisek v rohu dlaždice', () => {
    // Z provozu 15. 10. 2026: „odděl vždycky, ať je vidět, jaký den se co stáčelo."
    expect(LAHVE_DLAZDICE).toMatch(/dnyStaceni\(davky\)/);
    expect(LAHVE_DLAZDICE).toMatch(/nazevDne\(den\.datum\)/);
  });

  it('přehled lahví nemá žádný přilepený panel — na telefonu se přes sebe překrývaly', () => {
    // Z provozu 15. 10. 2026: „ten přehled udělej v řádku, takhle je to
    // nepřehledný" — pod přilepenou lištou záložek stály ještě dva přilepené
    // panely (období a poloprůhledné filtry) a zakrývaly se navzájem.
    const prehled = LAHVE.slice(
      LAHVE.indexOf('{/* Všechny záznamy stáčení lahví / KEG */}'),
      LAHVE.indexOf('{/* TAB 3: POTŘEBA STOČIT LAHVE */}'),
    );
    expect(prehled.length, 'nenašel se blok přehledu').toBeGreaterThan(500);
    expect(prehled, 'v přehledu zase stojí přilepený panel').not.toMatch(/\bsticky\b/);
    expect(LAHVE_DLAZDICE, 'v dlaždicích zase stojí přilepený panel').not.toMatch(/\bsticky\b/);
  });

  it('filtry piva a obalu jsou na telefonu za tlačítkem „Filtry" a chipy jsou jeden řádek', () => {
    const prehled = LAHVE.slice(
      LAHVE.indexOf('{/* Všechny záznamy stáčení lahví / KEG */}'),
      LAHVE.indexOf('{/* TAB 3: POTŘEBA STOČIT LAHVE */}'),
    );
    expect(prehled).toMatch(/aria-expanded=\{filtryPrehleduOtevrene\}/);
    expect(prehled).toMatch(/sm:hidden btn-ghost/);
    expect(prehled).toMatch(/<ChipyPiva jedenRadek/);
    expect(prehled).toMatch(/<ChipyObalu\s+jedenRadek/);
    expect(prehled).toMatch(/<PrepinacObdobi\s+kompaktni/);
  });

  it('KEG má den v týdnu u data', () => {
    expect(KEG, 'KEG: chybí den v týdnu').toMatch(/denACesky\(davka\.datum\)/);
  });
});

// ── Den v týdnu u data ────────────────────────────────────────────────────
// Zadání z 19. 9. 2026: „udělej v tom stáčení KEG i lahve po, út, st, čt…
// ať je vidět, jaký den se co stáčelo."
describe('denACesky', () => {
  it('napíše den před datum', () => {
    expect(denACesky('2026-09-15')).toBe('út 15.9.');   // úterý
    expect(denACesky('2026-09-14')).toBe('po 14.9.');
    expect(denACesky('2026-09-20')).toBe('ne 20.9.');
  });

  it('nula z čísel zmizí — „5.9.", ne „05.09."', () => {
    expect(denACesky('2026-09-05')).toBe('so 5.9.');
  });

  it('prázdné a nesmyslné datum nevyrobí „Invalid Date"', () => {
    expect(denACesky(null)).toBe('—');
    expect(denACesky('')).toBe('—');
    expect(denACesky('nesmysl')).toBe('nesmysl');
  });

  it('den se čte přes UTC — jinak by se pondělí hlásilo jako neděle', () => {
    // Bez UTC by `new Date('2026-09-14')` v záporné zóně spadlo na 13. 9.
    const puvodni = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(denACesky('2026-09-14')).toBe('po 14.9.');
    } finally {
      process.env.TZ = puvodni;
    }
  });
});

// ── Sud a co se z něj stočilo ─────────────────────────────────────────────
// Zadání z 19. 9. 2026: „u některých lahví zmizelo nebo není, z jakýho sudu
// byly stočeny" a „ukaž vždy sud a z něho, co vše bylo stočeno".
describe('sarzeDavky', () => {
  const polozka = (o: any) => ({ zaznam: o, objemL: 0.5, litry: 0 });

  it('sud nese jen jeden řádek — šarže ho dá celé skupině', () => {
    const sarze = sarzeDavky([
      polozka({ id: '1', davka: 'A', kegs_used: 4, kegs_used_package_id: 'k50' }),
      polozka({ id: '2', davka: 'A', kegs_used: 0, kegs_used_package_id: null }),
      polozka({ id: '3', davka: 'A', kegs_used: 0, kegs_used_package_id: null }),
    ], (z: any) => z.davka);
    expect(sarze).toHaveLength(1);
    expect(sarze[0].zdrojPackageId, 'zdroj se ztratil').toBe('k50');
    expect(sarze[0].polozky).toHaveLength(3);
    expect(sarze[0].sudu).toBe(4);
  });

  it('upravuje se na řádku, který sudy opravdu nese', () => {
    const sarze = sarzeDavky([
      polozka({ id: 'bez', davka: 'A', kegs_used: 0, kegs_used_package_id: null }),
      polozka({ id: 'se-sudy', davka: 'A', kegs_used: 2, kegs_used_package_id: 'k50' }),
    ], (z: any) => z.davka);
    expect(sarze[0].nositelZdroje?.id).toBe('se-sudy');
  });

  it('když sudy nenese nikdo, je kam je dopsat', () => {
    const sarze = sarzeDavky([
      polozka({ id: 'prvni', davka: 'A', kegs_used: 0, kegs_used_package_id: null }),
    ], (z: any) => z.davka);
    expect(sarze[0].nositelZdroje?.id).toBe('prvni');
    expect(sarze[0].zdrojPackageId).toBeNull();
  });

  it('kegs_used je na KAŽDÉM řádku šarže stejný — nesčítá se, bere se jednou', () => {
    // Z provozu 19. 9. 2026: „u každého keg 6...... to měl být 1 keg,
    // nevím, kde si vzal tyhle čísla." V databázi má `kegs_used` DUPLIKOVANOU
    // hodnotu na každém řádku šarže (ne jen na jednom) — šarže o třech
    // obalech se sčítáním přes řádky napočítala 3× víc sudů, než se doopravdy
    // stočilo.
    const sarze = sarzeDavky([
      polozka({ id: '1', davka: 'A', kegs_used: 2, kegs_used_package_id: 'k50' }),
      polozka({ id: '2', davka: 'A', kegs_used: 2, kegs_used_package_id: 'k50' }),
      polozka({ id: '3', davka: 'A', kegs_used: 2, kegs_used_package_id: 'k50' }),
    ], (z: any) => z.davka);
    expect(sarze).toHaveLength(1);
    expect(sarze[0].sudu).toBe(2);
  });

  it('dvě stáčení téhož piva v jednom dni jsou dvě šarže, každá se svým sudem', () => {
    const sarze = sarzeDavky([
      polozka({ id: '1', davka: 'rano', kegs_used: 2, kegs_used_package_id: 'k50' }),
      polozka({ id: '2', davka: 'odpo', kegs_used: 1, kegs_used_package_id: 'k30' }),
    ], (z: any) => z.davka);
    expect(sarze.map((s) => s.zdrojPackageId)).toEqual(['k50', 'k30']);
  });
});

// ── Dny jako nadřazená skupina ────────────────────────────────────────────
// Zadání z 15. 10. 2026: „ten přehled udělej v řádku, takhle je to
// nepřehledný, odděl vždycky, ať je vidět, jaký den se co stáčelo."
describe('dnyStaceni', () => {
  const dny = () => dnyStaceni(davkyStaceni([
    z({ id: '1', entry_date: '2026-10-12', beer_id: 'b12', beer_name: '12° Světlá', package_id: 'p05', quantity: 20 }),
    z({ id: '2', entry_date: '2026-10-13', beer_id: 'b11', package_id: 'p50', quantity: 2 }),
    z({ id: '3', entry_date: '2026-10-12', beer_id: 'bj', beer_name: 'Jantar', package_id: 'p05', quantity: 44 }),
    z({ id: '4', entry_date: '2026-10-13', beer_id: 'b12', beer_name: '12° Světlá', package_id: 'p30', quantity: 3 }),
  ], objem));

  it('dvě piva stejného dne jsou JEDEN den se dvěma dávkami', () => {
    const d = dny();
    expect(d).toHaveLength(2);
    expect(d.find((x) => x.datum === '2026-10-12')?.davky.map((v) => v.beerName)).toEqual(['12° Světlá', 'Jantar']);
  });

  it('nejnovější den je nahoře', () => {
    expect(dny().map((x) => x.datum)).toEqual(['2026-10-13', '2026-10-12']);
  });

  it('součet dne = součet jeho dávek (kusy i litry)', () => {
    const [nov, star] = dny();
    expect(nov.celkemKs).toBe(5);      // 2× 50 l + 3× 30 l
    expect(nov.celkemL).toBe(190);
    expect(star.celkemKs).toBe(64);    // 20 + 44 lahví po 0,5 l
    expect(star.celkemL).toBe(32);
  });

  it('uvnitř dne zůstává pořadí dávek, jak přišly', () => {
    const d = dnyStaceni(davkyStaceni([
      z({ id: '1', beer_id: 'bB', beer_name: 'B' }),
      z({ id: '2', beer_id: 'bA', beer_name: 'A' }),
    ], objem));
    expect(d[0].davky.map((v) => v.beerName)).toEqual(['B', 'A']);
  });

  it('záznam bez data je úplně dole a nepřilepí se k žádnému dni', () => {
    const d = dnyStaceni(davkyStaceni([
      z({ id: '1', entry_date: '' }),
      z({ id: '2', entry_date: '2026-10-12' }),
    ], objem));
    expect(d.map((x) => x.datum)).toEqual(['2026-10-12', '']);
  });

  it('prázdný vstup nedá žádný den', () => {
    expect(dnyStaceni([])).toEqual([]);
  });
});

describe('nazevDne', () => {
  it('napíše celý den v týdnu velkým písmenem a datum bez roku', () => {
    expect(nazevDne('2026-10-12')).toBe('Pondělí 12. 10.');
    expect(nazevDne('2026-10-13')).toBe('Úterý 13. 10.');
    expect(nazevDne('2026-10-14')).toBe('Středa 14. 10.');
    expect(nazevDne('2026-10-15')).toBe('Čtvrtek 15. 10.');
    expect(nazevDne('2026-10-16')).toBe('Pátek 16. 10.');
    expect(nazevDne('2026-10-17')).toBe('Sobota 17. 10.');
    expect(nazevDne('2026-10-18')).toBe('Neděle 18. 10.');
  });

  it('nuly z čísel zmizí', () => {
    expect(nazevDne('2026-09-05')).toBe('Sobota 5. 9.');
  });

  it('chybějící a nesmyslné datum nevyrobí „Invalid Date"', () => {
    expect(nazevDne('')).toBe('Bez data');
    expect(nazevDne(null)).toBe('Bez data');
    expect(nazevDne(undefined)).toBe('Bez data');
    expect(nazevDne('nesmysl')).toBe('nesmysl');
  });

  it('den se čte přes UTC — v záporné zóně by pondělí spadlo na neděli', () => {
    const puvodni = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(nazevDne('2026-10-12')).toBe('Pondělí 12. 10.');
    } finally {
      process.env.TZ = puvodni;
    }
  });

  it('souhlasí se zkratkou z denACesky', () => {
    for (const iso of ['2026-10-12', '2026-10-13', '2026-10-17', '2026-10-18']) {
      expect(nazevDne(iso).slice(0, 2).toLowerCase()).toBe(denACesky(iso).slice(0, 2));
    }
  });
});

describe('obalyDavky', () => {
  it('sloučí stejný obal ze dvou šarží — ve sbaleném řádku je z toho jedno číslo', () => {
    const davky = davkyStaceni([
      z({ id: '1', package_id: 'p05', quantity: 20 }),
      z({ id: '2', package_id: 'p05', quantity: 5 }),
      z({ id: '3', package_id: 'p50', quantity: 1 }),
    ], objem);
    const obaly = obalyDavky(davky[0]);
    expect(obaly.map((o) => [o.packageId, o.ks])).toEqual([['p50', 1], ['p05', 25]]);
  });

  it('jde od největšího obalu', () => {
    const davky = davkyStaceni([
      z({ id: '1', package_id: 'p05' }),
      z({ id: '2', package_id: 'p50' }),
      z({ id: '3', package_id: 'p30' }),
    ], objem);
    expect(obalyDavky(davky[0]).map((o) => o.objemL)).toEqual([50, 30, 0.5]);
  });

  it('záznamy bez obalu se neslučují — „nevíme jaký" není totéž', () => {
    const davky = davkyStaceni([
      z({ id: '1', package_id: null, quantity: 3 }),
      z({ id: '2', package_id: null, quantity: 4 }),
    ], objem);
    expect(obalyDavky(davky[0])).toHaveLength(2);
  });

  it('součet kusů přes obaly = kusy dávky', () => {
    const davky = davkyStaceni([
      z({ id: '1', package_id: 'p05', quantity: 20 }),
      z({ id: '2', package_id: 'p05', quantity: 5 }),
      z({ id: '3', package_id: 'p50', quantity: 1 }),
    ], objem);
    expect(obalyDavky(davky[0]).reduce((s, o) => s + o.ks, 0)).toBe(davky[0].celkemKs);
  });
});

describe('chybiVelikostSudu', () => {
  it('počet sudů bez velikosti — sklad je neodečte, dlaždice se nesmí zabalit', () => {
    expect(chybiVelikostSudu({ sudu: 2, zdrojPackageId: null })).toBe(true);
  });

  it('počet i velikost zapsané — v pořádku', () => {
    expect(chybiVelikostSudu({ sudu: 2, zdrojPackageId: 'k50' })).toBe(false);
  });

  it('stáčení rovnou z tanku (žádný sud) není chyba', () => {
    expect(chybiVelikostSudu({ sudu: 0, zdrojPackageId: null })).toBe(false);
  });
});

// ── Čísla šarže na jeden řádek ────────────────────────────────────────────
// Zadání z 19. 9. 2026: „u každého sudu bude navíc údaj stočeno litrů
// a výtrata v %."
describe('souhrnSarze', () => {
  const LITRY_SUDU: Record<string, number> = { k50: 50, k30: 30 };
  const objemSudu = (id: string) => LITRY_SUDU[id] ?? 0;
  const sarzeZ = (zaznamy: Array<Record<string, unknown>>) => sarzeDavky(
    zaznamy.map((o) => ({ zaznam: o as any, objemL: Number(o.objemL) || 0, litry: Number(o.litry) || 0 })),
    () => 'A',
  )[0];

  it('stočené litry jsou součet litrů všech řádků šarže', () => {
    const s = sarzeZ([
      { id: '1', objemL: 1.5, litry: 16.5, kegs_used: 1, kegs_used_package_id: 'k50' },
      { id: '2', objemL: 0.5, litry: 10 },
      { id: '3', objemL: 0.33, litry: 19.8 },
    ]);
    expect(souhrnSarze(s, objemSudu).litry).toBeCloseTo(46.3, 5);
  });

  it('výtrata se počítá zpětně ze zapsaných sudů: 1 − stočeno / ze sudů', () => {
    const s = sarzeZ([{ id: '1', objemL: 1, litry: 45, kegs_used: 1, kegs_used_package_id: 'k50' }]);
    const v = souhrnSarze(s, objemSudu);
    expect(v.zdrojL).toBe(50);
    expect(v.vytrata).toBe(10);
    expect(v.chybiVelikost).toBe(false);
  });

  it('dva sudy téže velikosti se vezmou jako 2 × objem', () => {
    const s = sarzeZ([{ id: '1', objemL: 1, litry: 90, kegs_used: 2, kegs_used_package_id: 'k50' }]);
    expect(souhrnSarze(s, objemSudu)).toMatchObject({ zdrojL: 100, vytrata: 10 });
  });

  it('stáčení rovnou z tanku (bez sudu) nemá výtratu — není z čeho', () => {
    const s = sarzeZ([{ id: '1', objemL: 1, litry: 45 }]);
    expect(souhrnSarze(s, objemSudu)).toMatchObject({ zdrojL: 0, vytrata: null, chybiVelikost: false });
  });

  it('počet sudů bez velikosti: výtrata se nehádá, velikost chybí', () => {
    const s = sarzeZ([{ id: '1', objemL: 1, litry: 45, kegs_used: 2, kegs_used_package_id: null }]);
    expect(souhrnSarze(s, objemSudu)).toMatchObject({ zdrojL: 0, vytrata: null, chybiVelikost: true });
  });

  it('sud, který není v katalogu, výtratu nevymyslí', () => {
    const s = sarzeZ([{ id: '1', objemL: 1, litry: 45, kegs_used: 1, kegs_used_package_id: 'neznamy' }]);
    expect(souhrnSarze(s, objemSudu).vytrata).toBeNull();
  });
});

describe('pocetSuduCesky', () => {
  it('skloňuje podle čísla: 1 sud, 2–4 sudy, 5 a víc sudů', () => {
    expect(pocetSuduCesky(1)).toBe('1 sud');
    expect(pocetSuduCesky(2)).toBe('2 sudy');
    expect(pocetSuduCesky(4)).toBe('4 sudy');
    expect(pocetSuduCesky(5)).toBe('5 sudů');
    expect(pocetSuduCesky(11)).toBe('11 sudů');
  });

  it('nula a nesmysl nespadnou', () => {
    expect(pocetSuduCesky(0)).toBe('0 sudů');
    expect(pocetSuduCesky(Number.NaN)).toBe('0 sudů');
  });
});
