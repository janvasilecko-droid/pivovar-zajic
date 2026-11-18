// 🚰 Průvodce objednávkou — nenápadné pole „Půjčení výčepu" na konci souhrnu.
// ---------------------------------------------------------------------------
// Majitel 18. 11. 2026: „stačí zaklikávací pole, když se klikne, tak se otevře
// rezervační okno, používá se to málo, tak ať to nepřekáží". Proto jen jeden
// řádek malým písmem pod poznámkou, bez rámečku a barvy. Chování jako ve
// starém formuláři: zaškrtnutí otevře okno rezervace, odškrtnutí rezervaci
// zruší. Okno samo patří obrazovce Objednávky (TapReservationModal).
import { IkonaVycep } from '../ikony';

export function PruvodceVycep({ zaskrtnuto, stav, prepni }: {
  zaskrtnuto: boolean;
  /** Co se s výčepem stalo nebo stane (lib/objednavkaPruvodce.ts → stavVycepu); prázdné = nic. */
  stav: string;
  prepni: () => void;
}) {
  return (
    <div data-testid="pruvodce-vycep">
      <label className="flex items-center gap-2 min-h-[44px] px-1 cursor-pointer select-none text-sm font-semibold text-neutral-700 dark:text-neutral-300">
        <input type="checkbox" checked={zaskrtnuto} onChange={prepni} className="w-5 h-5 shrink-0 rounded accent-neutral-700" />
        <IkonaVycep className="ikona-text shrink-0" />
        Půjčení výčepu
      </label>
      {stav && (
        <p role="status" className="pl-8 pr-1 -mt-1.5 pb-1 text-xs font-bold text-neutral-700 dark:text-neutral-300">{stav}</p>
      )}
    </div>
  );
}
