// ➖ Manko z inventury → odečet přímo ze stočených řádků (zápis do databáze).
// ---------------------------------------------------------------------------
// Plán (z kterých řádků a kolik) je v lib/odecteniZKegovani.ts; tady je jen
// jeho provedení — společné pro měsíční i týdenní inventuru, sudy i lahve.
//
// 30. 10. 2026: „to co mam stoceno musi byt shodne i s excelem… zadne
// minusove polozky." Dřív měsíční inventura a lahve psaly ZÁPORNÝ řádek;
// seznam i Excel ho schovaly a odečetly jen v „Celkem", takže řádky
// nesouhlasily se součtem. Teď se sníží stočené řádky téhož piva a obalu
// a co odečíst nejde (stočeno nebylo z čeho), se NEZAPÍŠE — to není chyba
// stáčení, ale ztráta, a patří do Dorovnání.
//
// Řádek se mění jen tehdy, když má pořád to množství, se kterým plán počítal
// (dva telefony u inventury naráz). Když zápis spadne v půlce, vrátí se, co
// se už změnilo — nezůstane polovičatý odečet.
import { fetchAllRows, supabase } from './supabase';
import { drziSudyDavky, konecMesiceData, planOdecteniZKegovani, zapocitaneRadky, zdrojeOdecteni } from './odecteniZKegovani';
import type { Movement } from './stockLedger';
import { jeVyrovnani } from './vyrovnani';

export type OdecetVstup = {
  tabulka: 'kegging' | 'bottling';
  beer_id: string;
  beer_name: string | null;
  package_id: string;
  package_label: string | null;
  /** Den inventury: odečítá se nejdřív z řádků toho dne, pak z dřívějších. */
  datum: string;
  kusy: number;
  /** Pohyby skladové knihy a očekávaný stav, se kterým inventura porovnává (viz zapocitaneRadky). */
  pohyby: Movement[];
  ocekavano: (pohyby: Movement[]) => number;
  /** Do deníku: týden kontroly (týdenní inventura). */
  tydenOd?: string | null;
};

export type OdecetVysledek = {
  tabulka: 'kegging' | 'bottling';
  odecteno: number;
  /** Kolik kusů odečíst nešlo — nic se za ně nezapsalo. */
  zbytek: number;
  /** Řádky, jak byly PŘED odečtem (snížené i smazané) — pro „Vrátit zpět". */
  puvodni: Record<string, any>[];
  /** Snížené řádky: id → nový počet. */
  snizene: Map<string, number>;
  denikId: string | null;
};

/** Řádky stáčení jednoho piva v měsíci, ze kterých se smí odečítat. */
function lzeOdecitat(r: any, packageId: string): boolean {
  return r.package_id === packageId
    // „Stočeno" u objednávky by plán vrátil mezi nestočené; vlastní sudy
    // odběratele do skladu vůbec nepatří.
    && !r.order_item_id
    && !String(r.note ?? '').includes('[mimo-sklad]');
}

export async function odectiZeStocenych(v: OdecetVstup): Promise<OdecetVysledek> {
  const od = `${v.datum.slice(0, 7)}-01`;
  const doDne = konecMesiceData(v.datum);
  // U lahví všechny obaly piva — sourozenci z dávky nesou sudy (drziSudyDavky).
  let dotaz = fetchAllRows<any>(v.tabulka, '*').eq('beer_id', v.beer_id).gte('entry_date', od).lte('entry_date', doDne);
  if (v.tabulka === 'kegging') dotaz = dotaz.eq('package_id', v.package_id);
  const { data, error } = await dotaz;
  if (error) throw new Error(error.message);
  const vse = (data ?? []) as any[];
  const radky = vse.filter((r) => lzeOdecitat(r, v.package_id));
  const povolene = zapocitaneRadky(v.pohyby, v.tabulka === 'kegging' ? 'kegovani' : 'staceni', v.beer_id, v.package_id, radky, v.ocekavano);
  const plan = planOdecteniZKegovani(radky, v.datum, v.kusy, {
    povolene,
    drzet: v.tabulka === 'bottling' ? drziSudyDavky(vse) : undefined,
  });

  const podleId = new Map(radky.map((r) => [r.id as string, r]));
  const vysledek: OdecetVysledek = {
    tabulka: v.tabulka, odecteno: 0, zbytek: plan.zbytek, puvodni: [], snizene: new Map(), denikId: null,
  };
  try {
    for (const u of plan.upravit) {
      const r = podleId.get(u.id)!;
      const { data: zmenene, error: e } = await supabase.from(v.tabulka)
        .update({ quantity: u.quantity }).eq('id', u.id).eq('quantity', r.quantity).select('id');
      if (e) throw new Error(e.message);
      if (!zmenene?.length) throw new Error('Řádek stáčení se mezitím změnil — načti obrazovku znovu.');
      vysledek.puvodni.push(r);
      vysledek.snizene.set(u.id, u.quantity);
      vysledek.odecteno += Number(r.quantity) - u.quantity;
    }
    for (const id of plan.smazat) {
      const r = podleId.get(id)!;
      const { data: smazane, error: e } = await supabase.from(v.tabulka)
        .delete().eq('id', id).eq('quantity', r.quantity).select('id');
      if (e) throw new Error(e.message);
      if (!smazane?.length) throw new Error('Řádek stáčení se mezitím změnil — načti obrazovku znovu.');
      vysledek.puvodni.push(r);
      vysledek.odecteno += Number(r.quantity);
    }
  } catch (e) {
    const proc = e instanceof Error ? e.message : String(e);
    try {
      await vratOdecet(vysledek);
    } catch (e2) {
      throw new Error(`${proc} Část odečtu se nepodařilo vrátit (${e2 instanceof Error ? e2.message : String(e2)}) — zkontroluj Stáčení.`);
    }
    throw new Error(proc);
  }

  if (vysledek.odecteno > 0) {
    // Deník (stoceni_upravy) je stopa, ne podmínka — když zápis neprojde
    // (oprávnění, chybí tabulka), odečet platí dál. Smazané řádky se do něj
    // ukládají celé, ať jdou dohledat.
    // `vyrovnani` = odečetlo se z řádku, který sám vznikl srovnáním inventury
    // téhož měsíce („Doplněno z inventury …") — sloupec „Vyrovnáno" ho už
    // vidí přes poznámku, z deníku se pak nepočítá podruhé (sOdectyZDeniku).
    const zdroje = zdrojeOdecteni(plan, radky).map((z) => ({
      ...z,
      ...(jeVyrovnani(podleId.get(z.id)?.note, v.datum.slice(0, 7)) ? { vyrovnani: true } : {}),
      ...(z.po === 0 ? { radek: podleId.get(z.id) } : {}),
    }));
    try {
      const { data: d } = await supabase.from('stoceni_upravy').insert([{
        mesic: v.datum.slice(0, 7), entry_date: v.datum, beer_id: v.beer_id, beer_name: v.beer_name,
        package_id: v.package_id, package_label: v.package_label, druh: 'odecteno', kusu: vysledek.odecteno,
        zdroje, tyden_od: v.tydenOd ?? null,
      }]).select('id');
      vysledek.denikId = (d as { id: string }[] | null)?.[0]?.id ?? null;
    } catch { /* deník je doplněk */ }
  }
  return vysledek;
}

/** „Vrátit zpět": snížené řádky dostanou původní počet, smazané se vrátí celé. */
export async function vratOdecet(v: OdecetVysledek): Promise<void> {
  for (const r of v.puvodni) {
    const po = v.snizene.get(r.id);
    if (po !== undefined) {
      const { error } = await supabase.from(v.tabulka).update({ quantity: r.quantity }).eq('id', r.id).eq('quantity', po);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from(v.tabulka).insert([r]);
      if (error) throw new Error(error.message);
    }
  }
  if (v.denikId) {
    try { await supabase.from('stoceni_upravy').delete().eq('id', v.denikId); } catch { /* jen stopa */ }
  }
}

/** Hláška po odečtu — kolik se odečetlo a co zbylo k dorovnání. */
export function hlaskaOdectu(v: Pick<OdecetVysledek, 'odecteno' | 'zbytek'>, kde: string): string {
  const zaklad = v.odecteno > 0 ? `Odečteno ${v.odecteno} ks ze stočených řádků (${kde}).` : `${kde}: nebylo z čeho odečíst.`;
  return v.zbytek > 0
    ? `${zaklad} Zbylých ${v.zbytek} ks se od posledního počítání tolik nestočilo — není to chyba stáčení, zadej je do Dorovnání.`
    : zaklad;
}
