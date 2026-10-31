// 🗄️ bible-migrace: čisté pomocné funkce (testy: migrace.test.ts).
// ---------------------------------------------------------------------------
// SQL migrací se bere ze SOUBORU NASAZENÉ APLIKACE (/migrace-bible-sql.json,
// vzniká při buildu z bible/supabase/migrations). Appka posílá jen JMÉNO —
// kdyby posílala SQL, byla by funkce vzdáleně ovládaný spouštěč libovolného
// příkazu nad databází bible (stejná zásada jako pust-migraci v hlavním projektu).

/** Název migrace: čas + popis + .sql. Nic jiného se nestahuje ani nepouští. */
export const JMENO_MIGRACE = /^\d{14}_[A-Za-z0-9._-]+\.sql$/;

export const VYCHOZI_APP_URL = 'https://zajic-pivovar.pages.dev';

/** Odkud se stahuje SQL (secret APP_URL jen kdyby se měnila adresa appky). */
export function adresaSeznamuSql(appUrl: string | undefined, ted: number): string {
  const zaklad = (appUrl && /^https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9._/-]*)?$/.test(appUrl) ? appUrl : VYCHOZI_APP_URL).replace(/\/+$/, '');
  return `${zaklad}/migrace-bible-sql.json?t=${ted}`;
}

/** SQL dané migrace ze staženého seznamu, nebo null. */
export function sqlMigrace(seznam: unknown, nazev: string): string | null {
  if (!seznam || typeof seznam !== 'object') return null;
  const sql = (seznam as { sql?: unknown }).sql;
  if (!sql || typeof sql !== 'object') return null;
  const text = (sql as Record<string, unknown>)[nazev];
  return typeof text === 'string' && text.trim() ? text : null;
}

/**
 * SQL, které v jedné transakci migrace nejde pustit (nebo by transakci
 * ukončilo předčasně). Migrace bible se píšou tak, aby šly v jedné transakci;
 * tohle je pojistka, ať se polovina migrace nezapíše bez druhé.
 */
export function prekazkaTransakce(sql: string): string | null {
  const bezKomentaru = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (/\b(COMMIT|ROLLBACK)\s*;/i.test(bezKomentaru) || /^\s*BEGIN\s*;/im.test(bezKomentaru)) {
    return 'Migrace sama řídí transakci (BEGIN/COMMIT) — tady se pouští celá v jedné.';
  }
  if (/\bCONCURRENTLY\b/i.test(bezKomentaru)) return 'CREATE INDEX CONCURRENTLY nejde pustit v transakci.';
  if (/\bVACUUM\b/i.test(bezKomentaru)) return 'VACUUM nejde pustit v transakci.';
  return null;
}
