import { useState } from 'react';
import { AlertTriangle, CalendarClock, CalendarX2, Check, ClipboardList, PartyPopper, Play } from 'lucide-react';
import {
  isLastWeekOfMonth, getMonthKey,
  readMonthlyCleanupStage, writeMonthlyCleanupStage, markMonthlyLineDone,
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

// Měsíční položky obou linek. Sedí na stejné položky, jaké ukazuje checklist
// ve stáčení lahví a v KEGu — jen sesbírané na jedno místo, ať se úklid dá
// odškrtat rovnou z upozornění (tlačítko „Začít"), bez proklikávání se na
// jinou obrazovku.
const MESICNI_LAHVE = DEFAULT_ITEMS.filter((it) => it.category.startsWith(MONTHLY_CATEGORY_PREFIX));
const MESICNI_KEG = KEG_DEFAULT_ITEMS.filter((it) => it.category.startsWith(KEG_MONTHLY_CATEGORY_PREFIX));

/** Dny posledního týdne měsíce až po `dateStr` (nikdy nepřeteče do minulého měsíce). */
function dnyPoslednihoTydne(dateStr: string): string[] {
  const konec = new Date(dateStr + 'T00:00:00');
  const mesic = konec.getMonth();
  const dny: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(konec);
    d.setDate(konec.getDate() - i);
    if (d.getMonth() !== mesic) break;
    dny.push(
      d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
    );
  }
  return dny;
}

// Odškrtnuté měsíční položky z obou checklistů. Čte se přes CELÝ poslední
// týden, ne jen za dnešek: měsíční úklid se běžně dělá na dvakrát (dnes
// stáčečky, zítra podlahy a stěny) a checklisty se ukládají po dnech — dokud
// se četl jen dnešek, včerejší odškrtnutí zmizela a počítadlo začínalo od nuly.
function nactiOdskrtnuta(dateStr: string): Record<string, boolean> {
  const vysledek: Record<string, boolean> = {};
  // Id se nekříží (month_* vs. keg_month_*), takže je lze držet v jedné mapě.
  for (const den of dnyPoslednihoTydne(dateStr)) {
    for (const prefix of ['bottling_checklist_', 'keg_checklist_']) {
      try {
        const raw = localStorage.getItem(prefix + den);
        if (!raw) continue;
        const mapa = JSON.parse(raw) as Record<string, boolean>;
        Object.keys(mapa).forEach((id) => { if (mapa[id]) vysledek[id] = true; });
      } catch {}
    }
  }
  return vysledek;
}

// Zapíše odškrtnutí do dnešního checklistu. Odškrtnutí ZPĚT (odklik) se musí
// promítnout do všech dnů posledního týdne — jinak by ho zobrazení, které čte
// celý týden, hned vrátilo zpátky jako odškrtnuté.
function ulozOdskrtnuti(klicPrefix: string, dateStr: string, id: string, hodnota: boolean) {
  const dny = hodnota ? [dateStr] : dnyPoslednihoTydne(dateStr);
  for (const den of dny) {
    try {
      const klic = klicPrefix + den;
      const raw = localStorage.getItem(klic);
      if (!raw && !hodnota) continue;
      const mapa = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      if (hodnota) mapa[id] = true;
      else delete mapa[id];
      localStorage.setItem(klic, JSON.stringify(mapa));
    } catch {}
  }
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
  const dnes = businessDateISO();
  const [open, setOpen] = useState(() => shouldShow(monthKey));
  const [done, setDone] = useState(false);
  // Checklist rozbalený rovnou v upozornění (tlačítko „Začít").
  const [checklist, setChecklist] = useState(false);
  const [odskrtnuto, setOdskrtnuto] = useState<Record<string, boolean>>(() => nactiOdskrtnuta(dnes));

  if (!open) return null;

  const vsechnyPolozky = [...MESICNI_LAHVE, ...MESICNI_KEG];
  const hotovoKusu = vsechnyPolozky.filter((it) => odskrtnuto[it.id]).length;
  const vseHotovo = hotovoKusu === vsechnyPolozky.length;

  const prepni = (id: string, keg: boolean) => {
    setOdskrtnuto((prev) => {
      const dalsi = { ...prev, [id]: !prev[id] };
      ulozOdskrtnuti(keg ? 'keg_checklist_' : 'bottling_checklist_', dnes, id, dalsi[id]);
      return dalsi;
    });
  };

  // Dokončení odškrtaného checklistu — zapíše do obou sanitárních deníků jen
  // to, co je opravdu odškrtnuté, a umlčí upozornění do dalšího měsíce.
  const dokoncitChecklist = () => {
    const performedBy = profile?.display_name || '';
    const lahve = MESICNI_LAHVE.filter((it) => odskrtnuto[it.id]).map((it) => ({ id: it.id, text: it.text }));
    const kegMapa: Record<string, boolean> = {};
    MESICNI_KEG.forEach((it) => { if (odskrtnuto[it.id]) kegMapa[it.id] = true; });
    if (lahve.length > 0) {
      void autoLogBottleSanitationFromChecklist({ dateStr: dnes, checkedItems: lahve, performedBy });
    }
    if (Object.keys(kegMapa).length > 0) {
      void autoLogKegSanitationFromChecklist({ dateStr: dnes, checkedMap: kegMapa, performedBy, phase: 'monthly' });
    }
    // Obě linky jsou tím pádem za tenhle měsíc hotové — ani stáčení lahví,
    // ani KEG už nebude po „1. Začátek stáčení" otevírat měsíční checklist.
    markMonthlyLineDone('bottle', monthKey);
    markMonthlyLineDone('keg', monthKey);
    writeMonthlyCleanupStage(monthKey, 'done');
    setDone(true);
    setTimeout(() => setOpen(false), 1600);
  };

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
    markMonthlyLineDone('bottle', monthKey);
    markMonthlyLineDone('keg', monthKey);
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
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white shrink-0 shadow-lg bg-emerald-700">
              <PartyPopper size={30} />
            </div>
            <h2 className="text-xl font-display font-black text-neutral-950">Zapsáno do sanitárních deníků</h2>
            <p className="text-sm text-neutral-600">Měsíční údržba je označená jako hotová pro lahve i KEGy.</p>
          </div>
        ) : checklist ? (
          /* Checklist rovnou tady — „Začít" nikam neodnaviguje. Odškrtává se
             do stejných uložených checklistů, jaké má stáčení lahví a KEG,
             takže odškrtnuté položky tam pak sedí a nedělá se práce dvakrát. */
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 pt-2">
              <h2 className="text-lg sm:text-xl font-display font-black text-neutral-950 leading-tight">
                Měsíční údržba — odškrtej, co je hotové
              </h2>
              <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-black ${vseHotovo ? 'bg-emerald-700 text-white' : 'bg-neutral-200 text-neutral-600'}`}>
                {hotovoKusu}/{vsechnyPolozky.length}
              </span>
            </div>

            <div className="max-h-[55vh] overflow-y-auto scrollbar-thin space-y-4 pr-1">
              {([
                ['Stáčení lahví', MESICNI_LAHVE, false],
                ['Stáčení KEGů', MESICNI_KEG, true],
              ] as const).map(([nadpis, polozky, jeKeg]) => (
                <div key={nadpis} className="space-y-2">
                  <div className="text-xs font-black uppercase tracking-widest text-neutral-500">{nadpis}</div>
                  {polozky.map((it) => {
                    const zaskrtnuto = !!odskrtnuto[it.id];
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => prepni(it.id, jeKeg)}
                        className={`w-full text-left p-3 rounded border-2 flex items-start gap-3 transition ${
                          zaskrtnuto ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <span className={`w-6 h-6 shrink-0 rounded grid place-items-center border-2 ${
                          zaskrtnuto ? 'bg-emerald-700 border-emerald-700 text-white' : 'border-neutral-300 text-transparent'
                        }`}>
                          <Check size={16} />
                        </span>
                        <span className={`text-xs leading-relaxed ${zaskrtnuto ? 'text-emerald-900 font-bold' : 'text-neutral-800'}`}>
                          {it.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="pt-2 space-y-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={dokoncitChecklist}
                disabled={!vseHotovo}
                className="w-full py-3.5 px-6 rounded bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-base transition flex items-center justify-center gap-3"
              >
                <PartyPopper size={20} />
                <span>{vseHotovo ? 'Hotovo — zapsat do deníků' : `Zbývá ${vsechnyPolozky.length - hotovoKusu} položek`}</span>
              </button>
              <button
                type="button"
                onClick={() => setChecklist(false)}
                className="w-full py-2.5 px-6 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-sm transition"
              >
                Zpátky (odškrtnuté se uloží)
              </button>
            </div>
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
            onClick={() => setChecklist(true)}
            className="w-full py-3.5 px-6 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-black text-base transition shadow-xl active:scale-[0.98] flex items-center justify-center gap-3 ring-4 ring-emerald-300"
          >
            <Play size={20} />
            <span>Začít{hotovoKusu > 0 ? ` (${hotovoKusu}/${vsechnyPolozky.length} hotovo)` : ''}</span>
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="w-full py-3 px-6 rounded bg-rose-600 hover:bg-rose-700 text-white font-black text-sm transition active:scale-[0.98] flex items-center justify-center gap-3"
          >
            <CalendarClock size={20} />
            <span>Udělám na konci týdne</span>
          </button>
          <button
            type="button"
            onClick={markAlreadyDone}
            className="w-full py-3 px-6 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm transition flex items-center justify-center gap-2"
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
