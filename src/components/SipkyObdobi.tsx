// ‹ říjen 2026 › — společné šipky pro posun období (Statistika, Historie závozů…).
/**
 * ‹ říjen 2026 › — posun období šipkami. Do budoucna se nejde (nic tam není),
 * „Teď" vrátí na aktuální období. 2. 10. 2026: „udělej to všude, ať tam bude
 * říjen a šipka před a po."
 */
export function SipkyObdobi({ popis, posun, onPosun, nazev = 'období' }: {
  popis: string;
  posun: number;
  onPosun: (posun: number) => void;
  nazev?: string;
}) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-2xl bg-white border border-neutral-200 w-fit">
      <button type="button" onClick={() => onPosun(posun - 1)} className="btn-ghost !rounded-xl !py-2 !px-3 font-black text-base" title={`Předchozí ${nazev}`} aria-label={`Předchozí ${nazev}`}>‹</button>
      <span className="px-2 text-xs font-black text-neutral-900 tabular-nums whitespace-nowrap">{popis}</span>
      <button type="button" onClick={() => onPosun(Math.min(0, posun + 1))} disabled={posun >= 0} className="btn-ghost !rounded-xl !py-2 !px-3 font-black text-base disabled:opacity-30" title={`Následující ${nazev}`} aria-label={`Následující ${nazev}`}>›</button>
      {posun !== 0 && (
        <button type="button" onClick={() => onPosun(0)} className="btn-ghost !rounded-xl !py-2 !px-3 text-xs font-black text-amber-800">Teď</button>
      )}
    </div>
  );
}
