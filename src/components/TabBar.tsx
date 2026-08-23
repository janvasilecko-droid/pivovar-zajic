// Sjednocený vzhled záložkové navigace napříč appkou (Objednávky, Kalendář,
// Odběratelé, Akce, Sanitační deníky, Auta, Stopky/Časovač…) — bílé/světlé
// pozadí, žádné vyplněné barevné bloky, jen ikona a popisek aktivní záložky
// obarvené (stejný jazyk jako spodní mobilní lišta na Domů, viz Layout.tsx
// dockAccentColor). Dřív měla každá "Tabbed" obrazovka vlastní kopii téhle
// JSX se stejným ambrovým stylem — teď je to jedna komponenta.
import type { LucideIcon } from 'lucide-react';

export type TabBarItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Hex barva ikony+popisku aktivní záložky. Bez zadání = neutrální šedá. */
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
      className="hs-glass-chrome sticky z-20 rounded pt-1 px-1.5 flex items-center gap-1.5 border pb-2 overflow-x-auto scrollbar-thin"
      style={{ top: stickyOffset ?? 0 }}
    >
      {items.map((item) => {
        const active = item.id === activeId;
        const color = item.color ?? '#57534e';
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`relative px-3.5 py-2 rounded text-xs font-black transition flex items-center gap-1.5 shrink-0 ${
              active ? 'bg-white shadow-sm' : 'text-neutral-500 hover:bg-white/70 hover:text-neutral-700'
            }`}
            style={active ? { color } : undefined}
          >
            <Icon size={16} strokeWidth={active ? 2.4 : 2} />
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className="ml-0.5 text-[10px] font-black rounded-full px-1.5 py-0.5"
                style={{ background: active ? `${color}22` : 'rgba(120,113,108,0.14)', color: active ? color : '#78716c' }}
              >
                {item.badge}
              </span>
            )}
            {active && (
              <span className="absolute left-3 right-3 -bottom-[9px] h-[3px] rounded-full" style={{ background: color }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
