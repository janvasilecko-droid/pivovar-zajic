import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

let jeSladek = true;
vi.mock('../lib/profilAplikace', async (puvodni) => {
  const m = await puvodni<typeof import('../lib/profilAplikace')>();
  return { ...m, get JE_SLADEK() { return jeSladek; } };
});
vi.mock('../lib/auth', () => ({ useAuth: () => ({ signIn: vi.fn().mockResolvedValue({ error: null }) }) }));

import AuthScreen from './AuthScreen';

describe('přihlašovací obrazovka v samostatné aplikaci AI sládek', () => {
  it('řekne, že je to jiná aplikace s vlastním přihlášením', () => {
    jeSladek = true;
    render(<AuthScreen />);
    expect(screen.getByRole('note').textContent).toBe('AI sládek — samostatná aplikace, přihlášení zvlášť');
  });

  it('v hlavní aplikaci se žádný štítek neukazuje', () => {
    jeSladek = false;
    render(<AuthScreen />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
