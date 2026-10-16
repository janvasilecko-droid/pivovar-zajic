// 🗑️ Smazání řádku objednávky, který už je odepsaný ze skladu.
// ---------------------------------------------------------------------------
// Z provozu 16. 10. 2026: zdvojený řádek „Jantar 1,5 l × 5" v objednávce
// Restaurace na 12. 10. šel z detailu objednávky smazat jen na oko — zavezená
// položka drží odpočet ze skladu (zavoz_deductions, cizí klíč ON DELETE
// RESTRICT), DELETE spadl a řádek v databázi zůstal i s odpočtem. Množství jde
// přepsat jen na kladné číslo, takže zdvojený řádek se z objednávky dostat
// nedal a sklad zůstal odepsaný dvakrát.
//
// Pravidlo majitele z 29. 9. 2026 (lib/zruseniObjednavky.ts): odpočet
// z UPLYNULÉHO týdne zůstává — patří do už uzavřeného týdne a jeho smazání by
// uzavřenou inventuru rozházelo; kusy se tam vrací dnešním dnem. Proto se
// odpočet smí smazat spolu s řádkem jen tehdy, když je z tohoto týdne a
// zároveň z tohoto měsíce (týden přes přelom měsíců: měsíc může být už
// uzavřený): sklad se vrátí o odepsané kusy a žádná uzavřená inventura se
// nemění. U staršího odpočtu appka řádek nesmaže a řekne, co udělat místo toho.
//
// Odpočet jedné položky smí smazat jen úzká funkce smaz_odpocty_polozky
// (migrace 20261229030000, SECURITY DEFINER, kontrola práva na Objednávky) —
// stejná, kterou už používá mazání objednávek (lib/smazaniObjednavek.ts).
import { fetchAllRows, supabase } from './supabase';
import { pondeliTydne } from './duplicityObjednavek';

/** Odpočet ze skladu (zavoz_deductions) jedné položky objednávky. */
export type OdpocetRadku = { deduct_date: string | null; quantity: number | string | null };

export type PlanSmazaniOdepsaneho =
  /** Odpočty jsou z tohoto týdne a měsíce (nebo pozdější) — smí se smazat s řádkem; `kusu` se vrátí do skladu. */
  | { druh: 'smazat'; kusu: number }
  /** Aspoň jeden odpočet je z uplynulého týdne nebo měsíce (`nejstarsi` = jeho den, prázdné = bez data) — zůstává. */
  | { druh: 'uzavreny'; nejstarsi: string }
  /** Položka žádný odpočet nemá — smazání spadlo z jiného důvodu. */
  | { druh: 'bez-odpoctu' };

/** Spadlo smazání řádku na cizím klíči (řádek drží odpočet ze skladu)? */
export function jeChybaOdpoctu(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '23503' || /foreign key|violates|zavoz_deductions/i.test(error.message ?? '');
}

/**
 * Co s odepsaným řádkem. Odpočet bez data se bere jako starý (smazat se smí jen
 * to, o čem je jisté, že je z tohoto týdne a měsíce).
 */
export function planSmazaniOdepsaneho(odpocty: OdpocetRadku[], dnes: string): PlanSmazaniOdepsaneho {
  if (odpocty.length === 0) return { druh: 'bez-odpoctu' };
  const pondeli = pondeliTydne(dnes);
  const dny = odpocty.map((o) => String(o.deduct_date ?? '').slice(0, 10));
  const mesic = dnes.slice(0, 7);
  // Prázdné datum je abecedně před každým dnem, takže spadne mezi staré samo.
  const starsi = dny.filter((d) => d < pondeli || d.slice(0, 7) < mesic).sort();
  if (starsi.length > 0) return { druh: 'uzavreny', nejstarsi: starsi[0] };
  const kusu = odpocty.reduce((s, o) => s + (Number.isFinite(Number(o.quantity)) ? Number(o.quantity) : 0), 0);
  return { druh: 'smazat', kusu };
}

/** Odpočty ze skladu jedné položky objednávky. */
export async function nactiOdpoctyRadku(orderItemId: string): Promise<{ data: OdpocetRadku[]; chyba: string | null }> {
  const { data, error } = await fetchAllRows<OdpocetRadku>('zavoz_deductions', 'deduct_date,quantity')
    .eq('order_item_id', orderItemId);
  return { data: (data ?? []) as OdpocetRadku[], chyba: error?.message ?? null };
}

/**
 * Smaže odpočet položky a hned potom položku samu. Vrací text chyby, nebo null.
 * Pořadí je dané cizím klíčem; kdyby druhý krok selhal, zůstane řádek bez
 * odpočtu — hlášení to říká a hodinový odpis ze závozu (pg_cron, migrace
 * 20261231250000) odpočet zapíše znovu, takže se nic neztratí, jen se to
 * zopakuje.
 */
export async function smazRadekSOdpoctem(orderItemId: string): Promise<string | null> {
  const { error: chybaOdpoctu } = await supabase.rpc('smaz_odpocty_polozky', { p_order_item_id: orderItemId });
  if (chybaOdpoctu) return `Odpočet ze skladu se nepodařilo smazat: ${chybaOdpoctu.message}`;
  const { error } = await supabase.from('order_items').delete().eq('id', orderItemId);
  if (error) return `Odpočet ze skladu je smazaný, ale řádek se smazat nepodařilo (${error.message}). Zkus ho smazat znovu — jinak se odpočet do hodiny zapíše sám znovu.`;
  return null;
}
