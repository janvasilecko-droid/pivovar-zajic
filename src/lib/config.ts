/**
 * Centrální konfigurace aplikace.
 *
 * Obsahuje seznam e-mailů hlavního administrátora/systémových adminů.
 * Logika "magického admin e-mailu" je zde centralizovaná, aby nedošlo k
 * roztroušení hardcoded e-mailových adres po celé aplikaci (a případným
 * bezpečnostním rizikům při změně/úniku). Seznam lze rozšířit bez zásahu
 * do business logiky.
 */

export const ADMIN_EMAILS: readonly string[] = ['vasilecko@seznam.cz'];

/** Hlavní (systémový) admin e-mail — používán jako výchozí hodnota. */
export const PRIMARY_ADMIN_EMAIL: string = ADMIN_EMAILS[0] ?? '';

/** Jméno hlavního administrátora (zobrazuje se v auditním logu / UI). */
export const PRIMARY_ADMIN_NAME: string = 'Vasil';

/** Výchozí role používaná, když není k dispozici profil uživatele. */
// Při chybějícím profilu nikdy nezvyšovat oprávnění. Admin role se musí
// potvrdit daty ze serveru, nikoli klientským fallbackem.
export const DEFAULT_ROLE: 'admin' | 'user' = 'user';

/**
 * Vrátí true, pokud daný e-mail patří mezi systémové administrátory.
 * Porovnává se case-insensitive a po oříznutí mezer.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return ADMIN_EMAILS.some((a) => a.toLowerCase().trim() === normalized);
}

/** Vrátí e-mail hlavního admina (fallback pro UI placeholdery). */
export function getAdminEmail(): string {
  return PRIMARY_ADMIN_EMAIL;
}

/** Vrátí jméno hlavního admina (fallback pro auditní log / UI). */
export function getAdminName(): string {
  return PRIMARY_ADMIN_NAME;
}
