// Domovská dlaždicová obrazovka (launcher) — rychlý vstup do všech sekcí appky
// jedním klepnutím. Zobrazuje se nahoře na Skladu (výchozí obrazovka appky),
// samotný Sklad pod tím zůstává beze změny.
//
// Prakticky na telefonu: ve výchozím stavu je panel sbalený (jen úzký pruh),
// aby při každém otevření appky nemusel uživatel scrollovat přes velkou mřížku
// dlaždic, než se dostane ke skutečnému obsahu Skladu. Po rozbalení jsou
// dlaždice v každé kategorii vodorovně rolovatelné (jeden řádek na kategorii),
// ne zalamovaná mřížka — méně místa na výšku, přirozené swipe gesto palcem.
// Sbalený/rozbalený stav se pamatuje (localStorage), aby appka respektovala,
// jak ji kdo chce používat.
import { useState } from 'react';
import { ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react';
import { NAV, type Page } from './Layout';
import { useAuth } from '../lib/auth';
import { canUserView, getUserPermissions, ModuleKey } from '../lib/permissions';
import { isAdminEmail } from '../lib/config';

// Mapování stránka → modul oprávnění — zrcadlí stejnou mapu v Layout.tsx (sidebar),
// aby dlaždice ukazovaly přesně to, co uživatel vidí i v menu. Layout.tsx tuto mapu
// nemá exportovanou, proto je tu zkopírovaná; při úpravě oprávnění v Layout.tsx
// je potřeba upravit i tuto kopii.
const PAGE_TO_MODULE: Record<string, ModuleKey> = {
  dashboard: 'dashboard',
  kegging: 'entry',
  bottling: 'entry',
  bottling_entry: 'entry',
  bottling_overview: 'entry',
  orders_entry: 'entry',
  fasovani: 'entry',
  prodejna: 'entry',
  writeoffs: 'entry',
  orders: 'orders',
  zavoz: 'zavoz',
  kniha_jizd: 'kniha_jizd',
  stock: 'stock',
  inventory: 'inventory',
  srotovani: 'srotovani',
  checklists: 'haccp',
  concentration: 'cellar',
  cellar: 'cellar',
  history: 'cellar',
  haccp: 'haccp',
  sanitation_log: 'haccp',
  places: 'catalogs',
  beers: 'catalogs',
  packages: 'catalogs',
  vehicles: 'catalogs',
  depozitar: 'catalogs',
  bottling_needs: 'catalogs',
  pricelist: 'pricelist',
  sklo_promo: 'sklo_promo',
  vycepy: 'vycepy',
  app_settings: 'app_settings',
  exkurze: 'exkurze',
  akce: 'akce',
  calendar: 'reminders',
  feedback: 'catalogs',
  reminders: 'reminders',
};

const GROUPS = ['Výroba', 'Pivovar', 'Nástroje', 'Číselníky', 'Nastavení'];

function storageKey(userId: string): string {
  return `launcher_expanded_${userId || 'guest'}`;
}

export function AppLauncher({ setPage }: { setPage: (p: Page) => void }) {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);
  const userPerms = getUserPermissions(user?.id ?? '', (profile as any)?.permissions);

  // Sbaleno je praktičtější výchozí stav — appka se otevírá na Skladu často
  // a dlaždice by se pletly do cesty. Kdo si je jednou rozbalí, appka si to
  // pamatuje (i naopak, kdo si to nechá otevřené).
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey(user?.id ?? 'guest')) === '1';
    } catch {
      return false;
    }
  });

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      try { localStorage.setItem(storageKey(user?.id ?? 'guest'), next ? '1' : '0'); } catch {}
      return next;
    });
  }

  const visible = NAV.filter((n) => {
    if (n.id === 'users') return isAdmin;
    if (n.id === 'bottling_needs') return isAdmin;
    const modKey = PAGE_TO_MODULE[n.id];
    if (!modKey) return true;
    return canUserView(profile?.role, user?.id, modKey, userPerms);
  });

  return (
    <div className="mb-4 border border-neutral-200 bg-white">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-2 px-3.5 min-h-[44px] py-2 hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-neutral-700">
          <LayoutGrid size={16} className="text-amber-600" />
          Rychlý přístup
        </span>
        {expanded ? <ChevronUp size={18} className="text-neutral-500" /> : <ChevronDown size={18} className="text-neutral-500" />}
      </button>

      {expanded && (
        <div className="border-t border-neutral-200 divide-y divide-neutral-200">
          {GROUPS.map((group) => {
            const items = visible.filter((n) => n.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="py-2.5">
                <div className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1.5 px-3.5">{group}</div>
                <div className="flex gap-px overflow-x-auto scrollbar-thin px-3.5 pb-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setPage(item.id)}
                        className="shrink-0 w-20 flex flex-col items-center justify-center gap-1.5 py-2.5 px-1 border border-neutral-200 bg-white hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                      >
                        <Icon size={22} strokeWidth={1.7} className="text-neutral-800" />
                        <span className="text-[10px] font-bold text-neutral-800 text-center leading-tight">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
