// Domovská obrazovka appky — dlaždicový launcher, výchozí stránka po přihlášení.
// Karty (ne ostrá mřížka), 2 sloupce pro pohodlné ovládání palcem, barevně
// odlišené podle typu modulu, s vodorovným filtrem kategorií a KPI dashboardem
// nahoře. Vychází z návrhu, který si uživatel připravil přes Gemini.
import { useEffect, useState } from 'react';
import { NAV, type Page } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { canUserView, getUserPermissions, ModuleKey } from '../lib/permissions';
import { isAdminEmail } from '../lib/config';
import { supabase } from '../lib/supabase';

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
// jantarová, sklad & sklep = modrá, objednávky = zelená s odznakem, odpis =
// růžová/červená. Ostatní (nástroje, číselníky, nastavení) zůstávají neutrální
// břidlicové — nejsou to "provozní" moduly, nepotřebují upoutávat pozornost.
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
const COLOR_CLASSES: Record<ColorKey, { box: string; icon: string; badge: string }> = {
  amber: { box: 'bg-amber-50', icon: 'text-amber-600', badge: 'bg-amber-500' },
  blue: { box: 'bg-blue-50', icon: 'text-blue-600', badge: 'bg-blue-500' },
  emerald: { box: 'bg-emerald-50', icon: 'text-emerald-600', badge: 'bg-emerald-500' },
  rose: { box: 'bg-rose-50', icon: 'text-rose-600', badge: 'bg-rose-500' },
  slate: { box: 'bg-slate-100', icon: 'text-slate-600', badge: 'bg-slate-500' },
};

const FILTERS = ['Vše', 'Výroba', 'Pivovar', 'Nástroje', 'Číselníky', 'Nastavení'] as const;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function HomeScreen({ setPage }: { setPage: (p: Page) => void }) {
  const { profile, user } = useAuth();
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);
  const userPerms = getUserPermissions(user?.id ?? '', (profile as any)?.permissions);

  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('Vše');
  const [kpi, setKpi] = useState({ todayOrders: 0, openOrders: 0, bottledToday: 0 });
  const [ordersOpenCount, setOrdersOpenCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = todayISO();
      const [todayOrdersRes, openOrdersRes, kegRes, botRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('delivery_date', today).neq('status', 'storno'),
        supabase.from('orders').select('id', { count: 'exact', head: true }).neq('status', 'storno').eq('is_delivered', false),
        supabase.from('kegging').select('id', { count: 'exact', head: true }).eq('entry_date', today),
        supabase.from('bottling').select('id', { count: 'exact', head: true }).eq('entry_date', today),
      ]);
      if (cancelled) return;
      const open = openOrdersRes.count ?? 0;
      setKpi({
        todayOrders: todayOrdersRes.count ?? 0,
        openOrders: open,
        bottledToday: (kegRes.count ?? 0) + (botRes.count ?? 0),
      });
      setOrdersOpenCount(open);
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = NAV.filter((n) => {
    if (n.id === 'users') return isAdmin;
    if (n.id === 'bottling_needs') return isAdmin;
    const modKey = PAGE_TO_MODULE[n.id];
    if (!modKey) return true;
    return canUserView(profile?.role, user?.id, modKey, userPerms);
  });

  const shown = filter === 'Vše' ? visible : visible.filter((n) => n.group === filter);

  return (
    <div className="space-y-4 pb-4">
      {/* KPI dashboard */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
          <div className="text-2xl font-black text-neutral-900 tabular-nums">{kpi.todayOrders}</div>
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mt-0.5">Dovoz dnes</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
          <div className="text-2xl font-black text-emerald-600 tabular-nums">{kpi.openOrders}</div>
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mt-0.5">Nevyřízené obj.</div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-3 text-center">
          <div className="text-2xl font-black text-amber-600 tabular-nums">{kpi.bottledToday}</div>
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide mt-0.5">Stočeno dnes</div>
        </div>
      </div>

      {/* Vodorovný filtr kategorií */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-3.5 px-3.5 sm:mx-0 sm:px-0">
        {FILTERS.map((f) => {
          const count = f === 'Vše' ? visible.length : visible.filter((n) => n.group === f).length;
          if (count === 0) return null;
          const active = filter === f;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-black transition ${
                active ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Dlaždice modulů — 2 sloupce, barevně odlišené */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {shown.map((item) => {
          const Icon = item.icon;
          const color = ITEM_COLOR[item.id] ?? 'slate';
          const c = COLOR_CLASSES[color];
          const badgeCount = item.id === 'orders' ? ordersOpenCount : 0;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className="relative bg-white rounded-2xl shadow-sm p-4 flex flex-col items-start gap-2.5 text-left active:scale-95 transition-transform"
            >
              {badgeCount > 0 && (
                <span className={`absolute top-3 right-3 min-w-[20px] h-5 px-1.5 rounded-full ${c.badge} text-white text-[10px] font-black flex items-center justify-center`}>
                  {badgeCount > 99 ? '99+' : badgeCount}
                </span>
              )}
              <div className={`w-11 h-11 rounded-xl ${c.box} flex items-center justify-center`}>
                <Icon size={22} strokeWidth={1.8} className={c.icon} />
              </div>
              <span className="text-xs font-bold text-neutral-900 leading-tight">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
