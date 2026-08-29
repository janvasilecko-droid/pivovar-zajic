// Měsíční úklid: upozornění v posledním týdnu měsíce.
//
// Z provozu: „když už jsem ten měsíční úklid jednou udělal, ať to připomíná
// jen tehdy, když si to odložím na konec týdne. Přidej tlačítko Začít — když
// ho dám, objeví se checklist a po provedení upozornění zmizí."
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MonthlyCleanupWarning } from './MonthlyCleanupWarning';
import { getMonthKey, readMonthlyCleanupStage } from '../lib/monthlyCleanup';

// Test nesmí záviset na tom, kolikátého se zrovna pouští.
vi.mock('../lib/monthlyCleanup', async () => {
  const skutecne = await vi.importActual<typeof import('../lib/monthlyCleanup')>('../lib/monthlyCleanup');
  return { ...skutecne, isLastWeekOfMonth: () => true };
});

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ profile: { display_name: 'Vasil' } }),
}));

const zapisLahve = vi.fn().mockResolvedValue(undefined);
const zapisKeg = vi.fn().mockResolvedValue(undefined);
vi.mock('../lib/bottleSanitation', () => ({
  autoLogBottleSanitationFromChecklist: (...a: unknown[]) => zapisLahve(...a),
}));
vi.mock('../lib/kegSanitation', () => ({
  autoLogKegSanitationFromChecklist: (...a: unknown[]) => zapisKeg(...a),
}));

describe('Upozornění na měsíční úklid', () => {
  beforeEach(() => {
    localStorage.clear();
    zapisLahve.mockClear();
    zapisKeg.mockClear();
  });

  it('nabídne „Začít" a po něm ukáže checklist měsíční údržby', () => {
    render(<MonthlyCleanupWarning />);
    fireEvent.click(screen.getByText(/^Začít/));
    expect(screen.getByText(/odškrtej, co je hotové/i)).toBeTruthy();
    expect(screen.getByText('Stáčení lahví')).toBeTruthy();
    expect(screen.getByText('Stáčení KEGů')).toBeTruthy();
  });

  it('dokud není odškrtáno všechno, dokončit nejde', () => {
    render(<MonthlyCleanupWarning />);
    fireEvent.click(screen.getByText(/^Začít/));
    const dokoncit = screen.getByText(/Zbývá \d+ položek/).closest('button')!;
    expect(dokoncit.hasAttribute('disabled')).toBe(true);
  });

  it('po odškrtání všeho se zapíše do deníků a upozornění zmizí', async () => {
    render(<MonthlyCleanupWarning />);
    fireEvent.click(screen.getByText(/^Začít/));

    // Odškrtat všechny položky obou sekcí.
    const polozky = document.querySelectorAll('button[class*="text-left"]');
    polozky.forEach((p) => fireEvent.click(p));

    const hotovo = await screen.findByText(/Hotovo — zapsat do deníků/);
    fireEvent.click(hotovo);

    await waitFor(() => expect(readMonthlyCleanupStage(getMonthKey())).toBe('done'));
    expect(zapisLahve).toHaveBeenCalledTimes(1);
    expect(zapisKeg).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Zapsáno do sanitárních deníků/)).toBeTruthy();
  });

  it('odškrtnuté položky se ukládají do checklistu daného dne, ať se práce nedělá dvakrát', () => {
    render(<MonthlyCleanupWarning />);
    fireEvent.click(screen.getByText(/^Začít/));
    const prvni = document.querySelector('button[class*="text-left"]')!;
    fireEvent.click(prvni);

    const dnes = Object.keys(localStorage).find((k) => k.startsWith('bottling_checklist_'));
    expect(dnes).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(dnes!)!)).toHaveProperty('month_1', true);
  });

  it('když je měsíc označený jako hotový, upozornění se vůbec neukáže', () => {
    localStorage.setItem('monthly_cleanup_dismiss_' + getMonthKey(), 'done');
    const { container } = render(<MonthlyCleanupWarning />);
    expect(container.firstChild).toBeNull();
  });
});
