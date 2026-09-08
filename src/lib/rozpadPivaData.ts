/**
 * Načtení podkladů pro detailní rozpad piva (viz lib/rozpadPiva.ts).
 *
 * Odděleno od výpočtu schválně — stejně jako u hloubkového auditu: tady je
 * jediné čtení z databáze, tam samé čisté funkce, které jdou otestovat.
 *
 * Objednávky se čtou zvlášť, i když skladová kniha odečty už má: kniha nese
 * jen čísla, kdežto rozpad má u každého řádku říct KDO. Bez jména odběratele
 * by z něj byl další sloupec čísel, tedy přesně to, co se dohledávat nedá.
 */
import { fetchAllRows } from './supabase';
import { nactiSkladovouKnihu } from './skladovaKnihaData';
import { stockAtStartOfDay } from './stockLedger';
import { sestavRozpadPiva, type RozpadPiva } from './rozpadPiva';

export type PivoProRozpad = { id: string; name: string };

export type PodkladyRozpadu = {
  piva: PivoProRozpad[];
  /** Sestaví rozpad pro zvolené pivo a období — data se načtou jen jednou. */
  rozpad: (beerId: string, od: string, doDne: string) => RozpadPiva;
};

export async function nactiPodkladyRozpadu(): Promise<PodkladyRozpadu> {
  const [kniha, { data: objednavky }, { data: akce }, { data: zavozy }, { data: prodejna }] = await Promise.all([
    nactiSkladovouKnihu(),
    // Jména odběratelů k odečtům. Odečet drží vazbu na objednávku, takže se
    // jméno bere odtamtud — v odečtu samotném denormalizované není.
    fetchAllRows('orders', 'id,place_name'),
    fetchAllRows('akce', 'entry_date,nazev,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
    fetchAllRows('zavoz_deductions', 'deduct_date,beer_id,package_id,quantity,order_id'),
    fetchAllRows('fasovani_private', 'entry_date,beer_id,package_id,quantity'),
  ]);

  const jmenoOdberatele = new Map<string, string>(
    ((objednavky as { id: string; place_name: string | null }[]) ?? []).map((o) => [o.id, (o.place_name ?? '').trim()]),
  );
  const popisky = new Map(kniha.obaly.map((p) => [p.id, String(p.label ?? '').trim()]));
  const popisObalu = (id?: string | null) => (id && popisky.get(id)) || '?';

  const zdroje = {
    zavozy: ((zavozy as any[]) ?? []).map((r) => ({ ...r, odberatel: jmenoOdberatele.get(r.order_id) || '—' })),
    fasovani: kniha.fasovani,
    prodejna: ((prodejna as any[]) ?? []),
    odpisy: kniha.odpisy,
    akce: ((akce as any[]) ?? []),
    kegging: kniha.kegging,
    bottling: kniha.bottling,
  };

  return {
    piva: kniha.piva.map((b) => ({ id: b.id, name: b.name })),
    rozpad: (beerId, od, doDne) => {
      // Počáteční stav po obalech — ze skladové knihy, tedy stejné číslo
      // jako Sklad. Sečíst sudy s lahvemi do jednoho by dalo číslo, které
      // nesedí s ničím.
      const zacatek = stockAtStartOfDay(kniha.pohyby, od);
      const pocatecni: { obal: string; mnozstvi: number }[] = [];
      zacatek.forEach((line) => {
        if (line.beer_id !== beerId || line.qty === 0) return;
        pocatecni.push({ obal: popisObalu(line.package_id), mnozstvi: line.qty });
      });
      return sestavRozpadPiva(zdroje, beerId, od, doDne, pocatecni, popisObalu);
    },
  };
}

/** První a poslední den měsíce — výchozí období rozpadu. */
export function mesicJakoObdobi(mesic: string): { od: string; do: string } {
  const [rok, m] = mesic.split('-').map(Number);
  const posledni = new Date(Date.UTC(rok, m, 0)).getUTCDate();
  return { od: `${mesic}-01`, do: `${mesic}-${String(posledni).padStart(2, '0')}` };
}
