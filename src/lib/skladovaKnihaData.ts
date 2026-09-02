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
import { supabase, fetchAllRows } from './supabase';
import { buildMovements, type Movement } from './stockLedger';

export type PivoZKatalogu = { id: string; name: string };
export type ObalZKatalogu = { id: string; label: string; kind: string; volume_l: number };

export type SkladovaKniha = {
  pohyby: Movement[];
  piva: PivoZKatalogu[];
  obaly: ObalZKatalogu[];
  /** Syrové řádky, které kromě knihy potřebují i kontroly auditu. */
  kegging: any[];
  bottling: any[];
  inventura: any[];
};

/**
 * Natáhne všechny zdroje skladové knihy a poskládá z nich pohyby.
 *
 * Vrací i katalogy a syrové řádky stáčení — kdo je potřebuje (audit kontroluje
 * stáčení bez tanku, týdenní inventura popisuje řádky jménem piva), nemusí
 * kvůli nim sahat do databáze podruhé.
 */
export async function nactiSkladovouKnihu(): Promise<SkladovaKniha> {
  const [
    { data: beers }, { data: packages },
    { data: bt }, { data: kg }, { data: fa }, { data: fp }, { data: wo },
    { data: inv }, { data: adj }, { data: zd }, { data: ak }, { data: pf },
  ] = await Promise.all([
    supabase.from('beers').select('id,name').order('sort_order'),
    supabase.from('packages').select('id,label,kind,volume_l').order('sort_order'),

    fetchAllRows('bottling', 'beer_id,package_id,quantity,entry_date,kegs_used,kegs_used_package_id,source_volume_l,note,created_at'),
    fetchAllRows('kegging', 'beer_id,package_id,quantity,entry_date,note,cellar_tank_id'),
    fetchAllRows('fasovani', 'beer_id,package_id,quantity,entry_date'),
    fetchAllRows('fasovani_private', 'beer_id,package_id,quantity,entry_date'),
    fetchAllRows('writeoffs', 'beer_id,package_id,quantity,entry_date'),
    fetchAllRows('inventory', 'beer_id,package_id,quantity,entry_date,note'),
    fetchAllRows('inventory_adjustments', 'beer_id,package_id,quantity,entry_date,created_at'),
    fetchAllRows('zavoz_deductions', 'deduct_date,beer_id,package_id,quantity'),
    fetchAllRows('akce', 'entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
    fetchAllRows('keg_prefuk', 'entry_date,beer_id,from_package_id,from_count,to_package_id,to_count'),
  ]);

  // Z katalogů se tahají jen sloupce, které kniha potřebuje (jméno pro popisek,
  // kind/volume_l pro dohledání sudu spotřebovaného na lahve). Vlastní typ je
  // proto poctivější než přetypování na plný katalogový záznam, který by tu
  // z poloviny chyběl.
  const piva: PivoZKatalogu[] = (beers as PivoZKatalogu[]) ?? [];
  const obaly: ObalZKatalogu[] = (packages as ObalZKatalogu[]) ?? [];

  const pohyby = buildMovements({
    inventoryRows: (inv as any[]) ?? [],
    bottlingRows: (bt as any[]) ?? [],
    keggingRows: (kg as any[]) ?? [],
    fasovaniRows: (fa as any[]) ?? [],
    prodejnaRows: (fp as any[]) ?? [],
    writeoffsRows: (wo as any[]) ?? [],
    zavozDeductionRows: (zd as any[]) ?? [],
    akceRows: (ak as any[]) ?? [],
    prefukRows: (pf as any[]) ?? [],
    adjustmentRows: (adj as any[]) ?? [],
    packages: obaly as any,
  });

  return {
    pohyby,
    piva,
    obaly,
    kegging: ((kg as any[]) ?? []),
    bottling: ((bt as any[]) ?? []),
    inventura: ((inv as any[]) ?? []),
  };
}
