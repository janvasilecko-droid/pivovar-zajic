import { supabase } from './supabase';
import { nactiXlsx, xlsx } from './xlsxLazy';
import type { NazevTabulky, Radek } from './dbTypy';
import { businessDateISO } from './businessDate';

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
] as const satisfies readonly NazevTabulky[];

export type ZalohovanaTabulka = (typeof BACKUP_TABLES)[number];

export interface DatabaseBackup {
  version: string;
  timestamp: string;
  /** Řádky po tabulkách; `__nekompletni` = seznam tabulek, které se nepodařilo načíst. */
  tables: { [T in ZalohovanaTabulka]?: Radek<T>[] } & { __nekompletni?: string[] };
}

/**
 * Načte CELOU tabulku po stránkách.
 *
 * Supabase vrací ve výchozím nastavení nejvýš 1000 řádků a chybu nehlásí —
 * `select('*')` se tedy po překročení limitu TIŠE ořízl a záloha vypadala
 * kompletně, přestože v ní chyběl zbytek. Proto se čte po dávkách přes
 * .range(), dokud chodí plné stránky.
 */
async function fetchAllRows(table: ZalohovanaTabulka): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const PAGE = 1000;
  const out: Record<string, unknown>[] = [];
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

  const backupData: Record<string, unknown> = {};
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
    tables: backupData as DatabaseBackup['tables'],
  };
}

export function downloadBackupJSON(backup: DatabaseBackup) {
  const dateStr = businessDateISO();
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
  oznacZalohu();
}

export async function downloadGoogleSheetsExcelBackup(backup: DatabaseBackup, monthLabel?: string) {
  await nactiXlsx();
  const dateStr = businessDateISO();
  const wb = xlsx().utils.book_new();

  const addSheet = (sheetName: string, dataArray: readonly object[]) => {
    if (!dataArray || dataArray.length === 0) {
      const emptyWs = xlsx().utils.json_to_sheet([{ Zprava: 'Žádné záznamy pro tento měsíc / modul' }]);
      xlsx().utils.book_append_sheet(wb, emptyWs, sheetName);
      return;
    }
    const ws = xlsx().utils.json_to_sheet(dataArray);
    xlsx().utils.book_append_sheet(wb, ws, sheetName);
  };

  // Local storage items fallback
  let exkurze: object[] = [];
  let vycepy: object[] = [];
  let knihaJizd: object[] = [];
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
  xlsx().writeFile(wb, `${filePrefix}.xlsx`);
  oznacZalohu();
}

/** Klíč, pod kterým se drží datum poslední stažené zálohy. */
export const KLIC_POSLEDNI_ZALOHA = 'last_backup_date';
/** Po kolika dnech se záloha připomíná. */
export const ZALOHA_PO_DNECH = 7;

export type UlozisteZalohy = Pick<Storage, 'getItem' | 'setItem'>;

function vychoziUloziste(): UlozisteZalohy | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Kolik dní uplynulo od poslední stažené zálohy.
 * `null` = ještě nikdy, nebo se to nedá zjistit.
 *
 * ZÁLOHA STAŽENÁ DO TELEFONU/POČÍTAČE je jediná kopie mimo GitHub a mimo
 * Supabase. Denní záloha v `zalohy/` leží ve stejném repozitáři jako kód,
 * takže se ztrátou přístupu k účtu zmizí obojí naráz — a záloha na jednom
 * účtu není záloha.
 */
export function dnuOdZalohy(uloziste?: UlozisteZalohy | null): number | null {
  const store = uloziste === undefined ? vychoziUloziste() : uloziste;
  if (!store) return null;
  try {
    const last = store.getItem(KLIC_POSLEDNI_ZALOHA);
    if (!last) return null;
    const kdy = new Date(last).getTime();
    if (!Number.isFinite(kdy)) return null;
    const dnu = (Date.now() - kdy) / (1000 * 3600 * 24);
    // Datum v budoucnosti (přenastavené hodiny) se bere jako „dnes",
    // ne jako záporný počet dní.
    return Math.max(0, Math.floor(dnu));
  } catch {
    return null;
  }
}

/** Je čas na zálohu? Když se to nedá zjistit, radši ANO než mlčet. */
export function isWeeklyBackupDue(uloziste?: UlozisteZalohy | null): boolean {
  const dnu = dnuOdZalohy(uloziste);
  return dnu === null || dnu >= ZALOHA_PO_DNECH;
}

/** Zapíše, že se právě stáhla záloha. Chyba úložiště nesmí shodit stahování. */
export function oznacZalohu(uloziste?: UlozisteZalohy | null): void {
  const store = uloziste === undefined ? vychoziUloziste() : uloziste;
  if (!store) return;
  try { store.setItem(KLIC_POSLEDNI_ZALOHA, new Date().toISOString()); } catch { /* plné úložiště */ }
}
