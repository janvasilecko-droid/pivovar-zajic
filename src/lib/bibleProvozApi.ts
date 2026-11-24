// 🍺 Načtení stavu sklepa pro AI sládka — jen čtení z hlavní databáze appky.
// ---------------------------------------------------------------------------
// Tanky (co je uvnitř, objem, od kdy), poslední sanitace, přečerpání za 14 dní
// a poslední uzavřené cykly se ztrátami. Z toho se skládá krátký text
// (bibleProvozKontext.ts), který chat přikládá k otázce. Nic se tu nezapisuje
// ani neopravuje. Tanky jsou podmínka: bez nich (chyba, prázdný Sklep) se nepřikládá
// nic; ostatní části při chybě jen chybí — lepší stav bez přečerpání než žádný.
import { supabase } from './supabase';
import { businessDateISO, posunDen } from './businessDate';
import {
  OKNO_PRECERPANI_DNI, textProvozu,
  type CyklusProKontext, type PrevodProKontext, type SanitaceProKontext, type TankProKontext,
} from './bibleProvozKontext';

export type NactenyProvoz =
  | { stav: 'ok'; text: string; cas: string }
  | { stav: 'prazdny' }
  | { stav: 'chyba' };

/** „10:45" v pražském čase. */
function casPraha(ted: Date): string {
  return new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ted);
}

type OdpovedDb = { data: unknown; error: unknown };

const bezChyby = <T,>(r: OdpovedDb): T[] => (r.error || !Array.isArray(r.data) ? [] : (r.data as T[]));
/** Vedlejší dotaz, který selže výjimkou (spadlé spojení), jen chybí — stav sklepa se přiloží i bez něj. */
const bezVyjimky = (dotaz: PromiseLike<OdpovedDb>): Promise<OdpovedDb> => Promise.resolve(dotaz).then((r) => r, () => ({ data: null, error: true }));

export async function nactiProvoz(ted: Date = new Date()): Promise<NactenyProvoz> {
  const dnes = businessDateISO(ted);
  try {
    const [tanky, sanitace, prevody, cykly] = await Promise.all([
      supabase.from('cellar_tanks').select('id,label,capacity_l,current_beer_name,current_volume_l,status,started_at,note,kegging_ended_at').order('label'),
      bezVyjimky(supabase.from('sanitation_logs').select('tank_id,method,method_label,created_at').not('tank_id', 'is', null).order('created_at', { ascending: false }).limit(300)),
      bezVyjimky(supabase.from('cellar_transfers').select('transfer_date,from_tank_id,to_tank_id,beer_name,volume_l,loss_l')
        .gte('transfer_date', posunDen(dnes, -OKNO_PRECERPANI_DNI)).order('transfer_date', { ascending: false }).limit(50)),
      bezVyjimky(supabase.from('cellar_tank_cycles').select('tank_label,beer_name,initial_volume_l,kegged_volume_l,loss_l,started_at,ended_at,duration_hours')
        .order('ended_at', { ascending: false }).limit(5)),
    ]);
    if (tanky.error || !Array.isArray(tanky.data)) return { stav: 'chyba' };
    const cas = casPraha(ted);
    const text = textProvozu({
      tanky: tanky.data as TankProKontext[],
      sanitace: bezChyby<SanitaceProKontext>(sanitace),
      prevody: bezChyby<PrevodProKontext>(prevody),
      cykly: bezChyby<CyklusProKontext>(cykly),
      dnes,
      cas,
    });
    return text ? { stav: 'ok', text, cas } : { stav: 'prazdny' };
  } catch {
    return { stav: 'chyba' };
  }
}
