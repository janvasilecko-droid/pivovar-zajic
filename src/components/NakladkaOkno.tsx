// 🚚 Nakládka na nejbližší závoz — okno na ploše ve stylu „Co stočit".
// ---------------------------------------------------------------------------
// Z provozu 29. 9. 2026: „dej možnost tu nakládku na ploše minimalizovat
// (sbalit stejně jako Co stočit)" a pak „udělej ji ve stejném stylu jako
// tu tabulku Co stočit" — řádek = pivo, sloupec = obal, dole součet
// (lib/nalozitNaZavoz.ts tabulkaNakladky).
//
// Dřív to byla dlaždice v mřížce (3×2) — do ní se vešlo jen pár položek a
// nešla sbalit. Na plochu se dál přidává stejně (zaškrtnutím „Přehled na
// plochu" v Rozvozu nebo přes Přidat dlaždici); v úpravě plochy je vidět
// jako dlaždice, aby šla přesunout nebo odebrat.
//
// Sbalení se pamatuje v telefonu. Výpočet je v lib/nalozitNaZavoz.ts.
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Package as PackageIcon } from 'lucide-react';
import { beerBg } from '../lib/supabase';
import { IkonaSud, IkonaLahev } from './ikony';
import { kusy } from '../lib/cisla';
import { uloz } from '../lib/uloziste';
import { tabulkaNakladky, type NalozitNaZavoz } from '../lib/nalozitNaZavoz';

const KLIC_SBALENO = 'pivovar_nakladka_sbaleno';
const cti = (klic: string) => { try { return localStorage.getItem(klic); } catch { return null; } };

export default function NakladkaOkno({ nalozit, barvaPiva, onOtevrit }: {
  nalozit: NalozitNaZavoz | null;
  /** Barva piva z nastavení piv (podle názvu). */
  barvaPiva: (pivo: string) => string | null;
  onOtevrit: () => void;
}) {
  const [sbaleno, setSbaleno] = useState(() => cti(KLIC_SBALENO) === '1');
  function prepniSbaleni() {
    setSbaleno((s) => { uloz(KLIC_SBALENO, s ? '0' : '1'); return !s; });
  }
  const den = nalozit
    ? new Date(nalozit.datum + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })
    : '';
  const tabulka = useMemo(() => tabulkaNakladky(nalozit?.polozky ?? []), [nalozit]);
  const sloupceSudu = tabulka.sloupce.filter((s) => s.druh === 'sudy').length;
  const sloupceLahvi = tabulka.sloupce.length - sloupceSudu;
  // Stejné buňky a předěl sudy/lahve jako tabulka Co stočit.
  const bunka = 'px-1 py-1 text-center tabular-nums w-11 border-l border-neutral-200';
  const hranice = (i: number) =>
    i > 0 && tabulka.sloupce[i].druh === 'lahve' && tabulka.sloupce[i - 1].druh === 'sudy' ? 'border-l-2 border-sky-300' : '';

  return (
    <section className="bg-white rounded border border-neutral-200/90 shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={prepniSbaleni}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left bg-neutral-50/60"
        aria-expanded={!sbaleno}
      >
        <span className="font-display font-black text-neutral-950 flex items-center gap-2 min-w-0">
          <PackageIcon size={18} className="shrink-0" />
          <span className="truncate">{nalozit ? `Nakládka ${den}` : 'Nakládka závoz'}</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {nalozit && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-xs tabular-nums">
              {kusy(nalozit.kusuCelkem)}
            </span>
          )}
          {sbaleno ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {!sbaleno && (
        <div className="px-3 pb-2.5 pt-2 space-y-1.5">
          {!nalozit ? (
            <p className="text-sm font-bold text-neutral-600">Na příštích 7 dní nic k závozu.</p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    {sloupceSudu > 0 && sloupceLahvi > 0 && (
                      <tr className="text-udaj font-black text-neutral-500">
                        <th />
                        <th colSpan={sloupceSudu} className="px-1 pt-0.5 text-center border-b-2 border-amber-300">
                          <span className="inline-flex items-center gap-1"><IkonaSud size={12} /> Sudy</span>
                        </th>
                        <th colSpan={sloupceLahvi} className="px-1 pt-0.5 text-center border-b-2 border-sky-300">
                          <span className="inline-flex items-center gap-1"><IkonaLahev size={12} /> Lahve</span>
                        </th>
                      </tr>
                    )}
                    <tr className="text-udaj font-black text-neutral-600 border-b border-neutral-200">
                      <th className="text-left px-1 py-1">Pivo</th>
                      {tabulka.sloupce.map((s, i) => (
                        <th key={s.obal} title={s.obal} className={`${bunka} whitespace-nowrap ${hranice(i)}`}>{s.kratce}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tabulka.radky.map((r) => (
                      <tr key={r.pivo} className="border-b border-neutral-200 even:bg-neutral-100/80">
                        <td className="px-1 py-1 max-w-0 w-full">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-neutral-300" style={{ background: beerBg({ beer_color: barvaPiva(r.pivo) }) }} />
                            <span className="truncate font-bold text-neutral-900">{r.pivo}</span>
                          </span>
                        </td>
                        {tabulka.sloupce.map((s, i) => {
                          const n = r.kusy.get(s.obal) ?? 0;
                          return (
                            <td key={s.obal} className={`${bunka} ${hranice(i)}`}>
                              {n > 0 ? <span className="font-display font-black text-neutral-950">{n}</span> : <span className="text-neutral-300">·</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-neutral-300 font-black">
                      <td className="px-1 py-1 text-udaj text-neutral-600">Celkem</td>
                      {tabulka.sloupce.map((s, i) => (
                        <td key={s.obal} className={`${bunka} ${hranice(i)} font-display text-neutral-950`}>{tabulka.soucty.get(s.obal) || ''}</td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-udaj font-bold text-neutral-600 truncate">
                  {nalozit.objednavek} obj. · {nalozit.mista.join(', ')}
                </span>
                <button type="button" className="btn-ghost !rounded !py-1 !px-2 text-xs shrink-0" onClick={onOtevrit}>
                  Otevřít rozvoz
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
