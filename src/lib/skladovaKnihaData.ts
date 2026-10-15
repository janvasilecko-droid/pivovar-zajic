// 📚 Načtení skladové knihy — jedno místo, odkud si ji berou všichni.
// ---------------------------------------------------------------------------
// Pohyby se skládají z deseti tabulek a u každé záleží na tom, které sloupce
// se natáhnou: `bottling` bez `kegs_used` neodečte sudy, `kegging` bez
// `cellar_tank_id` neubere objem ze sklepa. Když si ten seznam píše každá
// obrazovka po svém, dřív nebo později se rozejdou a dvě obrazovky ukážou nad
// týmiž daty jiná čísla — což je přesně ta třída chyby, kterou má skladová
// kniha vyloučit.
//
// Načítá se přes fetchAllRows, ne obyčejným selectem: Supabase vrátí nejvýš
// 1000 řádků a zbytek ZAHODÍ BEZ CHYBY. Kniha, které chybí půlka pohybů, je
// horší než žádná — tvářila by se, že je všechno v pořádku.
import { supabase } from './supabase';
import { buildMovements, type Movement } from './stockLedger';
import { nactiSdilenouTabulku } from './sdilenaData';
import { chybejiciZdroje, dataZPametiOd, NeuplnaDataError } from './zPameti';

export type PivoZKatalogu = { id: string; name: string; beer_color?: string | null; is_active?: boolean };
export type ObalZKatalogu = { id: string; label: string; kind: string; volume_l: number };

export type SkladovaKniha = {
  pohyby: Movement[];
  piva: PivoZKatalogu[];
  obaly: ObalZKatalogu[];
  /** Syrové řádky, které kromě knihy potřebují i kontroly auditu. */
  kegging: any[];
  bottling: any[];
  inventura: any[];
  /** Výdej a odpisy — audit z nich čte časy zápisu (zpětné zásahy do měsíce). */
  fasovani: any[];
  odpisy: any[];
  zavozy: any[];
  /**
   * Některý dotaz server nestihl a odpovědělo se z paměti telefonu (slabý
   * signál) — čísla jsou poslední známá, ne nutně aktuální. Obrazovka to má
   * říct nahlas (components/UpozorneniNaData.tsx).
   */
  zPameti?: boolean;
};

/**
 * Natáhne všechny zdroje skladové knihy a poskládá z nich pohyby.
 *
 * Vrací i katalogy a syrové řádky stáčení — kdo je potřebuje (audit kontroluje
 * stáčení bez tanku, týdenní inventura popisuje řádky jménem piva), nemusí
 * kvůli nim sahat do databáze podruhé.
 *
 * Když se NEKTERÝ zdroj nenačte (chyba serveru, vypadlé spojení uprostřed
 * stránkování), kniha se NEPOSKLÁDÁ a vyhodí `NeuplnaDataError`. Dřív se chybějící
 * tabulka tiše brala jako prázdná — a sklad pak ukázal číslo, ze kterého
 * chyběla třeba půlka odpočtů (15. 10. 2026: Jantar 50 l „na začátku 3"
 * místo 2). Špatné číslo je horší než žádné.
 */
export async function nactiSkladovouKnihu(): Promise<SkladovaKniha> {
  const zacatek = Date.now();
  const [vBeers, vPackages, vBt, vKg, vFa, vFp, vWo, vInv, vAdj, vZd, vAk, vPf] = await Promise.all([
    supabase.from('beers').select('id,name,beer_color,is_active').order('sort_order'),
    supabase.from('packages').select('id,label,kind,volume_l').order('sort_order'),

    nactiSdilenouTabulku('bottling'),
    nactiSdilenouTabulku('kegging'),
    nactiSdilenouTabulku('fasovani'),
    nactiSdilenouTabulku('fasovani_private'),
    nactiSdilenouTabulku('writeoffs'),
    nactiSdilenouTabulku('inventory'),
    nactiSdilenouTabulku('inventory_adjustments'),
    nactiSdilenouTabulku('zavoz_deductions'),
    nactiSdilenouTabulku('akce'),
    nactiSdilenouTabulku('keg_prefuk'),
  ]);

  const chybi = chybejiciZdroje({
    'piva': vBeers, 'obaly': vPackages,
    'stáčení lahví': vBt, 'stáčení KEG': vKg,
    'fasování': vFa, 'prodejna': vFp, 'odpisy': vWo,
    'inventura': vInv, 'opravy skladu': vAdj, 'závozy': vZd,
    'akce': vAk, 'přefuk': vPf,
  });
  if (chybi.length > 0) throw new NeuplnaDataError(chybi);

  const zPameti = dataZPametiOd(zacatek)
    || [vBt, vKg, vFa, vFp, vWo, vInv, vAdj, vZd, vAk, vPf].some((v) => v.zPameti === true);

  // Z katalogů se tahají jen sloupce, které kniha potřebuje (jméno pro popisek,
  // kind/volume_l pro dohledání sudu spotřebovaného na lahve). Vlastní typ je
  // proto poctivější než přetypování na plný katalogový záznam, který by tu
  // z poloviny chyběl.
  const piva: PivoZKatalogu[] = (vBeers.data as PivoZKatalogu[]) ?? [];
  const obaly: ObalZKatalogu[] = (vPackages.data as ObalZKatalogu[]) ?? [];
  const bt = (vBt.data as any[]) ?? [];
  const kg = (vKg.data as any[]) ?? [];
  const fa = (vFa.data as any[]) ?? [];
  const wo = (vWo.data as any[]) ?? [];
  const zd = (vZd.data as any[]) ?? [];
  const inv = (vInv.data as any[]) ?? [];

  const pohyby = buildMovements({
    inventoryRows: inv,
    bottlingRows: bt,
    keggingRows: kg,
    fasovaniRows: fa,
    prodejnaRows: (vFp.data as any[]) ?? [],
    writeoffsRows: wo,
    zavozDeductionRows: zd,
    akceRows: (vAk.data as any[]) ?? [],
    prefukRows: (vPf.data as any[]) ?? [],
    adjustmentRows: (vAdj.data as any[]) ?? [],
    packages: obaly as any,
  });

  return {
    pohyby,
    piva,
    obaly,
    kegging: kg,
    fasovani: fa,
    odpisy: wo,
    zavozy: zd,
    bottling: bt,
    inventura: inv,
    ...(zPameti ? { zPameti: true } : {}),
  };
}
