import { ReactNode } from 'react';

export type StepTimes = Record<string, string>;

// Aktuální čas HH:MM
export function currentTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// Řádek sanitačního kroku: zaškrtávátko + popisek.
//
// Dřív měl každý krok vlastní pole „čas provedení". Od 13. 9. 2026 se na
// přání provozu zapisuje jen čas ZAČÁTKU sanitace (jedno pole nahoře
// ve formuláři) — doba kroku je daná postupem a stojí v popisku
// („NaOH 2 % 20 minut", „klapky 30 vteřin"). Starší záznamy si své časy
// kroků v databázi nechávají (step_times), jen se už nezadávají.
export function SanitationStepRow({
  checked,
  onChecked,
  children,
}: {
  field: string;
  checked: boolean;
  onChecked: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-udaj cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onChecked(!checked)}
        className="accent-amber-500 h-4 w-4 mt-0.5 shrink-0"
      />
      <span>{children}</span>
    </label>
  );
}
