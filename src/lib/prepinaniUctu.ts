// 🔁 Přepínání účtů v jedné aplikaci — jen pro správce.
// ---------------------------------------------------------------------------
// Majitel 19. 10. 2026: „udělej, ať budu mít v jedné aplikaci 2 účty a budu mezi
// nimi přepínat, jen já jako admin“ (Zajíc 2 se mu na telefonu neotevřel).
//
// Správce si v Nastavení přidá druhý účet (e-mail a heslo se použijí jen na
// přihlášení, heslo se NEukládá). Aplikace si u každého účtu pamatuje jeho
// přihlášení (tokeny) v tomto zařízení — stejně jako normální přihlášení — a
// přepnutí je jedno klepnutí bez hesla. Žádný server, žádné nové právo: každý
// účet dál platí jen to, co smí sám. Když přihlášení vyprší nebo se odvolá,
// účet se nabídne znovu přidat.
import { createClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { ulozJson } from './uloziste';

import { KLIC_UCTU, nactiUcty, type StavUctu, type UlozenyUcet } from './uctyUlozene';
export { jePrepnutyUcet, nactiUcty } from './uctyUlozene';
export type { StavUctu, UlozenyUcet };

function uloz(stav: StavUctu): void {
  ulozJson(KLIC_UCTU, stav);
}

/** Zapamatuje si právě přihlášený účet (aktuální tokeny), aby se na něj dalo vrátit. */
async function zapamatujAktualni(): Promise<{ id: string; email: string } | null> {
  const { data } = await supabase.auth.getSession();
  const sess = data.session;
  if (!sess?.user) return null;
  const stav = nactiUcty();
  stav.ucty[sess.user.id] = { email: sess.user.email ?? '', access_token: sess.access_token, refresh_token: sess.refresh_token };
  if (!stav.domaci) stav.domaci = sess.user.id;
  uloz(stav);
  return { id: sess.user.id, email: sess.user.email ?? '' };
}

/**
 * Přidá další účet: ověří e-mail a heslo (samostatným klientem, přihlášení
 * hlavní aplikace se nedotkne) a uloží jeho přihlášení. Heslo se nikam neukládá.
 */
export async function pridejUcet(email: string, heslo: string): Promise<{ error: string | null }> {
  const aktualni = await zapamatujAktualni();
  if (!aktualni) return { error: 'Nejsi přihlášený.' };
  const klient = createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await klient.auth.signInWithPassword({ email: email.trim(), password: heslo });
  if (error || !data.session?.user) {
    return { error: /invalid login credentials/i.test(error?.message ?? '') ? 'Špatný e-mail nebo heslo.' : (error?.message ?? 'Přihlášení se nepodařilo.') };
  }
  const stav = nactiUcty();
  const u = data.session.user;
  stav.ucty[u.id] = { email: u.email ?? email.trim(), access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  uloz(stav);
  return { error: null };
}

/** Přepne aplikaci na uložený účet. Stav současného účtu si předtím zapamatuje. */
export async function prepniNaUcet(id: string): Promise<{ error: string | null }> {
  await zapamatujAktualni();
  const stav = nactiUcty();
  const cil = stav.ucty[id];
  if (!cil) return { error: 'Tenhle účet v přepínači není.' };
  const { error } = await supabase.auth.setSession({ access_token: cil.access_token, refresh_token: cil.refresh_token });
  if (error) {
    // Přihlášení vypršelo nebo bylo odvoláno — účet se z přepínače vyřadí a nabídne znovu přidat.
    delete stav.ucty[id];
    uloz(stav);
    return { error: `Přihlášení účtu ${cil.email} vypršelo — přidej ho znovu (e-mail a heslo).` };
  }
  return { error: null };
}

export function odeberUcet(id: string): void {
  const stav = nactiUcty();
  delete stav.ucty[id];
  if (stav.domaci === id) stav.domaci = null;
  uloz(stav);
}
