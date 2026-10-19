// 🔗 Přihlášení a spárování účtu přes Google.
// ---------------------------------------------------------------------------
// Účet v aplikaci zakládá admin schválením e-mailu (Uživatelé → Schválené
// e-maily). Google je jen DRUHÝ ZPŮSOB, jak se k témuž účtu přihlásit: Supabase
// spáruje Google účet s existujícím účtem podle stejného ověřeného e-mailu.
// Cizí Google účet se neschváleným e-mailem se dovnitř nedostane — databáze
// nový účet odmítne (trigger nad `allowed_emails`), takže se tu nic neobchází.
//
// Zapnout poskytovatele Google musí majitel v Supabase (Authentication →
// Providers → Google) — bez toho se tlačítko ohlásí srozumitelnou chybou.
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { CESTA_DRUHE_APLIKACE, JE_DRUHA_APLIKACE } from './profilAplikace';

/**
 * Tlačítka Google se ukazují, až je poskytovatel zapnutý v Supabase (majitel
 * 18. 10. 2026: „zatím kašli na Google“). Po zapnutí stačí přepnout na `true`.
 */
export const GOOGLE_PRIHLASENI_ZAPNUTO = false;

const ZAKAZANO = 'Přihlášení přes Google zatím není zapnuté. Zapni ho v Supabase (Authentication → Providers → Google).';

function navratovaAdresa(): string {
  // Zajíc 2 se vrací do sebe (/zajic2/), ne do hlavní aplikace.
  return typeof window !== 'undefined' ? `${window.location.origin}${JE_DRUHA_APLIKACE ? CESTA_DRUHE_APLIKACE : '/'}` : '/';
}

function srozumitelne(zprava: string): string {
  const m = zprava.toLowerCase();
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return ZAKAZANO;
  if (m.includes('manual linking is disabled')) {
    return 'Propojení s Google je v Supabase vypnuté (Authentication → Sign In / Providers → „Allow manual linking“).';
  }
  return zprava;
}

/** Přihlášení přes Google. Při úspěchu prohlížeč odejde na Google a vrátí se sem. */
export async function prihlasitPresGoogle(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: navratovaAdresa(), queryParams: { prompt: 'select_account' } },
  });
  return { error: error ? srozumitelne(error.message) : null };
}

/** Připojí Google k právě přihlášenému účtu (pak se jde přihlásit oběma způsoby). */
export async function propojitSGoogle(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: { redirectTo: navratovaAdresa() },
  });
  return { error: error ? srozumitelne(error.message) : null };
}

/** Je k účtu už připojený Google? */
export function maGoogle(user: Pick<User, 'identities'> | null | undefined): boolean {
  return !!user?.identities?.some((i) => i.provider === 'google');
}

/**
 * Chyba, se kterou se Google/Supabase vrátí do aplikace (v adrese `?error_description=…`
 * nebo za `#`). Prázdné, když se přihlášení nezkazilo.
 */
export function chybaZNavratu(adresa: { search: string; hash: string }): string | null {
  const p = new URLSearchParams(`${adresa.search.replace(/^\?/, '')}&${adresa.hash.replace(/^#/, '')}`);
  const popis = p.get('error_description') ?? p.get('error');
  if (!popis) return null;
  const m = `${popis} ${p.get('error') ?? ''} ${p.get('error_code') ?? ''}`.toLowerCase();
  if (m.includes('otp_expired') || m.includes('expired') || m.includes('invalid')) {
    return 'Odkaz z e-mailu už neplatí (platí krátce a jen jednou). Klepni na „Zapomněl(a) jsem heslo“ a pošli si nový.';
  }
  if (m.includes('database error') || m.includes('not allowed') || m.includes('access_denied') || m.includes('not approved')) {
    return 'Tenhle Google účet není schválený. Požádej správce, ať schválí tvůj e-mail (Uživatelé → Schválené e-maily).';
  }
  return srozumitelne(popis.replace(/\+/g, ' '));
}
