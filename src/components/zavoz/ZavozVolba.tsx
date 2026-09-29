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
      <select
        value={den ?? ''}
        onChange={(e) => { if (e.target.value) onDen(e.target.value); }}
        className="h-11 rounded border border-neutral-300 bg-white text-xs font-black px-1.5"
        title="Přesunout objednávku na jiný den tohoto týdne"
        aria-label="Přesunout na den"
      >
        <option value="" disabled>Přesunout na…</option>
        {DAYS.map((d) => <option key={d.v} value={d.v}>{d.v === den ? `${d.label} (teď)` : d.label}</option>)}
      </select>
    </div>
  );
}
