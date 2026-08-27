// 📋 Přehled výdeje k vykopírování do tabulky.
// ---------------------------------------------------------------------------
// Fasování a Prodejna dohromady, jeden řádek na datum + odběratele + pivo,
// množství rozhozené do sloupců podle objemu obalu. Tlačítko zkopíruje celý
// obsah jako TSV, takže se do Excelu i Google Tabulek vloží rovnou do buněk.
import { useEffect, useMemo, useState } from 'react';
import { Copy, X } from 'lucide-react';
import { supabase, fetchAllRows } from '../lib/supabase';
import { Spinner } from './ui';
import { chyba, uspech } from '../lib/toast';
import { zavibruj } from '../lib/haptika';
import {
  SLOUPCE_LAHVE, SLOUPCE_SUDY, cisloProTabulku, formatDatum, prehledDoTsv,
  sestavPrehled, soucty, type ObalPrehled, type VydejRadek,
} from '../lib/prehledVydeje';

type Props = { open: boolean; onClose: () => void; obaly: ObalPrehled[] };

const prvniDenMesice = (iso: string) => `${iso.slice(0, 7)}-01`;
const dnesIso = () => new Date().toISOString().slice(0, 10);
const popisObjemu = (l: number) => `${String(l).replace('.', ',')} l`;

export default function PrehledVydejeModal({ open, onClose, obaly }: Props) {
  const [od, setOd] = useState(() => prvniDenMesice(dnesIso()));
  const [doKdy, setDoKdy] = useState(() => dnesIso());
  const [nacitam, setNacitam] = useState(false);
  const [zdroje, setZdroje] = useState<{ fasovani: VydejRadek[]; prodejna: VydejRadek[] }>({ fasovani: [], prodejna: [] });
  const [coZahrnout, setCoZahrnout] = useState<'obojí' | 'fasovani' | 'prodejna'>('obojí');
  // Výchozí je to, co se vkládá do existujícího listu: jen datové řádky
  // Datum → 0,33l. Hlavička a hektolitry jen na vyžádání.
  const [sHlavickou, setSHlavickou] = useState(false);

  useEffect(() => {
    if (!open) return;
    let zruseno = false;
    (async () => {
      setNacitam(true);
      try {
        const [fa, pr] = await Promise.all([
          fetchAllRows('fasovani', 'entry_date,beer_id,beer_name,package_id,quantity,who,note'),
          fetchAllRows('fasovani_private', 'entry_date,beer_id,beer_name,package_id,quantity,who,note'),
        ]);
        if (zruseno) return;
        setZdroje({
          fasovani: (fa.data as VydejRadek[]) ?? [],
          prodejna: (pr.data as VydejRadek[]) ?? [],
        });
      } catch (e) {
        chyba(e);
      } finally {
        if (!zruseno) setNacitam(false);
      }
    })();
    return () => { zruseno = true; };
  }, [open]);

  const radky = useMemo(() => {
    const vstup = [
      ...(coZahrnout === 'prodejna' ? [] : zdroje.fasovani),
      ...(coZahrnout === 'fasovani' ? [] : zdroje.prodejna),
    ];
    return sestavPrehled(vstup, obaly, { od, do: doKdy });
  }, [zdroje, obaly, od, doKdy, coZahrnout]);

  const celkem = useMemo(() => soucty(radky), [radky]);

  const moznostiTsv = { hlavicka: sHlavickou, soucet: sHlavickou, hektolitry: sHlavickou };

  async function kopiruj() {
    const tsv = prehledDoTsv(radky, moznostiTsv);
    try {
      await navigator.clipboard.writeText(tsv);
      zavibruj('hotovo');
      uspech(`Zkopírováno ${radky.length} ${radky.length === 1 ? 'řádek' : radky.length < 5 ? 'řádky' : 'řádků'} — vlož do tabulky.`);
    } catch {
      // Schránka nemusí být dostupná (starší webview, bez HTTPS) — pak
      // aspoň označíme text, ať jde zkopírovat ručně.
      const pole = document.getElementById('prehled-vydeje-tsv') as HTMLTextAreaElement | null;
      if (pole) {
        pole.focus();
        pole.select();
        chyba('Schránka není dostupná — text je označený, zkopíruj ho ručně (Ctrl+C).');
      } else {
        chyba('Zkopírování se nepovedlo.');
      }
    }
  }

  if (!open) return null;

  const sloupcuCelkem = 3 + SLOUPCE_SUDY.length + SLOUPCE_LAHVE.length + 3;

  return (
    <div className="fixed inset-0 z-[120] bg-neutral-950/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-6xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-4 border-b border-neutral-200 flex items-center gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-extrabold text-base text-neutral-900">Fasování a prodejna — přehled</h2>
            <p className="text-xs text-neutral-500 font-semibold mt-0.5">
              Zkopíruj a vlož do tabulky — sloupce se rozhodí samy.
            </p>
          </div>
          <button onClick={onClose} aria-label="Zavřít" className="w-11 h-11 grid place-items-center rounded-xl text-neutral-400 hover:bg-neutral-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 sm:p-4 border-b border-neutral-200 flex flex-wrap items-end gap-2 shrink-0">
          <label className="block">
            <span className="label !mb-0.5">Od</span>
            <input type="date" className="input !min-h-[44px]" value={od} onChange={(e) => setOd(e.target.value)} />
          </label>
          <label className="block">
            <span className="label !mb-0.5">Do</span>
            <input type="date" className="input !min-h-[44px]" value={doKdy} onChange={(e) => setDoKdy(e.target.value)} />
          </label>
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-neutral-100 border border-neutral-200">
            {(['obojí', 'fasovani', 'prodejna'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setCoZahrnout(v)}
                className={`min-h-[40px] px-3 rounded-xl text-xs font-black transition ${
                  coZahrnout === v ? 'bg-amber-500 text-neutral-950 shadow-sm' : 'text-neutral-600 hover:bg-white'
                }`}
              >
                {v === 'obojí' ? 'Obojí' : v === 'fasovani' ? 'Fasování' : 'Prodejna'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-bold text-neutral-600 min-h-[44px] px-1 cursor-pointer">
            <input type="checkbox" checked={sHlavickou} onChange={(e) => setSHlavickou(e.target.checked)} className="w-5 h-5 accent-amber-500" />
            i s hlavičkou a hl
          </label>
          <button onClick={kopiruj} disabled={!radky.length} className="btn-primary !rounded-xl !min-h-[44px] ml-auto disabled:opacity-50">
            <Copy className="w-4 h-4" /> Kopírovat
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-4">
          {nacitam ? (
            <div className="py-16"><Spinner /></div>
          ) : radky.length === 0 ? (
            <p className="py-16 text-center text-sm font-semibold text-neutral-500">
              V tomhle období není žádný výdej.
            </p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  <th colSpan={3} className="text-left py-1.5" />
                  <th colSpan={SLOUPCE_SUDY.length} className="py-1.5 border-b-2 border-amber-300 text-amber-800">Sudy</th>
                  <th colSpan={SLOUPCE_LAHVE.length} className="py-1.5 border-b-2 border-sky-300 text-sky-800">Lahve</th>
                  <th colSpan={3} className="py-1.5" />
                </tr>
                <tr className="text-[10px] font-black uppercase tracking-wider text-neutral-500 border-b border-neutral-300">
                  <th className="text-left py-1.5 pr-2">Datum</th>
                  <th className="text-left py-1.5 pr-2">Odběratel</th>
                  <th className="text-left py-1.5 pr-2">Druh piva</th>
                  {SLOUPCE_SUDY.map((l) => <th key={`s${l}`} className="text-right py-1.5 px-1.5 whitespace-nowrap">{popisObjemu(l)}</th>)}
                  {SLOUPCE_LAHVE.map((l) => <th key={`l${l}`} className="text-right py-1.5 px-1.5 whitespace-nowrap">{popisObjemu(l)}</th>)}
                  <th className="text-right py-1.5 px-1.5 whitespace-nowrap">sudy hl</th>
                  <th className="text-right py-1.5 px-1.5 whitespace-nowrap">lahve hl</th>
                  <th className="text-right py-1.5 pl-1.5 whitespace-nowrap">celkem hl</th>
                </tr>
              </thead>
              <tbody>
                {radky.map((r, i) => (
                  <tr key={`${r.datum}-${r.odberatel}-${r.pivo}-${i}`} className="border-b border-neutral-100">
                    <td className="py-1.5 pr-2 whitespace-nowrap font-bold text-neutral-700">{formatDatum(r.datum)}</td>
                    <td className="py-1.5 pr-2 font-bold text-neutral-900">{r.odberatel}</td>
                    <td className="py-1.5 pr-2 text-neutral-700">{r.pivo}</td>
                    {[...SLOUPCE_SUDY, ...SLOUPCE_LAHVE].map((l) => (
                      <td key={l} className="text-right py-1.5 px-1.5 tabular-nums font-bold text-neutral-900">
                        {r.kusy[Math.round(l * 100) / 100] || ''}
                      </td>
                    ))}
                    <td className="text-right py-1.5 px-1.5 tabular-nums text-neutral-600">{cisloProTabulku(r.sudyL / 100)}</td>
                    <td className="text-right py-1.5 px-1.5 tabular-nums text-neutral-600">{cisloProTabulku(r.lahveL / 100)}</td>
                    <td className="text-right py-1.5 pl-1.5 tabular-nums font-black text-neutral-900">{cisloProTabulku((r.sudyL + r.lahveL) / 100)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-neutral-300 font-black">
                  <td className="py-2 pr-2" colSpan={3}>Celkem</td>
                  {[...SLOUPCE_SUDY, ...SLOUPCE_LAHVE].map((l) => (
                    <td key={l} className="text-right py-2 px-1.5 tabular-nums">{celkem.kusy[Math.round(l * 100) / 100] || ''}</td>
                  ))}
                  <td className="text-right py-2 px-1.5 tabular-nums">{cisloProTabulku(celkem.sudyL / 100)}</td>
                  <td className="text-right py-2 px-1.5 tabular-nums">{cisloProTabulku(celkem.lahveL / 100)}</td>
                  <td className="text-right py-2 pl-1.5 tabular-nums">{cisloProTabulku((celkem.sudyL + celkem.lahveL) / 100)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {celkem.kusyJine > 0 && (
            <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-3">
              {celkem.kusyJine} ks je v obalu, který v téhle sestavě nemá svůj sloupec. Do hektolitrů se počítá,
              ale v mřížce ho neuvidíš — kdyby to mělo být vidět, řekni a sloupec doplním.
            </p>
          )}
        </div>

        {/* Záloha pro případ, že prohlížeč nedovolí zápis do schránky. */}
        <textarea
          id="prehled-vydeje-tsv"
          readOnly
          value={radky.length ? prehledDoTsv(radky, moznostiTsv) : ''}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />

        <div className="p-3 border-t border-neutral-200 shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold text-neutral-500">
            {radky.length} {radky.length === 1 ? 'řádek' : radky.length < 5 ? 'řádky' : 'řádků'}, {sloupcuCelkem} sloupců
          </span>
          <button onClick={kopiruj} disabled={!radky.length} className="btn-primary !rounded-xl !min-h-[44px] disabled:opacity-50">
            <Copy className="w-4 h-4" /> Kopírovat do schránky
          </button>
        </div>
      </div>
    </div>
  );
}
