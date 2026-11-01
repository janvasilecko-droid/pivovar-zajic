// 🛢️ Počty malých sudů z tabulky male_sudy (viz lib/maleSudy.ts).
// Sdílí obrazovka KEG (zadávání) a Objednávky (hlídání).
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, useRealtime, fetchAllRows } from './supabase';
import { getQueue, removeOp } from './offline';
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

/** Volby uložení počtu: +/− v záložce pošle čas zadání a nový počet z téhož vykreslení. */
export type VolbyUlozeni = {
  /**
   * Čas zadání (ISO), ke kterému se vztahuje zobrazené číslo. Je-li z tohoto
   * týdne, uloží se `pocet` s přesně tímhle časem (oprava naklikaného čísla
   * o kus); jinak je to nové zadání s časem teď.
   */
  zachovatCas?: string | null;
  /** Co uložit, když je to nové zadání (zobrazené číslo ± 1) — od nového zadání nic neodjelo. */
  pocetNoveZadani?: number;
};

const BEZ_SIGNALU_POCET = 'Bez signálu — počet se neuložil, zkus to znovu.';
const BEZ_SIGNALU_VOLBA = 'Bez signálu — volba se neuložila, zkus to znovu.';
const BEZ_RADKU = 'Nejdřív zadej počet tohoto obalu.';

/**
 * Zápisy do male_sudy u obalu, které se během zápisu zařadily do offline fronty
 * telefonu místo do databáze (revize 1. 11. 2026). Při výpadku sítě vrátí
 * supabase.ts (synthesizeWrite) „povedený" zápis a uloží ho do fronty
 * (offline.ts enqueue). Upsert dostane syntetické id, které male_sudy nemá —
 * po návratu signálu by se nikdy neodeslal; úprava by se odeslala až kdoví kdy.
 * `predtim` = id zápisů, které ve frontě ležely už před zápisem.
 */
function zarazeneDoFronty(predtim: ReadonlySet<string>, packageId: string): string[] {
  return getQueue()
    .filter((op) => !predtim.has(op.id) && op.table === 'male_sudy'
      && (String(op.row?.package_id ?? '') === packageId || String(op.match?.package_id ?? '') === packageId))
    .map((op) => op.id);
}

function idFronty(): Set<string> {
  return new Set(getQueue().map((op) => op.id));
}

/** Záznam obalu zpátky na hodnotu před zápisem (`undefined` = záznam nebyl). */
function vratZaznam<T>(z: Record<string, T>, klic: string, hodnota: T | undefined): Record<string, T> {
  const dalsi = { ...z };
  if (hodnota === undefined) delete dalsi[klic]; else dalsi[klic] = hodnota;
  return dalsi;
}

export function useMaleSudy(): {
  /** Naklikané počty platné v tomhle týdnu (obal → kusy). */
  zasoba: Record<string, number>;
  /** Kdy byl který počet naklikaný — od té chvíle se odečítají odjeté objednávky. */
  zadanoKdy: Record<string, ZadaniMalehoSudu>;
  /** Obaly, u kterých se plné sudy skladem započítávají do objednávek (jen u počtu z tohoto týdne). */
  zapocitatPlne: Set<string>;
  /** Volba „započítat plné" už je v databázi (migrace 20261231260100). */
  umiZapocitatPlne: boolean;
  nacteno: boolean;
  /** Tabulka ještě není v databázi (čeká migrace) — záložka to řekne. */
  chybiMigrace: boolean;
  /** Počty se nepodařilo načíst (síť) — záložka nesmí nabídnout „+" jako první zadání, přepsalo by uložené. */
  chybaNacteni: boolean;
  /** Vrací hlášku pro člověka, když se počet neuložil (null = uloženo). */
  ulozit: (packageId: string, pocet: number | null, kdo?: string | null, volby?: VolbyUlozeni) => Promise<string | null>;
  /** Vrací hlášku pro člověka, když se volba neuložila (null = uloženo). */
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
  /**
   * Pořadí načtení a místních zápisů (revize 1. 11. 2026). Načtení, od jehož
   * startu začalo novější načtení nebo místní zápis, je zastaralé a zahodí se —
   * jinak by starší odpověď databáze přepsala právě uložené číslo i radkyRef.
   * Zápis ho zvedá na začátku i na konci: načtení zahájené během zápisu mohlo
   * číst stav ještě před ním.
   */
  const poradiRef = useRef(0);
  /** Kolik místních zápisů právě běží — načtení dokončené mezitím se taky zahodí. */
  const zapisuVBehuRef = useRef(0);
  /** Pořadí posledního zápisu počtu / volby u obalu — chyba staršího zápisu nevrací stav přes novější. */
  const posledniPocetRef = useRef<Record<string, number>>({});
  const posledniVolbaRef = useRef<Record<string, number>>({});

  async function nacti() {
    const poradi = ++poradiRef.current;
    const aktualni = () => poradiRef.current === poradi && zapisuVBehuRef.current === 0;
    // Se sloupcem zapocitat_plne; dokud migrace neběží, bez něj (6. 10. 2026).
    let { data, error } = await supabase.from('male_sudy').select('package_id, pocet, updated_at, zapocitat_plne');
    if (!aktualni()) return;
    const bezSloupce = !!error && (error.code === '42703' || /zapocitat_plne/.test(error.message ?? ''));
    if (bezSloupce) {
      ({ data, error } = await supabase.from('male_sudy').select('package_id, pocet, updated_at') as any);
      if (!aktualni()) return;
    }
    if (error) {
      if (chybiTabulka(error)) setChybiMigrace(true);
      // Nepovedená obnova (slabý signál) nechá poslední načtené počty — chyba
      // se ukáže jen dokud se ještě nic nenačetlo (revize 1. 11. 2026).
      else if (!nactenoRef.current) setChybaNacteni(true);
      setNacteno(true);
      return;
    }
    const radky = ((data as any[]) ?? []) as (RadekMalychSudu & { zapocitat_plne?: boolean })[];
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
      if (!aktualni()) return;
      for (const o of ((obaly ?? []) as ObalProSudy[])) if (jeMalySud(o) && z[o.id] == null) z[o.id] = 0;
    }
    // radkyRef a stav z téhož načtení, naráz — +/− tak nikdy nespojí čas
    // z jednoho načtení s číslem z jiného (revize 1. 11. 2026).
    nactenoRef.current = true;
    radkyRef.current = radky;
    setChybaNacteni(false);
    setUmiZapocitatPlne(!bezSloupce);
    // „Započítat plné" platí jen u počtu z tohoto týdne: s počtem z minulého
    // týdne neplatí ani odpověď (nové zadání ji vynuluje, viz ulozit) — jinak
    // by se plné u obalu doplněného nulou započítávaly potichu.
    setZapocitatPlne(new Set(radky.filter((r) => r.zapocitat_plne && kdy[r.package_id]).map((r) => r.package_id)));
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
   * nezmění). `volby.zachovatCas` (+/− v záložce) je oprava naklikaného čísla
   * o kus: čas zadání zůstane, jinak by sudy stočené od zadání byly „plné
   * k zadání" a u „započítat plné" by K dispozici nafoukly (revize 1. 11. 2026).
   * Čas i počet posílá záložka z téhož vykreslení. Čas, který už neplatí
   * (minulý týden — záložka se přes přelom týdne neobnovila), je nové zadání
   * a uloží se `volby.pocetNoveZadani`: naklikané číslo starého zadání by
   * s sebou neslo i jeho odjeté (9 místo 3).
   *
   * Zápis, který se neuložil (chyba, nebo skončil v offline frontě), vrátí
   * stav obalu na hodnotu před zápisem a znovu načte — v záložce nezůstane
   * neuložené číslo, ani když obnova selže.
   */
  async function ulozit(
    packageId: string,
    pocet: number | null,
    kdo?: string | null,
    volby: VolbyUlozeni = {},
  ): Promise<string | null> {
    const ted = new Date();
    const dnes = businessDateISO(ted);
    const tyden = pondeliTydne(dnes);
    const zachovatMs = Date.parse(volby.zachovatCas ?? '');
    const zachovat = pocet != null && Number.isFinite(zachovatMs) && pondeliTydne(businessDateISO(new Date(zachovatMs))) >= tyden;
    const cas = zachovat ? volby.zachovatCas! : ted.toISOString();
    const novy = pocet == null ? null : zachovat ? pocet : Math.max(0, volby.pocetNoveZadani ?? pocet);
    // Řádek v databázi z minulého týdne: počet už neplatí (prazdneMaleSudy) —
    // s novým počtem se i „započítat plné" ptá znovu, ať se plné sudy
    // nezapočtou potichu.
    const stary = radkyRef.current.find((r) => r.package_id === packageId);
    const tydenStareho = stary?.updated_at && Number.isFinite(Date.parse(stary.updated_at))
      ? pondeliTydne(businessDateISO(new Date(stary.updated_at)))
      : null;
    const novyTyden = umiZapocitatPlne && tydenStareho != null && tydenStareho < tyden;

    // Stav obalu před zápisem — po neuložení se vrátí.
    const predPocet = zasoba[packageId];
    const predZadani = zadanoKdy[packageId];
    const predZapocitat = zapocitatPlne.has(packageId);
    const poradi = ++poradiRef.current;
    posledniPocetRef.current[packageId] = poradi;
    if (novyTyden) posledniVolbaRef.current[packageId] = poradi;

    setZasoba((z) => vratZaznam(z, packageId, novy ?? undefined));
    if (!zachovat) setZadanoKdy((z) => vratZaznam(z, packageId, novy == null ? undefined : { cas, den: dnes }));
    if (novyTyden) setZapocitatPlne((z) => { const d = new Set(z); d.delete(packageId); return d; });
    // Řádek, jak bude v databázi — podle něj další zápis pozná minulý týden.
    const ostatni = radkyRef.current.filter((r) => r.package_id !== packageId);
    radkyRef.current = novy == null ? ostatni : [...ostatni, { ...stary, package_id: packageId, pocet: novy, updated_at: cas }];

    const frontaPred = idFronty();
    zapisuVBehuRef.current++;
    let chyba: string | null = null;
    try {
      const { error } = novy == null
        ? await supabase.from('male_sudy').delete().eq('package_id', packageId)
        : await supabase.from('male_sudy').upsert(
          { package_id: packageId, pocet: novy, updated_at: cas, updated_by: kdo ?? null, ...(novyTyden ? { zapocitat_plne: false } : {}) },
          { onConflict: 'package_id' },
        );
      if (error) chyba = error.message || 'neznámá chyba';
    } catch (e) {
      chyba = e instanceof Error ? e.message : String(e);
    } finally {
      zapisuVBehuRef.current--;
      poradiRef.current++;
    }
    const veFronte = zarazeneDoFronty(frontaPred, packageId);
    for (const id of veFronte) removeOp(id);
    if (chyba == null && veFronte.length === 0) return null;

    if (posledniPocetRef.current[packageId] === poradi) {
      setZasoba((z) => vratZaznam(z, packageId, predPocet));
      setZadanoKdy((z) => vratZaznam(z, packageId, predZadani));
      radkyRef.current = [...radkyRef.current.filter((r) => r.package_id !== packageId), ...(stary ? [stary] : [])];
    }
    if (novyTyden && posledniVolbaRef.current[packageId] === poradi) {
      setZapocitatPlne((z) => { const d = new Set(z); if (predZapocitat) d.add(packageId); else d.delete(packageId); return d; });
    }
    nacti().catch(() => {});
    return veFronte.length > 0 ? BEZ_SIGNALU_POCET : `Počet se neuložil: ${chyba}`;
  }

  /**
   * Odpověď na otázku „započítat plné sudy skladem?" u jednoho obalu. Jde jen
   * u obalu s vlastním řádkem (zadaný počet) — obal doplněný nulou řádek nemá,
   * úprava by nezasáhla nic a volba by se při obnově vrátila.
   */
  async function nastavZapocitatPlne(packageId: string, ano: boolean): Promise<string | null> {
    const predZapocitat = zapocitatPlne.has(packageId);
    const poradi = ++poradiRef.current;
    posledniVolbaRef.current[packageId] = poradi;
    setZapocitatPlne((z) => { const d = new Set(z); if (ano) d.add(packageId); else d.delete(packageId); return d; });
    const frontaPred = idFronty();
    zapisuVBehuRef.current++;
    let chyba: string | null = null;
    let radku = 0;
    try {
      const { data, error } = await supabase.from('male_sudy').update({ zapocitat_plne: ano } as any).eq('package_id', packageId).select('package_id');
      if (error) chyba = error.message || 'neznámá chyba';
      radku = Array.isArray(data) ? data.length : 0;
    } catch (e) {
      chyba = e instanceof Error ? e.message : String(e);
    } finally {
      zapisuVBehuRef.current--;
      poradiRef.current++;
    }
    const veFronte = zarazeneDoFronty(frontaPred, packageId);
    for (const id of veFronte) removeOp(id);
    if (chyba == null && veFronte.length === 0 && radku > 0) return null;

    if (posledniVolbaRef.current[packageId] === poradi) {
      setZapocitatPlne((z) => { const d = new Set(z); if (predZapocitat) d.add(packageId); else d.delete(packageId); return d; });
    }
    nacti().catch(() => {});
    if (veFronte.length > 0) return BEZ_SIGNALU_VOLBA;
    return chyba != null ? `Volba se neuložila: ${chyba}` : BEZ_RADKU;
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
    o: ObjednavkaProSudy[]; p: PolozkaProSudy[];
    /** Odpočty závozu tak, jak jsou v databázi (i s dnem v budoucnu). */
    odpocty: OdpocetProSudy[];
    /** Pohyby skladové knihy — z nich dnešní sklad i plné k zadání. */
    pohyby: Movement[] | null;
    /** Stočení do vlastních sudů odběratelů (i odepsaných) s objednávkou — pro dnešní sklad a plné k zadání. */
    vlastniStocene: (VlastniStoceni & { order_id: string })[];
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
    const pohyby = kniha ? kniha.pohyby : predtim?.pohyby ?? null;
    const jmenaPiv = kniha ? new Map(kniha.piva.map((b) => [b.id, b.name])) : predtim?.jmenaPiv ?? new Map<string, string>();
    // 🛢️ Naplněné sudy odběratelů s vlastními sudy (stočené s vazbou na jejich
    // položku, lib/stoceniDoVlastnich.ts) leží ve skladu, dokud neodjedou —
    // ostatním objednávkám ale nepatří (7. 10. 2026). Kolik jich z dnešního
    // skladu ubrat, se počítá až při výpočtu (podle dnešního dne, níž); pro
    // stav k zadání (plneKZadani) všechny, i když od zadání odjely — s odpočty položky.
    const odpocty = ((odp as any[]) ?? []) as OdpocetProSudy[];
    const odpoctyPolozek = new Map<string, OdpocetProSudy[]>();
    for (const d of odpocty) {
      if (!d.order_item_id) continue;
      const seznam = odpoctyPolozek.get(d.order_item_id);
      if (seznam) seznam.push(d); else odpoctyPolozek.set(d.order_item_id, [d]);
    }
    const vlastniObj = new Set(o.filter((x) => vlastniSudyOdberatele(x.place_name, x.note)).map((x) => x.id));
    const vlastniPolozky = ((pol as any[]) ?? []).filter((x) => vlastniObj.has(x.order_id));
    const objednavkaPolozky = new Map(vlastniPolozky.map((x) => [x.id as string, x.order_id as string]));
    const vlastniStocene: (VlastniStoceni & { order_id: string })[] = [];
    if (vlastniPolozky.length) {
      const { data: stocene, error: chybaStoc } = await fetchAllRows<any>('kegging', 'order_item_id, beer_id, package_id, quantity, entry_date, created_at, note')
        .in('order_item_id', [...objednavkaPolozky.keys()]);
      if (chybaStoc) throw new Error('Stočené sudy se nenačetly.');
      for (const r of ((stocene as any[]) ?? [])) {
        // [mimo-sklad] se do skladu nepočítá vůbec (lib/stockLedger.ts) — není co ubírat.
        if (String(r.note ?? '').includes('[mimo-sklad]')) continue;
        vlastniStocene.push({
          order_id: objednavkaPolozky.get(r.order_item_id) ?? '',
          beer_id: r.beer_id ?? null, package_id: r.package_id ?? null, quantity: Number(r.quantity || 0),
          entry_date: r.entry_date ?? null, created_at: r.created_at ?? null, odpocty: odpoctyPolozek.get(r.order_item_id) ?? [],
        });
      }
    }
    setSelhalo(false);
    setData({
      o,
      p: ((pol as any[]) ?? []) as PolozkaProSudy[],
      odpocty,
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
  // Dnešní pražský den — stejný pro odepsané, dnešní sklad i hlidejMaleSudy.
  // Počítá se při výpočtu, ne při načtení: po půlnoci se přepočítá i bez obnovy.
  const dnes = businessDateISO();
  const dnesni = useMemo(() => {
    if (!data) return null;
    // Odepsaná = odpočet ke dni nejpozději dnes (den závozu nastal, sudy jsou
    // pryč — 30. 9. 2026). Odpočet s pozdějším dnem je objednávka přesunutá po
    // nočním odpočtu na pozdější den: sudy ještě čekají v pivovaru, objednávka
    // je otevřená (revize 1. 11. 2026).
    const odepsane = new Set(data.odpocty
      .filter((d) => { const den = (d.deduct_date ?? '').slice(0, 10); return !!den && den <= dnes; })
      .map((d) => d.order_id));
    // Dnešní sklad ze skladové knihy bez naplněných sudů odběratelů s vlastními
    // sudy, které ještě neodjely (odepsané už vzal odpočet).
    const skladem = new Map<string, number>();
    if (data.pohyby) stockAsOf(data.pohyby, dnes).forEach((r, k) => skladem.set(k, r.qty));
    for (const r of data.vlastniStocene) {
      if (odepsane.has(r.order_id)) continue;
      const k = `${r.beer_id}__${r.package_id}`;
      if (skladem.has(k)) skladem.set(k, (skladem.get(k) ?? 0) - Number(r.quantity || 0));
    }
    return { odepsane, skladem };
  }, [data, dnes]);
  // Plné sudy z doby zadání (jen ty kryjí u „započítat plné") — bez skladové knihy dnešní sklad.
  const plnePriZadani = useMemo(
    () => (data?.pohyby && zadanoKdy ? plneKZadani(data.pohyby, zadanoKdy, data.vlastniStocene) : undefined),
    [data, zadanoKdy],
  );
  const vysledek = data && dnesni
    ? hlidejMaleSudy(zasoba, data.o, data.p, silaPodleId, dnes, {
      odepsane: dnesni.odepsane, skladem: dnesni.skladem, zapocitatPlne, zadano: zadanoKdy, odpocty: data.odpocty, plnePriZadani,
    })
    : { souhrn: [], nadPoPolozce: new Map<string, number>(), poPolozce: new Map<string, { kryto: number; chybi: number }>() };
  return { ...vysledek, nacteno: !!data || selhalo, chybaNacteni: selhalo && !data, jmenaPiv: data?.jmenaPiv ?? new Map() };
}
