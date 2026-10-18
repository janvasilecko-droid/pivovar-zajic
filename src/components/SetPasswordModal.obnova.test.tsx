import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let ctx: Record<string, unknown> = {};
vi.mock('../lib/auth', () => ({ useAuth: () => ctx }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { SetPasswordModal } from './SetPasswordModal';

describe('SetPasswordModal', () => {
  it('po odkazu „zapomenuté heslo“ se ukáže, i když profil heslo už má', () => {
    ctx = { user: { id: 'u1' }, profile: { password_set: true }, musiNastavitHeslo: true, reloadProfile: vi.fn(), hesloNastaveno: vi.fn() };
    render(<SetPasswordModal />);
    expect(screen.getByText('Založte si své heslo')).toBeTruthy();
  });

  it('po pozvánce (heslo ještě nezaložené) se ukáže taky', () => {
    ctx = { user: { id: 'u1' }, profile: { password_set: false }, musiNastavitHeslo: false, reloadProfile: vi.fn(), hesloNastaveno: vi.fn() };
    render(<SetPasswordModal />);
    expect(screen.getByText('Založte si své heslo')).toBeTruthy();
  });

  it('běžně přihlášenému se neukáže', () => {
    ctx = { user: { id: 'u1' }, profile: { password_set: true }, musiNastavitHeslo: false, reloadProfile: vi.fn(), hesloNastaveno: vi.fn() };
    const { container } = render(<SetPasswordModal />);
    expect(container.textContent).toBe('');
  });
});
