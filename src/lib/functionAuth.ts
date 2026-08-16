import { supabase } from './supabase';

/**
 * Headers for browser-to-Edge-Function requests.
 *
 * The public anon key identifies the Supabase project, but it must never be
 * used as the bearer token for protected functions. The bearer token below is
 * the short-lived access token of the currently approved user.
 */
export async function authenticatedFunctionHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new Error('Přihlášení vypršelo. Přihlaste se prosím znovu.');
  }

  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    ...(anonKey ? { Apikey: anonKey } : {}),
    ...extra,
  };
}
