export type ModuleKey =
  | 'dashboard'
  | 'entry'
  | 'orders'
  | 'zavoz'
  | 'kniha_jizd'
  | 'stock'
  | 'cellar'
  | 'kegging'
  | 'inventory'
  | 'srotovani'
  | 'haccp'
  | 'catalogs'
  | 'sklo_promo'
  | 'vycepy'
  | 'exkurze'
  | 'reminders'
  | 'akce'
  | 'pricelist'
  | 'app_settings';

export type ModuleAccess = {
  view: boolean;
  edit: boolean;
};

export type UserPermissions = Record<ModuleKey, ModuleAccess>;

export const MODULE_DEFINITIONS: { id: ModuleKey; label: string; icon: string; desc: string }[] = [
  { id: 'dashboard', label: 'Sklad', icon: '📊', desc: 'Přehled týdnů, zásoby piv na skladě, vyčerpání a STK vozidel.' },
  { id: 'entry', label: 'Zápis výroby (Stáčení & Prodejna)', icon: '📝', desc: 'Moduly pro stáčení piv, převod na prodejnu, vydání řidičům a odpisy.' },
  { id: 'orders', label: 'Objednávky & Kalendář týdnů', icon: '🛒', desc: 'Příjem objednávek hospod, zadávání počtů sudů a lahví.' },
  { id: 'zavoz', label: 'Rozvoz & Trasy', icon: '🚚', desc: 'Plánování tras rozvozu piva k zákazníkům a historie tras podle dnů.' },
  { id: 'kniha_jizd', label: 'Kniha jízd (Daňová evidence)', icon: '🚘', desc: 'Evidence služebních cest vozidel, stav tachometru a km pro daňové účetnictví.' },
  { id: 'stock', label: 'Skladové zásoby (Detail)', icon: '📦', desc: 'Podrobný přehled počtu sudů a lahví na skladě podle šarží.' },
  { id: 'cellar', label: 'Sklep', icon: '🏚️', desc: 'Kvasné tanky CCT, ležácké tanky 1-8, sanitace a plánovač zrání.' },
  { id: 'kegging', label: 'Stáčení piva & Historie', icon: '🛢️', desc: 'Evidence stočeného piva z tanků do KEG sudů a lahví.' },
  { id: 'inventory', label: 'Měsíční inventura skladu', icon: '📋', desc: 'Fyzické počítání zásob na začátku a konci měsíce, manka a přebytky.' },
  { id: 'srotovani', label: 'Šrotování sladu', icon: '🌾', desc: 'Zápis šrotování sladu pro vaření piva.' },
  { id: 'haccp', label: 'Sanitační řád', icon: '🛡️', desc: 'Sanitační příručka pivovaru, normy SVHP, zásady BOZP a první pomoci.' },
  { id: 'catalogs', label: 'Číselníky (Piva, Obaly, Odběratelé)', icon: '📚', desc: 'Katalog piv, cen obalů, seznam odběratelů a evidence vozidel.' },
  { id: 'sklo_promo', label: 'Sklad lahve, sklo, etikety...', icon: '🍷', desc: 'Evidence pivního skla, podtácků, etiket a prázdných lahví s varováním.' },
  { id: 'vycepy', label: 'Výčepy & Rezervace zařazení', icon: '🍺', desc: 'Evidence výčepních zařízení, kontrola čistoty, sanitací a kalendář rezervací.' },
  { id: 'exkurze', label: 'Exkurze & Prohlídky pivovaru', icon: '🏰', desc: 'Rezervační kalendář exkurzí, počet návštěvníků, průvodci a měsíční archiv.' },
  { id: 'reminders', label: 'Upomínky & Upozornění', icon: '🔔', desc: 'Vytváření upomínek s možností zobrazení na ploše (Push) nebo po přihlášení.' },
  { id: 'akce', label: 'Akce & Výjezdní prodej', icon: '🎪', desc: 'Plánování výjezdních akcí, rozvoz piva a naskladnění neprodaných kusů.' },
  { id: 'pricelist', label: 'Ceník pivovaru', icon: '🏷️', desc: 'Ceník piva pro odběratele, velkoobchodní i maloobchodní ceny.' },
  { id: 'app_settings', label: 'Aplikace & Nastavení', icon: '⚙️', desc: 'Instalace aplikace, přizpůsobení menu a nastavení vzhledu.' },
];

export const DEFAULT_FULL_PERMISSIONS: UserPermissions = {
  dashboard: { view: true, edit: true },
  entry: { view: true, edit: true },
  orders: { view: true, edit: true },
  zavoz: { view: true, edit: true },
  kniha_jizd: { view: true, edit: true },
  stock: { view: true, edit: true },
  cellar: { view: true, edit: true },
  kegging: { view: true, edit: true },
  inventory: { view: true, edit: true },
  srotovani: { view: true, edit: true },
  haccp: { view: true, edit: true },
  catalogs: { view: true, edit: true },
  sklo_promo: { view: true, edit: true },
  vycepy: { view: true, edit: true },
  exkurze: { view: true, edit: true },
  reminders: { view: true, edit: true },
  akce: { view: true, edit: true },
  pricelist: { view: true, edit: true },
  app_settings: { view: true, edit: true },
};

// Rychlé předvolby rolí
export const PRESET_ROLES: { name: string; icon: string; permissions: UserPermissions }[] = [
  {
    name: '👑 Administrátor (Plný přístup ke všemu)',
    icon: '👑',
    permissions: DEFAULT_FULL_PERMISSIONS,
  },
  {
    name: '👔 Šéf / Vedení (Plný přístup ke všemu)',
    icon: '👔',
    permissions: DEFAULT_FULL_PERMISSIONS,
  },
  {
    name: '🍺 Sládek (Plný přístup ke všemu)',
    icon: '🍺',
    permissions: DEFAULT_FULL_PERMISSIONS,
  },
  {
    name: '🏭 Výroba (Omezený přístup)',
    icon: '🏭',
    permissions: {
      dashboard: { view: true, edit: true },
      entry: { view: true, edit: true },
      orders: { view: true, edit: false },
      zavoz: { view: false, edit: false },
      kniha_jizd: { view: false, edit: false },
      stock: { view: true, edit: true },
      cellar: { view: true, edit: true },
      kegging: { view: true, edit: true },
      inventory: { view: true, edit: true },
      srotovani: { view: true, edit: true },
      haccp: { view: true, edit: true },
      catalogs: { view: true, edit: false },
      sklo_promo: { view: true, edit: true }, // Renamed
      vycepy: { view: true, edit: true },
      exkurze: { view: false, edit: false },
      reminders: { view: true, edit: true },
      akce: { view: false, edit: false },
      pricelist: { view: true, edit: false },
      app_settings: { view: false, edit: false },
    },
  },
  {
    name: '💼 Obchod / Prodej (Obchodní přístup)',
    icon: '💼',
    permissions: {
      dashboard: { view: true, edit: false },
      entry: { view: true, edit: false },
      orders: { view: true, edit: true },
      zavoz: { view: true, edit: true },
      kniha_jizd: { view: true, edit: true },
      stock: { view: true, edit: false },
      cellar: { view: false, edit: false },
      kegging: { view: false, edit: false },
      inventory: { view: false, edit: false },
      srotovani: { view: false, edit: false },
      haccp: { view: true, edit: false },
      catalogs: { view: true, edit: true },
      sklo_promo: { view: true, edit: false },
      vycepy: { view: true, edit: true },
      exkurze: { view: true, edit: true },
      reminders: { view: true, edit: true },
      akce: { view: true, edit: true },
      pricelist: { view: true, edit: true },
      app_settings: { view: false, edit: false },
    },
  },
  {
    name: '⚙️ Vlastní nastavení práv (Kombinuji manuálně)',
    icon: '⚙️',
    permissions: {
      dashboard: { view: true, edit: false },
      entry: { view: false, edit: false },
      orders: { view: false, edit: false },
      zavoz: { view: false, edit: false },
      kniha_jizd: { view: false, edit: false },
      stock: { view: false, edit: false },
      cellar: { view: false, edit: false },
      kegging: { view: false, edit: false },
      inventory: { view: false, edit: false },
      srotovani: { view: false, edit: false },
      haccp: { view: false, edit: false },
      catalogs: { view: false, edit: false },
      sklo_promo: { view: false, edit: false },
      vycepy: { view: false, edit: false },
      exkurze: { view: false, edit: false },
      reminders: { view: true, edit: true },
      akce: { view: false, edit: false },
      pricelist: { view: false, edit: false },
      app_settings: { view: false, edit: false },
    },
  },
];

/**
 * Která obrazovka patří pod který modul oprávnění.
 *
 * JEDINÝ zdroj pravdy. Dřív existovala tahle mapa TŘIKRÁT (Layout.tsx,
 * AppSettingsScreen.tsx, HomeScreen.tsx) a kopie se rozešly:
 *   • „srotovani" bylo jednou pod vlastním modulem, jinde pod „entry"
 *   • „concentration" jednou pod „cellar", jinde pod „entry"
 *   • „depozitar" v jedné kopii CHYBĚL úplně — a protože se chybějící klíč
 *     vyhodnocuje jako „povoleno všem", zobrazoval se i lidem bez práv
 *   • „sanitace" chyběla v jiné kopii
 * Uživatel tak viděl modul v jednom seznamu a v druhém ne.
 *
 * Pozn.: klíč, který tu chybí, se považuje za veřejný — proto sem patří
 * všechny obrazovky, které mají být za právy.
 */
export const PAGE_TO_MODULE: Record<string, ModuleKey> = {
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
  orders_detail: 'orders',
  orders_celkem: 'orders',
  orders_zavoz: 'zavoz',
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
  sanitace: 'haccp',
  sanitace_lahve: 'haccp',
  sanitace_kegy: 'haccp',
  sanitace_vycepy: 'haccp',
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
  reminders: 'reminders',
  notes: 'reminders',
  feedback: 'catalogs',
};

export function getUserPermissions(userId: string, rawPermissionsJson?: any): UserPermissions {
  const localKey = `user_permissions_${userId}`;
  try {
    if (rawPermissionsJson && typeof rawPermissionsJson === 'object') {
      return { ...DEFAULT_FULL_PERMISSIONS, ...rawPermissionsJson };
    }
    const saved = localStorage.getItem(localKey);
    if (saved) return { ...DEFAULT_FULL_PERMISSIONS, ...JSON.parse(saved) };
  } catch {
    // fallback to full permissions
  }
  return DEFAULT_FULL_PERMISSIONS;
}

export function saveUserPermissions(userId: string, permissions: UserPermissions) {
  const localKey = `user_permissions_${userId}`;
  localStorage.setItem(localKey, JSON.stringify(permissions));
}

export function canUserView(userRole: string | undefined, userId: string | undefined, module: ModuleKey, userPermissions?: UserPermissions): boolean {
  const role = (userRole || '').toLowerCase().trim();
  if (role === 'admin' || role === 'sef' || role === 'sladek' || role === 'boss' || role === 'manager') return true;
  if (!userId) return true;

  const perms = userPermissions ?? getUserPermissions(userId);
  return perms[module]?.view ?? true;
}

export function canUserEdit(userRole: string | undefined, userId: string | undefined, module: ModuleKey, userPermissions?: UserPermissions): boolean {
  const role = (userRole || '').toLowerCase().trim();
  if (role === 'admin' || role === 'sef' || role === 'sladek' || role === 'boss' || role === 'manager') return true;
  if (!userId) return true;

  const perms = userPermissions ?? getUserPermissions(userId);
  return perms[module]?.edit ?? true;
}
