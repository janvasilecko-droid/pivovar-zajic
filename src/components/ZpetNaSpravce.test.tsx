import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

let uzivatel: { id: string; email: string } | null = { id: 'b', email: 'user@pivovar.cz' };
vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: uzivatel, profile: { role: 'user' } }) }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: {} } }));

import { ZpetNaSpravce } from './ZpetNaSpravce';

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('zajic_ucty_v1', JSON.stringify({ domaci: 'a', ucty: { a: { email: 'admin@pivovar.cz', access_token: 'a', refresh_token: 'a' }, b: { email: 'user@pivovar.cz', access_token: 'b', refresh_token: 'b' } } }));
});

describe('ZpetNaSpravce', () => {
  it('na jiném účtu než správcovském ukáže, kdo jsi, a nabídne návrat', () => {
    uzivatel = { id: 'b', email: 'user@pivovar.cz' };
    render(<ZpetNaSpravce />);
    expect(screen.getByRole('note').textContent).toContain('user@pivovar.cz');
    expect(screen.getByText('Zpět na správce (admin@pivovar.cz)')).toBeTruthy();
  });

  it('na správcovském účtu se nic neukáže', () => {
    uzivatel = { id: 'a', email: 'admin@pivovar.cz' };
    const { container } = render(<ZpetNaSpravce />);
    expect(container.textContent).toBe('');
  });
});
