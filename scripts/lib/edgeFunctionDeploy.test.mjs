// Token pro nasazení edge funkce — viz hlavička edgeFunctionDeploy.mjs,
// proč se čte i z prostředí, ne jen z .env.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { jePlatnySlug, nactiToken } from './edgeFunctionDeploy.mjs';

describe('jePlatnySlug', () => {
  it('přijme normální název funkce', () => {
    expect(jePlatnySlug('whatsapp-auto-parse')).toBe(true);
    expect(jePlatnySlug('posli_push')).toBe(true);
  });

  it('odmítne cestu ven ze složky a jiné nesmysly', () => {
    // Slug se skládá přímo do cesty k souboru
    // (supabase/functions/<slug>/index.ts) — bez tohohle síta by "../../.env"
    // nahrálo/přečetlo něco úplně jiného.
    expect(jePlatnySlug('../../.env')).toBe(false);
    expect(jePlatnySlug('..')).toBe(false);
    expect(jePlatnySlug('')).toBe(false);
    expect(jePlatnySlug('Velke-Pismeno')).toBe(false);
    expect(jePlatnySlug('má diakritiku')).toBe(false);
    expect(jePlatnySlug(null)).toBe(false);
    expect(jePlatnySlug(undefined)).toBe(false);
  });
});

describe('nactiToken', () => {
  const puvodni = { SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN, SB_TOKEN: process.env.SB_TOKEN };

  beforeEach(() => {
    delete process.env.SUPABASE_ACCESS_TOKEN;
    delete process.env.SB_TOKEN;
  });
  afterEach(() => {
    if (puvodni.SUPABASE_ACCESS_TOKEN === undefined) delete process.env.SUPABASE_ACCESS_TOKEN;
    else process.env.SUPABASE_ACCESS_TOKEN = puvodni.SUPABASE_ACCESS_TOKEN;
    if (puvodni.SB_TOKEN === undefined) delete process.env.SB_TOKEN;
    else process.env.SB_TOKEN = puvodni.SB_TOKEN;
  });

  it('přednost má prostředí (GitHub Actions secret) před .env', () => {
    process.env.SUPABASE_ACCESS_TOKEN = 'token-z-prostredi';
    expect(nactiToken()).toBe('token-z-prostredi');
  });

  it('SB_TOKEN funguje jako záložní jméno proměnné', () => {
    process.env.SB_TOKEN = 'druhy-token';
    expect(nactiToken()).toBe('druhy-token');
  });

  it('bez prostředí a bez .env (tenhle sandbox) vrátí null, ne pád', () => {
    expect(nactiToken()).toBeNull();
  });
});
