import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
const setSession = vi.fn();
const signInWithPassword = vi.fn();
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: (...a: unknown[]) => getSession(...a), setSession: (...a: unknown[]) => setSession(...a) } } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword: (...a: unknown[]) => signInWithPassword(...a) } }) }));

import { jePrepnutyUcet, nactiUcty, odeberUcet, pridejUcet, prepniNaUcet } from './prepinaniUctu';

const SPRAVCE = { user: { id: 'a', email: 'admin@pivovar.cz' }, access_token: 'a1', refresh_token: 'r1' };

beforeEach(() => {
  window.localStorage.clear();
  getSession.mockReset(); setSession.mockReset(); signInWithPassword.mockReset();
  getSession.mockResolvedValue({ data: { session: SPRAVCE } });
});

describe('přepínání účtů (správce)', () => {
  it('přidání: ověří e-mail a heslo, uloží tokeny druhého účtu i správce jako domácí; heslo se neukládá', async () => {
    signInWithPassword.mockResolvedValue({ data: { session: { user: { id: 'b', email: 'user@pivovar.cz' }, access_token: 'b1', refresh_token: 'r2' } }, error: null });
    expect(await pridejUcet('  user@pivovar.cz ', 'tajne123')).toEqual({ error: null });
    const s = nactiUcty();
    expect(s.domaci).toBe('a');
    expect(s.ucty.a).toMatchObject({ email: 'admin@pivovar.cz', refresh_token: 'r1' });
    expect(s.ucty.b).toMatchObject({ email: 'user@pivovar.cz', access_token: 'b1', refresh_token: 'r2' });
    expect(window.localStorage.getItem('zajic_ucty_v1')).not.toContain('tajne123');
  });

  it('špatné heslo: srozumitelná chyba, nic se nepřidá', async () => {
    signInWithPassword.mockResolvedValue({ data: { session: null }, error: { message: 'Invalid login credentials' } });
    expect((await pridejUcet('x@y.cz', 'zle')).error).toBe('Špatný e-mail nebo heslo.');
    expect(Object.keys(nactiUcty().ucty)).toEqual(['a']);
  });

  it('nepřihlášený nic nepřidá', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    expect((await pridejUcet('x@y.cz', 'h')).error).toBe('Nejsi přihlášený.');
  });

  it('přepnutí: zapamatuje současný účet a nastaví uložené přihlášení cíle', async () => {
    window.localStorage.setItem('zajic_ucty_v1', JSON.stringify({ domaci: 'a', ucty: { b: { email: 'user@pivovar.cz', access_token: 'b1', refresh_token: 'r2' } } }));
    setSession.mockResolvedValue({ error: null });
    expect(await prepniNaUcet('b')).toEqual({ error: null });
    expect(setSession).toHaveBeenCalledWith({ access_token: 'b1', refresh_token: 'r2' });
    expect(nactiUcty().ucty.a).toMatchObject({ refresh_token: 'r1' }); // správce zůstal uložený
  });

  it('vypršelé přihlášení cíle: účet se z přepínače vyřadí a řekne se, že je třeba ho přidat znovu', async () => {
    window.localStorage.setItem('zajic_ucty_v1', JSON.stringify({ domaci: 'a', ucty: { b: { email: 'user@pivovar.cz', access_token: 'x', refresh_token: 'y' } } }));
    setSession.mockResolvedValue({ error: { message: 'Invalid Refresh Token' } });
    const r = await prepniNaUcet('b');
    expect(r.error).toContain('vypršelo');
    expect(nactiUcty().ucty.b).toBeUndefined();
  });

  it('neznámý účet se nepřepne', async () => {
    expect((await prepniNaUcet('neexistuje')).error).toBe('Tenhle účet v přepínači není.');
    expect(setSession).not.toHaveBeenCalled();
  });

  it('„Zpět na správce“ je jen když jsi na jiném účtu než domácím', () => {
    window.localStorage.setItem('zajic_ucty_v1', JSON.stringify({ domaci: 'a', ucty: { a: { email: 'admin', access_token: 'a', refresh_token: 'a' }, b: { email: 'user', access_token: 'b', refresh_token: 'b' } } }));
    expect(jePrepnutyUcet('a')).toBe(false);
    expect(jePrepnutyUcet('b')).toBe(true);
    expect(jePrepnutyUcet(null)).toBe(false);
  });

  it('odebrání účtu ho vyřadí', () => {
    window.localStorage.setItem('zajic_ucty_v1', JSON.stringify({ domaci: 'a', ucty: { b: { email: 'user', access_token: 'b', refresh_token: 'b' } } }));
    odeberUcet('b');
    expect(nactiUcty().ucty.b).toBeUndefined();
  });
});
