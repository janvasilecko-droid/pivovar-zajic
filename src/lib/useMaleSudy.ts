// 🛢️ Počty malých sudů z tabulky male_sudy (viz lib/maleSudy.ts).
// Sdílí obrazovka KEG (zadávání) a Objednávky (hlídání).
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, useRealtime, fetchAllRows } from './supabase';
import {
  hlidejMaleSudy, jeMalySud, plneKZadani, pondeliTydne, prazdneMaleSudy, zadaniMalychSudu,
  type RadekMalychSudu, type VysledekMalychSudu, type ObjednavkaProSudy, type PolozkaProSudy, type ObalProSudy,
  type OdpocetProSudy, type ZadaniMalehoSudu, type VlastniStoceni,
} from './maleSudy';
import { chybiTabulka } from './chybyHlaseni';
import { businessDateISO } from './businessDate';
import { nactiSkladovouKnihu } from './skladovaKnihaData';
import { stockAsOf, type Movement } from './stockLedger';
import { vlastniSudyOdberatele } from './vlastniSudy';

export function useMaleSudy(): {
  /** Naklikané počty platné v tomhle týdnu (obal → kusy). */
  zasoba: Record<string, number>;
  /** Kdy byl který počet naklikaný — od té chvíle se odečítají odjeté objednávky. */
  zadanoKdy: Record<string, ZadaniMalehoSudu>;
  /** Obaly, u kterých se plné sudy skladem započítávají do objednávek. */
  zapocitatPlne: Set<string>;
  /** Volba „započítat plné" už je v databázi (migrace 20261231260100). */
  umiZapocitatPlne: boolean;
  nacteno: boolean;
  /** Tabulka ještě není v databázi (čeká migrace) — záložka to řekne. */
  chybiMigrace: boolean;
  /** Počty se nepodařilo načíst (síť) — záložka nesmí nabídnout „+" jako první zadání, přepsalo by uložené. */
  chybaNacteni: boolean;
  ulozit: (packageId: string, pocet: number | null, kdo?: string | null, volby?: { zachovatCas?: boolean }) => Promise<string | null>;
  nastavZapocitatPlne: (packageId: string, ano: boolean) => Promise<string | null>;
} {
  const [zasoba, setZasoba] = useState<Record<string, number>>({});
  const [zadanoKdy, setZadanoKdy] = useState<Record<string, ZadaniMalehoSudu>>({});
  const [zapocitatPlne, setZapocitatPlne] = useState<Set<string>>(new Set());
  const [umiZapocitatPlne, setUmiZapocitatPlne] = useState(false);
  const [nacteno, setNacteno] = useState(false);
  const [chybiMigrace, setChybiMigrace] = useState(false);
  const [chybaNacteni, setChybaNacteni] = useState(false);
  const radkyRef = useRef<RadekMalychSudu[]>([]);
  /** Počty se už aspoň jednou načetly. */
  const nactenoRef = useRef(false);

  async function nacti() {
    // Se sloupcem zapocitat_plne; dokud migrace neběží, bez něj (6. 10. 2026).
    let { data, error } = await supabase.from('male_sudy').select('package_id, pocet, updated_at, zapocitat_plne');
    const bezSloupce = !!error && (error.code === '42703' || /zapocitat_plne/.test(error.message ?? ''));
    if (bezSloupce) ({ data, error } = await supabase.from('male_sudy').select('package_id, pocet, updated_at') as any);
    if (error) {
      if (chybiTabulka(error)) setChybiMigrace(true);
      // Nepovedená obnova (slabý signál) nechá poslední načtené počty — chyba
      // se ukáže jen dokud se ještě nic nenačetlo (revize 1. 11. 2026).
      else if (!nactenoRef.current) setChybaNacteni(true);
      setNacteno(true);
      return;
    }
    nactenoRef.current = true;
    setChybaNacteni(false);
    setUmiZapocitatPlne(!bezSloupce);
    const radky = ((data as any[]) ?? []) as (RadekMalychSudu & { zapocitat_plne?: boolean })[];
    radkyRef.current = radky;
    setZapocitatPlne(new Set(radky.filter((r) => r.zapocitat_plne).map((r) => r.package_id)));
    // Počet platí jen v týdnu zadání (prazdneMaleSudy) — stočení ho neubírá; odjeté
    // objednávky od chvíle zadání odečte hlídání (useHlidaniMalychSudu, 1. 11. 2026).
    const dnes = businessDateISO();
    const naPrazskyDen = (iso: string) => businessDateISO(new Date(iso));
    const z = prazdneMaleSudy(radky, dnes, naPrazskyDen);
    const kdy = zadaniMalychSudu(radky, dnes, naPrazskyDen);
    // Jakmile je zadaný aspoň jeden malý sud, ostatní malé bez čísla = 0 —
    // „ručně zadané 1× 20 a 2× 15" znamená, že 10 l není žádný
    // (29. 9. 2026). Bez jediného zadaného počtu se nehlídá nic.
    if (Object.keys(z).length > 0) {
      const { data: obaly } = await supabase.from('packages').select('id, kind, volume_l');
      for (const o of ((obaly ?? []) as ObalProSudy[])) if (jeMalySud(o) && z[o.id] == null) z[o.id] = 0;
    }
    setZasoba(z);
    setZadanoKdy(kdy);
    setChybiMigrace(false);
    setNacteno(true);
  }
  useEffect(() => { nacti().catch(() => setNacteno(true)); }, []);
  useRealtime(['male_sudy', 'kegging'], () => { nacti().catch(() => {}); });

  /**
   * `pocet = null` → obal přestane hlídat (řádek se smaže).
   *
   * Nový počet = stav TEĎ: odjeté objednávky a plné sudy k zadání se počítají
   * od téhle chvíle (čas se uloží stejný, ať se číslo po načtení z databáze
   * nezmění). `zachovatCas` (+/− v záložce) je oprava naklikaného čísla o kus:
   * čas zadání zůstane, jinak by sudy stočené od zadání byly „plné k zadání"
   * a u „započítat plné" by K dispozici nafoukly (revize 1. 11. 2026). Bez
   * platného zadání z tohoto týdne je to i tak nové zadání.
   */
  async function ulozit(
    packageId: string,
    pocet: number | null,
    kdo?: string | null,
    volby: { zachovatCas?: boolean } = {},
  ): Promise<string | null> {
    const ted = new Date();
    const dnes = businessDateISO(ted);
    const stary = radkyRef.current.find((r) => r.package_id === packageId);
    const tydenStareho = stary?.updated_at && Number.isFinite(Date.parse(stary.updated_at))
      ? pondeliTydne(businessDateISO(new Date(stary.updated_at)))
      : null;
    const zachovat = pocet != null && !!volby.zachovatCas && tydenStareho != null && tydenStareho >= pondeliTydne(dnes);
    const cas = zachovat ? stary!.updated_at! : ted.toISOString();
    setZasoba((z) => {
      const dalsi = { ...z };
      if (pocet == null) delete dalsi[packageId]; else dalsi[packageId] = pocet;
      return dalsi;
    });
    if (!zachovat) {
      setZadanoKdy((z) => {
        const dalsi = { ...z };
        if (pocet == null) delete dalsi[packageId]; else dalsi[packageId] = { cas, den: dnes };
        return dalsi;
      });
    }
    // Počet z minulého týdne už neplatí (prazdneMaleSudy) — s novým počtem
    // se i „započítat plné" ptá znovu, ať se plné sudy nezapočtou potichu.
    const novyTyden = umiZapocitatPlne && tydenStareho != null && tydenStareho < pondeliTydne(dnes);
    if (novyTyden) setZapocitatPlne((z) => { const d = new Set(z); d.delete(packageId); return d; });
    // Další +/− hned po uložení (dřív, než dorazí obnova z databáze) musí
    // navázat na právě uložený čas, ne na ten z posledního načtení.
    const ostatni = radkyRef.current.filter((r) => r.package_id !== packageId);
    radkyRef.current = pocet == null ? ostatni : [...ostatni, { ...stary, package_id: packageId, pocet, updated_at: cas }];
    const { error } = pocet == null
      ? await supabase.from('male_sudy').delete().eq('package_id', packageId)
      : await supabase.from('male_sudy').upsert(
        { package_id: packageId, pocet, updated_at: cas, updated_by: kdo ?? null, ...(novyTyden ? { zapocitat_plne: false } : {}) },
        { onConflict: 'package_id' },
      );
    if (error) { void nacti(); return error.message; }
    return null;
  }

  /** Odpověď na otázku „započítat plné sudy skladem?" u jednoho obalu. */
  async function nastavZapocitatPlne(packageId: string, ano: boolean): Promise<string | null> {
    setZapocitatPlne((z) => { const d = new Set(z); if (ano) d.add(packageId); else d.delete(packageId); return d; });
    const { error } = await supabase.from('male_sudy').update({ zapocitat_plne: ano } as any).eq('package_id', packageId);
    if (error) { void nacti(); return error.message; }
    return null;
  }

  return { zasoba, zadanoKdy, zapocitatPlne, umiZapocitatPlne, nacteno, chybiMigrace, chybaNacteni, ulozit, nastavZapocitatPlne };
}


/**
 * Hlídání malých sudů nad OTEVŘENÝMI objednávkami — jeden výpočet pro
 * záložku Malé sudy i Objednávky, ať ukazují totéž. Objednávky odjeté od
 * zadání počtu ho zmenší (`zadanoKdy`, 1. 11. 2026).
 */
export function useHlidaniMalychSudu(
  zasoba: Record<string, number>,
  silaPodleId: Map<string, number> | undefined,
  /** Obaly se „započítat plné" (useMaleSudy) — jinak plné sudy jen upozorní. */
  zapocitatPlne: Set<string> | undefined,
  /** Kdy byl který počet naklikaný (useMaleSudy) — bez něj se odjeté neodečtou. */
  zadanoKdy: Record<string, ZadaniMalehoSudu> | undefined,
): VysledekMalychSudu & { nacteno: boolean; chybaNacteni: boolean; jmenaPiv: Map<string, string> } {
  const [data, setData] = useState<{
    o: ObjednavkaProSudy[]; p: PolozkaProSudy[]; odepsane: Set<string>; odpocty: OdpocetProSudy[];
    /** Dnešní sklad ze skladové knihy (bez úprav). */
    surovy: Map<string, number>;
    /** Dnešní sklad bez naplněných sudů odběratelů s vlastními sudy. */
    skladem: Map<string, number>;
    pohyby: Movement[] | null;
    /** Stočení do vlastních sudů odběratelů (i odepsaných) — pro plné k zadání. */
    vlastniStocene: VlastniStoceni[];
    jmenaPiv: Map<string, string>;
  } | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  // Načtení selhalo. Dobrá data z minula zůstávají (chyba je nepřepíše prázdnými —
  // číslo by skočilo zpět na naklikané a +/− by ho uložilo s novým časem).
  const [selhalo, setSelhalo] = useState(false);
  async function nacti() {
    // Nezavezené a nestornované — to jsou ty, na které se sudy ještě chystají.
    // Staré nezavezené objednávky (závoz před dneškem) odfiltruje výpočet
    // (maleSudy.ts chystaSeOd). K tomu zavezené z TOHOTO týdne: naklikaný
    // počet platí jen v týdnu zadání a odjeté objednávky ho zmenšují
    // (maleSudy.ts odjelaPoZadani). created_at o den dřív kvůli UTC.
    const pondeli = pondeliTydne(businessDateISO());
    const denPred = new Date(pondeli + 'T00:00:00Z');
    denPred.setUTCDate(denPred.getUTCDate() - 1);
    const { data: obj, error: chybaObj } = await fetchAllRows<any>('orders', 'id,status,is_delivered,delivered_at,delivery_date,delivery_day,order_date,created_at,place_name,note')
      .neq('status', 'storno')
      .or(`is_delivered.eq.false,delivery_date.gte.${pondeli},created_at.gte.${denPred.toISOString().slice(0, 10)}`);
    if (chybaObj) throw new Error('Objednávky se nenačetly.');
    const o = ((obj as any[]) ?? []) as ObjednavkaProSudy[];
    const ids = o.map((x) => x.id);
    const [{ data: pol, error: chybaPol }, { data: odp, error: chybaOdp }, kniha] = await Promise.all([
      ids.length
        ? fetchAllRows<any>('order_items', 'id,order_id,package_id,quantity,beer_id').in('order_id', ids)
        : Promise.resolve({ data: [] as any[], error: null }),
      // Už odepsané ze skladu = sudy odjely (30. 9. 2026) — viz maleSudy.ts.
      // Den a čas odpočtu po položkách rozhodnou, jestli odjela až po zadání.
      ids.length
        ? fetchAllRows<any>('zavoz_deductions', 'order_id,order_item_id,beer_id,package_id,quantity,deduct_date,created_at').in('order_id', ids)
        : Promise.resolve({ data: [] as any[], error: null }),
      // Stočené pivo skladem pokryje objednávku bez prázdného sudu.
      nactiSkladovouKnihu().catch(() => null),
    ]);
    if (chybaPol || chybaOdp) throw new Error('Položky nebo odpočty se nenačetly.');
    // Skladová kniha se nenačetla (slabý signál): zůstane poslední dobrá, ať se
    // krytí plnými a jejich upozornění potichu nezmění. Bez ní vůbec dnešní
    // sklad prázdný (plné nekryjí nic).
    const predtim = dataRef.current;
    const surovy = new Map<string, number>();
    if (kniha) stockAsOf(kniha.pohyby, businessDateISO()).forEach((r, k) => surovy.set(k, r.qty));
    else predtim?.surovy.forEach((n, k) => surovy.set(k, n));
    const pohyby = kniha ? kniha.pohyby : predtim?.pohyby ?? null;
    const jmenaPiv = kniha ? new Map(kniha.piva.map((b) => [b.id, b.name])) : predtim?.jmenaPiv ?? new Map<string, string>();
    // 🛢️ Naplněné sudy odběratelů s vlastními sudy (stočené s vazbou na jejich
    // položku, lib/stoceniDoVlastnich.ts) leží ve skladu, dokud neodjedou —
    // ostatním objednávkám ale nepatří (7. 10. 2026). Z dnešního skladu se
    // ubírají jen neodepsané (odepsané už vzal odpočet); pro stav k zadání
    // (plneKZadani) všechny, i když od zadání odjely — s odpočty položky.
    const odpocty = ((odp as any[]) ?? []) as OdpocetProSudy[];
    const odepsaneObj = new Set(odpocty.map((r) => r.order_id));
    const odpoctyPolozek = new Map<string, OdpocetProSudy[]>();
    for (const d of odpocty) {
      if (!d.order_item_id) continue;
      const seznam = odpoctyPolozek.get(d.order_item_id);
      if (seznam) seznam.push(d); else odpoctyPolozek.set(d.order_item_id, [d]);
    }
    const vlastniObj = new Set(o.filter((x) => vlastniSudyOdberatele(x.place_name, x.note)).map((x) => x.id));
    const vlastniPolozky = ((pol as any[]) ?? []).filter((x) => vlastniObj.has(x.order_id));
    const objednavkaPolozky = new Map(vlastniPolozky.map((x) => [x.id as string, x.order_id as string]));
    const skladem = new Map(surovy);
    const vlastniStocene: VlastniStoceni[] = [];
    if (vlastniPolozky.length) {
      const { data: stocene, error: chybaStoc } = await fetchAllRows<any>('kegging', 'order_item_id, beer_id, package_id, quantity, entry_date, created_at, note')
        .in('order_item_id', [...objednavkaPolozky.keys()]);
      if (chybaStoc) throw new Error('Stočené sudy se nenačetly.');
      for (const r of ((stocene as any[]) ?? [])) {
        // [mimo-sklad] se do skladu nepočítá vůbec (lib/stockLedger.ts) — není co ubírat.
        if (String(r.note ?? '').includes('[mimo-sklad]')) continue;
        const objednavka = objednavkaPolozky.get(r.order_item_id) ?? '';
        if (!odepsaneObj.has(objednavka)) {
          const k = `${r.beer_id}__${r.package_id}`;
          if (skladem.has(k)) skladem.set(k, (skladem.get(k) ?? 0) - Number(r.quantity || 0));
        }
        vlastniStocene.push({
          beer_id: r.beer_id ?? null, package_id: r.package_id ?? null, quantity: Number(r.quantity || 0),
          entry_date: r.entry_date ?? null, created_at: r.created_at ?? null, odpocty: odpoctyPolozek.get(r.order_item_id) ?? [],
        });
      }
    }
    setSelhalo(false);
    setData({
      o,
      p: ((pol as any[]) ?? []) as PolozkaProSudy[],
      odepsane: odepsaneObj,
      odpocty,
      surovy,
      skladem,
      pohyby,
      vlastniStocene,
      // Jména piv pro rozpad „plné skladem" v panelu Malé sudy.
      jmenaPiv,
    });
  }
  // Dokud nikdo nenaklikal žádný počet, není co hlídat — objednávky se
  // zbytečně nenačítají (hook běží i na ploše kvůli dlaždici).
  const hlida = Object.keys(zasoba).length > 0;
  // Chyba načtení nesmí shodit obrazovku — hlídání pak jen chvíli chybí.
  const nactiBezpecne = () => { nacti().catch(() => setSelhalo(true)); };
  useEffect(() => { if (hlida) nactiBezpecne(); }, [hlida]);
  useRealtime(['orders', 'order_items', 'zavoz_deductions', 'kegging', 'inventory', 'inventory_adjustments'], () => { if (hlida) nactiBezpecne(); });
  // Plné sudy z doby zadání (jen ty kryjí u „započítat plné") — bez skladové knihy dnešní sklad.
  const plnePriZadani = useMemo(
    () => (data?.pohyby && zadanoKdy ? plneKZadani(data.pohyby, zadanoKdy, data.vlastniStocene) : undefined),
    [data, zadanoKdy],
  );
  const vysledek = data
    ? hlidejMaleSudy(zasoba, data.o, data.p, silaPodleId, businessDateISO(), {
      odepsane: data.odepsane, skladem: data.skladem, zapocitatPlne, zadano: zadanoKdy, odpocty: data.odpocty, plnePriZadani,
    })
    : { souhrn: [], nadPoPolozce: new Map<string, number>(), poPolozce: new Map<string, { kryto: number; chybi: number }>() };
  return { ...vysledek, nacteno: !!data || selhalo, chybaNacteni: selhalo && !data, jmenaPiv: data?.jmenaPiv ?? new Map() };
}
