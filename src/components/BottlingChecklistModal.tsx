import { useState, useEffect } from 'react';
import { Modal } from './ui';
import { CheckSquare, Square, RotateCcw, Check, ShieldCheck } from 'lucide-react';

type ChecklistItem = {
  id: string;
  category: string;
  text: string;
  required?: boolean;
};

const DEFAULT_ITEMS: ChecklistItem[] = [
  // 1. Začátek stáčení
  { id: 'start_1', category: '1. Začátek stáčení', text: 'Zkontrolovat veškeré vnější plochy u stáčeček', required: true },
  { id: 'start_2', category: '1. Začátek stáčení', text: 'Zkontrolovat a vyčistit kartáčem vnitřní a vnější plochy všech stáčeček (1% studeným louhem a opláchnout čistou vodou)', required: true },
  { id: 'start_3', category: '1. Začátek stáčení', text: 'Zkontrolovat vnější i vnitřní povrch naražečů', required: true },
  { id: 'start_4', category: '1. Začátek stáčení', text: 'Pivní vedení propláchnout čistou vodou', required: true },
  { id: 'start_5', category: '1. Začátek stáčení', text: 'Pivní vedení propláchnout Persterilem (0,25 %), nechat působit 10 min (příprava sudů, lahví, víček, zátkovaček...)', required: true },
  { id: 'start_6', category: '1. Začátek stáčení', text: 'Zkontrolovat povrch podlah, u bomby, pod stoly, u tanku', required: true },
  { id: 'start_7', category: '1. Začátek stáčení', text: 'Zkontrolovat všechny plochy stolů a odkladových ploch', required: true },
  { id: 'start_8', category: '1. Začátek stáčení', text: 'Zkontrolovat stěnu', required: false },
  { id: 'start_9', category: '1. Začátek stáčení', text: 'Zkontrolovat všechny nádoby (na oplach, na víčka, na odkládání nástavců na sklo)', required: true },
  { id: 'start_10', category: '1. Začátek stáčení', text: 'Zkontrolovat konzoli ze všech stran', required: false },
  { id: 'start_11', category: '1. Začátek stáčení', text: 'Zkontrolovat vnitřek zátkovačky na PET lahve', required: true },
  { id: 'start_12', category: '1. Začátek stáčení', text: 'Zkontrolovat zátkovačku na korunky', required: true },
  { id: 'start_13', category: '1. Začátek stáčení', text: 'Propláchnout pivní vedení čistou vodou (po Persterilu)', required: true },

  // 2. Konec stáčení
  { id: 'end_1', category: '2. Konec stáčení', text: 'Vylít pivo a pěnu z nádoby na zbytky piva', required: true },
  { id: 'end_2', category: '2. Konec stáčení', text: 'Důkladný proplach pivních cest čistou vodou', required: true },
  { id: 'end_3', category: '2. Konec stáčení', text: 'Sundat nástavce na lahve a opláchnout povrch stáčeček a pivního vedení ZE VŠECH STRAN! (rychlospojky, hadice, naražeče)', required: true },
  { id: 'end_4', category: '2. Konec stáčení', text: 'Odšroubovat červený ventil na regulaci odtoku zbytků piva, zkontrolovat/vyčistit a opláchnout čistou vodou vč. závitů', required: true },
  { id: 'end_5', category: '2. Konec stáčení', text: 'Nasadit nástavce a lahve, povolit odtlakování, nechat protéct vodu skrz lahve na odtok zbytků piva, vylít', required: true },
  { id: 'end_6', category: '2. Konec stáčení', text: 'Sundat vrchní kryt stáčečky a zkontrolovat čistotu vnitřku z obou stran (bez povlaku, pěny, plísní, případně louh a kartáč)', required: true },
  { id: 'end_7', category: '2. Konec stáčení', text: 'Zkontrolovat vnější a vnitřní povrch všech naražečů', required: true },
  { id: 'end_8', category: '2. Konec stáčení', text: 'Na stáčečkách nastavit program na CO2, vyprskat vodu ze vzduchového vedení, nasadit PET a natlakovat', required: true },
  { id: 'end_9', category: '2. Konec stáčení', text: 'Opláchnout čistou vodou povrch stáčeček ze všech stran (hlavně všechny škvíry)', required: true },
  { id: 'end_10', category: '2. Konec stáčení', text: 'Oplach naražečů, povrchu hadic a rychlospojek', required: true },
  { id: 'end_11', category: '2. Konec stáčení', text: 'Opláchnout nástavec naražeče na oplach vodou pivní cesty ze všech stran vč. uchycení ke konzoli', required: true },
  { id: 'end_12', category: '2. Konec stáčení', text: 'Oplach konzole ze všech stran', required: false },
  { id: 'end_13', category: '2. Konec stáčení', text: 'Oplach CELÉHO povrchu stěny (včetně spár)', required: false },
  { id: 'end_14', category: '2. Konec stáčení', text: 'Oplach povrchu stolů (důkladně zespodu)', required: true },
  { id: 'end_15', category: '2. Konec stáčení', text: 'Oplach celého povrchu odkládací plochy na automatické stáčečce skleněných lahví', required: true },
  { id: 'end_16', category: '2. Konec stáčení', text: 'Čistou vodou opláchnout nádobu na zbytky (otočit a nechat odkapat)', required: true },
  { id: 'end_17', category: '2. Konec stáčení', text: 'Oplach podlah (nohy stáčecí linky, palety, u bomby, kolem kanálu)', required: true },
  { id: 'end_18', category: '2. Konec stáčení', text: 'Oplach zátkovačky na korunky (při stáčení skla)', required: false },
  { id: 'end_19', category: '2. Konec stáčení', text: 'Naražeč nasadit na nástavec na oplach', required: true },
  { id: 'end_20', category: '2. Konec stáčení', text: 'Otřít zátkovačku vlhkým hadrem (odpojenou od el. sítě) a umístit do sucha', required: true },
  { id: 'end_21', category: '2. Konec stáčení', text: 'Vyndat hlavu zátkovačky na PET lahve, opláchnout pod tekoucí vodou a nechat odkapat', required: true },
  { id: 'end_22', category: '2. Konec stáčení', text: 'Stáhnout stěrkou veškerou vodu ze stolů a podlah', required: true },
  { id: 'end_23', category: '2. Konec stáčení', text: 'Nevyužitá víčka opláchnout čistou vodou a nechat odkapat', required: false },
  { id: 'end_24', category: '2. Konec stáčení', text: 'Opláchnout a vyčistit všechny nádoby, misky, mřížky na odkapávání a nechat odkapat', required: true },
  { id: 'end_25', category: '2. Konec stáčení', text: 'Při vniknutí piva do vzduchové cesty OKAMŽITĚ vypláchnout čistou vodou (před naražením mít otevřenou bombu)', required: true },

  // 3. Týdenní kontrola
  { id: 'week_1', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat stoly, povrch automatické stáčecí linky na sklo a vnitřek/povrch u stáčeček', required: false },
  { id: 'week_2', category: '3. Týdenní kontrola (1x týdně)', text: 'Stáčečky otevřít a zkontrolovat vnitřek vizuálně i čichem (při zápachu rozebrat, 1% louh na 24h)', required: false },
  { id: 'week_3', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat povrch červeného ventilu na rychlost odtlakování vč. vnitřního závitu', required: false },
  { id: 'week_4', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat, zda je dobře opláchnutá zeď a netvoří se ve spárách plíseň', required: false },
  { id: 'week_5', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat konzoli a nástavec na oplach vodou pro naražeč', required: false },
  { id: 'week_6', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat vnější a vnitřní povrchy naražečů', required: false },
  { id: 'week_7', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat, zda jsou čisté hadice a rychlospojky', required: false },
  { id: 'week_8', category: '3. Týdenní kontrola (1x týdně)', text: 'Zkontrolovat veškeré nádoby, zátkovačky, nástavce', required: false },

  // 4. Měsíční údržba
  { id: 'month_1', category: '4. Měsíční údržba (1x měsíčně)', text: 'Odšroubovat stáčečky od odvodní trubky, odpojit od nápojové/CO2 cesty, rozebrat a nechat min. 1h v 1% louhu', required: false },
  { id: 'month_2', category: '4. Měsíční údržba (1x měsíčně)', text: 'Rozebrat naražeče vč. rychlospojek a nechat min. 1 hodinu v 1% louhu', required: false },
  { id: 'month_3', category: '4. Měsíční údržba (1x měsíčně)', text: 'Důkladně vyčistit podlahy (kolem stáčecí linky, za kanálem, u sodovky, odkládací plochy)', required: false },
  { id: 'month_4', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit veškerý povrch stěn', required: false },
  { id: 'month_5', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit veškerý povrch konzole', required: false },
  { id: 'month_6', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit veškerý povrch hadic a rychlospojek', required: false },
  { id: 'month_7', category: '4. Měsíční údržba (1x měsíčně)', text: 'Vyčistit stoly ze všech stran (otočit)', required: false },
  { id: 'month_8', category: '4. Měsíční údržba (1x měsíčně)', text: 'Mechanicky kartáči vyčistit všechny rozebrané díly stáčeček a naražečů', required: false },
  { id: 'month_9', category: '4. Měsíční údržba (1x měsíčně)', text: 'Důkladně zkontrolovat a opláchnout čistou vodou všechny díly stáčeček a naražečů', required: false },
  { id: 'month_10', category: '4. Měsíční údržba (1x měsíčně)', text: 'Do sudu připravit 1% louh, natlakovat VZDUCHEM, projet louhem nápojové i vzduchové cesty a nechat 24 hodin', required: false },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  dateStr?: string;
  onApplyNote?: (noteText: string) => void;
};

export function BottlingChecklistModal({ isOpen, onClose, dateStr, onApplyNote }: Props) {
  const dateKey = dateStr || new Date().toISOString().slice(0, 10);
  const storageKey = 'bottling_checklist_' + dateKey;

  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState<string>('ALL');

  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setCheckedMap(JSON.parse(saved));
      } else {
        setCheckedMap({});
      }
    } catch {
      setCheckedMap({});
    }
  }, [isOpen, storageKey]);

  const toggleItem = (id: string) => {
    setCheckedMap((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });
  };

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    DEFAULT_ITEMS.forEach((it) => { next[it.id] = true; });
    setCheckedMap(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const resetAll = () => {
    setCheckedMap({});
    localStorage.removeItem(storageKey);
  };

  const totalCount = DEFAULT_ITEMS.length;
  const checkedCount = DEFAULT_ITEMS.filter((it) => checkedMap[it.id]).length;
  const percent = Math.round((checkedCount / totalCount) * 100);

  const categories = Array.from(new Set(DEFAULT_ITEMS.map((it) => it.category)));

  const handleFinish = () => {
    if (onApplyNote && checkedCount > 0) {
      onApplyNote('Checklist stáčení lahví (' + checkedCount + '/' + totalCount + ' splněno)');
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal open onClose={onClose} title="📋 Oficiální kontrolní seznam (Checklist) stáčení lahví" wide>
      <div className="space-y-4">
        {/* Header progress box */}
        <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-300 flex flex-col gap-2">
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
              className="btn-ghost !py-1 !px-2.5 text-xs font-bold text-amber-900 hover:bg-amber-100"
              onClick={selectAll}
            >
              ✓ Označit vše jako splněné
            </button>
            <button
              type="button"
              className="btn-ghost !py-1 !px-2.5 text-xs font-bold text-neutral-600 hover:bg-neutral-100"
              onClick={resetAll}
            >
              <RotateCcw size={12} className="inline mr-1" />
              Vyčistit checklist
            </button>
          </div>
        </div>

        {/* Category filter tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            className={'px-3 py-1.5 rounded-xl font-bold transition shrink-0 ' + (activeCategory === 'ALL' ? 'bg-amber-500 text-amber-950 shadow-xs' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200')}
            onClick={() => setActiveCategory('ALL')}
          >
            Vše ({DEFAULT_ITEMS.length})
          </button>
          {categories.map((cat) => {
            const count = DEFAULT_ITEMS.filter((i) => i.category === cat).length;
            const checked = DEFAULT_ITEMS.filter((i) => i.category === cat && checkedMap[i.id]).length;
            return (
              <button
                key={cat}
                type="button"
                className={'px-3 py-1.5 rounded-xl font-bold transition shrink-0 ' + (activeCategory === cat ? 'bg-amber-500 text-amber-950 shadow-xs' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200')}
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
              const catItems = DEFAULT_ITEMS.filter((it) => it.category === cat);
              const catChecked = catItems.filter((it) => checkedMap[it.id]).length;

              return (
                <div key={cat} className="bg-white border border-neutral-200 rounded-2xl p-3.5 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                    <h4 className="text-xs font-black text-neutral-900 uppercase tracking-wider">{cat}</h4>
                    <span className="text-[11px] font-bold text-neutral-500 font-mono">
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
                          className={'w-full text-left p-2.5 rounded-xl border transition flex items-start gap-3 select-none ' + (
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
                              <span className="ml-1.5 text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded">
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
        <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
          <button type="button" className="btn-ghost text-xs" onClick={onClose}>
            Zavřít
          </button>
          <button
            type="button"
            className="btn-primary py-2.5 px-5 text-xs font-black shadow-md flex items-center gap-2"
            onClick={handleFinish}
          >
            <Check size={14} />
            <span>Potvrdit a uložit checklist</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
