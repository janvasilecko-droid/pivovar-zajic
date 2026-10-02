// 🚚 Sklad → „Odejde": kolik kusů každého piva a obalu ještě odjede do konce
// tohoto týdne.
// ---------------------------------------------------------------------------
// Zadání 2. 10. 2026: „přepracuj sklad, ať je tam jen stav a odejde: odejde
// bude ukazovat, kolik daného obalu a druhu do konce týdne ještě odejde."
//
// Bere se po POLOŽKÁCH objednávek s dovozem v tomto týdnu (bez storna) a od
// každé se odečte, co z ní už fyzicky odjelo (zavoz_deductions podle
// order_item_id, do dneška včetně). Tyhle kusy už má Stav (skladová kniha)
// odečtené — odečíst je podruhé by byla stejná chyba, jakou kdysi měl plán
// stáčení (viz odecteneKusyPolozek v tydenniZbytek.ts). Odpočet datovaný až
// do budoucna se za odjeté nepovažuje: ve Stavu k dnešku ještě není.
import { stockKey } from './stockLedger';

export type ObjednavkaProOdchod = {
  id: string;
  order_date: string | null;
  delivery_date: string | null;
  status: string | null;
};
export type PolozkaProOdchod = {
  id: string;
  order_id: string;
  beer_id: string | null;
  package_id: string | null;
  quantity: number | string | null;
};
export type OdpocetProOdchod = {
  order_item_id?: string | null;
  deduct_date: string;
  quantity: number | string | null;
};

/** Den dovozu objednávky — datum závozu, a když chybí, datum objednávky. */
function denDovozu(o: ObjednavkaProOdchod): string {
  return (o.delivery_date || o.order_date || '').slice(0, 10);
}

/**
 * Klíč `beer_id__package_id` → kolik kusů ještě odjede v týdnu
 * `zacatekTydne`–`konecTydne` (YYYY-MM-DD). `dnes` = do kdy už odpočet platí.
 */
export function odejdeDoKonceTydne(
  objednavky: ObjednavkaProOdchod[],
  polozky: PolozkaProOdchod[],
  odpocty: OdpocetProOdchod[],
  { zacatekTydne, konecTydne, dnes }: { zacatekTydne: string; konecTydne: string; dnes: string },
): Map<string, number> {
  const tentoTyden = new Set(
    objednavky
      .filter((o) => o.status !== 'storno')
      .filter((o) => { const d = denDovozu(o); return d >= zacatekTydne && d <= konecTydne; })
      .map((o) => o.id),
  );

  const odjeloZPolozky = new Map<string, number>();
  for (const d of odpocty) {
    if (!d.order_item_id || String(d.deduct_date).slice(0, 10) > dnes) continue;
    odjeloZPolozky.set(d.order_item_id, (odjeloZPolozky.get(d.order_item_id) ?? 0) + Number(d.quantity || 0));
  }

  const out = new Map<string, number>();
  for (const p of polozky) {
    if (!tentoTyden.has(p.order_id) || !p.beer_id || !p.package_id) continue;
    const zbyva = Number(p.quantity || 0) - (odjeloZPolozky.get(p.id) ?? 0);
    if (zbyva <= 0) continue;
    const k = stockKey(p.beer_id, p.package_id);
    out.set(k, (out.get(k) ?? 0) + zbyva);
  }
  return out;
}
