/**
 * VYČIŠTĚNÍ DAT — PŘÍPRAVA NA OSTRÝ PROVOZ
 *
 * Obsahuje funkce pro vymazání všech uživatelsky zadaných dat:
 *  - clearLocalUserData()  → vymaže data uložená v prohlížeči (localStorage)
 *  - clearDatabaseData()   → vymaže data v Supabase databázi (vyžaduje přihlášení)
 *
 * POZNÁMKA: clearDatabaseData() používá přihlášenou Supabase session, takže
 * ji lze volat z aplikace (např. z admin nastavení). Referenční číselníky
 * (piva, obaly, sklepní tanky) se resetují na seed stav.
 */


// Všechny známé localStorage klíče s uživatelskými daty
const USER_DATA_KEYS: string[] = [
  // Výčepy a rezervace
  'vycepy_equipment_v1',
  'vycepy_reservations_v1',
  // Připomínky
  'reminders_list_v1',
  // Nákupy etiket a lahví
  'labels_purchases',
  'bottles_purchases',
  'labels_issues',
  // Kniha jízd
  'kniha_jizd_v1',
  'kniha_jizd_entries',
  'zavoz_second_car_dates',
  // Exkurze
  'exkurze_entries_v1',
  // Sklo promo
  'sklo_promo_entries',
  // Sanitace
  'sanitation_logs_data',
  // Vaření / plánované várky
  'brewing_logs_data',
  'cellar_planned_brews_data',
  // Akce
  'akce_records_v2',
  // Naučené aliasy OCR
  'user_learned_aliases',
  'user_learned_place_aliases',
  // Auditní log
  'pivovar_audit_trail_v1',
  // Offline fronta
  'pivovar_offline_queue_v1',
  // Aktivní hlášení
  'pivovar_active_announcement',
  // Historie filtrů
  'history_saved_filters',
  // Datum poslední zálohy
  'last_backup_date',
];

// Klíče s dynamickými názvy (prefixy) — smažeme všechny, které začínají tímto prefixem
const USER_DATA_PREFIXES: string[] = [
  'user_quick_actions_',        // rychlé akce uživatele
  'user_permissions_',          // oprávnění uživatele
  'actual_inventory_',          // aktuální inventura (per měsíc)
  'inventory_adjustments_',     // dorovnání inventury (per měsíc, uchovává se bokem)
  'initial_stock_',             // počáteční stav skladu (per měsíc)
  'acknowledged_announcement_', // potvrzená hlášení
];

/**
 * Smaže všechna uživatelsky zadaná data z localStorage.
 * Volitelně smaže i nastavení (téma, hustota, notifikace) — výchozí false,
 * aby se zachovalo uživatelské nastavení vzhledu.
 */
export function clearLocalUserData(clearSettings = false): string[] {
  const removed: string[] = [];

  // 1) Smažeme přesně pojmenované klíče
  for (const key of USER_DATA_KEYS) {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      removed.push(key);
    }
  }

  // 2) Smažeme klíče podle prefixů
  const allKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k) allKeys.push(k);
  }
  for (const prefix of USER_DATA_PREFIXES) {
    for (const key of allKeys) {
      if (key.startsWith(prefix) && localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        removed.push(key);
      }
    }
  }

  // 3) Volitelně smažeme i nastavení vzhledu/notifikací
  if (clearSettings) {
    const settingsKeys = ['pivovar_theme', 'minipivovar_density', 'notification_settings'];
    for (const key of settingsKeys) {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        removed.push(key);
      }
    }
  }

  return removed;
}

// Tabulky s uživatelskými daty (všechny se vymažou)
const USER_TABLES: string[] = [
  'order_items', 'orders',
  'bottling', 'bottling_entries', 'kegging', 'kegging_entries',
  'writeoffs', 'inventory', 'monthly_inventory',
  'fasovani', 'fasovani_private',
  'akce_items', 'akce', 'event_items',
  'calendar_events', 'reminders',
  'sanitation_logs', 'srotovani', 'zadavani',
  'cellar_transfers', 'cellar_tank_cycles', 'kegging_tanks', 'keg_prefuk',
  'places', 'price_list', 'vehicles',
  'parser_aliases', 'audit_log', 'user_app_versions', 'feedback_notes',
];

// Referenční číselníky — reset na seed stav
const SEED_BEERS: [string, string | null, string | null, string, number][] = [
  ['12° Světlá', '12°', 'světlé', '#FDE68A', 1],
  ['11° Světlá', '11°', 'světlé', '#FEF3C7', 2],
  ['10° Desítka', '10°', 'světlé', '#FCD34D', 3],
  ['12° Tmavá', '12°', 'tmavé', '#44403B', 4],
  ['Jantar', null, 'jantarové', '#F59E0B', 5],
  ['Summer Ale', null, 'ovocné', '#86EFAC', 6],
  ['13 Hazy Bunny', '13°', 'nefiltrované', '#FCA5A5', 7],
  ['Hazy Spring Day', null, 'nefiltrované', '#F9A8D4', 8],
];

const SEED_PACKAGES: [string, 'keg' | 'bottle', number, string, number][] = [
  ['KEG50', 'keg', 50, 'KEG 50l', 1],
  ['KEG30', 'keg', 30, 'KEG 30l', 2],
  ['KEG20', 'keg', 20, 'KEG 20l', 3],
  ['KEG15', 'keg', 15, 'KEG 15l', 4],
  ['KEG10', 'keg', 10, 'KEG 10l', 5],
  ['LAHEV15', 'bottle', 1.5, 'Lahve 1.5l', 6],
  ['LAHEV1', 'bottle', 1, 'Lahve 1l', 7],
  ['LAHEV05', 'bottle', 0.5, 'Lahve 0.5l', 8],
  ['LAHEV033', 'bottle', 0.33, 'Lahve 0.33l', 9],
];

/**
 * Vymaže všechna uživatelská data v Supabase databázi a resetuje
 * referenční číselníky (piva, obaly, sklepní tanky) na seed stav.
 *
 * Využívá přihlášenou Supabase session (RLS politiky umožňují mazat
 * přihlášeným uživatelům). Vrací přehled výsledků.
 */
export async function clearDatabaseData(): Promise<{ ok: string[]; failed: { table: string; error: string }[] }> {
  const { supabase } = await import('./supabase');
  const ok: string[] = [];
  const failed: { table: string; error: string }[] = [];

  // 1) Vymazání uživatelských tabulek
  for (const table of USER_TABLES) {
    try {
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) failed.push({ table, error: error.message });
      else ok.push(table);
    } catch (e) {
      failed.push({ table, error: e instanceof Error ? e.message : 'neznámá chyba' });
    }
  }

  // 2) Reset referenčních číselníků — piva
  try {
    await supabase.from('beers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    for (const [name, degree, color, beer_color, sort_order] of SEED_BEERS) {
      await supabase.from('beers').insert({ name, degree, color, beer_color, is_active: true, sort_order });
    }
    ok.push('beers (reset)');
  } catch (e) {
    failed.push({ table: 'beers', error: e instanceof Error ? e.message : 'neznámá chyba' });
  }

  // 3) Reset referenčních číselníků — obaly
  try {
    await supabase.from('packages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    for (const [code, kind, volume_l, label, sort_order] of SEED_PACKAGES) {
      await supabase.from('packages').insert({ code, kind, volume_l, label, sort_order });
    }
    ok.push('packages (reset)');
  } catch (e) {
    failed.push({ table: 'packages', error: e instanceof Error ? e.message : 'neznámá chyba' });
  }

  // 4) Reset referenčních číselníků — sklepní tanky
  try {
    await supabase.from('cellar_tanks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    for (let i = 1; i <= 8; i++) {
      await supabase.from('cellar_tanks').insert({ label: `Tank ${i}`, capacity_l: 7500, current_volume_l: 0, status: 'empty' });
    }
    ok.push('cellar_tanks (reset)');
  } catch (e) {
    failed.push({ table: 'cellar_tanks', error: e instanceof Error ? e.message : 'neznámá chyba' });
  }

  return { ok, failed };
}


