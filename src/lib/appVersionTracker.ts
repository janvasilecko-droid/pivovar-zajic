/**
 * Sledování verzí aplikace u jednotlivých uživatelů.
 *
 * Při každém startu aplikace (nebo přihlášení) se zapíše do Supabase tabulky
 * `user_app_versions` aktuální verze. Admin pak vidí, kdo má jakou verzi.
 */

import { supabase } from './supabase';
import { APP_VERSION } from './version';
import { zalogujANahlas } from './chybyHlaseni';

let lastReportedVersion: string | null = null;

/**
 * Zapíše aktuální verzi aplikace do databáze.
 * Volá se při startu aplikace a při přihlášení.
 *
 * Spolu s verzí se zapíše, jak a na čem aplikace běží („Ikona na ploše / Android 8.1 / Chrome 74 / SM-J530F“,
 * viz lib/zarizeni.ts). Dřív tu stálo „Android (Capacitor)“ i u telefonu, který aplikaci jen otevřel v Chromu.
 */
export async function reportAppVersion(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  const version = APP_VERSION;

  // Nezapisujeme, pokud se verze nezměnila (abychom zbytečně nezatěžovali DB)
  if (lastReportedVersion === version) return;

  // Popis zařízení se načítá až tady (samostatný kousek), ne při startu: zápis verze běží po dvou vteřinách
  // a startovní balíček má pevný strop (npm run zkontroluj-velikost).
  let deviceInfo: string | null = null;
  try {
    const { popisTohotoZarizeni } = await import('./zarizeni');
    deviceInfo = await popisTohotoZarizeni();
  } catch {
    // Kousek se nenačetl (bez signálu, nebo po novém nasazení už neexistuje) — verze se zapíše i tak a stávající
    // popis zařízení v databázi zůstane, jak byl (sloupec se v takovém případě neposílá).
    deviceInfo = null;
  }

  try {
    const { error } = await supabase.from('user_app_versions').upsert(
      {
        user_id: session.user.id,
        version,
        ...(deviceInfo ? { device_info: deviceInfo } : {}),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) {
      console.warn('Failed to report app version:', error.message);
    } else {
      lastReportedVersion = version;
    }
  } catch (err) {
    // Ticho — offline není chyba
    console.warn('Failed to report app version (offline?):', err);
  }
}

/**
 * Vrátí seznam všech verzí všech uživatelů (pouze pro admina).
 */
export async function getAllUserVersions(): Promise<{
  user_id: string;
  display_name: string | null;
  version: string;
  device_info: string | null;
  last_seen_at: string;
}[]> {
  const { data, error } = await supabase
    .from('user_app_versions')
    .select(`
      user_id,
      version,
      device_info,
      last_seen_at,
      profiles!inner(display_name)
    `)
    .order('last_seen_at', { ascending: false });

  if (error) {
    zalogujANahlas('Failed to fetch user versions', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    user_id: row.user_id,
    display_name: row.profiles?.display_name ?? 'Neznámý',
    version: row.version,
    device_info: row.device_info,
    last_seen_at: row.last_seen_at,
  }));
}
