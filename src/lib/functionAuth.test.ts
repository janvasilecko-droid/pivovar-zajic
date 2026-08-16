import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession } },
}));

describe('authenticatedFunctionHeaders', () => {
  beforeEach(() => getSession.mockReset());

  it('uses the signed-in user token as Authorization', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 'user-access-token' } },
      error: null,
    });
    const { authenticatedFunctionHeaders } = await import('./functionAuth');

    const headers = await authenticatedFunctionHeaders();

    expect(headers.Authorization).toBe('Bearer user-access-token');
  });

  it('fails closed when there is no current session', async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { authenticatedFunctionHeaders } = await import('./functionAuth');

    await expect(authenticatedFunctionHeaders()).rejects.toThrow(/Přihlášení vypršelo/);
  });
});
