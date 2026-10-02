// Měsíční úklid: upozornění v posledním týdnu měsíce.
//
// Z provozu: „když už jsem ten měsíční úklid jednou udělal, ať to připomíná
// jen tehdy, když si to odložím na konec týdne. Přidej tlačítko Začít — když
// ho dám, objeví se checklist a po provedení upozornění zmizí."
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MonthlyCleanupWarning } from './MonthlyCleanupWarning';
import { cleanupMonthKey, readMonthlyCleanupStage, otevriMesicniUklid } from '../lib/monthlyCleanup';

// Klíč měsíce, jehož úklid se řeší — v přesahu posledního týdne do nového
// měsíce (1. 10.) je to ještě září. getMonthKey() by vracel říjen a test
// padal podle toho, kterého se pouští.
// Test nesmí záviset na tom, kolikátého se zrovna pouští.
vi.mock('../lib/monthlyCleanup', async () => {
  const skutecne = await vi.importActual<typeof import('../lib/monthlyCleanup')>('../lib/monthlyCleanup');
  return { ...skutecne, isLastWeekOfMonth: () => true };
});

// Profil jde v testu přepnout — admin určuje, komu se okno ukazuje.
let profil: { display_name: string; permissions?: unknown } | null = { display_name: 'Vasil' };
vi.mock('../lib/auth', () => ({
  useAuth: () => ({ profile: profil }),
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
    profil = { display_name: 'Vasil' };
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

    await waitFor(() => expect(readMonthlyCleanupStage(cleanupMonthKey())).toBe('done'));
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

  it('odložené okno otevře dlaždice „Měsíční úklid" rovnou s checklistem', () => {
    // Z provozu 28. 9. 2026: dlaždice dřív otevírala obrazovku Lahve.
    // 'friday' = odloženo podruhé, skryté v KAŽDÝ den. 'week_start' se od
    // pátku samo znovu ukazuje, takže test v pátek padal (2. 10. 2026).
    localStorage.setItem('monthly_cleanup_dismiss_' + cleanupMonthKey(), 'friday');
    const { container } = render(<MonthlyCleanupWarning />);
    expect(container.firstChild).toBeNull();
    act(() => otevriMesicniUklid());
    expect(screen.getByText('Stáčení lahví')).toBeTruthy();
    expect(screen.getByText('Stáčení KEGů')).toBeTruthy();
  });

  it('když je měsíc označený jako hotový, upozornění se vůbec neukáže', () => {
    localStorage.setItem('monthly_cleanup_dismiss_' + cleanupMonthKey(), 'done');
    const { container } = render(<MonthlyCleanupWarning />);
    expect(container.firstChild).toBeNull();
  });

  // Z provozu 28. 9. 2026: „já jako admin určím, komu se to zobrazí."
  it('komu admin úklid vypnul, tomu se okno neukáže — ani z dlaždice', () => {
    profil = { display_name: 'Pepa', permissions: { mesicni_uklid: false } };
    const { container } = render(<MonthlyCleanupWarning />);
    act(() => otevriMesicniUklid());
    expect(container.innerHTML).toBe('');
  });

  it('dokud se profil nenačte, okno nebliká', () => {
    profil = null;
    const { container } = render(<MonthlyCleanupWarning />);
    expect(container.innerHTML).toBe('');
  });

  it('kdo nastavení nemá (dřívější uživatelé), okno vidí dál', () => {
    profil = { display_name: 'Vasil', permissions: { cellar: { view: true, edit: true } } };
    render(<MonthlyCleanupWarning />);
    expect(screen.getByText(/^Začít/)).toBeTruthy();
  });
});
