// Domovská obrazovka appky — dlaždicový launcher, výchozí stránka po přihlášení.
// Jen dlaždice, žádná horní lišta ani KPI čísla — WhatsApp upozornění a
// hledání (lupa) už řeší horní hlavička appky (Layout.tsx), není potřeba je
// duplikovat tady. Výjimka: upozornění na STK/dálniční známku vozidel —
// zobrazuje se jen komu je nastaveno (Uživatelé → "Dostává upozornění na
// vozidla") a musí ho jednou potvrdit, pak zmizí (dokud se stav nezmění).
import { useEffect, useState } from 'react';
import { NAV, type Page } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { canUserView, getUserPermissions, ModuleKey } from '../lib/permissions';
import { isAdminEmail } from '../lib/config';
import { supabase, Vehicle } from '../lib/supabase';
import { getVehicleExpiryStatus } from './Catalogs';

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

type VehicleAlert = { vehicleName: string; label: string; status: 'warning' | 'expired' };

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

  // Upozornění na STK / dálniční známku vozidel — jen komu je to nastaveno
  // v Uživatelích (nebo admin), a jen dokud to ten člověk jednou nepotvrdí.
  const canSeeVehicleAlerts = profile?.role === 'admin' || !!(profile as any)?.receive_vehicle_alerts;
  const [vehicleAlerts, setVehicleAlerts] = useState<VehicleAlert[]>([]);
  useEffect(() => {
    if (!canSeeVehicleAlerts) { setVehicleAlerts([]); return; }
    supabase.from('vehicles').select('*').then(({ data }) => {
      const rows = (data as Vehicle[]) ?? [];
      const alerts: VehicleAlert[] = [];
      rows.forEach((v) => {
        const stk = getVehicleExpiryStatus(v.stk_valid_until);
        if (stk.status === 'warning' || stk.status === 'expired') {
          alerts.push({ vehicleName: v.name, label: `STK: ${stk.label}`, status: stk.status });
        }
        const toll = getVehicleExpiryStatus(v.highway_toll_valid_until);
        if (toll.status === 'warning' || toll.status === 'expired') {
          alerts.push({ vehicleName: v.name, label: `Dálniční známka: ${toll.label}`, status: toll.status });
        }
      });
      setVehicleAlerts(alerts);
    });
  }, [canSeeVehicleAlerts]);

  // Podpis aktuální sady upozornění — když se změní (nové vozidlo, jiné datum),
  // dřívější potvrzení už neplatí a banner se objeví znovu.
  const alertsSignature = vehicleAlerts.map((a) => `${a.vehicleName}|${a.label}`).sort().join(';');
  const ackKey = `vehicle_alerts_ack_${user?.id || 'guest'}`;
  const [ackSignature, setAckSignature] = useState<string>(() => {
    try { return localStorage.getItem(ackKey) || ''; } catch { return ''; }
  });
  const showVehicleBanner = vehicleAlerts.length > 0 && alertsSignature !== ackSignature;
  function acknowledgeVehicleAlerts() {
    try { localStorage.setItem(ackKey, alertsSignature); } catch {}
    setAckSignature(alertsSignature);
  }

  return (
    <div className="space-y-4">
      {showVehicleBanner && (
        <div className="p-4 rounded-3xl bg-white border-2 border-amber-300 shadow-md space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white border-2 border-amber-300 text-amber-900 flex items-center justify-center text-xl font-black shrink-0">
              🚗
            </div>
            <div className="font-extrabold text-sm text-neutral-900">
              Upozornění vozového parku (STK / Dálniční známky)
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {vehicleAlerts.map((a, i) => (
              <span key={i} className={`text-xs font-bold px-3 py-1 rounded-xl ${a.status === 'expired' ? 'bg-rose-600 text-white font-black animate-pulse' : 'bg-amber-100 text-amber-950 border border-amber-300'}`}>
                <strong>{a.vehicleName}</strong> — {a.label}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <button
              onClick={() => setPage('vehicles')}
              className="px-3.5 py-2 rounded-xl bg-white border border-amber-300 text-amber-900 font-black text-xs hover:bg-amber-50 transition"
            >
              Přejít do evidence aut →
            </button>
            <button
              onClick={acknowledgeVehicleAlerts}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-sm transition"
            >
              ✅ Ano, přečetl jsem si a vím o tom
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
}
