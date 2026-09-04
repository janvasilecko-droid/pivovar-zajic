/**
 * 🛡️ Předvolba role nesmí na žádný modul zapomenout.
 *
 * Klíč, který v oprávněních CHYBÍ, se vyhodnocuje jako POVOLENO
 * (`perms[module]?.view ?? true` v canUserView) — to je záměr kvůli
 * zpětné kompatibilitě, ale znamená to, že zapomenutý modul v předvolbě
 * roli TIŠE ROZŠÍŘÍ. Řidič by tak po přidání nového modulu dostal přístup,
 * o kterém nikdo neví.
 *
 * Kvůli tomu tenhle test existuje: až někdo přidá do `ModuleKey` další
 * modul, spadne to tady — ne až v provozu.
 */
import { describe, it, expect } from 'vitest';
import {
  PRESET_ROLES, DEFAULT_FULL_PERMISSIONS, MODULE_DEFINITIONS,
  canUserView, canUserEdit, type ModuleKey,
} from './permissions';

/** Všechny moduly, které aplikace zná. */
const VSECHNY_MODULY = Object.keys(DEFAULT_FULL_PERMISSIONS) as ModuleKey[];

describe('předvolby rolí', () => {
  it('každá předvolba pokrývá VŠECHNY moduly', () => {
    const chyby: string[] = [];
    for (const preset of PRESET_ROLES) {
      for (const modul of VSECHNY_MODULY) {
        if (!(modul in preset.permissions)) {
          chyby.push(`${preset.name} → chybí modul „${modul}" (chybějící klíč = POVOLENO)`);
        }
      }
    }
    expect(chyby).toEqual([]);
  });

  it('žádná předvolba nemá modul, který aplikace nezná', () => {
    // Přejmenovaný modul by v předvolbě zůstal ležet a tvářil se, že něco
    // omezuje.
    const zname = new Set<string>(VSECHNY_MODULY);
    const navic: string[] = [];
    for (const preset of PRESET_ROLES) {
      for (const klic of Object.keys(preset.permissions)) {
        if (!zname.has(klic)) navic.push(`${preset.name} → neznámý modul „${klic}"`);
      }
    }
    expect(navic).toEqual([]);
  });

  it('MODULE_DEFINITIONS (co se ukazuje v Uživatelích) zná všechny moduly', () => {
    // Modul bez definice se v nastavení práv vůbec nezobrazí, takže se
    // nedá nastavit — a zůstane povolený.
    const vDefinicich = new Set(MODULE_DEFINITIONS.map((m) => m.id));
    const chybejici = VSECHNY_MODULY.filter((m) => !vDefinicich.has(m));
    expect(chybejici).toEqual([]);
  });

  it('nikdo nesmí mít právo editovat, když nemá právo vidět', () => {
    // „Nevidí, ale může měnit" není smysluplný stav a v UI se nedá nastavit;
    // v předvolbě by to byl překlep, který nikoho neupozorní.
    const nesmysly: string[] = [];
    for (const preset of PRESET_ROLES) {
      for (const [modul, pravo] of Object.entries(preset.permissions)) {
        if (pravo.edit && !pravo.view) nesmysly.push(`${preset.name} → ${modul}`);
      }
    }
    expect(nesmysly).toEqual([]);
  });

  it('řidič nevidí sklep, stáčení ani inventuru, ale zapisuje závoz', () => {
    const ridic = PRESET_ROLES.find((p) => p.name.startsWith('Řidič'));
    expect(ridic, 'předvolba Řidič musí existovat').toBeTruthy();
    const perms = ridic!.permissions;
    expect(perms.zavoz).toEqual({ view: true, edit: true });
    expect(perms.kniha_jizd).toEqual({ view: true, edit: true });
    expect(perms.cellar.view).toBe(false);
    expect(perms.kegging.view).toBe(false);
    expect(perms.inventory.view).toBe(false);
    expect(perms.app_settings.view).toBe(false);
    // Objednávky vidí (co veze), ale nezakládá.
    expect(perms.orders).toEqual({ view: true, edit: false });
  });

  it('předvolba se opravdu prosadí přes canUserView/canUserEdit', () => {
    // Test skládá stejnou cestou, jakou se rozhoduje aplikace — samotná
    // tabulka práv nic negarantuje, kdyby ji vyhodnocení obcházelo.
    const ridic = PRESET_ROLES.find((p) => p.name.startsWith('Řidič'))!.permissions;
    expect(canUserView('stacec', 'u1', 'zavoz', ridic)).toBe(true);
    expect(canUserView('stacec', 'u1', 'cellar', ridic)).toBe(false);
    expect(canUserEdit('stacec', 'u1', 'orders', ridic)).toBe(false);
    // Admin projde vždy — role bije nastavení modulů.
    expect(canUserView('admin', 'u1', 'cellar', ridic)).toBe(true);
  });
});
