// 📋 Přehled stáčení: jeden záznam na den a pivo — viz hlavička prehledStaceni.ts.
// Zadání z 19. 9. 2026: „na den stáčecí jen jeden záznam druhu 11 sv, barevný
// pozadí a v tom všechny obaly a množství" a vzápětí „to samý i u lahví".
import { describe, it, expect } from 'vitest';
import { davkyStaceni, denACesky, sarzeDavky, souhrnDavek, type ZaznamStaceni } from './prehledStaceni';

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
describe('přehledy KEG i lahví seskupují stejně', () => {
  const { readFileSync } = require('node:fs');
  const KEG = readFileSync('src/screens/Kegging.tsx', 'utf8');
  const LAHVE = readFileSync('src/screens/BottlingScreen.tsx', 'utf8');

  it('obě obrazovky volají davkyStaceni', () => {
    expect(KEG).toMatch(/davkyStaceni\(sortedRows/);
    expect(LAHVE).toMatch(/davkyStaceni\(sortedRows/);
  });

  it('dlaždice má barvu podle piva a čitelný text', () => {
    for (const [kde, zdroj] of [['KEG', KEG], ['lahve', LAHVE]] as const) {
      expect(zdroj, `${kde}: chybí barva piva`).toMatch(/backgroundColor: beerBg\(beer\)/);
      expect(zdroj, `${kde}: chybí čitelný text na barvě`).toMatch(/beerText\(beer\)/);
    }
  });

  it('upravovat jde dál po jednotlivých záznamech', () => {
    for (const [kde, zdroj] of [['KEG', KEG], ['lahve', LAHVE]] as const) {
      expect(zdroj, `${kde}: zmizelo mazání záznamu`).toMatch(/onClick=\{\(\) => del\(r\.id\)\}/);
      expect(zdroj, `${kde}: zmizela úprava záznamu`).toMatch(/setEditingRow\(r\)/);
    }
  });

  it('u lahví se zdrojový sud ukazuje po ŠARŽÍCH, ne po řádcích', () => {
    // Zdroj nese uvnitř šarže jen jeden řádek; u ostatních se dřív psalo jen
    // „〃 stejná dávka" a vypadalo to, že se zdroj ztratil.
    expect(LAHVE).toMatch(/sarzeDavky\(davka\.polozky, getBatchId\)/);
    // Nadpis „Stočeno ze sudu" je pryč — šarži drží pohromadě čára po straně.
    // Z provozu: „má tam být sud a počet, jen nějak označ třeba čarou."
    expect(LAHVE, 'nadpis se vrátil místo sudu a počtu').not.toMatch(/Stočeno ze sudu/);
    expect(LAHVE, 'chybí čára, která šarži drží pohromadě').toMatch(/border-l-4 border-l-amber-500/);
    // Jen dlaždice na telefonu — tabulka na počítači zůstává řádek po řádku,
    // tam „〃 stejná dávka" dává smysl a místo na sud tam není.
    const dlazdice = LAHVE.slice(
      LAHVE.indexOf('Jedna dlaždice na DEN a PIVO'),
      LAHVE.indexOf('hidden md:block rounded border border-amber-300/80'),
    );
    expect(dlazdice, 'v dlaždici zůstalo „stejná dávka" místo sudu').not.toMatch(/stejná dávka/);
  });

  it('datum nese i den v týdnu — na obou obrazovkách', () => {
    for (const [kde, zdroj] of [['KEG', KEG], ['lahve', LAHVE]] as const) {
      expect(zdroj, `${kde}: chybí den v týdnu`).toMatch(/denACesky\(davka\.datum\)/);
    }
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

  it('dvě stáčení téhož piva v jednom dni jsou dvě šarže, každá se svým sudem', () => {
    const sarze = sarzeDavky([
      polozka({ id: '1', davka: 'rano', kegs_used: 2, kegs_used_package_id: 'k50' }),
      polozka({ id: '2', davka: 'odpo', kegs_used: 1, kegs_used_package_id: 'k30' }),
    ], (z: any) => z.davka);
    expect(sarze.map((s) => s.zdrojPackageId)).toEqual(['k50', 'k30']);
  });
});
