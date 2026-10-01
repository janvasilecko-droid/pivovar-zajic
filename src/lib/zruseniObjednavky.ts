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
import { fetchAllRows, supabase } from './supabase';
import { businessDateISO } from './businessDate';
import { chyba, oznam, potvrd, uspech } from './toast';
import { platneVraceni, poznamkaVraceni, pripojPoznamku, vracenoPodleObjednavky, zaznamyDorovnaniVraceni, type PolozkaVraceni, type VraceniZaznam } from './vraceniZObjednavky';

export type OdpocetObjednavky = { order_id: string; beer_id: string | null; package_id: string | null; quantity: number };
export type PolozkaProNazev = { beer_id: string | null; beer_name: string | null; package_id: string | null; package_label: string | null };

/**
 * Odepsané kusy jedné objednávky → položky k vrácení (po pivu a obalu).
 * `uzVraceno` (klíč beer_id__package_id) = co se z ní už vrátilo dřív přes
 * formulář Vrácení piva — to se odečte, ať se nevrací podruhé.
 */
export function vraceniZOdpoctu(odpocty: OdpocetObjednavky[], polozky: PolozkaProNazev[], uzVraceno?: Map<string, number>): PolozkaVraceni[] {
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
  if (uzVraceno) {
    for (const [klic, r] of soucty) r.pocet = Math.max(0, r.pocet - (uzVraceno.get(klic) ?? 0));
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

/**
 * Zruší ty z vybraných objednávek, které už jsou odepsané ze skladu:
 * odpočet zůstane, kusy se vrátí dnešním dnem, objednávka → storno.
 * Vrací počet takto zrušených, null = žádná nebyla odepsaná (pak ať
 * volající zruší / smaže obyčejně), 0 = nepovedlo se nebo zrušeno uživatelem.
 */
export async function zrusOdepsaneSVracenim(
  vybrane: { id: string; note: string | null; place_name: string | null }[],
  polozkyPodleId: Record<string, PolozkaProNazev[]>,
  sePtat: boolean,
): Promise<number | null> {
  const { data: odpocty, chyba: chybaOdpoctu } = await nactiOdpocty(vybrane.map((o) => o.id));
  if (chybaOdpoctu) { chyba('Odpočty ze skladu se nepodařilo načíst: ' + chybaOdpoctu); return 0; }
  const odepsane = vybrane.filter((o) => odpocty.some((d) => d.order_id === o.id));
  if (odepsane.length === 0) return null;
  const kusu = odpocty.filter((d) => odepsane.some((o) => o.id === d.order_id)).reduce((n, d) => n + Number(d.quantity || 0), 0);
  if (sePtat && !(await potvrd(
    `${odepsane.length === 1 ? 'Objednávka už je odepsaná' : `${odepsane.length} objednávky už jsou odepsané`} ze skladu (${kusu} ks). `
    + 'Zruším ji a kusy vrátím na sklad DNEŠNÍM dnem — minulý týden a jeho inventura zůstanou beze změny. Pokračovat?',
  ))) return 0;
  // Co se z nich už vrátilo dřív (formulář Vrácení piva) — neodečíst by
  // znamenalo vrátit ty kusy podruhé.
  const { data: drivVraceno, error: chybaVraceni } = await fetchAllRows<VraceniZaznam & { order_id: string }>(
    'inventory_adjustments', 'order_id,beer_id,package_id,quantity',
  ).in('order_id', odepsane.map((o) => o.id));
  if (chybaVraceni) { chyba('Dřívější vrácení se nepodařilo načíst: ' + chybaVraceni.message); return 0; }

  const dnes = businessDateISO();
  let zruseno = 0;
  for (const o of odepsane) {
    const uzVraceno = vracenoPodleObjednavky(((drivVraceno ?? []) as (VraceniZaznam & { order_id: string })[]).filter((z) => z.order_id === o.id));
    const vraceni = vraceniZOdpoctu(odpocty.filter((d) => d.order_id === o.id), polozkyPodleId[o.id] ?? [], uzVraceno);
    const { zaznamy, poznamka } = zruseniSVracenim(o, vraceni, dnes);
    // ⚠️ 30. 9. 2026: dřív se tu vrácení zapsalo zvlášť a stav storno
    // přímým UPDATE — jenže změna stavu v databázi spustí srovnání odpočtů,
    // které u storna odpočet SMAZALO → kusy se vrátily DVAKRÁT (Maneo,
    // Mutěnice, 10l sudy). Teď obojí dělá jedna funkce v databázi (migrace
    // 20261231200000): v jedné transakci, jen jednou, a odpočet v uzavřeném
    // týdnu nechá být. Bez migrace se radši nic nezapíše.
    const { data, error } = await supabase.rpc('zrusit_odepsanou_objednavku', {
      p_order_id: o.id,
      p_zaznamy: zaznamy,
      p_poznamka: poznamka,
    });
    if (error) {
      chyba(chybiFunkce(error)
        ? 'Zrušení s vrácením potřebuje migraci 20261231200000 — spusť ji v Audit → Databázové migrace (nahoře). Nic se nezapsalo.'
        : `Zrušení (${o.place_name ?? 'objednávka'}) se nepovedlo: ${error.message}`);
      return zruseno;
    }
    if (data === true) zruseno++;
  }
  if (zruseno > 0) uspech(`Zrušeno ${zruseno} ${zruseno === 1 ? 'objednávka' : 'objednávky'}, kusy vráceny na sklad dnešním dnem.`);
  else oznam('Objednávka už byla zrušená — nic se znovu nevracelo.');
  return zruseno;
}

/** Funkce v databázi ještě není (migrace neproběhla). */
export function chybiFunkce(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(error.message ?? '');
}
