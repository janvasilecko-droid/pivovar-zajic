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

describe('ověření e-mailu před odesláním odkazu', () => {
  it('funkce auth-auto-login umí „overit“ a vrací jen ano/ne ze seznamu schválených', () => {
    const f = readFileSync('supabase/functions/auth-auto-login/index.ts', 'utf8');
    expect(f).toContain('body?.overit === true');
    expect(f).toMatch(/radek\?\.status === "approved"/);
    // ověření je až za omezením počtu dotazů
    expect(f.indexOf('consume_edge_rate_limit')).toBeLessThan(f.indexOf('if (jenOverit)'));
  });
});

describe('šablony e-mailů pro Supabase', () => {
  it('Uživatelé → Schválené e-maily nabízí zkopírování šablony pozvánky i „zapomenuté heslo“', () => {
    const z = readFileSync('src/screens/Users.tsx', 'utf8');
    expect(z).toContain("kopirujSablonu('pozvanka')");
    expect(z).toContain("kopirujSablonu('obnova')");
    expect(z).toContain('auth/templates');
  });
});

describe('Šrotování sladu je pryč', () => {
  it('v aplikaci po něm nezbyla obrazovka, dlaždice ani právo (data v databázi zůstávají)', () => {
    for (const cesta of ['src/App.tsx', 'src/screens/HomeScreen.tsx', 'src/components/Layout.tsx', 'src/lib/permissions.ts', 'src/lib/homeLayout.ts', 'src/screens/BreweryScreens.tsx']) {
      expect(readFileSync(cesta, 'utf8'), cesta).not.toMatch(/srotovani|SrotovaniScreen/);
    }
  });
});

describe('šablony e-mailů se do Supabase posílají z nasazení', () => {
  it('skript nese předmět i tělo pozvánky a zapomenutého hesla a workflow ho spouští bez rizika pro nasazení', () => {
    const skript = readFileSync('scripts/nastav-emailove-sablony.mts', 'utf8');
    for (const klic of ['mailer_subjects_invite', 'mailer_templates_invite_content', 'mailer_subjects_recovery', 'mailer_templates_recovery_content']) {
      expect(skript, klic).toContain(klic);
    }
    expect(skript).toContain('SUPABASE_ACCESS_TOKEN');
    const wf = readFileSync('.github/workflows/deploy.yml', 'utf8');
    const blok = wf.slice(wf.indexOf('Šablony e-mailů Supabase'));
    expect(blok).toContain('continue-on-error: true');
    expect(blok).toContain('scripts/nastav-emailove-sablony.mts');
    // běží až po nasazení webu
    expect(wf.indexOf('wrangler pages deploy')).toBeLessThan(wf.indexOf('Šablony e-mailů Supabase'));
  });
});
