// 🚚 Na kartě objednávky v Rozvozu: kterým závozem jede (1. / 2.) a přesun
// na jiný den. Z provozu 29. 9. 2026: „někdy se vezou za den dva — dnes se
// dopoledne vezl Seeberg, ale mám jeho data v zítřejším."
import { DAYS } from '../../lib/shared';

export function ZavozVolba({ cislo, den, onCislo, onDen, dostupne }: {
  cislo: number;
  den: string | null;
  onCislo: (cislo: number) => void;
  onDen: (den: string) => void;
  /** Sloupec zavoz_cislo v databázi je (jinak se 1./2. závoz neukáže). */
  dostupne: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {dostupne && [1, 2].map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onCislo(c)}
          aria-pressed={cislo === c}
          title={`Pojede ${c}. závozem toho dne`}
          className={`btn-zalozka !py-1 !px-2.5 text-xs ${cislo === c ? 'btn-zalozka-aktivni' : ''}`}
        >
          {c}. závoz
        </button>
      ))}
      <span className="flex items-center gap-1 flex-wrap" role="group" aria-label="Přesunout na den">
        {DAYS.slice(0, 5).map((d) => (
          <button
            key={d.v}
            type="button"
            onClick={() => { if (d.v !== den) onDen(d.v); }}
            aria-pressed={d.v === den}
            title={d.v === den ? `Jede ${d.label}` : `Přesunout na ${d.label}`}
            className={`btn-den ${d.v === den ? 'btn-den-aktivni' : ''}`}
          >
            {d.label}
          </button>
        ))}
      </span>
    </div>
  );
}
