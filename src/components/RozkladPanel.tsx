// 🗓️🔎 Rozklad skladu — dlaždice piva a obalu (jako jinde v appce, viz Stáčení
// KEG), pak zvolený týden rozepsaný po dnech. Nahrazuje dřívější „Rozpad
// piva" (jedno dlouhé období, výběr přes <select>) — z provozu: „kde je ten
// jeden sud" se hledá po dnech, ne v součtu za celý měsíc.
//
// Počítá se ze STEJNÉ skladové knihy jako Sklad, Inventura a Týdenní
// inventura (lib/stockLedger, lib/skladovaKnihaData) — jen se nakrájí po
// dnech (lib/rozkladSkladu). Vlastní počítání by byla další, možná jiná
// pravda o tomtéž.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarRange, ChevronLeft, ChevronRight, ExternalLink, PackageSearch } from 'lucide-react';
import { supabase, useRealtime, formatPackageLabel, type Beer, type Package } from '../lib/supabase';
import { Spinner } from './ui';
import { BeerTileGrid, BeerTilePanel } from './BeerTileGrid';
import { chyba } from '../lib/toast';
import { businessDateISO } from '../lib/businessDate';
import { jeSud } from '../lib/inventoryFix';
import { jeLimonada } from '../lib/limonady';
import { nactiSkladovouKnihu } from '../lib/skladovaKnihaData';
import { MOVEMENT_LABELS, stockAsOf, stockKey, type Movement } from '../lib/stockLedger';
import { popisTydne, tydenObdobi, vychoziTyden } from '../lib/tydenniInventura';
import { denniRozpad, type DenRozkladu } from '../lib/rozkladSkladu';

type ObjInfo = { place_name: string | null; delivery_date: string | null; status: string | null };

const TABULKY = [
  'beers', 'packages', 'bottling', 'kegging', 'fasovani', 'fasovani_private',
  'writeoffs', 'inventory', 'inventory_adjustments', 'zavoz_deductions', 'akce', 'akce_items', 'keg_prefuk',
];

export default function RozkladPanel({ setPage }: { setPage?: (p: any, sec?: string, sub?: string) => void } = {}) {
  const dnes = businessDateISO();
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [pohyby, setPohyby] = useState<Movement[]>([]);
  const [bezi, setBezi] = useState(true);

  const [expandedBeerId, setExpandedBeerId] = useState<string | null>(null);
  const [packageId, setPackageId] = useState<string | null>(null);
  const [posun, setPosun] = useState(() => vychoziTyden(dnes));
  const obdobi = useMemo(() => tydenObdobi(dnes, posun), [dnes, posun]);

  const [objednavkyInfo, setObjednavkyInfo] = useState<Record<string, ObjInfo>>({});

  const nacti = useCallback(async () => {
    setBezi(true);
    try {
      const [{ data: b }, { data: pk }, kniha] = await Promise.all([
        supabase.from('beers').select('*').order('sort_order'),
        supabase.from('packages').select('*').order('sort_order'),
        nactiSkladovouKnihu(),
      ]);
      // Aktivní piva bez limonád — stejný filtr jako dlaždice ve Stáčení a
      // Inventuře (limonády se do skladové bilance nepočítají, viz lib/limonady.ts).
      setBeers(((b as Beer[]) ?? []).filter((x) => x.is_active && !jeLimonada(x.name)));
      setPackages((pk as Package[]) ?? []);
      setPohyby(kniha.pohyby);
    } catch (e: any) {
      chyba('Rozklad se nepodařilo načíst: ' + (e?.message || e));
    } finally {
      setBezi(false);
    }
  }, []);

  useEffect(() => { nacti(); }, [nacti]);
  useRealtime(TABULKY, () => nacti());

  const expandedBeer = beers.find((b) => b.id === expandedBeerId) || null;

  const sudy = useMemo(
    () => packages.filter((p) => jeSud(p.kind, p.label)).sort((a, z) => Number(z.volume_l) - Number(a.volume_l)),
    [packages],
  );
  const lahve = useMemo(() => packages.filter((p) => !jeSud(p.kind, p.label)), [packages]);

  const dny: DenRozkladu[] = useMemo(() => {
    if (!expandedBeerId || !packageId) return [];
    return denniRozpad(pohyby, expandedBeerId, packageId, obdobi.od, obdobi.do);
  }, [pohyby, expandedBeerId, packageId, obdobi.od, obdobi.do]);

  // 📦 Stav teď — nezávisle na zvoleném týdnu, ať je pořád na očích, kolik
  // toho je aktuálně na skladě (to, s čím se přišlo na tuhle obrazovku).
  const stavTed = useMemo(() => {
    if (!expandedBeerId || !packageId) return 0;
    return stockAsOf(pohyby, dnes).get(stockKey(expandedBeerId, packageId))?.qty ?? 0;
  }, [pohyby, expandedBeerId, packageId, dnes]);

  // Jména odběratelů k objednávkám vidět v zobrazeném týdnu — dotahují se
  // líně, stejně jako v detailu Týdenní inventury (lib TydenniInventuraPanel).
  useEffect(() => {
    const chybejici = Array.from(new Set(
      dny.flatMap((d) => d.pohyby).filter((m) => m.kind === 'zavoz' && m.orderId).map((m) => m.orderId as string),
    )).filter((id) => !objednavkyInfo[id]);
    if (chybejici.length === 0) return;
    let zruseno = false;
    supabase.from('orders').select('id,place_name,delivery_date,status').in('id', chybejici).limit(chybejici.length).then(({ data }) => {
      if (zruseno || !data) return;
      setObjednavkyInfo((prev) => {
        const next = { ...prev };
        for (const o of data as any[]) next[o.id] = { place_name: o.place_name, delivery_date: o.delivery_date, status: o.status };
        return next;
      });
    });
    return () => { zruseno = true; };
  }, [dny, objednavkyInfo]);

  function otevriPivo(b: Beer) {
    setExpandedBeerId(b.id);
    // Výchozí obal: co bylo naposled zvolené, jinak první sud, jinak první lahev.
    setPackageId((p) => p ?? sudy[0]?.id ?? lahve[0]?.id ?? null);
  }

  return (
    <div className="space-y-4">
      <div className="rounded border-2 border-sky-300 bg-sky-50 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sky-900">
          <PackageSearch className="ikona-text" />
          <span className="text-xs font-black uppercase tracking-wider">Rozklad skladu — týden po dnech</span>
        </div>
        <p className="text-[11px] font-bold text-sky-800 leading-snug">
          Klepni na pivo, pak na obal (sud, nebo lahev) — uvidíš zvolený týden rozepsaný po dnech:
          co se ten den stočilo, vyfasovalo, vydalo na objednávku i jaký byl stav na skladě.
        </p>
      </div>

      {bezi && <Spinner />}

      {!bezi && (
        <BeerTileGrid
          beers={beers}
          onSelect={otevriPivo}
          summaryFor={() => ({ filled: false, label: '' })}
        />
      )}

      {expandedBeer && (
        <BeerTilePanel beer={expandedBeer} onClose={() => setExpandedBeerId(null)}>
          <div className="space-y-1.5 mb-2">
            {sudy.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {sudy.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPackageId(p.id)}
                    className={`!rounded !px-3 !py-1.5 !min-h-[44px] font-black text-xs transition ${packageId === p.id ? 'btn-amber' : 'btn-ghost'}`}
                  >
                    {formatPackageLabel(p.label)}
                  </button>
                ))}
              </div>
            )}
            {lahve.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {lahve.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPackageId(p.id)}
                    className={`!rounded !px-3 !py-1.5 !min-h-[44px] font-black text-xs transition ${packageId === p.id ? 'btn-amber' : 'btn-ghost'}`}
                  >
                    {formatPackageLabel(p.label)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {packageId && (
            <>
              <div className="flex items-center gap-2 rounded bg-neutral-50 border border-neutral-200 p-2">
                <button
                  type="button"
                  onClick={() => setPosun((x) => x - 1)}
                  className="btn-secondary !rounded !px-2.5 min-h-[44px]"
                  aria-label="Předchozí týden"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="flex-1 text-center">
                  <p className="text-xs font-black text-neutral-900 flex items-center justify-center gap-1.5">
                    <CalendarRange size={14} className="text-amber-600" /> {popisTydne(obdobi.od, obdobi.do)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPosun((x) => Math.min(0, x + 1))}
                  disabled={posun >= 0}
                  className="btn-secondary !rounded !px-2.5 min-h-[44px] disabled:opacity-40"
                  aria-label="Další týden"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 rounded bg-amber-50 border border-amber-200 px-3 py-2 mt-2">
                <span className="text-udaj font-bold uppercase tracking-wide text-amber-800">Na skladě teď ({dnes})</span>
                <span className="text-sm font-black text-amber-900 tabular-nums">{stavTed} ks</span>
              </div>

              <div className="mt-2 space-y-1.5">
                {dny.map((d) => (
                  <DenPanel key={d.datum} den={d} dnes={dnes} objednavkyInfo={objednavkyInfo} setPage={setPage} />
                ))}
              </div>
            </>
          )}
        </BeerTilePanel>
      )}
    </div>
  );
}

const DNY_CS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

function nazevDne(datum: string): string {
  return DNY_CS[new Date(datum + 'T00:00:00Z').getUTCDay()];
}

/** Jeden den v týdenním rozkladu — datum, každý pohyb toho dne a stav před/po. */
function DenPanel({
  den, dnes, objednavkyInfo, setPage,
}: {
  den: DenRozkladu;
  dnes: string;
  objednavkyInfo: Record<string, ObjInfo>;
  setPage?: (p: any, sec?: string, sub?: string) => void;
}) {
  const jeDnes = den.datum === dnes;
  const budouci = den.datum > dnes;
  const zmena = den.stavNaKonci - den.stavNaZacatku;

  return (
    <div
      className={`rounded border p-2.5 ${
        jeDnes ? 'border-amber-400 bg-amber-50/60' : budouci ? 'border-neutral-200 bg-neutral-50 opacity-60' : 'border-neutral-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-black text-neutral-900">{nazevDne(den.datum)}</span>
          <span className="text-udaj font-bold text-neutral-400 tabular-nums">{den.datum.slice(8, 10)}.{den.datum.slice(5, 7)}.</span>
          {jeDnes && <span className="chip badge-amber !text-udaj">dnes</span>}
        </div>
        <div className="flex items-center gap-2 text-udaj font-bold text-neutral-500 tabular-nums">
          <span>{den.stavNaZacatku} → {den.stavNaKonci} ks</span>
          {zmena !== 0 && (
            <span className={`font-black ${zmena > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {zmena > 0 ? `+${zmena}` : zmena}
            </span>
          )}
        </div>
      </div>

      {den.pohyby.length > 0 && (
        <div className="mt-1.5 space-y-1 pt-1.5 border-t border-black/5">
          {den.pohyby.map((m, i) => {
            const info = m.orderId ? objednavkyInfo[m.orderId] : undefined;
            return (
              <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                <span className="font-bold text-neutral-700 flex-1 min-w-[140px]">{MOVEMENT_LABELS[m.kind]}</span>
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
                    <ExternalLink size={11} /> {info ? (info.place_name ?? 'bez odběratele') : 'Otevřít objednávku'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
