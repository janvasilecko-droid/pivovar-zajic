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
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Package as PackageIcon } from 'lucide-react';
import { beerBg } from '../lib/supabase';
import { IkonaSud, IkonaLahev } from './ikony';
import { kusy } from '../lib/cisla';
import { uloz } from '../lib/uloziste';
import { tabulkaNakladky, vychoziNakladka, BEZ_DATA, type NalozitNaZavoz } from '../lib/nalozitNaZavoz';
import { businessDateISO } from '../lib/businessDate';

const DNY = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
/** Popisek dne v přepínači: Dnes / St 7. 10. / Neuvedeno. */
function popisDne(datum: string, dnes: string): string {
  if (datum === BEZ_DATA) return 'Neuvedeno';
  if (datum === dnes) return 'Dnes';
  const d = new Date(datum + 'T00:00:00');
  return `${DNY[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}

const KLIC_SBALENO = 'pivovar_nakladka_sbaleno';
const cti = (klic: string) => { try { return localStorage.getItem(klic); } catch { return null; } };

export default function NakladkaOkno({ nakladky, barvaPiva, onOtevrit }: {
  /** Nakládky po dnech (lib/nalozitNaZavoz.ts nakladkyPoDnech), „Neuvedeno" na konci. */
  nakladky: NalozitNaZavoz[];
  /** Barva piva z nastavení piv (podle názvu). */
  barvaPiva: (pivo: string) => string | null;
  /** Otevře Rozvoz na vybraném dni (null = bez data). */
  onOtevrit: (datum: string | null) => void;
}) {
  const [sbaleno, setSbaleno] = useState(() => cti(KLIC_SBALENO) === '1');
  function prepniSbaleni() {
    setSbaleno((s) => { uloz(KLIC_SBALENO, s ? '0' : '1'); return !s; });
  }
  // 📅 Den, na který se kouká (6. 10. 2026: „přidej tam možnost kliknout na
  // dny, kdy jsou další nakládky… Po St Čt Neuvedeno"). Výchozí nejbližší
  // závoz po dnešku; když vybraný den z dat zmizí, vrátí se na výchozí.
  const dnes = businessDateISO();
  const [vybrany, setVybrany] = useState<string | null>(null);
  useEffect(() => {
    if (vybrany === null || !nakladky.some((n) => n.datum === vybrany)) setVybrany(vychoziNakladka(nakladky, dnes));
  }, [nakladky, vybrany, dnes]);
  const nalozit = nakladky.find((n) => n.datum === vybrany) ?? null;
  const den = nalozit ? popisDne(nalozit.datum, dnes) : '';
  const tabulka = useMemo(() => tabulkaNakladky(nalozit?.polozky ?? []), [nalozit]);
  const sloupceSudu = tabulka.sloupce.filter((s) => s.druh === 'sudy').length;
  const sloupceLahvi = tabulka.sloupce.length - sloupceSudu;
  // Stejný vzhled jako tabulka Co stočit, ale VŽDY na šířku telefonu
  // (29. 9. 2026: „proč je to teď tak roztažené, dej to tak, ať se to vejde
  // na velikost telefonního displeje"): pevné rozvržení, pivo má třetinu
  // šířky, obaly se dělí o zbytek. Při hodně obalech menší písmo a bez „l".
  const husta = tabulka.sloupce.length > 5;
  const bunka = `px-0.5 py-1 text-center tabular-nums border-l border-neutral-200 ${husta ? 'text-udaj' : ''}`;
  const popisek = (kratce: string) => (tabulka.sloupce.length > 6 ? kratce.replace(/l$/i, '') : kratce);
  const hranice = (i: number) =>
    i > 0 && tabulka.sloupce[i].druh === 'lahve' && tabulka.sloupce[i - 1].druh === 'sudy' ? 'border-l-2 border-sky-300' : '';

  return (
    <section className="bg-white rounded border border-neutral-200/90 shadow-xs overflow-hidden min-w-0 max-w-full">
      <button
        type="button"
        onClick={prepniSbaleni}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left bg-neutral-50/60"
        aria-expanded={!sbaleno}
      >
        <span className="font-display font-black text-neutral-950 flex items-center gap-2 min-w-0">
          <PackageIcon size={18} className="shrink-0" />
          <span className="truncate">{nalozit ? `Nakládka ${nalozit.datum === BEZ_DATA ? '— bez data' : den}` : 'Nakládka závoz'}</span>
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
          {nakladky.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
              {nakladky.map((n) => {
                const aktivni = n.datum === vybrany;
                return (
                  <button key={n.datum || 'bez'} type="button" onClick={() => setVybrany(n.datum)} aria-pressed={aktivni}
                    className={`btn-zalozka !px-3 !gap-1.5 ${aktivni ? 'btn-zalozka-aktivni' : ''}`}>
                    {popisDne(n.datum, dnes)}
                    <span className={`px-1.5 rounded-full text-udaj font-black ${aktivni ? 'bg-neutral-950 text-amber-300' : 'bg-amber-300 text-amber-950'}`}>{n.kusuCelkem}</span>
                  </button>
                );
              })}
            </div>
          )}
          {!nalozit ? (
            <p className="text-sm font-bold text-neutral-600">Na příštích 7 dní nic k závozu.</p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full table-fixed text-sm border-collapse">
                  <colgroup>
                    <col style={{ width: husta ? '30%' : '40%' }} />
                    {tabulka.sloupce.map((s) => <col key={s.obal} />)}
                  </colgroup>
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
                        <th key={s.obal} title={s.obal} className={`${bunka} whitespace-nowrap overflow-hidden ${hranice(i)}`}>{popisek(s.kratce)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tabulka.radky.map((r) => (
                      <tr key={r.pivo} className="border-b border-neutral-200 even:bg-neutral-100/80">
                        <td className="px-1 py-1">
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
                <button type="button" className="btn-ghost !rounded !py-1 !px-2 text-xs shrink-0" onClick={() => onOtevrit(nalozit.datum === BEZ_DATA ? null : nalozit.datum)}>
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
