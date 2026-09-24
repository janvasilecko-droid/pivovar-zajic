// Pomocné funkce pro upozornění na „měsíční úklid" v posledním týdnu měsíce.
//
// „Poslední týden" je celý KALENDÁŘNÍ týden pondělí–neděle, ne posledních
// 7 kalendářních dnů měsíce. Do 24. 9. 2026 to bylo obráceně (posledních
// 7 dnů) — zadání majitele ten den: „proc si mi hlasil mesicni chek list
// dneska? hlas ho v posledni tyden v mesici, to znamena pristi, klidne at
// se prekryva s novym mesicem." 24. 9. 2026 byl čtvrtek posledního
// kalendářního týdne (21.–27. 9.), takže starým pravidlem (posledních 7 dnů:
// 24.–30. 9.) vyšlo „poslední týden" už na TENTO čtvrtek — ne na příští
// pondělí, jak to majitel myslí týdnem. Nové pravidlo bere skutečný
// kalendářní týden, který obsahuje poslední den měsíce — u září je to
// pondělí 28. 9. až neděle 4. 10., tedy schválně přesahuje do října
// („klidne at se prekryva s novym mesicem").
import { businessDateISO } from './businessDate';
import { uloz } from './uloziste';

// Bez výslovně předaného data se používá pražský "obchodní den" (ne syrové
// new Date(), které je v UTC) — kolem půlnoci (léto i zima) by jinak UTC den
// mohl být ještě včerejší, a poslední týden/měsíc by se vyhodnotil špatně.
function denNaDatum(dateStr?: string): Date {
  return new Date((dateStr ?? businessDateISO()) + 'T00:00:00');
}

/** Pondělí kalendářního týdne, do kterého `d` spadá. */
function pondeliTydne(d: Date): Date {
  const den = d.getDay(); // 0 = neděle
  const out = new Date(d);
  out.setDate(out.getDate() - (den === 0 ? 6 : den - 1));
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Poslední kalendářní den daného měsíce (0-indexovaný měsíc jako u Date). */
function posledniDenMesice(rok: number, mesicIndex0: number): Date {
  return new Date(rok, mesicIndex0 + 1, 0);
}

const klicMesice = (rok: number, mesicIndex0: number) => rok + '-' + String(mesicIndex0 + 1).padStart(2, '0');

/**
 * RRRR-MM měsíce, jehož „poslední týden" (pondělí–neděle obsahující
 * poslední kalendářní den toho měsíce) dané datum obsahuje — nebo `null`,
 * když datum do žádného takového týdne nespadá.
 *
 * Zkouší vlastní měsíc dne i měsíc předchozí: poslední týden předchozího
 * měsíce může přesahovat do prvních dní toho následujícího (viz komentář
 * nahoře v souboru), takže první dny nového měsíce ještě patří k
 * předchozímu — a to je záměr, ne přehlédnutí.
 */
export function lastWeekOfMonthKey(dateStr?: string): string | null {
  const d = denNaDatum(dateStr);
  for (const posunMesice of [0, -1]) {
    const mesic = new Date(d.getFullYear(), d.getMonth() + posunMesice, 1);
    const pondeli = pondeliTydne(posledniDenMesice(mesic.getFullYear(), mesic.getMonth()));
    const nedele = new Date(pondeli);
    nedele.setDate(nedele.getDate() + 6);
    if (d.getTime() >= pondeli.getTime() && d.getTime() <= nedele.getTime()) {
      return klicMesice(mesic.getFullYear(), mesic.getMonth());
    }
  }
  return null;
}

export function isLastWeekOfMonth(dateStr?: string): boolean {
  return lastWeekOfMonthKey(dateStr) !== null;
}

// Klíč měsíce ve tvaru RRRR-MM (např. „2026-08") — prostý kalendářní měsíc
// daného data, BEZ ohledu na poslední týden. Pro stav potlačení upozornění
// (kdy jde vždycky o „poslední týden", který může přesahovat do dalšího
// měsíce) se používá `cleanupMonthKey()` níž, ne tahle funkce přímo.
export function getMonthKey(dateStr?: string): string {
  const d = denNaDatum(dateStr);
  return klicMesice(d.getFullYear(), d.getMonth());
}

/**
 * Klíč měsíce, ke kterému se váže PRÁVĚ PROBÍHAJÍCÍ (nebo poslední
 * proběhlý) poslední týden — tedy měsíc, jehož úklid se řeší. Mimo
 * poslední týden se chová jako `getMonthKey()`.
 *
 * Bez tohohle by dny přesahu do nového měsíce (viz `lastWeekOfMonthKey`)
 * ukládaly stav pod klíč nového měsíce, zatímco kontrola „je hotovo"
 * (`isMonthlyCleanupPending`) by se ptala pořád na ten starý — potvrzení
 * úklidu 1. 10. by tak zmizelo do klíče „2026-10" a připomínka za září
 * by se ukazovala dál, přestože je úklid hotový.
 */
export function cleanupMonthKey(dateStr?: string): string {
  return lastWeekOfMonthKey(dateStr) ?? getMonthKey(dateStr);
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
    uloz(DISMISS_KEY_PREFIX + monthKey, stage);
  } catch {}
  window.dispatchEvent(new CustomEvent(MONTHLY_CLEANUP_CHANGED_EVENT));
}

// true, dokud je poslední týden měsíce a měsíční úklid ještě není označený
// jako hotový (bez ohledu na to, jestli/kolikrát uživatel modál odklikl) —
// pohání dlaždici na Domů, co zůstává jako připomínka i po zavření modálu.
export function isMonthlyCleanupPending(): boolean {
  const monthKey = lastWeekOfMonthKey();
  if (!monthKey) return false;
  return readMonthlyCleanupStage(monthKey) !== 'done';
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

export function isMonthlyLineDone(line: CleanupLine, monthKey: string = cleanupMonthKey()): boolean {
  try {
    return localStorage.getItem(lineKey(line, monthKey)) === '1';
  } catch {
    return false;
  }
}

// Označí linku za hotovou pro daný měsíc. Když jsou hotové obě, umlčí se i
// samotné upozornění (stage 'done') — jinak by se pořád hlásilo, že úklid
// čeká, přestože obě linky mají odškrtnuto a zapsáno v deníku.
export function markMonthlyLineDone(line: CleanupLine, monthKey: string = cleanupMonthKey()) {
  try {
    uloz(lineKey(line, monthKey), '1');
  } catch {}
  if (isMonthlyLineDone('bottle', monthKey) && isMonthlyLineDone('keg', monthKey)) {
    writeMonthlyCleanupStage(monthKey, 'done');
    return;
  }
  window.dispatchEvent(new CustomEvent(MONTHLY_CLEANUP_CHANGED_EVENT));
}
