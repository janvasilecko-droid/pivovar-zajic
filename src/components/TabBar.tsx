// Sjednocený vzhled záložkové navigace napříč appkou (Objednávky, Kalendář,
// Odběratelé, Akce, Sanitační deníky, Auta, Stopky/Časovač…) — bílé/světlé
// pozadí, žádné vyplněné barevné bloky, jen ikona a popisek aktivní záložky
// obarvené (stejný jazyk jako spodní mobilní lišta na Domů, viz Layout.tsx
// dockAccentColor). Dřív měla každá "Tabbed" obrazovka vlastní kopii téhle
// JSX se stejným ambrovým stylem — teď je to jedna komponenta.
//
// 📏 VELIKOST DOTYKOVÉHO CÍLE. Tohle je nejčastěji tisknutá věc v aplikaci —
// přepíná se přes ni sedm obrazovek. Přesto měla `px-2 py-1`, popisek 11 px
// a ikonu 13 px, dohromady ~24 px na výšku. Zbytek appky drží 44 px:
// `.btn` to má ve třídě a `index.css` to na mobilu vynucuje i pro `input`
// a `select` — jenže na holé `<button>` žádné takové pravidlo nesahá, takže
// se tahle lišta z hlídání vypadla. Teď má `min-h-[44px]` na mobilu a
// `sm:min-h-[34px]` na počítači, kde se míří myší a místo je vzácnější.
import type { LucideIcon } from 'lucide-react';

export type TabBarItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  /**
   * Hex barva ikony+popisku aktivní záložky — každá sekce má svůj odstín,
   * stejně jako dlaždice na ploše. Bez zadání se vezme barva písma z motivu
   * (dřív tu byl natvrdo `#57534e`, který v tmavém režimu splýval s kartou).
   */
  color?: string;
  badge?: number | string;
};

export function TabBar({
  items, activeId, onSelect, stickyOffset,
}: {
  items: TabBarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** px odsazení od vrchu při "sticky" — pro záložky vnořené pod jinou lištu (viz Feedback.tsx pod PlanningTabbed). */
  stickyOffset?: number;
}) {
  return (
    <div
      className="hs-glass-chrome sticky z-20 rounded pt-0.5 px-1 flex items-center gap-0.5 border pb-1.5 overflow-x-auto scrollbar-thin"
      style={{ top: stickyOffset ?? 0 }}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-current={active ? 'page' : undefined}
            className={`relative px-2.5 py-2 min-h-[44px] sm:min-h-[34px] rounded text-xs sm:text-[11px] font-black transition flex items-center gap-1.5 shrink-0 ${
              active ? 'bg-white shadow-sm' : 'text-neutral-700 hover:bg-white/70 hover:text-neutral-900'
            }`}
            style={active && item.color ? { color: item.color } : undefined}
          >
            <Icon size={16} className="sm:w-[14px] sm:h-[14px]" strokeWidth={active ? 2.4 : 2} />
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={`text-[11px] font-black rounded-full px-1 leading-tight ${
                  active && item.color ? '' : 'bg-neutral-200 text-neutral-600'
                }`}
                style={active && item.color ? { background: `${item.color}22`, color: item.color } : undefined}
              >
                {item.badge}
              </span>
            )}
            {active && (
              <span
                className={`absolute left-2 right-2 -bottom-[7px] h-[2px] rounded-full ${item.color ? '' : 'bg-neutral-500'}`}
                style={item.color ? { background: item.color } : undefined}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
