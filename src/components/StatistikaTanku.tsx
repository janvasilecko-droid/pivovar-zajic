// 🛢️ Statistika → Tanky. Pro každý tank: jaké pivo v něm je a od kdy, kolik se
// stáčí týdně, historie cyklů (pivo, doba, stočeno, výtrata). Výpočet je
// v lib/statistikaTanku.ts.
import { useEffect, useMemo, useState } from 'react';
import { supabase, fetchAllRows, beerBg, beerBorder, beerText, type Beer, type CellarTank } from '../lib/supabase';
import { posunDnu, pondeliTydne } from '../lib/statistika';
import { statistikaTanku, type CyklusStat, type StaceniZTanku, type StatTanku } from '../lib/statistikaTanku';
import { EmptyState, Spinner } from './ui';

const TYDNU = 8;
const cz = (n: number) => n.toLocaleString('cs-CZ');
const cz1 = (n: number) => n.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** 2026-10-05 → 5. 10. */
const kratce = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}. ${Number(m)}.`; };

/** Nad kolik procent se výtrata barví jako vysoká (stejně jako u cyklů ve Sklepě). */
const VYSOKA_VYTRATA_PCT = 3;

function Tydny({ tydny }: { tydny: StatTanku['tydny'] }) {
  const max = Math.max(1, ...tydny.map((t) => t.litry));
  return (
    <div className="flex items-end gap-1 h-24" role="img" aria-label={`Stočeno po týdnech: ${tydny.map((t) => `${kratce(t.od)} ${t.litry} l`).join(', ')}`}>
      {tydny.map((t) => (
        <div key={t.od} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
          <span className="text-udaj font-bold tabular-nums text-neutral-800">{t.litry > 0 ? cz(t.litry) : ''}</span>
          <div className="w-full rounded-t bg-amber-500" style={{ height: `${Math.max(t.litry > 0 ? 4 : 0, (t.litry / max) * 100) * 0.62}%` }} />
          <span className="text-udaj font-semibold text-neutral-600 mt-0.5">{kratce(t.od)}</span>
        </div>
      ))}
    </div>
  );
}

function KartaTanku({ t, pivo }: { t: StatTanku; pivo?: Beer }) {
  const n = t.nyni;
  return (
    <section className="card overflow-hidden" aria-label={t.label}>
      <div
        className={`px-3.5 py-2.5 border-l-4 ${beerText(pivo)}`}
        style={{ backgroundColor: beerBg(pivo), borderLeftColor: beerBorder(pivo) }}
      >
        <h3 className="font-display font-black text-base">{t.label}</h3>
        <p className="text-xs font-bold">
          {n ? `${n.pivo} · ${cz(n.zbyvaL)} l v tanku` : 'prázdný'}
        </p>
      </div>
      <div className="p-3.5 space-y-3">
        {n && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <Udaj nazev="Od" hodnota={n.od ? kratce(n.od) : '—'} />
            <Udaj nazev="Stáčí se" hodnota={n.dnu != null ? `${n.dnu} dní` : '—'} />
            <Udaj nazev="Stočeno" hodnota={`${cz(n.stoceneL)} l`} />
            <Udaj nazev="Týdně" hodnota={n.litruTydne != null ? `${cz(n.litruTydne)} l` : '—'} />
          </div>
        )}
        <div>
          <div className="text-udaj font-black uppercase tracking-wider text-neutral-600 mb-1">Stočeno z tanku po týdnech (litry)</div>
          <Tydny tydny={t.tydny} />
        </div>
        {t.cykly.length > 0 ? (
          <div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs font-bold text-neutral-800 mb-1">
              <span>Cyklů: {t.cykly.length}</span>
              {t.prumerDnu != null && <span>Průměrná doba: {cz1(t.prumerDnu)} dní</span>}
              {t.prumerLitruTydne != null && <span>Průměr: {cz(t.prumerLitruTydne)} l týdně</span>}
              {t.ztrataPct != null && <span>Výtrata celkem: {cz1(t.ztrataPct)} %</span>}
            </div>
            <div className="overflow-x-auto roluje-vodorovne">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left uppercase text-neutral-600">
                    <th scope="col" className="py-1 pr-2">Pivo</th>
                    <th scope="col" className="py-1 px-1">Od – do</th>
                    <th scope="col" className="py-1 px-1 text-right">Dní</th>
                    <th scope="col" className="py-1 px-1 text-right">Stočeno</th>
                    <th scope="col" className="py-1 px-1 text-right">Týdně</th>
                    <th scope="col" className="py-1 pl-1 text-right">Výtrata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 tabular-nums">
                  {t.cykly.map((c) => (
                    <tr key={`${c.od}-${c.do}-${c.pivo}`}>
                      <th scope="row" className="py-1.5 pr-2 text-left font-bold">{c.pivo}</th>
                      <td className="py-1.5 px-1 whitespace-nowrap">{c.od ? kratce(c.od) : '?'} – {kratce(c.do)}</td>
                      <td className="py-1.5 px-1 text-right">{c.dnu != null ? cz1(c.dnu) : '—'}</td>
                      <td className="py-1.5 px-1 text-right">{cz(c.stoceneL)} l</td>
                      <td className="py-1.5 px-1 text-right">{c.litruTydne != null ? `${cz(c.litruTydne)} l` : '—'}</td>
                      <td className={`py-1.5 pl-1 text-right font-bold ${c.ztrataPct != null && c.ztrataPct > VYSOKA_VYTRATA_PCT ? 'text-rose-700' : ''}`}>
                        {c.ztrataPct != null ? `${cz1(c.ztrataPct)} %` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-xs text-neutral-600">Zatím žádný ukončený cyklus tohoto tanku.</p>
        )}
      </div>
    </section>
  );
}

function Udaj({ nazev, hodnota }: { nazev: string; hodnota: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 border border-neutral-200 px-2.5 py-1.5">
      <div className="text-udaj font-black uppercase tracking-wider text-neutral-600">{nazev}</div>
      <div className="font-display font-extrabold tabular-nums text-neutral-900">{hodnota}</div>
    </div>
  );
}

export default function StatistikaTanku({ dnes }: { dnes: string }) {
  const [nacteno, setNacteno] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [cykly, setCykly] = useState<CyklusStat[]>([]);
  const [tanky, setTanky] = useState<CellarTank[]>([]);
  const [piva, setPiva] = useState<Beer[]>([]);
  const [staceni, setStaceni] = useState<StaceniZTanku[]>([]);

  useEffect(() => {
    let zrusene = false;
    const od = posunDnu(pondeliTydne(dnes), -7 * (TYDNU - 1));
    (async () => {
      const [c, t, b, k] = await Promise.all([
        supabase.from('cellar_tank_cycles').select('*').order('ended_at', { ascending: false }).limit(500),
        supabase.from('cellar_tanks').select('*').order('label'),
        supabase.from('beers').select('*'),
        fetchAllRows('kegging', 'entry_date,cellar_tank_id,source_volume_l').gte('entry_date', od),
      ]);
      if (zrusene) return;
      const e = c.error ?? t.error ?? b.error ?? k.error;
      if (e) setChyba(e.message);
      setCykly((c.data as CyklusStat[]) ?? []);
      setTanky((t.data as CellarTank[]) ?? []);
      setPiva((b.data as Beer[]) ?? []);
      setStaceni((k.data as StaceniZTanku[]) ?? []);
      setNacteno(true);
    })();
    return () => { zrusene = true; };
  }, [dnes]);

  const statistiky = useMemo(
    () => statistikaTanku({ cykly, tanky, staceni, dnes, tydnu: TYDNU }),
    [cykly, tanky, staceni, dnes],
  );

  if (!nacteno) return <Spinner />;
  if (chyba) return <EmptyState text={`Statistiku tanků se nepodařilo načíst: ${chyba}`} />;
  if (statistiky.length === 0) return <EmptyState text="Zatím nejsou žádné tanky." />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-700">
        Pro každý tank: co se v něm vaří a od kdy, kolik se z něj stáčí týdně a jak dopadly dřívější cykly (doba, stočeno, výtrata).
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {statistiky.map((t) => (
          <KartaTanku key={t.id} t={t} pivo={piva.find((b) => b.id === t.pivoId)} />
        ))}
      </div>
    </div>
  );
}
