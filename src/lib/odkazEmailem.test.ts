import { describe, it, expect, vi, beforeEach } from 'vitest';

const resetPasswordForEmail = vi.fn();
vi.mock('./supabase', () => ({ supabase: { auth: { resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a) } } }));

import { ODKAZ_ODESLAN, poslatOdkazProHeslo, srozumitelnaChybaOdeslani } from './odkazEmailem';

beforeEach(() => resetPasswordForEmail.mockReset());

describe('odkaz e-mailem', () => {
  it('pošle e-mail malými písmeny a vrací se do aplikace', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });
    expect(await poslatOdkazProHeslo('  Jan@Pivovar.CZ ')).toEqual({ error: null });
    expect(resetPasswordForEmail).toHaveBeenCalledWith('jan@pivovar.cz', { redirectTo: expect.stringMatching(/\/$/) });
  });

  it('chyby zjišťující, kdo je schválený, se nehlásí', async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'User not found' } });
    expect(await poslatOdkazProHeslo('x@y.cz')).toEqual({ error: null });
  });

  it('limit e-mailů a vadné SMTP se vysvětlí česky', () => {
    expect(srozumitelnaChybaOdeslani('email rate limit exceeded')).toContain('Počkej');
    expect(srozumitelnaChybaOdeslani('Error sending recovery email')).toContain('dočasné heslo');
  });

  it('text po odeslání neříká, zda je e-mail schválený', () => {
    expect(ODKAZ_ODESLAN).toMatch(/^Pokud je tenhle e-mail schválený/);
  });
});
