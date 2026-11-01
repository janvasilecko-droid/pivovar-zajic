/**
 * Automatic delivery stock movements.
 *
 * The database RPC performs the actual insert transactionally, once per
 * order_item. A pg_cron job is the primary scheduler; this browser-side check
 * is a safe fallback for installations where pg_cron is unavailable.
 */

import { businessDateISO, businessHour } from './businessDate';
import { supabase } from './supabase';
import { zalogujANahlas } from './chybyHlaseni';
import { uloz } from './uloziste';

// Den závozu z objednávky žije v lib/denZavozu.ts (čisté funkce bez databáze).
export { computeDeliveryDateISO, deliveryDayToISO } from './denZavozu';

export type ZavozDeductionRow = {
  id: string;
  deduct_date: string;
  order_id: string;
  order_item_id: string;
  beer_id: string | null;
  package_id: string | null;
  quantity: number;
  created_at: string;
};

const LS_KEY = 'zavoz_deduction_last_successful_day_v2';

/**
 * The public RPC intentionally accepts no date parameter, so a browser client
 * cannot create arbitrary historical stock movements.
 */
export async function runZavozDeductionForDate(deductDate: string): Promise<number> {
  const today = businessDateISO();
  if (deductDate !== today) {
    throw new Error('Klient smí spustit pouze odpočet dnešního závozu.');
  }

  const { data, error } = await supabase.rpc('run_today_zavoz_deductions');
  if (error) {
    zalogujANahlas('[zavozDeduction] Databázový odpočet selhal', error);
    throw error;
  }

  const count = Number(data ?? 0);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error('Databáze vrátila neplatný počet odpočtů.');
  }
  return count;
}

export async function checkAndRunDailyDeduction(): Promise<void> {
  if (businessHour() < 1) return;

  const today = businessDateISO();
  if (localStorage.getItem(LS_KEY) === today) return;

  try {
    const count = await runZavozDeductionForDate(today);
    uloz(LS_KEY, today);
    if (count > 0) {
      console.info(`[zavozDeduction] Odpočet závozu ${today}: ${count} položek`);
    }
  } catch (error) {
    // Do not mark the day complete. The next fallback check or pg_cron retries.
    zalogujANahlas('[zavozDeduction] Denní odpočet bude zopakován', error);
  }
}

export function scheduleNightlyCheck(): () => void {
  const check = () => {
    void checkAndRunDailyDeduction();
  };

  check();
  const interval = window.setInterval(check, 15 * 60_000);
  return () => window.clearInterval(interval);
}
