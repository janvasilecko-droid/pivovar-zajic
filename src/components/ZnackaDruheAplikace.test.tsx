import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../lib/auth', () => ({ useAuth: () => ({ user: { email: 'test@pivovar.cz' }, profile: { role: 'user' } }) }));
import { ZnackaDruheAplikace } from './ZnackaDruheAplikace';

describe('ZnackaDruheAplikace', () => {
  it('řekne, že jsi v Zajíc 2, pod jakým účtem a s jakou rolí', () => {
    render(<ZnackaDruheAplikace />);
    expect(screen.getByRole('note').textContent).toBe('Zajíc 2 · test@pivovar.cz · běžný uživatel');
  });
});
