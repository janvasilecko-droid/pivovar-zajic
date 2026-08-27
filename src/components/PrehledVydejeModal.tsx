// 📋 Přehled zápisů k vykopírování do tabulky.
// ---------------------------------------------------------------------------
// Jeden modál pro všechny listy pivovaru. Liší se jen tím, které tabulky se
// načtou a jakou mají podobu (varianta) — viz lib/prehledVydeje.ts.
//
// Tlačítko „Kopírovat" dává do schránky JEN DATOVÉ ŘÁDKY jako TSV. Přesně to,
// co se vkládá do existujícího listu: hlavička tam už je a hektolitry si list
// počítá vzorcem, takže vložením hodnoty by se vzorec přepsal.
import { useEffect, useMemo, useState } from 'react';
import { Copy, X } from 'lucide-react';
import { fetchAllRows } from '../lib/supabase';
import { Spinner } from './ui';
import { chyba, uspech } from '../lib/toast';
import { zavibruj } from '../lib/haptika';
import {
  SLOUPCE_SUDY, VARIANTY, formatDatum, popisSloupce, popisneSloupce, prehledDoTsv,
  sestavPrehled, sloupceVarianty, soucty,
  type ObalPrehled, type VariantaPrehledu, type VydejRadek,
} from '../lib/prehledVydeje';

/** Jedna tabulka, ze které se dá přehled poskládat. */
export type ZdrojPrehledu = {
  tabulka: string;
  popis: string;
  /** Sloupce k načtení; výchozí stačí pro výdejové tabulky. */
  sloupce?: string;
  /**
   * Převod řádku z databáze na položky přehledu. Jeden zápis může dát víc
   * položek — u stáčení lahví se z jednoho řádku berou zvlášť stočené lahve
   * a zvlášť sudy, které se na ně spotřebovaly.
   */
  prevod?: (r: any) => VydejRadek[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  obaly: ObalPrehled[];
  zdroje: ZdrojPrehledu[];
  nadpis: string;
  varianta: VariantaPrehledu;
  /** Tanky pro překlad cellar_tank_id na označení — list stáčení KEG. */
  tanky?: { id: string; label: string | null }[];
};

const prvniDenMesice = (iso: string) => `${iso.slice(0, 7)}-01`;
const dnesIso = () => new Date().toISOString().slice(0, 10);
const VYCHOZI_SLOUPCE = 'entry_date,beer_name,package_id,quantity,who,note';

export default function PrehledVydejeModal({ open, onClose, obaly, zdroje, nadpis, varianta, tanky = [] }: Props) {
  const [od, setOd] = useState(() => prvniDenMesice(dnesIso()));
  const [doKdy, setDoKdy] = useState(() => dnesIso());
  const [nacitam, setNacitam] = useState(false);
  const [data, setData] = useState<Record<string, VydejRadek[]>>({});
  const [coZahrnout, setCoZahrnout] = useState<string>('vse');
  const [seskupeni, setSeskupeni] = useState<'den' | 'souhrn'>('den');
  const [sHlavickou, setSHlavickou] = useState(false);

  const popisVarianty = VARIANTY[varianta];
  const sloupce = sloupceVarianty(varianta);

  useEffect(() => {
    if (!open) return;
    let zruseno = false;
    (async () => {
      setNacitam(true);
      try {
        const nactene = await Promise.all(
          zdroje.map((z) => fetchAllRows(z.tabulka, z.sloupce ?? VYCHOZI_SLOUPCE)),
        );
        if (zruseno) return;
        const out: Record<string, VydejRadek[]> = {};
        zdroje.forEach((z, i) => {
          const syrove = (nactene[i].data as any[]) ?? [];
          out[z.tabulka] = z.prevod ? syrove.flatMap(z.prevod) : (syrove as VydejRadek[]);
        });
        setData(out);
      } catch (e) {
        chyba(e);
      } finally {
        if (!zruseno) setNacitam(false);
      }
    })();
    return () => { zruseno = true; };
  }, [open, zdroje]);

  const radky = useMemo(() => {
    const mapaTanku = new Map(tanky.map((t) => [t.id, (t.label || '').trim()]));
    const vstup = zdroje
      .filter((z) => coZahrnout === 'vse' || coZahrnout === z.tabulka)
      .flatMap((z) => data[z.tabulka] ?? [])
      // Označení tanku se dotahuje až tady — zdroj vrací jen jeho id.
      .map((r: any) => (r.cellar_tank_id ? { ...r, tank: mapaTanku.get(r.cellar_tank_id) ?? '' } : r));
    return sestavPrehled(vstup, obaly, { od, do: doKdy, seskupeni });
  }, [data, zdroje, obaly, od, doKdy, coZahrnout, seskupeni, tanky]);

  const celkem = useMemo(() => soucty(radky), [radky]);
  const moznostiTsv = {
    varianta,
    bezData: seskupeni === 'souhrn',
    hlavicka: sHlavickou,
    soucet: sHlavickou,
  };
  const popisne = popisneSloupce(varianta, seskupeni === 'souhrn');

  async function kopiruj() {
    const tsv = prehledDoTsv(radky, moznostiTsv);
    try {
      await navigator.clipboard.writeText(tsv);
      zavibruj('hotovo');
      uspech(`Zkopírováno ${radky.length} ${radky.length === 1 ? 'řádek' : radky.length < 5 ? 'řádky' : 'řádků'} — vlož do listu.`);
    } catch {
      // Schránka nemusí být dostupná (starší webview, bez HTTPS) — pak aspoň
      // označíme text, ať jde zkopírovat ručně.
      const pole = document.getElementById('prehled-vydeje-tsv') as HTMLTextAreaElement | null;
      if (pole) {
        pole.classList.remove('sr-only');
        pole.focus();
        pole.select();
        chyba('Schránka není dostupná — text je označený, zkopíruj ho ručně (Ctrl+C).');
      } else {
        chyba('Zkopírování se nepovedlo.');
      }
    }
  }

  if (!open) return null;

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
            <h2 className="font-display font-extrabold text-base text-neutral-900">{nadpis}</h2>
            <p className="text-xs text-neutral-500 font-semibold mt-0.5">
              Zkopíruj a vlož do listu — sloupce se rozhodí samy, hektolitry si list dopočítá.
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

          {zdroje.length > 1 && (
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-neutral-100 border border-neutral-200">
              {[{ tabulka: 'vse', popis: 'Vše' }, ...zdroje].map((z) => (
                <button
                  key={z.tabulka}
                  onClick={() => setCoZahrnout(z.tabulka)}
                  className={`min-h-[40px] px-3 rounded-xl text-xs font-black transition ${
                    coZahrnout === z.tabulka ? 'bg-amber-500 text-neutral-950 shadow-sm' : 'text-neutral-600 hover:bg-white'
                  }`}
                >
                  {z.popis}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1 p-1 rounded-2xl bg-neutral-100 border border-neutral-200">
            {([['den', 'Po dnech'], ['souhrn', 'Souhrn za období']] as const).map(([v, popis]) => (
              <button
                key={v}
                onClick={() => setSeskupeni(v)}
                className={`min-h-[40px] px-3 rounded-xl text-xs font-black transition ${
                  seskupeni === v ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-600 hover:bg-white'
                }`}
              >
                {popis}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 text-xs font-bold text-neutral-600 min-h-[44px] px-1 cursor-pointer">
            <input type="checkbox" checked={sHlavickou} onChange={(e) => setSHlavickou(e.target.checked)} className="w-5 h-5 accent-amber-500" />
            i s hlavičkou
          </label>

          <button onClick={kopiruj} disabled={!radky.length} className="btn-primary !rounded-xl !min-h-[44px] ml-auto disabled:opacity-50">
            <Copy className="w-4 h-4" /> Kopírovat
          </button>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-4">
          {nacitam ? (
            <div className="py-16"><Spinner /></div>
          ) : radky.length === 0 ? (
            <p className="py-16 text-center text-sm font-semibold text-neutral-500">V tomhle období není žádný zápis.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  <th colSpan={popisne.length} className="text-left py-1.5" />
                  <th colSpan={SLOUPCE_SUDY.length} className="py-1.5 border-b-2 border-amber-300 text-amber-800">
                    {popisVarianty.skupinaSudy}
                  </th>
                  {popisVarianty.skupinaLahve && (
                    <th colSpan={sloupce.length - SLOUPCE_SUDY.length} className="py-1.5 border-b-2 border-sky-300 text-sky-800">
                      {popisVarianty.skupinaLahve}
                    </th>
                  )}
                </tr>
                <tr className="text-[10px] font-black uppercase tracking-wider text-neutral-500 border-b border-neutral-300">
                  {popisne.map((p) => <th key={p} className="text-left py-1.5 pr-2 whitespace-nowrap">{p}</th>)}
                  {sloupce.map((l) => <th key={l} className="text-right py-1.5 px-1.5 whitespace-nowrap">{popisSloupce(l)}</th>)}
                  {popisVarianty.sTankem && <th className="text-right py-1.5 pl-1.5 whitespace-nowrap">Tank č.</th>}
                </tr>
              </thead>
              <tbody>
                {radky.map((r, i) => (
                  <tr key={`${r.datum}-${r.odberatel}-${r.pivo}-${i}`} className="border-b border-neutral-100">
                    {seskupeni === 'den' && <td className="py-1.5 pr-2 whitespace-nowrap font-bold text-neutral-700">{formatDatum(r.datum)}</td>}
                    {popisVarianty.sOdberatelem && <td className="py-1.5 pr-2 font-bold text-neutral-900">{r.odberatel}</td>}
                    <td className="py-1.5 pr-2 text-neutral-700">{r.pivo}</td>
                    {sloupce.map((l) => (
                      <td key={l} className="text-right py-1.5 px-1.5 tabular-nums font-bold text-neutral-900">
                        {r.kusy[Math.round(l * 100) / 100] || ''}
                      </td>
                    ))}
                    {popisVarianty.sTankem && <td className="text-right py-1.5 pl-1.5 font-semibold text-neutral-600">{r.tank}</td>}
                  </tr>
                ))}
                <tr className="border-t-2 border-neutral-300 font-black">
                  <td className="py-2 pr-2" colSpan={popisne.length}>Celkem</td>
                  {sloupce.map((l) => (
                    <td key={l} className="text-right py-2 px-1.5 tabular-nums">{celkem.kusy[Math.round(l * 100) / 100] || ''}</td>
                  ))}
                  {popisVarianty.sTankem && <td />}
                </tr>
              </tbody>
            </table>
          )}

          {celkem.kusyJine > 0 && (
            <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-3">
              {celkem.kusyJine} ks je v obalu, který v tomhle listu nemá svůj sloupec — v mřížce ho neuvidíš.
              Kdyby takový obal chodil pravidelně, řekni a sloupec doplním.
            </p>
          )}
        </div>

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
            {radky.length} {radky.length === 1 ? 'řádek' : radky.length < 5 ? 'řádky' : 'řádků'} · {popisne.length + sloupce.length} sloupců
          </span>
          <button onClick={kopiruj} disabled={!radky.length} className="btn-primary !rounded-xl !min-h-[44px] disabled:opacity-50">
            <Copy className="w-4 h-4" /> Kopírovat do schránky
          </button>
        </div>
      </div>
    </div>
  );
}
