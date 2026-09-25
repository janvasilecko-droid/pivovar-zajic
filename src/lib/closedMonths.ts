/**
 * "Zavřít měsíc" — tvrdý zámek na objednávky a zápisy výroby/skladu za daný
 * měsíc. Skutečné vynucení je v databázi (RLS, viz migrace
 * 20261231090000_zavreny_mesic.sql) — appka tenhle modul používá jen k
 * ZOBRAZENÍ stavu (zamčeno/odemčeno) a k volání zavřít/otevřít, ne jako
 * jedinou obranu. Kdo by obešel appku a psal přímo přes REST, databáze ho
 * stejně odmítne.
 *
 * Z provozu 14. 9. 2026: "udělej, když dám zavřít měsíc, ať už nemůže nic
 * a nikdo sahat do objednávek a stáčení, jen budou k nahlížení, upravit je
 * může jen admin".
 */
import { supabase } from './supabase';

export type ZavrenyMesic = { month: string; closed_at: string; closed_by: string | null };

/** Je dané YYYY-MM v seznamu zavřených měsíců? */
export function jeMesicVSeznamuUzavren(closedMonths: Pick<ZavrenyMesic, 'month'>[], mesic: string): boolean {
  return closedMonths.some((m) => m.month === mesic);
}

export async function nactiZavreneMesice(): Promise<ZavrenyMesic[]> {
  const { data, error } = await supabase.from('closed_months').select('month, closed_at, closed_by');
  if (error) return [];
  return (data as ZavrenyMesic[]) ?? [];
}

/**
 * Zavře měsíc. Vrací chybovou hlášku, nebo `null` při úspěchu.
 * Databáze (RLS) dovolí jen admin/šéf/sládek/manažer — jiné roli appka
 * tlačítko vůbec neukáže, ale i kdyby, dostane se sem jasná chyba místo
 * tichého selhání.
 */
export async function zavriMesic(mesic: string): Promise<string | null> {
  const { error } = await supabase.from('closed_months').insert({ month: mesic });
  if (error) {
    if (error.code === '23505') return null; // už zavřený (souběh) — není co hlásit
    return `Měsíc se nepodařilo zavřít: ${error.message}`;
  }
  return null;
}

/** Znovu otevře měsíc (zruší zámek). Vrací chybovou hlášku, nebo `null`. */
export async function otevriMesic(mesic: string): Promise<string | null> {
  const { error } = await supabase.from('closed_months').delete().eq('month', mesic);
  if (error) return `Měsíc se nepodařilo otevřít: ${error.message}`;
  return null;
}
