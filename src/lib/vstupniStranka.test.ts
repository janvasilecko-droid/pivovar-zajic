import { describe, it, expect } from 'vitest';
import { zjistiStrankuZUrl } from './vstupniStranka';

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
