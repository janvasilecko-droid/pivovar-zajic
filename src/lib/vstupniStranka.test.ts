import { describe, it, expect } from 'vitest';
import { zjistiStrankuZUrl, jeChecklistKonceZUrl, jeClaudePripojeni, zjistiPodstrankuZUrl } from './vstupniStranka';

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

describe('odkaz na stránku knihy a schválení Claude', () => {
  it('podstránka z adresy jen z bezpečných znaků', () => {
    expect(zjistiPodstrankuZUrl('?page=bible&sub=kniha:11111111-2222-3333-4444-555555555555:170')).toBe('kniha:11111111-2222-3333-4444-555555555555:170');
    expect(zjistiPodstrankuZUrl('?page=bible&sub=<script>')).toBeNull();
    expect(zjistiPodstrankuZUrl('?page=bible')).toBeNull();
  });

  it('cesta schválení připojení Claude', () => {
    expect(jeClaudePripojeni('/claude-pripojeni')).toBe(true);
    expect(jeClaudePripojeni('/claude-pripojeni/')).toBe(true);
    expect(jeClaudePripojeni('/')).toBe(false);
  });
});
