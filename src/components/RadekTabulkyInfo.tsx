// 📊 Údaje o řádku, který vznikl z tabulky: odkud je (číslo řádku excelu, den,
// text z buňky Pivo), kolik se stočilo proti sudu a co zkontrolovat podle fotky.
import { AlertTriangle } from 'lucide-react';
import { datumCesky } from '../../supabase/functions/_shared/tabulka-staceni';

type Props = {
  cisloRadku?: number | null;
  datum?: string | null;
  pivoText?: string | null;
  varovani?: string[];
  /** Litry ze sudů a v lahvích u řádku zadávání lahví (živě podle toho, co je v řádku). */
  bilance?: { zdrojL: number; stoceneL: number; vytrataProc: number | null };
};

const litry = (l: number) => l.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

export default function RadekTabulkyInfo({ cisloRadku, datum, pivoText, varovani = [], bilance }: Props) {
  const vytrataSpatna = bilance?.vytrataProc != null && (bilance.vytrataProc < -2 || bilance.vytrataProc > 25);
  return (
    <div className="space-y-1" data-testid="radek-z-tabulky">
      <div className="text-udaj text-neutral-500 flex flex-wrap gap-x-3">
        <span>Z tabulky{cisloRadku ? `: řádek č. ${cisloRadku}` : ''}</span>
        {datum && <span>{datumCesky(datum)}</span>}
        <span>{pivoText ? `„${pivoText}"` : 'pivo v tabulce prázdné'}</span>
      </div>
      {bilance && bilance.zdrojL > 0 && bilance.stoceneL > 0 && (
        <div className={`text-udaj font-bold tabular-nums ${vytrataSpatna ? 'text-rose-700' : 'text-amber-800'}`}>
          Stočeno {litry(bilance.stoceneL)} l z {litry(bilance.zdrojL)} l ze sudů
          {bilance.vytrataProc != null ? ` · výtrata ${litry(bilance.vytrataProc)} %` : ''}
        </div>
      )}
      {varovani.map((v, i) => (
        <div key={i} className="text-udaj text-amber-900"><AlertTriangle className="ikona-text" /> {v}</div>
      ))}
    </div>
  );
}
