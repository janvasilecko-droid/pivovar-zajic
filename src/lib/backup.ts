import { supabase } from './supabase';
import * as XLSX from 'xlsx';

export interface DatabaseBackup {
  version: string;
  timestamp: string;
  tables: {
    beers: any[];
    packages: any[];
    places: any[];
    price_list: any[];
    orders: any[];
    order_items: any[];
    cellar_tanks: any[];
    cellar_batches: any[];
    bottling: any[];
    kegging: any[];
    keg_prefuk: any[];
    fasovani: any[];
    fasovani_private: any[];
    writeoffs: any[];
    inventory: any[];
    inventory_adjustments: any[];
    akce: any[];
    akce_items: any[];
    whatsapp_incoming: any[];
    whatsapp_senders: any[];
    parser_aliases: any[];
    place_aliases: any[];
  };
}

/** Tabulky, které se zálohují. Jeden zdroj pravdy — ať seznam nezastarává. */
export const BACKUP_TABLES = [
  'beers', 'packages', 'places', 'price_list', 'orders', 'order_items',
  'cellar_tanks', 'cellar_batches', 'cellar_transfers', 'cellar_tank_cycles',
  'bottling', 'kegging', 'keg_prefuk', 'kegging_tanks', 'fasovani',
  'fasovani_private', 'writeoffs', 'inventory', 'inventory_adjustments',
  'akce', 'akce_items', 'zavoz_deductions', 'keg_returns',
  'sanitation_logs', 'bottle_sanitation_logs', 'keg_sanitation_logs',
  'tap_sanitation_logs', 'bottling_line_maintenance_tasks',
  'logbook_entries', 'srotovani', 'vehicles', 'label_purchases',
  'bottling_plans', 'notes', 'reminders', 'calendar_events',
  'whatsapp_incoming', 'whatsapp_senders', 'parser_aliases', 'place_aliases',
];

/**
 * Načte CELOU tabulku po stránkách.
 *
 * Supabase vrací ve výchozím nastavení nejvýš 1000 řádků a chybu nehlásí —
 * `select('*')` se tedy po překročení limitu TIŠE ořízl a záloha vypadala
 * kompletně, přestože v ní chyběl zbytek. Proto se čte po dávkách přes
 * .range(), dokud chodí plné stránky.
 */
async function fetchAllRows(table: string): Promise<{ rows: any[]; error: string | null }> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
    if (error) return { rows: out, error: error.message };
    const batch = data ?? [];
    out.push(...batch);
    if (batch.length < PAGE) break;
    // Pojistka proti nekonečné smyčce u nečekaně velké tabulky.
    if (out.length > 500_000) break;
  }
  return { rows: out, error: null };
}

export async function createFullBackup(): Promise<DatabaseBackup> {
  const tables = BACKUP_TABLES;

  const backupData: any = {};
  const problemy: string[] = [];

  await Promise.all(
    tables.map(async (table) => {
      const { rows, error } = await fetchAllRows(table);
      backupData[table] = rows;
      if (error) {
        console.error(`Chyba při zálohování tabulky ${table}:`, error);
        problemy.push(`${table}: ${error}`);
      }
    })
  );

  // Nekompletní zálohu je lepší nahlásit, než ji mlčky vydat za platnou.
  if (problemy.length > 0) {
    backupData.__nekompletni = problemy;
  }

  return {
    version: '1.2',
    timestamp: new Date().toISOString(),
    tables: backupData,
  };
}

export function downloadBackupJSON(backup: DatabaseBackup) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const jsonStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `minipivovar-zaloha-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  localStorage.setItem('last_backup_date', new Date().toISOString());
}

export function downloadGoogleSheetsExcelBackup(backup: DatabaseBackup, monthLabel?: string) {
  const dateStr = new Date().toISOString().slice(0, 10);
  const wb = XLSX.utils.book_new();

  const addSheet = (sheetName: string, dataArray: any[]) => {
    if (!dataArray || dataArray.length === 0) {
      const emptyWs = XLSX.utils.json_to_sheet([{ Zprava: 'Žádné záznamy pro tento měsíc / modul' }]);
      XLSX.utils.book_append_sheet(wb, emptyWs, sheetName);
      return;
    }
    const ws = XLSX.utils.json_to_sheet(dataArray);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  };

  // Local storage items fallback
  let exkurze: any[] = [];
  let vycepy: any[] = [];
  let knihaJizd: any[] = [];
  try { exkurze = JSON.parse(localStorage.getItem('exkurze_entries_v1') || '[]'); } catch {}
  try { vycepy = JSON.parse(localStorage.getItem('vycepy_reservations_v1') || '[]'); } catch {}
  try { knihaJizd = JSON.parse(localStorage.getItem('kniha_jizd_v1') || '[]'); } catch {}

  addSheet('Piva_Obaly', backup.tables.beers || []);
  addSheet('Odberatele_Hospody', backup.tables.places || []);
  addSheet('Cenik_Pivovaru', backup.tables.price_list || []);
  addSheet('Objednavky', backup.tables.orders || []);
  addSheet('Polozky_Objednavek', backup.tables.order_items || []);
  addSheet('Staceni_KEG', backup.tables.kegging || []);
  addSheet('Staceni_Lahve', backup.tables.bottling || []);
  addSheet('Prodejna_Fasovani', backup.tables.fasovani || []);
  addSheet('Odpisy_Manka', backup.tables.writeoffs || []);
  addSheet('Kvasne_Tanky', backup.tables.cellar_tanks || []);
  addSheet('Akce_Vyjezdni', backup.tables.akce || []);
  addSheet('WhatsApp_Message', backup.tables.whatsapp_incoming || []);
  addSheet('WhatsApp_Odesilatele', backup.tables.whatsapp_senders || []);
  addSheet('Parser_Aliasy', backup.tables.parser_aliases || []);
  addSheet('Mista_Aliasy', backup.tables.place_aliases || []);
  addSheet('Kniha_Jizd', knihaJizd);
  addSheet('Exkurze', exkurze);
  addSheet('Vycepy_Rezervace', vycepy);

  const filePrefix = monthLabel ? `Zaloha-Pivovar-${monthLabel}` : `Zaloha-Pivovar-Komplet-${dateStr}`;
  XLSX.writeFile(wb, `${filePrefix}.xlsx`);
  localStorage.setItem('last_backup_date', new Date().toISOString());
}

export function isWeeklyBackupDue(): boolean {
  const last = localStorage.getItem('last_backup_date');
  if (!last) return true;
  const diffDays = (Date.now() - new Date(last).getTime()) / (1000 * 3600 * 24);
  return diffDays >= 7;
}
