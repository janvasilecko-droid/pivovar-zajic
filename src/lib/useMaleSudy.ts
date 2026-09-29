// 🛢️ Počty malých sudů z tabulky male_sudy (viz lib/maleSudy.ts).
// Sdílí obrazovka KEG (zadávání) a Objednávky (hlídání).
import { useEffect, useState } from 'react';
import { supabase, useRealtime, fetchAllRows } from './supabase';
import { hlidejMaleSudy, jeMalySud, type VysledekMalychSudu, type ObjednavkaProSudy, type PolozkaProSudy, type ObalProSudy } from './maleSudy';
import { chybiTabulka } from './chybyHlaseni';
import { businessDateISO } from './businessDate';

export function useMaleSudy(): {
  zasoba: Record<string, number>;
  nacteno: boolean;
  /** Tabulka ještě není v databázi (čeká migrace) — záložka to řekne. */
  chybiMigrace: boolean;
  ulozit: (packageId: string, pocet: number | null, kdo?: string | null) => Promise<string | null>;
} {
  const [zasoba, setZasoba] = useState<Record<string, number>>({});
  const [nacteno, setNacteno] = useState(false);
  const [chybiMigrace, setChybiMigrace] = useState(false);

  async function nacti() {
    const { data, error } = await supabase.from('male_sudy').select('package_id, pocet');
    if (error) {
      if (chybiTabulka(error)) setChybiMigrace(true);
      setNacteno(true);
      return;
    }
    const z: Record<string, number> = {};
    for (const r of (data as any[]) ?? []) z[r.package_id] = Number(r.pocet) || 0;
    // Jakmile je zadaný aspoň jeden malý sud, ostatní malé bez čísla = 0 —
    // „ručně zadané 1× 20 a 2× 15" znamená, že 10 l není žádný
    // (29. 9. 2026). Bez jediného zadaného počtu se nehlídá nic.
    if (Object.keys(z).length > 0) {
      const { data: obaly } = await supabase.from('packages').select('id, kind, volume_l');
      for (const o of ((obaly ?? []) as ObalProSudy[])) if (jeMalySud(o) && z[o.id] == null) z[o.id] = 0;
    }
    setZasoba(z);
    setChybiMigrace(false);
    setNacteno(true);
  }
  useEffect(() => { nacti().catch(() => setNacteno(true)); }, []);
  useRealtime(['male_sudy'], () => { nacti().catch(() => {}); });

  /** `pocet = null` → obal přestane hlídat (řádek se smaže). */
  async function ulozit(packageId: string, pocet: number | null, kdo?: string | null): Promise<string | null> {
    setZasoba((z) => {
      const dalsi = { ...z };
      if (pocet == null) delete dalsi[packageId]; else dalsi[packageId] = pocet;
      return dalsi;
    });
    const { error } = pocet == null
      ? await supabase.from('male_sudy').delete().eq('package_id', packageId)
      : await supabase.from('male_sudy').upsert(
        { package_id: packageId, pocet, updated_at: new Date().toISOString(), updated_by: kdo ?? null },
        { onConflict: 'package_id' },
      );
    if (error) { void nacti(); return error.message; }
    return null;
  }

  return { zasoba, nacteno, chybiMigrace, ulozit };
}


/**
 * Hlídání malých sudů nad OTEVŘENÝMI objednávkami — jeden výpočet pro
 * záložku Malé sudy i Objednávky, ať ukazují totéž.
 */
export function useHlidaniMalychSudu(zasoba: Record<string, number>, silaPodleId?: Map<string, number>): VysledekMalychSudu & { nacteno: boolean } {
  const [data, setData] = useState<{ o: ObjednavkaProSudy[]; p: PolozkaProSudy[] } | null>(null);
  async function nacti() {
    // Nezavezené a nestornované — to jsou ty, na které se sudy ještě chystají.
    // Staré nezavezené objednávky (závoz před dneškem) odfiltruje výpočet
    // (maleSudy.ts chystaSeOd) — tady jen nezavezené a nestornované.
    const { data: obj } = await fetchAllRows<any>('orders', 'id,status,is_delivered,delivery_date,order_date,created_at')
      .eq('is_delivered', false)
      .neq('status', 'storno');
    const o = ((obj as any[]) ?? []) as ObjednavkaProSudy[];
    const ids = o.map((x) => x.id);
    const { data: pol } = ids.length
      ? await fetchAllRows<any>('order_items', 'id,order_id,package_id,quantity,beer_id').in('order_id', ids)
      : { data: [] };
    setData({ o, p: ((pol as any[]) ?? []) as PolozkaProSudy[] });
  }
  // Dokud nikdo nenaklikal žádný počet, není co hlídat — objednávky se
  // zbytečně nenačítají (hook běží i na ploše kvůli dlaždici).
  const hlida = Object.keys(zasoba).length > 0;
  // Chyba načtení nesmí shodit obrazovku — hlídání pak jen chvíli chybí.
  const nactiBezpecne = () => { nacti().catch(() => {}); };
  useEffect(() => { if (hlida) nactiBezpecne(); }, [hlida]);
  useRealtime(['orders', 'order_items'], () => { if (hlida) nactiBezpecne(); });
  const vysledek = data ? hlidejMaleSudy(zasoba, data.o, data.p, silaPodleId, businessDateISO()) : { souhrn: [], nadPoPolozce: new Map<string, number>(), poPolozce: new Map<string, { kryto: number; chybi: number }>() };
  return { ...vysledek, nacteno: !!data };
}
