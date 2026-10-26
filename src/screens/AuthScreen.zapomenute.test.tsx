import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const poslat = vi.fn();
vi.mock('../lib/odkazEmailem', async (orig) => ({ ...(await orig<typeof import('../lib/odkazEmailem')>()), poslatOdkazProHeslo: (...a: unknown[]) => poslat(...a) }));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ signIn: vi.fn().mockResolvedValue({ error: null }) }) }));

import AuthScreen from './AuthScreen';

beforeEach(() => poslat.mockReset());

describe('přihlašovací obrazovka: zapomenuté heslo / první přihlášení', () => {
  it('odkaz do e-mailu se pošle na zadaný e-mail a ukáže se neutrální potvrzení', async () => {
    poslat.mockResolvedValue({ stav: 'odeslano', email: 'novy@pivovar.cz' });
    render(<AuthScreen />);
    fireEvent.click(screen.getByText('Zapomněl(a) jsem heslo'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'novy@pivovar.cz' } });
    fireEvent.click(screen.getByText('Poslat odkaz do e-mailu'));
    await waitFor(() => expect(poslat).toHaveBeenCalledWith('novy@pivovar.cz'));
    expect((await screen.findByRole('status')).textContent).toContain('Odkaz byl odeslán na novy@pivovar.cz');
  });

  it('chyba odeslání se ukáže a jde se vrátit na přihlášení', async () => {
    poslat.mockResolvedValue({ stav: 'chyba', zprava: 'E-mail se už nedávno odesílal.' });
    render(<AuthScreen />);
    fireEvent.click(screen.getByText('Zapomněl(a) jsem heslo'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a@b.cz' } });
    fireEvent.click(screen.getByText('Poslat odkaz do e-mailu'));
    expect(await screen.findByText('E-mail se už nedávno odesílal.')).toBeTruthy();
    fireEvent.click(screen.getByText('Zpět na přihlášení'));
    expect(screen.getByText('Vstoupit do pivovaru')).toBeTruthy();
  });

  it('neschválený e-mail: napíše, že není ověřený, a nic neodešle', async () => {
    poslat.mockResolvedValue({ stav: 'neschvaleny' });
    render(<AuthScreen />);
    fireEvent.click(screen.getByText('Zapomněl(a) jsem heslo'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'uzivatel@example.com' } });
    fireEvent.click(screen.getByText('Poslat odkaz do e-mailu'));
    expect(await screen.findByText(/Tento e-mail není ověřený\. Kontaktujte administrátora/)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('„Nový uživatel“ je samostatné tlačítko se svým textem a pošle odkaz stejně', async () => {
    poslat.mockResolvedValue({ stav: 'odeslano', email: 'novy@pivovar.cz' });
    render(<AuthScreen />);
    fireEvent.click(screen.getByText('Nový uživatel'));
    expect(screen.getByText(/e-mail, který ti správce schválil/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'novy@pivovar.cz' } });
    fireEvent.click(screen.getByText('Poslat odkaz do e-mailu'));
    await waitFor(() => expect(poslat).toHaveBeenCalledWith('novy@pivovar.cz'));
  });

  it('zastaralý text o dočasném heslu od administrátora tam není', () => {
    render(<AuthScreen />);
    expect(document.body.textContent).not.toMatch(/dočasné heslo/i);
  });

  it('Google tlačítko není vidět, dokud ho majitel nezapne', () => {
    render(<AuthScreen />);
    expect(screen.queryByText('Přihlásit přes Google')).toBeNull();
  });
});

describe('přihlašovací obrazovka v Zajíc 2', () => {
  it('ukáže červený štítek, ať je vidět, že běží druhá aplikace', async () => {
    vi.resetModules();
    vi.doMock('../lib/profilAplikace', async (orig) => ({ ...(await orig<typeof import('../lib/profilAplikace')>()), JE_DRUHA_APLIKACE: true }));
    const { default: Obrazovka } = await import('./AuthScreen');
    render(<Obrazovka />);
    expect(screen.getByRole('note').textContent).toContain('Zajíc 2');
    vi.doUnmock('../lib/profilAplikace');
  });
});
