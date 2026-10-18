// 📧 Přihlášení odkazem z e-mailu: pozvánka po schválení a zapomenuté heslo.
// ---------------------------------------------------------------------------
// Uživatel klepne na odkaz v e-mailu → aplikace se mu rovnou otevře (odkaz
// ho přihlásí) → nabídne „Založ si heslo“ → dál se přihlašuje e-mailem a svým
// heslem. Klepnutí na odkaz zároveň dokazuje, že mu schránka patří, takže se
// žádné heslo nepředává. Stejná cesta slouží pro zapomenuté heslo. Obrazovka se
// předem zeptá, jestli je e-mail schválený, a řekne to na rovinu.
//
// E-maily rozesílá Supabase. Aby chodily na adresy mimo tým a víc než pár za
// hodinu, musí majitel v Supabase nastavit vlastní SMTP (Authentication → SMTP).
import { supabase } from './supabase';

function navratovaAdresa(): string {
  return typeof window !== 'undefined' ? `${window.location.origin}/` : '/';
}

export const NENI_OVERENY = 'Tento e-mail není ověřený. Kontaktujte administrátora, ať ho schválí.';

/** Hláška po odeslání — říká, kam odkaz šel. */
export function odkazOdeslanNa(email: string): string {
  return `Odkaz byl odeslán na ${email}. Otevři ho v telefonu — aplikace se otevře a nabídne ti založení nového hesla. Zkontroluj i spam.`;
}

export function srozumitelnaChybaOdeslani(zprava: string): string | null {
  const m = zprava.toLowerCase();
  if (m.includes('rate limit') || m.includes('too many') || m.includes('seconds')) {
    return 'E-mail se už nedávno odesílal. Počkej chvíli (až hodinu) a zkus to znovu — nebo požádej správce o dočasné heslo.';
  }
  if (m.includes('error sending') || m.includes('smtp')) {
    return 'E-mail se nepodařilo odeslat (server pošty není nastavený). Požádej správce, ať ti nastaví dočasné heslo.';
  }
  return null;
}

export type VysledekOdkazu =
  | { stav: 'odeslano'; email: string }
  | { stav: 'neschvaleny' }
  | { stav: 'chyba'; zprava: string };

/** Je e-mail na seznamu schválených? (veřejná funkce s omezením počtu dotazů) */
async function jeSchvaleny(email: string): Promise<boolean | null> {
  try {
    const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auth-auto-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ email, overit: true }),
    });
    const j = await r.json().catch(() => ({})) as { schvaleny?: boolean };
    if (!r.ok) return null;
    return j.schvaleny === true;
  } catch {
    return null;
  }
}

/**
 * Ověří, že je e-mail schválený, a pošle na něj odkaz pro nastavení hesla
 * (první přihlášení i zapomenuté heslo). Neschválenému e-mailu se nic neposílá.
 */
export async function poslatOdkazProHeslo(zadany: string): Promise<VysledekOdkazu> {
  const email = zadany.trim().toLowerCase();
  const schvaleny = await jeSchvaleny(email);
  if (schvaleny === null) return { stav: 'chyba', zprava: 'Nepodařilo se ověřit e-mail (slabý signál?). Zkus to za chvíli znovu.' };
  if (!schvaleny) return { stav: 'neschvaleny' };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: navratovaAdresa() });
  if (error) {
    return { stav: 'chyba', zprava: srozumitelnaChybaOdeslani(error.message) ?? 'Odkaz se nepodařilo odeslat. Zkus to znovu, nebo kontaktuj administrátora.' };
  }
  return { stav: 'odeslano', email };
}
