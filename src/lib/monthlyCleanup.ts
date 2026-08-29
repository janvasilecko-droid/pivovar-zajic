// Pomocné funkce pro upozornění na „měsíční úklid" v posledním týdnu měsíce.
// Poslední týden měsíce = posledních 7 kalendářních dnů (např. 25.–31., 24.–30.,
// 23.–29., 22.–28.).
import { businessDateISO } from './businessDate';

// Bez výslovně předaného data se používá pražský "obchodní den" (ne syrové
// new Date(), které je v UTC) — kolem půlnoci (léto i zima) by jinak UTC den
// mohl být ještě včerejší, a poslední týden/měsíc by se vyhodnotil špatně.
export function isLastWeekOfMonth(dateStr?: string): boolean {
  const d = new Date((dateStr ?? businessDateISO()) + 'T00:00:00');
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return d.getDate() >= daysInMonth - 6;
}

// Klíč měsíce ve tvaru RRRR-MM (např. „2026-08") pro trvalé potlačení upozornění.
export function getMonthKey(dateStr?: string): string {
  const d = new Date((dateStr ?? businessDateISO()) + 'T00:00:00');
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Sdílené se MonthlyCleanupWarning.tsx (modál) i HomeScreen.tsx (dlaždice
// připomínky na Domů, viditelná i PO odkliknutí modálu, dokud není úklid
// skutečně hotový) — jeden zdroj pravdy pro stav potlačení přes daný měsíc.
export type MonthlyCleanupStage = 'week_start' | 'friday' | 'done';
const DISMISS_KEY_PREFIX = 'monthly_cleanup_dismiss_';

export function readMonthlyCleanupStage(monthKey: string): MonthlyCleanupStage | null {
  try {
    return localStorage.getItem(DISMISS_KEY_PREFIX + monthKey) as MonthlyCleanupStage | null;
  } catch {
    return null;
  }
}
// Vlastní DOM event (stejný vzorec jako pivovar:online-refetch v lib/offline.ts)
// — HomeScreen.tsx poslouchá, ať se připomínková dlaždice na Domů hned
// aktualizuje, i když je smazána/nastavena z jiné (už namountované) komponenty
// (modál MonthlyCleanupWarning žije v App.tsx nezávisle na Domů).
export const MONTHLY_CLEANUP_CHANGED_EVENT = 'pivovar:monthly-cleanup-changed';

export function writeMonthlyCleanupStage(monthKey: string, stage: MonthlyCleanupStage) {
  try {
    localStorage.setItem(DISMISS_KEY_PREFIX + monthKey, stage);
  } catch {}
  window.dispatchEvent(new CustomEvent(MONTHLY_CLEANUP_CHANGED_EVENT));
}

// true, dokud je poslední týden měsíce a měsíční úklid ještě není označený
// jako hotový (bez ohledu na to, jestli/kolikrát uživatel modál odklikl) —
// pohání dlaždici na Domů, co zůstává jako připomínka i po zavření modálu.
export function isMonthlyCleanupPending(): boolean {
  if (!isLastWeekOfMonth()) return false;
  return readMonthlyCleanupStage(getMonthKey()) !== 'done';
}

// ── Měsíční úklid je MĚSÍČNÍ, ne denní ──────────────────────────────────────
// Odškrtnuté checklisty se ukládají po DNECH ('bottling_checklist_<datum>'),
// takže „hotovo" platilo jen pro ten jeden den — druhý den v posledním týdnu
// se okno s měsíční údržbou otevřelo znovu, i když byl úklid dávno udělaný a
// zapsaný do sanitárního deníku. Proto se dokončení drží zvlášť, na měsíc a
// linku (lahve / KEG): jakmile je linka za daný měsíc hotová, nepřipomíná se
// znovu — až zase v posledním týdnu dalšího měsíce.
export type CleanupLine = 'bottle' | 'keg';
const LINE_DONE_PREFIX = 'monthly_cleanup_line_done_';
const lineKey = (line: CleanupLine, monthKey: string) => LINE_DONE_PREFIX + line + '_' + monthKey;

export function isMonthlyLineDone(line: CleanupLine, monthKey: string = getMonthKey()): boolean {
  try {
    return localStorage.getItem(lineKey(line, monthKey)) === '1';
  } catch {
    return false;
  }
}

// Označí linku za hotovou pro daný měsíc. Když jsou hotové obě, umlčí se i
// samotné upozornění (stage 'done') — jinak by se pořád hlásilo, že úklid
// čeká, přestože obě linky mají odškrtnuto a zapsáno v deníku.
export function markMonthlyLineDone(line: CleanupLine, monthKey: string = getMonthKey()) {
  try {
    localStorage.setItem(lineKey(line, monthKey), '1');
  } catch {}
  if (isMonthlyLineDone('bottle', monthKey) && isMonthlyLineDone('keg', monthKey)) {
    writeMonthlyCleanupStage(monthKey, 'done');
    return;
  }
  window.dispatchEvent(new CustomEvent(MONTHLY_CLEANUP_CHANGED_EVENT));
}
