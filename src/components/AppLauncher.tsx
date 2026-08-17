// Dlaždicový launcher — domovská obrazovka appky. Vstup do všech sekcí jedním
// klepnutím, podobně jako plocha telefonu s Android. Mřížka je navržená tak,
// aby se všechny dlaždice vešly na obrazovku telefonu najednou, bez scrollování.
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

export function AppLauncher({ setPage }: { setPage: (p: Page) => void }) {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);
  const userPerms = getUserPermissions(user?.id ?? '', (profile as any)?.permissions);

  // Pořadí zachováno podle NAV (přirozeně seskupené podle Výroba/Pivovar/…),
  // ale bez textových nadpisů skupin — ty by na telefonu zabraly řádky navíc
  // a cílem je vejít se celé na jednu obrazovku najednou.
  const visible = NAV.filter((n) => {
    if (n.id === 'users') return isAdmin;
    if (n.id === 'bottling_needs') return isAdmin;
    const modKey = PAGE_TO_MODULE[n.id];
    if (!modKey) return true;
    return canUserView(profile?.role, user?.id, modKey, userPerms);
  });

  return (
    <div
      className="h-full grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 auto-rows-fr gap-px bg-neutral-200 border border-neutral-200"
    >
      {visible.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className="flex flex-col items-center justify-center gap-1.5 p-1.5 bg-white hover:bg-neutral-50 active:bg-neutral-100 transition-colors min-h-[64px]"
          >
            <Icon size={22} strokeWidth={1.7} className="text-neutral-800 shrink-0" />
            <span className="text-[10px] font-bold text-neutral-800 text-center leading-tight">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
