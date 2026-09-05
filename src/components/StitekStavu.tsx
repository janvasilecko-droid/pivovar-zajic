import { STAVY_OBJEDNAVKY } from '../lib/stavyObjednavek';

/**
 * Štítek stavu objednávky — barva i tvar.
 *
 * Barva sama informaci nést nesmí: ve sklepě je mizerné světlo a část lidí
 * rozlišuje barvy jinak. Proto je před popiskem `znak` (• ◐ ↑ ✓ ✓✓ ✕), který
 * říká totéž. `aria-hidden`, aby ho odečítač nečetl dvakrát — popisek je
 * vedle něj slovy.
 */
export function StitekStavu({ status, tridy = '' }: { status: string; tridy?: string }) {
  const s = STAVY_OBJEDNAVKY[status];
  // Neznámý stav (třeba nový, který přibyl v databázi) se ukáže syrový —
  // radši než aby zmizel a nikdo si nevšiml, že něco chybí.
  if (!s) return <span className={`chip badge-slate ${tridy}`}>{status}</span>;
  return (
    <span className={`chip ${s.cls} ${tridy}`} title={s.label}>
      <span aria-hidden="true" className="font-black">{s.znak}</span>
      {s.label}
    </span>
  );
}
