// 📊 Přehled stáčení lahví jako tabulka — řádek = jedno stáčení, sloupce jako v Excelu.
// ---------------------------------------------------------------------------
// Zadání z 15. 10. 2026: „udělej ten přehled ve stylu skladu, ale ať je vidět,
// kolik se stočilo z kolika sudů, výtrata, a šlo to editovat" — „je to stejná
// tabulka jako export lahví do Excelu."
//
// Sloupce jsou ty z exportu (lib/prehledVydeje.ts, varianta staceni_lahve):
//   Druh piva │ Z sudů: 50 · 30 · 20 · 15 · 10 l │ Stočeno lahví: 1,5 · 1,0 · 0,5 · 0,33 l
// a k tomu, co Excel počítá vzorcem a my to musíme umět ukázat rovnou: litry
// v lahvích, litry ze sudů a výtrata.
//
// ŘÁDEK = ŠARŽE (jedno stáčení: pivo + den + čas zápisu + velikost sudu), ne
// den + pivo. Zápis z fotky tabulky vytvoří řádek v databázi za každý řádek
// papírové tabulky; když je v přehledu totéž, dá se porovnat řádek po řádku.
// Dvě stáčení téhož piva v jeden den jsou dva řádky — jako na papíře.
//
// Tady je jen čistá logika (žádné React, žádná databáze):
//  - `radkyDavky` / `souctyRadku` — z dávek udělají řádky a součty,
//  - `plan…` — co přesně se má zapsat do databáze, když se změní číslo v buňce.
//    Plán je jedna operace (update / insert / delete) nebo nic; provede ji
//    obrazovka. Díky tomu se dají otestovat všechna pravidla bez databáze.
import { SLOUPCE_LAHVE, SLOUPCE_SUDY } from './prehledVydeje';
import { sarzeDavky, souhrnSarze, type DavkaStaceni } from './prehledStaceni';
import { skutecnaVytrataProcenta } from './bottlingYield';
import { puvodZapisu, vlastniPoznamka } from './puvodZapisu';
import type { EntryRow, Package } from './supabase';

/** Objem zaokrouhlený na dvě desetinná místa — 0.33 vs 0.3300000001. */
export const klicObjemu = (l: number): number => Math.round((Number(l) || 0) * 100) / 100;

/** „1,5 L", „50 L" — objem s českou čárkou. */
export const popisObjemu = (l: number): string => `${String(klicObjemu(l)).replace('.', ',')} L`;

// ---------------------------------------------------------------------------
// Řádek tabulky
// ---------------------------------------------------------------------------

/** Buňka sloupce lahví: záznamy šarže s tímhle obalem (obvykle jeden). */
export type BunkaLahve = {
  /** Objem lahve = sloupec. */
  objem: number;
  zaznamy: EntryRow[];
  ks: number;
};

export type RadekTabulky = {
  /** Klíč šarže (getBatchId) — stabilní klíč pro React i pro zápis. */
  klic: string;
  datum: string;
  beerId: string | null;
  beerName: string;
  /** Viditelné záznamy šarže (kladné). */
  zaznamy: EntryRow[];
  /** Záznam, který nese zdroj ze sudů (z něj se při přidání lahve kopíruje). */
  nositel: EntryRow | null;
  /** Počet sudů zapsaný u šarže; 0 = bez sudu (stáčeno rovnou z tanku). */
  sudu: number;
  /** Obal sudu; null = nevybraný. */
  sudPkgId: string | null;
  /** Objem sudu v litrech; 0 = neznámý (nevybraný nebo mimo katalog). */
  sudObjem: number;
  /** Je zapsaný počet sudů, ale ne jejich velikost → sklad sudy neodečte. */
  chybiVelikost: boolean;
  /** Vždy `SLOUPCE_LAHVE.length` buněk, v pořadí sloupců. */
  lahve: BunkaLahve[];
  /** Záznamy s obalem mimo čtyři sloupce (jiný objem, sud zapsaný jako obal). */
  lahveJine: EntryRow[];
  /** Litry v lahvích. */
  litry: number;
  /** Litry ze sudů (počet × objem); 0, když není z čeho počítat. */
  zdrojL: number;
  /** Výtrata v %; null bez zdroje. */
  vytrata: number | null;
  /** Odkud se řádek vzal, když ho založila appka sama (inventura, zaškrtnutí). */
  puvod: string | null;
  /** Vlastní poznámka stáčeče. */
  poznamka: string | null;
};

/**
 * Řádky tabulky z jedné dávky (den + pivo): jeden řádek na šarži.
 * Pořadí šarží zůstává takové, v jakém přišly.
 */
export function radkyDavky(
  davka: DavkaStaceni<EntryRow>,
  obaly: Package[],
  getBatchId: (r: EntryRow) => string,
): RadekTabulky[] {
  const obalPodleId = new Map(obaly.map((p) => [p.id, p]));
  const objemSudu = (id: string) => Number(obalPodleId.get(id)?.volume_l) || 0;

  return sarzeDavky(davka.polozky, getBatchId).map((sarze) => {
    const souhrn = souhrnSarze(sarze, objemSudu);
    const zaznamy = sarze.polozky.map((p) => p.zaznam);
    const lahve: BunkaLahve[] = SLOUPCE_LAHVE.map((objem) => ({ objem, zaznamy: [], ks: 0 }));
    const lahveJine: EntryRow[] = [];
    for (const p of sarze.polozky) {
      const bunka = lahve.find((b) => b.objem === klicObjemu(p.objemL));
      if (bunka) {
        bunka.zaznamy.push(p.zaznam);
        bunka.ks += Number(p.zaznam.quantity) || 0;
      } else {
        lahveJine.push(p.zaznam);
      }
    }
    const puvod = zaznamy.map((z) => puvodZapisu(z.note)).find((x) => x !== null) ?? null;
    const poznamka = zaznamy.map((z) => vlastniPoznamka(z.note)).find((x) => x !== null) ?? null;
    return {
      klic: sarze.klic,
      datum: davka.datum,
      beerId: davka.beerId,
      beerName: davka.beerName,
      zaznamy,
      nositel: sarze.nositelZdroje,
      sudu: sarze.sudu,
      sudPkgId: sarze.zdrojPackageId,
      sudObjem: sarze.zdrojPackageId ? objemSudu(sarze.zdrojPackageId) : 0,
      chybiVelikost: souhrn.chybiVelikost,
      lahve,
      lahveJine,
      litry: souhrn.litry,
      zdrojL: souhrn.zdrojL,
      vytrata: souhrn.vytrata,
      puvod: puvod?.popis ?? null,
      poznamka,
    };
  });
}

/** Index sloupce sudů pro objem; -1, když sud nesedí na žádný sloupec. */
export const sloupecSudu = (objem: number): number => SLOUPCE_SUDY.indexOf(klicObjemu(objem));

/** Sloupce, které jsou v kompaktní tabulce (telefon) vždycky: padesátky a třicítky, lahve od 1,5 do 0,5 l. */
export const ZAKLADNI_SLOUPCE_SUDY = [50, 30];
export const ZAKLADNI_SLOUPCE_LAHVE = [1.5, 1, 0.5];

/**
 * Které sloupce tabulky ukázat.
 *
 * Excel má všech devět sloupců, na telefonu se ale vedle sebe vejde šest —
 * a lahve, kvůli kterým se na přehled dívá, by utekly za okraj. Kompaktní
 * tabulka proto drží základní sloupce a k nim ty, ve kterých je v řádcích
 * něco zapsané; ostatní se objeví po „Všechny sloupce" (a na počítači jsou
 * vždycky). Sloupce jsou pro všechny dny stejné, ať se čísla pod sebou
 * nehýbou. Pořadí je pořád pořadí Excelu.
 *
 * Řádek s počtem sudů BEZ velikosti ukáže všechny sloupce sudů — velikost se
 * opravuje klepnutím do sloupce té správné a ten nesmí být schovaný.
 */
export function viditelneSloupce(radky: RadekTabulky[], vsechny: boolean): { sudy: number[]; lahve: number[] } {
  if (vsechny) return { sudy: [...SLOUPCE_SUDY], lahve: [...SLOUPCE_LAHVE] };
  const pouziteSudy = new Set(radky.filter((r) => r.sudu > 0 && sloupecSudu(r.sudObjem) >= 0).map((r) => klicObjemu(r.sudObjem)));
  const pouziteLahve = new Set(radky.flatMap((r) => r.lahve.filter((b) => b.zaznamy.length > 0).map((b) => b.objem)));
  const chybiVelikost = radky.some((r) => r.chybiVelikost);
  return {
    sudy: SLOUPCE_SUDY.filter((l) => chybiVelikost || ZAKLADNI_SLOUPCE_SUDY.includes(l) || pouziteSudy.has(l)),
    lahve: SLOUPCE_LAHVE.filter((l) => ZAKLADNI_SLOUPCE_LAHVE.includes(l) || pouziteLahve.has(l)),
  };
}

export type SouctyTabulky = {
  /** Sudy podle sloupců (SLOUPCE_SUDY). */
  sudy: number[];
  /** Lahve podle sloupců (SLOUPCE_LAHVE). */
  lahve: number[];
  /** Sudy, které nesedí na žádný sloupec (nevybraná nebo jiná velikost). */
  sudyJine: number;
  /** Kusy obalů mimo sloupce. */
  lahveJine: number;
  litry: number;
  zdrojL: number;
  /**
   * Výtrata ze součtů, ale JEN z řádků, které mají zdroj: stáčení rovnou
   * z tanku nemá co porovnávat a výtratu by srazilo dolů.
   */
  vytrata: number | null;
};

export function souctyRadku(radky: RadekTabulky[]): SouctyTabulky {
  const out: SouctyTabulky = {
    sudy: SLOUPCE_SUDY.map(() => 0),
    lahve: SLOUPCE_LAHVE.map(() => 0),
    sudyJine: 0,
    lahveJine: 0,
    litry: 0,
    zdrojL: 0,
    vytrata: null,
  };
  let litrySeZdrojem = 0;
  for (const r of radky) {
    if (r.sudu > 0) {
      const i = sloupecSudu(r.sudObjem);
      if (i >= 0) out.sudy[i] += r.sudu;
      else out.sudyJine += r.sudu;
    }
    r.lahve.forEach((b, j) => { out.lahve[j] += b.ks; });
    out.lahveJine += r.lahveJine.reduce((s, z) => s + (Number(z.quantity) || 0), 0);
    out.litry += r.litry;
    out.zdrojL += r.zdrojL;
    if (r.zdrojL > 0) litrySeZdrojem += r.litry;
  }
  out.vytrata = skutecnaVytrataProcenta(litrySeZdrojem, out.zdrojL);
  return out;
}

/**
 * Výtrata, která stojí za pohled: záporná (z menšího množství piva se
 * nastáčelo víc, než sudy pojmou — chybí sud, nebo je lahví víc než má) nebo
 * vysoká. Běžně vychází kolem 10 % (z provozu: medián 10 %, čtvrtina
 * stáčení 7–16 %), proto dole −2 % (zaokrouhlení, přeplněné lahve) a nahoře
 * 25 %.
 */
export const VYTRATA_NEJMIN = -2;
export const VYTRATA_NEJVIC = 25;
export function vytrataKeKontrole(v: number | null): boolean {
  return v !== null && (v < VYTRATA_NEJMIN || v > VYTRATA_NEJVIC);
}

// ---------------------------------------------------------------------------
// Úpravy v buňkách → plán zápisu
// ---------------------------------------------------------------------------

/** Záznam tak, jak se vkládá do tabulky `bottling`. */
export type NovyZaznam = {
  entry_date: string;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string;
  package_label: string | null;
  quantity: number;
  kegs_used: number | null;
  kegs_used_package_id: string | null;
  source_volume_l: number | null;
  note: string | null;
  created_at: string;
};

export type ZmenaZaznamu = Partial<Pick<
  EntryRow,
  'quantity' | 'kegs_used' | 'kegs_used_package_id' | 'source_volume_l' | 'entry_date' | 'beer_id' | 'beer_name'
>>;

export type Operace =
  | { typ: 'update'; ids: string[]; zmena: ZmenaZaznamu }
  | { typ: 'insert'; radky: NovyZaznam[] }
  /** Celé záznamy, ať je jde vrátit zpět (stejným insertem, i s id). */
  | { typ: 'delete'; zaznamy: EntryRow[] };

export type Plan =
  | { ok: true; operace: Operace | null; popis: string }
  | { ok: false; zprava: string };

export type KontextPlanu = {
  /** VŠECHNY záznamy stáčení, i skryté opravy z inventury — sudy se mění na celé šarži. */
  zaznamy: EntryRow[];
  obaly: Package[];
  getBatchId: (r: EntryRow) => string;
};

const nic: Plan = { ok: true, operace: null, popis: '' };
const chybaPlanu = (zprava: string): Plan => ({ ok: false, zprava });

/**
 * Celé nezáporné číslo z textu políčka. Prázdné = 0 (smazat). Cokoli jiného
 * než číslice (desetinná čárka, mínus, písmena) je `null` — počty lahví i sudů
 * jsou celé a překlep se nesmí tiše zaokrouhlit.
 */
export function celeCislo(text: unknown): number | null {
  const t = String(text ?? '').trim();
  if (t === '') return 0;
  return /^\d{1,6}$/.test(t) ? Number(t) : null;
}

const NEPLATNE_CISLO = 'Zadej celé číslo (0 nebo prázdné = smazat).';

/**
 * Skutečný den ve tvaru RRRR-MM-DD. Přes zpětný převod: V8 bere „2026-02-31"
 * a posune ho na březen, takže samotné `new Date()` nestačí.
 */
function jeDatum(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** Obal sudu dané velikosti z katalogu. */
const sudZKatalogu = (obaly: Package[], objem: number): Package | undefined =>
  obaly.find((p) => p.kind === 'keg' && klicObjemu(p.volume_l) === klicObjemu(objem));

/** Lahev dané velikosti z katalogu. */
const lahevZKatalogu = (obaly: Package[], objem: number): Package | undefined =>
  obaly.find((p) => p.kind === 'bottle' && klicObjemu(p.volume_l) === klicObjemu(objem));

/** Všechny záznamy šarže, i skryté — sudy se mění na všech najednou. */
const clenoveSarze = (radek: RadekTabulky, ctx: KontextPlanu): EntryRow[] =>
  ctx.zaznamy.filter((r) => ctx.getBatchId(r) === radek.klic);

/**
 * Změna počtu lahví v buňce (řádek × sloupec lahví).
 *
 *  - buňka má jeden záznam: přepíše se počet, 0 záznam smaže,
 *  - buňka je prázdná: vznikne nový záznam ve STEJNÉ šarži (stejný `created_at`
 *    a stejný zdroj ze sudů), takže skladová kniha sud neodečte podruhé,
 *  - buňka má záznamů víc (stejný obal víckrát v jedné šarži — stává se u
 *    dat z Excelu): nejde říct, který z nich se má změnit, proto se upravují
 *    zvlášť.
 */
export function planLahve(radek: RadekTabulky, objem: number, text: unknown, ctx: KontextPlanu): Plan {
  const n = celeCislo(text);
  if (n === null) return chybaPlanu(NEPLATNE_CISLO);
  const bunka = radek.lahve.find((b) => b.objem === klicObjemu(objem));
  if (!bunka) return chybaPlanu(`Sloupec ${popisObjemu(objem)} v tabulce není.`);
  const kdo = `${radek.beerName} · ${popisObjemu(objem)}`;

  if (bunka.zaznamy.length > 1) {
    return chybaPlanu(`${kdo}: v tomhle sloupci je ${bunka.zaznamy.length} záznamů — uprav je zvlášť (tužka u řádku).`);
  }

  if (bunka.zaznamy.length === 1) {
    const z = bunka.zaznamy[0];
    if (n === Number(z.quantity)) return nic;
    if (n === 0) {
      return { ok: true, operace: { typ: 'delete', zaznamy: [z] }, popis: `Smazáno: ${kdo} × ${z.quantity} ks` };
    }
    return { ok: true, operace: { typ: 'update', ids: [z.id], zmena: { quantity: n } }, popis: `${kdo}: ${z.quantity} → ${n} ks` };
  }

  if (n === 0) return nic;
  const obal = lahevZKatalogu(ctx.obaly, objem);
  if (!obal) return chybaPlanu(`Obal ${popisObjemu(objem)} není v katalogu obalů.`);
  const vzor = radek.nositel ?? radek.zaznamy[0];
  if (!vzor) return chybaPlanu('Řádek už neexistuje — načti přehled znovu.');
  if (!vzor.created_at) return chybaPlanu('Starší zápis bez času vzniku — lahve přidej přes tužku u řádku.');
  const nove: NovyZaznam = {
    entry_date: vzor.entry_date,
    beer_id: vzor.beer_id,
    beer_name: vzor.beer_name,
    package_id: obal.id,
    package_label: obal.label ?? null,
    quantity: n,
    // Stejný zdroj ze sudů jako u ostatních lahví šarže (konvence: každý
    // záznam šarže ho nese celý) a stejný čas vzniku, ať zůstane jedna šarže.
    kegs_used: vzor.kegs_used ?? null,
    kegs_used_package_id: vzor.kegs_used_package_id ?? null,
    source_volume_l: vzor.source_volume_l ?? null,
    note: radek.poznamka,
    created_at: vzor.created_at,
  };
  return { ok: true, operace: { typ: 'insert', radky: [nove] }, popis: `Přidáno: ${kdo} × ${n} ks` };
}

/**
 * Změna počtu sudů v buňce (řádek × sloupec sudů).
 *
 * Šarže nese JEDEN zdroj (velikost + počet), proto:
 *  - buňka velikosti, kterou šarže už má: mění se počet (0 = bez sudu),
 *  - buňka jiné velikosti: sudy se PŘESUNOU do téhle velikosti (stejný počet
 *    jako zadáš) — v původním sloupci pak nic nezůstane. Druhý sud jiné
 *    velikosti vedle prvního je „Další sud" (lahve se mezi sudy rozpočítají),
 *  - šarže s počtem sudů bez velikosti: klepnutí na sloupec velikost doplní.
 *
 * Mění se VŠECHNY záznamy šarže včetně skrytých — skladová kniha sourozence
 * pozná podle shodného počtu a velikosti sudu a jeden s jiným číslem by se
 * odečetl podruhé.
 */
export function planSudy(radek: RadekTabulky, objem: number, text: unknown, ctx: KontextPlanu): Plan {
  const n = celeCislo(text);
  if (n === null) return chybaPlanu(NEPLATNE_CISLO);
  const cil = sudZKatalogu(ctx.obaly, objem);
  if (!cil) return chybaPlanu(`Sud ${popisObjemu(objem)} není v katalogu obalů.`);
  const clenove = clenoveSarze(radek, ctx);
  if (clenove.length === 0) return chybaPlanu('Řádek už neexistuje — načti přehled znovu.');
  const kdo = `${radek.beerName} · sud ${popisObjemu(objem)}`;

  const stejnaVelikost = radek.sudPkgId === cil.id;
  if (n === 0) {
    // Vymazání buňky, ve které nic není (jiná velikost), nic neruší.
    if (!(stejnaVelikost || radek.chybiVelikost)) return nic;
    if (radek.sudu === 0) return nic;
    return {
      ok: true,
      operace: { typ: 'update', ids: clenove.map((r) => r.id), zmena: { kegs_used: null, source_volume_l: null } },
      popis: `${radek.beerName}: sudy odebrány (bez sudu)`,
    };
  }

  if (stejnaVelikost && n === radek.sudu) return nic;

  if (!stejnaVelikost) {
    // Druhá šarže téže dávky (dva sudy různé velikosti) už tuhle velikost má —
    // sloučením by skladová kniha odečetla jen jednu z nich.
    const vzor = clenove[0];
    const kolize = ctx.zaznamy.some((r) =>
      !clenove.includes(r)
      && r.created_at === vzor.created_at
      && r.beer_id === vzor.beer_id
      && r.entry_date === vzor.entry_date
      && r.kegs_used_package_id === cil.id);
    if (kolize) return chybaPlanu('Tahle dávka už má sud této velikosti — uprav radši počet u něj.');
  }

  return {
    ok: true,
    operace: {
      typ: 'update',
      ids: clenove.map((r) => r.id),
      zmena: { kegs_used: n, kegs_used_package_id: cil.id, source_volume_l: n * Number(cil.volume_l) },
    },
    popis: `${kdo}: ${n}×`,
  };
}

/** Smazání celého řádku = všech jeho (viditelných) záznamů. */
export function planSmazaniRadku(radek: RadekTabulky): Plan {
  if (radek.zaznamy.length === 0) return nic;
  const kolik = radek.zaznamy.length;
  return {
    ok: true,
    operace: { typ: 'delete', zaznamy: radek.zaznamy },
    popis: `Smazáno: ${radek.beerName} (${kolik} ${kolik === 1 ? 'záznam' : kolik < 5 ? 'záznamy' : 'záznamů'})`,
  };
}

export type PivoProPlan = { id: string; name: string };

/**
 * Přesun celého řádku na jiný den nebo k jinému pivu. Mění se všechny záznamy
 * šarže včetně skrytých, ať zůstane šarže pohromadě.
 */
export function planDatumPivo(
  radek: RadekTabulky,
  zmena: { datum: string; beerId: string },
  piva: PivoProPlan[],
  ctx: KontextPlanu,
): Plan {
  if (!jeDatum(zmena.datum)) return chybaPlanu('Datum není ve správném tvaru.');
  const pivo = piva.find((b) => b.id === zmena.beerId);
  if (!pivo) return chybaPlanu('Vyber pivo.');
  if (zmena.datum === radek.datum && zmena.beerId === radek.beerId) return nic;
  const clenove = clenoveSarze(radek, ctx);
  if (clenove.length === 0) return chybaPlanu('Řádek už neexistuje — načti přehled znovu.');
  return {
    ok: true,
    operace: {
      typ: 'update',
      ids: clenove.map((r) => r.id),
      zmena: { entry_date: zmena.datum, beer_id: pivo.id, beer_name: pivo.name },
    },
    popis: `${pivo.name}: přesunuto na ${Number(zmena.datum.slice(8, 10))}. ${Number(zmena.datum.slice(5, 7))}.`,
  };
}
