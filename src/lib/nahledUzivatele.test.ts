import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { jeNahled, profilNovehoUzivatele } from './nahledUzivatele';
import { getAdminEmail, isAdminEmail } from './config';

beforeEach(() => window.sessionStorage.clear());

describe('náhled „nový běžný uživatel“', () => {
  it('je vypnutý, dokud ho správce nezapne', () => {
    expect(jeNahled()).toBe(false);
    window.sessionStorage.setItem('zajic_nahled', '1');
    expect(jeNahled()).toBe(true);
  });

  it('profil je jako čerstvě založený běžný uživatel: role user, bez práv a bez vlastní plochy', () => {
    const p = profilNovehoUzivatele({ id: 'u1', display_name: 'Jan', role: 'admin', permissions: { orders: { view: false } }, home_layout: { pages: [['orders']] } });
    expect(p).toMatchObject({ id: 'u1', display_name: 'Jan', role: 'user', permissions: null, home_layout: {} });
  });

  it('správcovský e-mail se v náhledu tváří jako obyčejný (jinak by zůstaly admin dlaždice)', () => {
    const mail = getAdminEmail();
    expect(isAdminEmail(mail)).toBe(true);
    window.sessionStorage.setItem('zajic_nahled', '1');
    expect(isAdminEmail(mail)).toBe(false);
  });

  it('zápisy rozložení do profilu se v náhledu přeskočí a obrazovka a Nastavení jsou zapojené', () => {
    expect(readFileSync('src/lib/profileSync.ts', 'utf8')).toMatch(/if \(jeNahled\(\)\) return;/);
    expect(readFileSync('src/lib/auth.tsx', 'utf8')).toContain('profilNovehoUzivatele(profile)');
    expect(readFileSync('src/App.tsx', 'utf8')).toContain('<NahledBanner />');
    expect(readFileSync('src/screens/AppSettingsScreen.tsx', 'utf8')).toContain('Zobrazit jako nový běžný uživatel');
  });
});
