// Domovská obrazovka appky — dlaždicový launcher, výchozí stránka po přihlášení.
// Jen dlaždice, žádná horní lišta ani KPI čísla — WhatsApp upozornění a
// hledání (lupa) už řeší horní hlavička appky (Layout.tsx), není potřeba je
// duplikovat tady.
import { NAV, type Page } from '../components/Layout';
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

// Barevné odlišení podle typu modulu (duotone ikony): výroba/stáčení = teplá
// jantarová, sklad & sklep = modrá, objednávky = zelená, odpis = růžová.
// Ostatní (nástroje, číselníky, nastavení) zůstávají neutrální břidlicové.
type ColorKey = 'amber' | 'blue' | 'emerald' | 'rose' | 'slate';
const ITEM_COLOR: Partial<Record<Page, ColorKey>> = {
  kegging: 'amber',
  bottling: 'amber',
  fasovani: 'amber',
  prodejna: 'amber',
  akce: 'amber',
  orders: 'emerald',
  writeoffs: 'rose',
  dashboard: 'blue',
  cellar: 'blue',
  sklo_promo: 'blue',
  inventory: 'blue',
  history: 'blue',
  bottling_needs: 'blue',
};
const COLOR_CLASSES: Record<ColorKey, { border: string; icon: string }> = {
  amber: { border: 'border-amber-300', icon: 'text-amber-600' },
  blue: { border: 'border-blue-300', icon: 'text-blue-600' },
  emerald: { border: 'border-emerald-300', icon: 'text-emerald-600' },
  rose: { border: 'border-rose-300', icon: 'text-rose-600' },
  slate: { border: 'border-slate-300', icon: 'text-slate-600' },
};

export default function HomeScreen({ setPage }: { setPage: (p: Page) => void }) {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);
  const userPerms = getUserPermissions(user?.id ?? '', (profile as any)?.permissions);

  const visible = NAV.filter((n) => {
    if (n.id === 'users') return isAdmin;
    if (n.id === 'bottling_needs') return isAdmin;
    const modKey = PAGE_TO_MODULE[n.id];
    if (!modKey) return true;
    return canUserView(profile?.role, user?.id, modKey, userPerms);
  });

  return (
    <div className="grid grid-cols-3 gap-3">
      {visible.map((item) => {
        const Icon = item.icon;
        const color = ITEM_COLOR[item.id] ?? 'slate';
        const c = COLOR_CLASSES[color];
        return (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`bg-white rounded-2xl shadow-sm p-3.5 flex flex-col items-center justify-center gap-2.5 text-center active:scale-95 transition-transform border-2 ${c.border}`}
          >
            <Icon size={24} strokeWidth={1.8} className={c.icon} />
            <span className="text-xs font-bold text-neutral-900 leading-tight">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
