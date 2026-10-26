import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocasneHesloOkno } from './DocasneHesloOkno';

describe('DocasneHesloOkno', () => {
  it('ukáže heslo a e-mail, kopíruje zprávu s heslem a jde zavřít', async () => {
    const zapis = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: zapis } });
    const zavrit = vi.fn();
    render(<DocasneHesloOkno email="uzivatel@example.com" heslo="docasne-test" onClose={zavrit} />);
    expect(screen.getByTestId('docasne-heslo').textContent).toBe('docasne-test');
    expect(screen.getAllByText(/uzivatel@example.com/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText(/Kopírovat celou pozvánku/));
    await waitFor(() => expect(zapis).toHaveBeenCalled());
    expect(zapis.mock.calls[0][0]).toContain('Dočasné heslo: docasne-test');

    fireEvent.click(screen.getByText('Zavřít'));
    expect(zavrit).toHaveBeenCalled();
  });

  it('„Kopírovat heslo“ zkopíruje jen heslo', async () => {
    const zapis = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: zapis } });
    render(<DocasneHesloOkno email="a@b.cz" heslo="docasne-test" onClose={() => {}} />);
    fireEvent.click(screen.getByText('Kopírovat heslo'));
    await waitFor(() => expect(zapis).toHaveBeenCalledWith('docasne-test'));
  });

  it('e-mail nese pozvánku, odkaz na návod a dočasné heslo', () => {
    render(<DocasneHesloOkno email="a@b.cz" heslo="docasne-test" onClose={() => {}} />);
    const a = screen.getByText(/Poslat e-mailem/).closest('a') as HTMLAnchorElement;
    expect(a.href.startsWith('mailto:a%40b.cz?')).toBe(true);
    const tělo = decodeURIComponent(a.href);
    expect(tělo).toContain('docasne-test');
    expect(tělo).toContain('Začínáme');
    expect(tělo).toContain('Google Play');
  });
});
