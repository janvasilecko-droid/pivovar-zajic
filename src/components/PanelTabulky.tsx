// 📊 Panel „Fotka je tabulka z Excelu — číst od data" v oknech zadávání z fotky.
// 15. 10. 2026, majitel: „ať se nemusí ořezávat, takže můžu zadat datum od kdy
// chci data číst … datum platí do tý doby, než se objeví další."
import { AlertTriangle, CalendarDays, Info, RotateCcw, Table2 } from 'lucide-react';
import { datumCesky } from '../../supabase/functions/_shared/tabulka-staceni';
import type { InfoFotky, TabulkaZFotky } from '../lib/useTabulkaZFotky';

type Props = {
  t: TabulkaZFotky;
  /** Výsledek čtení právě zobrazené fotky. */
  info?: InfoFotky;
  /** Je načtená aspoň jedna fotka. */
  jeFotka: boolean;
  /** Čtení právě běží. */
  bezi: boolean;
  /** Přečíst fotku znovu (podle aktuálního data). */
  onPrecist: () => void;
  /** Změna režimu — okno si podle toho vynuluje přečtené řádky a čte fotku znovu. */
  onRezim: (r: 'seznam' | 'tabulka') => void;
  /** Kterému zadávání se tabulka čte (jen do textu: „sloupce sudů" / „sloupce lahví"). */
  nazev?: string;
};

const radku = (n: number) => `${n} ${n === 1 ? 'řádek' : n >= 2 && n <= 4 ? 'řádky' : 'řádků'}`;

export default function PanelTabulky({ t, info, jeFotka, bezi, onPrecist, onRezim, nazev }: Props) {
  const zmeneno = jeFotka && (t.odData || null) !== t.nactenoOdData;
  const pocetRadku = info?.stav === 'ok' ? info.dny.reduce((s, d) => s + d.radku, 0) : 0;
  return (
    <div className="card !bg-amber-50/60 border border-amber-200 p-4 space-y-3" data-testid="panel-tabulky">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-amber-900 mr-1"><Table2 className="ikona-text" /> Co je na fotce</span>
        <button type="button" aria-pressed={!t.zapnuto} className={`btn-zalozka ${!t.zapnuto ? 'btn-zalozka-aktivni' : ''}`} onClick={() => !bezi && t.zapnuto && onRezim('seznam')} disabled={bezi}>
          Seznam / zpráva
        </button>
        <button type="button" aria-pressed={t.zapnuto} className={`btn-zalozka ${t.zapnuto ? 'btn-zalozka-aktivni' : ''}`} onClick={() => !bezi && !t.zapnuto && onRezim('tabulka')} disabled={bezi}>
          Tabulka z Excelu
        </button>
      </div>

      {t.zapnuto && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="label" htmlFor="tabulka-od-data"><CalendarDays className="ikona-text" /> Číst od data</label>
              <input id="tabulka-od-data" type="date" className="input" value={t.odData} onChange={(e) => t.setOdData(e.target.value)} />
            </div>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
              {zmeneno && (
                <button type="button" className="btn-primary !rounded" onClick={onPrecist} disabled={bezi}>
                  <RotateCcw className="ikona-text" /> {t.odData ? `Přečíst znovu od ${datumCesky(t.odData)}` : 'Přečíst celou tabulku'}
                </button>
              )}
              {t.odData && (
                <button type="button" className="btn-ghost !rounded text-xs" onClick={() => t.setOdData('')} disabled={bezi}>
                  Celá tabulka
                </button>
              )}
            </div>
          </div>
          <p className="text-udaj text-neutral-600">
            <Info className="ikona-text" /> Čtou se jen řádky od tohoto data{nazev ? ` (${nazev})` : ''} — fotku není třeba ořezávat, ořízne a zvětší se sama.
            Datum v tabulce platí i pro prázdná políčka pod ním, dokud se neobjeví další.
            {t.posledniZapis ? ` Poslední zápis v appce: ${datumCesky(t.posledniZapis)}.` : ''}
          </p>

          {info?.stav === 'ok' && (
            <div className="text-sm font-semibold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded p-2.5 space-y-1">
              <div>
                Přečteno {radku(pocetRadku)}
                {info.dny.length === 1 && info.dny[0].datum ? ` z ${datumCesky(info.dny[0].datum)}` : ''}
                {info.orezano ? ' — výřez fotky od zadaného data se oříznul a zvětšil sám.' : '.'}
              </div>
              {info.vynechano > 0 && <div className="text-udaj font-normal">Vynecháno {radku(info.vynechano)} před {datumCesky(info.odData)}.</div>}
              {!info.ocr && <div className="text-udaj font-normal text-neutral-600">Přepis fotky (OCR) nebyl k dispozici — čísla ověř podle fotky.</div>}
            </div>
          )}

          {info?.stav === 'nic-od-data' && (
            <div className="text-sm font-semibold text-amber-900 bg-amber-100/70 border border-amber-300 rounded p-2.5 flex flex-wrap items-center gap-2">
              <AlertTriangle className="ikona-text" />
              <span>
                Od {datumCesky(info.odData)} v tabulce nic není.
                {info.posledniDatum ? ` Poslední datum na fotce je ${datumCesky(info.posledniDatum)}.` : ''}
              </span>
              {info.posledniDatum && (
                <button type="button" className="btn-secondary !rounded text-xs" onClick={() => { t.setOdData(info.posledniDatum!); }} disabled={bezi}>
                  Číst od {datumCesky(info.posledniDatum)}
                </button>
              )}
            </div>
          )}

          {info?.stav === 'ok' && info.varovani.length > 0 && (
            <ul className="text-udaj text-amber-900 bg-amber-100/70 border border-amber-300 rounded p-2.5 space-y-1">
              {info.varovani.map((v, i) => <li key={i}><AlertTriangle className="ikona-text" /> {v}</li>)}
            </ul>
          )}

          {t.dny.length > 1 && (
            <div className="space-y-1.5" data-testid="vyber-dne">
              <div className="text-sm font-semibold text-amber-900">V tabulce je víc dnů — vkládá se jeden den najednou:</div>
              <div className="flex flex-wrap gap-2">
                {t.dny.map((d) => (
                  <button
                    key={d.datum ?? 'bez-data'}
                    type="button"
                    aria-pressed={t.vybranyDen === d.datum}
                    className={`btn-zalozka ${t.vybranyDen === d.datum ? 'btn-zalozka-aktivni' : ''}`}
                    onClick={() => t.setVybranyDen(d.datum)}
                  >
                    {d.datum ? datumCesky(d.datum) : 'Bez data'} · {radku(d.radku)}
                  </button>
                ))}
              </div>
              <div className="text-udaj text-neutral-600">Ostatní dny vlož až po uložení tohoto: otevři okno znovu a čti od dalšího data.</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
