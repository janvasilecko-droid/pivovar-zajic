// 📥 Podklady pro hloubkový audit — jedno načtení, ze kterého žijí všechny kontroly.
// ---------------------------------------------------------------------------
// Odděleno od hloubkovyAudit.ts schválně: tam jsou samé čisté funkce, které
// jdou otestovat na vymyšlených datech. Tady je jediné místo, kde audit sahá
// do databáze — takže když se změní název sloupce, opravuje se to na jednom
// místě a testy kontrol to nerozhodí.
//
// Skladovou knihu si audit NENAČÍTÁ SÁM (viz skladovaKnihaData.ts). Kdyby si
// psal vlastní seznam sloupců, mohl by se rozejít s tím, co čtou obrazovky —
// a audit, který porovnává jiná data než ta, co má kontrolovat, neznamená nic.
import { supabase, fetchAllRows } from './supabase';
import { expectedForMonth, stockForMonth } from './stockLedger';
import { nactiSkladovouKnihu } from './skladovaKnihaData';
import { obdobiAuditu, type VstupAuditu } from './hloubkovyAudit';

export type RezimAuditu = 'tyden' | 'mesic';

/**
 * Načte všechno, co audit potřebuje, a poskládá z toho vstup.
 *
 * @param rezim  týden (od pondělí) nebo celý měsíc
 * @param dnesISO dnešní datum, YYYY-MM-DD
 */
export async function nactiPodkladyAuditu(rezim: RezimAuditu, dnesISO: string): Promise<VstupAuditu> {
  const { od, do: doDne, mesic } = obdobiAuditu(rezim, dnesISO);

  const [
    kniha,
    { data: objednavky }, { data: polozky },
    { data: zpravy }, { data: prijemLog },
    { data: most }, { count: neodeslane }, { data: posledniPrijem },
  ] = await Promise.all([
    nactiSkladovouKnihu(),

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

  // Počet položek na objednávku — prázdná objednávka se jinak nepozná.
  const polozekNaObjednavku = new Map<string, number>();
  for (const p of ((polozky as any[]) ?? [])) {
    polozekNaObjednavku.set(p.order_id, (polozekNaObjednavku.get(p.order_id) ?? 0) + 1);
  }

  const jmenoPiva = new Map(kniha.piva.map((b) => [b.id, b.name]));
  const jmenoObalu = new Map(kniha.obaly.map((p) => [p.id, p.label]));

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

    kegging: kniha.kegging,
    bottling: kniha.bottling,
    znamaPiva: new Set(kniha.piva.map((b) => b.id)),
    znameObaly: new Set(kniha.obaly.map((p) => p.id)),

    // Obě strany porovnání ze stejné knihy — viz auditSkladu.ts.
    inventuraLedger: expectedForMonth(kniha.pohyby, mesic, true),
    skladLedger: stockForMonth(kniha.pohyby, mesic),
    popisPolozky: (klic: string) => {
      const [beerId, pkgId] = klic.split('__');
      return `${jmenoPiva.get(beerId) ?? 'neznámé pivo'} ${jmenoObalu.get(pkgId) ?? 'neznámý obal'}`;
    },

    inventurniRadky: kniha.inventura.map((r) => ({ entry_date: r.entry_date, note: r.note })),
  };
}

/** Posun data o N měsíců (záporné = zpět), zůstává YYYY-MM-DD. */
function posunOMesice(datumISO: string, oKolik: number): string {
  const d = new Date(datumISO + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + oKolik);
  return d.toISOString().slice(0, 10);
}
