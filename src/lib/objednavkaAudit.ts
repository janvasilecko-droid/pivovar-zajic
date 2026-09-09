// 📜 Historie změn objednávky — kdo a kdy přidal/upravil/smazal řádek.
//
// Appka měla dokonce hotovou tabulku `audit_log` v databázi (obecný audit
// nad libovolnou tabulkou), ale nikdo do ní nikdy nezapisoval — `lib/audit.ts`
// je jiná věc: lokální localStorage log jen s ukázkovými řádky, který appka
// nikde nevolá. Hledání duplicity nebo omylu v objednávce tak trvalo
// hodinu, protože se nedalo zjistit, KDO a KDY řádek přidal.
import { supabase } from './supabase';

export type AkceAudit = 'insert' | 'update' | 'delete';

export type ZmenaPolozky = {
  id: string;
  action: AkceAudit;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_by: string | null;
  changed_at: string;
};

/**
 * Zapíše jednu změnu položky objednávky. Nikdy nevyhodí výjimku — audit je
 * pomocná stopa, ne kritická cesta; selhání zápisu do `audit_log` nesmí
 * zablokovat samotnou změnu objednávky, která už proběhla.
 */
export async function zapisZmenuPolozky(
  orderId: string,
  action: AkceAudit,
  old_data: Record<string, any> | null,
  new_data: Record<string, any> | null,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from('audit_log').insert({
      table_name: 'order_items',
      record_id: orderId,
      action,
      old_data,
      new_data,
      changed_by: data?.user?.email ?? null,
    });
  } catch {
    // Viz komentář výš — ticho je tu záměr.
  }
}

export async function nactiHistoriiObjednavky(orderId: string): Promise<ZmenaPolozky[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, action, old_data, new_data, changed_by, changed_at')
    .eq('table_name', 'order_items')
    .eq('record_id', orderId)
    .order('changed_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data as ZmenaPolozky[]) ?? [];
}

/** Popisek piva a obalu z dat uložených v `old_data`/`new_data`. */
function popisPolozky(d: Record<string, any> | null): string {
  if (!d) return '';
  const pivo = d.beer_name ?? '?';
  const obal = d.package_label ? ` ${d.package_label}` : '';
  const mnozstvi = d.quantity != null ? ` × ${d.quantity} ks` : '';
  return `${pivo}${obal}${mnozstvi}`;
}

/**
 * Poskládá jednu řádku historie do čitelné věty. Odděleno od `ZmenaPolozky`,
 * ať je to testovatelné bez databáze.
 */
export function popisZmenyPolozky(z: ZmenaPolozky): string {
  if (z.action === 'insert') return `Přidán řádek: ${popisPolozky(z.new_data)}`;
  if (z.action === 'delete') return `Smazán řádek: ${popisPolozky(z.old_data)}`;
  // update — ukázat, co konkrétně se změnilo, ne přepsat celý řádek znovu.
  const stare = z.old_data ?? {};
  const nove = z.new_data ?? {};
  const zmeny: string[] = [];
  if (stare.quantity !== undefined && nove.quantity !== undefined && stare.quantity !== nove.quantity) {
    zmeny.push(`množství ${stare.quantity} → ${nove.quantity}`);
  }
  if (stare.beer_name !== undefined && nove.beer_name !== undefined && stare.beer_name !== nove.beer_name) {
    zmeny.push(`pivo ${stare.beer_name ?? '?'} → ${nove.beer_name ?? '?'}`);
  }
  if (stare.package_label !== undefined && nove.package_label !== undefined && stare.package_label !== nove.package_label) {
    zmeny.push(`obal ${stare.package_label ?? '?'} → ${nove.package_label ?? '?'}`);
  }
  const co = zmeny.length > 0 ? zmeny.join(', ') : popisPolozky(nove);
  return `Upraven řádek (${popisPolozky(stare) || '?'}): ${co}`;
}
