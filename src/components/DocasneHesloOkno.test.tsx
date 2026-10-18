import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocasneHesloOkno } from './DocasneHesloOkno';

describe('DocasneHesloOkno', () => {
  it('ukáže heslo a e-mail, kopíruje zprávu s heslem a jde zavřít', async () => {
    const zapis = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: zapis } });
    const zavrit = vi.fn();
    render(<DocasneHesloOkno email="pojmmy86@gmail.com" heslo="Kx7mPq2Rtw" onClose={zavrit} />);
    expect(screen.getByTestId('docasne-heslo').textContent).toBe('Kx7mPq2Rtw');
    expect(screen.getAllByText(/pojmmy86@gmail.com/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText(/Kopírovat celou pozvánku/));
    await waitFor(() => expect(zapis).toHaveBeenCalled());
    expect(zapis.mock.calls[0][0]).toContain('Dočasné heslo: Kx7mPq2Rtw');

    fireEvent.click(screen.getByText('Zavřít'));
    expect(zavrit).toHaveBeenCalled();
  });

  it('„Kopírovat heslo“ zkopíruje jen heslo', async () => {
    const zapis = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: zapis } });
    render(<DocasneHesloOkno email="a@b.cz" heslo="Kx7mPq2Rtw" onClose={() => {}} />);
    fireEvent.click(screen.getByText('Kopírovat heslo'));
    await waitFor(() => expect(zapis).toHaveBeenCalledWith('Kx7mPq2Rtw'));
  });

  it('e-mail nese pozvánku, odkaz na návod a dočasné heslo', () => {
    render(<DocasneHesloOkno email="a@b.cz" heslo="Kx7mPq2Rtw" onClose={() => {}} />);
    const a = screen.getByText(/Poslat e-mailem/).closest('a') as HTMLAnchorElement;
    expect(a.href.startsWith('mailto:a%40b.cz?')).toBe(true);
    const tělo = decodeURIComponent(a.href);
    expect(tělo).toContain('Kx7mPq2Rtw');
    expect(tělo).toContain('Začínáme');
    expect(tělo).toContain('Google Play');
  });
});
