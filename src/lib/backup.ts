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
  };
}

export async function createFullBackup(): Promise<DatabaseBackup> {
  const tables = [
    'beers', 'packages', 'places', 'price_list', 'orders', 'order_items',
    'cellar_tanks', 'cellar_batches', 'bottling', 'kegging', 'keg_prefuk', 'fasovani',
    'fasovani_private', 'writeoffs', 'inventory', 'inventory_adjustments', 'akce', 'akce_items'
  ];

  const backupData: any = {};

  await Promise.all(
    tables.map(async (table) => {
      const { data, error } = await supabase.from(table).select('*');
      if (error) {
        console.error(`Chyba při zálohování tabulky ${table}:`, error);
        backupData[table] = [];
      } else {
        backupData[table] = data ?? [];
      }
    })
  );

  return {
    version: '1.1',
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
