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

import { skutecnaVytrataProcenta } from './bottlingYield';

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

/**
 * Dávky seskupené po DNECH — pro přehled, kde je každý den svůj pás.
 *
 * Zadání z 15. 10. 2026 (po 12. 10. už podruhé): „ten přehled udělej
 * v řádku, takhle je to nepřehledný, odděl vždycky, ať je vidět, jaký den se
 * co stáčelo." Samotné datum v rohu dlaždice se při rolování ztratilo —
 * dlaždice různých dnů vypadaly stejně a splývaly. Den je teď nadřazená
 * skupina, ne popisek každé dlaždice.
 */
export type DenStaceni<R> = {
  datum: string;
  davky: DavkaStaceni<R>[];
  celkemKs: number;
  celkemL: number;
};

/**
 * Od nejnovějšího dne. Uvnitř dne zůstává pořadí dávek takové, v jakém
 * přišly (řadí se už před `davkyStaceni`). Záznam bez data má vlastní den
 * „Bez data" úplně dole — nesmí se tiše přilepit k jinému dni.
 */
export function dnyStaceni<R>(davky: DavkaStaceni<R>[]): DenStaceni<R>[] {
  const podleData = new Map<string, DenStaceni<R>>();
  for (const davka of davky) {
    let den = podleData.get(davka.datum);
    if (!den) {
      den = { datum: davka.datum, davky: [], celkemKs: 0, celkemL: 0 };
      podleData.set(davka.datum, den);
    }
    den.davky.push(davka);
    den.celkemKs += davka.celkemKs;
    den.celkemL += davka.celkemL;
  }
  return [...podleData.values()].sort((a, b) => b.datum.localeCompare(a.datum));
}

/** Co se ten den stočilo do jednoho obalu — sloučeno přes všechny šarže dávky. */
export type SouhrnObalu<R> = {
  klic: string;
  packageId: string | null;
  /** První záznam obalu — z něj se bere popisek, když obal není v katalogu. */
  zaznam: R;
  objemL: number;
  ks: number;
};

/**
 * „1,5 l × 11 · 0,5 l × 20 · 0,33 l × 60" — obaly dávky na jeden řádek.
 *
 * Dvě šarže téhož piva ten den (ráno z padesátky, odpoledne ze třicítky)
 * mají každá vlastní řádek 0,5 l; ve sbaleném přehledu je z toho jedno číslo,
 * protože tam nejde o to, ze kterého sudu lahve jsou. Pořadí je od největšího
 * obalu, tak jak `davkyStaceni` řadí položky.
 */
export function obalyDavky<R extends ZaznamStaceni>(davka: DavkaStaceni<R>): SouhrnObalu<R>[] {
  const podleObalu = new Map<string, SouhrnObalu<R>>();
  for (const p of davka.polozky) {
    // Záznam bez obalu se NESLUČUJE s jiným bez obalu — „nevíme jaký" není
    // totéž (stejné pravidlo jako u piva v `davkyStaceni`).
    const klic = p.zaznam.package_id ?? `bez-obalu__${p.zaznam.id}`;
    const ks = Number(p.zaznam.quantity) || 0;
    const souhrn = podleObalu.get(klic);
    if (souhrn) souhrn.ks += ks;
    else podleObalu.set(klic, { klic, packageId: p.zaznam.package_id, zaznam: p.zaznam, objemL: p.objemL, ks });
  }
  return [...podleObalu.values()];
}

/**
 * Šarže, u které je zapsaný počet sudů, ale NE jejich velikost.
 *
 * Bez velikosti se sudy ze skladu neodečtou (appka neví, který ubyl), takže
 * sklep ukazuje víc piva, než tam je. Tohle je jediná věc v přehledu, kvůli
 * které se dlaždice nesmí zabalit — nikdo by si jí nevšiml.
 */
export function chybiVelikostSudu<R>(sarze: Pick<Sarze<R>, 'sudu' | 'zdrojPackageId'>): boolean {
  return sarze.sudu > 0 && !sarze.zdrojPackageId;
}

/**
 * Čísla šarže pro jeden řádek: kolik litrů se stočilo, kolik se vzalo ze
 * sudů a jaká z toho vyšla výtrata.
 *
 * Zadání z 19. 9. 2026: „u každého sudu bude navíc údaj stočeno litrů
 * a výtrata v %." Výtrata se počítá ZPĚTNĚ ze zapsaného počtu sudů, ne
 * z teoretického koeficientu — a bez zdroje (stáčení rovnou z tanku, nebo
 * chybí velikost sudu) není z čeho, takže je `null` a řádek ji nenapíše.
 */
export type SouhrnSarze = {
  litry: number;
  zdrojL: number;
  vytrata: number | null;
  chybiVelikost: boolean;
};

export function souhrnSarze<R>(
  sarze: Sarze<R>,
  objemSudu: (packageId: string) => number,
): SouhrnSarze {
  const litry = sarze.polozky.reduce((soucet, p) => soucet + p.litry, 0);
  const objem = sarze.zdrojPackageId ? objemSudu(sarze.zdrojPackageId) : 0;
  const zdrojL = sarze.sudu > 0 && objem > 0 ? sarze.sudu * objem : 0;
  return {
    litry,
    zdrojL,
    vytrata: skutecnaVytrataProcenta(litry, zdrojL),
    chybiVelikost: chybiVelikostSudu(sarze),
  };
}

/** „1 sud", „2 sudy", „5 sudů" — číslo i s tvarem slova, ať se neříká „2 sudů". */
export function pocetSuduCesky(n: number): string {
  const pocet = Math.round(Number(n) || 0);
  const slovo = pocet === 1 ? 'sud' : pocet >= 2 && pocet <= 4 ? 'sudy' : 'sudů';
  return `${pocet} ${slovo}`;
}

/** Zkratky dnů tak, jak se používají na cedulích v pivovaru. */
const DNY = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'];
const DNY_PLNE = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

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
 * „Pondělí 12. 10." — celý název dne pro pás nad dávkami.
 *
 * `denACesky` výš („po 12.10.") je zkratka do hustého řádku; nadpis dne
 * vedle ní má být čitelný na první pohled, i z druhého konce místnosti.
 * Rok se neuvádí — přehled je vždycky jedno zvolené období.
 * Čte se přes UTC ze stejného důvodu jako `denACesky`.
 */
export function nazevDne(iso: string | null | undefined): string {
  if (!iso) return 'Bez data';
  const casti = iso.split('-');
  if (casti.length < 3) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const den = DNY_PLNE[d.getUTCDay()];
  return `${den.charAt(0).toUpperCase()}${den.slice(1)} ${Number(casti[2])}. ${Number(casti[1])}.`;
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
    // ⚠️ NE SČÍTAT přes řádky. `kegs_used` je u záznamu DUPLIKOVANÝ na
    // KAŽDÉM řádku téže šarže (jeden zdrojový sud platí pro celý zápis, ne
    // pro jeden obal) — stejnou konvenci už dodržuje `isFirstInBatch` níž
    // i dedup v `totalKegs`. Z provozu 19. 9. 2026: „u každého keg 6, mělo
    // to být 1" — šarže o třech obalech se sčítáním přes řádky napočítala
    // 3× víc sudů, než se doopravdy stočilo. Číslo se bere JEDNOU, z řádku,
    // který ho nese (u všech řádků šarže je stejné).
    if (Number(z.kegs_used) > 0) sarze.sudu = Number(z.kegs_used);
  }
  return [...podleKlice.values()];
}
