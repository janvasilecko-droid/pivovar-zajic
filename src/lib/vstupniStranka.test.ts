import { describe, it, expect } from 'vitest';
import { zjistiStrankuZUrl, jeChecklistKonceZUrl } from './vstupniStranka';

const PLATNE = new Set(['orders', 'kegging', 'bottling', 'home']);

describe('zjistiStrankuZUrl', () => {
  it('přečte platnou stránku z ?page=', () => {
    expect(zjistiStrankuZUrl('?page=orders', PLATNE)).toBe('orders');
  });

  it('bez parametru vrátí null', () => {
    expect(zjistiStrankuZUrl('', PLATNE)).toBeNull();
  });

  it('neplatná/vymyšlená stránka se nepustí dál — jinak by shortcut/notifikace vedly na prázdno', () => {
    expect(zjistiStrankuZUrl('?page=neexistuje', PLATNE)).toBeNull();
  });

  it('funguje i vedle jiných parametrů v query stringu', () => {
    expect(zjistiStrankuZUrl('?utm_source=x&page=kegging', PLATNE)).toBe('kegging');
  });
});

// 🔔 Otevření rovnou na tabulce konce stáčení (připomínka v 16:00/18:00).
describe('jeChecklistKonceZUrl', () => {
  it('pozná adresu z připomínky', () => {
    expect(jeChecklistKonceZUrl('?page=bottling&checklist=konec')).toBe(true);
  });

  it('bez parametru nic neotevírá', () => {
    expect(jeChecklistKonceZUrl('?page=bottling')).toBe(false);
    expect(jeChecklistKonceZUrl('')).toBe(false);
  });

  it('jinou hodnotu ignoruje', () => {
    expect(jeChecklistKonceZUrl('?checklist=zacatek')).toBe(false);
  });
});
