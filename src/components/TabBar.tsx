// Sjednocený vzhled záložkové navigace napříč appkou (Objednávky, Kalendář,
// Odběratelé, Akce, Sanitační deníky, Auta, Stopky/Časovač…) — bílé/světlé
// pozadí, žádné vyplněné barevné bloky, jen ikona a popisek aktivní záložky
// obarvené (stejný jazyk jako spodní mobilní lišta na Domů, viz Layout.tsx
// dockAccentColor). Dřív měla každá "Tabbed" obrazovka vlastní kopii téhle
// JSX se stejným ambrovým stylem — teď je to jedna komponenta.
//
// Dvě věci tu jsou kvůli telefonu (audit ovládání, docs/mobil-po-strankach.md):
//   • Záložky jsou 44 px vysoké. Dřív měly 26 px a byly to nejmenší cíle na
//     obrazovce, přitom se na ně sahá jako na první věc.
//   • Na 360 px se do řádku vejdou tři a zbytek je za okrajem. Odrolovat to
//     šlo i dřív, ale nebylo to nijak vidět — pásek vypadal jako celý obsah.
//     Teď se na kraji ukáže „ustřižení" a aktivní záložka se sama nastaví
//     do zorného pole (třeba po návratu na obrazovku s pátou záložkou).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { okrajePasku, type OkrajePasku } from '../lib/paskyZalozek';

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
  const paskaRef = useRef<HTMLDivElement>(null);
  const aktivniRef = useRef<HTMLButtonElement>(null);
  const [okraje, setOkraje] = useState<OkrajePasku>({ vlevo: false, vpravo: false });

  function prepocitej() {
    const el = paskaRef.current;
    if (!el) return;
    setOkraje(okrajePasku(el.scrollLeft, el.scrollWidth, el.clientWidth));
  }

  useLayoutEffect(() => {
    prepocitej();
    const el = paskaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => prepocitej());
    ro.observe(el);
    return () => ro.disconnect();
    // Počet záložek se mění (badge, skryté záložky) — přepočítat i pak.
  }, [items.length]);

  // Aktivní záložka musí být vidět. `nearest` schválně: `center` by při
  // každém přepnutí posunul celý pásek, i když už záložka na obrazovce je.
  useEffect(() => {
    aktivniRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    prepocitej();
  }, [activeId]);

  return (
    <div className="relative">
      <div
        ref={paskaRef}
        onScroll={prepocitej}
        className="hs-glass-chrome sticky z-20 rounded pt-0.5 px-1 flex items-center gap-0.5 border pb-1.5 overflow-x-auto scrollbar-thin"
        style={{ top: stickyOffset ?? 0 }}
      >
        {items.map((item) => {
          const active = item.id === activeId;
          const color = item.color ?? '#57534e';
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              ref={active ? aktivniRef : undefined}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`relative px-3 py-2 min-h-[44px] rounded text-xs font-black transition flex items-center gap-1.5 shrink-0 ${
                active ? 'bg-white shadow-sm' : 'text-neutral-700 hover:bg-white/70 hover:text-neutral-900'
              }`}
              style={active ? { color } : undefined}
            >
              <Icon size={15} strokeWidth={active ? 2.4 : 2} />
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span
                  className="text-[11px] font-black rounded-full px-1 leading-tight"
                  style={{ background: active ? `${color}22` : 'rgba(120,113,108,0.14)', color: active ? color : '#78716c' }}
                >
                  {item.badge}
                </span>
              )}
              {active && (
                <span className="absolute left-2 right-2 bottom-0.5 h-[2px] rounded-full" style={{ background: color }} />
              )}
            </button>
          );
        })}
      </div>

      {/* „Ustřižení" na kraji — jediná věc, která na dotykovém displeji řekne,
          že za okrajem ještě něco je. Přechod nesmí brát klepnutí, jinak by
          zakryl krajní záložku. */}
      {okraje.vlevo && (
        <span aria-hidden className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 rounded-l bg-gradient-to-r from-white to-transparent" />
      )}
      {okraje.vpravo && (
        <span aria-hidden className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 rounded-r bg-gradient-to-l from-white to-transparent" />
      )}
    </div>
  );
}
