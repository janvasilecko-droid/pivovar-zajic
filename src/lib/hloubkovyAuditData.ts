// 📥 Podklady pro hloubkový audit — jedno načtení, ze kterého žijí všechny kontroly.
// ---------------------------------------------------------------------------
// Odděleno od hloubkovyAudit.ts schválně: tam jsou samé čisté funkce, které
// jdou otestovat na vymyšlených datech. Tady je jediné místo, kde se sahá do
// databáze — takže když se změní název sloupce, opravuje se to na jednom
// místě a testy kontrol to nerozhodí.
//
// Načítá se přes fetchAllRows, ne přes obyčejný select: Supabase vrátí nejvýš
// 1000 řádků a zbytek ZAHODÍ BEZ CHYBY. Audit, kterému chybí půlka pohybů,
// je horší než žádný — tvářil by se, že je všechno v pořádku.
import { supabase, fetchAllRows } from './supabase';
import { buildMovements, expectedForMonth, stockForMonth } from './stockLedger';
import { obdobiAuditu, type VstupAuditu } from './hloubkovyAudit';

export type RezimAuditu = 'tyden' | 'mesic';

type PivoProAudit = { id: string; name: string };
type ObalProAudit = { id: string; label: string; kind: string; volume_l: number };

/**
 * Načte všechno, co audit potřebuje, a poskládá z toho vstup.
 *
 * @param rezim  týden (od pondělí) nebo celý měsíc
 * @param dnesISO dnešní datum, YYYY-MM-DD
 */
export async function nactiPodkladyAuditu(rezim: RezimAuditu, dnesISO: string): Promise<VstupAuditu> {
  const { od, do: doDne, mesic } = obdobiAuditu(rezim, dnesISO);

  const [
    { data: beers }, { data: packages },
    { data: bt }, { data: kg }, { data: fa }, { data: fp }, { data: wo },
    { data: inv }, { data: adj }, { data: zd }, { data: ak }, { data: pf },
    { data: objednavky }, { data: polozky },
    { data: zpravy }, { data: prijemLog },
    { data: most }, { count: neodeslane }, { data: posledniPrijem },
  ] = await Promise.all([
    supabase.from('beers').select('id,name').order('sort_order'),
    supabase.from('packages').select('id,label,kind,volume_l').order('sort_order'),

    // Skladová kniha — přesně tytéž zdroje a sloupce jako Inventura a Sklad.
    // Kdyby se lišily, audit by porovnával jiná data než obrazovky, které má
    // kontrolovat, a jeho výsledek by nic neznamenal.
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

    // Objednávky — širší okno než období, aby šlo počítat rytmus odběratelů
    // a pokrytí proti minulému týdnu.
    fetchAllRows('orders', 'id,place_name,delivery_date,order_date,status,is_delivered').gte('order_date', posunOMesice(od, -3)),
    fetchAllRows('order_items', 'order_id'),

    // Zprávy: 90 dní zpátky. Kratší okno by u odběratele, co píše jednou za
    // tři týdny, nestačilo na spočítání jeho obvyklého rytmu.
    fetchAllRows('whatsapp_incoming', 'id,sender_name,created_at,status').gte('created_at', posunOMesice(od, -3)),
    fetchAllRows('whatsapp_prijem_log', 'created_at,vysledek,duvod,sender_name').gte('created_at', od),

    supabase.from('whatsapp_most_stav').select('naposledy,pripojeno').eq('id', 'most').maybeSingle(),
    supabase.from('whatsapp_neodeslane').select('id', { count: 'exact', head: true }).is('odeslano_at', null),
    supabase.from('whatsapp_prijem_log').select('created_at').order('created_at', { ascending: false }).limit(1),
  ]);

  // Ne celý `Package`/`Beer` — z číselníků se tahají jen sloupce, které audit
  // potřebuje (jméno pro popisek a kind/volume_l pro dohledání sudu
  // spotřebovaného na lahve). Vlastní typ je proto poctivější než přetypování
  // na plný katalogový záznam, který by tu z poloviny chyběl.
  const piva: PivoProAudit[] = (beers as PivoProAudit[]) ?? [];
  const obaly: ObalProAudit[] = (packages as ObalProAudit[]) ?? [];

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

  // Počet položek na objednávku — prázdná objednávka se jinak nepozná.
  const polozekNaObjednavku = new Map<string, number>();
  for (const p of ((polozky as any[]) ?? [])) {
    polozekNaObjednavku.set(p.order_id, (polozekNaObjednavku.get(p.order_id) ?? 0) + 1);
  }

  const jmenoPiva = new Map(piva.map((b) => [b.id, b.name]));
  const jmenoObalu = new Map(obaly.map((p) => [p.id, p.label]));

  return {
    od,
    do: doDne,
    mesic,

    tepMostu: (most as any) ?? null,
    posledniPrijem: ((posledniPrijem as any[]) ?? [])[0]?.created_at ?? null,
    zpravy: ((zpravy as any[]) ?? []).map((z) => ({
      id: z.id, sender_name: z.sender_name, created_at: z.created_at, status: z.status,
    })),
    neodeslaneCeka: neodeslane ?? 0,
    prijemLog: ((prijemLog as any[]) ?? []),

    objednavky: ((objednavky as any[]) ?? []).map((o) => ({
      id: o.id,
      place_name: o.place_name,
      delivery_date: o.delivery_date,
      order_date: o.order_date,
      status: o.status,
      is_delivered: o.is_delivered,
      pocetPolozek: polozekNaObjednavku.get(o.id) ?? 0,
    })),
    zacatekTydne: rezim === 'tyden' ? od : undefined,

    kegging: ((kg as any[]) ?? []),
    bottling: ((bt as any[]) ?? []),
    znamaPiva: new Set(piva.map((b) => b.id)),
    znameObaly: new Set(obaly.map((p) => p.id)),

    // Obě strany porovnání ze stejné knihy — viz auditSkladu.ts.
    inventuraLedger: expectedForMonth(pohyby, mesic, true),
    skladLedger: stockForMonth(pohyby, mesic),
    popisPolozky: (klic: string) => {
      const [beerId, pkgId] = klic.split('__');
      return `${jmenoPiva.get(beerId) ?? 'neznámé pivo'} ${jmenoObalu.get(pkgId) ?? 'neznámý obal'}`;
    },

    inventurniRadky: ((inv as any[]) ?? []).map((r) => ({ entry_date: r.entry_date, note: r.note })),
  };
}

/** Posun data o N měsíců (záporné = zpět), zůstává YYYY-MM-DD. */
function posunOMesice(datumISO: string, oKolik: number): string {
  const d = new Date(datumISO + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + oKolik);
  return d.toISOString().slice(0, 10);
}
