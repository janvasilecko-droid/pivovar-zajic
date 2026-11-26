import { CalendarClock } from 'lucide-react';
import type { RadekUpozorneni } from '../lib/predemObjednane';

// 📅 „Předem objednané — tento týden se stáčí": výslovné upozornění nad plánem stáčení na ploše
// (lib/predemObjednane.ts). Majitel 26. 11. 2026: „…aplikace to musí nastavit ten datum a upozornit
// v pondělí týden kdy to má být stočený." „Rozumím" schová upozornění na tomhle zařízení do konce týdne
// (nová předem objednaná objednávka ho ukáže znovu).

export default function PredemObjednaneUpozorneni({ radky, onRozumim }: {
  radky: RadekUpozorneni[];
  onRozumim: () => void;
}) {
  return (
    <section
      data-testid="predem-objednane"
      aria-label="Předem objednané na tento týden"
      className="border-t border-amber-300 bg-amber-100 px-3.5 py-2.5 space-y-1.5"
    >
      <div className="flex items-center gap-1.5 font-black text-amber-950 text-sm">
        <CalendarClock size={16} className="shrink-0" aria-hidden="true" />
        <span>Předem objednané — tento týden se stáčí</span>
      </div>
      <ul className="space-y-1">
        {radky.map((r) => (
          <li key={r.id} className="text-xs text-amber-950 break-words">
            <span className="font-black">{r.misto}</span> · {r.kdy} — {r.co}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onRozumim}
        className="btn-ghost !rounded text-xs font-black"
      >
        Rozumím
      </button>
    </section>
  );
}
