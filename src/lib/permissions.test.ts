import { describe, it, expect } from 'vitest';
import { PAGE_TO_MODULE, DEFAULT_FULL_PERMISSIONS, MODULE_DEFINITIONS, canUserEdit, canUserView } from './permissions';
import { NAV, EXTRA_NAV } from '../components/Layout';

describe('PAGE_TO_MODULE — mapa obrazovka → modul', () => {
  // Mapa dřív existovala TŘIKRÁT (Layout, AppSettings, HomeScreen) a kopie se
  // rozešly: "depozitar" v jedné chyběl úplně, a protože se chybějící klíč
  // vyhodnocuje jako "povoleno všem", zobrazoval se i lidem bez práv.
  // Tenhle test hlídá, aby se to nemohlo opakovat.
  it('každá položka menu má přiřazený modul', () => {
    const chybi = [...NAV, ...EXTRA_NAV]
      .map((n) => n.id)
      // Záměrně bez modulu (chybějící klíč = dostupné všem):
      //  • users    — řešeno zvlášť, jen admin
      //  • signout  — odhlášení, ne obrazovka
      //  • home     — úvodní plocha
      //  • stopwatch/timer/keg_timer — pomůcky (stopky, časovač, stočení sudu),
      //    nepracují s žádnými daty, takže je nemá smysl zamykat
      .filter((id) => !['users', 'signout', 'home', 'stopwatch', 'timer', 'keg_timer'].includes(id))
      .filter((id) => !PAGE_TO_MODULE[id]);
    expect(chybi).toEqual([]);
  });

  it('všechny použité moduly existují v definicích i ve výchozích právech', () => {
    const znameModuly = new Set(MODULE_DEFINITIONS.map((m) => m.id));
    for (const [page, modul] of Object.entries(PAGE_TO_MODULE)) {
      expect(znameModuly.has(modul), `modul "${modul}" (stránka ${page}) chybí v MODULE_DEFINITIONS`).toBe(true);
      expect(DEFAULT_FULL_PERMISSIONS[modul], `modul "${modul}" chybí ve výchozích právech`).toBeTruthy();
    }
  });
});

describe('canUserView / canUserEdit', () => {
  const uid = 'u1';
  const omezeny = { ...DEFAULT_FULL_PERMISSIONS, cellar: { view: false, edit: false } };

  it('respektuje odepřený modul u běžného uživatele', () => {
    expect(canUserView('user', uid, 'cellar', omezeny)).toBe(false);
    expect(canUserEdit('user', uid, 'cellar', omezeny)).toBe(false);
  });

  it('nechává povolené moduly přístupné', () => {
    expect(canUserView('user', uid, 'orders', omezeny)).toBe(true);
    expect(canUserEdit('user', uid, 'orders', omezeny)).toBe(true);
  });

  it('admin a vedení mají přístup i k odepřenému modulu', () => {
    for (const role of ['admin', 'sef', 'sladek']) {
      expect(canUserView(role, uid, 'cellar', omezeny), role).toBe(true);
      expect(canUserEdit(role, uid, 'cellar', omezeny), role).toBe(true);
    }
  });
});
