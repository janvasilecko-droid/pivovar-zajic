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

    fireEvent.click(screen.getByText(/Kopírovat zprávu s heslem/));
    await waitFor(() => expect(zapis).toHaveBeenCalled());
    expect(zapis.mock.calls[0][0]).toContain('Dočasné heslo: Kx7mPq2Rtw');

    fireEvent.click(screen.getByText('Zavřít'));
    expect(zavrit).toHaveBeenCalled();
  });

  it('pozvánka e-mailem je mailto bez hesla', () => {
    render(<DocasneHesloOkno email="a@b.cz" heslo="Kx7mPq2Rtw" onClose={() => {}} />);
    const a = screen.getByText(/Pozvánka e-mailem/).closest('a') as HTMLAnchorElement;
    expect(a.href.startsWith('mailto:a%40b.cz?')).toBe(true);
    expect(decodeURIComponent(a.href)).not.toContain('Kx7mPq2Rtw');
  });
});
