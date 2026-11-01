// 🛢️ Počty malých sudů z tabulky male_sudy (viz lib/maleSudy.ts).
// Sdílí obrazovka KEG (zadávání) a Objednávky (hlídání).
import { useEffect, useRef, useState } from 'react';
import { supabase, useRealtime, fetchAllRows } from './supabase';
import {
  hlidejMaleSudy, jeMalySud, pondeliTydne, prazdneMaleSudy, zadaniMalychSudu,
  type RadekMalychSudu, type VysledekMalychSudu, type ObjednavkaProSudy, type PolozkaProSudy, type ObalProSudy,
  type OdpocetProSudy, type ZadaniMalehoSudu,
} from './maleSudy';
import { chybiTabulka } from './chybyHlaseni';
import { businessDateISO } from './businessDate';
import { nactiSkladovouKnihu } from './skladovaKnihaData';
import { stockAsOf } from './stockLedger';
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
  ulozit: (packageId: string, pocet: number | null, kdo?: string | null) => Promise<string | null>;
  nastavZapocitatPlne: (packageId: string, ano: boolean) => Promise<string | null>;
} {
  const [zasoba, setZasoba] = useState<Record<string, number>>({});
  const [zadanoKdy, setZadanoKdy] = useState<Record<string, ZadaniMalehoSudu>>({});
  const [zapocitatPlne, setZapocitatPlne] = useState<Set<string>>(new Set());
  const [umiZapocitatPlne, setUmiZapocitatPlne] = useState(false);
  const [nacteno, setNacteno] = useState(false);
  const [chybiMigrace, setChybiMigrace] = useState(false);
  const radkyRef = useRef<RadekMalychSudu[]>([]);

  async function nacti() {
    // Se sloupcem zapocitat_plne; dokud migrace neběží, bez něj (6. 10. 2026).
    let { data, error } = await supabase.from('male_sudy').select('package_id, pocet, updated_at, zapocitat_plne');
    const bezSloupce = !!error && (error.code === '42703' || /zapocitat_plne/.test(error.message ?? ''));
    if (bezSloupce) ({ data, error } = await supabase.from('male_sudy').select('package_id, pocet, updated_at') as any);
    if (error) {
      if (chybiTabulka(error)) setChybiMigrace(true);
      setNacteno(true);
      return;
    }
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

  /** `pocet = null` → obal přestane hlídat (řádek se smaže). */
  async function ulozit(packageId: string, pocet: number | null, kdo?: string | null): Promise<string | null> {
    // Nový počet = stav TEĎ: odjeté objednávky se počítají až od téhle chvíle
    // (čas se uloží stejný, ať se číslo po načtení z databáze nezmění).
    const ted = new Date();
    const cas = ted.toISOString();
    setZasoba((z) => {
      const dalsi = { ...z };
      if (pocet == null) delete dalsi[packageId]; else dalsi[packageId] = pocet;
      return dalsi;
    });
    setZadanoKdy((z) => {
      const dalsi = { ...z };
      if (pocet == null) delete dalsi[packageId]; else dalsi[packageId] = { cas, den: businessDateISO(ted) };
      return dalsi;
    });
    // Počet z minulého týdne už neplatí (prazdneMaleSudy) — s novým počtem
    // se i „započítat plné" ptá znovu, ať se plné sudy nezapočtou potichu.
    const dnes = businessDateISO();
    const stary = radkyRef.current.find((r) => r.package_id === packageId);
    const novyTyden = umiZapocitatPlne && !!stary?.updated_at
      && pondeliTydne(businessDateISO(new Date(stary.updated_at))) < pondeliTydne(dnes);
    if (novyTyden) setZapocitatPlne((z) => { const d = new Set(z); d.delete(packageId); return d; });
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

  return { zasoba, zadanoKdy, zapocitatPlne, umiZapocitatPlne, nacteno, chybiMigrace, ulozit, nastavZapocitatPlne };
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
): VysledekMalychSudu & { nacteno: boolean; jmenaPiv: Map<string, string> } {
  const [data, setData] = useState<{ o: ObjednavkaProSudy[]; p: PolozkaProSudy[]; odepsane: Set<string>; odpocty: OdpocetProSudy[]; skladem: Map<string, number>; jmenaPiv: Map<string, string> } | null>(null);
  // Načtení selhalo (síť) — záložka pak ukáže aspoň naklikané číslo, ne věčné „…".
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
    const { data: obj } = await fetchAllRows<any>('orders', 'id,status,is_delivered,delivery_date,order_date,created_at,place_name,note')
      .neq('status', 'storno')
      .or(`is_delivered.eq.false,delivery_date.gte.${pondeli},created_at.gte.${denPred.toISOString().slice(0, 10)}`);
    const o = ((obj as any[]) ?? []) as ObjednavkaProSudy[];
    const ids = o.map((x) => x.id);
    const [{ data: pol }, { data: odp }, kniha] = await Promise.all([
      ids.length
        ? fetchAllRows<any>('order_items', 'id,order_id,package_id,quantity,beer_id').in('order_id', ids)
        : Promise.resolve({ data: [] as any[] }),
      // Už odepsané ze skladu = sudy odjely (30. 9. 2026) — viz maleSudy.ts.
      ids.length
        ? fetchAllRows<any>('zavoz_deductions', 'order_id,beer_id,package_id,quantity').in('order_id', ids)
        : Promise.resolve({ data: [] as any[] }),
      // Stočené pivo skladem pokryje objednávku bez prázdného sudu.
      nactiSkladovouKnihu().catch(() => null),
    ]);
    const skladem = new Map<string, number>();
    if (kniha) stockAsOf(kniha.pohyby, businessDateISO()).forEach((r, k) => skladem.set(k, r.qty));
    // 🛢️ Naplněné sudy odběratelů s vlastními sudy (stočené s vazbou na jejich
    // položku, lib/stoceniDoVlastnich.ts) leží ve skladu, dokud neodjedou —
    // ostatním objednávkám ale nepatří (7. 10. 2026).
    const odepsaneObj = new Set(((odp as any[]) ?? []).map((r) => r.order_id as string));
    const vlastniObj = new Set(o.filter((x) => vlastniSudyOdberatele(x.place_name, x.note) && !odepsaneObj.has(x.id)).map((x) => x.id));
    const vlastniPolozky = ((pol as any[]) ?? []).filter((x) => vlastniObj.has(x.order_id)).map((x) => x.id as string);
    if (vlastniPolozky.length) {
      const { data: stocene } = await fetchAllRows<any>('kegging', 'order_item_id, beer_id, package_id, quantity').in('order_item_id', vlastniPolozky);
      for (const r of ((stocene as any[]) ?? [])) {
        const k = `${r.beer_id}__${r.package_id}`;
        if (skladem.has(k)) skladem.set(k, (skladem.get(k) ?? 0) - Number(r.quantity || 0));
      }
    }
    setSelhalo(false);
    setData({
      o,
      p: ((pol as any[]) ?? []) as PolozkaProSudy[],
      odepsane: odepsaneObj,
      odpocty: ((odp as any[]) ?? []) as OdpocetProSudy[],
      skladem,
      // Jména piv pro rozpad „plné skladem" v panelu Malé sudy.
      jmenaPiv: new Map((kniha?.piva ?? []).map((b) => [b.id, b.name])),
    });
  }
  // Dokud nikdo nenaklikal žádný počet, není co hlídat — objednávky se
  // zbytečně nenačítají (hook běží i na ploše kvůli dlaždici).
  const hlida = Object.keys(zasoba).length > 0;
  // Chyba načtení nesmí shodit obrazovku — hlídání pak jen chvíli chybí.
  const nactiBezpecne = () => { nacti().catch(() => setSelhalo(true)); };
  useEffect(() => { if (hlida) nactiBezpecne(); }, [hlida]);
  useRealtime(['orders', 'order_items', 'zavoz_deductions', 'kegging', 'inventory', 'inventory_adjustments'], () => { if (hlida) nactiBezpecne(); });
  const vysledek = data
    ? hlidejMaleSudy(zasoba, data.o, data.p, silaPodleId, businessDateISO(), {
      odepsane: data.odepsane, skladem: data.skladem, zapocitatPlne, zadano: zadanoKdy, odpocty: data.odpocty,
    })
    : { souhrn: [], nadPoPolozce: new Map<string, number>(), poPolozce: new Map<string, { kryto: number; chybi: number }>() };
  return { ...vysledek, nacteno: !!data || selhalo, jmenaPiv: data?.jmenaPiv ?? new Map() };
}
