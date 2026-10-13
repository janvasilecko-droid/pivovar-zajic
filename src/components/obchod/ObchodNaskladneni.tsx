// 📅 Obchod → Sklad: naskladněno po týdnech (fasování z aplikace + příjem).
// ---------------------------------------------------------------------------
// Z provozu 13. 10. 2026: „tabulka po týdnech, kde bude, kolik se daný týden
// daného piva a obalu naskladnilo, a dlaždice barevné přesně jako v appce."
// Počítá lib/obchodNaskladneni.ts. Dlaždice piva mají barvu piva jako ve Skladu
// pivovaru; týden se rozbaluje klepnutím, ten aktuální je rozbalený.
import { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { beerBg, beerBorder, beerInk } from '../../lib/supabase';
import { naskladneniPoTydnech } from '../../lib/obchodNaskladneni';
import type { DataObchodu } from '../../lib/obchodData';

const cs = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const kratce = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;

export function ObchodNaskladneni({ data, dnes }: { data: DataObchodu; dnes: string }) {
  const tydny = useMemo(
    () => naskladneniPoTydnech(data.vstup, data.piva, dnes, 8),
    [data.vstup, data.piva, dnes],
  );
  const [otevrene, setOtevrene] = useState<Set<string>>(() => new Set([tydny[0]?.od].filter(Boolean) as string[]));
  const obaly = useMemo(() => new Map(data.obaly.map((o) => [o.id, o])), [data.obaly]);
  const poradiPiva = useMemo(() => new Map(data.piva.map((b, i) => [b.id, b.sort_order ?? i])), [data.piva]);
  const pivoPodleId = useMemo(() => new Map(data.piva.map((b) => [b.id, b])), [data.piva]);

  if (tydny.every((t) => t.celkem === 0)) {
    return (
      <section aria-label="Naskladněno po týdnech" className="space-y-1.5">
        <h3 className="text-xs font-black uppercase tracking-wide text-neutral-600">Naskladněno po týdnech</h3>
        <div className="rounded-xl bg-sky-100 p-3 text-xs font-bold text-neutral-800">Zatím se nic nenaskladnilo. Fasování do obchodu se tu objeví po týdnech.</div>
      </section>
    );
  }

  const prepni = (od: string) => setOtevrene((dosud) => {
    const dalsi = new Set(dosud);
    if (dalsi.has(od)) dalsi.delete(od); else dalsi.add(od);
    return dalsi;
  });

  return (
    <section aria-label="Naskladněno po týdnech" className="space-y-2">
      <h3 className="text-xs font-black uppercase tracking-wide text-neutral-600">Naskladněno po týdnech</h3>
      <ul className="space-y-2">
        {tydny.map((t) => {
          const otevreno = otevrene.has(t.od);
          const piva = [...t.piva].sort((a, b) => (poradiPiva.get(a.beer_id) ?? 999) - (poradiPiva.get(b.beer_id) ?? 999));
          return (
            <li key={t.od} className="rounded-xl bg-amber-100">
              <button type="button" className="w-full flex items-center gap-3 p-3 text-left" onClick={() => prepni(t.od)} aria-expanded={otevreno}>
                <CalendarDays size={16} className="shrink-0 text-amber-800" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-black text-neutral-950">Týden {t.cislo}</div>
                  <div className="text-[11px] font-semibold text-neutral-700">{kratce(t.od)} – {kratce(t.do)}</div>
                </div>
                <div className="text-lg font-display font-black tabular-nums text-neutral-950">{t.celkem > 0 ? `+${cs(t.celkem)}` : '—'}</div>
                {otevreno ? <ChevronUp size={18} className="shrink-0 text-neutral-600" /> : <ChevronDown size={18} className="shrink-0 text-neutral-600" />}
              </button>
              {otevreno && (
                <div className="px-3 pb-3">
                  {piva.length === 0 ? (
                    <div className="text-xs font-bold text-neutral-700">Tenhle týden se nic nenaskladnilo.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {piva.map((p) => {
                        const pivo = pivoPodleId.get(p.beer_id);
                        const tmave = pivo ? beerInk(pivo) === '#ffffff' : false;
                        const radky = [...p.obaly].sort((a, z) => (obaly.get(a.package_id)?.sort_order ?? 999) - (obaly.get(z.package_id)?.sort_order ?? 999));
                        return (
                          <div
                            key={p.beer_id}
                            className="plocha-z-dat plocha-z-dat-tlumena rounded-xl border-2 p-3"
                            style={pivo ? { backgroundColor: beerBg(pivo), borderColor: beerBorder(pivo), ['--ink-plochy' as any]: beerInk(pivo) } : undefined}
                          >
                            <div className="flex items-baseline justify-between gap-2 mb-1.5">
                              <span className={`font-display font-black text-base truncate ${tmave ? 'text-white' : 'text-neutral-900'}`}>{pivo?.name ?? 'Pivo'}</span>
                              <span className={`font-black tabular-nums text-sm ${tmave ? 'text-white' : 'text-neutral-900'}`}>+{cs(p.celkem)}</span>
                            </div>
                            <table className="w-full text-xs font-semibold border-collapse bg-white/70 rounded">
                              <tbody>
                                {radky.map((o) => {
                                  const obal = obaly.get(o.package_id);
                                  return (
                                    <tr key={o.package_id}>
                                      <td className="py-1 px-2 text-neutral-600 font-bold">
                                        {obal?.label ?? 'obal'}
                                      </td>
                                      <td className="py-1 px-2 text-right font-extrabold tabular-nums text-emerald-700">+{cs(o.ks)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
