import { synchronizuj, ulozStav } from '../lib/checklistData';
import { CHECKLISTY_ZAPNUTE } from '../lib/skryteModuly';
import { sZnackouKonce } from '../lib/konecStaceni';
import { useState, useEffect } from 'react';
import { Modal } from './ui';
import { Check, CheckSquare, Lock, RotateCcw, ShieldCheck, Square, Unlock } from 'lucide-react';
import { zavibruj } from '../lib/haptika';
import { uloz } from '../lib/uloziste';
import { businessDateISO } from '../lib/businessDate';
import { DEFAULT_ITEMS, MONTHLY_CATEGORY_PREFIX, type ChecklistItem } from '../lib/checklistyPolozky';

export { DEFAULT_ITEMS, MONTHLY_CATEGORY_PREFIX };


// Fáze checklistu: 'start' = jen příprava pracoviště před stáčením (sekce
// „1. Začátek stáčení"), 'end' = zbytek checklistu vyplňovaný až po ukončení
// stáčení („2. Konec stáčení", „3. Týdenní kontrola", „4. Měsíční údržba"),
// 'monthly' = jen sekce „4. Měsíční údržba" (okno s měsíčním checklistem,
// které se v posledním týdnu měsíce otevře po splnění začátku stáčení).
export type ChecklistPhase = 'start' | 'end' | 'monthly';


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

// Pomocná funkce — je „Stáčecí den" (checklist přípravy pracoviště) pro dané
// datum ÚPLNĚ splněný? Splněno = všechny položky odškrtnuté v localStorage
// (klíč bottling_checklist_<YYYY-MM-DD>).
export function isChecklistCompleteForDate(dateKey: string): boolean {
  try {
    const raw = localStorage.getItem('bottling_checklist_' + dateKey);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return DEFAULT_ITEMS.every((it) => !!map[it.id] || isWeeklyItemSatisfiedForDate(dateKey, it));
  } catch {
    return false;
  }
}

// Povinná brána pro vstup do zápisu stáčení: splněno = odškrtnuté VŠECHNY
// položky sekce „1. Začátek stáčení" (příprava pracoviště PŘED stáčením).
// Sekce „2. Konec stáčení" (úklid po stáčení), „3. Týdenní kontrola" a
// „4. Měsíční údržba" se nedají odškrtnout dopředu, proto vstup neblokují.
export const START_CATEGORY_PREFIX = '1.';
// Přesný název sekce měsíční údržby (zaměření okna checklistu na ni).
export const MONTHLY_CATEGORY = '4. Měsíční údržba (1x měsíčně)';

// ---- Týdenní položky „1. Začátek stáčení\" (stačí 1x týdně) ----
// Např. kartáčové čištění stáčeček studeným 2% louhem (start_2): dělá se jen
// jednou týdně, takže jakmile je v aktuálním ISO týdnu splněná, v dalších
// „Stáčecích dnech\" už se nezobrazuje a nesmí blokovat vstup do zápisu stáčení.

// Formátuje datum lokálním časem jako YYYY-MM-DD (klíč localStorage).
function dateKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Vrací datum pondělí (začátek ISO týdne) pro daný „Stáčecí den".
export function getWeekStartDate(dateKey: string): string {
  const d = new Date(dateKey + 'T00:00:00');
  const diffToMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return dateKeyOf(d);
}

// Byla týdenní položka v aktuálním ISO týdnu už splněná v některém „Stáčecím
// dni"? Projde všechny záznamy bottling_checklist_<datum> od pondělí do neděle.
export function isWeeklyItemDoneForWeek(dateKey: string, itemId: string): boolean {
  try {
    const monday = new Date(getWeekStartDate(dateKey) + 'T00:00:00');
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const raw = localStorage.getItem('bottling_checklist_' + dateKeyOf(d));
      if (!raw) continue;
      const map = JSON.parse(raw) as Record<string, boolean>;
      if (map[itemId]) return true;
    }
  } catch {
    return false;
  }
  return false;
}

// Je týdenní položka pro dané datum uspokojená (splněná tento týden)?
function isWeeklyItemSatisfiedForDate(dateKey: string, item: ChecklistItem): boolean {
  return !!item.weekly && isWeeklyItemDoneForWeek(dateKey, item.id);
}

// Položky viditelné v dané fázi checklistu:
//  - 'start'   → pouze sekce „1. Začátek stáčení" (příprava pracoviště PŘED stáčením)
//  - 'end'     → zbytek (konec stáčení, týdenní kontrola, měsíční údržba), který
//                se vyplňuje až PO ukončení stáčení
//  - 'monthly' → jen sekce „4. Měsíční údržba" (měsíční checklist po začátku stáčení).
export function getChecklistItemsForPhase(phase: ChecklistPhase, dateKey?: string): ChecklistItem[] {
  const base = phase === 'start'
    ? DEFAULT_ITEMS.filter((it) => it.category.startsWith(START_CATEGORY_PREFIX))
    : phase === 'monthly'
      ? DEFAULT_ITEMS.filter((it) => it.category.startsWith(MONTHLY_CATEGORY_PREFIX))
      : DEFAULT_ITEMS.filter((it) => !it.category.startsWith(START_CATEGORY_PREFIX));
  // Ve fázi „příprava pracoviště\" se týdenní položky (např. kartáčové čištění
  // stáčeček 2% louhem) zobrazují jen do té doby, než jsou v aktuálním týdnu
  // splněné — na dalších stáčeních v týdnu už nezabírají místo ani neblokují.
  if (phase === 'start' && dateKey) {
    return base.filter((it) => !isWeeklyItemSatisfiedForDate(dateKey, it));
  }
  return base;
}

export function isStartChecklistCompleteForDate(dateKey: string): boolean {
  if (!CHECKLISTY_ZAPNUTE) return true; // check-listy jsou zatím skryté — brána „před stáčením“ se nehlídá
  try {
    const raw = localStorage.getItem('bottling_checklist_' + dateKey);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return DEFAULT_ITEMS
      .filter((it) => it.category.startsWith(START_CATEGORY_PREFIX))
      .every((it) => !!map[it.id] || isWeeklyItemSatisfiedForDate(dateKey, it));
  } catch {
    return false;
  }
}

// Je sekce „4. Měsíční údržba" pro dané datum úplně odškrtnutá? Po splnění už
// se okno s měsíčním checklistem po začátku stáčení samo neotevírá.
export function isMonthlyChecklistCompleteForDate(dateKey: string): boolean {
  if (!CHECKLISTY_ZAPNUTE) return true;
  try {
    const raw = localStorage.getItem('bottling_checklist_' + dateKey);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, boolean>;
    return DEFAULT_ITEMS
      .filter((it) => it.category.startsWith(MONTHLY_CATEGORY_PREFIX))
      .every((it) => !!map[it.id]);
  } catch {
    return false;
  }
}

export function BottlingChecklistModal({ isOpen, onClose, dateStr, onApplyNote, blockCloseUntilStartDone, phase = 'start', initialCategory, showSkip }: Props) {
  const dateKey = dateStr || businessDateISO();
  const storageKey = 'bottling_checklist_' + dateKey;

  // Položky viditelné v aktuální fázi (jen příprava, konec stáčení nebo měsíční údržba).
  const items = getChecklistItemsForPhase(phase, dateKey);

  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  // Při každém otevření modalu se záložka kategorie vrátí na úvodní (příp. se
  // rovnou zaměří na měsíční údržbu), aby se okno neotevřelo na staré záložce.
  useEffect(() => {
    if (isOpen) {
      setActiveCategory(initialCategory ?? 'ALL');
    }
  }, [isOpen, initialCategory]);

  // Stav se při otevření srovná s databází — checklist proklikaný na tabletu
  // tak platí i na mobilu (viz lib/checklistData.ts). Nejdřív se ukáže lokální
  // zrcadlo, ať okno nečeká na síť, a hned poté sloučený stav.
  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = localStorage.getItem(storageKey);
      setCheckedMap(saved ? JSON.parse(saved) : {});
    } catch {
      setCheckedMap({});
    }
    let platne = true;
    // Checklist lahví zná jen ano/ne (na rozdíl od KEGů, kde krok sanitace
    // nese volbu NaOH/Persteril), takže se sloučený stav převede na booleany.
    void synchronizuj('lahve', dateKey).then((slouceno) => {
      if (!platne) return;
      const jenBooleany: Record<string, boolean> = {};
      Object.entries(slouceno).forEach(([k, v]) => { jenBooleany[k] = typeof v === 'string' ? v.length > 0 : !!v; });
      setCheckedMap(jenBooleany);
    });
    return () => { platne = false; };
  }, [isOpen, storageKey, dateKey]);

  // Zápis: stav v okně se překreslí hned, databáze i zrcadlo se dorovnají na
  // pozadí. Odznačené položky se schválně drží jako `false` (ne mazáním
  // klíče), aby ulozStav vědělo, co má z databáze odebrat.
  // Spolu se stavem se ukládá odvozená značka „konec stáčení hotový"
  // (lib/konecStaceni.ts) — podle ní pozná databáze, jestli má večer poslat
  // připomínku na telefon. Jde do téže mapy, takže se při odškrtnutí zase
  // sama zruší a nemůže se rozejít s tím, co je vidět v okně.
  const zapis = (next: Record<string, boolean>) => {
    const sZnackou = sZnackouKonce(DEFAULT_ITEMS, next);
    void ulozStav('lahve', dateKey, sZnackou);
    return sZnackou;
  };

  const toggleItem = (id: string) => {
    zavibruj('odskrtnuto');
    setCheckedMap((prev) => zapis({ ...prev, [id]: !prev[id] }));
  };

  const selectAll = () => {
    setCheckedMap((prev) => {
      const next = { ...prev };
      items.forEach((it) => { next[it.id] = true; });
      return zapis(next);
    });
  };

  const resetAll = () => {
    setCheckedMap((prev) => {
      const next = { ...prev };
      items.forEach((it) => { next[it.id] = false; });
      return zapis(next);
    });
  };

  const totalCount = items.length;
  const checkedCount = items.filter((it) => checkedMap[it.id]).length;
  const percent = Math.round((checkedCount / totalCount) * 100);

  const categories = Array.from(new Set(items.map((it) => it.category)));

  // Splnění sekce „1. Začátek stáčení" — povinná brána pro vstup do zápisu.
  const startItems = items.filter((it) => it.category.startsWith(START_CATEGORY_PREFIX));
  const startCheckedCount = startItems.filter((it) => checkedMap[it.id]).length;
  const startDone = startCheckedCount === startItems.length;
  // Bránový režim platí jen pro fázi „příprava pracoviště" ('start') a dál
  // drží zamčené tlačítko „Pokračovat na stáčení", dokud není sekce hotová —
  // ale samotné zavření okna (✕, Esc, klik mimo) už NEBLOKUJE, na výslovné
  // přání uživatele (dřív šlo zavřít jen přes „Přeskočit (Admin)").
  const gateActive = phase === 'start' && !!blockCloseUntilStartDone;
  const gateLocked = gateActive && !startDone;
  const effectiveOnClose = onClose;

  const handleFinish = () => {
    if (onApplyNote && checkedCount > 0) {
      const label = phase === 'start' ? 'Příprava pracoviště' : phase === 'monthly' ? 'Měsíční údržba' : 'Konec stáčení (úklid)';
      onApplyNote('Checklist stáčení lahví — ' + label + ' (' + checkedCount + '/' + totalCount + ' splněno)');
    }
    onClose();
  };

  // Splnění brány → zavře modal (bez automatické poznámky).
  const handleGateFinish = () => {
    if (startDone) onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal
      open
      onClose={effectiveOnClose}
      title={phase === 'start'
        ? 'Oficiální kontrolní seznam (Checklist) stáčení lahví — příprava pracoviště'
        : phase === 'monthly'
          ? 'Oficiální kontrolní seznam (Checklist) stáčení lahví — měsíční údržba'
          : 'Oficiální kontrolní seznam (Checklist) stáčení lahví — konec stáčení (úklid)'}
      wide
    >
      <div className="space-y-4">
        {/* Header progress box */}
        <div className="bg-amber-50 p-3.5 rounded border border-amber-300 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-black text-amber-950">
            <span className="flex items-center gap-1.5 text-sm">
              <ShieldCheck size={18} className="text-amber-600" />
              <span>Sanitace & Kontrola stáčení ({dateKey})</span>
            </span>
            <span className="text-sm bg-amber-200 px-2.5 py-0.5 rounded-full font-mono font-extrabold">
              {checkedCount} / {totalCount} ({percent}%)
            </span>
          </div>
          <div className="w-full bg-amber-200/70 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
              style={{ width: percent + '%' }}
            />
          </div>
          <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
            <button
              type="button"
              className="btn-ghost !rounded !py-1 !px-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
              onClick={selectAll}
            >
              <Check className="ikona-text" /> Označit vše jako splněné
            </button>
            <button
              type="button"
              className="btn-ghost !rounded !py-1 !px-2.5 text-xs font-bold text-neutral-600 hover:bg-neutral-100"
              onClick={resetAll}
            >
              <RotateCcw size={12} className="inline mr-1" />
              Vyčistit checklist
            </button>
          </div>
        </div>

        {/* Brána — nutné splnit sekci „1. Začátek stáčení" */}
        {gateActive && !startDone && (
          <div className="bg-rose-50 border border-rose-300 rounded px-3.5 py-2.5 text-xs font-bold text-rose-900 flex items-start gap-2">
            <Lock size={16} className="mt-0.5 shrink-0" />
            <span>
              Před vstupem do zápisu stáčení je nutné odškrtnout <b>celou sekci „1. Začátek stáčení"</b> (příprava pracoviště).
              {startCheckedCount > 0 && <> Zbývá {startItems.length - startCheckedCount} položek.</>}
            </span>
          </div>
        )}

        {/* Category filter tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            className={'tap px-3 py-1.5 rounded font-bold transition shrink-0 ' + (activeCategory === 'ALL' ? 'bg-amber-500 text-amber-950 shadow-xs' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200')}
            onClick={() => setActiveCategory('ALL')}
          >
            Vše ({items.length})
          </button>
          {categories.map((cat) => {
            const count = items.filter((i) => i.category === cat).length;
            const checked = items.filter((i) => i.category === cat && checkedMap[i.id]).length;
            return (
              <button
                key={cat}
                type="button"
                className={'tap px-3 py-1.5 rounded font-bold transition shrink-0 ' + (activeCategory === cat ? 'bg-amber-500 text-amber-950 shadow-xs' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200')}
                onClick={() => setActiveCategory(cat)}
              >
                {(cat.split(' ')[1] || cat) + ' (' + checked + '/' + count + ')'}
              </button>
            );
          })}
        </div>

        {/* Items list */}
        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
          {categories
            .filter((cat) => activeCategory === 'ALL' || activeCategory === cat)
            .map((cat) => {
              const catItems = items.filter((it) => it.category === cat);
              const catChecked = catItems.filter((it) => checkedMap[it.id]).length;

              return (
                <div key={cat} className="bg-white border border-neutral-200 rounded p-3.5 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                    <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wider">{cat}</h4>
                    <span className="text-udaj font-bold text-neutral-500 font-mono">
                      {catChecked} / {catItems.length}
                    </span>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    {catItems.map((item) => {
                      const isChecked = !!checkedMap[item.id];
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleItem(item.id)}
                          className={'w-full text-left p-2.5 rounded border transition flex items-start gap-3 select-none ' + (
                            isChecked
                              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-semibold'
                              : 'bg-neutral-50/60 border-neutral-200 text-neutral-800 hover:bg-neutral-100/80'
                          )}
                        >
                          <span className={'shrink-0 mt-0.5 ' + (isChecked ? 'text-emerald-600' : 'text-neutral-400')}>
                            {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                          </span>
                          <div className="flex-1 text-xs leading-relaxed">
                            <span className={isChecked ? 'line-through text-emerald-900 opacity-90' : ''}>
                              {item.text}
                            </span>
                            {item.required && !isChecked && (
                              <span className="ml-1.5 text-udaj text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                                Důležité
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-3 border-t border-neutral-200 gap-3">
          {gateActive ? (
            <div className="text-udaj font-bold text-neutral-500 leading-snug">
              {startDone ? (
                <span className="text-emerald-700"><Check className="ikona-text" /> Příprava pracoviště splněna — můžete pokračovat.</span>
               ) : (
                <span>
                  Odškrtněte celou sekci <b>„1. Začátek stáčení"</b> (zbývá {startItems.length - startCheckedCount} položek), abyste mohli vstoupit do zápisu stáčení.
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {showSkip && (
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...checkedMap };
                    items.forEach((it) => {
                      next[it.id] = true;
                    });
                    setCheckedMap(next);
                    uloz(storageKey, JSON.stringify(next));
                    onClose();
                  }}
                  className="btn-ghost !rounded flex items-center justify-center gap-1 text-udaj font-black text-rose-600 hover:bg-rose-50 border border-dashed border-rose-200 px-2.5 py-1.5 rounded"
                >
                  <span><Unlock className="ikona-text" /> Přeskočit (Admin)</span>
                </button>
              )}
              <button type="button" className="btn-ghost !rounded text-xs" onClick={onClose}>
                Zavřít
              </button>
            </div>
          )}
          {gateActive && showSkip && (
            <button
              type="button"
              onClick={() => {
                const next = { ...checkedMap };
                items.forEach((it) => {
                  next[it.id] = true;
                });
                setCheckedMap(next);
                uloz(storageKey, JSON.stringify(next));
                onClose();
              }}
              className="btn-ghost !rounded flex items-center justify-center gap-1 text-udaj font-black text-rose-600 hover:bg-rose-50 border border-dashed border-rose-200 px-2.5 py-1.5 rounded"
            >
              <span><Unlock className="ikona-text" /> Přeskočit (Admin)</span>
            </button>
          )}
          <button
            type="button"
            disabled={gateLocked}
            className={'btn-primary py-2.5 px-5 text-xs font-black shadow-md flex items-center gap-2 ' + (gateLocked ? 'opacity-45 cursor-not-allowed' : '')}
            onClick={gateActive ? handleGateFinish : handleFinish}
          >
            <Check size={14} />
            <span>
              {gateActive
                ? (startDone ? 'Pokračovat na stáčení' : 'Začátek stáčení: ' + startCheckedCount + '/' + startItems.length)
                : (phase === 'monthly' ? 'Potvrdit měsíční údržbu' : phase === 'end' ? 'Potvrdit konec stáčení' : 'Potvrdit a uložit checklist')}
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
