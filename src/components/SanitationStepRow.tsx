import { ReactNode, useState } from 'react';
import { Clock } from 'lucide-react';

export type StepTimes = Record<string, string>;

// Aktuální čas HH:MM
export function currentTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// Řádek sanitačního kroku: checkbox + popisek + volitelné pole „čas provedení“.
// Pole se zobrazí po zaškrtnutí (předvyplněné aktuálním časem) a lze ho ručně upravit.
export function SanitationStepRow({
  field,
  checked,
  onChecked,
  stepTimes,
  setStepTimes,
  children,
}: {
  field: string;
  checked: boolean;
  onChecked: (v: boolean) => void;
  stepTimes: StepTimes;
  setStepTimes: (v: StepTimes) => void;
  children: ReactNode;
}) {
  const time = stepTimes[field] ?? '';
  const [touched, setTouched] = useState<boolean>(time !== '');

  const finalTime = stepTimes[field] ?? currentTimeStr();

  return (
    <div className="flex items-start gap-2">
      <label className="flex items-start gap-2 text-[11px] cursor-pointer flex-1 min-w-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => {
            const newVal = !checked;
            onChecked(newVal);
            if (newVal) {
              setStepTimes({ ...stepTimes, [field]: finalTime });
            }
          }}
          className="accent-amber-500 h-4 w-4 mt-0.5 shrink-0"
        />
        <span>{children}</span>
      </label>
      {checked && (
        <div className="flex items-center gap-1 shrink-0">
          <Clock size={12} className="text-amber-600" />
          <input
            type="time"
            value={stepTimes[field] ?? ''}
            onChange={(e) => setStepTimes({ ...stepTimes, [field]: e.target.value })}
            onFocus={() => {
              if (!touched) {
                setTouched(true);
                if (!stepTimes[field]) {
                  setStepTimes({ ...stepTimes, [field]: finalTime });
                }
              }
            }}
            className="input !py-0.5 !px-1.5 text-[11px] font-mono font-bold w-[86px] bg-white"
          />
        </div>
      )}
    </div>
  );
}