/**
 * ✅ Odškrtávání položek objednávky (připraveno / stočeno) — zápis na server.
 * ---------------------------------------------------------------------------
 * Z provozu 14. 10. 2026: „nejde mi označovat, že mám připravený lahve" —
 * v Rozvozu → Co naložit, na telefonu se slabým signálem (E, pár KB/s).
 * Odškrtnutí se ukázalo až po odpovědi serveru a pak se při přenačtení ze
 * staré mezipaměti vrátilo zpátky (viz nedavneProslyZapisy v offline.ts).
 *
 * Pravidla pro obrazovky (Rozvoz, Objednávky) jsou tady na jednom místě:
 *   • nejdřív se překreslí, pak se ukládá (useOdskrtavani.ts),
 *   • celá nakládka (víc položek) se ukládá JEDNÍM dotazem, ne jedním na položku
 *     — na slabém spojení by si desítky souběžných dotazů navzájem braly šířku,
 *   • zápisy jdou na server ve stejném pořadí, v jakém se klepalo.
 */
import { supabase } from './supabase';
import { vseHotovo, type OdskrtavatelnaPolozka, type PriznakPolozky } from './polozkyObjednavky';

export type CilOdskrtnuti = { orderId: string; itemId: string };

/** Kolik id se pošle v jednom dotazu (adresa s `in.(…)` nesmí být nekonečně dlouhá). */
const DAVKA = 40;

/** Mapa položek (objednávka → položky) s nastaveným příznakem u vybraných položek. Původní se nemění. */
export function nastavPriznakPolozek<T extends { id: string }>(
  items: Record<string, T[]>,
  cile: CilOdskrtnuti[],
  klic: PriznakPolozky,
  hodnota: boolean,
): Record<string, T[]> {
  const poObjednavkach = new Map<string, Set<string>>();
  for (const c of cile) {
    const ids = poObjednavkach.get(c.orderId) ?? new Set<string>();
    ids.add(c.itemId);
    poObjednavkach.set(c.orderId, ids);
  }
  const vysledek: Record<string, T[]> = { ...items };
  for (const [orderId, ids] of poObjednavkach) {
    vysledek[orderId] = (items[orderId] ?? []).map((x) => (ids.has(x.id) ? { ...x, [klic]: hodnota } : x));
  }
  return vysledek;
}

/**
 * Objednávky, kterým se po odškrtnutí změní „celá objednávka je připravená".
 * Vrací jen ty, u kterých se příznak OPRAVDU mění (ostatní se nezapisují).
 * Prázdná objednávka hotová není (vseHotovo).
 */
export function zmenyPripravenostiObjednavek(
  items: Record<string, (OdskrtavatelnaPolozka & { id: string })[]>,
  orders: { id: string; is_prepared?: boolean | null }[],
  orderIds: string[],
): { orderId: string; hotovo: boolean }[] {
  const zmeny: { orderId: string; hotovo: boolean }[] = [];
  for (const orderId of new Set(orderIds)) {
    const o = orders.find((x) => x.id === orderId);
    if (!o) continue;
    const hotovo = vseHotovo(items[orderId] ?? [], 'is_prepared');
    if (hotovo !== !!o.is_prepared) zmeny.push({ orderId, hotovo });
  }
  return zmeny;
}

let poradi: Promise<unknown> = Promise.resolve();

/**
 * Zápisy odškrtávání jdou na server jeden za druhým, ve stejném pořadí, v jakém
 * se klepalo. Zaškrtnout a hned odškrtnout by se jinak (dva souběžné dotazy
 * po slabém spojení) mohlo na serveru prohodit a zůstalo by zaškrtnuté.
 */
export function vPoradi<T>(ukol: () => Promise<T>): Promise<T> {
  const dalsi = poradi.then(ukol, ukol);
  poradi = dalsi.catch(() => undefined);
  return dalsi;
}

const davky = <T>(pole: T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < pole.length; i += DAVKA) out.push(pole.slice(i, i + DAVKA));
  return out;
};

/** Nastaví příznak u položek (jeden dotaz na dávku id). Vrací text chyby, nebo null. */
export async function ulozPriznakPolozek(klic: PriznakPolozky, itemIds: string[], hodnota: boolean): Promise<string | null> {
  for (const skupina of davky([...new Set(itemIds)])) {
    const { error } = await supabase.from('order_items').update({ [klic]: hodnota }).in('id', skupina);
    if (error) return error.message;
  }
  return null;
}

/** Zapíše „celá objednávka připravená" tam, kde se změnila (nejvýš dva dotazy: ano / ne). */
export async function ulozPripravenostObjednavek(zmeny: { orderId: string; hotovo: boolean }[]): Promise<string | null> {
  for (const hotovo of [true, false]) {
    for (const skupina of davky(zmeny.filter((z) => z.hotovo === hotovo).map((z) => z.orderId))) {
      const { error } = await supabase.from('orders').update({ is_prepared: hotovo }).in('id', skupina);
      if (error) return error.message;
    }
  }
  return null;
}
