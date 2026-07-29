/**
 * Sledování verzí aplikace u jednotlivých uživatelů.
 *
 * Při každém startu aplikace (nebo přihlášení) se zapíše do Supabase tabulky
 * `user_app_versions` aktuální verze. Admin pak vidí, kdo má jakou verzi.
 */

import { supabase } from './supabase';
import { APP_VERSION } from './version';

let lastReportedVersion: string | null = null;

/**
 * Zjistí základní informace o zařízení/prohlížeči.
 */
function getDeviceInfo(): string {
  const parts: string[] = [];

  // Detekce Capacitor (nativní Android)
  if (typeof (window as any).Capacitor !== 'undefined') {
    parts.push('Android (Capacitor)');
  } else {
    parts.push('Web');
  }

  // Platforma
  const ua = navigator.userAgent;
  if (ua.includes('Android')) parts.push('Android');
  else if (ua.includes('iPhone') || ua.includes('iPad')) parts.push('iOS');
  else if (ua.includes('Windows')) parts.push('Windows');
  else if (ua.includes('Mac')) parts.push('macOS');
  else if (ua.includes('Linux')) parts.push('Linux');

  // Prohlížeč
  if (ua.includes('Chrome')) parts.push('Chrome');
  else if (ua.includes('Firefox')) parts.push('Firefox');
  else if (ua.includes('Safari')) parts.push('Safari');

  return parts.join(' / ');
}

/**
 * Zapíše aktuální verzi aplikace do databáze.
 * Volá se při startu aplikace a při přihlášení.
 */
export async function reportAppVersion(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  const version = APP_VERSION;
  const deviceInfo = getDeviceInfo();

  // Nezapisujeme, pokud se verze nezměnila (abychom zbytečně nezatěžovali DB)
  if (lastReportedVersion === version) return;

  try {
    const { error } = await supabase.from('user_app_versions').upsert(
      {
        user_id: session.user.id,
        version,
        device_info: deviceInfo,
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
    console.error('Failed to fetch user versions:', error);
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
