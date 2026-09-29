// 📅 Tlačítka Po–Pá pro den závozu hned při čtení objednávky (WhatsApp,
// fotka). Z provozu 29. 9. 2026: „přidej tlačítka Po Út St… den závozu už
// při čtení objednávky z WhatsAppu, fotky atd., ať se dá den závozu hned na
// začátku zadat." Vedle je vidět, jaké datum z toho vyjde.
import { DAYS } from '../lib/shared';

export function DenZavozuTlacitka({ den, datum, onDen, poznamka, zavoz, onZavoz }: {
  den: string | null;
  /** Datum, které z volby vyjde (YYYY-MM-DD). */
  datum: string | null;
  onDen: (den: string | null) => void;
  /** Např. „obvykle Út" — den předvyplněný podle zvyklostí odběratele. */
  poznamka?: string | null;
  /** 1. / 2. závoz — když je předaný, ukážou se i tlačítka závozu. */
  zavoz?: number;
  onZavoz?: (cislo: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-black text-neutral-700">
        Den závozu
        {datum && (
          <span className="ml-1.5 text-neutral-950">
            → {new Date(datum + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })}
          </span>
        )}
        {!den && <span className="ml-1.5 font-bold text-amber-800">nevybráno</span>}
        {poznamka && <span className="ml-1.5 font-bold text-neutral-600">({poznamka})</span>}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {DAYS.slice(0, 5).map((d) => (
          <button
            key={d.v}
            type="button"
            className={`btn-den ${den === d.v ? 'btn-den-aktivni' : ''}`}
            onClick={() => onDen(den === d.v ? null : d.v)}
            aria-pressed={den === d.v}
            title={den === d.v ? `Zrušit den závozu (${d.label})` : `Den závozu: ${d.label}`}
          >
            {d.label}
          </button>
        ))}
        {onZavoz && [1, 2].map((c) => (
          <button
            key={`z${c}`}
            type="button"
            className={`btn-den ${(zavoz ?? 1) === c ? 'btn-den-aktivni' : ''}`}
            onClick={() => onZavoz(c)}
            aria-pressed={(zavoz ?? 1) === c}
            title={`Pojede ${c}. závozem toho dne`}
          >
            {c}.z
          </button>
        ))}
      </div>
    </div>
  );
}
