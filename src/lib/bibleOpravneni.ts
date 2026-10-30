// 🔐 Kdo smí do Pivovarské bible — zrcadlo databázové funkce bible_pristup()
// (migrace 20261231410000_pivovarska_bible_knihovna.sql).
// ---------------------------------------------------------------------------
// Na rozdíl od zbytku appky je to FAIL-CLOSED: knihy jsou soukromé a chráněné
// autorským právem (zadání 30. 10. 2026, bod 12). Bezpečnostní hranice je
// databáze (RLS); tady se jen rozhoduje, co appka ukáže — a musí to sedět,
// jinak by uživatel viděl dlaždici, za kterou nic nedostane. Test
// bibleOpravneni.test.ts hlídá, že se seznam rolí neliší od migrace.
//
//   admin / sef / sladek / boss / manager → 'spravuje' (nahrát, upravit, smazat)
//   permissions.bible = { view: true, edit: true } → 'prispiva' (číst + nahrávat)
//   permissions.bible = { view: true }             → 'cte'
//   cokoli jiného (chybí, false, nesmysl)          → null = bez přístupu

export type BibleRole = 'cte' | 'prispiva' | 'spravuje';

export const BIBLE_ROLE_SPRAVCE = ['admin', 'sef', 'sladek', 'boss', 'manager'] as const;

export function bibleRole(role: string | null | undefined, rawPermissions: unknown): BibleRole | null {
  const r = (role ?? '').toLowerCase().trim();
  if ((BIBLE_ROLE_SPRAVCE as readonly string[]).includes(r)) return 'spravuje';
  if (!rawPermissions || typeof rawPermissions !== 'object') return null;
  const bible = (rawPermissions as { bible?: unknown }).bible;
  if (!bible || typeof bible !== 'object' || Array.isArray(bible)) return null;
  const { view, edit } = bible as { view?: unknown; edit?: unknown };
  // Databáze porovnává text JSONu: projde jen opravdové true (nebo "true").
  const ano = (v: unknown) => v === true || v === 'true';
  if (!ano(view)) return null;
  return ano(edit) ? 'prispiva' : 'cte';
}

export const smiCist = (r: BibleRole | null): boolean => r !== null;
export const smiPrispivat = (r: BibleRole | null): boolean => r === 'prispiva' || r === 'spravuje';
export const smiSpravovat = (r: BibleRole | null): boolean => r === 'spravuje';
