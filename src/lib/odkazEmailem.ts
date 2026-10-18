// 📧 Přihlášení odkazem z e-mailu: pozvánka po schválení a zapomenuté heslo.
// ---------------------------------------------------------------------------
// Uživatel klepne na odkaz v e-mailu → aplikace se mu rovnou otevře (odkaz
// ho přihlásí) → nabídne „Založ si heslo“ → dál se přihlašuje e-mailem a svým
// heslem. Klepnutí na odkaz zároveň dokazuje, že mu schránka patří, takže se
// žádné heslo nepředává. Stejná cesta slouží pro zapomenuté heslo.
//
// E-maily rozesílá Supabase. Aby chodily na adresy mimo tým a víc než pár za
// hodinu, musí majitel v Supabase nastavit vlastní SMTP (Authentication → SMTP).
import { supabase } from './supabase';

function navratovaAdresa(): string {
  return typeof window !== 'undefined' ? `${window.location.origin}/` : '/';
}

/** Hláška pro uživatele — nikdy neprozradí, jestli e-mail ve schváleném seznamu je. */
export const ODKAZ_ODESLAN = 'Pokud je tenhle e-mail schválený, poslali jsme na něj odkaz. Otevři ho v telefonu — aplikace se otevře a nabídne ti založení nového hesla. Zkontroluj i spam.';

export function srozumitelnaChybaOdeslani(zprava: string): string | null {
  const m = zprava.toLowerCase();
  if (m.includes('rate limit') || m.includes('too many') || m.includes('seconds')) {
    return 'E-mail se už nedávno odesílal. Počkej chvíli (až hodinu) a zkus to znovu — nebo požádej správce o dočasné heslo.';
  }
  if (m.includes('error sending') || m.includes('smtp')) {
    return 'E-mail se nepodařilo odeslat (server pošty není nastavený). Požádej správce, ať ti nastaví dočasné heslo.';
  }
  // Ostatní chyby (včetně „uživatel neexistuje“) se nehlásí — jinak by se dalo zjišťovat, kdo je schválený.
  return null;
}

/** Pošle na e-mail odkaz pro nastavení hesla (první přihlášení i zapomenuté heslo). */
export async function poslatOdkazProHeslo(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: navratovaAdresa() });
  return { error: error ? srozumitelnaChybaOdeslani(error.message) : null };
}
