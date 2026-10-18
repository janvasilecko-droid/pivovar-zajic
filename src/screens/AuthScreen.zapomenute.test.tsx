import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const poslat = vi.fn();
vi.mock('../lib/odkazEmailem', async (orig) => ({ ...(await orig<typeof import('../lib/odkazEmailem')>()), poslatOdkazProHeslo: (...a: unknown[]) => poslat(...a) }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ signIn: vi.fn().mockResolvedValue({ error: null }) }) }));

import AuthScreen from './AuthScreen';

beforeEach(() => poslat.mockReset());

describe('přihlašovací obrazovka: zapomenuté heslo / první přihlášení', () => {
  it('odkaz do e-mailu se pošle na zadaný e-mail a ukáže se neutrální potvrzení', async () => {
    poslat.mockResolvedValue({ error: null });
    render(<AuthScreen />);
    fireEvent.click(screen.getByText(/Zapomněl\(a\) jsem heslo/));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'novy@pivovar.cz' } });
    fireEvent.click(screen.getByText('Poslat odkaz do e-mailu'));
    await waitFor(() => expect(poslat).toHaveBeenCalledWith('novy@pivovar.cz'));
    expect((await screen.findByRole('status')).textContent).toMatch(/Pokud je tenhle e-mail schválený/);
  });

  it('chyba odeslání se ukáže a jde se vrátit na přihlášení', async () => {
    poslat.mockResolvedValue({ error: 'E-mail se už nedávno odesílal.' });
    render(<AuthScreen />);
    fireEvent.click(screen.getByText(/Zapomněl\(a\) jsem heslo/));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a@b.cz' } });
    fireEvent.click(screen.getByText('Poslat odkaz do e-mailu'));
    expect(await screen.findByText('E-mail se už nedávno odesílal.')).toBeTruthy();
    fireEvent.click(screen.getByText('Zpět na přihlášení'));
    expect(screen.getByText('Vstoupit do pivovaru')).toBeTruthy();
  });

  it('Google tlačítko není vidět, dokud ho majitel nezapne', () => {
    render(<AuthScreen />);
    expect(screen.queryByText('Přihlásit přes Google')).toBeNull();
  });
});
