import { useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarX2, ClipboardList, PartyPopper } from 'lucide-react';
import {
  isLastWeekOfMonth, getMonthKey,
  readMonthlyCleanupStage, writeMonthlyCleanupStage,
} from '../lib/monthlyCleanup';
import { businessDateISO } from '../lib/businessDate';
import { useAuth } from '../lib/auth';
import { DEFAULT_ITEMS, MONTHLY_CATEGORY_PREFIX } from './BottlingChecklistModal';
import { KEG_DEFAULT_ITEMS, KEG_MONTHLY_CATEGORY_PREFIX } from './KeggingChecklistModal';
import { autoLogBottleSanitationFromChecklist } from '../lib/bottleSanitation';
import { autoLogKegSanitationFromChecklist } from '../lib/kegSanitation';

type Props = {
  // Volitelné: tlačítko, které rovnou otevře stáčení lahví (a tam se po splnění
  // „1. Začátek stáčení" zobrazí okno s měsíčním checklistem).
  onOpenMonthlyChecklist?: () => void;
  // Volitelné: stejné tlačítko pro stáčení KEGů.
  onOpenKegMonthlyChecklist?: () => void;
};

// Dvoufázové potlačení tohoto upozornění přes daný kalendářní měsíc — na
// výslovné přání uživatele: "Udělám na konci týdne" (kdykoliv do čtvrtka) ho
// jen odloží do pátku, kdy se připomene znovu; teprve druhé potvrzení (nebo
// "Už je to provedeno" kdykoliv) ho umlčí až do dalšího měsíce. Od prvního
// odkliknutí navíc na Domů zůstává tichá připomínková dlaždice (viz
// isMonthlyCleanupPending v lib/monthlyCleanup.ts), dokud není úklid hotový.
// Pátek/sobota/neděle = "pátek a dál" pro účely opětovného připomenutí — kdo
// appku zrovna v pátek neotevře, dostane upozornění při prvním otevření o
// víkendu, ne až příští týden (kdy už měsíc končí).
function isFridayOrLater(): boolean {
  const dow = new Date().getDay(); // 0 = neděle .. 6 = sobota
  return dow === 5 || dow === 6 || dow === 0;
}
function shouldShow(monthKey: string): boolean {
  if (!isLastWeekOfMonth()) return false;
  const stage = readMonthlyCleanupStage(monthKey);
  if (stage === 'done') return false;
  if (!stage) return true;
  if (stage === 'week_start') return isFridayOrLater();
  return false;
}

// Sloučí do uloženého checklistu daného dne VŠECHNY položky kategorie
// „4. Měsíční údržba" jako odškrtnuté (ostatní kategorie/dny nechá být) a
// vrátí kompletní seznam odškrtnutých položek pro autolog do deníku —
// stejný výsledek, jako by uživatel prošel celý checklist ručně.
function markMonthlyDone<T extends { id: string; text: string; category: string }>(
  storageKeyPrefix: string,
  dateStr: string,
  items: T[],
  monthlyPrefix: string
): { map: Record<string, boolean>; checkedItems: { id: string; text: string }[] } {
  let map: Record<string, boolean> = {};
  try {
    const raw = localStorage.getItem(storageKeyPrefix + dateStr);
    if (raw) map = JSON.parse(raw);
  } catch {}
  items.forEach((it) => {
    if (it.category.startsWith(monthlyPrefix)) map[it.id] = true;
  });
  try {
    localStorage.setItem(storageKeyPrefix + dateStr, JSON.stringify(map));
  } catch {}
  return { map, checkedItems: items.filter((it) => map[it.id]).map((it) => ({ id: it.id, text: it.text })) };
}

// ⚠️ Výrazné upozornění v posledním týdnu měsíce: „V tomto týdnu je potřeba
// udělat měsíční úklid." Zobrazí se na začátku posledního týdne měsíce;
// „Udělám na konci týdne" ho odloží do pátku (kdy se připomene znovu), druhé
// potvrzení už ho umlčí do dalšího měsíce. „Už je to provedeno" rovnou
// označí měsíční checklist (lahve i KEGy) za splněný a zapíše ho do obou
// sanitárních deníků, beze nutnosti procházet checklist ručně.
export function MonthlyCleanupWarning({ onOpenMonthlyChecklist, onOpenKegMonthlyChecklist }: Props) {
  const { profile } = useAuth();
  const monthKey = getMonthKey();
  const [open, setOpen] = useState(() => shouldShow(monthKey));
  const [done, setDone] = useState(false);

  if (!open) return null;

  const dismiss = () => {
    writeMonthlyCleanupStage(monthKey, isFridayOrLater() ? 'friday' : 'week_start');
    setOpen(false);
  };

  const markAlreadyDone = () => {
    const today = businessDateISO();
    const performedBy = profile?.display_name || '';
    const bottle = markMonthlyDone('bottling_checklist_', today, DEFAULT_ITEMS, MONTHLY_CATEGORY_PREFIX);
    const keg = markMonthlyDone('keg_checklist_', today, KEG_DEFAULT_ITEMS, KEG_MONTHLY_CATEGORY_PREFIX);
    if (bottle.checkedItems.length > 0) {
      void autoLogBottleSanitationFromChecklist({ dateStr: today, checkedItems: bottle.checkedItems, performedBy });
    }
    if (keg.checkedItems.length > 0) {
      void autoLogKegSanitationFromChecklist({ dateStr: today, checkedMap: keg.map, performedBy, phase: 'monthly' });
    }
    writeMonthlyCleanupStage(monthKey, 'done');
    setDone(true);
    setTimeout(() => setOpen(false), 1600);
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200">
      <div className="bg-white rounded max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border-4 border-rose-500 relative overflow-hidden">
        <div className="h-3 w-full absolute top-0 left-0 right-0 bg-rose-600" />

        {done ? (
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white shrink-0 shadow-lg bg-emerald-600">
              <PartyPopper size={30} />
            </div>
            <h2 className="text-xl font-display font-black text-neutral-950">Zapsáno do sanitárních deníků</h2>
            <p className="text-sm text-neutral-600">Měsíční údržba je označená jako hotová pro lahve i KEGy.</p>
          </div>
        ) : (
        <>
        <div className="flex items-start gap-4 pt-2">
          <div className="w-14 h-14 rounded flex items-center justify-center text-white shrink-0 shadow-lg bg-rose-600">
            <CalendarX2 size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rose-600">
              <span><AlertTriangle className="ikona-text" /> Měsíční úklid</span>
              <span>•</span>
              <span>poslední týden měsíce</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-black text-neutral-950 leading-tight mt-1">
              V tomto týdnu je potřeba udělat měsíční úklid
            </h2>
          </div>
        </div>

        <div className="p-5 rounded bg-rose-50/90 border border-rose-300 text-neutral-900 font-medium text-sm leading-relaxed space-y-2">
          <p className="font-bold text-neutral-900">
            Je poslední týden v měsíci — v rámci stáčení (lahví i KEGů) je nutné provést <b>měsíční údržbu</b>{' '}
            stáčeček, naražečů, rychlospojek a pivních cest (sekce „4. Měsíční údržba" v checklistu).
          </p>
          <p className="text-xs text-rose-800">
            Po splnění úvodního checklistu „1. Začátek stáčení" se automaticky otevře okno s měsíčním
            checklistem.
          </p>
        </div>

        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={dismiss}
            className="w-full py-3.5 px-6 rounded bg-rose-600 hover:bg-rose-500 text-white font-black text-base transition shadow-xl hover:shadow-rose-500/20 active:scale-[0.98] flex items-center justify-center gap-3 ring-4 ring-rose-300"
          >
            <CalendarClock size={22} />
            <span>Udělám na konci týdne</span>
          </button>
          <button
            type="button"
            onClick={markAlreadyDone}
            className="w-full py-3 px-6 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition flex items-center justify-center gap-2"
          >
            <PartyPopper size={18} />
            <span>Už je to provedeno — zapsat do deníku</span>
          </button>
          {onOpenMonthlyChecklist && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenMonthlyChecklist();
              }}
              className="w-full py-3 px-6 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <ClipboardList size={18} />
              <span>Otevřít stáčení lahví (měsíční checklist)</span>
            </button>
          )}
          {onOpenKegMonthlyChecklist && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenKegMonthlyChecklist();
              }}
              className="w-full py-3 px-6 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <ClipboardList size={18} />
              <span>Otevřít stáčení KEGů (měsíční checklist)</span>
            </button>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
}
