// 🗓️ Týdenní inventura — spočítat sklad každý týden, ne jednou za měsíc.
//
// Rozdíl se NEUKLÁDÁ jako nový stav. Řádek v `inventory` je podle skladové
// knihy reset a tiše by rozdíl spolkl — číslo by sedělo, ale stáčení KEG,
// stáčení lahví ani sklad by o něm nevěděly. Propisuje se proto TAM, KDE
// VZNIKL: přebytek jako chybějící zápis stáčení, manko jako záporný řádek.
// Do `tydenni_inventura` jde jen záznam o tom, že se počítalo a jak to
// dopadlo — aby šlo po týdnech dohledat, kde se rozdíl vzal.
//
// Zapisuje se stejnými funkcemi jako u měsíční uzávěrky (lib/inventoryFix.ts,
// lib/tankZapis.ts). Vlastní verze zápisu by byla druhá pravda o tomtéž.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, Check, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, ListChecks, Lock, LockOpen, MinusCircle, Plus, RefreshCw, Save, Search } from 'lucide-react';
import { supabase, fetchAllRows, formatPackageLabel } from '../lib/supabase';
import { Spinner } from './ui';
import { businessDateISO } from '../lib/businessDate';
import { nactiSkladovouKnihu, type SkladovaKniha } from '../lib/skladovaKnihaData';
import { MOVEMENT_LABELS, movementsFor, stockForObdobi } from '../lib/stockLedger';
import { kegovaniZapisy, lahvoveZapisy, odectiZeStoceni } from '../lib/inventoryFix';
import { rozdelSudyDoTanku, type TankProRozdeleni } from '../lib/tankRozdeleni';
import { odectiZTanku } from '../lib/tankZapis';
import {
  jenAktivni, popisTydne, radkyTydne, souhrnTydne, stitekTydne, tydenObdobi, vychoziTyden,
  zaznamKontroly, zaznamDorovnani, type TydenniRadek, type TydenObdobi,
} from '../lib/tydenniInventura';
import type { ReactNode } from 'react';
import { popisPolozek, objednavkaShoduje, zapisShoduje, type PrehledObjednavka, type PrehledZapis } from '../lib/tydenniPrehled';
import { StitekStavu } from './StitekStavu';
import { lzeUlozitKoncept, slucInventuru } from '../lib/rozepsanaInventura';
import { nactiJson, ulozJson } from '../lib/uloziste';
import { chyba, oznam, potvrd, uspech } from '../lib/toast';
import { normalizujCislo } from '../lib/cisloVstup';

export default function TydenniInventuraPanel({ setPage }: { setPage?: (p: any, sec?: string, sub?: string) => void } = {}) {
  const dnes = businessDateISO();
  const [posun, setPosun] = useState(() => vychoziTyden(dnes));
  const obdobi = useMemo(() => tydenObdobi(dnes, posun), [dnes, posun]);

  const [kniha, setKniha] = useState<SkladovaKniha | null>(null);
  const [tanky, setTanky] = useState<TankProRozdeleni[]>([]);
  const [napocitano, setNapocitano] = useState<Record<string, string>>({});
  const [bezi, setBezi] = useState(true);
  const [uklada, setUklada] = useState<string | null>(null);
  const [hledat, setHledat] = useState('');
  const [jenRozdily, setJenRozdily] = useState(false);
  // 🍾/🛢️ Přepínač nahoře: počítání se dělá buď v chlaďáku (sudy), nebo ve
  // skladu lahví (PET) — jindy, jinde a jiný člověk. Zobrazit obojí najednou
  // jen prodlužuje scrollování k tomu, co se zrovna počítá.
  const [filtrObalu, setFiltrObalu] = useState<'vse' | 'lahve' | 'sudy'>(
    () => (nactiJson<'vse' | 'lahve' | 'sudy'>('tydenni_inventura_filtr_obalu', 'vse')),
  );
  useEffect(() => { ulozJson('tydenni_inventura_filtr_obalu', filtrObalu); }, [filtrObalu]);
  // 💾 Rozepsané (ještě neuložené) napočítání se nesmí ztratit — viz
  // lib/rozepsanaInventura.ts. Bez tohohle `nacti()` (při přenačtení, po
  // zápisu i při návratu na stejný týden) tiše přepsalo naťukaná čísla jen
  // tím, co už je uložené v DB.
  const loadedTydenRef = useRef<string | null>(null);
  // 🔎 Detail rozdílu — rozbalí se u řádku, který nesedí: odkud se vzal
  // (jaké pohyby se s ním za ten týden dělo) a proklik na objednávky, které
  // se do toho počítaly (viz zavoz_deductions.order_id).
  const [otevrenyRadek, setOtevrenyRadek] = useState<string | null>(null);
  const [objednavkyInfo, setObjednavkyInfo] = useState<Record<string, { place_name: string | null; delivery_date: string | null; status: string | null }>>({});

  // 📋 Přehled týdne (vedle počítání kusů) a značka uzavření — viz
  // lib/tydenniPrehled.ts a migrace tydenni_uzaverky.
  const [rezim, setRezim] = useState<'pocitani' | 'prehled'>('pocitani');
  const [uzavreno, setUzavreno] = useState<{ at: string; by: string | null } | null>(null);
  const [uzaviram, setUzaviram] = useState(false);

  useEffect(() => {
    let zruseno = false;
    supabase.from('tydenni_uzaverky').select('uzavreno_at, uzavreno_by').eq('tyden_od', obdobi.od).maybeSingle()
      .then(({ data }) => { if (!zruseno) setUzavreno(data ? { at: data.uzavreno_at, by: data.uzavreno_by } : null); });
    return () => { zruseno = true; };
  }, [obdobi.od]);

  async function uzavritTyden() {
    if (!(await potvrd(`Uzavřít týden ${popisTydne(obdobi.od, obdobi.do)}? Je to jen značka pro přehled — nic nezamkne, jde kdykoli zase otevřít.`))) return;
    setUzaviram(true);
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } } as any));
    const { error } = await supabase.from('tydenni_uzaverky').upsert(
      { tyden_od: obdobi.od, uzavreno_at: new Date().toISOString(), uzavreno_by: user?.email ?? null },
      { onConflict: 'tyden_od' },
    );
    setUzaviram(false);
    if (error) { chyba('Uzavření se nepovedlo: ' + error.message); return; }
    setUzavreno({ at: new Date().toISOString(), by: user?.email ?? null });
    uspech(`Týden ${popisTydne(obdobi.od, obdobi.do)} uzavřen.`);
  }

  async function otevritTyden() {
    if (!(await potvrd('Otevřít týden znovu?'))) return;
    setUzaviram(true);
    const { error } = await supabase.from('tydenni_uzaverky').delete().eq('tyden_od', obdobi.od);
    setUzaviram(false);
    if (error) { chyba('Otevření se nepovedlo: ' + error.message); return; }
    setUzavreno(null);
  }

  const nacti = useCallback(async () => {
    setBezi(true);
    try {
      const [k, { data: t }, { data: ulozene }] = await Promise.all([
        nactiSkladovouKnihu(),
        supabase.from('cellar_tanks').select('id,label,current_beer_id,current_volume_l,status,started_at,kegging_active'),
        supabase.from('tydenni_inventura').select('beer_id,package_id,napocitano').eq('tyden_od', obdobi.od),
      ]);
      setKniha(k);
      setTanky((t as TankProRozdeleni[]) ?? []);
      // Co se v tomhle týdnu už napočítalo, se vrátí do políček. Kontrola se
      // dělá po částech (sklep dnes, sklad zítra) a překlikáním týdne sem a
      // zpátky se rozdělaná práce nesmí ztratit.
      const mapaDB: Record<string, string> = {};
      for (const r of ((ulozene as any[]) ?? [])) mapaDB[`${r.beer_id}__${r.package_id}`] = String(r.napocitano);
      // Základ = koncept z localStorage pro TENHLE týden (přežije refresh i
      // uspání telefonu), DB má přednost tam, kde už je něco oficiálně uloženo.
      const koncept = nactiJson<Record<string, string>>(`tydenni_napocitano_${obdobi.od}`, {});
      const nactene = { ...koncept, ...mapaDB };
      const zmenaTydne = loadedTydenRef.current !== obdobi.od;
      setNapocitano((prev) => slucInventuru(nactene, prev, zmenaTydne));
      loadedTydenRef.current = obdobi.od;
    } catch (e: any) {
      chyba('Týdenní inventuru se nepodařilo načíst: ' + (e?.message || e));
    } finally {
      setBezi(false);
    }
  }, [obdobi.od]);

  useEffect(() => { nacti(); }, [nacti]);

  useEffect(() => {
    if (!lzeUlozitKoncept(loadedTydenRef.current, obdobi.od)) return;
    ulozJson(`tydenni_napocitano_${obdobi.od}`, napocitano);
  }, [napocitano, obdobi.od]);

  const vsechnyRadky = useMemo(() => {
    if (!kniha) return [];
    const sklad = stockForObdobi(kniha.pohyby, obdobi.od, obdobi.doPocitani);
    return jenAktivni(radkyTydne(sklad, kniha.piva, kniha.obaly, napocitano));
  }, [kniha, obdobi.od, obdobi.doPocitani, napocitano]);

  // Přepínač nahoře (Lahve/Sudy) omezuje i souhrn a počítadlo „X / Y
  // spočítáno" — jinak by ukazovaly zbytek skladu, na který se teď vůbec
  // nekouká, a číslo by nesedělo s tím, co je vidět na obrazovce.
  const radkyObalu = useMemo(() => {
    return vsechnyRadky.filter((r) => {
      if (filtrObalu === 'lahve' && r.sud) return false;
      if (filtrObalu === 'sudy' && !r.sud) return false;
      return true;
    });
  }, [vsechnyRadky, filtrObalu]);

  const radky = useMemo(() => {
    const q = hledat.trim().toLowerCase();
    return radkyObalu.filter((r) => {
      if (jenRozdily && r.rozdil === 0) return false;
      if (!q) return true;
      return `${r.beer_name} ${r.package_label}`.toLowerCase().includes(q);
    });
  }, [radkyObalu, hledat, jenRozdily]);

  const otevrenyRadekObj = useMemo(
    () => vsechnyRadky.find((r) => r.klic === otevrenyRadek) ?? null,
    [vsechnyRadky, otevrenyRadek],
  );

  /** Rozpad pohybů za týden pro rozbalený řádek — odkud se vzal rozdíl. */
  const pohybyOtevrenehoRadku = useMemo(() => {
    if (!kniha || !otevrenyRadekObj) return [];
    return movementsFor(kniha.pohyby, otevrenyRadekObj.beer_id, otevrenyRadekObj.package_id, obdobi.od, obdobi.doPocitani);
  }, [kniha, otevrenyRadekObj, obdobi.od, obdobi.doPocitani]);

  // Objednávky za pohyby typu 'zavoz' se dotahují až při rozbalení detailu —
  // stahovat je dopředu pro celý týden by zatěžovalo appku kvůli něčemu, na
  // co se člověk možná ani nepodívá.
  useEffect(() => {
    const chybejici = Array.from(new Set(
      pohybyOtevrenehoRadku.filter((m) => m.kind === 'zavoz' && m.orderId).map((m) => m.orderId as string),
    )).filter((id) => !objednavkyInfo[id]);
    if (chybejici.length === 0) return;
    let zruseno = false;
    // .limit() jako výslovný strop — `.in()` s pár konkrétními id sám o sobě
    // víc řádků vrátit nemůže, ale hlídač rostoucích tabulek (viz
    // strankovaniDotazu.test.ts) to nepozná, dokud strop nevidí.
    supabase.from('orders').select('id,place_name,delivery_date,status').in('id', chybejici).limit(chybejici.length).then(({ data }) => {
      if (zruseno || !data) return;
      setObjednavkyInfo((prev) => {
        const next = { ...prev };
        for (const o of data as any[]) next[o.id] = { place_name: o.place_name, delivery_date: o.delivery_date, status: o.status };
        return next;
      });
    });
    return () => { zruseno = true; };
  }, [pohybyOtevrenehoRadku, objednavkyInfo]);

  const souhrn = useMemo(() => souhrnTydne(radkyObalu), [radkyObalu]);

  /**
   * Propíše rozdíl do stáčení — tam, kde vznikl.
   *
   * PŘEBYTEK = stočilo se a nezapsalo → chybějící zápis se doplní.
   * MANKO = zapsalo se víc, než se vyrobilo → záporný řádek to přizná.
   *
   * Datum je konec kontrolovaného období, u běžícího týdne dnešek — zápis
   * výroby nikdy nesmí spadnout do budoucnosti (viz tydenObdobi.doPocitani).
   */
  async function srovnat(r: TydenniRadek) {
    if (uklada || r.rozdil === 0 || r.napocitano === null) return;
    setUklada(r.klic);
    try {
      const polozka = {
        beer_id: r.beer_id,
        beer_name: r.beer_name,
        package_id: r.package_id,
        package_label: r.package_label,
        package_kind: r.package_kind,
        diffQty: r.rozdil,
      };
      const kdy = obdobi.doPocitani;
      const stitek = stitekTydne(obdobi.od);

      if (r.rozdil > 0 && r.sud) {
        // 🛢️ Sudy se berou z tanků se stejným pivem — bez toho zůstane sklep
        // nafouklý o pivo, které dávno odteklo.
        const objemL = Number(kniha?.obaly.find((p) => p.id === r.package_id)?.volume_l ?? 0);
        const rozdeleni = rozdelSudyDoTanku(tanky, r.beer_id, r.rozdil, objemL);
        const rady = kegovaniZapisy(polozka, kdy, stitek, rozdeleni);
        const { error } = await supabase.from('kegging').insert(rady);
        if (error) throw error;
        const tankChyba = await odectiZTanku(tanky, rozdeleni, r.beer_id);
        if (tankChyba) chyba(tankChyba);
        uspech(
          rozdeleni.dily.length === 0
            ? `Zapsáno ${r.rozdil} ks do „Stáčení KEG" (bez tanku — ve sklepě není z čeho).`
            : `Zapsáno ${r.rozdil} ks do „Stáčení KEG", odečteno z ${rozdeleni.dily.map((d) => d.label).join(' + ')}.`,
        );
      } else if (r.rozdil > 0) {
        // Lahve bez zdrojových sudů: kolik se jich načalo, se u týdenní
        // kontroly neví a hádat to by ubralo sudy, které nikdo neotevřel.
        const rady = lahvoveZapisy(polozka, kdy, stitek, []);
        const { error } = await supabase.from('bottling').insert(rady);
        if (error) throw error;
        uspech(`Zapsáno ${r.rozdil} ks do „Stáčení lahví" (sudy se neodečetly).`);
      } else {
        const zapisy = odectiZeStoceni(polozka, kdy, stitek);
        for (const z of zapisy) {
          const { error } = await supabase.from(z.table).insert([z.row]);
          if (error) throw error;
        }
        uspech(`Odečteno ${Math.abs(r.rozdil)} ks ze stáčení — vyrobilo se míň, než bylo zapsané.`);
      }

      await ulozZaznam(r, 'staceni');
      await nacti();
    } catch (e: any) {
      chyba('Zápis se nepovedl: ' + (e?.message || e));
    } finally {
      setUklada(null);
    }
  }

  /**
   * Dorovnání — pro rozdíl, který s výrobou nesouvisí (rozbité, ztracené,
   * nezapsaný výdej). Jde do `inventory_adjustments`, tedy vyrovnávací zápis
   * bokem: sklad srovná, ale výroba se nezmění. Proto je to druhá volba, ne
   * ta hlavní — schovat rozdíl sem je snadné a nic to nevysvětlí.
   */
  async function dorovnat(r: TydenniRadek) {
    if (uklada || r.rozdil === 0 || r.napocitano === null) return;
    setUklada(r.klic);
    try {
      const { error } = await supabase.from('inventory_adjustments').insert([zaznamDorovnani(r, obdobi)]);
      if (error) throw error;
      await ulozZaznam(r, 'dorovnani');
      uspech(`Dorovnáno ${r.rozdil > 0 ? '+' : ''}${r.rozdil} ks. Výroba zůstala beze změny.`);
      await nacti();
    } catch (e: any) {
      chyba('Dorovnání se nepovedlo: ' + (e?.message || e));
    } finally {
      setUklada(null);
    }
  }

  /** Záznam o kontrole. Jedno pivo × obal má v týdnu jediný řádek — přepisuje se. */
  async function ulozZaznam(r: TydenniRadek, vyreseno: 'staceni' | 'dorovnani' | 'ponechano' | null) {
    const { error } = await supabase
      .from('tydenni_inventura')
      .upsert([zaznamKontroly(r, obdobi, vyreseno)], { onConflict: 'tyden_od,beer_id,package_id' });
    if (error) chyba('Záznam o kontrole se neuložil: ' + error.message);
  }

  /** Uloží všechno napočítané naráz — rozdíly nechá být, ty se řeší po řádcích. */
  async function ulozVse() {
    const spocitane = vsechnyRadky.filter((r) => r.napocitano !== null);
    if (spocitane.length === 0) { oznam('Není co uložit — zatím není nic napočítané.'); return; }
    setUklada('vse');
    try {
      const { error } = await supabase
        .from('tydenni_inventura')
        .upsert(spocitane.map((r) => zaznamKontroly(r, obdobi, r.rozdil === 0 ? null : 'ponechano')), { onConflict: 'tyden_od,beer_id,package_id' });
      if (error) throw error;
      uspech(`Uloženo ${spocitane.length} napočítaných položek za týden ${popisTydne(obdobi.od, obdobi.do)}.`);
    } catch (e: any) {
      chyba('Uložení se nepovedlo: ' + (e?.message || e));
    } finally {
      setUklada(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Volba týdne */}
      <div className="card p-3.5 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPosun((p) => p - 1)}
            className="btn-secondary !rounded !px-3 min-h-[44px]"
            aria-label="Předchozí týden"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex-1 text-center">
            <p className="font-display font-black text-sm text-neutral-900 flex items-center justify-center gap-2">
              <CalendarRange size={16} className="text-amber-600" />
              {popisTydne(obdobi.od, obdobi.do)}
            </p>
            <p className="text-udaj font-bold text-neutral-500 mt-0.5">
              {obdobi.uzavreny
                ? 'Uzavřený týden'
                : `Běžící týden — počítá se po dnešek (${obdobi.doPocitani})`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPosun((p) => Math.min(0, p + 1))}
            disabled={posun >= 0}
            className="btn-secondary !rounded !px-3 min-h-[44px] disabled:opacity-40"
            aria-label="Další týden"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* ✅ Značka uzavření týdne — jen přehled, nic nezamyká (viz uzavritTyden). */}
        <div className="flex items-center gap-2">
          {uzavreno ? (
            <>
              <span className="chip bg-emerald-100 text-emerald-900 border-emerald-300 flex-1 justify-start">
                <Lock size={14} /> Uzavřeno{uzavreno.by ? ` — ${uzavreno.by}` : ''}
              </span>
              <button type="button" onClick={otevritTyden} disabled={uzaviram} className="btn-secondary !rounded !text-xs min-h-[44px]">
                <LockOpen size={14} /> Otevřít znovu
              </button>
            </>
          ) : (
            <button type="button" onClick={uzavritTyden} disabled={uzaviram} className="btn-primary !rounded w-full min-h-[44px]">
              <Lock size={16} /> Uzavřít týden
            </button>
          )}
        </div>

        {/* 📋 Počítání kusů, nebo přehled všeho, co se v týdnu dělo. */}
        <div className="flex items-stretch gap-1 rounded bg-neutral-100 border border-neutral-200 p-1">
          {([
            { klic: 'pocitani' as const, popisek: 'Počítání', Ikona: ListChecks },
            { klic: 'prehled' as const, popisek: 'Přehled týdne', Ikona: ClipboardList },
          ]).map(({ klic, popisek, Ikona }) => (
            <button
              key={klic}
              type="button"
              onClick={() => setRezim(klic)}
              className={`flex-1 !rounded !px-3 !py-2.5 !min-h-[44px] font-black text-xs transition flex items-center justify-center gap-1.5 ${
                rezim === klic ? 'btn-amber' : 'btn-ghost !border-none'
              }`}
            >
              <Ikona size={14} /> {popisek}
            </button>
          ))}
        </div>

        {rezim === 'pocitani' && (
          <>
            {/* 🍾/🛢️ Nahoře, jako první — na telefonu se přepíná hned po
                otevření, ještě než se vůbec začne počítat. */}
            <div className="flex items-stretch gap-1 rounded bg-neutral-100 border border-neutral-200 p-1">
              {([
                { klic: 'vse', popisek: 'Vše' },
                { klic: 'lahve', popisek: 'Lahve' },
                { klic: 'sudy', popisek: 'Sudy' },
              ] as const).map(({ klic, popisek }) => (
                <button
                  key={klic}
                  type="button"
                  onClick={() => setFiltrObalu(klic)}
                  className={`flex-1 !rounded !px-3 !py-2.5 !min-h-[44px] font-black text-xs transition ${
                    filtrObalu === klic ? 'btn-amber' : 'btn-ghost !border-none'
                  }`}
                >
                  {popisek}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative flex-1 min-w-[180px]">
                <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  value={hledat}
                  onChange={(e) => setHledat(e.target.value)}
                  placeholder="Hledat pivo nebo obal…"
                  className="input !pl-8 min-h-[44px] w-full"
                />
              </label>
              <button
                type="button"
                onClick={() => setJenRozdily((v) => !v)}
                className={`px-3.5 py-2.5 rounded font-black text-xs transition min-h-[44px] ${
                  jenRozdily
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'bg-neutral-100 text-neutral-700 border border-neutral-200 hover:bg-neutral-200'
                }`}
              >
                Jen rozdíly
              </button>
              <button type="button" onClick={nacti} disabled={bezi} className="btn-secondary !rounded min-h-[44px]">
                <RefreshCw size={16} className={bezi ? 'animate-spin' : ''} /> Načíst znovu
              </button>
              <button type="button" onClick={ulozVse} disabled={!!uklada || bezi} className="btn-primary !rounded min-h-[44px]">
                <Save size={16} /> Uložit kontrolu
              </button>
            </div>

            {!bezi && (
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="chip bg-neutral-100 text-neutral-700 border-neutral-300">
                  {souhrn.spocitano} / {radkyObalu.length} spočítáno
                </span>
                <span className="chip bg-emerald-100 text-emerald-900 border-emerald-300">
                  <Check size={14} /> {souhrn.sedi} sedí
                </span>
                {souhrn.prebytku > 0 && (
                  <span className="chip bg-sky-100 text-sky-900 border-sky-300">
                    <Plus size={14} /> {souhrn.prebytku} přebytků (+{souhrn.prebytekKusu} ks)
                  </span>
                )}
                {souhrn.manek > 0 && (
                  <span className="chip bg-rose-100 text-rose-900 border-rose-300">
                    <MinusCircle size={14} /> {souhrn.manek} manek (−{souhrn.mankoKusu} ks)
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {rezim === 'prehled' && <PrehledTydne obdobi={obdobi} kniha={kniha} setPage={setPage} />}

      {rezim === 'pocitani' && bezi && <Spinner />}

      {rezim === 'pocitani' && !bezi && radky.length === 0 && (
        <div className="card p-6 text-center text-sm font-bold text-neutral-500">
          {vsechnyRadky.length === 0
            ? 'Za tenhle týden není co počítat — sklad je prázdný a nic se nehýbalo.'
            : 'Nic neodpovídá filtru.'}
        </div>
      )}

      {rezim === 'pocitani' && !bezi && radky.length > 0 && (
        <div className="space-y-2">
          {radky.map((r) => {
            const sedi = r.napocitano !== null && r.rozdil === 0;
            const jeRozdil = r.napocitano !== null && r.rozdil !== 0;
            return (
              <div
                key={r.klic}
                className={`card p-3 border ${
                  jeRozdil ? (r.rozdil > 0 ? 'border-sky-300 bg-sky-50/50' : 'border-rose-300 bg-rose-50/50')
                    : sedi ? 'border-emerald-200' : 'border-neutral-200'
                }`}
              >
                {/* Na telefonu má název piva CELÝ ŘÁDEK, čísla jdou pod něj.
                    Tři sloupečky s pevnou šířkou (~210 px i s mezerami) jinak
                    ukrojí ze 390px displeje tolik, že na jméno zbude 150 —
                    a ořízne se přesně tam, kde se pivo pozná: „12° Světlý…",
                    „12° Tmav…". Přitom podle jména se řádek hledá. Od `sm`
                    výš se místa dost, tak zůstávají v jedné řadě. */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                    <p className="font-black text-sm text-neutral-900 break-words">{r.beer_name}</p>
                    <p className="text-xs font-bold text-neutral-500">{formatPackageLabel(r.package_label)}</p>
                  </div>

                  {/* Čísla drží pohromadě: na telefonu roztažená přes šířku,
                      ať políčko „napočítáno" padne pod palec a nelepí se
                      k okraji. */}
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="text-center shrink-0">
                      <p className="text-udaj font-black uppercase tracking-wider text-neutral-400">Čeká se</p>
                      <p className={`font-display font-black text-base tabular-nums ${r.ocekavano < 0 ? 'text-rose-600' : 'text-neutral-800'}`}>
                        {r.ocekavano}
                      </p>
                    </div>

                    <div className="text-center shrink-0">
                      <p className="text-udaj font-black uppercase tracking-wider text-neutral-400">Napočítáno</p>
                      {/* Desetinné ANO: lahve se počítají po kusech, ale načatý
                          sud se běžně zapisuje na půlky. */}
                      <input
                        inputMode="decimal"
                        value={napocitano[r.klic] ?? ''}
                        onChange={(e) => setNapocitano((m) => ({ ...m, [r.klic]: normalizujCislo(e.target.value, true) }))}
                        placeholder="—"
                        className="input !w-20 !px-2 text-center font-black tabular-nums min-h-[44px]"
                      />
                    </div>

                    <div className="text-center shrink-0 w-16">
                      <p className="text-udaj font-black uppercase tracking-wider text-neutral-400">Rozdíl</p>
                      <p className={`font-display font-black text-base tabular-nums ${
                        !jeRozdil ? 'text-neutral-300' : r.rozdil > 0 ? 'text-sky-700' : 'text-rose-700'
                      }`}>
                        {r.napocitano === null ? '—' : r.rozdil > 0 ? `+${r.rozdil}` : r.rozdil}
                      </p>
                    </div>
                  </div>
                </div>

                {jeRozdil && (
                  <div className="mt-2.5 pt-2.5 border-t border-neutral-200/70 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-neutral-600 flex-1 min-w-[180px]">
                      {r.rozdil > 0
                        ? `Přebytek ${r.rozdil} ks — nejspíš se stočilo a nezapsalo.`
                        : `Manko ${Math.abs(r.rozdil)} ks — nejspíš se zapsalo víc, než se vyrobilo.`}
                    </p>
                    <button
                      type="button"
                      onClick={() => srovnat(r)}
                      disabled={!!uklada}
                      className="btn-primary !rounded !text-xs min-h-[44px]"
                    >
                      {uklada === r.klic ? '…' : r.rozdil > 0 ? 'Zapsat do stáčení' : 'Odečíst ze stáčení'}
                    </button>
                    <button
                      type="button"
                      onClick={() => dorovnat(r)}
                      disabled={!!uklada}
                      className="btn-secondary !rounded !text-xs min-h-[44px]"
                    >
                      Dorovnat
                    </button>
                    <button
                      type="button"
                      onClick={() => setOtevrenyRadek((k) => (k === r.klic ? null : r.klic))}
                      className="btn-secondary !rounded !text-xs min-h-[44px]"
                    >
                      {otevrenyRadek === r.klic ? 'Skrýt detail' : 'Odkud se to vzalo?'}
                    </button>
                  </div>
                )}

                {jeRozdil && otevrenyRadek === r.klic && (
                  <DetailRozdilu pohyby={pohybyOtevrenehoRadku} objednavkyInfo={objednavkyInfo} setPage={setPage} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Přehled týdne — vedle počítání kusů i vidět VŠECHNO, co se v týdnu dělo:
 * objednávky (se stavem a proklikem na detail), stočení KEG, stočení lahví.
 * Kegging/bottling se NEnačítá znovu — obojí je už v `kniha` (celá skladová
 * kniha, viz nactiSkladovouKnihu), tenhle panel jen filtruje na týden.
 * Objednávky s položkami se táhnou zvlášť — kniha je nepotřebuje.
 */
function PrehledTydne({
  obdobi,
  kniha,
  setPage,
}: {
  obdobi: TydenObdobi;
  kniha: SkladovaKniha | null;
  setPage?: (p: any, sec?: string, sub?: string) => void;
}) {
  const [nacitaji, setNacitaji] = useState(true);
  const [objednavky, setObjednavky] = useState<PrehledObjednavka[]>([]);
  const [hledat, setHledat] = useState('');

  useEffect(() => {
    let zruseno = false;
    (async () => {
      setNacitaji(true);
      try {
        const { data: orders } = await fetchAllRows(
          'orders', 'id, order_date, delivery_date, place_name, status',
        ).or(`and(delivery_date.gte.${obdobi.od},delivery_date.lte.${obdobi.do}),and(delivery_date.is.null,order_date.gte.${obdobi.od},order_date.lte.${obdobi.do})`)
          .neq('status', 'storno');
        const seznam = (orders as any[]) ?? [];
        const ids = seznam.map((o) => o.id);
        let polozky: any[] = [];
        if (ids.length > 0) {
          const { data } = await fetchAllRows('order_items', 'order_id, beer_name, package_label, quantity').in('order_id', ids);
          polozky = (data as any[]) ?? [];
        }
        if (zruseno) return;
        setObjednavky(seznam.map((o) => ({
          id: o.id,
          place_name: o.place_name,
          order_date: o.order_date,
          delivery_date: o.delivery_date,
          status: o.status,
          polozky: polozky.filter((p) => p.order_id === o.id).map((p) => ({
            beer_name: p.beer_name ?? '?', package_label: p.package_label ?? '', quantity: Number(p.quantity) || 0,
          })),
        })).sort((a, b) => (a.delivery_date ?? a.order_date).localeCompare(b.delivery_date ?? b.order_date)));
      } finally {
        if (!zruseno) setNacitaji(false);
      }
    })();
    return () => { zruseno = true; };
  }, [obdobi.od, obdobi.do]);

  const { keggingZapisy, bottlingZapisy } = useMemo(() => {
    if (!kniha) return { keggingZapisy: [] as PrehledZapis[], bottlingZapisy: [] as PrehledZapis[] };
    const jmenoPiva = new Map(kniha.piva.map((b) => [b.id, b.name]));
    const obalPodleId = new Map(kniha.obaly.map((p) => [p.id, p.label]));
    const preved = (radky: any[]): PrehledZapis[] => radky
      .filter((r) => r.entry_date >= obdobi.od && r.entry_date <= obdobi.do)
      .map((r, i) => ({
        id: String(i),
        entry_date: r.entry_date,
        beer_name: jmenoPiva.get(r.beer_id) ?? '?',
        package_label: obalPodleId.get(r.package_id) ?? '?',
        quantity: Number(r.quantity) || 0,
        note: r.note ?? null,
      }))
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date));
    return { keggingZapisy: preved(kniha.kegging), bottlingZapisy: preved(kniha.bottling) };
  }, [kniha, obdobi.od, obdobi.do]);

  const objednavkyView = useMemo(() => objednavky.filter((o) => objednavkaShoduje(o, hledat)), [objednavky, hledat]);
  const keggingView = useMemo(() => keggingZapisy.filter((z) => zapisShoduje(z, hledat)), [keggingZapisy, hledat]);
  const bottlingView = useMemo(() => bottlingZapisy.filter((z) => zapisShoduje(z, hledat)), [bottlingZapisy, hledat]);

  if (nacitaji) return <div className="card p-6"><Spinner /></div>;

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          value={hledat}
          onChange={(e) => setHledat(e.target.value)}
          placeholder="Hledat odběratele, pivo, obal, poznámku…"
          className="input !pl-8 min-h-[44px] w-full"
        />
      </label>

      <SekcePrehledu nadpis={`Objednávky (${objednavkyView.length})`}>
        {objednavkyView.length === 0 ? (
          <p className="text-xs font-bold text-neutral-400 p-2">Žádné objednávky za tenhle týden.</p>
        ) : objednavkyView.map((o) => (
          <div key={o.id} className="flex flex-wrap items-start gap-2 p-2.5 rounded border border-neutral-200 bg-white">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-black text-sm text-neutral-900">{o.place_name ?? 'bez odběratele'}</span>
                  <span className="text-udaj font-bold text-neutral-400 tabular-nums">{o.delivery_date ?? o.order_date}</span>
                  <StitekStavu status={o.status ?? 'nova'} tridy="!text-udaj" />
                </div>
                <p className="text-xs font-medium text-neutral-600 mt-0.5">{popisPolozek(o.polozky)}</p>
              </div>
              <button
                type="button"
                onClick={() => setPage?.('orders_detail', undefined, `order:${o.id}`)}
                disabled={!setPage}
                className="btn-ghost !rounded !text-udaj !py-1.5 shrink-0 disabled:opacity-40"
              >
                <ExternalLink size={12} /> Detail
              </button>
          </div>
        ))}
      </SekcePrehledu>

      <SekcePrehledu nadpis={`Stočení KEG (${keggingView.length})`}>
        {keggingView.length === 0 ? (
          <p className="text-xs font-bold text-neutral-400 p-2">Žádné stočení sudů za tenhle týden.</p>
        ) : keggingView.map((z) => <RadekZapisu key={z.id} z={z} />)}
      </SekcePrehledu>

      <SekcePrehledu nadpis={`Stočení lahví (${bottlingView.length})`}>
        {bottlingView.length === 0 ? (
          <p className="text-xs font-bold text-neutral-400 p-2">Žádné stočení lahví za tenhle týden.</p>
        ) : bottlingView.map((z) => <RadekZapisu key={z.id} z={z} />)}
      </SekcePrehledu>
    </div>
  );
}

function SekcePrehledu({ nadpis, children }: { nadpis: string; children: ReactNode }) {
  return (
    <div className="card p-3 space-y-1.5">
      <p className="text-xs font-black uppercase tracking-wider text-neutral-500">{nadpis}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function RadekZapisu({ z }: { z: PrehledZapis }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded border border-neutral-200 bg-white text-xs">
      <span className="font-bold text-neutral-400 tabular-nums shrink-0">{z.entry_date}</span>
      <span className="font-black text-neutral-900 flex-1 min-w-0 truncate">{z.beer_name} {z.package_label}</span>
      <span className="font-black tabular-nums shrink-0">{z.quantity} ks</span>
      {z.note && <span className="text-neutral-500 font-medium truncate max-w-[40%]" title={z.note}>{z.note}</span>}
    </div>
  );
}

/** Rozpad pohybů za týden pro rozbalený řádek — a proklik na objednávky. */
function DetailRozdilu({
  pohyby,
  objednavkyInfo,
  setPage,
}: {
  pohyby: ReturnType<typeof movementsFor>;
  objednavkyInfo: Record<string, { place_name: string | null; delivery_date: string | null; status: string | null }>;
  setPage?: (p: any, sec?: string, sub?: string) => void;
}) {
  if (pohyby.length === 0) {
    return (
      <div className="mt-2.5 pt-2.5 border-t border-neutral-200/70 text-xs font-bold text-neutral-500">
        Za tenhle týden k téhle položce neleží žádný pohyb — rozdíl je z předchozího období.
      </div>
    );
  }
  return (
    <div className="mt-2.5 pt-2.5 border-t border-neutral-200/70 space-y-1.5">
      {pohyby.map((m, i) => {
        const info = m.orderId ? objednavkyInfo[m.orderId] : undefined;
        return (
          <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-bold text-neutral-400 tabular-nums shrink-0">{m.date}</span>
            <span className="font-bold text-neutral-700 flex-1 min-w-[120px]">{MOVEMENT_LABELS[m.kind]}</span>
            <span className={`font-black tabular-nums shrink-0 ${m.qty < 0 ? 'text-rose-700' : 'text-sky-700'}`}>
              {m.qty > 0 ? `+${m.qty}` : m.qty}
            </span>
            {m.kind === 'zavoz' && m.orderId && (
              <button
                type="button"
                onClick={() => setPage?.('orders_detail', undefined, `order:${m.orderId}`)}
                disabled={!setPage}
                className="chip badge-amber !text-udaj shrink-0 disabled:opacity-40"
                title={info ? `${info.place_name ?? 'bez odběratele'} — ${info.delivery_date ?? '?'}` : 'Otevřít objednávku'}
              >
                <ExternalLink size={11} />
                {info ? (info.place_name ?? 'bez odběratele') : 'Otevřít objednávku'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
