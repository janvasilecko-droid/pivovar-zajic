import { synchronizuj, ulozStav } from '../lib/checklistData';
import { useState, useEffect } from 'react';
import { Modal } from './ui';
import { Check, CheckSquare, Lock, RotateCcw, ShieldCheck, Square, Unlock } from 'lucide-react';
import { zavibruj } from '../lib/haptika';

type ChecklistItem = {
  id: string;
  category: string;
  text: string;
  required?: boolean;
  // Položka, kterou stačí splnit JEDNOU TÝDNĚ: jakmile je odškrtnutá v kterýkoli
  // „Stáčecí den\" aktuálního ISO týdne, v dalších dnech týdne se v checklistu
  // „1. Začátek stáčení\" už nezobrazuje a neblokuje vstup do zápisu stáčení.
  weekly?: boolean;
};

// Fáze checklistu: 'start' = jen příprava pracoviště před stáčením (sekce
// „1. Začátek stáčení"), 'end' = zbytek checklistu vyplňovaný až po ukončení
// stáčení („2. Konec stáčení", „3. Týdenní kontrola", „4. Měsíční údržba"),
// 'monthly' = jen sekce „4. Měsíční údržba" (okno s měsíčním checklistem,
// které se v posledním týdnu měsíce otevře po splnění začátku stáčení).
export type ChecklistPhase = 'start' | 'end' | 'monthly';

export const DEFAULT_ITEMS: ChecklistItem[] = [
  // 1. Začátek stáčení
  { id: 'start_1', category: '1. Začátek stáčení', text: 'Zkontrolovat veškeré vnější plochy u stáčeček', required: true },
  { id: 'start_2', category: '1. Začátek stáčení', text: 'Zkontrolovat vnitřky stáčeček a vyčistit kartáčem vnitřní a vnější plochy všech stáčeček (na kterých se bude stáčet) studeným louhem o koncentraci 2% a důkladně opláchnout čistou vodou', required: true, weekly: true },
  { id: 'start_3', category: '1. Začátek stáčení', text: 'Zkontrolovat vnější i vnitřní povrch naražečů', required: true },
  { id: 'start_4', category: '1. Začátek stáčení', text: 'Pivní vedení propláchnout čistou vodou', required: true },
  { id: 'start_5', category: '1. Začátek stáčení', text: 'Pivní vedení propláchnout 1% louhem, nechat působit 20 min (příprava sudů, lahví, víček, zátkovaček...)', required: true },
  { id: 'start_7', category: '1. Začátek stáčení', text: 'Zkontrolovat všechny plochy stolů a odkladových ploch', required: true },
  { id: 'start_9', category: '1. Začátek stáčení', text: 'Zkontrolovat všechny nádoby (na oplach, na víčka, na odkládání nástavců na sklo)', required: true },
  { id: 'start_11', category: '1. Začátek stáčení', text: 'Zkontrolovat vnitřek zátkovačky na PET lahve', required: true },
  { id: 'start_12', category: '1. Začátek stáčení', text: 'Zkontrolovat zátkovačku na korunky', required: true },
  { id: 'start_13', category: '1. Začátek stáčení', text: 'Propláchnout pivní vedení čistou vodou (po 1% louhu)', required: true },

  // 2. Konec stáčení
  { id: 'end_1', category: '2. Konec stáčení', text: 'Vylít pivo a pěnu z nádoby na zbytky piva', required: true },
  { id: 'end_2', category: '2. Konec stáčení', text: 'Důkladný proplach pivních cest čistou vodou', required: true },
  { id: 'end_3', category: '2. Konec stáčení', text: 'Sundat nástavce na lahve a opláchnout povrch stáčeček a pivního vedení ZE VŠECH STRAN!!! (včetně rychlospojek, hadic, naražečů,........)', required: true },
  { id: 'end_4', category: '2. Konec stáčení', text: 'Odšroubovat červený ventil na regulaci odtoku zbytků piva, zkontrolovat (případně vyčistit) a opláchnout čistou vodou včetně vnitřního a vnějšího závitu', required: true },
  { id: 'end_5', category: '2. Konec stáčení', text: 'Nasadit nástavce na lahve, nasadit lahve, povolit kohout na rychlost odtlakování, naplnit lahve vodou a nechat vodu protékat skrz lahve cestou na odtok zbytků piva a pěny, poté vodu z lahví vylít', required: true },
  { id: 'end_6', category: '2. Konec stáčení', text: 'Sundat vrchní kryt stáčečky a zkontrolovat, zda je vnitřek z obou stran čistý, bez povlaku, zbytků od piva, pěny, plísní (pokud ne, vyčistit louhem a kartáčem) a vnitřky vypláchnout čistou vodou', required: true },
  { id: 'end_7', category: '2. Konec stáčení', text: 'Zkontrolovat vnější a vnitřní povrch všech naražečů', required: true },
  { id: 'end_8', category: '2. Konec stáčení', text: 'Na stáčečkách nastavit program na CO2, ať „vyprská“ voda ze vzduchového vedení (pokud se tam během oplachu dostala), nasadit PET lahve a natlakovat', required: true },
  { id: 'end_9', category: '2. Konec stáčení', text: 'Opláchnout čistou vodou povrch stáčeček (stáčečky ze všech stran, hlavně všechny škvíry, kam se potenciálně mohlo dostat pivo)', required: true },
  { id: 'end_10', category: '2. Konec stáčení', text: 'Oplach naražečů, povrch hadic a rychlospojek', required: true },
  { id: 'end_11', category: '2. Konec stáčení', text: 'Opláchnout nástavec naražeče na oplach vodou pivní cesty ze všech stran, včetně uchycení ke konzoli, mezer na šrouby atd.....', required: true },
  { id: 'end_12', category: '2. Konec stáčení', text: 'Oplach konzole ze všech stran', required: false },
  { id: 'end_13', category: '2. Konec stáčení', text: 'Oplach CELÉHO povrchu stěny (včetně spár)', required: false },
  { id: 'end_14', category: '2. Konec stáčení', text: 'Oplach povrchu stolů (důkladně oplachovat zespodu)', required: true },
  { id: 'end_15', category: '2. Konec stáčení', text: 'Oplach celého povrchu odkládací plochy na automatické stáčečce skleněných lahví', required: true },
  { id: 'end_16', category: '2. Konec stáčení', text: 'Čistou vodou opláchnout nádobu na zbytky (otočit a nechat odkapat)', required: true },
  { id: 'end_17', category: '2. Konec stáčení', text: 'Oplach podlah (pozor hlavně na nohy od stáčecí linky, palety a veškerá místa, která se blbě oplachují a může zde pivo zůstávat a plesnivět), u bomb, atd....', required: true },
  { id: 'end_18', category: '2. Konec stáčení', text: 'Oplach zátkovačky na korunky (v případě, že se stáčelo sklo)', required: false },
  { id: 'end_19', category: '2. Konec stáčení', text: 'Naražeč nasadit na nástavec na oplach', required: true },
  { id: 'end_20', category: '2. Konec stáčení', text: 'Otřít zátkovačku vlhkým hadrem (odpojenou od el. sítě) a umístit ji do sucha', required: true },
  { id: 'end_21', category: '2. Konec stáčení', text: 'Vyndat hlavu zátkovačky na PET lahve, opláchnout ji pod tekoucí vodou (případně ji vyčistit pomocí louhu a kartáče) a nechat odkapat', required: true },
  { id: 'end_22', category: '2. Konec stáčení', text: 'Stáhnout stěrkou veškerou vodu ze stolů a podlah', required: true },
  { id: 'end_23', category: '2. Konec stáčení', text: 'Nevyužitá víčka opláchnout čistou vodou a nechat odkapat', required: false },
  { id: 'end_24', category: '2. Konec stáčení', text: 'Opláchnout a vyčistit všechny nádoby, misky, mřížky na odkapávání, případně všechny ostatní věci, které byly během stáčení použity a nechat odkapat (hlavně kraje nádob)', required: true },

  // 3. Týdenní kontrola
  { id: 'week_1', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat stoly, povrch automatické stáčecí linky na sklo a vnitřek/povrch u stáčeček', required: false },
  { id: 'week_2', category: '3. Týdenní kontrola (1x týdně)', text: 'Stáčečky otevřít a zkontrolovat vnitřek vizuálně i čichem (při zápachu rozebrat, 1% louh na 24h)', required: false },
  { id: 'week_3', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat povrch červeného ventilu na rychlost odtlakování vč. vnitřního závitu', required: false },
  { id: 'week_4', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat, zda je dobře opláchnutá zeď a netvoří se ve spárách plíseň', required: false },
  { id: 'week_5', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat konzoli a nástavec na oplach vodou pro naražeč', required: false },
  { id: 'week_6', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat vnější a vnitřní povrchy naražečů', required: false },
  { id: 'week_7', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat, zda jsou čisté hadice a rychlospojky', required: false },
  { id: 'week_8', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat veškeré nádoby, zátkovačky, nástavce', required: false },

  // 4. Měsíční údržba (1x měsíčně — první nebo poslední týden v měsíci)
  { id: 'month_1', category: '4. Měsíční údržba (1x měsíčně)', text: 'Odšroubovat stáčečky od odvodní trubky (č. 17 na obrázku), odpojit od nápojové a CO2 cesty a rozebrat na jednotlivé díly dle návodu, vše nechat několik hodin (minimálně 1 hodinu) v 1% louhu', required: true },
  { id: 'month_2', category: '4. Měsíční údržba (1x měsíčně)', text: 'Rozebrat naražeče včetně rychlospojek a nechat minimálně hodinu v 1% louhu', required: true },
  { id: 'month_3', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit podlahy (kolem stáčecí linky, za kanálem, u sodovky, všude kam se odkládají plné i prázdné lahve)', required: true },
  { id: 'month_4', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit veškerý povrch stěn', required: true },
  { id: 'month_5', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit veškerý povrch konzole', required: true },
  { id: 'month_6', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit veškerý povrch hadic, rychlospojek', required: true },
  { id: 'month_7', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit stoly ze všech stran (ideálně je otočit)', required: true },
  { id: 'month_8', category: '4. Měsíční údržba (1x měsíčně)', text: 'Mechanicky vyčistit všechny díly stáčeček a naražečů', required: true },
  { id: 'month_9', category: '4. Měsíční údržba (1x měsíčně)', text: 'Důkladně zkontrolovat a opláchnout čistou vodou všechny díly stáčeček a naražečů', required: true },
  { id: 'month_10', category: '4. Měsíční údržba (1x měsíčně)', text: 'Do sudu připravit 1% louh, natlakovat VZDUCHEM!!! Do stáčeček dát nástavce na lahve se sanitačními lahvemi, nechat otevřený červený ventil na odfuk a projet louhem nápojové cesty včetně odtokové na zbytky piva (nevyčerpat všechen louh ze sudu, aby ho tlak vzduchu nevyfoukal) a nechat alespoň 24 hodin', required: true },
  { id: 'month_11', category: '4. Měsíční údržba (1x měsíčně)', text: 'Přehodit hadice na naražeči (odpojit vzduchovou hadici od hodin, aby se do nich nedostal louh!!!) a projet cestu louhem, poté nastavit na stáčečkách program na CO2 a projet i cesty ke stáčečkám včetně odfuku (stále nechat otevřený červený ventil na odfuk), opět platí nevyčerpat všechen louh ze sudu, aby ho tlak vzduchu nevyfoukal', required: true },
];

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
export const MONTHLY_CATEGORY_PREFIX = '4.';
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
  const dateKey = dateStr || new Date().toISOString().slice(0, 10);
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
  const zapis = (next: Record<string, boolean>) => {
    void ulozStav('lahve', dateKey, next);
    return next;
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
                    localStorage.setItem(storageKey, JSON.stringify(next));
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
                localStorage.setItem(storageKey, JSON.stringify(next));
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
