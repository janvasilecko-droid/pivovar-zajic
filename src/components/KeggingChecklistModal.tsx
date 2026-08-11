import { useState, useEffect } from 'react';
import { Modal } from './ui';
import { CheckSquare, Square, RotateCcw, Check, ShieldCheck, Lock } from 'lucide-react';

export type ChecklistPhase = 'start' | 'end' | 'monthly';

export type KegChecklistItem = {
  id: string;
  category: string;
  text: string;
  required?: boolean;
  weekly?: boolean; // Splněno jednou týdně
};

export const KEG_DEFAULT_ITEMS: KegChecklistItem[] = [
  // 1. Začátek stáčení
  { id: 'keg_start_1', category: '1. Začátek stáčení', text: 'Proplach cest: NaOH 2% (20 minut) nebo Persteril 0.2% (10 minut)', required: true },
  { id: 'keg_start_2', category: '1. Začátek stáčení', text: 'Poté proplach pivního vedení čistou vodou', required: true },
  { id: 'keg_start_valves_weekly', category: '1. Začátek stáčení', text: 'Klapky: vydrhnout kartáčem louhem 2%, nechat působit 15 minut, poté spláchnout proudem vody (splnit 1x týdně při 1. stáčení)', required: true, weekly: true },
  { id: 'keg_start_valves_daily', category: '1. Začátek stáčení', text: 'Klapky: vystříkat Persterilem 0.2%, nechat působit 10 minut, poté spláchnout proudem vody (každodenní úkon, pokud už není splněn týdenní louh)', required: true },

  // 2. Konec stáčení
  { id: 'keg_end_1', category: '2. Konec stáčení', text: 'Po konci stáčení: důkladný proplach pivních cest vodou', required: true },
  { id: 'keg_end_2', category: '2. Konec stáčení', text: 'Opláchnutí stáčecích klapek vodou', required: true },
  { id: 'keg_end_3', category: '2. Konec stáčení', text: 'Oplach narážečů vodou a jejich vizuální kontrola', required: true },
  { id: 'keg_end_4', category: '2. Konec stáčení', text: 'Spláchnutí podlah ve sklepě vodou', required: true },
  { id: 'keg_end_5', category: '2. Konec stáčení', text: 'Spláchnutí podlahy a stěn u stáčeček', required: true },
  { id: 'keg_end_6', category: '2. Konec stáčení', text: 'Ponořit hlavy narážečů do kýble s roztokem Persterilu', required: true },

  // 4. Měsíční údržba
  { id: 'keg_month_1', category: '4. Měsíční údržba (1x měsíčně)', text: 'Kompletně rozebrat narážeče a naložit je do louhu NaOH', required: true },
  { id: 'keg_month_2', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit rozebrané díly narážečů kartáčem a nechat v louhu 24 hodin', required: true },
  { id: 'keg_month_3', category: '4. Měsíční údržba (1x měsíčně)', text: 'Poté důkladný oplach všech částí čistou vodou', required: true },
  { id: 'keg_month_4', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vizuální kontrola čistoty a stavu těsnění', required: true },
];

const START_CATEGORY_PREFIX = '1. Začátek';
const MONTHLY_CATEGORY_PREFIX = '4. Měsíční';

// ISO týden pro porovnávání týdenních úkonů
function getISOWeekString(dateStr: string): string {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function isWeeklyItemSatisfiedForKeg(dateKey: string, item: KegChecklistItem): boolean {
  if (!item.weekly) return false;
  try {
    const currentWeek = getISOWeekString(dateKey);
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('keg_checklist_')) {
        const checkDate = key.replace('keg_checklist_', '');
        if (getISOWeekString(checkDate) === currentWeek) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const map = JSON.parse(raw);
            if (map[item.id] === true) return true;
          }
        }
      }
    }
  } catch {}
  return false;
}

export function getFilteredKegItems(phase: ChecklistPhase, dateKey: string): KegChecklistItem[] {
  let base = phase === 'start'
    ? KEG_DEFAULT_ITEMS.filter((it) => it.category.startsWith(START_CATEGORY_PREFIX))
    : phase === 'monthly'
      ? KEG_DEFAULT_ITEMS.filter((it) => it.category.startsWith(MONTHLY_CATEGORY_PREFIX))
      : KEG_DEFAULT_ITEMS.filter((it) => !it.category.startsWith(START_CATEGORY_PREFIX));

  if (phase === 'start' && dateKey) {
    const isWeeklyValvesDone = isWeeklyItemSatisfiedForKeg(dateKey, { id: 'keg_start_valves_weekly', category: '', text: '', weekly: true });
    
    return base.filter((it) => {
      // Pokud je již hotové týdenní čištění louhem, nezobrazujeme ho
      if (it.id === 'keg_start_valves_weekly' && isWeeklyValvesDone) return false;
      // Pokud je hotové týdenní čištění louhem, denní vystříkání persterilem v tento den se nevyžaduje
      if (it.id === 'keg_start_valves_daily' && isWeeklyValvesDone) return false;
      return true;
    });
  }
  return base;
}

export function isStartChecklistCompleteForKeg(dateKey: string): boolean {
  try {
    const raw = localStorage.getItem('keg_checklist_' + dateKey);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    
    const items = getFilteredKegItems('start', dateKey);
    return items.every((it) => !!map[it.id] || isWeeklyItemSatisfiedForKeg(dateKey, it));
  } catch {
    return false;
  }
}

export function isMonthlyChecklistCompleteForKeg(dateKey: string): boolean {
  try {
    const raw = localStorage.getItem('keg_checklist_' + dateKey);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return KEG_DEFAULT_ITEMS
      .filter((it) => it.category.startsWith(MONTHLY_CATEGORY_PREFIX))
      .every((it) => !!map[it.id]);
  } catch {
    return false;
  }
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  dateStr?: string;
  onApplyNote?: (noteText: string) => void;
  blockCloseUntilStartDone?: boolean;
  phase?: ChecklistPhase;
  initialCategory?: string;
  showSkip?: boolean;
};

export function KeggingChecklistModal({ isOpen, onClose, dateStr, onApplyNote, blockCloseUntilStartDone, phase = 'start', initialCategory, showSkip }: Props) {
  const dateKey = dateStr || new Date().toISOString().slice(0, 10);
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      try {
        const raw = localStorage.getItem('keg_checklist_' + dateKey);
        if (raw) setChecks(JSON.parse(raw));
        else setChecks({});
      } catch {
        setChecks({});
      }
    }
  }, [isOpen, dateKey]);

  const items = getFilteredKegItems(phase, dateKey);

  const categories = Array.from(new Set(items.map((it) => it.category))).sort();

  const [activeCategory, setActiveCategory] = useState<string>(categories[0] || '');

  useEffect(() => {
    if (categories.length > 0) {
      if (initialCategory && categories.includes(initialCategory)) {
        setActiveCategory(initialCategory);
      } else if (!categories.includes(activeCategory)) {
        setActiveCategory(categories[0]);
      }
    }
  }, [phase, dateKey, initialCategory]);

  const currentCategoryItems = items.filter((it) => it.category === activeCategory);

  const allCategoryDone = currentCategoryItems.every((it) => {
    if (checks[it.id]) return true;
    if (it.weekly && isWeeklyItemSatisfiedForKeg(dateKey, it)) return true;
    return false;
  });

  const isOverallStartDone = isStartChecklistCompleteForKeg(dateKey);

  function toggleItem(id: string) {
    const next = { ...checks, [id]: !checks[id] };
    setChecks(next);
    localStorage.setItem('keg_checklist_' + dateKey, JSON.stringify(next));
  }

  function handleReset() {
    if (!window.confirm('Opravdu resetovat všechny odškrtnuté položky pro tento den?')) return;
    setChecks({});
    localStorage.removeItem('keg_checklist_' + dateKey);
  }

  if (!isOpen) return null;

  const effectiveOnClose = blockCloseUntilStartDone && !isOverallStartDone ? () => {} : onClose;

  return (
    <Modal
      open
      onClose={effectiveOnClose}
      title={phase === 'start'
        ? '📋 Oficiální checklist stáčení KEGů — příprava pracoviště'
        : phase === 'monthly'
          ? '📋 Oficiální checklist stáčení KEGů — měsíční údržba'
          : '📋 Oficiální checklist stáčení KEGů — konec stáčení (úklid)'}
      wide
    >
      <div className="space-y-4">

        {/* Categories Tab Selector */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded-xl">
            {categories.map((cat) => {
              const catItems = items.filter((it) => it.category === cat);
              const doneCount = catItems.filter((it) => checks[it.id] || isWeeklyItemSatisfiedForKeg(dateKey, it)).length;
              const totalCount = catItems.length;
              const isDone = doneCount === totalCount;
              const isSelected = activeCategory === cat;

              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wide uppercase transition ${
                    isSelected
                      ? 'bg-white text-neutral-950 shadow-xs'
                      : isDone
                        ? 'text-emerald-700 hover:bg-white/40'
                        : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {isDone && <Check size={10} className="stroke-[3]" />}
                    <span>{cat}</span>
                    <span className="opacity-65">({doneCount}/{totalCount})</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content list */}
        <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/60 max-h-[350px] overflow-y-auto space-y-2.5">
          {currentCategoryItems.map((item) => {
            const isChecked = !!checks[item.id];
            const isWeeklySatisfied = isWeeklyItemSatisfiedForKeg(dateKey, item);
            const disabled = isWeeklySatisfied;

            return (
              <div
                key={item.id}
                onClick={() => !disabled && toggleItem(item.id)}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                  isWeeklySatisfied
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950 opacity-80 cursor-default'
                    : isChecked
                      ? 'bg-amber-50/60 border-amber-300 shadow-2xs cursor-pointer'
                      : 'bg-white border-neutral-200 hover:border-amber-400 cursor-pointer'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isWeeklySatisfied ? (
                    <ShieldCheck size={18} className="text-emerald-600" />
                  ) : isChecked ? (
                    <CheckSquare size={18} className="text-amber-600" />
                  ) : (
                    <Square size={18} className="text-neutral-300" />
                  )}
                </div>
                <div className="text-xs leading-normal">
                  <span className={`font-semibold ${isChecked || isWeeklySatisfied ? 'text-neutral-900 line-through opacity-70' : 'text-neutral-800'}`}>
                    {item.text}
                  </span>
                  {isWeeklySatisfied && (
                    <span className="block text-[9px] text-emerald-700 font-extrabold mt-1">
                      🛡️ Splněno v tomto týdnu (není vyžadováno)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-neutral-100">
          <div className="flex gap-2 items-center flex-wrap">
            <button
              onClick={handleReset}
              className="btn-ghost flex items-center justify-center gap-1 text-[10px] font-black text-rose-600 hover:bg-rose-50"
            >
              <RotateCcw size={12} />
              <span>Resetovat checklist</span>
            </button>
            {showSkip && (
              <button
                onClick={() => {
                  const next = { ...checks };
                  items.forEach((it) => {
                    next[it.id] = true;
                  });
                  setChecks(next);
                  localStorage.setItem('keg_checklist_' + dateKey, JSON.stringify(next));
                  onClose();
                }}
                className="btn-ghost flex items-center justify-center gap-1 text-[10px] font-black text-rose-600 hover:bg-rose-50 border border-dashed border-rose-200 px-2.5 py-1.5 rounded-xl"
              >
                <span>🔓 Přeskočit (Admin)</span>
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {blockCloseUntilStartDone && !isOverallStartDone ? (
              <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-xs">
                <Lock size={13} className="shrink-0" />
                <span>Splňte checklist pro pokračování</span>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (onApplyNote) {
                    const notes = Object.keys(checks)
                      .filter((k) => checks[k])
                      .map((k) => KEG_DEFAULT_ITEMS.find((it) => it.id === k)?.text)
                      .filter(Boolean)
                      .join(' | ');
                    onApplyNote(notes);
                  }
                  onClose();
                }}
                className="btn-primary text-xs font-black shadow-md bg-amber-500 hover:bg-amber-600 border-none text-neutral-950"
              >
                <span>{phase === 'start' ? 'Pokračovat na stáčení' : 'Ukončit a uložit'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
