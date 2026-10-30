// 🛢️🍾 Dva sloupce položek — vlevo Sudy, vpravo Lahve, nahoře součet kusů.
// Používá se v přehledu objednávek (tabulka i karta) a ve Fasování, ať se
// na telefonu hned vidí, co jde do sudů a co do lahví (zadání 30. 10. 2026).
import type { ReactNode } from 'react';
import type { SudyLahve } from '../lib/sudyLahve';

type Props<T> = {
  rozdeleni: SudyLahve<T>;
  /** Jeden řádek položky (vykreslí volající — každé místo má svoje tlačítka). */
  radek: (polozka: T) => ReactNode;
  /** Klíč řádku. */
  klic: (polozka: T) => string;
  /** Třída obalu (okraje, odsazení) podle místa, kde se sloupce kreslí. */
  className?: string;
};

function Sloupec<T>({ nadpis, kusu, polozky, radek, klic, vpravo }: {
  nadpis: string; kusu: number; polozky: T[]; radek: (p: T) => ReactNode; klic: (p: T) => string; vpravo: boolean;
}) {
  return (
    <div className={`min-w-0 ${vpravo ? 'border-l border-neutral-200 pl-2' : 'pr-2'}`} data-testid={`sloupec-${nadpis.toLowerCase()}`}>
      <div className="flex items-baseline justify-between text-udaj font-black uppercase tracking-wide text-neutral-600 mb-0.5">
        <span>{nadpis}</span>
        <span className="tabular-nums text-amber-900">{kusu}</span>
      </div>
      {polozky.length === 0 ? (
        <div className="text-xs font-bold text-neutral-500">—</div>
      ) : (
        <ul className="space-y-0.5">
          {polozky.map((p) => <li key={klic(p)} className="min-w-0">{radek(p)}</li>)}
        </ul>
      )}
    </div>
  );
}

export function DvaSloupcePolozek<T>({ rozdeleni, radek, klic, className = '' }: Props<T>) {
  return (
    <div className={`grid grid-cols-2 ${className}`} data-testid="dva-sloupce-polozek">
      <Sloupec nadpis="Sudy" kusu={rozdeleni.kusuSudu} polozky={rozdeleni.sudy} radek={radek} klic={klic} vpravo={false} />
      <Sloupec nadpis="Lahve" kusu={rozdeleni.kusuLahvi} polozky={rozdeleni.lahve} radek={radek} klic={klic} vpravo />
    </div>
  );
}
