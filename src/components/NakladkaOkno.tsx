// 🚚 Nakládka na nejbližší závoz — okno na ploše ve stylu „Co stočit".
// ---------------------------------------------------------------------------
// Z provozu 29. 9. 2026: „dej možnost tu nakládku na ploše minimalizovat
// (sbalit stejně jako Co stočit), udělej ji ve stejném stylu, ale dej to do
// 2 sloupců po 3 řádcích, když bude potřeba víc, tak po víc, ale primárně
// po 3" + „když tak zmenši písmo, ať ušetříme místo".
//
// Dřív to byla dlaždice v mřížce (3×2) — do ní se vešlo jen pár položek a
// nešla sbalit. Na plochu se dál přidává stejně (zaškrtnutím „Přehled na
// plochu" v Rozvozu nebo přes Přidat dlaždici); v úpravě plochy je vidět
// jako dlaždice, aby šla přesunout nebo odebrat.
//
// Sbalení se pamatuje v telefonu. Výpočet je v lib/nalozitNaZavoz.ts.
import { useState } from 'react';
import { ChevronDown, ChevronRight, Package as PackageIcon } from 'lucide-react';
import { beerBg, beerText } from '../lib/supabase';
import { kusy } from '../lib/cisla';
import { uloz } from '../lib/uloziste';
import type { NalozitNaZavoz } from '../lib/nalozitNaZavoz';

const KLIC_SBALENO = 'pivovar_nakladka_sbaleno';
const cti = (klic: string) => { try { return localStorage.getItem(klic); } catch { return null; } };

/** Řádků v každém ze dvou sloupců: primárně 3, víc jen když je víc položek. */
export function radkuNakladky(polozek: number): number {
  return Math.max(3, Math.ceil(polozek / 2));
}

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
  const polozky = nalozit?.polozky ?? [];
  const radku = radkuNakladky(polozky.length);

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
              {/* Dva sloupce, plní se shora dolů: 1–3 vlevo, 4–6 vpravo. */}
              <div
                className="grid grid-cols-2 grid-flow-col gap-x-1.5 gap-y-1"
                style={{ gridTemplateRows: `repeat(${radku}, auto)` }}
              >
                {polozky.map((p) => {
                  const pivo = { beer_color: barvaPiva(p.pivo) };
                  return (
                    <div
                      key={`${p.pivo}__${p.obal}`}
                      className={`flex items-baseline gap-1 text-udaj font-bold min-w-0 rounded px-1.5 py-0.5 ${beerText(pivo)}`}
                      style={{ backgroundColor: beerBg(pivo) }}
                    >
                      <span className="truncate">{p.pivo}</span>
                      <span className="opacity-80 truncate">{p.obal}</span>
                      <span className="ml-auto shrink-0 tabular-nums font-black">× {p.kusu}</span>
                    </div>
                  );
                })}
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
