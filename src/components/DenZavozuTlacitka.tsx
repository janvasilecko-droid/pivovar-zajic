// 📅 Tlačítka Po–Pá pro den závozu hned při čtení objednávky (WhatsApp,
// fotka). Z provozu 29. 9. 2026: „přidej tlačítka Po Út St… den závozu už
// při čtení objednávky z WhatsAppu, fotky atd., ať se dá den závozu hned na
// začátku zadat." Vedle je vidět, jaké datum z toho vyjde.
//
// Tlačítko dne bere nejbližší takový den od dneška. Konkrétní datum (i do
// minulosti — víkendová objednávka zapsaná v pondělí) jde zadat polem
// s datem, když ho volající chce (onDatum). Z provozu 7. 10. 2026: „ať můžu
// změnit datum závozu a datum objednávky, když se načtou fotky, ne zpětně."
import { DAYS } from '../lib/shared';

export function DenZavozuTlacitka({ den, datum, onDen, poznamka, zavoz, onZavoz, onDatum, dnes }: {
  den: string | null;
  /** Datum, které z volby vyjde (YYYY-MM-DD). */
  datum: string | null;
  onDen: (den: string | null) => void;
  /** Např. „obvykle Út" — den předvyplněný podle zvyklostí odběratele. */
  poznamka?: string | null;
  /** 1. / 2. závoz — když je předaný, ukážou se i tlačítka závozu. */
  zavoz?: number;
  onZavoz?: (cislo: number) => void;
  /** Konkrétní datum závozu (YYYY-MM-DD, null = zrušit) — když je předané, ukáže se pole s datem. */
  onDatum?: (datum: string | null) => void;
  /** Dnešek (YYYY-MM-DD) — u závozu, který už proběhl, se řekne, že se odečte hned. */
  dnes?: string;
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
        {onDatum && (
          <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-700">
            nebo datum
            <input
              type="date"
              className="input !w-auto !py-1.5 text-sm font-bold"
              value={datum ?? ''}
              onChange={(e) => onDatum(e.target.value || null)}
            />
          </label>
        )}
      </div>
      {onDatum && datum && dnes && datum < dnes && (
        <div className="text-xs font-bold text-amber-800">
          Závoz už proběhl — po uložení se objednávka hned odečte ze skladu.
        </div>
      )}
    </div>
  );
}
