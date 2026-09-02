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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, Check, ChevronLeft, ChevronRight, MinusCircle, Plus, RefreshCw, Save, Search } from 'lucide-react';
import { supabase, formatPackageLabel } from '../lib/supabase';
import { Spinner } from './ui';
import { businessDateISO } from '../lib/businessDate';
import { nactiSkladovouKnihu, type SkladovaKniha } from '../lib/skladovaKnihaData';
import { stockForObdobi } from '../lib/stockLedger';
import { kegovaniZapisy, lahvoveZapisy, odectiZeStoceni } from '../lib/inventoryFix';
import { rozdelSudyDoTanku, type TankProRozdeleni } from '../lib/tankRozdeleni';
import { odectiZTanku } from '../lib/tankZapis';
import {
  jenAktivni, popisTydne, radkyTydne, souhrnTydne, stitekTydne, tydenObdobi, vychoziTyden,
  zaznamKontroly, type TydenniRadek,
} from '../lib/tydenniInventura';
import { chyba, oznam, uspech } from '../lib/toast';
import { normalizujCislo } from '../lib/cisloVstup';

export default function TydenniInventuraPanel() {
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
      const mapa: Record<string, string> = {};
      for (const r of ((ulozene as any[]) ?? [])) mapa[`${r.beer_id}__${r.package_id}`] = String(r.napocitano);
      setNapocitano(mapa);
    } catch (e: any) {
      chyba('Týdenní inventuru se nepodařilo načíst: ' + (e?.message || e));
    } finally {
      setBezi(false);
    }
  }, [obdobi.od]);

  useEffect(() => { nacti(); }, [nacti]);

  const vsechnyRadky = useMemo(() => {
    if (!kniha) return [];
    const sklad = stockForObdobi(kniha.pohyby, obdobi.od, obdobi.doPocitani);
    return jenAktivni(radkyTydne(sklad, kniha.piva, kniha.obaly, napocitano));
  }, [kniha, obdobi.od, obdobi.doPocitani, napocitano]);

  const radky = useMemo(() => {
    const q = hledat.trim().toLowerCase();
    return vsechnyRadky.filter((r) => {
      if (jenRozdily && r.rozdil === 0) return false;
      if (!q) return true;
      return `${r.beer_name} ${r.package_label}`.toLowerCase().includes(q);
    });
  }, [vsechnyRadky, hledat, jenRozdily]);

  const souhrn = useMemo(() => souhrnTydne(vsechnyRadky), [vsechnyRadky]);

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
      const { error } = await supabase.from('inventory_adjustments').insert([{
        entry_date: obdobi.doPocitani,
        beer_id: r.beer_id,
        beer_name: r.beer_name,
        package_id: r.package_id,
        package_label: r.package_label,
        quantity: r.rozdil,
        note: `Dorovnání z inventury ${stitekTydne(obdobi.od)} — ${r.package_label}`,
      }]);
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
            <p className="text-[11px] font-bold text-neutral-500 mt-0.5">
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

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
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
                ? 'bg-rose-500 text-white shadow-md'
                : 'bg-neutral-100 text-neutral-700 border border-neutral-200 hover:bg-neutral-200'
            }`}
          >
            Jen rozdíly
          </button>
          <button type="button" onClick={nacti} disabled={bezi} className="btn-secondary !rounded min-h-[44px]">
            <RefreshCw size={15} className={bezi ? 'animate-spin' : ''} /> Načíst znovu
          </button>
          <button type="button" onClick={ulozVse} disabled={!!uklada || bezi} className="btn-primary !rounded min-h-[44px]">
            <Save size={15} /> Uložit kontrolu
          </button>
        </div>

        {!bezi && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="chip bg-neutral-100 text-neutral-700 border-neutral-300">
              {souhrn.spocitano} / {vsechnyRadky.length} spočítáno
            </span>
            <span className="chip bg-emerald-100 text-emerald-900 border-emerald-300">
              <Check size={13} /> {souhrn.sedi} sedí
            </span>
            {souhrn.prebytku > 0 && (
              <span className="chip bg-sky-100 text-sky-900 border-sky-300">
                <Plus size={13} /> {souhrn.prebytku} přebytků (+{souhrn.prebytekKusu} ks)
              </span>
            )}
            {souhrn.manek > 0 && (
              <span className="chip bg-rose-100 text-rose-900 border-rose-300">
                <MinusCircle size={13} /> {souhrn.manek} manek (−{souhrn.mankoKusu} ks)
              </span>
            )}
          </div>
        )}
      </div>

      {bezi && <Spinner />}

      {!bezi && radky.length === 0 && (
        <div className="card p-6 text-center text-sm font-bold text-neutral-500">
          {vsechnyRadky.length === 0
            ? 'Za tenhle týden není co počítat — sklad je prázdný a nic se nehýbalo.'
            : 'Nic neodpovídá filtru.'}
        </div>
      )}

      {!bezi && radky.length > 0 && (
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-sm text-neutral-900 truncate">{r.beer_name}</p>
                    <p className="text-xs font-bold text-neutral-500">{formatPackageLabel(r.package_label)}</p>
                  </div>

                  <div className="text-center shrink-0">
                    <p className="text-[11px] font-black uppercase tracking-wider text-neutral-400">Čeká se</p>
                    <p className={`font-display font-black text-base tabular-nums ${r.ocekavano < 0 ? 'text-rose-600' : 'text-neutral-800'}`}>
                      {r.ocekavano}
                    </p>
                  </div>

                  <div className="text-center shrink-0">
                    <p className="text-[11px] font-black uppercase tracking-wider text-neutral-400">Napočítáno</p>
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
                    <p className="text-[11px] font-black uppercase tracking-wider text-neutral-400">Rozdíl</p>
                    <p className={`font-display font-black text-base tabular-nums ${
                      !jeRozdil ? 'text-neutral-300' : r.rozdil > 0 ? 'text-sky-700' : 'text-rose-700'
                    }`}>
                      {r.napocitano === null ? '—' : r.rozdil > 0 ? `+${r.rozdil}` : r.rozdil}
                    </p>
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
