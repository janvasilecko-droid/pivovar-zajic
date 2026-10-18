import { describe, it, expect, vi, beforeEach } from 'vitest';

const signInWithOAuth = vi.fn();
const linkIdentity = vi.fn();
vi.mock('./supabase', () => ({ supabase: { auth: { signInWithOAuth: (...a: unknown[]) => signInWithOAuth(...a), linkIdentity: (...a: unknown[]) => linkIdentity(...a) } } }));

import { chybaZNavratu, maGoogle, prihlasitPresGoogle, propojitSGoogle } from './googlePrihlaseni';

beforeEach(() => { signInWithOAuth.mockReset(); linkIdentity.mockReset(); });

describe('Google přihlášení', () => {
  it('přihlášení pošle poskytovatele google a návrat na adresu aplikace', async () => {
    signInWithOAuth.mockResolvedValue({ error: null });
    expect(await prihlasitPresGoogle()).toEqual({ error: null });
    const arg = signInWithOAuth.mock.calls[0][0];
    expect(arg.provider).toBe('google');
    expect(arg.options.redirectTo).toMatch(/\/$/);
  });

  it('vypnutého poskytovatele vysvětlí česky', async () => {
    signInWithOAuth.mockResolvedValue({ error: { message: 'Unsupported provider: provider is not enabled' } });
    expect((await prihlasitPresGoogle()).error).toContain('Providers → Google');
  });

  it('propojení volá linkIdentity a vypnuté propojení vysvětlí', async () => {
    linkIdentity.mockResolvedValue({ error: { message: 'Manual linking is disabled' } });
    const r = await propojitSGoogle();
    expect(linkIdentity.mock.calls[0][0].provider).toBe('google');
    expect(r.error).toContain('manual linking');
  });

  it('pozná připojený Google', () => {
    expect(maGoogle({ identities: [{ provider: 'email' }, { provider: 'google' }] } as never)).toBe(true);
    expect(maGoogle({ identities: [{ provider: 'email' }] } as never)).toBe(false);
    expect(maGoogle(null)).toBe(false);
  });

  it('návrat s chybou neschváleného účtu řekne, co dělat; bez chyby je prázdný', () => {
    expect(chybaZNavratu({ search: '', hash: '' })).toBeNull();
    const e = chybaZNavratu({ search: '?error=server_error&error_description=Database+error+saving+new+user', hash: '' });
    expect(e).toContain('není schválený');
    expect(chybaZNavratu({ search: '', hash: '#error=access_denied&error_description=x' })).toContain('není schválený');
  });
});
