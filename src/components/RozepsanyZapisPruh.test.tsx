// Pruh „obnoven rozepsaný zápis" (components/RozepsanyZapisPruh.tsx).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const potvrd = vi.hoisted(() => vi.fn());
vi.mock('../lib/toast', () => ({ potvrd }));

import RozepsanyZapisPruh, { casUlozeni } from './RozepsanyZapisPruh';

beforeEach(() => { potvrd.mockReset(); potvrd.mockResolvedValue(true); });

describe('casUlozeni', () => {
  it('pražský čas, den a měsíc bez nul', () => {
    expect(casUlozeni('2026-10-15T11:05:00.000Z')).toBe('15. 10. 13:05');
    expect(casUlozeni('2026-01-06T10:05:00.000Z')).toBe('6. 1. 11:05');
  });

  it('chybějící nebo nesmyslný čas je prázdný text', () => {
    expect(casUlozeni(null)).toBe('');
    expect(casUlozeni(undefined)).toBe('');
    expect(casUlozeni('včera')).toBe('');
  });
});

describe('RozepsanyZapisPruh', () => {
  it('bez obnoveného zápisu nevykreslí nic', () => {
    const { container } = render(<RozepsanyZapisPruh obnoveno={null} onZahodit={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('řekne, že zápis ještě není uložený a od kdy je rozepsaný', () => {
    render(<RozepsanyZapisPruh obnoveno={{ ulozeno: '2026-10-15T11:05:00.000Z' }} onZahodit={() => {}} />);
    const pruh = screen.getByTestId('rozepsany-zapis-pruh');
    expect(pruh.textContent).toMatch(/z 15\. 10\. 13:05 je zpátky/);
    expect(pruh.textContent).toMatch(/Ještě není uložený/);
  });

  it('starší koncept bez času se obejde bez „z …"', () => {
    render(<RozepsanyZapisPruh obnoveno={{ ulozeno: null }} onZahodit={() => {}} />);
    expect(screen.getByTestId('rozepsany-zapis-pruh').textContent).toMatch(/^Rozepsaný zápis je zpátky/);
  });

  it('„Zahodit" se nejdřív zeptá a po souhlasu zahodí', async () => {
    const onZahodit = vi.fn();
    render(<RozepsanyZapisPruh obnoveno={{ ulozeno: null }} onZahodit={onZahodit} />);
    fireEvent.click(screen.getByRole('button', { name: /Zahodit/ }));
    await waitFor(() => expect(onZahodit).toHaveBeenCalledTimes(1));
    expect(String(potvrd.mock.calls[0][0])).toMatch(/Nic z uloženého v databázi se nemění/);
  });

  it('po odmítnutí se nezahodí nic', async () => {
    potvrd.mockResolvedValue(false);
    const onZahodit = vi.fn();
    render(<RozepsanyZapisPruh obnoveno={{ ulozeno: null }} onZahodit={onZahodit} />);
    fireEvent.click(screen.getByRole('button', { name: /Zahodit/ }));
    await waitFor(() => expect(potvrd).toHaveBeenCalled());
    expect(onZahodit).not.toHaveBeenCalled();
  });
});
