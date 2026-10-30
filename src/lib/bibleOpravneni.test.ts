import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BIBLE_ROLE_SPRAVCE, bibleRole, smiCist, smiPrispivat, smiSpravovat } from './bibleOpravneni';
import { canUserView, getUserPermissions } from './permissions';

const MIGRACE = readFileSync('supabase/migrations/20261231410000_pivovarska_bible_knihovna.sql', 'utf8');

describe('přístup do Pivovarské bible (fail-closed)', () => {
  it('správci (admin, šéf, sládek, boss, manažer) spravují bez ohledu na práva', () => {
    for (const r of ['admin', 'sef', 'sladek', 'boss', 'manager', ' Admin ']) {
      expect(bibleRole(r, undefined), r).toBe('spravuje');
    }
  });

  it('běžný uživatel bez výslovného povolení nemá přístup — ani když práva chybí nebo jsou divná', () => {
    expect(bibleRole('user', undefined)).toBeNull();
    expect(bibleRole('user', null)).toBeNull();
    expect(bibleRole('user', {})).toBeNull();
    expect(bibleRole('user', { dashboard: { view: true, edit: true } })).toBeNull();
    expect(bibleRole('user', { bible: true })).toBeNull();
    expect(bibleRole('user', { bible: [true] })).toBeNull();
    expect(bibleRole('user', { bible: { view: 1 } })).toBeNull();
    expect(bibleRole('user', { bible: { view: false, edit: true } })).toBeNull();
    expect(bibleRole(undefined, { bible: { edit: true } })).toBeNull();
  });

  it('povolený modul: vidět = číst, vidět + upravovat = i nahrávat', () => {
    expect(bibleRole('user', { bible: { view: true, edit: false } })).toBe('cte');
    expect(bibleRole('user', { bible: { view: true } })).toBe('cte');
    expect(bibleRole('user', { bible: { view: true, edit: true } })).toBe('prispiva');
    expect(bibleRole('user', { bible: { view: 'true', edit: 'true' } })).toBe('prispiva');
  });

  it('co smí která role', () => {
    expect([smiCist(null), smiPrispivat(null), smiSpravovat(null)]).toEqual([false, false, false]);
    expect([smiCist('cte'), smiPrispivat('cte'), smiSpravovat('cte')]).toEqual([true, false, false]);
    expect([smiCist('prispiva'), smiPrispivat('prispiva'), smiSpravovat('prispiva')]).toEqual([true, true, false]);
    expect([smiCist('spravuje'), smiPrispivat('spravuje'), smiSpravovat('spravuje')]).toEqual([true, true, true]);
  });

  it('seznam správcovských rolí je stejný jako v databázové funkci bible_pristup()', () => {
    const m = MIGRACE.match(/v_role IN \(([^)]*)\)\s*THEN\s*RETURN 'spravuje'/);
    expect(m, 'migrace musí mít v_role IN (...) THEN RETURN \'spravuje\'').toBeTruthy();
    const vDb = [...m![1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort();
    expect(vDb).toEqual([...BIBLE_ROLE_SPRAVCE].sort());
  });

  it('databáze bere jen opravdové true u view i edit a při chybě vrací „bez přístupu"', () => {
    expect(MIGRACE).toMatch(/\(v_perm -> 'bible' ->> 'view'\) = 'true'/);
    expect(MIGRACE).toMatch(/\(v_perm -> 'bible' ->> 'edit'\) = 'true'/);
    expect(MIGRACE).toMatch(/EXCEPTION WHEN OTHERS THEN\s*RETURN NULL;/);
    expect(MIGRACE).toMatch(/IF auth\.uid\(\) IS NULL THEN\s*RETURN NULL;/);
  });

  it('dlaždici v appce vidí stejní lidé, kterým databáze data pustí', () => {
    // Uživatel, který modul v uložených právech nemá, ho nevidí (ostatní
    // chybějící moduly se pořád berou jako povolené — zpětná kompatibilita).
    const bezBible = getUserPermissions('u1', { dashboard: { view: true, edit: true } });
    expect(canUserView('user', 'u1', 'bible', bezBible)).toBe(false);
    expect(canUserView('user', 'u1', 'cellar', bezBible)).toBe(true);
    const sBibli = getUserPermissions('u1', { bible: { view: true, edit: false } });
    expect(canUserView('user', 'u1', 'bible', sBibli)).toBe(true);
    expect(canUserView('admin', 'u1', 'bible', bezBible)).toBe(true);
  });

  it('bez uložených práv (ani v telefonu) bible zůstává zavřená', () => {
    window.localStorage.removeItem('user_permissions_nikdo');
    expect(getUserPermissions('nikdo').bible).toEqual({ view: false, edit: false });
  });
});
