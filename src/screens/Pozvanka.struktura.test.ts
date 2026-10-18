import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Pozvánka a instalace jsou „lepidlo" mezi obrazovkami — hlídáme, že zůstaly zapojené.
describe('pozvánka a instalace na plochu', () => {
  it('schválené e-maily mají „Pozvánka e-mailem" (mailto) a kopírování textu', () => {
    const z = readFileSync('src/screens/Users.tsx', 'utf8');
    expect(z).toMatch(/href=\{mailtoPozvanky\(e\.email\)\}/);
    expect(z).toContain('Pozvánka e-mailem');
    expect(z).toMatch(/textPozvanky\(\)/);
  });

  it('Nastavení ukazuje instalaci nad návodem a používá společné kroky', () => {
    const z = readFileSync('src/screens/AppSettingsScreen.tsx', 'utf8');
    expect(z).toContain('<InstalaceKroky');
    expect(z.indexOf('Instalace aplikace')).toBeLessThan(z.indexOf('Návod k použití & Přehled funkcí'));
  });

  it('okno instalace z horní lišty používá tytéž kroky', () => {
    expect(readFileSync('src/components/Layout.tsx', 'utf8')).toContain('<InstalaceKroky');
  });
});

describe('dočasné heslo', () => {
  it('Uživatelé mají „Nové dočasné heslo“ a heslo po schválení zůstane v okně', () => {
    const z = readFileSync('src/screens/Users.tsx', 'utf8');
    expect(z).toContain('Nové dočasné heslo');
    expect(z).toContain('manage-users/reset-temp');
    expect(z).toMatch(/setDocasne\(\{ email, heslo: j\.tempPassword \}\)/);
  });

  it('funkce reset-temp je jen pro schválené e-maily a vrací účet do „heslo ještě nezaloženo“', () => {
    const f = readFileSync('supabase/functions/manage-users/index.ts', 'utf8');
    const blok = f.slice(f.indexOf('path === "reset-temp"'), f.indexOf('// Úprava uživatele'));
    expect(blok).toContain('status !== "approved"');
    expect(blok).toContain('password_set: false');
    expect(blok).toContain('generateTempPassword()');
  });
});

describe('pozvánka a zapomenuté heslo odkazem z e-mailu', () => {
  it('schválení nejdřív zkusí pozvánku e-mailem a teprve při selhání založí účet s dočasným heslem', () => {
    const f = readFileSync('supabase/functions/manage-users/index.ts', 'utf8');
    const blok = f.slice(f.indexOf('path === "approve"'), f.indexOf('path === "reset-temp"'));
    expect(blok.indexOf('inviteUserByEmail')).toBeGreaterThan(-1);
    expect(blok.indexOf('inviteUserByEmail')).toBeLessThan(blok.indexOf('generateTempPassword()'));
    expect(blok).toContain('invited');
    expect(blok).toContain('emailError');
    expect(blok).toMatch(/password_set: false/);
  });

  it('aplikace reaguje na odkaz z e-mailu (PASSWORD_RECOVERY) a ukáže okno s heslem', () => {
    expect(readFileSync('src/lib/auth.tsx', 'utf8')).toContain("e === 'PASSWORD_RECOVERY'");
    expect(readFileSync('src/App.tsx', 'utf8')).toContain('<SetPasswordModal />');
  });

  it('Uživatelé mají „Znovu poslat pozvánku“', () => {
    expect(readFileSync('src/screens/Users.tsx', 'utf8')).toContain('Znovu poslat pozvánku');
  });
});
