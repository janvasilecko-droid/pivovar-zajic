// 🧺 Obchod: nabídka zboží k přidání — dlaždice podle skupin.
// ---------------------------------------------------------------------------
// Z provozu 10. 10. 2026: „přidat zboží udělej jako dlaždice: jednotlivý piva,
// půllitry, kosmetika; udělej tam zatím ty, co jsou na té výdejce" — tedy
// na účtence „Sumář prodeje" z pokladny obchodu (uzávěrka 2/2873).
//
// Nabídka je zatím ta, co z té účtenky vyšla: kód z pokladny, název a cena.
// Další zboží přibývá ručně („Jiné zboží") nebo samo z první uzávěrky, kde
// se objeví nový kód.
//
// Pivo se k tomu, co je v katalogu piv a obalů, páruje podle názvu (stejně jako
// při čtení uzávěrky z fotky, navrhZbozi). Nic se nehádá: když v katalogu pivo
// nebo obal chybí, dlaždice se nedá zvolit a řekne proč.
import type { KatalogObal, KatalogPivo } from './fotkaPolozky';
import type { Zbozi } from './obchodSklad';
import { navrhZbozi } from './obchodUzaverka';

export type SkupinaZbozi = 'piva' | 'pullitry' | 'kosmetika' | 'ostatni';

export const SKUPINY: { id: SkupinaZbozi; nazev: string; popis: string }[] = [
  { id: 'piva', nazev: 'Piva', popis: 'sudy, láhve a PET podle piva' },
  { id: 'pullitry', nazev: 'Půllitry', popis: 'skleničky' },
  { id: 'kosmetika', nazev: 'Kosmetika', popis: 'pivní kosmetika' },
  { id: 'ostatni', nazev: 'Ostatní', popis: 'limo, saponát, kartonek' },
];

export type PolozkaKatalogu = {
  /** Kód zboží v pokladně — podle něj se zboží pozná na uzávěrce. */
  kod: string;
  /** Název, jak ho tiskne pokladna. */
  nazev: string;
  skupina: SkupinaZbozi;
  /** Prodejní cena z účtenky (Kč). */
  cena: number;
};

/** Zboží z účtenky „Sumář prodeje" 2/2873 (10. 10. 2026), po skupinách. */
export const KATALOG_VYDEJKY: PolozkaKatalogu[] = [
  { kod: '10241', nazev: 'Pivo sud 30l 10° světlá', skupina: 'piva', cena: 1275 },
  { kod: '10242', nazev: 'Pivo sud 30l 12° světlá', skupina: 'piva', cena: 1455 },
  { kod: '11000', nazev: 'Pivo sklo 12° světlá 0,33l', skupina: 'piva', cena: 35 },
  { kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', skupina: 'piva', cena: 48 },
  { kod: '11004', nazev: 'Pivo sklo 12° tmavá 0,5l', skupina: 'piva', cena: 49 },
  { kod: '11005', nazev: 'Pivo sklo 12° tmavá 0,33l', skupina: 'piva', cena: 36 },
  { kod: '11009', nazev: 'Pivo sklo 10° sv. 0,5l', skupina: 'piva', cena: 43 },
  { kod: '11172', nazev: 'Pivo sklo 11° světlý ležák 0,33l', skupina: 'piva', cena: 34 },
  { kod: '11140', nazev: 'Pivo PET 1l 10° světlá', skupina: 'piva', cena: 74 },
  { kod: '11141', nazev: 'Pivo PET 1l 12° světlá', skupina: 'piva', cena: 84 },
  { kod: '11142', nazev: 'Pivo PET 1l 12° jantarový ležák', skupina: 'piva', cena: 85 },
  { kod: '11143', nazev: 'Pivo PET 1l 12° tmavá', skupina: 'piva', cena: 86 },
  { kod: '11144', nazev: 'Pivo PET 1l 11° světlý ležák', skupina: 'piva', cena: 81 },
  { kod: '11197', nazev: 'Pivo PET 1l 8° Cyklistička Vosmička', skupina: 'piva', cena: 73 },
  { kod: '11146', nazev: 'Pivo PET 1,5l 10° světlá', skupina: 'piva', cena: 106 },
  { kod: '11147', nazev: 'Pivo PET 1,5l 12° světlá', skupina: 'piva', cena: 119 },
  { kod: '11148', nazev: 'Pivo PET 1,5l 12° jantarový ležák', skupina: 'piva', cena: 121 },
  { kod: '11149', nazev: 'Pivo PET 1,5l 12° tmavá', skupina: 'piva', cena: 124 },
  { kod: '11190', nazev: 'Pivo PET 1,5l 11° světlý ležák', skupina: 'piva', cena: 115 },
  { kod: '11198', nazev: 'Pivo PET 1,5l 8° Cyklistička Vosmička', skupina: 'piva', cena: 105 },
  { kod: '393', nazev: 'Půllitr Mannheim 0,5l', skupina: 'pullitry', cena: 140 },
  { kod: '62019', nazev: 'Kyn-Pivní sprchový gel 300ml', skupina: 'kosmetika', cena: 149 },
  { kod: '15160', nazev: '0,5l limo sklo', skupina: 'ostatni', cena: 31 },
  { kod: '15117', nazev: 'Limo PET 1l (ks)', skupina: 'ostatni', cena: 45 },
  { kod: '1106', nazev: 'Saponát 1l', skupina: 'ostatni', cena: 25 },
  { kod: '11111', nazev: 'Kartonek', skupina: 'ostatni', cena: 30 },
];

/**
 * Proč se dlaždice dá, nebo nedá zvolit:
 *  - `nove`: zboží v obchodě ještě není, přidá se;
 *  - `v_obchode`: už tam je;
 *  - `vypnute`: bylo v obchodě a přestalo se sledovat — zvolením se zase zapne;
 *  - `chybi_katalog`: pivo nebo obal v katalogu piv a obalů není, nejde ho spárovat;
 *  - `obsazeno`: stejné pivo v tomhle obalu je v obchodě už pod jiným kódem.
 */
export type StavDlazdice = 'nove' | 'v_obchode' | 'vypnute' | 'chybi_katalog' | 'obsazeno';

export type Dlazdice = {
  polozka: PolozkaKatalogu;
  stav: StavDlazdice;
  pivo?: KatalogPivo;
  obal?: KatalogObal;
  /** U `obsazeno`: pod jakým zbožím už pivo + obal v obchodě je. */
  obsazenoKym?: string;
};

/** Dá se dlaždice zvolit (přidá, nebo zapne)? */
export const jeVolitelna = (d: Dlazdice) => d.stav === 'nove' || d.stav === 'vypnute';

export function dlazdiceSkupiny(
  zbozi: Pick<Zbozi, 'kod' | 'nazev' | 'beer_id' | 'package_id' | 'aktivni'>[],
  piva: KatalogPivo[],
  obaly: KatalogObal[],
  katalog: PolozkaKatalogu[] = KATALOG_VYDEJKY,
): Record<SkupinaZbozi, Dlazdice[]> {
  const podleKodu = new Map(zbozi.map((z) => [z.kod, z]));
  const aktivniPoParu = new Map<string, string>();
  for (const z of zbozi) {
    if (z.aktivni === false || !z.beer_id || !z.package_id) continue;
    aktivniPoParu.set(`${z.beer_id}|${z.package_id}`, z.nazev);
  }

  const out: Record<SkupinaZbozi, Dlazdice[]> = { piva: [], pullitry: [], kosmetika: [], ostatni: [] };
  for (const polozka of katalog) {
    const existuje = podleKodu.get(polozka.kod);
    let d: Dlazdice;
    if (existuje) {
      if (existuje.aktivni !== false) {
        d = { polozka, stav: 'v_obchode' };
      } else {
        // Vypnuté zboží jde zapnout, jen když stejné pivo + obal mezitím nezabralo jiné zboží.
        const kym = existuje.beer_id && existuje.package_id ? aktivniPoParu.get(`${existuje.beer_id}|${existuje.package_id}`) : undefined;
        d = kym ? { polozka, stav: 'obsazeno', obsazenoKym: kym } : { polozka, stav: 'vypnute' };
      }
    } else if (polozka.skupina === 'piva') {
      const n = navrhZbozi(polozka.nazev, piva, obaly);
      if (!n.jePivo || !n.beer || !n.pkg) {
        d = { polozka, stav: 'chybi_katalog', pivo: n.beer, obal: n.pkg };
      } else {
        const kym = aktivniPoParu.get(`${n.beer.id}|${n.pkg.id}`);
        d = kym
          ? { polozka, stav: 'obsazeno', pivo: n.beer, obal: n.pkg, obsazenoKym: kym }
          : { polozka, stav: 'nove', pivo: n.beer, obal: n.pkg };
      }
    } else {
      d = { polozka, stav: 'nove' };
    }
    out[polozka.skupina].push(d);
  }
  return out;
}

/** Co se zapíše do databáze za zvolené dlaždice. */
export type ZapisZDlazdic = {
  /** Nové zboží (řádky pro obchod_zbozi). */
  nove: { kod: string; nazev: string; beer_id: string | null; package_id: string | null; cena: number }[];
  /** Kódy vypnutého zboží, které se má zase zapnout. */
  zapnout: string[];
};

export function zapisZDlazdic(vybrane: Dlazdice[]): ZapisZDlazdic {
  const nove: ZapisZDlazdic['nove'] = [];
  const zapnout: string[] = [];
  // Dvě dlaždice, které by chtěly stejné pivo + obal, se nezapíšou obě (v databázi je jedno zboží na dvojici).
  const pouzitaDvojice = new Set<string>();
  for (const d of vybrane) {
    if (d.stav === 'vypnute') { zapnout.push(d.polozka.kod); continue; }
    if (d.stav !== 'nove') continue;
    if (d.pivo && d.obal) {
      const k = `${d.pivo.id}|${d.obal.id}`;
      if (pouzitaDvojice.has(k)) continue;
      pouzitaDvojice.add(k);
    }
    nove.push({
      kod: d.polozka.kod,
      nazev: d.polozka.nazev,
      beer_id: d.pivo?.id ?? null,
      package_id: d.obal?.id ?? null,
      cena: d.polozka.cena,
    });
  }
  return { nove, zapnout };
}
