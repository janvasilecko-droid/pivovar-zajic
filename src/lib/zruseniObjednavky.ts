// ↩️ Zrušení objednávky, která už je odepsaná ze skladu — vrácení DNEŠNÍM dnem.
// ---------------------------------------------------------------------------
// Z provozu 29. 9. 2026: „já je zruším a ty sudy vrať na sklad k dnešnímu dni,
// stejně jako by se vracela část sudů přes formulář, ať to nerozhází
// uzavřenou inventuru ze začátku týdne."
//
// Odpočet závozu (zavoz_deductions) z minulého týdne ZŮSTÁVÁ — patří do už
// uzavřeného týdne a jeho smazání by tu inventuru rozházelo. Místo toho se
// stejné kusy přičtou zpátky na sklad dnešním dnem, úplně stejným záznamem
// jako formulář „Vrácení piva" (inventory_adjustments s order_id, viz
// lib/vraceniZObjednavky.ts). Objednávka dostane stav storno a poznámku.
import { fetchAllRows } from './supabase';
import { platneVraceni, poznamkaVraceni, pripojPoznamku, zaznamyDorovnaniVraceni, type PolozkaVraceni } from './vraceniZObjednavky';

export type OdpocetObjednavky = { order_id: string; beer_id: string | null; package_id: string | null; quantity: number };
export type PolozkaProNazev = { beer_id: string | null; beer_name: string | null; package_id: string | null; package_label: string | null };

/** Odepsané kusy jedné objednávky → položky k vrácení (po pivu a obalu). */
export function vraceniZOdpoctu(odpocty: OdpocetObjednavky[], polozky: PolozkaProNazev[]): PolozkaVraceni[] {
  const soucty = new Map<string, PolozkaVraceni>();
  for (const o of odpocty) {
    if (!o.beer_id || !o.package_id || !(Number(o.quantity) > 0)) continue;
    const klic = `${o.beer_id}__${o.package_id}`;
    const nazev = polozky.find((p) => p.beer_id === o.beer_id && p.package_id === o.package_id);
    const r = soucty.get(klic) ?? {
      beer_id: o.beer_id,
      beer_name: nazev?.beer_name ?? null,
      package_id: o.package_id,
      package_label: nazev?.package_label ?? null,
      pocet: 0,
    };
    r.pocet += Number(o.quantity);
    soucty.set(klic, r);
  }
  return platneVraceni([...soucty.values()]);
}

/** Záznamy vrácení (inventory_adjustments) a nová poznámka — čistý výpočet. */
export function zruseniSVracenim(
  objednavka: { id: string; note: string | null; place_name: string | null },
  vraceni: PolozkaVraceni[],
  dnes: string,
): { zaznamy: Record<string, unknown>[]; poznamka: string } {
  const zaznamy = zaznamyDorovnaniVraceni(vraceni, dnes, objednavka.place_name, objednavka.id)
    .map((z) => ({ ...z, reason: String(z.reason).replace(/^Vráceno z objednávky/, 'Zrušená objednávka, vráceno na sklad') }));
  const poznamka = pripojPoznamku(objednavka.note, `Zrušeno. ${poznamkaVraceni(vraceni, dnes)}`);
  return { zaznamy, poznamka };
}

/** Odpočty závozu vybraných objednávek (kolik už je odepsané ze skladu). */
export async function nactiOdpocty(ids: string[]): Promise<{ data: OdpocetObjednavky[]; chyba: string | null }> {
  if (ids.length === 0) return { data: [], chyba: null };
  const { data, error } = await fetchAllRows<OdpocetObjednavky>('zavoz_deductions', 'order_id,beer_id,package_id,quantity')
    .in('order_id', ids);
  return { data: (data ?? []) as OdpocetObjednavky[], chyba: error?.message ?? null };
}
