import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const resetPasswordForEmail = vi.fn();
vi.mock('./supabase', () => ({ supabase: { auth: { resetPasswordForEmail: (...a: unknown[]) => resetPasswordForEmail(...a) } } }));

import { NENI_OVERENY, odkazOdeslanNa, poslatOdkazProHeslo, srozumitelnaChybaOdeslani } from './odkazEmailem';

const fetchMock = vi.fn();
beforeEach(() => { resetPasswordForEmail.mockReset(); fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

const overeni = (schvaleny: boolean) => fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, schvaleny }) });

describe('odkaz e-mailem', () => {
  it('schválený e-mail: pošle odkaz (malými písmeny, návrat do aplikace) a vrátí adresu', async () => {
    overeni(true);
    resetPasswordForEmail.mockResolvedValue({ error: null });
    expect(await poslatOdkazProHeslo('  Jan@Pivovar.CZ ')).toEqual({ stav: 'odeslano', email: 'jan@pivovar.cz' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: 'jan@pivovar.cz', overit: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith('jan@pivovar.cz', { redirectTo: expect.stringMatching(/\/$/) });
  });

  it('neschválený e-mail: nic se neposílá a řekne se to', async () => {
    overeni(false);
    expect(await poslatOdkazProHeslo('uzivatel@example.com')).toEqual({ stav: 'neschvaleny' });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(NENI_OVERENY).toContain('Kontaktujte administrátora');
  });

  it('ověření selhalo (síť / server): chyba, nic se neposílá', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const r = await poslatOdkazProHeslo('a@b.cz');
    expect(r.stav).toBe('chyba');
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    expect((await poslatOdkazProHeslo('a@b.cz')).stav).toBe('chyba');
  });

  it('e-mail se neodeslal (limit / SMTP): srozumitelná chyba', async () => {
    overeni(true);
    resetPasswordForEmail.mockResolvedValue({ error: { message: 'email rate limit exceeded' } });
    const r = await poslatOdkazProHeslo('a@b.cz');
    expect(r.stav === 'chyba' && r.zprava).toContain('Počkej');
  });

  it('texty', () => {
    expect(odkazOdeslanNa('a@b.cz')).toContain('Odkaz byl odeslán na a@b.cz');
    expect(srozumitelnaChybaOdeslani('Error sending recovery email')).toContain('dočasné heslo');
  });
});
