import { useState, useEffect } from 'react';
import { Modal } from './ui';
import { AlertTriangle, Check, CheckSquare, FlaskConical, Lock, RotateCcw, ShieldCheck, Square, Unlock } from 'lucide-react';
import { potvrd } from '../lib/toast';
import { synchronizuj, ulozStav } from '../lib/checklistData';
import { zavibruj } from '../lib/haptika';

export type ChecklistPhase = 'start' | 'end' | 'monthly' | 'all';

export type KegChecklistItem = {
  id: string;
  category: string;
  text: string;
  required?: boolean;
  weekly?: boolean; // Splněno jednou týdně
  choice?: boolean; // Krok s volbou mezi NaOH a Persterilem (vybere se JEDEN)
};

export const KEG_DEFAULT_ITEMS: KegChecklistItem[] = [
  // 1. Začátek stáčení
  { id: 'keg_start_1', category: '1. Začátek stáčení', text: 'Proplach pivních cest: NaOH 2% (20 minut) NEBO Persteril 0.2% (10 minut) — vyberte jeden postup', required: true, choice: true },
  { id: 'keg_start_valves_spray', category: '1. Začátek stáčení', text: 'Vystříkat klapky Persterilem 0.2%', required: true },
  { id: 'keg_start_valves_rinse', category: '1. Začátek stáčení', text: 'Oplach klapek vodou', required: true },
  { id: 'keg_start_bottler_rinse', category: '1. Začátek stáčení', text: 'Oplach vodou stáčečku (2 minuty)', required: true },

  // 2. Konec stáčení
  { id: 'keg_end_1', category: '2. Konec stáčení', text: 'Po konci stáčení: důkladný proplach pivních cest vodou', required: true },
  { id: 'keg_end_2', category: '2. Konec stáčení', text: 'Opláchnutí stáčecích klapek vodou', required: true },
  { id: 'keg_end_3', category: '2. Konec stáčení', text: 'Oplach narážečů vodou a jejich vizuální kontrola', required: true },
  { id: 'keg_end_4', category: '2. Konec stáčení', text: 'Spláchnutí podlah ve sklepě vodou', required: true },
  { id: 'keg_end_5', category: '2. Konec stáčení', text: 'Spláchnutí podlahy a stěn u stáčeček', required: true },
  { id: 'keg_end_6', category: '2. Konec stáčení', text: 'Ponořit hlavy narážečů do kýble s roztokem Persterilu', required: true },

  // 4. Měsíční údržba
  { id: 'keg_month_1', category: '4. Měsíční údržba (1x měsíčně)', text: 'Kompletně rozebrat VŠECHNY narážeče a rychlospojky a naložit je do louhu NaOH', required: true },
  { id: 'keg_month_2', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit rozebrané díly narážečů a rychlospojek kartáčem a nechat v louhu 24 hodin', required: true },
  { id: 'keg_month_3', category: '4. Měsíční údržba (1x měsíčně)', text: 'Poté důkladný oplach všech částí čistou vodou', required: true },
  { id: 'keg_month_4', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vizuální kontrola čistoty a stavu těsnění', required: true },
];

const START_CATEGORY_PREFIX = '1. Začátek';
export const KEG_MONTHLY_CATEGORY_PREFIX = '4. Měsíční';
const MONTHLY_CATEGORY_PREFIX = KEG_MONTHLY_CATEGORY_PREFIX;

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

export function getFilteredKegItems(phase: ChecklistPhase): KegChecklistItem[] {
  return phase === 'start'
    ? KEG_DEFAULT_ITEMS.filter((it) => it.category.startsWith(START_CATEGORY_PREFIX))
    : phase === 'monthly'
      ? KEG_DEFAULT_ITEMS.filter((it) => it.category.startsWith(MONTHLY_CATEGORY_PREFIX))
      : phase === 'all'
        ? KEG_DEFAULT_ITEMS
        : KEG_DEFAULT_ITEMS.filter((it) => !it.category.startsWith(START_CATEGORY_PREFIX));
}

export function isStartChecklistCompleteForKeg(dateKey: string): boolean {
  try {
    const raw = localStorage.getItem('keg_checklist_' + dateKey);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    
    const items = getFilteredKegItems('start');
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

type BodyProps = {
  dateStr?: string;
  onApplyNote?: (noteText: string) => void;
  onDone?: () => void;
  blockCloseUntilStartDone?: boolean;
  phase?: ChecklistPhase;
  initialCategory?: string;
  showSkip?: boolean;
  /** Zvýrazní upozornění na měsíční údržbu i mimo phase='monthly' — nastavuje volající (isLastWeekOfMonth). */
  isLastWeekOfMonth?: boolean;
};

/**
 * Obsah checklistu (kategorie + položky + akce) bez modálního obalu —
 * použitelný jak uvnitř Modal (viz KeggingChecklistModal níže), tak přímo
 * vložený do stránky (záložka "Checklist" v Kegging.tsx pro souhrnný pohled).
 */
export function KeggingChecklistBody({ dateStr, onApplyNote, onDone, blockCloseUntilStartDone, phase = 'start', initialCategory, showSkip, isLastWeekOfMonth = false }: BodyProps) {
  const dateKey = dateStr || new Date().toISOString().slice(0, 10);
  const [checks, setChecks] = useState<Record<string, boolean | string>>({});

  // Stav se srovná s databází, takže checklist proklikaný na tabletu platí i
  // na mobilu (viz lib/checklistData.ts). Nejdřív lokální zrcadlo, ať okno
  // nečeká na síť, hned poté sloučený stav.
  useEffect(() => {
    try {
      const raw = localStorage.getItem('keg_checklist_' + dateKey);
      setChecks(raw ? JSON.parse(raw) : {});
    } catch {
      setChecks({});
    }
    let platne = true;
    void synchronizuj('kegy', dateKey).then((slouceno) => { if (platne) setChecks(slouceno); });
    return () => { platne = false; };
  }, [dateKey]);

  /** Zapíše stav do zrcadla i do databáze. Vrací ho, ať jde řetězit do setChecks. */
  function zapis(next: Record<string, boolean | string>) {
    void ulozStav('kegy', dateKey, next);
    return next;
  }

  const items = getFilteredKegItems(phase);

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
    zavibruj('odskrtnuto');
    setChecks(zapis({ ...checks, [id]: !checks[id] }));
  }

  async function handleReset() {
    if (!(await potvrd('Opravdu resetovat všechny odškrtnuté položky pro tento den?'))) return;
    // Odznačené položky se drží jako false (ne smazáním klíče), aby ulozStav
    // vědělo, které řádky má z databáze odebrat — jinak by reset zmizel jen
    // na tomhle zařízení a z cloudu by se při dalším otevření vrátil.
    const vynulovane: Record<string, boolean | string> = {};
    Object.keys(checks).forEach((k) => { vynulovane[k] = false; });
    setChecks(zapis(vynulovane));
  }

  return (
      <div className="space-y-4">

        {(phase === 'monthly' || (phase === 'all' && isLastWeekOfMonth)) && (
          <div className="p-3.5 rounded border-2 border-rose-300 bg-rose-50 text-rose-900 text-xs leading-relaxed flex items-start gap-3">
            <AlertTriangle size={18} className="shrink-0 text-rose-600 mt-0.5" />
            <div className="space-y-1">
              <p className="font-black text-rose-700 uppercase tracking-wider text-udaj"><AlertTriangle className="ikona-text" /> Poslední týden v měsíci — povinná měsíční údržba</p>
              <p className="font-medium">
                Je nutné <b>kompletně rozebrat všechny narážeče a rychlospojky</b>, naložit je do louhu NaOH,
                po 24 hodinách vyčistit kartáčem, důkladně opláchnout čistou vodou a provést vizuální kontrolu čistoty a těsnění.
              </p>
            </div>
          </div>
        )}

        {/* Categories Tab Selector */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1 bg-neutral-100 p-1 rounded">
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
                  className={`tap px-3 py-1.5 rounded text-udaj font-black tracking-wide uppercase transition ${
                    isSelected
                      ? 'bg-white text-neutral-950 shadow-xs'
                      : isDone
                        ? 'text-emerald-700 hover:bg-white/40'
                        : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {isDone && <Check size={12} className="stroke-[3]" />}
                    <span>{cat}</span>
                    <span className="opacity-65">({doneCount}/{totalCount})</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content list */}
        <div className="bg-neutral-50 p-4 rounded border border-neutral-200/60 max-h-[350px] overflow-y-auto space-y-2.5">
          {currentCategoryItems.map((item) => {
            const isChecked = !!checks[item.id];
            const isWeeklySatisfied = isWeeklyItemSatisfiedForKeg(dateKey, item);
            const disabled = isWeeklySatisfied;

            // Krok s volbou mezi NaOH a Persterilem — vybere se JEDEN postup.
            if (item.choice) {
              const choiceKey = 'keg_start_1_choice';
              const choiceVal = (checks[choiceKey] as string) || (isChecked ? 'naoh' : '');
              const pick = (val: 'naoh' | 'persteril') => {
                setChecks(zapis({ ...checks, ['keg_start_1']: true, [choiceKey]: val }));
              };
              const unpick = () => {
                setChecks(zapis({ ...checks, ['keg_start_1']: false, [choiceKey]: '' }));
              };
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded border transition-all ${choiceVal ? 'bg-amber-50/60 border-amber-300 shadow-2xs' : 'bg-white border-neutral-200'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {choiceVal ? <CheckSquare size={18} className="text-amber-600" /> : <Square size={18} className="text-neutral-400" />}
                    </div>
                    <div className="text-xs leading-normal flex-1">
                      <span className={`font-semibold ${choiceVal ? 'text-neutral-900' : 'text-neutral-800'}`}>{item.text}</span>
                      <div className="flex flex-col sm:flex-row gap-2 mt-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); if (choiceVal === 'naoh') unpick(); else pick('naoh'); }}
                          className={`px-3 py-2 rounded border-2 text-udaj font-black transition flex items-center gap-1.5 ${choiceVal === 'naoh' ? 'bg-amber-500 border-amber-600 text-neutral-950 shadow-sm' : 'bg-white border-neutral-300 hover:border-amber-400 text-neutral-700'}`}
                        >
                          <FlaskConical className="ikona-text" /> NaOH 2% (20 minut)
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); if (choiceVal === 'persteril') unpick(); else pick('persteril'); }}
                          className={`px-3 py-2 rounded border-2 text-udaj font-black transition flex items-center gap-1.5 ${choiceVal === 'persteril' ? 'bg-amber-500 border-amber-600 text-neutral-950 shadow-sm' : 'bg-white border-neutral-300 hover:border-amber-400 text-neutral-700'}`}
                        >
                          Persteril 0.2% (10 minut)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                onClick={() => !disabled && toggleItem(item.id)}
                className={`flex items-start gap-3 p-3 rounded border transition-all ${
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
                    <Square size={18} className="text-neutral-400" />
                  )}
                </div>
                <div className="text-xs leading-normal">
                  <span className={`font-semibold ${isChecked || isWeeklySatisfied ? 'text-neutral-900 line-through opacity-70' : 'text-neutral-800'}`}>
                    {item.text}
                  </span>
                  {isWeeklySatisfied && (
                    <span className="block text-udaj text-emerald-700 font-extrabold mt-1">
                      Splněno v tomto týdnu (není vyžadováno)
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
              className="btn-ghost !rounded flex items-center justify-center gap-1 text-udaj font-black text-rose-600 hover:bg-rose-50"
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
                  setChecks(zapis(next));
                  onDone?.();
                }}
                className="btn-ghost !rounded flex items-center justify-center gap-1 text-udaj font-black text-rose-600 hover:bg-rose-50 border border-dashed border-rose-200 px-2.5 py-1.5 rounded"
              >
                <span><Unlock className="ikona-text" /> Přeskočit (Admin)</span>
              </button>
            )}
          </div>

          <div className="flex gap-2">
            {blockCloseUntilStartDone && !isOverallStartDone ? (
              <div className="flex items-center gap-1.5 px-4 py-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-xs">
                <Lock size={14} className="shrink-0" />
                <span>Splňte checklist pro pokračování</span>
              </div>
            ) : phase !== 'all' && onDone ? (
              <button
                onClick={() => {
                  if (onApplyNote) {
                    const notes = Object.keys(checks)
                      .filter((k) => checks[k])
                      .map((k) => {
                        if (k === 'keg_start_1') {
                          return checks['keg_start_1_choice'] === 'persteril'
                            ? 'Proplach cest: Persteril 0.2% (10 minut)'
                            : 'Proplach cest: NaOH 2% (20 minut)';
                        }
                        return KEG_DEFAULT_ITEMS.find((it) => it.id === k)?.text;
                      })
                      .filter(Boolean)
                      .join(' | ');
                    onApplyNote(notes);
                  }
                  onDone();
                }}
                className="btn-primary !rounded text-xs font-black shadow-md bg-amber-500 hover:bg-amber-400 border-none text-neutral-950"
              >
                <span>{phase === 'start' ? 'Pokračovat na stáčení' : 'Ukončit a uložit'}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
  );
}

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  dateStr?: string;
  onApplyNote?: (noteText: string) => void;
  blockCloseUntilStartDone?: boolean;
  phase?: ChecklistPhase;
  initialCategory?: string;
  showSkip?: boolean;
};

/** Modálni obal nad KeggingChecklistBody — použitý pro povinnou bránu před stáčením a rychlé otevření z lišty. */
export function KeggingChecklistModal({ isOpen, onClose, dateStr, onApplyNote, blockCloseUntilStartDone, phase = 'start', initialCategory, showSkip }: ModalProps) {
  const dateKey = dateStr || new Date().toISOString().slice(0, 10);
  const isOverallStartDone = isStartChecklistCompleteForKeg(dateKey);

  if (!isOpen) return null;

  const effectiveOnClose = blockCloseUntilStartDone && !isOverallStartDone ? () => {} : onClose;

  return (
    <Modal
      open
      onClose={effectiveOnClose}
      title={phase === 'start'
        ? 'Oficiální checklist stáčení KEGů — příprava pracoviště'
        : phase === 'monthly'
          ? 'Oficiální checklist stáčení KEGů — měsíční údržba'
          : 'Oficiální checklist stáčení KEGů — konec stáčení (úklid)'}
      wide
    >
      <KeggingChecklistBody
        dateStr={dateStr}
        onApplyNote={onApplyNote}
        onDone={onClose}
        blockCloseUntilStartDone={blockCloseUntilStartDone}
        phase={phase}
        initialCategory={initialCategory}
        showSkip={showSkip}
      />
    </Modal>
  );
}
