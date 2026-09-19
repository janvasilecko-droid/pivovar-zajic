// 📋 Přehled stáčení KEG — jeden záznam na den a pivo, ne na každý obal zvlášť.
// ---------------------------------------------------------------------------
// Zadání z 19. 9. 2026: „přehled stáčení KEG: udělej tak, že bude na den
// stáčecí jen jeden záznam druhu 11 sv — ještě udělej barevný pozadí a v tom
// bude napsaný všechny obaly a množství, plus možnost upravovat tak, jak to
// je, jen to bude v jedný dlaždici."
//
// Dosud byl jeden lísteček na KAŽDÝ obal. Když se v úterý stočila jedenáctka
// do padesátek, třicítek a dvacítek, ležely v přehledu tři samostatné
// lístečky vedle sebe, každý s vlastním datem a jménem piva — a stáčeč musel
// očima skládat dohromady, kolik toho ten den vlastně udělal.
//
// Tady je jen to počítání. Vykreslení (barva, tlačítka) je v Kegging.tsx.

export type ZaznamStaceni = {
  id: string;
  entry_date: string;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  quantity: number;
};

export type PolozkaDavky<R> = {
  zaznam: R;
  /** Objem obalu v litrech; 0, když obal není v katalogu. */
  objemL: number;
  litry: number;
};

export type DavkaStaceni<R> = {
  /** `datum__pivo` — stabilní klíč pro React. */
  klic: string;
  datum: string;
  beerId: string | null;
  beerName: string;
  polozky: PolozkaDavky<R>[];
  celkemKs: number;
  celkemL: number;
};

/**
 * Seskupí záznamy na DEN a PIVO. Uvnitř skupiny zůstává každý obal zvlášť —
 * upravovat a mazat se musí dál po jednotlivých záznamech, protože každý je
 * v databázi svůj řádek a nese vlastní pohyb na skladě.
 *
 * ⚠️ Záznamy bez piva se NESLUČUJÍ dohromady. Prázdné `beer_id` neznamená
 * „totéž pivo", ale „nevíme které" — sloučit je by z dvou různých neznámých
 * udělalo jeden záznam a schoval by se rozdíl, který má někdo dohledat.
 */
export function davkyStaceni<R extends ZaznamStaceni>(
  zaznamy: R[],
  objemObalu: (packageId: string | null) => number,
): DavkaStaceni<R>[] {
  const podleKlice = new Map<string, DavkaStaceni<R>>();

  for (const z of zaznamy) {
    const datum = z.entry_date ?? '';
    // Bez piva dostane každý záznam vlastní skupinu — viz varování výš.
    const klic = z.beer_id ? `${datum}__${z.beer_id}` : `${datum}__bez-piva__${z.id}`;
    let davka = podleKlice.get(klic);
    if (!davka) {
      davka = {
        klic,
        datum,
        beerId: z.beer_id ?? null,
        beerName: z.beer_name ?? '—',
        polozky: [],
        celkemKs: 0,
        celkemL: 0,
      };
      podleKlice.set(klic, davka);
    }
    // Jméno piva se bere z prvního záznamu, který nějaké má: starší řádky
    // mívají `beer_name` prázdné, i když `beer_id` sedí.
    if (davka.beerName === '—' && z.beer_name) davka.beerName = z.beer_name;

    const objemL = objemObalu(z.package_id);
    const ks = Number(z.quantity) || 0;
    davka.polozky.push({ zaznam: z, objemL, litry: ks * objemL });
    davka.celkemKs += ks;
    davka.celkemL += ks * objemL;
  }

  // Uvnitř dávky od největšího sudu — tak se o tom mluví („padesátky,
  // třicítky, dvacítky") a tak to i vypadá na rampě.
  for (const davka of podleKlice.values()) {
    davka.polozky.sort((a, b) => b.objemL - a.objemL);
  }

  return [...podleKlice.values()];
}

/** Kolik dávek a kusů celkem — do souhrnu pod seznamem. */
export function souhrnDavek<R>(davky: DavkaStaceni<R>[]): { ks: number; litry: number } {
  return {
    ks: davky.reduce((s, d) => s + d.celkemKs, 0),
    litry: davky.reduce((s, d) => s + d.celkemL, 0),
  };
}

/** Zkratky dnů tak, jak se používají na cedulích v pivovaru. */
const DNY = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];

/**
 * „út 15.9." — den v týdnu před datem.
 *
 * Zadání z 19. 9. 2026: „udělej v tom stáčení KEG i lahve po, út, st, čt… ať
 * je vidět, jaký den se co stáčelo." Samotné „15.9." nikomu neřekne, jestli
 * to bylo v úterý nebo v sobotu, a rozvrh stáčení se plánuje po dnech.
 *
 * ⚠️ Datum se čte přes UTC. `new Date('2026-09-15')` je půlnoc UTC a
 * `getDay()` by v záporné zóně ukázal den předchozí — stáčení z pondělí by
 * se hlásilo jako nedělní.
 */
export function denACesky(iso: string | null | undefined): string {
  if (!iso) return '—';
  const casti = iso.split('-');
  if (casti.length < 3) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${DNY[d.getUTCDay()]} ${Number(casti[2])}.${Number(casti[1])}.`;
}

/**
 * Rozdělí položky dávky na ŠARŽE — „sud a co všechno se z něj stočilo".
 *
 * Zadání z 19. 9. 2026: „ukaž vždy sud a z něho, co vše bylo stočeno."
 * Zdrojový sud nese uvnitř šarže jen JEDEN řádek — ten, kterým se zapsal
 * odečet sudů. Ostatní mají prázdno a u nich to vypadalo, jako by se zdroj
 * ztratil („u některých lahví zmizelo nebo není, z jakého sudu byly stočeny").
 * Zdroj patří ŠARŽI, ne jednotlivému obalu — tak se teď i ukazuje: jednou,
 * nad tím, co se z něj stočilo.
 *
 * Pořadí šarží i položek v nich zůstává takové, v jakém přišly.
 */
export type Sarze<R> = {
  klic: string;
  /** Obal zdrojového sudu — null, když ho žádný řádek šarže nenese. */
  zdrojPackageId: string | null;
  /** Kolik sudů se na tuhle šarži spotřebovalo. */
  sudu: number;
  /** Záznam, který zdroj nese — na něm se zdroj upravuje. */
  nositelZdroje: R | null;
  polozky: PolozkaDavky<R>[];
};

export function sarzeDavky<R extends {
  kegs_used_package_id?: string | null;
  kegs_used?: number | null;
}>(
  polozky: PolozkaDavky<R>[],
  sarzeId: (zaznam: R) => string,
): Sarze<R>[] {
  const podleKlice = new Map<string, Sarze<R>>();
  for (const polozka of polozky) {
    const klic = sarzeId(polozka.zaznam);
    let sarze = podleKlice.get(klic);
    if (!sarze) {
      sarze = { klic, zdrojPackageId: null, sudu: 0, nositelZdroje: null, polozky: [] };
      podleKlice.set(klic, sarze);
    }
    sarze.polozky.push(polozka);
    const z = polozka.zaznam;
    if (!sarze.zdrojPackageId && z.kegs_used_package_id) {
      sarze.zdrojPackageId = z.kegs_used_package_id;
    }
    // Nositel zdroje je první řádek, který má odečtené sudy; když žádný nemá,
    // je to první řádek šarže — aby bylo kam sud dopsat.
    if (!sarze.nositelZdroje || (!Number(sarze.nositelZdroje.kegs_used) && Number(z.kegs_used) > 0)) {
      sarze.nositelZdroje = z;
    }
    sarze.sudu += Number(z.kegs_used) || 0;
  }
  return [...podleKlice.values()];
}
